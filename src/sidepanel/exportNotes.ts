import { notesRepo } from '../shared/db';
import { formatDuration, isYouTube, pdfPageUrl, sourceSubtitle, videoTimeUrl } from '../shared/source';
import type { Collection, Note, SourceMeta } from '../shared/types';
import type { SourceGroupData } from './grouping';

export type ExportFormat = 'markdown' | 'text';

export function groupsToDocument(groups: SourceGroupData[], format: ExportFormat): string {
  const md = format === 'markdown';
  const lines = [md ? '# Web Notes' : 'WEB NOTES', `Exported ${new Date().toLocaleString()}`, ''];
  for (const group of groups) lines.push(...groupLines(group, md), '');
  return lines.join('\n').trimEnd() + '\n';
}

export function groupToDocument(group: SourceGroupData, format: ExportFormat): string {
  return groupLines(group, format === 'markdown').join('\n').trimEnd() + '\n';
}

function groupLines(group: SourceGroupData, md: boolean): string[] {
  const { source } = group;
  const lines = md
    ? [`## [${escapeMd(source.title)}](${source.url})`, `_${sourceSubtitle(source)}_`, '']
    : [source.title, source.url, '-'.repeat(Math.min(60, Math.max(10, source.title.length))), ''];
  for (const note of group.notes) lines.push(...noteLines(note, md), '');
  return lines;
}

function noteLines(note: Note, md: boolean): string[] {
  const lines: string[] = [];
  switch (note.type) {
    case 'text':
      lines.push(...(md ? (note.text ?? '').split('\n').map((l) => `> ${l}`) : [`“${note.text ?? ''}”`]));
      break;
    case 'manual':
      lines.push(note.text ?? '');
      break;
    case 'link': {
      const label = note.linkText || note.linkUrl;
      lines.push(md ? `- [${escapeMd(label ?? '')}](${note.linkUrl})` : `Link: ${label} — ${note.linkUrl}`);
      break;
    }
    case 'page':
      lines.push(md ? `- Saved page: [${escapeMd(note.source.title)}](${note.source.url})` : `Saved page: ${note.source.url}`);
      break;
    case 'image':
      if (note.imageUrl && !note.imageUrl.startsWith('data:')) {
        lines.push(md ? `![image](${note.imageUrl})` : `Image: ${note.imageUrl}`);
      } else {
        lines.push(md ? '_(image)_' : '(image)');
      }
      break;
    case 'screenshot':
      lines.push(md ? '_(screenshot)_' : '(screenshot)');
      break;
  }

  const meta: string[] = [];
  if (note.pdfPage) {
    meta.push(md ? `[p. ${note.pdfPage}](${pdfPageUrl(note.source.url, note.pdfPage)})` : `p. ${note.pdfPage}`);
  }
  if (note.videoTime != null) {
    const time = formatDuration(note.videoTime);
    meta.push(
      md && isYouTube(note.source.url) ? `[▶ ${time}](${videoTimeUrl(note.source.url, note.videoTime)})` : `at ${time}`,
    );
  }
  if (meta.length) lines.push(meta.join(' · '));
  if (note.comment) lines.push(md ? `**Comment:** ${note.comment}` : `Comment: ${note.comment}`);
  return lines;
}

function escapeMd(text: string): string {
  return text.replace(/([[\]\\])/g, '\\$1');
}

// --- Backup (JSON with images embedded) ---

interface BackupFile {
  app: 'web-notes';
  version: 1;
  exportedAt: string;
  notes: (Omit<Note, 'imageBlob'> & { imageData?: string })[];
  sources: SourceMeta[];
  collections: Collection[];
}

export async function createBackup(): Promise<string> {
  const data = await notesRepo.exportData();
  const notes = await Promise.all(
    data.notes.map(async ({ imageBlob, ...note }) => ({
      ...note,
      imageData: imageBlob ? await blobToDataUrl(imageBlob) : undefined,
    })),
  );
  const file: BackupFile = {
    app: 'web-notes',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes,
    sources: data.sources,
    collections: data.collections,
  };
  return JSON.stringify(file);
}

/** Restores a backup, merging it with existing notes. Returns how many notes were written. */
export async function restoreBackup(json: string): Promise<number> {
  let file: BackupFile;
  try {
    file = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (file?.app !== 'web-notes' || !Array.isArray(file.notes)) {
    throw new Error('That file is not a Web Notes backup.');
  }
  const notes: Note[] = await Promise.all(
    file.notes.map(async ({ imageData, ...note }) => ({
      ...note,
      imageBlob: imageData ? await (await fetch(imageData)).blob() : undefined,
    })),
  );
  return notesRepo.importData({ notes, sources: file.sources ?? [], collections: file.collections ?? [] });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// --- Files and clipboard ---

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'notes'
  );
}

export function dateSlug(): string {
  return new Date().toISOString().slice(0, 10);
}
