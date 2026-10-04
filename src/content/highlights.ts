import type { BackgroundRequest, HighlightTarget } from '../shared/messages';
import { extensionAlive } from './ui';

// Highlights saved text with the CSS Custom Highlight API, which paints ranges
// without changing the page's DOM.

const HIGHLIGHT_NAME = 'web-notes';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE']);

interface Hit {
  range: Range;
  noteId: string;
}

export function initHighlights() {
  let enabled = false;
  let targets: HighlightTarget[] = [];
  let hits: Hit[] = [];
  let lastUrl = location.href;
  let throttle: ReturnType<typeof setTimeout> | undefined;

  if (!('highlights' in CSS)) return { setEnabled() {}, refresh() {} };

  const style = document.createElement('style');
  style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(250, 204, 21, 0.45); }`;
  (document.head ?? document.documentElement).append(style);

  async function refresh() {
    lastUrl = location.href;
    if (!enabled || !extensionAlive()) return clear();
    try {
      const request: BackgroundRequest = { type: 'get-page-highlights', url: location.href };
      targets = (await chrome.runtime.sendMessage(request)) ?? [];
    } catch {
      targets = [];
    }
    apply();
  }

  function apply() {
    hits = [];
    if (!enabled || targets.length === 0) {
      CSS.highlights.delete(HIGHLIGHT_NAME);
      return;
    }
    const index = buildTextIndex();
    for (const target of targets) {
      const range = findRange(index, target.text);
      if (range) hits.push({ range, noteId: target.id });
    }
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...hits.map((h) => h.range)));
  }

  function clear() {
    targets = [];
    hits = [];
    CSS.highlights.delete(HIGHLIGHT_NAME);
  }

  // Pages change after load (lazy content, single-page apps); re-apply at most once a second.
  const observer = new MutationObserver(() => {
    if (throttle) return;
    throttle = setTimeout(() => {
      throttle = undefined;
      if (location.href !== lastUrl) refresh();
      else if (targets.length) apply();
    }, 1000);
  });

  // Clicking highlighted text opens its note in the side panel.
  document.addEventListener(
    'click',
    (e) => {
      if (hits.length === 0 || !window.getSelection()?.isCollapsed) return;
      const point = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!point) return;
      const hit = hits.find((h) => {
        try {
          return h.range.isPointInRange(point.startContainer, point.startOffset);
        } catch {
          return false;
        }
      });
      if (hit && extensionAlive()) {
        const request: BackgroundRequest = { type: 'highlight-clicked', noteId: hit.noteId };
        chrome.runtime.sendMessage(request).catch(() => {});
      }
    },
    true,
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled) refresh();
  });

  return {
    setEnabled(value: boolean) {
      enabled = value;
      if (value) {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        refresh();
      } else {
        observer.disconnect();
        clear();
      }
    },
    refresh,
  };
}

/**
 * All visible page text with whitespace removed and lowercased, plus a map
 * from each character back to its text node and offset. Ignoring whitespace
 * makes matching robust to line breaks the selection adds between blocks.
 */
interface TextIndex {
  text: string;
  nodes: Text[];
  nodeOf: number[];
  offsetOf: number[];
}

function isSpace(code: number): boolean {
  return code <= 32 || code === 160 || code === 0x2028 || code === 0x2029 || code === 0x200b;
}

function normalizeChar(ch: string): string {
  const lower = ch.toLowerCase();
  return lower.length === 1 ? lower : ch;
}

function normalize(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (!isSpace(text.charCodeAt(i))) out += normalizeChar(text[i]);
  }
  return out;
}

function buildTextIndex(): TextIndex {
  const nodes: Text[] = [];
  const nodeOf: number[] = [];
  const offsetOf: number[] = [];
  const chars: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement && SKIP_TAGS.has(node.parentElement.tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const data = text.data;
    const n = nodes.push(text) - 1;
    for (let i = 0; i < data.length; i++) {
      if (isSpace(data.charCodeAt(i))) continue;
      chars.push(normalizeChar(data[i]));
      nodeOf.push(n);
      offsetOf.push(i);
    }
  }
  return { text: chars.join(''), nodes, nodeOf, offsetOf };
}

function findRange(index: TextIndex, text: string): Range | undefined {
  const needle = normalize(text);
  if (!needle) return undefined;

  let start: number;
  let end: number;
  if (needle.length <= 200) {
    start = index.text.indexOf(needle);
    if (start < 0) return undefined;
    end = start + needle.length - 1;
  } else {
    // Long passages: match the beginning and end separately, so small differences in the middle don't matter.
    const head = needle.slice(0, 100);
    const tail = needle.slice(-100);
    start = index.text.indexOf(head);
    if (start < 0) return undefined;
    const tailAt = index.text.indexOf(tail, start + head.length);
    if (tailAt < 0 || tailAt - start > needle.length * 1.5) return undefined;
    end = tailAt + tail.length - 1;
  }

  const range = document.createRange();
  range.setStart(index.nodes[index.nodeOf[start]], index.offsetOf[start]);
  range.setEnd(index.nodes[index.nodeOf[end]], index.offsetOf[end] + 1);
  return range;
}
