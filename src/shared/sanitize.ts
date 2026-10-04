// HTML sanitizer for formatted selections. Needs a DOM, so it's only used by the
// content script and the side panel, never the service worker.

const KEEP = new Set([
  'P', 'DIV', 'BR', 'HR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'MARK', 'A',
  'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'CODE', 'PRE', 'KBD', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SUP', 'SUB',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
]);

/** Removed together with their contents. Anything else not in KEEP is unwrapped. */
const DROP = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH',
  'CANVAS', 'VIDEO', 'AUDIO', 'IMG', 'PICTURE', 'SOURCE', 'FORM', 'INPUT', 'BUTTON',
  'SELECT', 'TEXTAREA', 'LINK', 'META', 'HEAD', 'TITLE',
]);

const FORMATTING = /<(b|strong|i|em|u|s|del|mark|a|ul|ol|li|dl|code|pre|kbd|blockquote|h[1-6]|sup|sub|table|hr)\b/i;

export function hasFormatting(html: string): boolean {
  return FORMATTING.test(html);
}

export function sanitizeHtml(html: string, baseUrl?: string, openLinksInNewTab = false): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  clean(doc.body, baseUrl, openLinksInNewTab);
  return doc.body.innerHTML.trim();
}

function clean(parent: Element, baseUrl: string | undefined, newTab: boolean) {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (DROP.has(tag)) {
      el.remove();
      continue;
    }
    clean(el, baseUrl, newTab);
    if (!KEEP.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }

    const href = tag === 'A' ? el.getAttribute('href') : null;
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    const safeHref = href ? safeUrl(href, baseUrl) : undefined;
    if (safeHref) {
      el.setAttribute('href', safeHref);
      if (newTab) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noreferrer');
      }
    }
  }
}

function safeUrl(href: string, baseUrl?: string): string | undefined {
  try {
    const url = new URL(href, baseUrl);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
