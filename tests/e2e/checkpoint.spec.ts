import type { Page } from '@playwright/test';
import { failures, measureContrast, summary, worst } from './support/contrast';
import { container, open, STEPS } from './support/player';
import { FRAMES, localFilm, measure, parkPointer, tabKey } from './support/proof';
import { expect, test } from './support/test';

/**
 * Checkpoint (src/video/run/checkpoint.ts): a pause mid-run keeps a checkpoint and lays the moment out as its context
 * window. What it says, how it moves (keys, a click, a swipe), what puts it away, what it saves and links, and, over
 * the film's brightest and darkest frames, its contrast; on a phone, its targets. Its stillness under reduced motion
 * is motion.spec's.
 */

const checkpoint = (page: Page) => page.locator('rn-checkpoint');
const time = (page: Page) => page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).currentTime);

/** Runs the film with a real Space, takes it to `at` while it plays, pauses it with Space, and waits for the row to be
 * complete and the take to have finished. */
async function stopAt(page: Page, at: number): Promise<void> {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const video = document.querySelector('video') as HTMLVideoElement;
    return !video.paused && video.currentTime > 0.6;
  }, undefined, { timeout: 20_000 });
  await expect(container(page)).not.toHaveAttribute('data-rn-mind', /.*/, { timeout: 5_000 });
  await page.evaluate((t) => ((document.querySelector('video') as HTMLVideoElement).currentTime = t), at);
  await page.waitForFunction((t) => {
    const video = document.querySelector('video') as HTMLVideoElement;
    return !video.seeking && !video.paused && Math.abs(video.currentTime - t) < 0.5;
  }, at, { timeout: 20_000 });
  await page.keyboard.press('Space');
  await expect(checkpoint(page)).toBeVisible();
  await expect(checkpoint(page)).toHaveAttribute('data-ready', '', { timeout: 20_000 });
  // And the take has finished: the frame in its place, the words and keys come in.
  await page.waitForFunction(() => document.querySelector('rn-checkpoint')!.getAnimations({ subtree: true }).length === 0, undefined, { timeout: 5_000 });
}

/** The step the film is in at `t`. */
const stepAt = (t: number) => STEPS.reduce((found, s) => (t + 0.05 >= s.start ? s : found), STEPS[0]);

test.beforeEach(async ({ page }) => {
  await localFilm(page);
});

test('a pause mid-run keeps a checkpoint: where the run is, the line said there, and the moments around it', async ({ page }) => {
  await open(page);
  await parkPointer(page);
  await stopAt(page, 41);
  const at = await time(page);
  const step = stepAt(at);
  await expect(page.locator('.rn-checkpoint-word')).toHaveText('Checkpoint');
  await expect(page.locator('.rn-checkpoint-time')).toHaveText(new RegExp(`^${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}\\.\\d$`));
  await expect(page.locator('.rn-checkpoint-title')).toHaveText(step.title);
  await expect(page.locator('.rn-checkpoint-into')).toHaveText(`${(at - step.start).toFixed(1)} s into step ${STEPS.indexOf(step) + 1} of ${STEPS.length}`);
  await expect(page.locator('.rn-checkpoint-line')).toHaveText(/^“.+”$/);
  // The row: seven moments two seconds apart, the stop in the middle of it, framed.
  await expect(page.locator('.rn-checkpoint-frame')).toHaveCount(7);
  const geometry = await page.evaluate(() => {
    const rail = document.querySelector('.rn-checkpoint-rail')!.getBoundingClientRect();
    const now = document.querySelector('.rn-checkpoint-frame[data-now] .rn-checkpoint-pic')!.getBoundingClientRect();
    const plan = getComputedStyle(document.querySelector('rn-plan')!).visibility;
    return { offset: Math.abs(now.x + now.width / 2 - (rail.x + rail.width / 2)), width: now.width / rail.width, plan, wider: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(geometry.offset, 'the stop stands in the middle of the row').toBeLessThan(2);
  expect(geometry.width, 'the stop is the largest thing there').toBeGreaterThan(0.3);
  expect(geometry.plan, 'the plan steps away').toBe('hidden');
  expect(geometry.wider, 'the page does not widen').toBeLessThanOrEqual(0);
  await expect(page.locator('.rn-checkpoint-rail')).toHaveAttribute('aria-valuetext', new RegExp(`, ${step.title}$`));
});

test('the keys move through the context, a click on a frame goes to it, Escape puts it away', async ({ page, browserName }) => {
  await open(page);
  await parkPointer(page);
  await stopAt(page, 41);
  const start = await time(page);
  // Reached with a real Tab (from the bar), one stop for the whole row, with its ring.
  await page.locator('.video-controls-row .media-play-button').focus();
  let reached = false;
  for (let i = 0; i < 20 && !reached; i++) {
    await page.keyboard.press(`Shift+${tabKey(browserName)}`);
    reached = await page.evaluate(() => document.activeElement?.classList.contains('rn-checkpoint-rail') ?? false);
  }
  expect(reached, 'the row is a Tab stop').toBe(true);
  const ring = await page.locator('.rn-checkpoint-rail').evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThanOrEqual(2);

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => time(page)).toBeCloseTo(start + 2, 1);
  await expect(checkpoint(page)).toBeVisible();
  await expect(page.locator('.rn-checkpoint-rail')).toHaveAttribute('aria-valuenow', (start + 2).toFixed(1));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => time(page)).toBeCloseTo(start - 2, 1);
  expect((await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).paused)), 'still paused').toBe(true);

  // A click on the frame before the stop goes there (once the row's frames have come in: one not there yet is not
  // drawn, and not there to click).
  await expect(checkpoint(page)).toHaveAttribute('data-ready', '', { timeout: 20_000 });
  await page.locator('.rn-checkpoint-frame[data-k="-1"] .rn-checkpoint-pic').click();
  await expect.poll(() => time(page)).toBeCloseTo(start - 4, 1);
  await expect(checkpoint(page)).toBeVisible();

  await page.locator('.rn-checkpoint-rail').focus();
  await page.keyboard.press('Escape');
  await expect(checkpoint(page)).toBeHidden();
  await expect(page.locator('.video-controls-row .media-play-button')).toBeFocused();
  // Put away, it stays away: the row's last seek landing late does not bring it back.
  await page.waitForTimeout(600);
  await expect(checkpoint(page)).toBeHidden();
});

