import { defineConfig } from 'vite';

// Content scripts can't be ES modules, so this bundles src/content into one IIFE.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    lib: {
      entry: 'src/content/index.ts',
      formats: ['iife'],
      name: 'webNotesContent',
      fileName: () => 'content.js',
    },
  },
});
