import type { Locator, Page } from '@playwright/test';
import { container, open, settle } from './support/player';
import { localFilm, measure } from './support/proof';
import { expect, test } from './support/test';

/**
 * On a phone (375 and 390 px, touch, coarse pointer), every interactive element in the player has a target of at
 * least 44 × 44 CSS px. Measured on the element that receives the tap, by hit-testing (adapted from Flipbook's
 * targets.spec.ts): from the centre of what is tapped (a slider's track, not its thumb), walk out along both axes
 * while elementFromPoint still lands on it. So an invisible hit area counts, and a part covered by something else
 * does not. Before the run, running, and with the plan, the command palette and Reasoning open (with a panel open,
 * its own targets: what it covers is not on offer while it is up).
 */

const MIN = 44;
const WIDTHS = [375, 390];

interface Hit {
  label: string;
  width: number;
  height: number;
  box: string;
  state: string;
}

/** Hit areas of every visible interactive element in the player, or in one panel of it. Runs in the page. */
function hitAreas({ state, panel }: { state: string; panel: string | null }): Hit[] {
  const SELECTOR = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="slider"]',
    '[role="option"]',
    '[role="menuitem"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])',
    // The large Run key is out of the Tab order on purpose (a11y.ts) and still a target.
    '.rn-center-play',
  ].join(', ');
  const player = document.querySelector('media-container.rn') as HTMLElement;
  const scope = panel ? (player.querySelector(panel) as HTMLElement) : player;
  const els = [...scope.querySelectorAll<HTMLElement>(SELECTOR)];
  const seen = new Set<Element>();
  const out: Hit[] = [];
  for (const el of els) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || el.closest('[inert], [hidden]')) continue;
    if (getComputedStyle(el).pointerEvents === 'none') continue;
    // What receives the tap: a slider's thumb is its track's.
    let target: HTMLElement = el;
    if (el.matches('media-slider-thumb, [role="slider"]')) target = (el.closest('media-time-slider, media-volume-slider') as HTMLElement | null) ?? el;
    if (seen.has(target)) continue;
    seen.add(target);
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = target.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const owns = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (target === hit || target.contains(hit));
    };
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
    const cls =
      (typeof target.className === 'string' ? target.className : '')
        .split(/\s+/)
        .filter((c) => c.startsWith('rn-') || c.startsWith('media-'))
        .slice(-1)[0] ?? target.localName;
    const label = `${name} · .${cls}`;
    const box = `${Math.round(r.width * 10) / 10}×${Math.round(r.height * 10) / 10}`;
    if (!owns(cx, cy)) {
      const over = document.elementFromPoint(cx, cy);
      out.push({ label: `${label} (covered at its centre by ${over ? `${over.localName}.${String(over.className).split(' ')[0]}` : 'nothing'})`, width: 0, height: 0, box, state });
      continue;
    }
    const reach = (dx: number, dy: number) => {
      let n = 0;
      while (n < 400 && owns(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
      return n;
    };
    out.push({ label, width: reach(-1, 0) + reach(1, 0) + 1, height: reach(0, -1) + reach(0, 1) + 1, box, state });
  }
  return out;
}

const measureState = (page: Page, state: string, panel: string | null = null) => page.evaluate(hitAreas, { state, panel });

/** Taps a key and waits for what it opens. */
async function tapOpen(key: Locator, opened: Locator) {
  await key.tap();
  await expect(opened).toBeVisible();
  // Measured once it has landed: mid-arrival it is still partly transparent.
  await settle(key.page());
}

for (const width of WIDTHS) {
  test.describe(`${width} px`, () => {
    // The battery's own context (support/test.ts: every film muted), as a phone: touch, a coarse pointer, and a mobile
    // viewport where the engine has one (Playwright's Firefox has no mobile emulation: touch alone).
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: async ({ browserName }, use) => use(browserName !== 'firefox') });
    test(`touch: every target in the player is at least 44 × 44, before and while running, and in the plan, the palette and Reasoning`, async ({ page }, testInfo) => {
      await localFilm(page);
      await open(page);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'the context has a coarse pointer').toBe(true);
      await expect(container(page), 'the bar hangs under the picture as the pad').toHaveAttribute('data-rn-pad', '');

      const hits: Hit[] = [];
      hits.push(...(await measureState(page, 'start')));

      // Run, by a tap on the large key; measured running, the controls up (the pad is always shown).
      await page.locator('.rn-center-play').tap();
      await page.waitForFunction(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return !video.paused && video.currentTime > 0.6;
      }, undefined, { timeout: 20_000 });
      await expect(container(page)).not.toHaveAttribute('data-rn-mind', /.*/, { timeout: 5_000 });
      // The pad is always shown: no controls to wake.
      await expect(page.locator('.video-controls-bottom')).toBeVisible();
      await settle(page);
      const running = await measureState(page, 'running');
      expect((await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).paused)), 'measured while running').toBe(false);
      hits.push(...running);

      // The panels, each opened by a tap on its key, measured on their own targets, closed by their own key.
      await tapOpen(page.locator('.rn-step-key'), page.locator('rn-plan .rn-step').first());
      hits.push(...(await measureState(page, 'plan open', 'rn-plan')));
      await page.locator('.rn-step-key').tap();
      await expect(container(page)).toHaveAttribute('data-rn-plan', 'closed');

      await tapOpen(page.locator('.rn-palette-key'), page.locator('.rn-palette'));
      hits.push(...(await measureState(page, 'palette open', '.rn-palette')));
      await page.locator('.rn-palette-esc').tap();
      await expect(page.locator('.rn-palette')).toBeHidden();

      // Reasoning, where the phone's bar has its key (at these widths it may give the room to the others).
      const reasoning = await page.locator('.rn-reasoning-key').isVisible();
      if (reasoning) {
        await tapOpen(page.locator('.rn-reasoning-key'), page.locator('.rn-reasoning-panel'));
        hits.push(...(await measureState(page, 'Reasoning open', '.rn-reasoning-panel')));
        await page.locator('.rn-reasoning-close').tap();
        await expect(page.locator('.rn-reasoning-panel')).toBeHidden();
      }

      const small = hits.filter((h) => h.width < MIN || h.height < MIN);
      const smallest = hits.reduce((a, b) => (Math.min(b.width, b.height) < Math.min(a.width, a.height) ? b : a));
      await measure(testInfo, { width, smallest, count: hits.length, reasoningKey: reasoning, small, all: hits });

      // Sanity floor: the bar's keys and the track at the start and running; the plan's five steps; the palette's
      // field, close key and commands; Reasoning's close key.
      const per = (state: string) => hits.filter((h) => h.state === state).length;
      expect(per('start'), 'targets measured at the start').toBeGreaterThanOrEqual(7);
      expect(per('running'), 'targets measured running').toBeGreaterThanOrEqual(7);
      expect(per('plan open'), 'targets measured in the plan').toBeGreaterThanOrEqual(5);
      expect(per('palette open'), 'targets measured in the palette').toBeGreaterThanOrEqual(8);
      if (reasoning) expect(per('Reasoning open'), 'targets measured in Reasoning').toBeGreaterThanOrEqual(1);
      expect(
        small.map((h) => `${h.width}×${h.height} (box ${h.box}) ${h.label} [${h.state}]`),
        `targets under ${MIN} px at ${width}`,
      ).toEqual([]);
    });
  });
}
