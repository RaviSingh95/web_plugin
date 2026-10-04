import { noteTags } from '../shared/tags';
import type { Note, NoteSource, SourceMeta } from '../shared/types';

export interface SourceGroupData {
  /** Key of the group's main source (others may be merged into it). */
  key: string;
  /** Display source: the newest note from the main source, so title changes show up. */
  source: NoteSource;
  notes: Note[];
  latest: number;
  /** Every source key shown in this group, including merged ones. */
  memberKeys: string[];
  meta?: SourceMeta;
}

export const notePosition = (note: Note) => note.position ?? note.createdAt;

/** Follows mergedInto links to the key of the group a source is shown in. */
export function resolveKey(key: string, metas: Map<string, SourceMeta>): string {
  const seen = new Set<string>();
  let current = key;
  for (;;) {
    const next = metas.get(current)?.mergedInto;
    if (!next || seen.has(next)) return current;
    seen.add(current);
    current = next;
  }
}

/** Groups notes by source: pinned groups first, then most recently added. */
export function groupBySource(notes: Note[], metas: Map<string, SourceMeta>): SourceGroupData[] {
  const groups = new Map<string, SourceGroupData & { sourceScore: number }>();

  for (const note of notes) {
    const key = resolveKey(note.source.key, metas);
    let group = groups.get(key);
    if (!group) {
      group = { key, source: note.source, notes: [], latest: 0, memberKeys: [], meta: metas.get(key), sourceScore: -1 };
      groups.set(key, group);
    }
    group.notes.push(note);
    group.latest = Math.max(group.latest, note.createdAt);
    if (!group.memberKeys.includes(note.source.key)) group.memberKeys.push(note.source.key);
    // Prefer the main source's own notes for the title, then the newest.
    const score = (note.source.key === key ? 1e15 : 0) + note.createdAt;
    if (score > group.sourceScore) {
      group.source = note.source;
      group.sourceScore = score;
    }
  }

  return [...groups.values()]
    .map(({ sourceScore: _, ...group }) => {
      group.notes.sort((a, b) => notePosition(b) - notePosition(a));
      return group;
    })
    .sort((a, b) => Number(!!b.meta?.pinned) - Number(!!a.meta?.pinned) || b.latest - a.latest);
}

/** Words must all appear in the note; words starting with # must match a tag. */
export function matchesQuery(note: Note, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const tags = noteTags(note);
  const haystack = [note.text, note.comment, note.linkText, note.linkUrl, note.source.title, note.source.url]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((w) => (w.startsWith('#') && w.length > 1 ? tags.includes(w.slice(1)) : haystack.includes(w)));
}

/** All tags with how many notes use them, most used first. */
export function countTags(notes: Note[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of noteTags(note)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
