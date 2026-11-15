import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { container, open } from './support/player';
import { loaded, localFilm, measure, parkPointer } from './support/proof';
import { expect, test } from './support/test';

/**
 * Reduced motion removes the travel, never the information. With `prefers-reduced-motion: reduce`, each still state
 * (the start, Run pressed then paused, the plan open, the palette open, Reasoning open, the end report) is
 * photographed twice, 800 ms apart, with the pointer parked outside the player, the caret hidden and the film paused,
 * and the two must be byte-identical. And the network Run draws from the prompt (mind.ts, `data-rn-mind`, a canvas)
 * never runs: from page load through Run, `data-rn-mind` is never set, its canvas is never drawn on, and no
 * animation runs on it.
 */
test.use({ reducedMotion: 'reduce' });

/** Records, from the first script on, every sign of the network: the attribute, a draw on its canvas, an animation. */
const watchMind = () => {
  const seen = { attribute: 0, draws: 0, animations: 0, frames: 0 };
  (window as unknown as { __mind: typeof seen }).__mind = seen;
  new MutationObserver((records) => {
    for (const r of records) if ((r.target as Element).hasAttribute?.('data-rn-mind')) seen.attribute++;
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-rn-mind'] });
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    if (this.classList.contains('rn-mind-canvas')) seen.draws++;
    return (getContext as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof getContext;
  const look = () => {
    seen.frames++;
    const mind = document.querySelector('rn-mind');
    if (mind && (mind.getAnimations({ subtree: true }).length || mind.hasAttribute('data-on'))) seen.animations++;
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
};

const mind = (page: Page) => page.evaluate(() => (window as unknown as { __mind: { attribute: number; draws: number; animations: number; frames: number } }).__mind);

const write = async (path: string, body: Buffer) => {
  await writeFile(path, body);
  return path;
};

/** Two photographs 800 ms apart, byte for byte, the film paused and loaded, nothing hovered, the caret hidden. */
async function still(page: Page, state: string): Promise<boolean> {
  expect(await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).paused), `${state}: the film is paused`).toBe(true);
  await parkPointer(page);
  await loaded(page);
  // Under reduced motion a state arrives at once; one frame for it to be painted.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const a = await page.screenshot({ caret: 'hide' });
  await page.waitForTimeout(800);
  const b = await page.screenshot({ caret: 'hide' });
  const same = a.equals(b);
  if (!same) {
    const info = test.info();
    const slug = state.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    await info.attach(`${slug}-a`, { path: await write(info.outputPath(`${slug}-a.png`), a), contentType: 'image/png' });
    await info.attach(`${slug}-b`, { path: await write(info.outputPath(`${slug}-b.png`), b), contentType: 'image/png' });
  }
  expect.soft(same, `${state}: two photographs 800 ms apart are identical`).toBe(true);
  return same;
}

/** Opens Reasoning: by its key where the bar has one, else by the palette's command (typed, then Enter). */
async function openReasoning(page: Page) {
  const key = page.locator('.rn-reasoning-key');
  if (await key.isVisible()) await key.click();
  else {
    await page.keyboard.press('Control+k');
    await expect(page.locator('.rn-palette')).toBeVisible();
    await page.keyboard.type('reasoning');
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('.rn-reasoning-panel')).toBeVisible();
}

for (const layout of [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'phone', viewport: { width: 375, height: 812 }, touch: true },
] as const) {
  test.describe(layout.name, () => {
    test.use({ viewport: layout.viewport, hasTouch: layout.touch });

    test('every still state is still, and the network Run draws never runs', async ({ page }, testInfo) => {
      await page.addInitScript(watchMind);
      await localFilm(page);
      await open(page);
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      const results: Record<string, boolean> = {};

      results.start = await still(page, 'start');

      // Run pressed (a real Space from the page), the film under way, then paused (Space again).
      await page.keyboard.press('Space');
      await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement).currentTime > 1.2, undefined, { timeout: 20_000 });
      await page.keyboard.press('Space');
      await expect.poll(() => page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).paused)).toBe(true);
      await expect(container(page)).toHaveAttribute('data-rn-started', '');
      const network = await mind(page);
      // Paused mid-run, the checkpoint lays out its context window: photographed once its frames have all come in
      // (their arrival is content, not motion; under reduced motion nothing of it moves).
      await expect(page.locator('rn-checkpoint')).toBeVisible();
      await expect(page.locator('rn-checkpoint')).toHaveAttribute('data-ready', '', { timeout: 20_000 });
      expect(await page.locator('rn-checkpoint').evaluate((el) => el.getAnimations({ subtree: true }).length), 'animations in the checkpoint').toBe(0);
      results.paused = await still(page, 'Run pressed, then paused: the checkpoint');

      // The plan, opened by its key (on a wide player it stands open: closed, then opened again).
      const stepKey = page.locator('.rn-step-key');
      if ((await container(page).getAttribute('data-rn-plan')) !== 'closed') await stepKey.click();
      await expect(container(page)).toHaveAttribute('data-rn-plan', 'closed');
      await stepKey.click();
      await expect(container(page)).toHaveAttribute('data-rn-plan', 'open');
      await expect(page.locator('rn-plan .rn-step').first()).toBeVisible();
      results.plan = await still(page, 'the plan open');
      await stepKey.click();
      await expect(container(page)).toHaveAttribute('data-rn-plan', 'closed');

      // The palette, from the keyboard (focus is on the plan key, in the player).
      await page.keyboard.press('Control+k');
      await expect(page.locator('.rn-palette')).toBeVisible();
      results.palette = await still(page, 'the palette open');
      await page.keyboard.press('Escape');
      await expect(page.locator('.rn-palette')).toBeHidden();

      await openReasoning(page);
      results.reasoning = await still(page, 'Reasoning open');
      await page.locator('.rn-reasoning-close').click();
      await expect(page.locator('.rn-reasoning-panel')).toBeHidden();

      // The end: the last moment played through to the report.
      await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        video.currentTime = video.duration - 0.4;
        return video.play();
      });
      await expect(container(page)).toHaveAttribute('data-rn-done', '', { timeout: 10_000 });
      await expect.poll(() => page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).ended)).toBe(true);
      await expect(page.locator('rn-done')).toBeVisible();
      results.report = await still(page, 'the end report');

      const after = await mind(page);
      await measure(testInfo, { layout: layout.name, still: results, mindThroughRun: network, mindAtEnd: after });
      expect(network.frames, 'the watch ran from load through Run').toBeGreaterThan(10);
      expect(network.attribute, 'data-rn-mind set, from load through Run').toBe(0);
      expect(network.draws, 'draws on the network canvas, from load through Run').toBe(0);
      expect(network.animations, 'frames with the network running, from load through Run').toBe(0);
      expect(after.attribute + after.draws + after.animations, 'and never later').toBe(0);
    });
  });
}
