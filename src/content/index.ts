import type { ContentRequest } from '../shared/messages';
import { getSettings, onSettingsChanged, type Settings } from '../shared/settings';
import { startAreaCapture } from './areaCapture';
import { initFloatingButton } from './floatingButton';
import { initHighlights } from './highlights';
import { readPageContext } from './pageContext';

declare global {
  interface Window {
    __webNotesLoaded?: boolean;
  }
}

// The background also injects this script into tabs that were open at install
// time, so guard against running twice in the same page.
if (!window.__webNotesLoaded) {
  window.__webNotesLoaded = true;
  main();
}

function main() {
  const isTop = window === window.top;
  const floatingButton = initFloatingButton();
  // Notes are grouped by the tab's URL, so only the top frame highlights.
  const highlights = isTop ? initHighlights() : undefined;

  const apply = (settings: Settings) => {
    floatingButton.setEnabled(settings.floatingButton);
    highlights?.setEnabled(settings.highlights);
  };
  getSettings().then(apply);
  onSettingsChanged(apply);

  chrome.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
    switch (message.type) {
      case 'get-context': {
        const context = readPageContext();
        // Frames without a selection stay quiet so the frame that has one can answer.
        if (message.requireSelection && !context.text) return;
        sendResponse(context);
        return;
      }
      case 'start-area-capture':
        if (!isTop) return;
        sendResponse({ ok: true });
        startAreaCapture();
        return;
      case 'refresh-highlights':
        highlights?.refresh();
        return;
    }
  });
}
