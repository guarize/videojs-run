/**
 * The time slider as a run's tokens.
 *
 * - `<rn-tokens>`, inside the time slider: every word of the film's captions is a tick, set at the moment it is said
 *   (a cue's words spread evenly over its time). Played ticks are brass, the rest ink. Under a pointer the ticks near
 *   it rise, falling off with distance, the way attention weights are drawn; dragging tightens and brightens it. It
 *   draws only while something changes, and stands still under reduced motion except for what the pointer does.
 * - `<rn-scrub>`, in the slider's preview: the frame at the pointer, the step it belongs to, and the caption said
 *   there, decoded into place as the pointer moves.
 *
 * "Tokens" here are the captions' words: nothing is generated, and the README says so.
 */
import { frame } from './compare';
import { clock, whenRun, type Run } from './run';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Token {
  time: number;
  word: string;
  cue: number;
}

/** A track's cues as tokens: each word placed at its share of its cue's time. */
export function tokensOf(cues: readonly { startTime: number; endTime: number; text: string }[]): Token[] {
  const out: Token[] = [];
  cues.forEach((cue, index) => {
    const words = cue.text.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
    const span = Math.max(0.01, cue.endTime - cue.startTime);
    words.forEach((word, k) => out.push({ time: cue.startTime + ((k + 0.5) / words.length) * span, word, cue: index }));
  });
  return out;
}

