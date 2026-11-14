import type { Page } from '@playwright/test';
import { container, open } from './support/player';
import { BRIGHT, holdAt, localFilm, measure, parkPointer, tabKey } from './support/proof';
import { expect, test } from './support/test';

/**
 * The player with a keyboard alone: real Tab presses (Option-Tab in WebKit, as on a Mac), never .focus(), since a
 * programmatic focus does not trigger :focus-visible. At every stop the focused element is inside the player, visible,
 * and draws a ring of at least 2 px (an outline, or a box-shadow's spread) whose colour holds 3:1 against what is behind
 * it. The ring's band is photographed with the ring and without it, and compared pixel by pixel, as WCAG 2.4.13 (Focus
 * Appearance) measures it: the pixels where the ring holds 3:1 against the same pixel without it must cover at least
 * the area of a 2 px perimeter of the element. (So a ring that is clipped, covered, or the colour of the frame under it
 * fails; a ring that crosses a few brass marks of the track does not.) The worst single pixel is reported too.
 * The stops follow the player's visual order, and Escape closes the palette, the plan and Reasoning and gives the
 * focus back to their key.
 */

const RING = 3;

interface Stop {
  key: string;
  label: string;
  inPlayer: boolean;
  visible: boolean;
  ring: { kind: 'outline' | 'box-shadow' | 'overlay'; width: number; offset: number; color: string } | null;
  box: { x: number; y: number; w: number; h: number };
  radius: number;
  /** Inside a popup (the volume slider over the mute key): placed by its opener, not in the bar's rows. */
  popup: boolean;
}

/** The focused element and the ring its computed style draws. Runs in the page. */
function read(): Stop | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || el === document.documentElement) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  let ring: Stop['ring'] = null;
  const opaque = (c: string) => !/transparent|rgba\([^)]*,\s*0\)|\/\s*0\)/.test(c);
  if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && opaque(cs.outlineColor)) {
    ring = { kind: 'outline', width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset) || 0, color: cs.outlineColor };
  } else if (cs.boxShadow !== 'none') {
    // The widest outward spread among its shadows: "rgb(…) 0px 0px 0px 2px".
    for (const shadow of cs.boxShadow.split(/,(?![^(]*\))/)) {
      if (/inset/.test(shadow)) continue;
      const lengths = [...shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      const color = shadow.match(/(rgba?|color|oklch)\([^)]*\)|#[0-9a-f]+/i)?.[0] ?? '';
      const spread = lengths[3] ?? 0;
      if (spread >= 2 && opaque(color) && (!ring || spread > ring.width)) ring = { kind: 'box-shadow', width: spread, offset: 0, color };
    }
  }
  if (!ring) {
    // A ring drawn over the element's own content, inside its edge: an inset shadow on its ::after (the player's own
    // ring, run.css, drawn above its layers). Its width is the deepest inset; its colour the outermost band's.
    const after = getComputedStyle(el, '::after');
    if (after.content !== 'none' && after.boxShadow !== 'none') {
      let width = 0;
      let color = '';
      for (const shadow of after.boxShadow.split(/,(?![^(]*\))/)) {
        if (!/inset/.test(shadow)) continue;
        const lengths = [...shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
        const c = shadow.match(/(rgba?|color|oklch)\([^)]*\)|#[0-9a-f]+/i)?.[0] ?? '';
        if (!color && opaque(c)) color = c;
        width = Math.max(width, lengths[3] ?? 0);
      }
      if (width >= 2 && color) ring = { kind: 'overlay', width, offset: -width, color };
    }
  }
  const cls =
    (typeof el.className === 'string' ? el.className : '')
      .split(/\s+/)
      .filter((c) => c.startsWith('rn-') || c.startsWith('media-'))
      .slice(-1)[0] ?? '';
  const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return {
    key: `${el.localName}.${cls}`,
    label: `${name} · ${el.localName}${cls ? `.${cls}` : ''}`,
    inPlayer: !!el.closest('media-container.rn'),
    visible:
      el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
      r.width > 0 &&
      r.height > 0 &&
      r.right > 0 &&
      r.bottom > 0 &&
      r.left < innerWidth &&
      r.top < innerHeight,
    ring,
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
    radius: Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2),
    popup: !!el.closest('.media-popup, [popover]'),
  };
}

/**
 * The ring's band photographed with the ring and without it: how much of the band the ring really paints, and its
 * colour against the worst pixel of the ground behind the band. Runs in the page.
 */
