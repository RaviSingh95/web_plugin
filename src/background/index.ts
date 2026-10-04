import { notesRepo } from '../shared/db';
import type { BackgroundRequest, ContentRequest, HighlightTarget, PageContext, Rect } from '../shared/messages';
import { makeSource, PDF_VIEWER_ORIGIN, sourceKey } from '../shared/source';
import type { NewNote, NoteSource } from '../shared/types';

const MENU = {
  selection: 'add-selection',
  image: 'add-image',
  link: 'add-link',
  page: 'add-page',
  area: 'capture-area',
} as const;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.selection, title: 'Add selection to notes', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.image, title: 'Add image to notes', contexts: ['image'] });
    chrome.contextMenus.create({ id: MENU.link, title: 'Add link to notes', contexts: ['link'] });
    chrome.contextMenus.create({ id: MENU.page, title: 'Add this page to notes', contexts: ['page'] });
    chrome.contextMenus.create({ id: MENU.area, title: 'Screenshot an area', contexts: ['page'] });
  });
  injectIntoOpenTabs();
});

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return;
  const source = sourceFor(tab, info);
  let note: NewNote | undefined;

  switch (info.menuItemId) {
    case MENU.selection: {
      // The content script keeps line breaks and formatting, which info.selectionText loses.
      // PDFs have no content script, so they fall back to info.selectionText.
      const context = await getPageContext(tab, info.frameId);
      const text = context?.text || info.selectionText;
      if (text) note = { type: 'text', text, html: context?.html, videoTime: context?.videoTime, source };
      break;
    }
    case MENU.image:
      if (info.srcUrl) {
        note = { type: 'image', imageUrl: info.srcUrl, imageBlob: await fetchImage(info.srcUrl), source };
      }
      break;
    case MENU.link:
      if (info.linkUrl) note = { type: 'link', linkUrl: info.linkUrl, linkText: info.selectionText, source };
      break;
    case MENU.page: {
      const context = await getPageContext(tab, 0);
      note = { type: 'page', videoTime: context?.videoTime, source };
      break;
    }
    case MENU.area:
      return startAreaCapture(tab);
  }

  await save(note, tab.id);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab) return;
  if (command === 'add-selection') {
    const context = await getPageContext(tab, undefined, true);
    await save(
      context?.text
        ? { type: 'text', text: context.text, html: context.html, videoTime: context.videoTime, source: sourceFor(tab) }
        : undefined,
      tab.id,
    );
  } else if (command === 'capture-area') {
    await startAreaCapture(tab);
  }
});

chrome.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
  const tab = sender.tab;
  switch (message.type) {
    case 'save-selection':
      if (!tab || !message.context.text) return;
      save({ type: 'text', ...message.context, source: sourceFor(tab) }, tab.id).then((ok) => sendResponse({ ok }));
      return true;

    case 'area-selected':
      if (!tab) return;
      saveScreenshot(tab, message).then(() => sendResponse({ ok: true }));
      return true;

    case 'capture-area':
      chrome.tabs.get(message.tabId).then(startAreaCapture, console.error);
      return;

    case 'get-page-highlights':
      notesRepo.listForSource(sourceKey(message.url)).then((notes) => {
        const targets: HighlightTarget[] = notes
          .filter((n) => n.type === 'text' && n.text)
          .map((n) => ({ id: n.id, text: n.text! }));
        sendResponse(targets);
      });
      return true;

    case 'highlight-clicked':
      // Open the panel (if closed) and leave a note for it to focus once it loads.
      // An already-open panel receives this message directly.
      if (tab) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
      chrome.storage.session.set({ pendingFocus: { noteId: message.noteId, at: Date.now() } });
      return;
  }
});

function sourceFor(tab: chrome.tabs.Tab, info?: chrome.contextMenus.OnClickData): NoteSource {
  const url = tab.url || info?.pageUrl || info?.frameUrl || '';
  const inPdfViewer = info?.frameUrl?.startsWith(PDF_VIEWER_ORIGIN) ?? false;
  return makeSource(url, tab.title, inPdfViewer);
}

async function getPageContext(
  tab: chrome.tabs.Tab,
  frameId?: number,
  requireSelection = false,
): Promise<PageContext | undefined> {
  if (tab.id == null) return undefined;
  const request: ContentRequest = { type: 'get-context', requireSelection };
  try {
    return await chrome.tabs.sendMessage(tab.id, request, frameId != null ? { frameId } : {});
  } catch {
    return undefined; // No content script here (PDF viewer, chrome:// pages) or nobody answered.
  }
}

async function save(note: NewNote | undefined, tabId?: number): Promise<boolean> {
  if (!note) {
    flashBadge(tabId, false);
    return false;
  }
  try {
    await notesRepo.add(note);
    flashBadge(tabId, true);
    if (tabId != null) {
      const request: ContentRequest = { type: 'refresh-highlights' };
      chrome.tabs.sendMessage(tabId, request).catch(() => {});
    }
    return true;
  } catch (err) {
    console.error('Failed to save note', err);
    flashBadge(tabId, false);
    return false;
  }
}

async function startAreaCapture(tab: chrome.tabs.Tab) {
  if (tab.id == null) return;
  try {
    const request: ContentRequest = { type: 'start-area-capture' };
    await chrome.tabs.sendMessage(tab.id, request, { frameId: 0 });
  } catch {
    // No content script (e.g. the PDF viewer): capture the whole visible area instead.
    await saveScreenshot(tab);
  }
}

async function saveScreenshot(tab: chrome.tabs.Tab, area?: { rect: Rect; viewportWidth: number }) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    let blob = await (await fetch(dataUrl)).blob();
    if (area) blob = await crop(blob, area.rect, area.viewportWidth);
    await save({ type: 'screenshot', imageBlob: blob, source: sourceFor(tab) }, tab.id);
  } catch (err) {
    console.error('Screenshot failed', err);
    flashBadge(tab.id, false);
  }
}

async function crop(blob: Blob, rect: Rect, viewportWidth: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  // The screenshot is in device pixels; the rect is in CSS pixels.
  const scale = bitmap.width / viewportWidth;
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(bitmap, rect.x * scale, rect.y * scale, width, height, 0, 0, width, height);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

async function fetchImage(url: string): Promise<Blob | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return blob.type.startsWith('image/') ? blob : undefined;
  } catch {
    return undefined;
  }
}

/** Content scripts only load on page load, so add them to tabs that were already open. */
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file://*/*'] });
  for (const tab of tabs) {
    if (tab.id == null || tab.discarded) continue;
    chrome.scripting
      .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] })
      .catch(() => {});
  }
}

function flashBadge(tabId: number | undefined, ok: boolean) {
  if (tabId == null) return;
  chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? '#16a34a' : '#dc2626' });
  chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 1500);
}
