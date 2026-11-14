/**
 * Before and after: a step's first frame and its last, one over the other, with a line to draw between them.
 *
 * The frames are the film's own, fetched at the step's start and end from Mux's thumbnail service (a film streamed
 * from Mux, or a player carrying `data-rn-mux`). The line is a range input: drag it on the picture, or use the arrow
 * keys on it. Escape or the close key puts focus back on the step's compare key.
 */
import { clock, whenRun, type Run } from './run';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A frame of the film at a time, as an address: Mux's thumbnail where there is one, else drawn from a second copy of
 * the film (never the one playing, which must not move). Kept, so a frame is drawn once.
 */
const drawn = new Map<string, Promise<string>>();
let reader: HTMLVideoElement | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function frame(run: Run, seconds: number): Promise<string> {
  const mux = run.frameAt(seconds);
  if (mux) return Promise.resolve(mux);
  const src = run.video.currentSrc;
  const key = `${src}#${seconds.toFixed(2)}`;
  const known = drawn.get(key);
  if (known) return known;
  const made = (queue = queue.then(() => draw(src, seconds, run.video.crossOrigin), () => draw(src, seconds, run.video.crossOrigin))) as Promise<string>;
  drawn.set(key, made);
  made.catch(() => drawn.delete(key));
  return made;
}

async function draw(src: string, seconds: number, crossOrigin: string | null): Promise<string> {
  if (!reader) {
    reader = document.createElement('video');
    reader.muted = true;
    reader.preload = 'auto';
    reader.playsInline = true;
  }
  const video = reader;
  if (crossOrigin !== null) video.crossOrigin = crossOrigin;
  if (video.getAttribute('src') !== src) {
    video.src = src;
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('frame')), { once: true });
    });
  }
  await new Promise<void>((resolve, reject) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('frame')), { once: true });
    video.currentTime = Math.min(seconds, Math.max(0, video.duration - 0.05));
  });
  const width = 640;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((width * video.videoHeight) / Math.max(1, video.videoWidth));
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) throw new Error('frame');
  return URL.createObjectURL(blob);
}

/** Fetches a frame ahead of time, so the card opens on pictures. */
const warm = new Set<string>();
export function prefetch(url: string | null): void {
  if (!url || warm.has(url)) return;
  warm.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}

