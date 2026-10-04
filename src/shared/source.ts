import type { NoteSource } from './types';

/** Origin of Chrome's built-in PDF viewer, which hosts PDFs opened in a tab. */
export const PDF_VIEWER_ORIGIN = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai';

const TRACKING_PARAM = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|_hsenc|_hsmi)$/i;
/** YouTube params that don't change which video it is. */
const YOUTUBE_EXTRA_PARAMS = new Set(['t', 'si', 'feature', 'pp', 'ab_channel', 'list', 'index', 'start_radio']);

export function isPdfUrl(url: string): boolean {
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function isYouTube(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^(www|m|music)\./, '');
    return host === 'youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

/**
 * Normalizes a URL into a grouping key: drops the #fragment, tracking params,
 * trailing slashes and YouTube extras like the timestamp, so the same page or
 * video always lands in the same group.
 */
export function sourceKey(url: string): string {
  try {
    let u = new URL(url);
    u.hash = '';
    if (u.hostname === 'youtu.be') {
      const short = u;
      u = new URL('https://www.youtube.com/watch');
      u.searchParams.set('v', short.pathname.slice(1));
      short.searchParams.forEach((value, name) => u.searchParams.set(name, value));
    }
    const youtube = isYouTube(u.href);
    if (youtube) u.hostname = 'www.youtube.com';
    for (const name of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(name) || (youtube && YOUTUBE_EXTRA_PARAMS.has(name))) {
        u.searchParams.delete(name);
      }
    }
    u.searchParams.sort();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return url;
  }
}

function fileName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || url);
  } catch {
    return url;
  }
}

export function makeSource(url: string, title?: string, forcePdf = false): NoteSource {
  const kind = forcePdf || isPdfUrl(url) ? 'pdf' : 'web';
  return {
    key: sourceKey(url),
    url,
    title: title?.trim() || (kind === 'pdf' ? fileName(url) : url),
    kind,
  };
}

export function sourceSubtitle(source: NoteSource): string {
  let host = '';
  try {
    const u = new URL(source.url);
    host = u.protocol === 'file:' ? 'Local file' : u.hostname;
  } catch {
    host = source.url;
  }
  return source.kind === 'pdf' ? `PDF · ${host}` : host;
}

export function faviconUrl(pageUrl: string): string {
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`);
}

/**
 * Builds a link that scrolls to and highlights `text` on the page,
 * using the browser's text fragment support (#:~:text=...).
 */
export function textFragmentUrl(url: string, text: string): string | undefined {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return undefined;
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D');
  const fragment =
    words.length <= 8
      ? enc(words.join(' '))
      : `${enc(words.slice(0, 4).join(' '))},${enc(words.slice(-4).join(' '))}`;
  return `${url.split('#')[0]}#:~:text=${fragment}`;
}

export function pdfPageUrl(url: string, page: number): string {
  return `${url.split('#')[0]}#page=${page}`;
}

export function videoTimeUrl(url: string, seconds: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set('t', `${Math.floor(seconds)}s`);
    return u.toString();
  } catch {
    return url;
  }
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh > 0 ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}
