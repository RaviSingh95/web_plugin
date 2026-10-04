import type { PageContext } from '../shared/messages';
import { hasFormatting, sanitizeHtml } from '../shared/sanitize';
import { isYouTube } from '../shared/source';

export function readPageContext(): PageContext {
  return { ...readSelection(), videoTime: readVideoTime() };
}

/** Plain text of the selection, plus sanitized HTML when it has formatting worth keeping. */
function readSelection(): Pick<PageContext, 'text' | 'html'> {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return {};
  const text = selection.toString().trim();
  if (!text) return {};

  const container = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i++) {
    container.append(selection.getRangeAt(i).cloneContents());
  }
  const html = sanitizeHtml(container.innerHTML, location.href);
  return { text, html: html && hasFormatting(html) ? html : undefined };
}

function readVideoTime(): number | undefined {
  if (!isYouTube(location.href)) return undefined;
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video, video');
  if (!video || !Number.isFinite(video.currentTime) || video.readyState === 0) return undefined;
  return Math.floor(video.currentTime);
}
