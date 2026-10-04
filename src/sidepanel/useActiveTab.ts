import { useEffect, useState } from 'react';

export interface ActiveTab {
  id?: number;
  url?: string;
  title?: string;
}

/** Tracks the active tab in the window this side panel belongs to. */
export function useActiveTab(): ActiveTab | undefined {
  const [tab, setTab] = useState<ActiveTab>();

  useEffect(() => {
    let windowId: number | undefined;
    const inOurWindow = (id: number) => windowId === undefined || id === windowId;

    const refresh = async () => {
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      windowId = t?.windowId;
      setTab(t ? { id: t.id, url: t.url, title: t.title } : undefined);
    };

    const onActivated = (info: { windowId: number }) => {
      if (inOurWindow(info.windowId)) refresh();
    };
    const onUpdated = (
      _id: number,
      change: { url?: string; title?: string; status?: string },
      t: chrome.tabs.Tab,
    ) => {
      if (t.active && inOurWindow(t.windowId) && (change.url || change.title || change.status === 'complete')) {
        refresh();
      }
    };

    refresh();
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return tab;
}
