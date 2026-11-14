import type { Page } from '@playwright/test';

/**
 * Contrast measured the way the standard asks: on the composited pixels behind each element, never on the token file
 * (adapted from Flipbook's tests/e2e/support/contrast.ts).
 *
 * Two photographs of the page are taken with nothing moved: as it is ("shown"), and with every measured part made
 * invisible ("ground"), so the ground is exactly what the browser composited under them (the bar's ink, a key's
 * fill, a card, the film).
 * - Text and SVG icons: the element's own colour (with its alpha and every ancestor's opacity) is composited over each
 *   ground pixel in its box; the worst pixel decides.
 * - Marks drawn by CSS (a step's ring, the Reasoning diamond, the pill's thread) and by canvas (the track's word marks
 *   and step diamonds, tokens.ts), whose colour no single property holds: each mark is read from the two photographs,
 *   its strongest pixel ("shown") against the same pixel of the ground. A mark fails when even its core does not hold.
 * - The playhead: its colour against the pixels right beside it, both sides of each row, in the shown photograph
 *   (what an eye sees next to it: its own ink halo, then the track); the worst row decides.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Rgba = [number, number, number, number];

export interface Candidate {
  kind: 'text' | 'icon';
  label: string;
  color: Rgba;
  rects: Box[];
  size: number;
  large: boolean;
  log: boolean;
}

export interface Glyph {
  label: string;
  box: Box;
}

export interface Track {
  box: Box;
  /** The playhead's centre: marks left of it are played. */
  head: number;
}

export interface Thumb {
  box: Box;
  color: string;
}

export type Kind = 'text' | 'large' | 'graphics' | 'boundary' | 'unplayed';

export interface Result {
  kind: Kind;
  label: string;
  ratio: number;
  pixels: number;
  log: boolean;
  size: number;
  ground: string;
  color: string;
}

