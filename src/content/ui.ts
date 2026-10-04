// A single shadow-DOM host for everything the content script draws on the page,
// so page styles can't affect our UI and ours can't leak into the page.

const STYLES = `
  [hidden] { display: none !important; }
  .save-btn {
    position: fixed; z-index: 2147483647;
    padding: 6px 10px; border: 0; border-radius: 8px;
    background: #4f46e5; color: #fff;
    font: 600 12px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    cursor: pointer;
  }
  .save-btn:hover { background: #4338ca; }
  .save-btn.done { background: #16a34a; }
  .save-btn.failed { background: #dc2626; }
  .area-overlay {
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(0, 0, 0, 0.25); cursor: crosshair;
  }
  .area-overlay.dragging { background: transparent; }
  .area-box {
    position: fixed; border: 2px solid #4f46e5;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35); pointer-events: none;
  }
  .area-hint {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    padding: 8px 14px; border-radius: 8px;
    background: rgba(17, 17, 19, 0.9); color: #fff;
    font: 13px system-ui, -apple-system, sans-serif; pointer-events: none;
  }
`;

let host: HTMLElement | undefined;
let root: ShadowRoot | undefined;

export function getUiRoot(): ShadowRoot {
  if (root) return root;
  host = document.createElement('web-notes-ui');
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647;';
  document.documentElement.append(host);
  root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  root.append(style);
  return root;
}

/** True when the event happened inside our UI (the closed shadow root retargets it to the host). */
export function isUiEvent(event: Event): boolean {
  return !!host && event.composedPath().includes(host);
}

/** After the extension reloads, scripts left on old pages lose access to chrome APIs. */
export function extensionAlive(): boolean {
  return !!chrome.runtime?.id;
}
