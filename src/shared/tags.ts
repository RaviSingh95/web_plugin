import type { Note } from './types';

const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;

export function extractTags(text?: string): string[] {
  if (!text) return [];
  return [...text.matchAll(TAG_PATTERN)].map((m) => m[1].toLowerCase());
}

/**
 * Tags are #words written in a note's comment, or in the body of a manual note.
 * Captured page text is ignored so hashtags from the page don't become tags.
 */
export function noteTags(note: Note): string[] {
  const tags = extractTags(note.comment);
  if (note.type === 'manual') tags.push(...extractTags(note.text));
  return [...new Set(tags)];
}