/** Marks every visible text run, icon, CSS glyph and the track in the player, and returns what to measure. Runs in the page. */
export function mark(): { candidates: Candidate[]; glyphs: Glyph[]; track: Track | null; thumb: Thumb | null; thread: Box | null; skipped: string[] } {
  const root = document.querySelector('media-container.rn') as HTMLElement;
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  // Any CSS colour (oklch, color-mix, …) normalised by the browser itself.
  const rgba = (css: string): Rgba => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const opacity = (el: Element) => {
    let o = 1;
    for (let n: Element | null = el; n; n = n.parentElement ?? ((n.getRootNode() as ShadowRoot).host ?? null)) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const hiddenAway = (el: Element) => {
    for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (cs.clip.startsWith('rect(') || /inset\(50%/.test(cs.clipPath)) return true;
      if (cs.overflow !== 'visible' && (r.width <= 2 || r.height <= 2)) return true;
    }
    return false;
  };
  const visible = (el: Element) =>
    el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !el.closest('[inert], [hidden]') && !hiddenAway(el);
  const name = (el: Element) => {
    const control = el.closest('[aria-label], button, [role="button"]');
    const cls =
      (el.closest('[class]')?.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((c) => c.startsWith('rn-') || c.startsWith('media-'))
        .slice(-1)[0] ?? el.localName;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
    const owner = control?.getAttribute('aria-label');
    return `${text || owner || '(icon)'} · .${cls}${owner && text ? ` in "${owner.slice(0, 28)}"` : ''}`;
  };
  const inView = (r: DOMRect) => r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  const box = (r: DOMRect): Box => ({ x: r.x, y: r.y, w: r.width, h: r.height });

  const candidates: Candidate[] = [];
  const skipped: string[] = [];

  // Text: every element that holds a visible text run.
  const runs = new Map<Element, Text[]>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.data.trim() || !n.parentElement) continue;
    if (n.parentElement.closest('script, style, template, video, track')) continue;
    const list = runs.get(n.parentElement) ?? [];
    list.push(n);
    runs.set(n.parentElement, list);
  }
  const range = document.createRange();
  for (const [el, nodes] of runs) {
    if (!visible(el)) continue;
    const rects: Box[] = [];
    for (const node of nodes) {
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width >= 3 && r.height >= 6 && inView(r)) rects.push(box(r));
    }
    if (!rects.length) continue;
    const cs = getComputedStyle(el);
    const color = rgba(cs.webkitTextFillColor || cs.color);
    color[3] *= opacity(el);
    if (color[3] < 0.05) {
      skipped.push(`${name(el)} (transparent: text held unseen for its place)`);
      continue;
    }
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    el.setAttribute('data-audit', 'text');
    candidates.push({
      kind: 'text',
      label: name(el),
      color,
      rects,
      size,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      log: !!el.closest('rn-log'),
    });
  }

  // Icons: every visible SVG (Video.js's <media-icon> draws its own; the run's keys draw theirs in the markup).
  for (const svg of root.querySelectorAll('svg')) {
    if (svg.closest('.rn-step-mark')) continue; // a step's tick is part of its mark, measured as a glyph below
    if (!visible(svg)) continue;
    const r = svg.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || !inView(r)) continue;
    const shape = svg.querySelector('path, circle, rect, line, polyline, polygon, ellipse') ?? svg;
    const cs = getComputedStyle(shape);
    const paint = cs.stroke && cs.stroke !== 'none' ? cs.stroke : cs.fill;
    const color = rgba(paint);
    color[3] *= opacity(shape);
    if (color[3] < 0.05) continue;
    svg.setAttribute('data-audit', 'icon');
    candidates.push({ kind: 'icon', label: name(svg), color, rects: [box(r)], size: r.height, large: false, log: false });
  }

  // Marks drawn by CSS.
  const glyphs: Glyph[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('.rn-step-mark, .rn-reasoning-glyph')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (!inView(r) || r.width < 4) continue;
    el.setAttribute('data-audit', 'glyph');
    const owner = el.closest('.rn-step') ? `step "${el.closest('.rn-step')!.querySelector('.rn-step-title')?.textContent}" (${el.closest('.rn-step')!.getAttribute('data-state')})` : 'Reasoning';
    glyphs.push({ label: `${owner} · .${el.classList[0]}`, box: box(r) });
  }

  // The track (tokens.ts's canvas) and the playhead.
  const tokens = root.querySelector('.rn-tokens-canvas');
  const thumbEl = root.querySelector<HTMLElement>('.media-time-slider-thumb');
  let track: Track | null = null;
  let thumb: Thumb | null = null;
  if (tokens && visible(tokens) && thumbEl && visible(thumbEl)) {
    const t = thumbEl.getBoundingClientRect();
    track = { box: box(tokens.getBoundingClientRect()), head: t.x + t.width / 2 };
    thumb = { box: box(t), color: getComputedStyle(thumbEl).backgroundColor };
    tokens.setAttribute('data-audit', 'canvas');
  }

  // The step's thread, the bar's ::after: along the pill's foot (the controls away, a line being said), or along the
  // top of a phone's pad, where the pad meets the picture (data-rn-pad). Its brass part is the progress.
  const bottom = root.querySelector('.video-controls-bottom');
  const content = root.querySelector('.video-controls-content');
  let thread: Box | null = null;
  if (bottom && root.hasAttribute('data-rn-pad')) {
    const after = getComputedStyle(bottom, '::after');
    const r = bottom.getBoundingClientRect();
    const progress = Number(getComputedStyle(root).getPropertyValue('--rn-run-progress') || 0);
    if (after.content !== 'none' && after.display !== 'none') {
      thread = { x: r.x, y: r.y, w: r.width * progress - 1, h: parseFloat(after.height) };
      if (thread.w < 4) {
        skipped.push(`the pad's thread (${Math.round(progress * 100)} % of the step: too short to measure)`);
        thread = null;
      }
    }
  } else if (bottom && content && !content.hasAttribute('data-visible')) {
    const after = getComputedStyle(bottom, '::after');
    if (after.content !== 'none' && after.display !== 'none' && rgba(after.backgroundColor)[3] > 0) {
      const r = bottom.getBoundingClientRect();
      // Only the part clear of the pill's rounded ends: inside them the thread is clipped by the pill's own curve.
      const radius = Math.min(parseFloat(getComputedStyle(bottom).borderBottomLeftRadius) || 0, r.height / 2);
      const progress = Number(getComputedStyle(root).getPropertyValue('--rn-run-progress') || 0);
      const right = Math.min(r.x + r.width * progress, r.right - radius);
      thread = { x: r.x + radius, y: r.bottom - parseFloat(after.height), w: right - (r.x + radius), h: parseFloat(after.height) };
      if (thread.w < 4) {
        skipped.push(`the pill's thread (${Math.round(progress * 100)} % of the step, ${Math.round(r.width * progress)} px: inside the pill's rounded end, clipped)`);
        thread = null;
      }
    }
  }
  return { candidates, glyphs, track, thumb, thread, skipped };
}

/** Hides what was marked, without moving anything, so the photograph shows only the ground. */
export const HIDE = `
[data-audit="text"], [data-audit="text"] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; transition: none !important; animation: none !important; }
[data-audit="icon"], [data-audit="glyph"], [data-audit="canvas"] { visibility: hidden !important; transition: none !important; }
.rn .video-controls-bottom::after { visibility: hidden !important; }
.rn .media-time-slider-thumb { visibility: hidden !important; }
`;

