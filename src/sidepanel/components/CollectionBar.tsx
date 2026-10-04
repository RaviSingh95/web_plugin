import { useState, type FormEvent } from 'react';
import { notesRepo } from '../../shared/db';
import type { Collection } from '../../shared/types';
import type { SourceGroupData } from '../grouping';

/** 'all', 'unsorted', or a collection id. */
export type CollectionFilter = string;

interface Props {
  collections: Collection[];
  groups: SourceGroupData[];
  value: CollectionFilter;
  onChange: (value: CollectionFilter) => void;
}

export function CollectionBar({ collections, groups, value, onChange }: Props) {
  const [editing, setEditing] = useState<'create' | 'rename'>();
  const [name, setName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ids = new Set(collections.map((c) => c.id));
  const inCollection = (g: SourceGroupData) => g.meta?.collectionId && ids.has(g.meta.collectionId);
  const unsortedCount = groups.filter((g) => !inCollection(g)).length;
  const active = collections.find((c) => c.id === value);

  const select = (next: CollectionFilter) => {
    setConfirmingDelete(false);
    setEditing(undefined);
    onChange(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing === 'create') {
      const collection = await notesRepo.addCollection(trimmed);
      onChange(collection.id);
    } else if (editing === 'rename' && active) {
      await notesRepo.renameCollection(active.id, trimmed);
    }
    setEditing(undefined);
  };

  const remove = async () => {
    if (!active) return;
    await notesRepo.removeCollection(active.id);
    select('all');
  };

  return (
    <div className="collections">
      <div className="chips">
        <button className={`chip${value === 'all' ? ' active' : ''}`} onClick={() => select('all')}>
          All <span className="chip-count">{groups.length}</span>
        </button>
        {collections.map((c) => (
          <button key={c.id} className={`chip${value === c.id ? ' active' : ''}`} onClick={() => select(c.id)}>
            {c.name}{' '}
            <span className="chip-count">{groups.filter((g) => g.meta?.collectionId === c.id).length}</span>
          </button>
        ))}
        {collections.length > 0 && (
          <button className={`chip${value === 'unsorted' ? ' active' : ''}`} onClick={() => select('unsorted')}>
            Unsorted <span className="chip-count">{unsortedCount}</span>
          </button>
        )}
        <button
          className="chip add"
          onClick={() => {
            setEditing('create');
            setName('');
          }}
        >
          + Collection
        </button>
      </div>

      {editing && (
        <form className="inline-form" onSubmit={submit}>
          <input
            autoFocus
            placeholder={editing === 'create' ? 'New collection name' : 'Collection name'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(undefined)}
          />
          <button className="btn primary small" disabled={!name.trim()}>
            Save
          </button>
          <button type="button" className="btn small" onClick={() => setEditing(undefined)}>
            Cancel
          </button>
        </form>
      )}

      {active && !editing && (
        <div className="collection-actions">
          {confirmingDelete ? (
            <>
              <span className="muted">Delete “{active.name}”? Its notes are kept.</span>
              <button className="btn danger small" onClick={remove}>
                Delete
              </button>
              <button className="btn small" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="link-btn"
                onClick={() => {
                  setEditing('rename');
                  setName(active.name);
                }}
              >
                Rename
              </button>
              <button className="link-btn danger" onClick={() => setConfirmingDelete(true)}>
                Delete collection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
