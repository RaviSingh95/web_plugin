import { useEffect, useRef } from 'react';
import { notesRepo } from '../shared/db';
import type { Note } from '../shared/types';

// Chrome's PDF viewer doesn't tell extensions which page is showing, so the
// side panel opens the PDF with pdf.js and searches for the saved text instead.

const pageTexts = new Map<string, Promise<string[]>>();

const normalize = (text: string) => text.replace(/\s+/g, '').toLowerCase();

async function loadPageTexts(url: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ url, isEvalSupported: false, disableFontFace: true }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(normalize(content.items.map((item) => ('str' in item ? item.str : '')).join('')));
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

/** Returns the 1-based page containing `text`, or 0 if it can't be found. */
export async function findPdfPage(url: string, text: string): Promise<number> {
  let pages = pageTexts.get(url);
  if (!pages) {
    pages = loadPageTexts(url);
    pageTexts.set(url, pages);
    pages.catch(() => pageTexts.delete(url));
  }
  const texts = await pages;
  const needle = normalize(text);
  // Try a long prefix first; fall back to a short one for text that spans pages
  // or doesn't match exactly (ligatures, hyphenation).
  for (const length of [80, 30]) {
    const part = needle.slice(0, length);
    if (part.length < 8) break;
    const index = texts.findIndex((page) => page.includes(part));
    if (index >= 0) return index + 1;
  }
  return 0;
}

/** Fills in pdfPage for PDF text notes that don't have one yet. */
export function usePdfPageLookup(notes: Note[]) {
  const started = useRef(new Set<string>());

  useEffect(() => {
    for (const note of notes) {
      if (note.source.kind !== 'pdf' || note.type !== 'text' || !note.text) continue;
      if (note.pdfPage !== undefined || started.current.has(note.id)) continue;
      started.current.add(note.id);
      findPdfPage(note.source.url, note.text)
        .catch(() => 0)
        .then((pdfPage) => notesRepo.update(note.id, { pdfPage }));
    }
  }, [notes]);
}
