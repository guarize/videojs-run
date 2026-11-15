import type { Page, TestInfo } from '@playwright/test';
import { container, seekPainted, settle } from './player';
import { expect } from './test';

/**
 * Shared by the proof battery (contrast, targets, keyboard, motion): the film's two extreme frames, the film played
 * from the site's own copy, a hold on one frame, and the measurements each spec attaches for the measure reporter.
 */

/**
 * The two frames contrast is measured over, found in apps/preview/public/film/film-720.mp4 (24 fps, 1,872 frames,
 * 78 s) by its mean luma per frame: `ffmpeg -i film-720.mp4 -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG"
 * -f null -` (14 Nov 2026), sorted.
 * - bright: frame 781, 0:32.542, YAVG 211.8 of 235, the brightest of the film (step 3, "Generate": the white field
 *   the pixels resolve over; 0:32.50–0:32.96 all hold 210.9–211.8). Its bottom quarter, behind the bar, is 230.0, a
 *   hair under the film's brightest bottom quarter (231.1 at 0:33.67). Held at 32.56 s, inside the frame.
 * - dark: frame 314, 0:13.083, YAVG 58.9, the darkest (step 1, "Read the prompt"; 0:12.88–0:13.29 all hold
 *   58.9–59.4; bottom quarter 65.5). Held at 13.10 s.
 * The mean of the whole film is 139.6. Every moment of it has a caption, so the log line is up over both.
 */
export const BRIGHT = 32.56;
export const DARK = 13.1;
export const FRAMES = [
  { frame: 'bright', time: BRIGHT },
  { frame: 'dark', time: DARK },
] as const;

/**
 * The proofs play the film from the site's own copy (film-720.mp4, the file the frames above were found in), not from
 * Mux: the stream's encode places frames on its own timeline, and a stream keeps buffering while the film is paused,
 * which redraws the track's loaded marks between two photographs. Mux's addresses are refused, so the player falls
 * through its sources (sources.ts) to the last one, as it does when Mux is down.
 */
export async function localFilm(page: Page): Promise<void> {
  await page.route(/^https:\/\/(stream|image)\.mux\.com\//, (route) => route.abort('blockedbyclient'));
}

/** Waits until the film has stopped loading ahead: its buffered end unchanged for 600 ms (or the whole film in). */
export async function loaded(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        const end = () => (video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0);
        const before = end();
        if (before >= video.duration - 0.1) return resolve(true);
        setTimeout(() => resolve(end() === before && video.readyState >= 2), 600);
      }),
    undefined,
    { timeout: 30_000, polling: 100 },
  );
}

/** WebKit's Tab reaches only text fields unless full keyboard access is on; Option-Tab is what a Mac's keyboard user presses. */
export const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab');

/** Moves the pointer to the page's top-left corner, outside the player, so nothing in it is hovered. */
export async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
}

/**
 * Runs the film with a real Space from the page, pauses it from script, holds it on `time` with that frame painted,
 * and waits until the log line has been written and nothing is mid-transition. No checkpoint is kept for the pause.
 */
export async function holdAt(page: Page, time: number): Promise<void> {
  // Held to measure the bar and the plan over the film's own frame, the pause keeps no checkpoint (its context window
  // would cover the frame); checkpoint.spec.ts measures that window itself.
  await page.evaluate(() => document.querySelector('media-container')?.setAttribute('data-rn-checkpoint', 'off'));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const video = document.querySelector('video') as HTMLVideoElement;
    return !video.paused && video.currentTime > 0.6;
  }, undefined, { timeout: 20_000 });
  await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).pause());
  await seekPainted(page, time);
  await expect(container(page)).toHaveAttribute('data-rn-started', '');
  // The network Run draws (mind.ts, about 1.5 s) has handed the player back.
  await expect(container(page)).not.toHaveAttribute('data-rn-mind', /.*/, { timeout: 5_000 });
  await expect(page.locator('rn-log')).not.toHaveAttribute('data-typing', /.*/);
  await settle(page);
}

/** Attaches a measurement for the measure reporter (support/measure-reporter.ts). */
export async function measure(testInfo: TestInfo, data: Record<string, unknown>): Promise<void> {
  await testInfo.attach('measure', { body: JSON.stringify(data), contentType: 'application/json' });
}
