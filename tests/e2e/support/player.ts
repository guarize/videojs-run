import { expect, type Page } from '@playwright/test';

/** The skin alone on its film (apps/preview/run.html). `?bare` drops the page's padding. */
export const PAGE = '/run.html';
export const BARE = '/run.html?bare';

/** The film's steps (apps/preview/public/film/chapters.vtt). */
export const STEPS = [
  { title: 'Read the prompt', start: 0, end: 16.5 },
  { title: 'Predict a word', start: 16.5, end: 32 },
  { title: 'Generate', start: 32, end: 48.5 },
  { title: 'Fold a protein', start: 48.5, end: 63 },
  { title: 'Save time', start: 63, end: 78 },
];
/** The film's length: 78 s, the last step's end. */
export const DURATION = 78;

export const container = (page: Page) => page.locator('media-container.rn');

/** Opens the page and waits for the skin, the plan's steps, the film's metadata and the fonts. */
export async function open(page: Page, path = PAGE): Promise<void> {
  await page.goto(path);
  await expect(container(page)).toHaveAttribute('data-rn-prompted', '');
  await expect(page.locator('.rn-step')).toHaveCount(STEPS.length, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return !!video && video.readyState >= 1 && video.duration > 0;
  }, undefined, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export interface MediaState {
  time: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  rate: number;
  captions: string;
  src: string;
}

export const media = (page: Page): Promise<MediaState> =>
  page.evaluate(() => {
    const video = document.querySelector('video') as HTMLVideoElement;
    const captions = [...video.textTracks].find((t) => t.kind === 'captions' || t.kind === 'subtitles');
    return {
      time: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      ended: video.ended,
      muted: video.muted,
      volume: video.volume,
      rate: video.playbackRate,
      captions: captions?.mode ?? 'none',
      src: video.currentSrc,
    };
  });

/** Whether nothing on the page holds the focus. */
export const pageFocused = (page: Page) => page.evaluate(() => !document.activeElement || document.activeElement === document.body);

/** Gives the focus back to the page with a real click on its empty margin, below the player. */
export async function clickPage(page: Page): Promise<void> {
  const box = await container(page).boundingBox();
  const size = page.viewportSize();
  if (!box || !size) throw new Error('no player');
  const y = Math.min(size.height - 4, box.y + box.height + 40);
  await page.mouse.click(8, y);
  await expect.poll(() => pageFocused(page)).toBe(true);
}

/** Runs the film with Space from the page (a real key press, nothing focused) and waits until it is under way. */
export async function run(page: Page, past = 0.5): Promise<void> {
  expect(await pageFocused(page), 'Space is pressed with nothing focused').toBe(true);
  await page.keyboard.press('Space');
  await page.waitForFunction((t) => {
    const video = document.querySelector('video') as HTMLVideoElement;
    return !video.paused && video.currentTime > t;
  }, past, { timeout: 20_000 });
}

/** Seeks from script and waits until the new frame has been presented. */
export async function seekPainted(page: Page, time: number): Promise<void> {
  await page.evaluate(
    (t) =>
      new Promise<void>((resolve) => {
        const video = document.querySelector('video') as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
        const done = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        video.addEventListener(
          'seeked',
          () => {
            if (!video.requestVideoFrameCallback) return done();
            let settled = false;
            video.requestVideoFrameCallback(() => {
              settled = true;
              done();
            });
            // A paused film may already show the frame and never call back.
            setTimeout(() => !settled && done(), 400);
          },
          { once: true },
        );
        video.currentTime = t;
      }),
    time,
  );
}

/** Runs the film (a real Space), then pauses it from script and holds it at `time`, with the frame painted. */
export async function runAndHold(page: Page, time: number): Promise<void> {
  await run(page);
  await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).pause());
  await seekPainted(page, time);
  await settle(page);
}

/** Waits until nothing is mid-transition: every finite animation has finished (the caret's blink doesn't count). */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
}
