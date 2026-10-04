import { useEffect, useMemo, useRef, useState } from 'react';
import { notesRepo, onNotesChanged } from '../shared/db';
import type { BackgroundRequest, ContentRequest, PageContext } from '../shared/messages';
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged, saveSettings, type Settings } from '../shared/settings';
import { faviconUrl, formatDuration, makeSource, sourceKey, sourceSubtitle } from '../shared/source';
import type { Collection, Note, SourceMeta } from '../shared/types';
import { CollectionBar, type CollectionFilter } from './components/CollectionBar';
import { Composer } from './components/Composer';
import { Menu } from './components/Menu';
import { PickerDialog } from './components/PickerDialog';
import { SourceGroup } from './components/SourceGroup';
import { TagBar } from './components/TagBar';
import { createBackup, dateSlug, downloadFile, groupsToDocument, restoreBackup } from './exportNotes';
import { countTags, groupBySource, matchesQuery, resolveKey, type SourceGroupData } from './grouping';
import { usePdfPageLookup } from './pdfPages';
import { useActiveTab } from './useActiveTab';

type View = 'current' | 'all';
type Dialog = { kind: 'merge' | 'collection'; group: SourceGroupData } | null;

interface Data {
  notes: Note[];
  sources: SourceMeta[];
  collections: Collection[];
}

