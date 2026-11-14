import { failures, measureContrast, summary, worst, type Result } from './support/contrast';
import { container, open, settle } from './support/player';
import { FRAMES, holdAt, localFilm, measure, parkPointer } from './support/proof';
import { expect, test } from './support/test';

/**
 * Every visible text run, time, log line, the pill, the step key and every icon in the player, measured against the
 * composited pixels behind it (support/contrast.ts), with the film paused on its brightest frame (0:32.56) and its
 * darkest (0:13.10); support/proof.ts has how they were found. The bar: 4.9:1 for text under 24 px (18.66 px bold),
 * 3.4:1 for large text, icons and marks, the playhead and the played track (WCAG AA plus the standard's 0.4 margin).
 * The track's marks ahead of the playhead are held to 3.4:1 too, so the run's whole extent reads before it is run.
 */

const record = async (name: string, data: Record<string, unknown>, results: Result[], skipped: string[], shown: Buffer, ground: Buffer) => {
  const info = test.info();
  await info.attach(`${name}-shown`, { body: shown, contentType: 'image/png' });
  await info.attach(`${name}-ground`, { body: ground, contentType: 'image/png' });
  const by = (...kinds: Result['kind'][]) => results.filter((r) => kinds.includes(r.kind));
  await measure(info, {
    ...data,
    text: summary(worst(by('text'))),
    large: summary(worst(by('large'))),
    graphics: summary(worst(by('graphics'))),
    boundary: summary(worst(by('boundary'))),
    log: summary(worst(results.filter((r) => r.log))),
    unplayed: summary(worst(by('unplayed'))),
    counts: { text: by('text', 'large').length, graphics: by('graphics').length, boundary: by('boundary').length, log: results.filter((r) => r.log).length },
    skipped,
    all: results,
  });
  return by;
};

test.beforeEach(async ({ page }) => {
  await localFilm(page);
});

