import { container, media, open } from './support/player';
import { expect, test } from './support/test';

/**
 * A phone: 390×844, touch, coarse pointer (Firefox has no mobile emulation in Playwright, so it gets touch alone).
 */
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: async ({ browserName }, use) => use(browserName !== 'firefox'),
});

test.describe('phone', () => {
  test('the large Run key is not covered, and a tap on it runs the film', async ({ page }) => {
    await open(page);
    const key = page.locator('.rn-center-play');
    await expect(key).toBeVisible();
    const box = (await key.boundingBox())!;
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const key = document.querySelector('.rn-center-play');
      return { ok: !!el && !!key && (el === key || key.contains(el)), what: el ? `${el.localName}.${el.className}` : 'none' };
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(hit.ok, `at the key's centre: ${hit.what}`).toBe(true);
    await key.tap();
    await expect.poll(async () => (await media(page)).time, { timeout: 20_000 }).toBeGreaterThan(0.5);
    await expect(container(page)).toHaveAttribute('data-rn-started', '');
  });

  test('the bar hangs under the picture, covering none of it, and every key on it fits inside the player', async ({ page }) => {
    await open(page);
    // The pad is there from the first paint, so nothing moves when the run starts.
    await expect(container(page)).toHaveAttribute('data-rn-pad', '');
    const before = await page.locator('.video-controls-bottom').boundingBox();
    await page.locator('.rn-center-play').tap();
    await expect.poll(async () => (await media(page)).time, { timeout: 20_000 }).toBeGreaterThan(0.5);
    await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).pause());
    expect(await page.locator('.video-controls-bottom').boundingBox(), 'the pad, before and after the run starts').toEqual(before);
    const cover = await page.evaluate(() => {
      const c = document.querySelector('media-container')!.getBoundingClientRect();
      const b = document.querySelector('.video-controls-bottom')!.getBoundingClientRect();
      return Math.max(0, c.bottom - b.top);
    });
    expect(cover, 'px of the picture under the bar').toBe(0);
    const out = await page.evaluate(() => {
      const box = document.querySelector('media-container')!.getBoundingClientRect();
      const pad = Number.parseFloat(getComputedStyle(document.querySelector('media-container')!).marginBottom) || 0;
      // The player is the picture and the pad under it: one card.
      const c = { left: box.left, right: box.right, top: box.top, bottom: box.bottom + pad };
      const parts = [document.querySelector('.video-controls-bottom')!, ...document.querySelectorAll('.video-controls-row .media-button, .video-controls-row button, media-time-slider')];
      return parts
        .filter((el) => (el as HTMLElement).checkVisibility?.() ?? true)
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5))
        .map(({ el, r }) => `${el.localName}.${el.className} ${Math.round(r.left)}–${Math.round(r.right)} × ${Math.round(r.top)}–${Math.round(r.bottom)} (player ${Math.round(c.left)}–${Math.round(c.right)} × ${Math.round(c.top)}–${Math.round(c.bottom)})`);
    });
    expect(out, 'parts outside the player').toEqual([]);
  });

  for (const width of [360, 390]) {
    test(`no horizontal scroll at ${width} px, before and after the run starts`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow(), 'before the run').toBeLessThanOrEqual(0);
      await page.locator('.rn-center-play').tap();
      await expect.poll(async () => (await media(page)).time, { timeout: 20_000 }).toBeGreaterThan(0.5);
      await page.locator('.rn-step-key').tap();
      expect(await overflow(), 'running, the plan opened').toBeLessThanOrEqual(0);
    });
  }
});
