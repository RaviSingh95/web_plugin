import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { sourceKey } from './source';
import type {
  Collection,
  NewNote,
  Note,
  NotePatch,
  NotesData,
  SourceMeta,
  SourceMetaPatch,
} from './types';

/**
 * Storage boundary for notes. Everything in the extension goes through this
 * interface, so a cloud-backed implementation can be swapped in later.
 */
export interface NotesRepository {
  list(): Promise<Note[]>;
  listForSource(sourceKey: string): Promise<Note[]>;
  add(input: NewNote): Promise<Note>;
  update(id: string, patch: NotePatch): Promise<void>;
  remove(id: string): Promise<void>;
  removeSources(sourceKeys: string[]): Promise<void>;

  listSources(): Promise<SourceMeta[]>;
  updateSource(key: string, patch: SourceMetaPatch): Promise<void>;

  listCollections(): Promise<Collection[]>;
  addCollection(name: string): Promise<Collection>;
  renameCollection(id: string, name: string): Promise<void>;
  removeCollection(id: string): Promise<void>;

  exportData(): Promise<NotesData>;
  /** Merges data in, keeping whichever copy of each item is newer. Returns the number of notes written. */
  importData(data: NotesData): Promise<number>;
}

interface NotesDB extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { 'by-source': string; 'by-updated': number };
  };
  sources: { key: string; value: SourceMeta };
  collections: { key: string; value: Collection };
}

let dbPromise: Promise<IDBPDatabase<NotesDB>> | undefined;

function getDb() {
  dbPromise ??= openDB<NotesDB>('web-notes', 2, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('by-source', 'source.key');
        notes.createIndex('by-updated', 'updatedAt');
      }
      if (oldVersion < 2) {
        db.createObjectStore('sources', { keyPath: 'key' });
        db.createObjectStore('collections', { keyPath: 'id' });
        // v2 normalizes URLs further (tracking params, YouTube), so re-key existing notes.
        let cursor = await tx.objectStore('notes').openCursor();
        while (cursor) {
          const note = cursor.value;
          const key = sourceKey(note.source.url);
          if (key !== note.source.key) await cursor.update({ ...note, source: { ...note.source, key } });
          cursor = await cursor.continue();
        }
      }
    },
  });
  return dbPromise;
}

// The service worker and side panel share one origin, so a BroadcastChannel
// lets every open view refresh when any of them writes.
const CHANNEL = 'web-notes:changed';
const channel = new BroadcastChannel(CHANNEL);
const notifyChanged = () => channel.postMessage('changed');

export function onNotesChanged(callback: () => void): () => void {
  const listener = new BroadcastChannel(CHANNEL);
  listener.onmessage = () => callback();
  return () => listener.close();
}

class IndexedDbNotesRepository implements NotesRepository {
  async list(): Promise<Note[]> {
    const all = await (await getDb()).getAll('notes');
    return all.filter((n) => !n.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
  }

  async listForSource(key: string): Promise<Note[]> {
    const notes = await (await getDb()).getAllFromIndex('notes', 'by-source', key);
    return notes.filter((n) => !n.deletedAt);
  }

  async add(input: NewNote): Promise<Note> {
    const now = Date.now();
    const note: Note = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    await (await getDb()).put('notes', note);
    notifyChanged();
    return note;
  }

  async update(id: string, patch: NotePatch): Promise<void> {
    const db = await getDb();
    const note = await db.get('notes', id);
    if (!note) return;
    await db.put('notes', { ...note, ...patch, updatedAt: Date.now() });
    notifyChanged();
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    const note = await db.get('notes', id);
    if (!note) return;
    const now = Date.now();
    await db.put('notes', { ...note, deletedAt: now, updatedAt: now });
    notifyChanged();
  }

  async removeSources(keys: string[]): Promise<void> {
    const tx = (await getDb()).transaction('notes', 'readwrite');
    const index = tx.store.index('by-source');
    const now = Date.now();
    for (const key of keys) {
      for (const note of await index.getAll(key)) {
        if (!note.deletedAt) await tx.store.put({ ...note, deletedAt: now, updatedAt: now });
      }
    }
    await tx.done;
    notifyChanged();
  }

  async listSources(): Promise<SourceMeta[]> {
    return (await getDb()).getAll('sources');
  }

  async updateSource(key: string, patch: SourceMetaPatch): Promise<void> {
    const db = await getDb();
    const existing = await db.get('sources', key);
    await db.put('sources', { ...existing, ...patch, key, updatedAt: Date.now() });
    notifyChanged();
  }

  async listCollections(): Promise<Collection[]> {
    const all = await (await getDb()).getAll('collections');
    return all.filter((c) => !c.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  }

  async addCollection(name: string): Promise<Collection> {
    const now = Date.now();
    const collection: Collection = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
    await (await getDb()).put('collections', collection);
    notifyChanged();
    return collection;
  }

  async renameCollection(id: string, name: string): Promise<void> {
    const db = await getDb();
    const collection = await db.get('collections', id);
    if (!collection) return;
    await db.put('collections', { ...collection, name, updatedAt: Date.now() });
    notifyChanged();
  }

  async removeCollection(id: string): Promise<void> {
    const db = await getDb();
    const collection = await db.get('collections', id);
    if (!collection) return;
    const now = Date.now();
    await db.put('collections', { ...collection, deletedAt: now, updatedAt: now });
    notifyChanged();
  }

  async exportData(): Promise<NotesData> {
    const db = await getDb();
    const [notes, sources, collections] = await Promise.all([
      db.getAll('notes'),
      db.getAll('sources'),
      db.getAll('collections'),
    ]);
    return {
      notes: notes.filter((n) => !n.deletedAt),
      sources,
      collections: collections.filter((c) => !c.deletedAt),
    };
  }

  async importData(data: NotesData): Promise<number> {
    const tx = (await getDb()).transaction(['notes', 'sources', 'collections'], 'readwrite');
    const notes = tx.objectStore('notes');
    const sources = tx.objectStore('sources');
    const collections = tx.objectStore('collections');
    let written = 0;
    for (const note of data.notes) {
      const existing = await notes.get(note.id);
      if (!existing || existing.updatedAt < note.updatedAt) {
        await notes.put(note);
        written++;
      }
    }
    for (const meta of data.sources) {
      const existing = await sources.get(meta.key);
      if (!existing || existing.updatedAt < meta.updatedAt) await sources.put(meta);
    }
    for (const collection of data.collections) {
      const existing = await collections.get(collection.id);
      if (!existing || existing.updatedAt < collection.updatedAt) await collections.put(collection);
    }
    await tx.done;
    notifyChanged();
    return written;
  }
}

export const notesRepo: NotesRepository = new IndexedDbNotesRepository();