/** Measures every part from the two photographs. Runs in the page. */
export async function analyse(args: {
  shown: string;
  ground: string;
  candidates: Candidate[];
  glyphs: Glyph[];
  track: Track | null;
  thumb: Thumb | null;
  thread: Box | null;
}): Promise<Result[]> {
  const decode = async (png: string) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bitmap, 0, 0);
    return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
  };
  const shown = await decode(args.shown);
  const ground = await decode(args.ground);
  const { width, height } = ground;
  const scale = width / innerWidth;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratioOf = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const at = (img: Uint8ClampedArray, i: number) => [img[i], img[i + 1], img[i + 2]] as [number, number, number];
  const index = (x: number, y: number) => (y * width + x) * 4;
  /** Device pixels of a CSS box; `inset` CSS px in from each side, so anti-aliased box edges don't count as ground. */
  const pixels = function* (b: Box, inset = 1) {
    const x0 = Math.max(0, Math.ceil((b.x + inset) * scale));
    const y0 = Math.max(0, Math.ceil((b.y + inset) * scale));
    const x1 = Math.min(width, Math.floor((b.x + b.w - inset) * scale));
    const y1 = Math.min(height, Math.floor((b.y + b.h - inset) * scale));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) yield index(x, y);
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const results: Result[] = [];

  // Text and icons: their own colour composited over every ground pixel in their box.
  for (const c of args.candidates) {
    const [cr, cg, cb, a] = c.color;
    let worst = { ratio: Infinity, i: 0 };
    let n = 0;
    for (const rect of c.rects) {
      for (const i of pixels(rect)) {
        const g = at(ground.data, i);
        const t = [cr * a + g[0] * (1 - a), cg * a + g[1] * (1 - a), cb * a + g[2] * (1 - a)] as const;
        const ratio = ratioOf(lum(t[0], t[1], t[2]), lum(...g));
        n++;
        if (ratio < worst.ratio) worst = { ratio, i };
      }
    }
    if (!n) continue;
    results.push({
      kind: c.kind === 'icon' ? 'graphics' : c.large ? 'large' : 'text',
      label: c.label,
      ratio: r2(worst.ratio),
      pixels: n,
      log: c.log,
      size: c.size,
      ground: hex(...at(ground.data, worst.i)),
      color: `${hex(cr, cg, cb)}${a < 1 ? ` @${a.toFixed(2)}` : ''}`,
    });
  }

  /** The strongest pixel of a drawn mark against the same pixel of the ground, over the pixels the mark changed. */
  const core = (b: Box, inset = 0) => {
    let best = { ratio: 0, i: -1 };
    let n = 0;
    for (const i of pixels(b, inset)) {
      const s = at(shown.data, i);
      const g = at(ground.data, i);
      if (Math.abs(s[0] - g[0]) + Math.abs(s[1] - g[1]) + Math.abs(s[2] - g[2]) < 6) continue;
      n++;
      const ratio = ratioOf(lum(...s), lum(...g));
      if (ratio > best.ratio) best = { ratio, i };
    }
    return { ...best, n };
  };
  const coreResult = (kind: Kind, label: string, b: Box, inset = 0): Result | null => {
    const c = core(b, inset);
    if (c.i < 0) return null;
    return { kind, label, ratio: r2(c.ratio), pixels: c.n, log: false, size: b.h, ground: hex(...at(ground.data, c.i)), color: hex(...at(shown.data, c.i)) };
  };

  for (const g of args.glyphs) {
    const r = coreResult('graphics', g.label, g.box);
    if (r) results.push(r);
  }
  if (args.thread) {
    const r = coreResult('graphics', "the step's thread (its progress) · .video-controls-bottom::after", args.thread);
    if (r) results.push(r);
  }

  // The track: each word mark (a column of changed pixels in the band of the line) and each step's diamond (below
  // it), one result per mark; played marks and reached diamonds are the track's edge, the rest are reported.
  if (args.track) {
    const { box, head } = args.track;
    const mid = box.y + box.h / 2;
    const bands = [
      { what: 'word mark', y0: mid - 2, y1: mid + 2 },
      { what: 'step diamond', y0: mid + 7, y1: mid + 12 },
    ];
    for (const band of bands) {
      const y0 = Math.max(0, Math.round(band.y0 * scale));
      const y1 = Math.min(height, Math.round(band.y1 * scale));
      let run: { x0: number; best: { ratio: number; i: number } } | null = null;
      const close = (x: number) => {
        if (!run) return;
        const cx = (run.x0 + x) / 2 / scale;
        const played = cx < head - 2;
        const label = `track ${band.what} at ${Math.round(cx - box.x)} px (${played ? 'played' : 'ahead'}) · .rn-tokens-canvas`;
        results.push({ kind: played ? 'boundary' : 'unplayed', label, ratio: r2(run.best.ratio), pixels: x - run.x0, log: false, size: 0, ground: hex(...at(ground.data, run.best.i)), color: hex(...at(shown.data, run.best.i)) });
        run = null;
      };
      const xEnd = Math.min(width, Math.floor((box.x + box.w) * scale));
      for (let x = Math.max(0, Math.ceil(box.x * scale)); x < xEnd; x++) {
        // The playhead stands over the track: its own columns, and the ink ring around it that half-covers the marks
        // beside it (2 px each side, the mark's own width and its edge), are its, not the track's.
        if (Math.abs(x / scale - head) < 8) {
          close(x);
          continue;
        }
        let best = { ratio: 0, i: -1 };
        for (let y = y0; y < y1; y++) {
          const i = index(x, y);
          const s = at(shown.data, i);
          const g = at(ground.data, i);
          if (Math.abs(s[0] - g[0]) + Math.abs(s[1] - g[1]) + Math.abs(s[2] - g[2]) < 6) continue;
          const ratio = ratioOf(lum(...s), lum(...g));
          if (ratio > best.ratio) best = { ratio, i };
        }
        if (best.i < 0) {
          close(x);
          continue;
        }
        if (!run) run = { x0: x, best };
        else if (best.ratio > run.best.ratio) run.best = best;
      }
      close(xEnd);
    }
  }

  // The playhead against what is drawn right beside it, each row: the worse of its two sides; the worst row decides.
  if (args.thumb) {
    const { box, color } = args.thumb;
    const m = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [255, 255, 255];
    const lp = lum(m[0], m[1], m[2]);
    let worst = { ratio: Infinity, i: 0 };
    let n = 0;
    const left = Math.floor(box.x * scale) - 1;
    const right = Math.ceil((box.x + box.w) * scale);
    for (let y = Math.ceil((box.y + 1) * scale); y < Math.floor((box.y + box.h - 1) * scale); y++) {
      for (const x of [left, right]) {
        if (x < 0 || x >= width) continue;
        const i = index(x, y);
        const ratio = ratioOf(lp, lum(...at(shown.data, i)));
        n++;
        if (ratio < worst.ratio) worst = { ratio, i };
      }
    }
    if (n) {
      results.push({
        kind: 'boundary',
        label: 'playhead (beside it) · .media-time-slider-thumb',
        ratio: r2(worst.ratio),
        pixels: n,
        log: false,
        size: box.h,
        ground: hex(...at(shown.data, worst.i)),
        color: hex(m[0], m[1], m[2]),
      });
    }
  }
  return results;
}