export class RnCompareElement extends HTMLElement {
  #abort: AbortController | null = null;
  #run: Run | null = null;
  #opener: HTMLElement | null = null;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.hidden = true;
    this.innerHTML = `
      <div class="rn-compare-card" role="group">
        <div class="rn-compare-head">
          <span class="rn-compare-kicker">Before and after</span>
          <span class="rn-compare-title"></span>
          <button type="button" class="media-button rn-compare-close" aria-label="Close before and after">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="rn-compare-stage">
          <img class="rn-compare-before" alt="" decoding="async">
          <img class="rn-compare-after" alt="" decoding="async">
          <span class="rn-compare-line" aria-hidden="true"></span>
          <input class="rn-compare-wipe" type="range" min="0" max="100" step="1" value="50">
        </div>
        <div class="rn-compare-foot">
          <span class="rn-compare-at-before"></span>
          <span class="rn-compare-at-after"></span>
        </div>
      </div>`;
    const card = this.querySelector<HTMLElement>('.rn-compare-card')!;
    const wipe = this.querySelector<HTMLInputElement>('.rn-compare-wipe')!;
    const stage = this.querySelector<HTMLElement>('.rn-compare-stage')!;
    const set = (value: number) => {
      wipe.value = String(Math.round(value));
      card.style.setProperty('--rn-wipe', `${wipe.value}%`);
      wipe.setAttribute('aria-valuetext', `${wipe.value}% after, ${100 - Number(wipe.value)}% before`);
    };
    wipe.addEventListener('input', () => set(Number(wipe.value)), { signal });
    // The whole picture takes the drag, not only the range's own thumb.
    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const at = (e: PointerEvent) => {
        const box = stage.getBoundingClientRect();
        set(((e.clientX - box.left) / box.width) * 100);
      };
      stage.setPointerCapture(event.pointerId);
      at(event);
      wipe.focus({ preventScroll: true });
      const move = (e: PointerEvent) => at(e);
      const up = () => {
        stage.removeEventListener('pointermove', move);
        stage.removeEventListener('pointerup', up);
        stage.removeEventListener('pointercancel', up);
      };
      stage.addEventListener('pointermove', move);
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
      event.preventDefault();
    }, { signal });
    this.querySelector('.rn-compare-close')!.addEventListener('click', () => this.#run?.compare(-1), { signal });
    this.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.#run?.compare(-1);
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '].includes(event.key) && event.target === wipe) {
        // The range's own keys, not the player's seek and volume keys.
        event.stopPropagation();
      }
    }, { signal });

    whenRun(this, signal, (run) => {
      this.#run = run;
      const container = run.container;
      // Frames fetched as a pointer or focus comes near a compare key: the card then opens on pictures.
      const near = (event: Event) => {
        const key = (event.target as Element | null)?.closest?.<HTMLElement>('.rn-step-compare');
        const step = key && run.steps[Number(key.dataset.index)];
        if (!step) return;
        void frame(run, step.start + 0.3).then(prefetch, () => undefined);
        void frame(run, Math.max(step.start, step.end - 0.3)).then(prefetch, () => undefined);
      };
      container.addEventListener('pointerover', near, { signal });
      container.addEventListener('focusin', near, { signal });
      run.addEventListener('compare', () => {
        const index = run.comparing;
        const step = run.steps[index];
        container.toggleAttribute('data-rn-comparing', !!step);
        if (!step) {
          const was = !this.hidden;
          this.hidden = true;
          if (was && this.contains(document.activeElement)) this.#opener?.focus();
          else if (was && this.#opener && document.activeElement === document.body) this.#opener.focus();
          return;
        }
        this.#opener = container.querySelector<HTMLElement>(`.rn-step-compare[data-index="${index}"]`);
        const before = step.start + 0.3;
        const after = Math.max(step.start, step.end - 0.3);
        card.setAttribute('aria-label', `Before and after: ${step.title}`);
        wipe.setAttribute('aria-label', `Before and after: ${step.title}`);
        this.querySelector('.rn-compare-title')!.textContent = step.title;
        this.querySelector('.rn-compare-at-before')!.textContent = `Before · ${clock(before)}`;
        this.querySelector('.rn-compare-at-after')!.textContent = `After · ${clock(after)}`;
        const [a, b] = [this.querySelector<HTMLImageElement>('.rn-compare-before')!, this.querySelector<HTMLImageElement>('.rn-compare-after')!];
        card.toggleAttribute('data-loading', true);
        a.removeAttribute('src');
        b.removeAttribute('src');
        void Promise.all([frame(run, before), frame(run, after)]).then(([x, y]) => {
          if (run.comparing !== index) return;
          a.src = x;
          b.src = y;
          return Promise.all([a.decode(), b.decode()]).catch(() => undefined);
        }).finally(() => card.removeAttribute('data-loading'));
        a.alt = `The frame at ${clock(before)}, as the step begins`;
        b.alt = `The frame at ${clock(after)}, as the step ends`;
        this.hidden = false;
        // The after side is drawn across once, from nothing to half: the change, shown. Under reduced motion it
        // simply stands at half.
        if (reduced()) set(50);
        else {
          set(100);
          card.toggleAttribute('data-sweep', true);
          requestAnimationFrame(() => requestAnimationFrame(() => set(50)));
          setTimeout(() => card.removeAttribute('data-sweep'), 700);
        }
        wipe.focus({ preventScroll: true });
      }, { signal });
      // A film that moves to another step closes nothing: the card stays on the step it was opened for.
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-compare')) customElements.define('rn-compare', RnCompareElement);