async function ringContrast(args: { withRing: string; without: string; band: { outer: Stop['box']; inner: Stop['box'] }; color: string; required: number; min: number }) {
  const decode = async (png: string) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bitmap, 0, 0);
    return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
  };
  const a = await decode(args.withRing);
  const b = await decode(args.without);
  const probe = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  probe.fillStyle = args.color;
  probe.fillRect(0, 0, 1, 1);
  const [cr, cg, cb] = probe.getImageData(0, 0, 1, 1).data;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (r: number, g: number, bl: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  const ratioOf = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  const lc = lum(cr, cg, cb);
  const { outer, inner } = args.band;
  let n = 0;
  let painted = 0;
  let holding = 0;
  let worst = { ratio: Infinity, ground: '' };
  for (let y = Math.max(0, Math.round(outer.y)); y < Math.min(a.height, Math.round(outer.y + outer.h)); y++) {
    for (let x = Math.max(0, Math.round(outer.x)); x < Math.min(a.width, Math.round(outer.x + outer.w)); x++) {
      if (x >= Math.round(inner.x) && x < Math.round(inner.x + inner.w) && y >= Math.round(inner.y) && y < Math.round(inner.y + inner.h)) continue;
      const i = (y * a.width + x) * 4;
      n++;
      const changed = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) >= 12;
      if (!changed) continue;
      painted++;
      if (ratioOf(lum(a.data[i], a.data[i + 1], a.data[i + 2]), lum(b.data[i], b.data[i + 1], b.data[i + 2])) >= args.min) holding++;
      const ratio = ratioOf(lc, lum(b.data[i], b.data[i + 1], b.data[i + 2]));
      if (ratio < worst.ratio) worst = { ratio, ground: `rgb(${b.data[i]} ${b.data[i + 1]} ${b.data[i + 2]})` };
    }
  }
  return {
    painted: n ? Math.round((painted / n) * 100) / 100 : 0,
    holding,
    required: Math.round(args.required),
    ratio: Number.isFinite(worst.ratio) ? Math.round(worst.ratio * 100) / 100 : 0,
    ground: worst.ground,
  };
}

interface Checked extends Stop {
  /** Share of the ring's band that the ring changes. */
  painted: number;
  /** Pixels where the ring holds 3:1 against the same pixel without it, and the area a 2 px perimeter needs. */
  holding: number;
  required: number;
  /** The ring's colour against the worst pixel behind it. */
  ratio: number;
  ground: string;
}

/** Photographs the focused element's ring band with its ring and without, and measures it. */
async function checkRing(page: Page, stop: Stop): Promise<Checked> {
  if (!stop.ring) return { ...stop, painted: 0, holding: 0, required: 0, ratio: 0, ground: '' };
  const { ring, box } = stop;
  const gap = ring.kind === 'box-shadow' ? 0 : ring.offset;
  // The band the ring is drawn in, a pixel wider each way so a ring on a fractional position is taken whole (only the
  // pixels the ring changes count, so the margin adds none of its own).
  const outer = { x: box.x - gap - ring.width - 2, y: box.y - gap - ring.width - 2, w: box.w + 2 * (gap + ring.width + 2), h: box.h + 2 * (gap + ring.width + 2) };
  const inner = { x: box.x - gap + 2, y: box.y - gap + 2, w: box.w + 2 * gap - 4, h: box.h + 2 * gap - 4 };
  const shot = () => page.screenshot({ animations: 'disabled', caret: 'hide' });
  const withRing = await shot();
  await page.evaluate((kind) => {
    const el = document.activeElement as HTMLElement;
    if (kind === 'outline') el.style.setProperty('outline-color', 'transparent', 'important');
    else if (kind === 'box-shadow') el.style.setProperty('box-shadow', 'none', 'important');
    else {
      const off = document.createElement('style');
      off.id = 'proof-ring-off';
      off.textContent = '[data-proof-ring-off]::after { display: none !important; }';
      document.head.append(off);
      el.setAttribute('data-proof-ring-off', '');
    }
  }, ring.kind);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const without = await shot();
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    el.style.removeProperty('outline-color');
    el.style.removeProperty('box-shadow');
    el.removeAttribute('data-proof-ring-off');
    document.getElementById('proof-ring-off')?.remove();
  });
  // A 2 px thick perimeter of the element as drawn, its rounded corners included (WCAG 2.4.13's minimum area).
  const perimeter = 2 * (box.w + box.h) - (8 - 2 * Math.PI) * stop.radius;
  const required = Math.max(0, perimeter * 2 - 16);
  const m = await page.evaluate(ringContrast, { withRing: withRing.toString('base64'), without: without.toString('base64'), band: { outer, inner }, color: ring.color, required, min: RING });
  return { ...stop, ...m };
}

