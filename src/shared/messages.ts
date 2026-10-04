/** What the content script can tell about the page right now. */
export interface PageContext {
  text?: string;
  html?: string;
  videoTime?: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HighlightTarget {
  id: string;
  text: string;
}

/** Messages handled by the content script (sent with chrome.tabs.sendMessage). */
export type ContentRequest =
  | { type: 'get-context'; requireSelection?: boolean }
  | { type: 'start-area-capture' }
  | { type: 'refresh-highlights' };

/**
 * Messages sent with chrome.runtime.sendMessage. The background handles all of
 * them; the side panel also listens for 'highlight-clicked'.
 */
export type BackgroundRequest =
  | { type: 'save-selection'; context: PageContext }
  | { type: 'area-selected'; rect: Rect; viewportWidth: number }
  | { type: 'capture-area'; tabId: number }
  | { type: 'get-page-highlights'; url: string }
  | { type: 'highlight-clicked'; noteId: string };