/** Marks, photographs as shown and as ground, restores, and measures. */
export async function measureContrast(page: Page) {
  const marked = await page.evaluate(mark);
  const shot = () => page.screenshot({ animations: 'disabled', caret: 'hide' });
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await frames();
  const shown = await shot();
  const style = await page.addStyleTag({ content: HIDE });
  await frames();
  const ground = await shot();
  await style.evaluate((node) => (node as Element).remove());
  await page.evaluate(() => document.querySelectorAll('[data-audit]').forEach((el) => el.removeAttribute('data-audit')));
  const results = await page.evaluate(analyse, {
    shown: shown.toString('base64'),
    ground: ground.toString('base64'),
    candidates: marked.candidates,
    glyphs: marked.glyphs,
    track: marked.track,
    thumb: marked.thumb,
    thread: marked.thread,
  });
  return { results, skipped: marked.skipped, shown, ground };
}

export const MIN: Record<Kind, number> = { text: 4.9, large: 3.4, graphics: 3.4, boundary: 3.4, unplayed: 3.4 };

export const worst = (results: Result[]) => (results.length ? results.reduce((a, b) => (b.ratio < a.ratio ? b : a)) : undefined);

export const summary = (r: Result | undefined) => r && { ratio: r.ratio, element: r.label, size: r.size, color: r.color, ground: r.ground };

/** Every result under its bar, as a line each. */
export const failures = (results: Result[]) =>
  results
    .filter((r) => r.ratio < MIN[r.kind])
    .map((r) => `${r.kind} ${r.ratio}:1 < ${MIN[r.kind]} — ${r.label} (${r.color} on ${r.ground}${r.size ? `, ${Math.round(r.size * 10) / 10}px` : ''})`);