/** Tabs through the player from where the focus is, until it leaves the player or comes round again. */
async function walk(page: Page, browserName: string, state: string): Promise<Checked[]> {
  const stops: Checked[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(tabKey(browserName));
    const s = await page.evaluate(read);
    if (!s) break;
    if (stops.length && !s.inPlayer) break;
    if (stops.some((p) => p.key === s.key && Math.abs(p.box.x - s.box.x) < 1 && Math.abs(p.box.y - s.box.y) < 1)) break;
    stops.push(await checkRing(page, s));
    await test.info().attach(`${state}-${String(stops.length).padStart(2, '0')}`, {
      body: await page.screenshot({ clip: { x: Math.max(0, s.box.x - 12), y: Math.max(0, s.box.y - 12), width: s.box.w + 24, height: s.box.h + 24 }, animations: 'disabled' }),
      contentType: 'image/png',
    });
  }
  return stops;
}

/** Problems with the stops of one walk, one line each. */
function problems(stops: Checked[]): string[] {
  const out: string[] = [];
  for (const s of stops) {
    if (!s.inPlayer) out.push(`${s.label}: outside the player`);
    if (!s.visible) out.push(`${s.label}: not visible (box ${Math.round(s.box.w)}×${Math.round(s.box.h)} at ${Math.round(s.box.x)},${Math.round(s.box.y)})`);
    if (!s.ring) out.push(`${s.label}: no ring of 2 px or more (outline or box-shadow)`);
    else if (s.holding < s.required)
      out.push(
        `${s.label}: ring (${s.ring.kind} ${s.ring.width}px ${s.ring.color}, offset ${s.ring.offset}px) holds ${RING}:1 over ${s.holding} px², under the ${s.required} px² of a 2 px perimeter; ${Math.round(s.painted * 100)} % of its band painted, worst ${s.ratio}:1 against ${s.ground}`,
      );
  }
  return out;
}

/** The stops inside the player, in Tab order, against their order on screen: rows top to bottom, each left to right. */
function visualOrder(stops: Checked[]) {
  const keys = stops.filter((s) => s.inPlayer && !s.key.startsWith('media-container.') && !s.popup);
  const cy = (s: Checked) => s.box.y + s.box.h / 2;
  const sorted = [...keys].sort((p, q) => (Math.abs(cy(p) - cy(q)) < 12 ? p.box.x - q.box.x : cy(p) - cy(q)));
  return { tab: keys.map((s) => s.label), screen: sorted.map((s) => s.label) };
}

const summary = (stops: Checked[]) =>
  stops.map((s) => ({ stop: s.label, ring: s.ring && `${s.ring.kind} ${s.ring.width}px ${s.ring.color} offset ${s.ring.offset}`, painted: s.painted, holding: s.holding, required: s.required, worst: s.ratio, ground: s.ground }));

test.beforeEach(async ({ page }) => {
  await localFilm(page);
});

test('from the start: every Tab stop is in the player, visible, with a ring that holds 3:1, in visual order', async ({ page, browserName }, testInfo) => {
  await open(page);
  await parkPointer(page);
  const stops = await walk(page, browserName, 'start');
  const order = visualOrder(stops);
  await measure(testInfo, { state: 'start', stops: stops.length, ringless: stops.filter((s) => !s.ring).length, worstRing: Math.min(...stops.map((s) => s.ratio)), short: problems(stops), all: summary(stops), order });
  // The player, the plan, the track and the bar's keys: Run, the plan key, mute, captions, Reasoning, commands, picture in picture, fullscreen.
  expect(stops.length, 'stops walked').toBeGreaterThanOrEqual(10);
  for (const key of ['media-play-button', 'rn-step-key', 'media-mute-button', 'media-captions-button', 'rn-reasoning-key', 'rn-palette-key', 'media-fullscreen-button']) {
    expect.soft(stops.some((s) => s.key.endsWith(`.${key}`)), `${key} reached by Tab`).toBe(true);
  }
  expect(stops.some((s) => s.key.endsWith('.rn-center-play')), 'the large Run key is a pointer target only').toBe(false);
  expect.soft(problems(stops), 'stops without a visible ring').toEqual([]);
  expect(order.tab, 'Tab order follows the order on screen').toEqual(order.screen);
});

