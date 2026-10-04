export type NoteType = 'text' | 'image' | 'screenshot' | 'link' | 'page' | 'manual';

export type SourceKind = 'web' | 'pdf';

/** Where a note was captured. Notes are grouped by `key`. */
export interface NoteSource {
  /** Normalized URL (see sourceKey) used for grouping. */
  key: string;
  url: string;
  title: string;
  kind: SourceKind;
}

export interface Note {
  id: string;
  type: NoteType;
  /** Selected text, or the body of a manual note. */
  text?: string;
  /** Sanitized HTML of the selection, kept only when it has formatting. */
  html?: string;
  linkUrl?: string;
  linkText?: string;
  /** Original image address. */
  imageUrl?: string;
  /** Local copy of the image (or screenshot) so it survives the page going away. */
  imageBlob?: Blob;
  /** The user's own remark about this note. May contain #tags. */
  comment?: string;
  /** PDF page the note came from. 0 means it was looked up but not found. */
  pdfPage?: number;
  /** Video position in seconds when the note was taken (YouTube). */
  videoTime?: number;
  /** Manual order within a group, higher first. Falls back to createdAt. */
  position?: number;
  source: NoteSource;
  createdAt: number;
  updatedAt: number;
  /** Soft delete, so deletions can be synced to a backend later. */
  deletedAt?: number;
}

export type NewNote = Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export type NotePatch = Partial<Pick<Note, 'text' | 'comment' | 'position' | 'pdfPage'>>;

/** Per-source settings, keyed by NoteSource.key. */
export interface SourceMeta {
  key: string;
  pinned?: boolean;
  collectionId?: string;
  /** When set, this source's notes are shown in the group of that source key. */
  mergedInto?: string;
  updatedAt: number;
}

export type SourceMetaPatch = Partial<Pick<SourceMeta, 'pinned' | 'collectionId' | 'mergedInto'>>;

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface NotesData {
  notes: Note[];
  sources: SourceMeta[];
  collections: Collection[];
}
