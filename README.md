# Run

**A Video.js 10 skin that plays a film as an AI agent’s run.** The film’s chapters become the plan, its captions become the log, and the player shows its own reasoning. Nothing on it pretends a model is running.

**Live:** [run.gua.studio](https://run.gua.studio) · made for the Video.js Skins Design Challenge, November 2026.

![The Run player: the plan of five steps beside the film, a step’s preview, and the log typed into the bar.](apps/preview/public/site/plan.jpg)

## What it does

- **It opens on a prompt.** The player starts on the run’s ask (`data-rn-prompt`), dimmed film behind it. Press **Run**: the prompt’s words become the first layer of a small network drawn in fine lines, and each output reaches the step it becomes. Across to the plan on a wide player, down to the track on a phone. Once, about a second and a half; not at all under reduced motion.
- **The chapters are the plan.** Each chapter is a step: waiting, running (a brass ring filling with the step), done (a tick drawn in). Click a step to go there, run it again (it loops, as you would regenerate an answer), or compare its first frame with its last.
- **The captions are the log.** The current caption is written into the bar a word at a time, on the bar’s own ink, so it reads over any frame. When the controls rest, the bar keeps only the line: a pill with the step it belongs to and a thread of the step’s progress. Captions never leave with the controls.
- **The track is made of words.** Every caption word is a mark on the timeline. Point at it and the marks near the pointer rise; drag and they turn brass while a preview shows the frame, the step and the line said there.
- **Its reasoning is real.** The key reads *Thought for 0.4 s*: the last wait, measured. Open it for what the player decided (which source and why, the picture size, what is loaded ahead) and a trace of its waits. No model is involved, and the panel says so.
- **Commands.** `⌘K` / `Ctrl+K` or `/` opens a palette: speeds, steps, captions, the plan, picture in picture, a link to this moment. `Space` and `Enter` run and stop from anywhere on the page.
- **A report at the end:** each step’s span as a trace, and the viewer’s own run (time taken, stops, steps run again).

## Use it

Run is HTML and CSS around Video.js 10 (`src/video/skin.html`, `src/video/skin.ts`, `src/video/run/`). Give the video its chapters and captions, and the player its prompt:

```html
<video-player data-rn-prompt="Walk through the new dashboard">
  <!-- the markup of src/video/skin.html, with this video in its media slot -->
  <video playsinline crossorigin="anonymous">
    <track kind="chapters" src="steps.vtt" default>
    <track kind="captions" src="log.vtt" srclang="en">
  </video>
</video-player>

<style>
  video-player { --rn-signal: #c9ae78; } /* your brand's signal colour */
</style>
```

`apps/preview/src/run/mount.ts` mounts it in one call (`mount(host, film)`), with the sources tried in order: a stream where the browser plays HLS itself (Safari, Chrome and Edge 142+), a file elsewhere. No HLS library is loaded.

## Develop

```bash
pnpm install
pnpm dev            # http://127.0.0.1:4480/run.html (the skin alone) and the Video.js workbench at /
pnpm site:dev       # the showcase site, http://127.0.0.1:4484
pnpm film:fallback  # the film's MP4 for Firefox (needs ffmpeg)
pnpm test:e2e       # Chromium, WebKit and Firefox
```

Node 22 or later. `pnpm site:stills` retakes the site’s pictures from the real player; `pnpm measure` writes the numbers the site prints.

## Tested, and not

- **Tested:** 42 browser tests pass in Chromium, WebKit and Firefox: play and pause by click, Space and Enter; seek by the track and the arrow keys; time; mute and volume; fullscreen; captions; a phone’s layout (the Run key uncovered, the bar inside the player, no sideways scroll at 360 and 390 px); axe (WCAG 2.1 A and AA) at the start and while running. Walked by hand in the iOS Simulator’s Safari.
- **Not covered by tests:** the drawings (the network, the halo while dragging) are checked by eye; Android devices; screen readers beyond axe’s rules.

## Credits

Film: *Visualising AI* by Google DeepMind (Wes Cockx, Zünc Studio, Twistedpoly, Martina Stiftinger), via Pexels; streamed from Mux. Its chapters and captions were written for this skin. Nothing here implies endorsement by Google DeepMind.

Made by [Gua](https://gua.studio). Licensed under Apache 2.0 (`LICENSE`, `NOTICE`).
