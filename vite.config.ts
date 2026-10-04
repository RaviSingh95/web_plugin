import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the side panel page and the background service worker into dist/.
// public/manifest.json is copied as-is, so dist/ can be loaded unpacked in Chrome.
// The content script is built separately (vite.content.config.ts) because it
// must be a single classic script, not an ES module.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Both builds write into dist/, so cleaning is done by `npm run clean`.
    emptyOutDir: false,
    target: 'es2022',
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel.html',
        background: 'src/background/index.ts',
      },
      output: {
        // The manifest references background.js by a fixed name.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
