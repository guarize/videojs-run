// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { layersPlugin } from '../../build/layers.mjs';
import { unscopePlugin } from '../../build/unscope.mjs';

/** @param {string} path */
const repo = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/**
 * The Run site: one static page. The skin comes from src/ and the player's mount from apps/preview/src/run, through
 * the workbench's own aliases, so a fix there lands here. The public folder is the workbench's: the film's tracks,
 * poster and the stills exist once on disk. SITE_INDEX=1 is the release switch; without it the page says noindex.
 */
export default defineConfig({
  site: 'https://run.gua.studio',
  output: 'static',
  publicDir: repo('apps/preview/public'),
  outDir: './dist',
  devToolbar: { enabled: false },
  vite: {
    css: { postcss: { plugins: [unscopePlugin(), layersPlugin()] } },
    resolve: { alias: { '@preview': repo('apps/preview/src'), '@': repo('src') } },
    server: { strictPort: true, fs: { allow: [repo('.')] } },
    preview: { strictPort: true },
  },
});