export function App() {
  const [data, setData] = useState<Data>({ notes: [], sources: [], collections: [] });
  const [view, setView] = useState<View>('current');
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>('all');
  const [composer, setComposer] = useState<{ videoTime?: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [focusId, setFocusId] = useState<string>();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [toast, setToast] = useState<string>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const fileInput = useRef<HTMLInputElement>(null);
  const tab = useActiveTab();

  // --- Data loading and syncing ---

  useEffect(() => {
    const load = async () => {
      const [notes, sources, collections] = await Promise.all([
        notesRepo.list(),
        notesRepo.listSources(),
        notesRepo.listCollections(),
      ]);
      setData({ notes, sources, collections });
    };
    load();
    return onNotesChanged(load);
  }, []);

  // Keep the page's highlights in sync with edits and deletes made here.
  useEffect(() => {
    if (tab?.id == null) return;
    const tabId = tab.id;
    return onNotesChanged(() => {
      const request: ContentRequest = { type: 'refresh-highlights' };
      chrome.tabs.sendMessage(tabId, request).catch(() => {});
    });
  }, [tab?.id]);

  useEffect(() => {
    getSettings().then(setSettings);
    return onSettingsChanged(setSettings);
  }, []);

  // Clicking a highlight on the page focuses its note here.
  useEffect(() => {
    const focus = (noteId: string) => {
      setView('current');
      setQuery('');
      setActiveTags([]);
      setFocusId(noteId);
      chrome.storage.session.remove('pendingFocus');
    };
    chrome.storage.session.get('pendingFocus').then(({ pendingFocus }) => {
      if (pendingFocus && Date.now() - pendingFocus.at < 10_000) focus(pendingFocus.noteId);
    });
    const onMessage = (message: BackgroundRequest) => {
      if (message.type === 'highlight-clicked') focus(message.noteId);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  useEffect(() => {
    if (!focusId) return;
    const timer = setTimeout(() => setFocusId(undefined), 2500);
    return () => clearTimeout(timer);
  }, [focusId]);

  usePdfPageLookup(data.notes);

  // --- Derived state ---

  const metas = useMemo(() => new Map(data.sources.map((s) => [s.key, s])), [data.sources]);
  const allGroups = useMemo(() => groupBySource(data.notes, metas), [data.notes, metas]);
  const tags = useMemo(() => countTags(data.notes), [data.notes]);
  const collectionNames = useMemo(() => new Map(data.collections.map((c) => [c.id, c.name])), [data.collections]);

  const currentKey = tab?.url ? resolveKey(sourceKey(tab.url), metas) : undefined;
  const canCapture = !!tab?.url && /^(https?|file):/.test(tab.url);
  const filterText = [query, ...activeTags.map((t) => `#${t}`)].join(' ').trim();

  const visibleGroups = useMemo(() => {
    let groups = allGroups;
    if (view === 'current') {
      groups = groups.filter((g) => g.key === currentKey);
    } else if (collectionFilter === 'unsorted') {
      groups = groups.filter((g) => !g.meta?.collectionId || !collectionNames.has(g.meta.collectionId));
    } else if (collectionFilter !== 'all') {
      groups = groups.filter((g) => g.meta?.collectionId === collectionFilter);
    }
    if (!filterText) return groups;
    return groups
      .map((g) => ({ ...g, notes: g.notes.filter((n) => matchesQuery(n, filterText)) }))
      .filter((g) => g.notes.length > 0);
  }, [allGroups, view, currentKey, collectionFilter, collectionNames, filterText]);

  // --- Actions ---

  const notify = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(undefined), 2200);
  };

  const toggleTag = (tag: string) =>
    setActiveTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));

  const currentSource = () => makeSource(tab!.url!, tab!.title);

  const getTabContext = async (): Promise<PageContext> => {
    if (tab?.id == null) return {};
    try {
      const request: ContentRequest = { type: 'get-context' };
      return (await chrome.tabs.sendMessage(tab.id, request, { frameId: 0 })) ?? {};
    } catch {
      return {};
    }
  };

  const clipPage = async () => {
    const context = await getTabContext();
    await notesRepo.add({ type: 'page', videoTime: context.videoTime, source: currentSource() });
  };

  const openComposer = async () => {
    // Capture the video time now, when the user starts writing.
    const context = await getTabContext();
    setComposer({ videoTime: context.videoTime });
  };

  const addManualNote = async (text: string) => {
    await notesRepo.add({ type: 'manual', text, videoTime: composer?.videoTime, source: currentSource() });
    setComposer(null);
  };

  const captureArea = () => {
    if (tab?.id == null) return;
    const request: BackgroundRequest = { type: 'capture-area', tabId: tab.id };
    chrome.runtime.sendMessage(request);
  };

  const exportAll = (format: 'markdown' | 'text') => {
    const ext = format === 'markdown' ? 'md' : 'txt';
    downloadFile(`web-notes-${dateSlug()}.${ext}`, groupsToDocument(allGroups, format), `text/${format === 'markdown' ? 'markdown' : 'plain'}`);
  };

  const downloadBackup = async () => {
    downloadFile(`web-notes-backup-${dateSlug()}.json`, await createBackup(), 'application/json');
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = await restoreBackup(await file.text());
      notify(`Restored ${count} note${count === 1 ? '' : 's'}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>Web Notes</h1>
          <span className="brand-right">
            <span className="muted">{data.notes.length} notes</span>
            <Menu
              title="Export, backup and settings"
              items={[
                { label: 'Export all as Markdown', onSelect: () => exportAll('markdown') },
                { label: 'Export all as plain text', onSelect: () => exportAll('text') },
                { label: 'Download backup (JSON)', onSelect: downloadBackup },
                { label: 'Restore from backup…', onSelect: () => fileInput.current?.click() },
                'separator',
                {
                  label: 'Save button on selected text',
                  checked: settings.floatingButton,
                  onSelect: () => saveSettings({ floatingButton: !settings.floatingButton }),
                },
                {
                  label: 'Highlight saved text on pages',
                  checked: settings.highlights,
                  onSelect: () => saveSettings({ highlights: !settings.highlights }),
                },
              ]}
            />
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => onImportFile(e.target.files?.[0])}
          />
        </div>

        <input
          className="search"
          type="search"
          placeholder="Search notes… (#tag to filter)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <TagBar tags={tags} active={activeTags} onToggle={toggleTag} />

        <div className="toolbar">
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={view === 'current'} onClick={() => setView('current')}>
              This page
            </button>
            <button role="tab" aria-selected={view === 'all'} onClick={() => setView('all')}>
              All sources
            </button>
          </div>
          <div className="toolbar-actions">
            <button className="btn" disabled={!canCapture} onClick={captureArea} title="Screenshot an area of the page (Alt+Shift+A)">
              Screenshot
            </button>
            <button className="btn" disabled={!canCapture} onClick={clipPage} title="Save this page as a note">
              Clip page
            </button>
            <button className="btn primary" disabled={!canCapture} onClick={openComposer} title="Write a note for this page">
              + Note
            </button>
          </div>
        </div>

        {view === 'all' && (
          <CollectionBar
            collections={data.collections}
            groups={allGroups}
            value={collectionFilter}
            onChange={setCollectionFilter}
          />
        )}
        {view === 'current' && tab?.url && (
          <div className="current-page" title={tab.url}>
            <img src={faviconUrl(tab.url)} alt="" width={16} height={16} />
            <span>{tab.title || tab.url}</span>
          </div>
        )}
      </header>

      <main className="content">
        {composer && (
          <Composer
            context={composer.videoTime != null ? `Linked to video at ${formatDuration(composer.videoTime)}` : undefined}
            onSave={addManualNote}
            onCancel={() => setComposer(null)}
          />
        )}

        {visibleGroups.map((group) => (
          <SourceGroup
            key={group.key}
            group={group}
            defaultOpen={view === 'current' || visibleGroups.length <= 3}
            focusId={focusId}
            reorderable={!filterText}
            collectionName={view === 'all' && group.meta?.collectionId ? collectionNames.get(group.meta.collectionId) : undefined}
            onTagClick={toggleTag}
            onMerge={allGroups.length > 1 ? () => setDialog({ kind: 'merge', group }) : undefined}
            onMoveToCollection={() => setDialog({ kind: 'collection', group })}
            notify={notify}
          />
        ))}

        {visibleGroups.length === 0 && !composer && (
          <EmptyState view={view} filtering={!!filterText} canCapture={canCapture} />
        )}
      </main>

      {dialog?.kind === 'collection' && (
        <PickerDialog
          title="Move to collection"
          options={[{ id: '', label: 'No collection' }, ...data.collections.map((c) => ({ id: c.id, label: c.name }))]}
          onPick={async (id) => {
            await notesRepo.updateSource(dialog.group.key, { collectionId: id || undefined });
            setDialog(null);
          }}
          createPlaceholder="New collection name"
          onCreate={async (name) => {
            const collection = await notesRepo.addCollection(name);
            await notesRepo.updateSource(dialog.group.key, { collectionId: collection.id });
            setDialog(null);
            notify(`Moved to “${name}”`);
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'merge' && (
        <PickerDialog
          title={`Merge “${dialog.group.source.title}” into…`}
          options={allGroups
            .filter((g) => g.key !== dialog.group.key)
            .map((g) => ({ id: g.key, label: g.source.title, sublabel: sourceSubtitle(g.source) }))}
          onPick={async (key) => {
            await notesRepo.updateSource(dialog.group.key, { mergedInto: key });
            setDialog(null);
            notify('Groups merged');
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function EmptyState({ view, filtering, canCapture }: { view: View; filtering: boolean; canCapture: boolean }) {
  if (filtering) return <p className="empty">No notes match your search.</p>;
  if (view === 'current' && !canCapture) {
    return <p className="empty">Notes can't be taken on this page. Open a website or PDF to start.</p>;
  }
  return (
    <div className="empty">
      <p>{view === 'current' ? 'No notes from this page yet.' : 'No notes here yet.'}</p>
      <ul>
        <li>
          Select text and click <b>Save to notes</b>, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>
        </li>
        <li>Right-click an image, link or the page to save it</li>
        <li>
          <b>Screenshot</b> (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>) captures any area
        </li>
        <li>Add #tags in comments to organize notes</li>
      </ul>
    </div>
  );
}
