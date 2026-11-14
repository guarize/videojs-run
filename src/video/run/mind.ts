/**
 * Thinking, then acting: the moment Run is pressed on a prompt.
 *
 * The prompt's words become the input layer of a small network drawn in fine lines; brass pulses cross its layers.
 * One word for each step lights up in the prompt itself, and a brass thread runs from it through the layers to the
 * step it becomes, which lights as the thread arrives: the ask, read, turning into the plan. Under two seconds,
 * once per run sent, answering the press. Under reduced motion it is not drawn, and the plan simply appears.
 *
 * It is a drawing: the steps are the film's chapters, and no model runs.
 */
import { whenRun, type Run } from './run';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const MIND_MS = 1700;

interface Node {
  x: number;
  y: number;
  layer: number;
  /** When it lights, 0–1 of the sequence. */
  at: number;
}

const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** What the press saw: the prompt's card, its words, and where each word was. */
interface Seen {
  prompt: DOMRect;
  words: string[];
  spans: HTMLElement[];
  rects: DOMRect[];
}

const STOP = new Set(['the', 'and', 'from', 'with', 'that', 'this', 'into', 'over', 'what', 'when', 'your', 'for', 'how', 'its']);

/** For each of `n` steps, the word it grows from: content words, spread evenly along the prompt. */
export function wordsForSteps(words: readonly string[], n: number): number[] {
  const bare = words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, ''));
  let content = bare.map((w, i) => (w.length >= 4 && !STOP.has(w) ? i : -1)).filter((i) => i >= 0);
  if (!content.length) content = words.map((_, i) => i);
  if (!content.length || n <= 0) return [];
  return Array.from({ length: n }, (_, i) => content[Math.round((i * (content.length - 1)) / Math.max(1, n - 1))]);
}

