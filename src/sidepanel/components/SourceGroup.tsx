import { useState, type DragEvent } from 'react';
import { notesRepo } from '../../shared/db';
import { faviconUrl, sourceSubtitle } from '../../shared/source';
import { downloadFile, fileSlug, groupToDocument } from '../exportNotes';
import { notePosition, type SourceGroupData } from '../grouping';
import { Menu } from './Menu';
import { NoteCard } from './NoteCard';

interface Props {
  group: SourceGroupData;
  defaultOpen: boolean;
  focusId?: string;
  /** Drag-to-reorder is turned off while notes are filtered. */
  reorderable: boolean;
  collectionName?: string;
  onTagClick: (tag: string) => void;
  onMerge?: () => void;
  onMoveToCollection: () => void;
  notify: (message: string) => void;
}

interface DropTarget {
  id: string;
  after: boolean;
}

export function SourceGroup(props: Props) {
  const { group, focusId, reorderable, collectionName, onTagClick, onMerge, onMoveToCollection, notify } = props;
  const [open, setOpen] = useState(props.defaultOpen);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [armedId, setArmedId] = useState<string>();
  const [dragId, setDragId] = useState<string>();
  const [drop, setDrop] = useState<DropTarget>();
  const { source } = group;
  const isOpen = open || (!!focusId && group.notes.some((n) => n.id === focusId));
  const mergedCount = group.memberKeys.length - 1;
  const pinned = !!group.meta?.pinned;

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(groupToDocument(group, 'markdown'));
    notify('Copied as Markdown');
  };

  const unmerge = async () => {
    for (const key of group.memberKeys) {
      if (key !== group.key) await notesRepo.updateSource(key, { mergedInto: undefined });
    }
    notify('Sources separated');
  };

  // --- Drag to reorder ---

  const resetDrag = () => {
    setArmedId(undefined);
    setDragId(undefined);
    setDrop(undefined);
  };

  const onDragOver = (e: DragEvent<HTMLLIElement>, targetId: string) => {
    if (!dragId || dragId === targetId) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    if (drop?.id !== targetId || drop.after !== after) setDrop({ id: targetId, after });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragId && drop) moveNote(dragId, drop);
    resetDrag();
  };

  const moveNote = (id: string, target: DropTarget) => {
    const rest = group.notes.filter((n) => n.id !== id);
    const i = rest.findIndex((n) => n.id === target.id);
    if (i < 0) return;
    // Notes are sorted by position, highest first; place the note between its new neighbours.
    const above = target.after ? rest[i] : rest[i - 1];
    const below = target.after ? rest[i + 1] : rest[i];
    const position =
      above && below
        ? (notePosition(above) + notePosition(below)) / 2
        : above
          ? notePosition(above) - 1000
          : notePosition(below!) + 1000;
    notesRepo.update(id, { position });
  };

  const canDrag = reorderable && group.notes.length > 1;

  return (
    <section className={`group${pinned ? ' pinned' : ''}`}>
      <header className="group-header">
        <button className="group-toggle" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
          <span className="chevron">{isOpen ? '▾' : '▸'}</span>
          {source.kind === 'pdf' ? (
            <span className="pdf-badge">PDF</span>
          ) : (
            <img className="favicon" src={faviconUrl(source.url)} alt="" width={16} height={16} />
          )}
          <span className="group-title">
            <span className="title">{source.title}</span>
            <span className="subtitle">
              {sourceSubtitle(source)}
              {mergedCount > 0 && ` · +${mergedCount} merged`}
              {collectionName && ` · ${collectionName}`}
            </span>
          </span>
          {pinned && (
            <span className="pin" title="Pinned">
              📌
            </span>
          )}
          <span className="count">{group.notes.length}</span>
        </button>
        {confirmingDelete ? (
          <span className="confirm">
            <button className="btn danger small" onClick={() => notesRepo.removeSources(group.memberKeys)}>
              Delete all
            </button>
            <button className="btn small" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <span className="group-actions">
            <a className="icon-btn" href={source.url} target="_blank" rel="noreferrer" title="Open source">
              ↗
            </a>
            <Menu
              title="Group options"
              items={[
                {
                  label: pinned ? 'Unpin' : 'Pin to top',
                  onSelect: () => notesRepo.updateSource(group.key, { pinned: !pinned }),
                },
                { label: 'Move to collection…', onSelect: onMoveToCollection },
                { label: 'Merge into another group…', onSelect: () => onMerge?.(), hidden: !onMerge },
                {
                  label: `Separate ${mergedCount} merged source${mergedCount === 1 ? '' : 's'}`,
                  onSelect: unmerge,
                  hidden: mergedCount === 0,
                },
                'separator',
                { label: 'Copy as Markdown', onSelect: copyMarkdown },
                {
                  label: 'Download as Markdown',
                  onSelect: () =>
                    downloadFile(`${fileSlug(source.title)}.md`, groupToDocument(group, 'markdown'), 'text/markdown'),
                },
                {
                  label: 'Download as plain text',
                  onSelect: () =>
                    downloadFile(`${fileSlug(source.title)}.txt`, groupToDocument(group, 'text'), 'text/plain'),
                },
                'separator',
                { label: 'Delete all notes…', danger: true, onSelect: () => setConfirmingDelete(true) },
              ]}
            />
          </span>
        )}
      </header>
      {isOpen && (
        <ul className="notes">
          {group.notes.map((note) => (
            <li
              key={note.id}
              draggable={canDrag && armedId === note.id}
              onDragStart={(e) => {
                setDragId(note.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', note.id);
              }}
              onDragOver={(e) => onDragOver(e, note.id)}
              onDrop={onDrop}
              onDragEnd={resetDrag}
              className={
                drop?.id === note.id ? (drop.after ? 'drop-after' : 'drop-before') : dragId === note.id ? 'dragging' : undefined
              }
            >
              <NoteCard
                note={note}
                focused={note.id === focusId}
                onTagClick={onTagClick}
                dragHandle={
                  canDrag && (
                    <span
                      className="drag-handle"
                      title="Drag to reorder"
                      onPointerDown={() => setArmedId(note.id)}
                      onPointerUp={() => setArmedId(undefined)}
                    >
                      ⋮⋮
                    </span>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