test.describe('desktop, 1280 × 800', () => {
  for (const { frame, time } of FRAMES) {
    test(`${frame} frame (${time} s), controls up: plan, log line, step key, time, keys and track hold their contrast`, async ({ page }) => {
      await open(page);
      await parkPointer(page);
      await holdAt(page, time);
      await expect(container(page)).toHaveAttribute('data-controls-visible', '');
      await expect(container(page)).toHaveAttribute('data-rn-plan', 'open');
      await expect(page.locator('rn-log')).toHaveAttribute('data-caption', '');

      const { results, skipped, shown, ground } = await measureContrast(page);
      const by = await record(`desktop-${frame}`, { layout: 'desktop', frame, time }, results, skipped, shown, ground);

      // Sanity floor: the plan's five steps and their times, the log line, the step key, the time, the Run key's word;
      // the bar's icons and the plan's marks; the playhead and the played track.
      expect(by('text', 'large').length, 'text runs measured').toBeGreaterThanOrEqual(18);
      expect(by('graphics').length, 'icons and marks measured').toBeGreaterThanOrEqual(12);
      expect(results.filter((r) => r.log).length, 'log line measured').toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.label.startsWith('playhead')), 'playhead measured').toBe(true);
      expect(results.filter((r) => r.kind === 'boundary').length, 'played track marks measured').toBeGreaterThanOrEqual(20);
      expect(failures(results), `contrast below the bar, desktop, ${frame} frame`).toEqual([]);
    });

    test(`${frame} frame (${time} s), controls away: the pill (its step, its line, its thread) holds its contrast`, async ({ page }) => {
      await open(page);
      await parkPointer(page);
      await holdAt(page, time);
      // The pill shows only while the film plays with the controls away: played at a sixteenth of its speed from just
      // before the frame, it stays inside the frame's window (support/proof.ts) while it is measured.
      await page.evaluate((t) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        video.playbackRate = 0.0625;
        video.currentTime = t - 0.1;
        return video.play();
      }, time);
      await expect(page.locator('.video-controls-content')).not.toHaveAttribute('data-visible', /.*/, { timeout: 15_000 });
      await expect(page.locator('rn-log .rn-log-step')).toBeVisible();
      // The thread's scale follows the film for as long as it plays; everything else has to have arrived.
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity || (a.effect as KeyframeEffect | null)?.pseudoElement === '::after'),
      );

      const { results, skipped, shown, ground } = await measureContrast(page);
      const at = await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).currentTime);
      const by = await record(`pill-${frame}`, { layout: 'desktop, pill', frame, time, measuredAt: at }, results, skipped, shown, ground);
      expect(Math.abs(at - time), 'still inside the frame window').toBeLessThan(0.4);

      expect(results.filter((r) => r.log && /rn-log-step/.test(r.label)).length, "the pill's step measured").toBe(1);
      expect(results.filter((r) => r.log).length, "the pill's line measured").toBeGreaterThanOrEqual(2);
      // Early in a step the thread is still inside the pill's rounded end (bright frame: 3 % into "Generate"), clipped by it.
      expect(results.some((r) => /thread/.test(r.label)) || skipped.some((s) => /thread/.test(s)), "the pill's thread measured, or found clipped").toBe(true);
      expect(by('text', 'large').length).toBeGreaterThanOrEqual(2);
      expect(failures(results), `contrast below the bar, the pill, ${frame} frame`).toEqual([]);
    });
  }

  test('the start, over the opening frame: the prompt, its Run key and the bar hold their contrast', async ({ page }) => {
    // Before Run the film stands on its first frame (a move into it starts the run), so the prompt has only this one.
    await open(page);
    await parkPointer(page);
    await settle(page);
    await expect(page.locator('rn-prompt')).toBeVisible();
    const { results, skipped, shown, ground } = await measureContrast(page);
    const by = await record('start', { layout: 'desktop, start', frame: 'first', time: 0 }, results, skipped, shown, ground);
    expect(results.filter((r) => /rn-prompt/.test(r.label)).length, 'prompt measured').toBeGreaterThanOrEqual(2);
    expect(results.filter((r) => /rn-play-run/.test(r.label)).length, "both Run keys' word measured").toBe(2);
    expect(by('text', 'large').length).toBeGreaterThanOrEqual(8);
    expect(by('graphics').length).toBeGreaterThanOrEqual(6);
    expect(failures(results), 'contrast below the bar at the start').toEqual([]);
  });
});

/**
 * A phone, 375 × 812, touch: the bar hangs under the picture as the player's pad (data-rn-pad), always shown, so its
 * parts stand on the pad's own ink. No pill there.
 */
test.describe('phone, 375 × 812', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: async ({ browserName }, use) => use(browserName !== 'firefox') });
  for (const { frame, time } of FRAMES) {
    test(`${frame} frame (${time} s): the pad's log line, step key, time, keys and track hold their contrast`, async ({ page }) => {
      await open(page);
      await expect(container(page)).toHaveAttribute('data-rn-pad', '');
      await parkPointer(page);
      await holdAt(page, time);
      await expect(container(page)).toHaveAttribute('data-controls-visible', '');
      await expect(page.locator('rn-log')).toHaveAttribute('data-caption', '');

      const { results, skipped, shown, ground } = await measureContrast(page);
      const by = await record(`phone-${frame}`, { layout: 'phone 375', frame, time }, results, skipped, shown, ground);
      // The log line, the step key, the time; the keys' icons; the playhead and the played track.
      expect(by('text', 'large').length, 'text runs measured').toBeGreaterThanOrEqual(4);
      expect(by('graphics').length, 'icons measured').toBeGreaterThanOrEqual(5);
      expect(results.filter((r) => r.log).length, 'log line measured').toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.label.startsWith('playhead')), 'playhead measured').toBe(true);
      expect(results.some((r) => /thread/.test(r.label)) || skipped.some((s) => /thread/.test(s)), "the pad's thread measured, or found too short").toBe(true);
      expect(failures(results), `contrast below the bar, phone, ${frame} frame`).toEqual([]);
    });
  }
});

