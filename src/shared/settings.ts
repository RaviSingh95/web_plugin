export interface Settings {
  /** Show a "Save to notes" button next to selected text. */
  floatingButton: boolean;
  /** Highlight saved text when revisiting a page. */
  highlights: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  floatingButton: true,
  highlights: true,
};

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set({ [KEY]: { ...(await getSettings()), ...patch } });
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) {
      callback({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
