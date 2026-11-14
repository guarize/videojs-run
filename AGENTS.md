# Agent guide

Run is a Video.js 10 HTML skin made with `videojs skin create`; `skin.json` records how.

- The skin is `src/video/`: `skin.html` (the markup), `skin.ts` (registers the elements and loads the styles) and `run/` (the run's parts and `run.css`). It imports nothing from `apps/`.
- `apps/preview/run.html` is the skin alone on its film; the browser tests open it. `apps/preview/src/run/mount.ts` mounts a player. The rest of `apps/preview` is the Video.js workbench.
- `apps/site/` is the showcase (Astro). Its pictures come from `scripts/site-stills.mjs`, its numbers from `scripts/measure.mjs`; nothing on it is typed by hand.
- Keep every control keyboard operable, labeled with the words it shows, with a visible focus ring, in source order that matches its visual order. Keep the error dialog, hotkeys and status announcer.
- Nothing may pretend a model is running: anything that "answers" answers from the film's own tracks or the player's own measurements, and says so.
- Run `pnpm typecheck`, `pnpm build` and `pnpm test:e2e` after changes.
