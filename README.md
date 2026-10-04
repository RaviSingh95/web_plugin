# Web Notes

A Chrome extension for collecting text, images, links, screenshots and pages from websites and PDFs. Notes are grouped by the page or PDF they came from and shown in Chrome's side panel.

## Setup

```bash
npm install
npm run build      # one-off build into dist/
npm run dev        # rebuild on every change
```

Load it in Chrome:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `dist/` folder.
3. To take notes from local PDFs (`file://`), open the extension's **Details** and turn on **Allow access to file URLs**.

After a change, click the reload icon on the extension card. Then reopen the side panel, and reload any pages you're testing on so they get the new content script.

## Capturing

| What | How |
|---|---|
| Text | Select it and click the **Save to notes** button that appears, right-click and choose **Add selection to notes**, or press `Alt+Shift+S` |
| Image / link / page | Right-click it and choose **Add … to notes**, or click **Clip page** in the panel |
| Area screenshot | Click **Screenshot** in the panel, right-click and choose **Screenshot an area**, or press `Alt+Shift+A`, then drag a box. In PDFs this captures the whole visible area. |
| Your own note | Click **+ Note** in the panel |

- **Formatting:** text keeps its bold, italics, links, lists, code and tables.
- **YouTube:** notes record the current video time, and the ▶ chip opens the video at that moment.
- **PDFs:** text notes find their page number automatically (shown as `p. 12`). Click the chip to set it yourself.
- **Highlights:** saved text is highlighted when you revisit a page. Clicking a highlight opens its note in the panel.

## Organizing

- **Tags:** write `#tags` in a comment or note. Click a tag to filter, or type `#tag` in the search box.
- **Collections:** in **All sources**, use **+ Collection**, then *Move to collection…* from a group's ⋯ menu.
- **Pin:** pinned groups stay at the top.
- **Merge:** shows another group's notes inside this one. Undo it with *Separate merged sources*. Tracking params (`utm_*` and similar) and YouTube extras are stripped from URLs automatically, so those don't create separate groups.
- **Reorder:** drag a note by its ⋮⋮ handle. This is turned off while a search or tag filter is active.

## Export and backup

The ⋯ menu in the panel header has:
- Export all as Markdown or plain text.
- Download a JSON backup, with images included.
- Restore from a backup. Restoring merges with existing notes, and the newer copy of each note wins.
- Settings to turn the selection button and page highlights on or off.

Each group's ⋯ menu can copy or download just that group.

## Structure

```
public/manifest.json           MV3 manifest (copied into dist/)
sidepanel.html                 Side panel entry
src/background/index.ts        Context menus, shortcuts, screenshots, message handling
src/content/                   Runs in pages: save button, highlights, area selection, selection reading
src/shared/types.ts            Data model (notes, source settings, collections)
src/shared/db.ts               NotesRepository interface + IndexedDB implementation
src/shared/source.ts           URL normalization, PDF/YouTube helpers
src/shared/sanitize.ts         HTML allowlist sanitizer for formatted text
src/sidepanel/                 React UI, export/backup, PDF page lookup (pdf.js)
```

Two Vite builds write to `dist/`. `vite.config.ts` builds the side panel and background script. `vite.content.config.ts` builds the content script as a single classic script, because Chrome doesn't load content scripts as ES modules.

## Storage and future sync

All reads and writes go through the `NotesRepository` interface in `src/shared/db.ts`, backed by IndexedDB. The data is ready to sync with a backend later:
- Ids are UUIDs created on the client.
- Every record has `updatedAt`.
- Deletes are soft (`deletedAt`).
- Import already merges using "newer copy wins".