export class RnMindElement extends HTMLElement {
  #abort: AbortController | null = null;
  #canvas: HTMLCanvasElement | null = null;
  #frame = 0;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.setAttribute('aria-hidden', 'true');
    this.innerHTML = '<canvas class="rn-mind-canvas"></canvas>';
    this.#canvas = this.querySelector('canvas');
    whenRun(this, signal, (run) => {
      const { container, video } = run;
      // Read where the prompt and the plan are before the press changes the layout.
      let before: Seen | null = null;
      const look = () => {
        const prompt = container.querySelector<HTMLElement>('rn-prompt');
        if (!prompt || !container.hasAttribute('data-rn-prompted') || container.hasAttribute('data-rn-started')) return;
        const spans = Array.from(prompt.querySelectorAll<HTMLElement>('.rn-prompt-word'));
        before = { prompt: prompt.getBoundingClientRect(), words: spans.map((s) => s.textContent ?? ''), spans, rects: spans.map((s) => s.getBoundingClientRect()) };
      };
      container.addEventListener('pointerdown', look, { capture: true, signal });
      container.addEventListener('keydown', look, { capture: true, signal });
      document.addEventListener('keydown', look, { capture: true, signal });
      video.addEventListener('play', () => {
        const seen = before;
        before = null;
        if (!seen || !seen.words.length || reduced() || run.steps.length === 0 || video.currentTime > 0.5) return;
        // Beside an open plan, the network runs across to its steps. On a phone, where the plan is closed and the
        // player is short, it runs down, from the prompt at the top to the steps' marks on the track below: drawn a
        // frame later, once the bar that holds the track is laid out.
        const roomy = run.container.getAttribute('data-rn-plan') === 'open' && run.container.clientWidth >= 640;
        if (roomy) this.#play(run, seen, 'across');
        else requestAnimationFrame(() => requestAnimationFrame(() => this.#play(run, seen, 'down')));
      }, { signal });
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    cancelAnimationFrame(this.#frame);
  }

  #play(run: Run, seen: Seen, mode: 'across' | 'down') {
    const canvas = this.#canvas;
    const { container } = run;
    if (!canvas) return;
    const box = container.getBoundingClientRect();
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.rn-step')).map((el) => el.getBoundingClientRect());
    if (!rows.length) return;
    const down = mode === 'down';
    const slider = container.querySelector<HTMLElement>('media-time-slider')?.getBoundingClientRect();
    const duration = run.video.duration;
    if (down && (!slider || !slider.width || !Number.isFinite(duration) || duration <= 0)) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // The drawing's box: the player's, and on a phone the pad under it too (run.css, "The pad": its margin).
    const pad = container.hasAttribute('data-rn-pad') ? Number.parseFloat(getComputedStyle(container).marginBottom) || 0 : 0;
    const height = box.height + pad;
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Layers as columns, right to left: the prompt's words, two hidden layers, one node per step beside the plan.
    const words = seen.words.slice(0, down ? 12 : 10);
    // The word each step grows from.
    const picks = wordsForSteps(words, run.steps.length);
    // The plan card's own edge (its rows are narrower than the card): the outputs stand just outside it.
    const planBox = container.querySelector('rn-plan')?.getBoundingClientRect();
    const planRight = (planBox ? planBox.right : Math.max(...rows.map((r) => r.right))) - box.left;
    const x0 = planRight + 44;
    const x3 = Math.max(x0 + 240, seen.prompt.right - box.left - 40);
    // Row heights by layout, not by what is on screen: the rows and the plan are moving in as this is read.
    const offsetIn = (el: HTMLElement | null): number => {
      let y = 0;
      for (let n: HTMLElement | null = el; n && n !== container && container.contains(n); n = n.offsetParent as HTMLElement | null) y += n.offsetTop - (n.scrollTop || 0);
      return y;
    };
    const stepEls = Array.from(container.querySelectorAll<HTMLElement>('.rn-step'));
    const output: Node[] = rows.map((r, i) => ({ x: x0, y: offsetIn(stepEls[i]) + (stepEls[i]?.offsetHeight ?? r.height) / 2, layer: 3, at: 0.56 + i * 0.045 }));
    const top = Math.min(...output.map((n) => n.y));
    const bottom = Math.max(...output.map((n) => n.y));
    const column = (layer: number, count: number, x: number, at: number, spread = 1): Node[] =>
      Array.from({ length: count }, (_, i) => {
        const mid = (top + bottom) / 2;
        const half = ((bottom - top) / 2) * spread;
        return { x, y: count === 1 ? mid : mid - half + (2 * half * i) / (count - 1), layer, at: at + i * 0.014 };
      });
    let layers: Node[][];
    if (!down) {
      const input = column(0, Math.max(3, words.length), x3, 0.04, 0.8);
      layers = [input, column(1, 6, x3 - (x3 - x0) * 0.36, 0.22, 0.9), column(2, 6, x3 - (x3 - x0) * 0.7, 0.38, 0.95), output];
    } else {
      // Rows, top to bottom: the prompt's words along the foot of its card; two hidden rows; one node per step, on
      // its mark on the track (the diamond tokens.ts draws where each step begins).
      const s = slider!;
      const left = s.left - box.left;
      const width = s.width;
      const yTrack = s.top - box.top + s.height / 2 + 9.5;
      const yIn = Math.min(seen.prompt.bottom - box.top - 8, yTrack - 60);
      const row = (layer: number, count: number, y: number, at: number, from: number, to: number): Node[] =>
        Array.from({ length: count }, (_, i) => ({ x: from + ((to - from) * (count === 1 ? 0.5 : i / (count - 1))), y, layer, at: at + i * 0.014 }));
      // Each input under its own word in the card (held to the track's width), so a thread leaves from the word.
      const inputs: Node[] = words.map((_, i) => {
        const r = seen.rects[i];
        const x = r ? r.left + r.width / 2 - box.left : left + (width * (i + 0.5)) / words.length;
        return { x: Math.min(left + width, Math.max(left, x)), y: yIn, layer: 0, at: 0.04 + i * 0.014 };
      });
      const outputs: Node[] = run.steps.map((step, i) => ({ x: left + (step.start / duration) * width, y: yTrack, layer: 3, at: 0.56 + i * 0.05 }));
      layers = [inputs, row(1, 5, yIn + (yTrack - yIn) * 0.36, 0.22, left + width * 0.12, left + width * 0.88), row(2, 5, yIn + (yTrack - yIn) * 0.68, 0.38, left + width * 0.06, left + width * 0.94), outputs];
    }
    const edges: [Node, Node, number][] = [];
    for (let l = 0; l < layers.length - 1; l++) {
      for (const a of layers[l]) for (const b of layers[l + 1]) edges.push([a, b, (Math.sin(a.y * 12.9898 + b.y * 78.233) * 43758.5453) % 1]);
    }
    // The threads: for each step, its word, a unit in each hidden layer, and the step.
    const pick = (layer: Node[], i: number, n: number) => layer[Math.round((i * (layer.length - 1)) / Math.max(1, n - 1))];
    const threads = layers[3].map((out, i, all) => {
      const from = layers[0][picks[i] ?? 0] ?? layers[0][0];
      return { word: picks[i] ?? -1, path: [from, pick(layers[1], i, all.length), pick(layers[2], i, all.length), out] };
    });
    const litWords = new Set<HTMLElement>();
    const arrived = new Set<HTMLElement>();
    const styles = getComputedStyle(container);
    const brass = styles.getPropertyValue('--rn-signal-own').trim() || '#c9ae78';
    const paper = styles.getPropertyValue('--rn-text').trim() || '#e9e6df';

    container.setAttribute('data-rn-mind', mode);
    this.toggleAttribute('data-on', true);
    const began = performance.now();
    // An edge is a soft S-curve from one layer to the next, across or down.
    const controls = (a: Node, b: Node) => {
      if (down) {
        const dy = (b.y - a.y) * 0.5;
        return [a.x, a.y + dy, b.x, b.y - dy] as const;
      }
      const dx = (b.x - a.x) * 0.5;
      return [a.x + dx, a.y, b.x - dx, b.y] as const;
    };
    const at = (a: Node, b: Node, k: number) => {
      const [c1x, c1y, c2x, c2y] = controls(a, b);
      const u = 1 - k;
      const x = u * u * u * a.x + 3 * u * u * k * c1x + 3 * u * k * k * c2x + k * k * k * b.x;
      const y = u * u * u * a.y + 3 * u * u * k * c1y + 3 * u * k * k * c2y + k * k * k * b.y;
      return [x, y] as const;
    };
    const curve = (a: Node, b: Node) => {
      const [c1x, c1y, c2x, c2y] = controls(a, b);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, b.x, b.y);
    };
    const font = `11px ${getComputedStyle(container).getPropertyValue('--rn-mono').trim() || 'monospace'}`;
    const draw = (now: number) => {
      const t = (now - began) / MIND_MS;
      ctx.clearRect(0, 0, box.width, height);
      // The whole drawing comes up quickly and goes over its last fifth.
      const fade = Math.min(1, t / 0.08) * (1 - ease((t - 0.8) / 0.2));
      ctx.lineCap = 'round';
      // The weights: every edge a hairline, faint.
      for (const [a, b] of edges) {
        const lit = ease((t - a.at) / 0.14);
        if (lit <= 0) continue;
        ctx.globalAlpha = fade * 0.09 * lit;
        ctx.strokeStyle = paper;
        ctx.lineWidth = 0.6;
        curve(a, b);
        ctx.stroke();
      }
      // The signal: on the strongest edges a brass pulse with a fading tail runs to the next layer.
      for (const [a, b, r] of edges) {
        if (Math.abs(r) > 0.26) continue;
        const p = (t - a.at - 0.05) / 0.2;
        if (p <= 0 || p >= 1.25) continue;
        const head = ease(Math.min(1, p));
        const tail = Math.max(0, head - 0.28);
        ctx.globalAlpha = fade * 0.18 * (1 - Math.max(0, p - 1) * 4);
        ctx.strokeStyle = brass;
        ctx.lineWidth = 0.9;
        curve(a, b);
        ctx.stroke();
        const steps = 10;
        for (let k = 0; k < steps; k++) {
          const s0 = tail + ((head - tail) * k) / steps;
          const s1 = tail + ((head - tail) * (k + 1)) / steps;
          const [x0, y0] = at(a, b, s0);
          const [x1, y1] = at(a, b, s1);
          ctx.globalAlpha = fade * ((k + 1) / steps) * (p < 1 ? 1 : 1 - (p - 1) * 4);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
      // The units: rings that fill with brass as they fire, with a soft bloom.
      for (const layer of layers) {
        for (const n of layer) {
          const lit = ease((t - n.at) / 0.12);
          if (lit <= 0) continue;
          const fire = ease((t - n.at - 0.08) / 0.14);
          const radius = n.layer === 3 ? 3.5 : 3;
          ctx.globalAlpha = fade * lit;
          ctx.fillStyle = '#0f1318';
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = n.layer === 0 || n.layer === 3 ? brass : paper;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          if (fire > 0) {
            ctx.save();
            ctx.shadowColor = brass;
            ctx.shadowBlur = 12 * fire * (1 - ease((t - n.at - 0.3) / 0.4)) + 2;
            ctx.globalAlpha = fade * fire;
            ctx.fillStyle = brass;
            ctx.beginPath();
            ctx.arc(n.x, n.y, (radius - 1.2) * fire, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          // The prompt's words beside the input units: what goes in.
          if (n.layer === 0 && !down) {
            const index = layer.indexOf(n);
            const word = words[index];
            if (word) {
              const chosen = picks.includes(index);
              ctx.globalAlpha = fade * lit * (chosen ? 1 : 0.5);
              ctx.fillStyle = chosen ? brass : paper;
              ctx.font = font;
              ctx.textBaseline = 'middle';
              ctx.fillText(word, n.x + 10, n.y);
            }
          }
        }
      }
      // The threads, each from its word to its step, drawn on as the signal goes; the word lights in the prompt as its
      // thread leaves, the step as it arrives.
      threads.forEach(({ word, path }, i) => {
        const [a, , , d] = path;
        const t0 = a.at + 0.03;
        const q = (t - t0) / Math.max(0.05, d.at - t0);
        if (q <= 0) return;
        const span = seen.spans[word];
        if (span && !litWords.has(span)) {
          span.classList.add('rn-lit');
          litWords.add(span);
        }
        const k = Math.min(1, q) * 3;
        ctx.globalAlpha = fade * 0.95;
        ctx.strokeStyle = brass;
        ctx.lineWidth = 1.4;
        for (let seg = 0; seg < 3 && seg < k; seg++) {
          const from = path[seg];
          const to = path[seg + 1];
          const part = Math.min(1, k - seg);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          const samples = 16;
          for (let j = 1; j <= samples; j++) {
            const [x, y] = at(from, to, (part * j) / samples);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
          if (part < 1) {
            const [hx, hy] = at(from, to, part);
            ctx.save();
            ctx.shadowColor = brass;
            ctx.shadowBlur = 10;
            ctx.fillStyle = brass;
            ctx.beginPath();
            ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
        if (q >= 1) {
          const row = stepEls[i];
          if (row && !arrived.has(row)) {
            row.setAttribute('data-arrive', '');
            arrived.add(row);
          }
          // Down, on the track: the step's number comes up over its mark.
          if (down) {
            ctx.globalAlpha = fade * ease((t - d.at) / 0.1);
            ctx.fillStyle = brass;
            ctx.font = font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(String(i + 1).padStart(2, '0'), d.x, d.y - 9);
            ctx.textAlign = 'start';
          }
        }
      });
      // Down: each output lands on its step's mark, which rings once as it is reached.
      if (down) {
        for (const n of layers[3]) {
          const p = ease((t - n.at - 0.06) / 0.3);
          if (p <= 0 || p >= 1) continue;
          ctx.globalAlpha = fade * (1 - p);
          ctx.strokeStyle = brass;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 4 + 12 * p, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Across: each output reaches its step, a brass line drawn to the row, ending in a point at it.
      if (!down) output.forEach((n, i) => {
        const p = ease((t - n.at - 0.04) / 0.16);
        if (p <= 0) return;
        const r = rows[i];
        const tx = planRight + 6;
        const x = n.x + (tx - n.x) * p;
        ctx.globalAlpha = fade * 0.8;
        ctx.strokeStyle = brass;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(n.x - 4, n.y);
        ctx.lineTo(x, n.y);
        void r;
        ctx.stroke();
        ctx.fillStyle = brass;
        ctx.beginPath();
        ctx.arc(x, n.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (t < 1) this.#frame = requestAnimationFrame(draw);
      else {
        ctx.clearRect(0, 0, box.width, height);
        this.removeAttribute('data-on');
        container.removeAttribute('data-rn-mind');
        for (const span of litWords) span.classList.remove('rn-lit');
        for (const row of arrived) row.removeAttribute('data-arrive');
        this.#frame = 0;
      }
    };
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(draw);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-mind')) customElements.define('rn-mind', RnMindElement);