/** The caption said at a time, if any. */
function captionAt(video: HTMLVideoElement, time: number): string {
  const track = Array.from(video.textTracks).find((t) => (t.kind === 'captions' || t.kind === 'subtitles') && t.cues?.length);
  const cue = track && (Array.from(track.cues ?? []) as VTTCue[]).find((c) => c.startTime <= time && time < c.endTime);
  return cue ? cue.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

function captionTrack(video: HTMLVideoElement): TextTrack | undefined {
  return Array.from(video.textTracks).find((t) => t.kind === 'captions' || t.kind === 'subtitles');
}

/**
 * Writes a line into an element as words arriving, each out of a light blur, quickly (the scrub moves fast). All at
 * once under reduced motion. Returns a stop function.
 */
export function decode(into: HTMLElement, text: string, ms = 220): () => void {
  if (reduced() || !text) {
    into.textContent = text;
    return () => undefined;
  }
  const parts = text.split(/(\s+)/);
  const count = Math.max(1, parts.filter((p) => p.trim()).length);
  let n = 0;
  into.replaceChildren(
    ...parts.map((part) => {
      if (!part.trim()) return document.createTextNode(part);
      const span = document.createElement('span');
      span.className = 'rn-log-word rn-word-quick';
      span.style.setProperty('--rn-d', `${Math.round((n++ * ms) / count)}ms`);
      span.textContent = part;
      return span;
    }),
  );
  return () => undefined;
}

export class RnTokensElement extends HTMLElement {
  #abort: AbortController | null = null;
  #canvas: HTMLCanvasElement | null = null;
  #run: Run | null = null;
  #tokens: Token[] = [];
  #pointer = -1;
  /** How strongly attention is drawn now, and where it is going (0 none, 1 hover, 2 drag). */
  #strength = 0;
  #target = 0;
  #frame = 0;
  #last = 0;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.setAttribute('aria-hidden', 'true');
    this.innerHTML = '<canvas class="rn-tokens-canvas"></canvas>';
    this.#canvas = this.querySelector('canvas');
    const slider = this.closest<HTMLElement>('media-time-slider');
    if (!slider) return;

    const aim = () => {
      this.#target = slider.hasAttribute('data-dragging') ? 2 : slider.hasAttribute('data-pointing') ? 1 : 0;
      this.#wake();
    };
    new MutationObserver(aim).observe(slider, { attributes: true, attributeFilter: ['data-dragging', 'data-pointing'] });
    slider.addEventListener('pointermove', (event) => {
      const box = this.getBoundingClientRect();
      this.#pointer = event.clientX - box.left;
      this.#wake();
    }, { signal });
    new ResizeObserver(() => this.#draw()).observe(this);

    whenRun(this, signal, (run) => {
      this.#run = run;
      const { video } = run;
      const read = () => {
        const track = captionTrack(video);
        const cues = track?.cues ? (Array.from(track.cues) as VTTCue[]) : [];
        if (track && track.mode === 'disabled') track.mode = 'hidden';
        this.#tokens = tokensOf(cues);
        this.#draw();
      };
      video.textTracks.addEventListener('addtrack', () => setTimeout(read, 0), { signal });
      video.textTracks.addEventListener('change', read, { signal });
      for (const el of video.querySelectorAll('track')) el.addEventListener('load', read, { signal });
      new MutationObserver(() => {
        for (const el of video.querySelectorAll('track')) el.addEventListener('load', read, { signal });
        read();
      }).observe(video, { childList: true });
      for (const type of ['timeupdate', 'progress', 'durationchange', 'seeked']) video.addEventListener(type, () => this.#draw(), { signal });
      read();
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    cancelAnimationFrame(this.#frame);
  }

  /** Runs frames while attention is moving toward where it is going; stops when it gets there. */
  #wake() {
    if (this.#frame) return;
    this.#last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - this.#last);
      this.#last = now;
      // Eased toward the target in about 180 ms; at once under reduced motion.
      const k = reduced() ? 1 : 1 - Math.exp(-dt / 60);
      this.#strength += (this.#target - this.#strength) * k;
      if (Math.abs(this.#target - this.#strength) < 0.01) this.#strength = this.#target;
      this.#draw();
      this.#frame = this.#strength === this.#target ? 0 : requestAnimationFrame(step);
    };
    this.#frame = requestAnimationFrame(step);
  }

  #draw() {
    const canvas = this.#canvas;
    const run = this.#run;
    if (!canvas || !run) return;
    const { video } = run;
    const width = this.clientWidth;
    const height = this.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(this);
    const brass = styles.getPropertyValue('--rn-signal-own').trim() || '#c9ae78';
    const ink = styles.getPropertyValue('--rn-track').trim() || '#2b323d';
    const buffer = styles.getPropertyValue('--rn-buffer').trim() || '#46505e';
    const paper = styles.getPropertyValue('--rn-text').trim() || '#e9e6df';
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const now = video.currentTime;
    let loaded = 0;
    for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= now + 0.1) loaded = Math.max(loaded, video.buffered.end(i));
    // Without captions, a tick every half second: the film's own time.
    const tokens = this.#tokens.length ? this.#tokens : Array.from({ length: Math.floor(duration * 2) }, (_, i) => ({ time: i / 2 + 0.25, word: '', cue: -1 }));
    const strength = this.#strength;
    const dragging = strength > 1;
    const sigma = dragging ? 30 : 52;
    const rise = (dragging ? 26 : 20) * Math.min(1, strength);
    const base = 4;
    const mid = height / 2;
    const steps = run.steps;
    for (const token of tokens) {
      const x = Math.round((token.time / duration) * width) + 0.5;
      const w = this.#pointer >= 0 && strength > 0 ? Math.exp(-(((x - this.#pointer) / sigma) ** 2)) : 0;
      const h = base + w * rise;
      const played = token.time <= now;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = played ? brass : token.time <= loaded ? buffer : ink;
      if (!played && w > 0.15) {
        ctx.strokeStyle = dragging ? brass : paper;
        ctx.globalAlpha = 0.35 + 0.65 * w;
      }
      ctx.lineWidth = w > 0.5 ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, mid - h / 2);
      ctx.lineTo(x, mid + h / 2);
      ctx.stroke();
    }
    // Where each step begins: a small brass diamond under the line, the run's own marks.
    ctx.globalAlpha = 1;
    for (const step of steps.slice(1)) {
      const x = (step.start / duration) * width;
      ctx.fillStyle = step.start <= now ? brass : buffer;
      ctx.beginPath();
      ctx.moveTo(x, mid + 7);
      ctx.lineTo(x + 2.5, mid + 9.5);
      ctx.lineTo(x, mid + 12);
      ctx.lineTo(x - 2.5, mid + 9.5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** The preview over the slider: frame, step and caption at the pointer. */
export class RnScrubElement extends HTMLElement {
  #abort: AbortController | null = null;
  #stop: () => void = () => undefined;
  #line = '';
  #at = -1;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.setAttribute('aria-hidden', 'true');
    this.innerHTML = `
      <div class="rn-scrub-frame">
        <img class="rn-scrub-img" alt="" decoding="async"><img class="rn-scrub-img" alt="" decoding="async">
        <span class="rn-scrub-corners"><i></i><i></i><i></i><i></i></span>
        <span class="rn-scrub-scan"></span>
      </div>
      <div class="rn-scrub-meta"><span class="rn-scrub-step"><b class="rn-scrub-num"></b><span class="rn-scrub-title"></span></span><span class="rn-scrub-time"></span></div>
      <div class="rn-scrub-line"><span class="rn-scrub-words"></span><span class="rn-scrub-caret"></span></div>`;
    const slider = this.closest<HTMLElement>('media-time-slider');
    const [imgA, imgB] = Array.from(this.querySelectorAll<HTMLImageElement>('.rn-scrub-img'));
    const scan = this.querySelector<HTMLElement>('.rn-scrub-scan')!;
    const words = this.querySelector<HTMLElement>('.rn-scrub-words')!;
    if (!slider) return;
    let front = imgA;
    // A new frame comes in over the last one, and a scan line crosses it as it lands.
    const land = (src: string) => {
      const back = front === imgA ? imgB : imgA;
      back.src = src;
      void back.decode().catch(() => undefined).then(() => {
        back.toggleAttribute('data-front', true);
        front.toggleAttribute('data-front', false);
        front = back;
        scan.removeAttribute('data-pass');
        void scan.offsetWidth;
        scan.setAttribute('data-pass', '');
      });
    };
    // Each time the preview opens, its corners close in on the frame.
    new MutationObserver(() => {
      const open = slider.hasAttribute('data-pointing') || slider.hasAttribute('data-dragging');
      if (open === this.hasAttribute('data-open')) return;
      this.toggleAttribute('data-open', open);
    }).observe(slider, { attributes: true, attributeFilter: ['data-pointing', 'data-dragging'] });
    whenRun(this, signal, (run) => {
      const { video } = run;
      let asked = -1;
      const show = (event: PointerEvent) => {
        const box = slider.getBoundingClientRect();
        const duration = video.duration;
        if (!Number.isFinite(duration) || !box.width) return;
        const time = Math.min(duration, Math.max(0, ((event.clientX - box.left) / box.width) * duration));
        this.querySelector('.rn-scrub-time')!.textContent = clock(time);
        let index = -1;
        run.steps.forEach((s, i) => {
          if (time + 0.01 >= s.start) index = i;
        });
        const step = run.steps[index];
        this.querySelector('.rn-scrub-num')!.textContent = step ? `Step ${String(index + 1).padStart(2, '0')}` : '';
        this.querySelector('.rn-scrub-title')!.textContent = step ? step.title : '';
        const said = captionAt(video, time);
        if (said !== this.#line) {
          this.#line = said;
          this.#stop();
          this.#stop = decode(words, said || '…');
        }
        // A frame a half second at a time: near enough to the pointer, and each is fetched or drawn once.
        const grain = Math.round(time * 2) / 2;
        if (grain === this.#at) return;
        this.#at = grain;
        asked = grain;
        void frame(run, grain).then((src) => {
          if (asked === grain) land(src);
        }, () => undefined);
      };
      slider.addEventListener('pointermove', show, { signal });
      slider.addEventListener('pointerdown', show, { signal });
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#stop();
  }
}

for (const [name, element] of [
  ['rn-tokens', RnTokensElement],
  ['rn-scrub', RnScrubElement],
] as const) {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, element);
}
