import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { notesRepo } from '../../shared/db';
import { sanitizeHtml } from '../../shared/sanitize';
import { formatDuration, isYouTube, pdfPageUrl, textFragmentUrl, videoTimeUrl } from '../../shared/source';
import { noteTags } from '../../shared/tags';
import type { Note, NoteType } from '../../shared/types';
import { Composer } from './Composer';

const TYPE_LABELS: Record<NoteType, string> = {
  text: 'Text',
  image: 'Image',
  screenshot: 'Screenshot',
  link: 'Link',
  page: 'Page',
  manual: 'Note',
};

interface Props {
  note: Note;
  focused: boolean;
  onTagClick: (tag: string) => void;
  dragHandle?: ReactNode;
}

export function NoteCard({ note, focused, onTagClick, dragHandle }: Props) {
  const [editingComment, setEditingComment] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const tags = noteTags(note);
  const jumpUrl = noteJumpUrl(note);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);

  const saveComment = async (comment: string) => {
    await notesRepo.update(note.id, { comment });
    setEditingComment(false);
  };

  return (
    <article ref={ref} className={`note note-${note.type}${focused ? ' flash' : ''}`}>
      <NoteBody note={note} />

      {editingComment ? (
        <Composer
          initial={note.comment}
          placeholder="Add a comment… use #tags to organize"
          onSave={saveComment}
          onCancel={() => setEditingComment(false)}
        />
      ) : (
        note.comment && (
          <p className="comment" onClick={() => setEditingComment(true)}>
            {note.comment}
          </p>
        )
      )}

      {tags.length > 0 && (
        <div className="note-tags">
          {tags.map((tag) => (
            <button key={tag} className="tag-link" onClick={() => onTagClick(tag)}>
              #{tag}
            </button>
          ))}
        </div>
      )}

      <footer className="note-footer">
        <span className="note-meta">
          {dragHandle}
          <span className="muted">
            {TYPE_LABELS[note.type]} · {formatTime(note.createdAt)}
          </span>
          <PdfPageChip note={note} />
          <VideoTime note={note} />
        </span>
        <span className="note-actions">
          {jumpUrl && (
            <a className="icon-btn" href={jumpUrl} target="_blank" rel="noreferrer" title="Show this on the page">
              ⤴
            </a>
          )}
          <button
            className="icon-btn"
            title={note.comment ? 'Edit comment' : 'Add comment'}
            onClick={() => setEditingComment(true)}
          >
            ✎
          </button>
          <button className="icon-btn" title="Delete note" onClick={() => notesRepo.remove(note.id)}>
            ✕
          </button>
        </span>
      </footer>
    </article>
  );
}

function noteJumpUrl(note: Note): string | undefined {
  if (note.source.kind === 'pdf') return note.pdfPage ? pdfPageUrl(note.source.url, note.pdfPage) : undefined;
  if (note.type === 'text' && note.text) return textFragmentUrl(note.source.url, note.text);
  return undefined;
}

function NoteBody({ note }: { note: Note }) {
  switch (note.type) {
    case 'text':
      return note.html ? <FormattedQuote note={note} /> : <blockquote className="quote">{note.text}</blockquote>;
    case 'manual':
      return <p className="manual">{note.text}</p>;
    case 'image':
    case 'screenshot':
      return <ImageBody note={note} />;
    case 'link':
      return (
        <a className="link" href={note.linkUrl} target="_blank" rel="noreferrer">
          <span className="link-text">{note.linkText || note.linkUrl}</span>
          {note.linkText && <span className="link-url">{note.linkUrl}</span>}
        </a>
      );
    case 'page':
      return (
        <a className="link" href={note.source.url} target="_blank" rel="noreferrer">
          <span className="link-text">{note.source.title}</span>
          <span className="link-url">{note.source.url}</span>
        </a>
      );
  }
}

function FormattedQuote({ note }: { note: Note }) {
  // Sanitized again here: the HTML may have come from an imported backup.
  const html = useMemo(() => sanitizeHtml(note.html!, note.source.url, true), [note.html, note.source.url]);
  return <blockquote className="quote formatted" dangerouslySetInnerHTML={{ __html: html }} />;
}

function ImageBody({ note }: { note: Note }) {
  const localUrl = useObjectUrl(note.imageBlob);
  const src = localUrl ?? note.imageUrl;
  if (!src) return null;
  return (
    <a href={note.imageUrl ?? src} target="_blank" rel="noreferrer">
      <img className="image" src={src} alt="" loading="lazy" />
    </a>
  );
}

function PdfPageChip({ note }: { note: Note }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  if (note.source.kind !== 'pdf') return null;

  if (editing) {
    const commit = () => {
      const page = parseInt(value, 10);
      if (page > 0) notesRepo.update(note.id, { pdfPage: page });
      setEditing(false);
    };
    return (
      <input
        className="page-input"
        type="number"
        min={1}
        autoFocus
        value={value}
        placeholder="page"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  const searching = note.type === 'text' && note.pdfPage === undefined;
  return (
    <button
      className="chip small"
      title={searching ? 'Finding page…' : 'Set page number'}
      onClick={() => {
        setValue(note.pdfPage ? String(note.pdfPage) : '');
        setEditing(true);
      }}
    >
      {note.pdfPage ? `p. ${note.pdfPage}` : searching ? 'p. …' : 'p. ?'}
    </button>
  );
}

function VideoTime({ note }: { note: Note }) {
  if (note.videoTime == null) return null;
  const label = `▶ ${formatDuration(note.videoTime)}`;
  if (!isYouTube(note.source.url)) return <span className="chip small">{label}</span>;
  return (
    <a
      className="chip small"
      href={videoTimeUrl(note.source.url, note.videoTime)}
      target="_blank"
      rel="noreferrer"
      title="Open the video at this moment"
    >
      {label}
    </a>
  );
}

function useObjectUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