test('paused on a frame, controls up: every Tab stop has its ring, in visual order', async ({ page, browserName }, testInfo) => {
  await open(page);
  await parkPointer(page);
  await holdAt(page, BRIGHT);
  // Back to the page's start, with a real click on its margin below the player (Space started the run from there).
  const box = (await container(page).boundingBox())!;
  await page.mouse.click(8, box.y + box.height + 40);
  await parkPointer(page);
  const stops = await walk(page, browserName, 'paused');
  const order = visualOrder(stops);
  await measure(testInfo, { state: 'paused', stops: stops.length, ringless: stops.filter((s) => !s.ring).length, worstRing: Math.min(...stops.map((s) => s.ratio)), short: problems(stops), all: summary(stops), order });
  expect(stops.length, 'stops walked').toBeGreaterThanOrEqual(10);
  // Paused, the plan is a stop of its own: its steps (one stop, the arrows move in it).
  expect(stops.filter((s) => s.key.endsWith('.rn-step')).length, 'the plan is one Tab stop').toBe(1);
  expect.soft(problems(stops), 'stops without a visible ring').toEqual([]);
  expect(order.tab, 'Tab order follows the order on screen').toEqual(order.screen);
});

test('running: the controls stay up under the keyboard, and every Tab stop has its ring', async ({ page, browserName }, testInfo) => {
  await open(page);
  await parkPointer(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement).currentTime > 0.6, undefined, { timeout: 20_000 });
  await expect(container(page)).not.toHaveAttribute('data-rn-mind', /.*/, { timeout: 5_000 });
  const stops = await walk(page, browserName, 'running');
  const playing = await page.evaluate(() => !(document.querySelector('video') as HTMLVideoElement).paused);
  await measure(testInfo, { state: 'running', stops: stops.length, ringless: stops.filter((s) => !s.ring).length, worstRing: Math.min(...stops.map((s) => s.ratio)), short: problems(stops), all: summary(stops) });
  expect(playing, 'the film ran through the walk').toBe(true);
  expect(stops.length, 'stops walked').toBeGreaterThanOrEqual(10);
  expect.soft(problems(stops), 'stops without a visible ring').toEqual([]);
});

/** Presses Tab (real presses) until the focus is on `selector`. */
async function tabTo(page: Page, browserName: string, selector: string) {
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate((s) => !!document.activeElement?.matches(s), selector)) return;
    await page.keyboard.press(tabKey(browserName));
  }
  throw new Error(`Tab never reached ${selector}`);
}

const focusedOn = (page: Page, selector: string) => page.evaluate((s) => !!document.activeElement?.matches(`${s}:focus-visible`), selector);

test.describe('Escape closes what a key opened and gives the focus back to that key', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await parkPointer(page);
    await holdAt(page, BRIGHT);
    const box = (await container(page).boundingBox())!;
    await page.mouse.click(8, box.y + box.height + 40);
    await parkPointer(page);
  });

  test('the command palette', async ({ page, browserName }) => {
    await tabTo(page, browserName, '.rn-palette-key');
    await page.keyboard.press('Enter');
    await expect(page.locator('.rn-palette')).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.matches('.rn-palette-input'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.rn-palette')).toBeHidden();
    await expect.poll(() => focusedOn(page, '.rn-palette-key'), 'focus back on the palette key, with its ring').toBe(true);
  });

  test('the plan', async ({ page, browserName }) => {
    await tabTo(page, browserName, '.rn-step-key');
    // On a wide player the plan stands open from the start: closed, then opened again by its key.
    if ((await container(page).getAttribute('data-rn-plan')) !== 'closed') {
      await page.keyboard.press('Enter');
      await expect(container(page)).toHaveAttribute('data-rn-plan', 'closed');
    }
    await page.keyboard.press('Enter');
    await expect(container(page)).toHaveAttribute('data-rn-plan', 'open');
    // Into the plan (it comes before its key in the order), then Escape.
    for (let i = 0; i < 6 && !(await page.evaluate(() => !!document.activeElement?.closest('rn-plan'))); i++) await page.keyboard.press(`Shift+${tabKey(browserName)}`);
    expect(await page.evaluate(() => !!document.activeElement?.closest('rn-plan')), 'focus inside the plan').toBe(true);
    await page.keyboard.press('Escape');
    await expect(container(page), 'Escape closes the plan').toHaveAttribute('data-rn-plan', 'closed');
    await expect.poll(() => focusedOn(page, '.rn-step-key'), 'focus back on the plan key, with its ring').toBe(true);
  });

  test('Reasoning', async ({ page, browserName }) => {
    await tabTo(page, browserName, '.rn-reasoning-key');
    await page.keyboard.press('Enter');
    await expect(page.locator('.rn-reasoning-panel')).toBeVisible();
    // Into the panel: its close key is the next stop.
    await page.keyboard.press(tabKey(browserName));
    expect(await page.evaluate(() => !!document.activeElement?.closest('.rn-reasoning-panel')), 'focus inside the panel').toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.rn-reasoning-panel')).toBeHidden();
    await expect.poll(() => focusedOn(page, '.rn-reasoning-key'), 'focus back on the Reasoning key, with its ring').toBe(true);
  });
});
