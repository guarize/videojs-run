import { clickPage, container, DURATION, media, open, pageFocused, run, runAndHold } from './support/player';
import { expect, test } from './support/test';

/**
 * What any player must do, done through the skin with real clicks and key presses: play and stop, seek, time,
 * sound, fullscreen, captions.
 */

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  test.info().annotations.push({ type: 'source', description: (await media(page)).src });
});

// A thrown error anywhere is a failure of the skin, whatever the test did.
test.afterEach(() => {
  expect(errors, 'no uncaught errors in the page').toEqual([]);
});

test('loads, and the large Run key plays the film', async ({ page }) => {
  const state = await media(page);
  expect(state.paused).toBe(true);
  expect(state.muted, 'the battery mutes every film').toBe(true);
  expect(Math.round(state.duration)).toBe(DURATION);
  await expect(page.locator('rn-prompt')).toBeVisible();
  const key = page.locator('.rn-center-play');
  await expect(key).toBeVisible();
  await expect(key).toHaveAttribute('aria-label', 'Run');
  await key.click();
  await expect.poll(async () => (await media(page)).time, { timeout: 20_000 }).toBeGreaterThan(1);
  expect((await media(page)).paused).toBe(false);
  await expect(container(page)).toHaveAttribute('data-rn-started', '');
  await expect(page.locator('rn-prompt')).toBeHidden();
});

test('plays and stops by click on the bar key and by Space from the page', async ({ page }) => {
  const play = page.locator('.video-controls-start media-play-button');
  await play.click();
  await expect.poll(async () => (await media(page)).paused, { timeout: 20_000 }).toBe(false);
  await expect(play).toHaveAttribute('aria-label', 'Stop');
  await play.click();
  await expect.poll(async () => (await media(page)).paused).toBe(true);
  await expect(play).toHaveAttribute('aria-label', 'Run');

  await clickPage(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await media(page)).paused).toBe(false);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await media(page)).paused).toBe(true);
  expect(await pageFocused(page), 'Space took nothing to focus').toBe(true);
});

test('seeks by clicking the time slider and by the arrow keys', async ({ page }) => {
  await runAndHold(page, 10);
  const slider = page.locator('media-time-slider');
  const box = (await slider.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  const half = (await media(page)).duration / 2;
  await expect.poll(async () => (await media(page)).time).toBeGreaterThan(half - 3);
  expect((await media(page)).time).toBeLessThan(half + 3);

  // The arrows from the page, with nothing focused, go to the player (a11y.ts).
  await clickPage(page);
  const before = (await media(page)).time;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await media(page)).time).toBeGreaterThan(before + 2);
  const ahead = (await media(page)).time;
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await media(page)).time).toBeLessThan(ahead - 4);
});

test('shows the time: where the film is and how long it runs', async ({ page }) => {
  await runAndHold(page, 20.4);
  await expect(page.locator('.media-time-current-value')).toHaveText('0:20');
  await expect(page.locator('.media-time-duration-value')).toHaveText('1:18');
  await expect(page.locator('.media-time-current-value')).toBeVisible();
  await expect(page.locator('.media-time-duration-value')).toBeVisible();
});

test('mutes and unmutes, and sets the volume by keys and by its slider', async ({ page }) => {
  const mute = page.locator('media-mute-button');
  await expect(mute).toHaveAttribute('aria-label', 'Unmute');
  await mute.click();
  await expect.poll(async () => (await media(page)).muted).toBe(false);
  await expect(mute).toHaveAttribute('aria-label', 'Mute');
  await mute.click();
  await expect.poll(async () => (await media(page)).muted).toBe(true);

  // Down and up, from the page.
  await clickPage(page);
  const start = (await media(page)).volume;
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await media(page)).volume).toBeLessThan(start - 0.05);
  const lower = (await media(page)).volume;
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await media(page)).volume).toBeGreaterThan(lower);

  // The slider opens over the mute key on hover; a click a quarter of the way up sets about a quarter.
  await mute.hover();
  const slider = page.locator('media-volume-slider');
  await expect(slider).toBeVisible();
  const box = (await slider.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75);
  await expect.poll(async () => (await media(page)).volume).toBeLessThan(0.4);
  expect((await media(page)).volume).toBeGreaterThan(0.1);
  await page.evaluate(() => ((document.querySelector('video') as HTMLVideoElement).muted = true));
});

test('the fullscreen key fills the screen, or the window, and gives it back', async ({ page }) => {
  await runAndHold(page, 20);
  const key = page.locator('media-fullscreen-button');
  const filled = () =>
    page.evaluate(() => {
      const c = document.querySelector('media-container')!;
      return document.fullscreenElement === c || c.hasAttribute('data-rn-fill');
    });
  await key.click();
  await expect.poll(filled, { message: 'in fullscreen or filling the window' }).toBe(true);
  await expect(key).toHaveAttribute('aria-label', 'Exit fullscreen');
  await key.click();
  await expect.poll(filled, { message: 'back in the page' }).toBe(false);
  await expect(key).toHaveAttribute('aria-label', 'Enter fullscreen');
});

test('the captions key turns the captions off and on, and C from the page does too', async ({ page }) => {
  await runAndHold(page, 5);
  const key = page.locator('media-captions-button');
  expect((await media(page)).captions).toBe('showing');
  await expect(key).toHaveAttribute('aria-label', 'Disable captions');
  await key.click();
  await expect.poll(async () => (await media(page)).captions).not.toBe('showing');
  await expect(key).toHaveAttribute('aria-label', 'Enable captions');
  await key.click();
  await expect.poll(async () => (await media(page)).captions).toBe('showing');

  await clickPage(page);
  await page.keyboard.press('c');
  await expect.poll(async () => (await media(page)).captions).not.toBe('showing');
  await page.keyboard.press('c');
  await expect.poll(async () => (await media(page)).captions).toBe('showing');
});

test('Space runs from the page before the first play, and the log line follows the captions', async ({ page }) => {
  await clickPage(page);
  await run(page, 4.2);
  await expect(page.locator('rn-log .rn-log-line')).toContainText('Mapping each word to a vector', { timeout: 5_000 });
});