test('playing puts it away, and the next pause keeps a new one', async ({ page }) => {
  await open(page);
  await parkPointer(page);
  await stopAt(page, 20);
  await page.keyboard.press('Space');
  await expect(checkpoint(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).paused)).toBe(false);
  await page.waitForTimeout(800);
  await page.keyboard.press('Space');
  await expect(checkpoint(page)).toBeVisible();
  await expect(container(page)).toHaveAttribute('data-rn-checkpointing', '');
});

test('Save frame gives the frame as a picture, its checkpoint written under it', async ({ page }) => {
  await open(page);
  await parkPointer(page);
  await stopAt(page, 30);
  const download = page.waitForEvent('download');
  await page.locator('.rn-checkpoint-key[data-act="save"]').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^run-checkpoint-0-\d\d-\d\.png$/);
  await expect(page.locator('.rn-checkpoint-key[data-act="save"] .rn-checkpoint-key-word')).toHaveText('Saved');
});

test('Copy link gives a link that opens the film at that moment', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'reading the clipboard back needs Chromium’s clipboard permission');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await parkPointer(page);
  await stopAt(page, 30);
  const at = await time(page);
  await page.locator('.rn-checkpoint-key[data-act="link"]').click();
  await expect(page.locator('.rn-checkpoint-key[data-act="link"] .rn-checkpoint-key-word')).toHaveText('Copied');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`#t=${at.toFixed(1).replace('.', '\\.')}$`));
  await page.goto('about:blank');
  await page.goto(link);
  await expect.poll(() => time(page), { timeout: 20_000 }).toBeCloseTo(at, 0);
  await expect(container(page)).toHaveAttribute('data-rn-started', '');
});

for (const { frame, time: at } of FRAMES) {
  test(`over the ${frame} frame (${at} s), its words and keys hold their contrast`, async ({ page }) => {
    await open(page);
    await parkPointer(page);
    await stopAt(page, at);
    const { results } = await measureContrast(page);
    const own = results.filter((r) => /rn-checkpoint/.test(r.label));
    await measure(test.info(), { kind: 'checkpoint', frame, time: at, worst: summary(worst(own)), counts: own.length, all: own });
    expect(own.length, 'the checkpoint’s words and keys measured').toBeGreaterThanOrEqual(6);
    expect(failures(own), `the checkpoint over the ${frame} frame`).toEqual([]);
  });
}

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: async ({ browserName }, use) => use(browserName !== 'firefox') });

  test('the checkpoint fits the picture, its keys and its row are thumb-sized, a swipe moves it', async ({ page }) => {
    await open(page);
    await stopAt(page, 41);
    const start = await time(page);
    const sizes = await page.evaluate(() => {
      const picture = document.querySelector('media-container')!.getBoundingClientRect();
      const keys = [...document.querySelectorAll('.rn-checkpoint-key')].map((k) => k.getBoundingClientRect());
      const rail = document.querySelector('.rn-checkpoint-rail')!.getBoundingClientRect();
      const own = document.querySelector('rn-checkpoint')!.getBoundingClientRect();
      return {
        keys: keys.map((k) => [Math.round(k.width), Math.round(k.height)]),
        rail: Math.round(rail.height),
        inside: own.left >= picture.left - 0.5 && own.right <= picture.right + 0.5 && own.top >= picture.top - 0.5 && own.bottom <= picture.bottom + 0.5,
        wider: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    for (const [w, h] of sizes.keys) {
      expect(w, 'key width').toBeGreaterThanOrEqual(44);
      expect(h, 'key height').toBeGreaterThanOrEqual(44);
    }
    expect(sizes.rail, 'the row’s height').toBeGreaterThanOrEqual(44);
    expect(sizes.inside, 'inside the picture').toBe(true);
    expect(sizes.wider, 'the page does not widen').toBeLessThanOrEqual(0);
    // A swipe to the left moves the stop on.
    const r = (await page.locator('.rn-checkpoint-rail').boundingBox())!;
    await page.mouse.move(r.x + r.width * 0.75, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.25, r.y + r.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => time(page)).toBeCloseTo(start + 2, 1);
    await expect(checkpoint(page)).toBeVisible();
  });
});
