import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { layersPlugin } from './build/layers.mjs';
import { unscopePlugin } from './build/unscope.mjs';

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// The workbench in apps/preview serves the app; `@/` imports reach the skin in src/.
export default defineConfig({
  root: path('./apps/preview'),
  // Relative URLs, so the build works at a domain root or in a subfolder such as GitHub Pages.
  base: './',
  plugins: [tailwindcss(), react()],
  // What ships has no `@scope` (Safari mishandles it: build/unscope.mjs), and its layers carry names of their own,
  // above a Tailwind page's (build/layers.mjs).
  css: { postcss: { plugins: [unscopePlugin(), layersPlugin()] } },
  resolve: {
    alias: {
      '@preview': path('./apps/preview/src'),
      '@': path('./src'),
    },
  },
  server: {
    port: 4480,
    strictPort: true,
    fs: { allow: [path('.')] },
  },
  preview: { port: 4481, strictPort: true },
  build: {
    outDir: path('./dist'),
    emptyOutDir: true,
    rolldownOptions: {
      // The workbench shell, and the preview page it frames.
      input: {
        workbench: path('./apps/preview/index.html'),
        preview: path('./apps/preview/preview.html'),
        run: path('./apps/preview/run.html'),
      },
    },
  },
});
