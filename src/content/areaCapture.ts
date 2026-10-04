import type { BackgroundRequest, Rect } from '../shared/messages';
import { getUiRoot } from './ui';

/** Lets the user drag a box over the page, then asks the background to screenshot it. */
export function startAreaCapture() {
  const root = getUiRoot();
  if (root.querySelector('.area-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'area-overlay';
  const box = document.createElement('div');
  box.className = 'area-box';
  box.hidden = true;
  const hint = document.createElement('div');
  hint.className = 'area-hint';
  hint.textContent = 'Drag to select an area · Esc to cancel';
  overlay.append(box, hint);
  root.append(overlay);

  let start: { x: number; y: number } | undefined;

  const rectTo = (e: MouseEvent): Rect => ({
    x: Math.min(start!.x, e.clientX),
    y: Math.min(start!.y, e.clientY),
    width: Math.abs(e.clientX - start!.x),
    height: Math.abs(e.clientY - start!.y),
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cleanup();
    }
  };

  const cleanup = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    hint.hidden = true;
    overlay.classList.add('dragging');
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!start) return;
    const r = rectTo(e);
    Object.assign(box.style, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    box.hidden = false;
  });

  overlay.addEventListener('mouseup', async (e) => {
    if (!start) return;
    const rect = rectTo(e);
    cleanup();
    if (rect.width < 5 || rect.height < 5) return;
    // Let the overlay disappear from the screen before the screenshot is taken.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30))));
    const request: BackgroundRequest = { type: 'area-selected', rect, viewportWidth: window.innerWidth };
    chrome.runtime.sendMessage(request).catch(() => {});
  });

  document.addEventListener('keydown', onKey, true);
}
