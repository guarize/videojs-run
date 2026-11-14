import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { container, media, open, run } from './support/player';
import { expect, test } from './support/test';

/** axe, WCAG 2.0 and 2.1 A and AA, on the page: before the run, and running with the controls up. */
const scan = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`);
};

// Defect (WCAG 2.5.3 Label in Name, axe label-content-name-mismatch): the plan key (.rn-step-key, run.ts
// RnStepKeyElement) is named "Plan, 5 steps, ready" while it shows "5" and "steps, ready" in two spans; each step
// (.rn-step, RnPlanElement) shows its start time ("0:16") that its name ("…, at 16 seconds, pending") doesn't hold.
test('no violations at the start: the prompt and its Run key', async ({ page }) => {
  await open(page);
  expect(await scan(page)).toEqual([]);
});

test('no violations while running, with the controls up', async ({ page }) => {
  await open(page);
  await run(page, 1);
  const box = (await container(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await expect(container(page)).toHaveAttribute('data-controls-visible', '');
  expect((await media(page)).paused).toBe(false);
  // Once the log line's words have come in (each arrives from transparent; a scan mid-arrival measures a fade).
  await page.waitForFunction(() => (document.querySelector('rn-log')?.getAnimations({ subtree: true }).length ?? 0) === 0);
  expect(await scan(page)).toEqual([]);
});
