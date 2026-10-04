import type { BackgroundRequest } from '../shared/messages';
import { readPageContext } from './pageContext';
import { extensionAlive, getUiRoot, isUiEvent } from './ui';

const LABEL = 'Save to notes';

/** A "Save to notes" button that appears next to selected text. */
export function initFloatingButton() {
  let enabled = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const button = document.createElement('button');
  button.className = 'save-btn';
  button.hidden = true;
  getUiRoot().append(button);

  const hide = () => {
    clearTimeout(hideTimer);
    button.hidden = true;
  };

  const showForSelection = () => {
    if (!enabled || !extensionAlive()) return hide();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !selection.toString().trim()) {
      return hide();
    }
    const focus = selection.focusNode;
    const focusEl = focus instanceof Element ? focus : focus?.parentElement;
    if (focusEl?.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) return hide();

    const rect = selection.getRangeAt(selection.rangeCount - 1).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return hide();

    const below = rect.bottom + 8;
    const top = below + 32 > window.innerHeight ? Math.max(8, rect.top - 40) : below;
    const left = Math.min(Math.max(8, rect.right - 60), window.innerWidth - 130);
    button.textContent = LABEL;
    button.className = 'save-btn';
    button.style.top = `${top}px`;
    button.style.left = `${left}px`;
    button.hidden = false;
  };

  document.addEventListener('mouseup', (e) => {
    if (!isUiEvent(e)) setTimeout(showForSelection, 0);
  });
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift') setTimeout(showForSelection, 0);
  });
  document.addEventListener('mousedown', (e) => {
    if (!isUiEvent(e)) hide();
  });
  document.addEventListener('scroll', hide, { passive: true, capture: true });

  // Keep the page selection when the button is pressed.
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', async () => {
    const context = readPageContext();
    if (!context.text) return hide();
    let ok = false;
    try {
      const request: BackgroundRequest = { type: 'save-selection', context };
      ok = !!(await chrome.runtime.sendMessage(request))?.ok;
      button.textContent = ok ? 'Saved ✓' : 'Could not save';
    } catch {
      button.textContent = 'Reload page to save';
    }
    button.classList.add(ok ? 'done' : 'failed');
    hideTimer = setTimeout(hide, 1200);
  });

  return {
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) hide();
    },
  };
}
