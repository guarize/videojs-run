/**
 * The film as a run.
 *
 * - `<rn-plan>`: the film's chapters as the steps of a plan, each pending, running or done by where the film is, with
 *   its start time. A step is a button: it seeks there. The list is one Tab stop; the arrow keys move in it.
 * - `<rn-step-key>`: the bar's key for the plan, "3/7 Fix contrast", that shows and hides it.
 * - `<rn-log>`: the captions, written into the bar as the step's log line, a character at a time with a caret
 *   (all at once under reduced motion). The film's own captions track is the only source: nothing here is generated.
 *   With captions off, the line names the step.
 * - At the end, `data-rn-done` and "Completed in 1:12".
 *
 * State is on the container as attributes (run.css draws it): `data-rn-started`, `data-rn-done`, `data-rn-plan`.
 */

import { decode } from './tokens';

export interface Step {
  title: string;
  start: number;
  end: number;
}

/** "1:05", "12:40", "1:02:03": whole seconds down, as Video.js's own time display counts them, so the two agree. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Spoken: "1 minute 5 seconds". */
export function spoken(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (!m) return part(r, 'second');
  return r ? `${part(m, 'minute')} ${part(r, 'second')}` : part(m, 'minute');
}

/** Which step the time is in: the last that has begun. -1 before the first. */
export function stepAt(steps: readonly Step[], time: number): number {
  let at = -1;
  for (let i = 0; i < steps.length; i++) if (time + 0.05 >= steps[i].start) at = i;
  return at;
}

export type StepState = 'pending' | 'running' | 'done';

export type { Run };

export function stateOf(index: number, current: number, ended: boolean): StepState {
  if (ended || index < current) return 'done';
  return index === current ? 'running' : 'pending';
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The run's state, shared by its parts: one per container. */
class Run extends EventTarget {
  steps: Step[] = [];
  current = -1;
  ended = false;
  /** The step played over and over ("Run this step again"), or -1; and how many times it has come round. */
  looping = -1;
  rounds = 0;
  /** The step whose before and after are being compared, or -1. */
  comparing = -1;
  readonly container: HTMLElement;
  readonly video: HTMLVideoElement;

  constructor(container: HTMLElement, video: HTMLVideoElement) {
    super();
    this.container = container;
    this.video = video;
    // How tall the player is, for what opens over it: under 420 px (a phone held upright, a small embed) the
    // palette, Reasoning and the before-and-after open as sheets inside it, and the track's preview drops its frame.
    const measure = () => container.toggleAttribute('data-rn-short', container.clientHeight > 0 && container.clientHeight < 420);
    new ResizeObserver(measure).observe(container);
    measure();
    const update = () => this.#update();
    for (const type of ['timeupdate', 'seeked', 'seeking', 'loadedmetadata', 'durationchange', 'emptied']) video.addEventListener(type, update);
    video.addEventListener('timeupdate', () => this.#round());
    video.addEventListener('seeking', () => {
      // A seek out of the step that is repeating ends the repeat; the loop's own seek back lands inside it.
      const step = this.steps[this.looping];
      if (step && (video.currentTime < step.start - 0.05 || video.currentTime >= step.end)) this.repeat(-1);
    });
    video.addEventListener('play', () => {
      container.toggleAttribute('data-rn-started', true);
      this.#update();
    });
    // Moved into the film by hand before Run, the run has begun too: the prompt gives way to the plan.
    video.addEventListener('seeking', () => {
      if (video.currentTime > 0.05) container.toggleAttribute('data-rn-started', true);
    });
    video.addEventListener('ended', () => {
      this.ended = true;
      this.#update();
    });
    video.textTracks.addEventListener('addtrack', () => this.#chapters());
    video.textTracks.addEventListener('change', () => this.#chapters());
    this.#chapters();
  }

  #chapters() {
    const track = Array.from(this.video.textTracks).find((t) => t.kind === 'chapters');
    if (!track) return;
    if (track.mode === 'disabled') track.mode = 'hidden';
    const read = () => {
      const cues = Array.from(track.cues ?? []) as VTTCue[];
      if (!cues.length) return;
      const steps = cues.map((cue) => ({ title: cue.text.trim(), start: cue.startTime, end: cue.endTime }));
      if (steps.length === this.steps.length && steps.every((s, i) => s.title === this.steps[i].title && s.start === this.steps[i].start)) return;
      this.steps = steps;
      this.dispatchEvent(new Event('steps'));
      this.#update(true);
    };
    read();
    // Cues arrive with the track's load (and again when the source changes).
    const el = Array.from(this.video.querySelectorAll('track')).find((t) => t.track === track);
    el?.addEventListener('load', read);
    track.addEventListener('cuechange', read, { once: true });
  }

  #update(force = false) {
    const { video } = this;
    if (this.ended && !video.ended && video.currentTime < (video.duration || Infinity) - 0.5) this.ended = false;
    // Before the first play nothing is running yet: every step waits.
    const started = this.container.hasAttribute('data-rn-started') || video.currentTime > 0.05;
    const current = started ? stepAt(this.steps, video.currentTime) : -1;
    this.container.toggleAttribute('data-rn-done', this.ended);
    if (force || current !== this.current) {
      this.current = current;
      this.dispatchEvent(new Event('step'));
    } else {
      this.dispatchEvent(new Event('tick'));
    }
    if (this.ended) this.dispatchEvent(new Event('step'));
  }

  seekTo(index: number) {
    const step = this.steps[index];
    if (!step) return;
    if (this.looping !== index) this.repeat(-1);
    this.video.currentTime = step.start + 0.01;
  }

  /** Runs one step again and again, from its start, until asked to stop (index -1, or the same step again). */
  repeat(index: number) {
    const on = index >= 0 && index !== this.looping && !!this.steps[index];
    this.looping = on ? index : -1;
    this.rounds = on ? 1 : 0;
    this.container.toggleAttribute('data-rn-looping', on);
    this.dispatchEvent(new Event('loop'));
    if (!on) return;
    this.video.currentTime = this.steps[index].start + 0.01;
    if (this.video.paused) void this.video.play().catch(() => undefined);
  }

  #round() {
    const step = this.steps[this.looping];
    if (!step || this.video.seeking) return;
    // Back to the start just before the step hands over to the next (timeupdate comes every quarter second).
    if (this.video.currentTime >= step.end - 0.3 || this.video.ended) {
      this.rounds++;
      this.video.currentTime = step.start + 0.01;
      if (this.video.paused) void this.video.play().catch(() => undefined);
      this.dispatchEvent(new Event('loop'));
    }
  }

  /** Opens (or, given -1, closes) the before and after of a step. */
  compare(index: number) {
    this.comparing = this.steps[index] ? index : -1;
    this.dispatchEvent(new Event('compare'));
  }

  /** Where still frames of the film can be had at any time: Mux's thumbnails, for a film streamed from Mux. */
  frameAt(seconds: number, width = 640): string | null {
    const id = muxId(this.video.currentSrc || this.video.getAttribute('src') || '') ?? this.container.closest('[data-rn-mux]')?.getAttribute('data-rn-mux');
    if (!id) return null;
    return `https://image.mux.com/${id}/thumbnail.webp?time=${Math.max(0, seconds).toFixed(2)}&width=${width}`;
  }

  /**
   * Whether frames can be had at all: from Mux, or drawn from the film itself, which a page may read when the file
   * is its own or served for `crossorigin` (a canvas from any other film is closed to script).
   */
  get framed(): boolean {
    if (this.frameAt(0)) return true;
    const src = this.video.currentSrc || this.video.getAttribute('src') || '';
    if (!src || /\.m3u8(?:[?#]|$)/i.test(src)) return false;
    try {
      return new URL(src, location.href).origin === location.origin || this.video.crossOrigin !== null;
    } catch {
      return false;
    }
  }
}

/** The playback ID in a Mux address (a stream, or a static MP4 rendition). */
export function muxId(src: string): string | null {
  const match = /^https:\/\/stream\.mux\.com\/([A-Za-z0-9]+)/.exec(src);
  return match ? match[1] : null;
}

const runs = new WeakMap<HTMLElement, Run>();

/** The run for the container an element is in, once its film is there. */
export function runFor(el: HTMLElement): Run | null {
  const container = el.closest<HTMLElement>('media-container');
  const video = container?.querySelector('video');
  if (!container || !video) return null;
  let run = runs.get(container);
  if (!run) {
    run = new Run(container, video);
    runs.set(container, run);
  }
  return run;
}

/** Waits for the film to be in the container (a page may add it after the skin). */
export function whenRun(el: HTMLElement, signal: AbortSignal, ready: (run: Run) => void) {
  const now = runFor(el);
  if (now) return ready(now);
  const container = el.closest('media-container');
  if (!container) return;
  const watch = new MutationObserver(() => {
    const run = runFor(el);
    if (!run) return;
    watch.disconnect();
    ready(run);
  });
  watch.observe(container, { childList: true, subtree: true });
  signal.addEventListener('abort', () => watch.disconnect());
}

let ids = 0;

export class RnPlanElement extends HTMLElement {
  #abort: AbortController | null = null;
  #list: HTMLOListElement | null = null;
  #count: HTMLElement | null = null;
  #run: Run | null = null;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.id ||= `rn-plan-${++ids}`;
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', 'Plan');
    this.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'rn-plan-head';
    head.innerHTML = '<span class="rn-plan-title">Plan</span><span class="rn-plan-count"></span>';
    this.#count = head.querySelector('.rn-plan-count');
    const list = document.createElement('ol');
    list.className = 'rn-steps';
    this.#list = list;
    this.append(head, list);
    list.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]');
      const run = this.#run;
      if (!button || !run) return;
      const index = Number(button.dataset.index);
      if (button.classList.contains('rn-step-again')) run.repeat(index);
      else if (button.classList.contains('rn-step-compare')) run.compare(run.comparing === index ? -1 : index);
      else run.seekTo(index);
    }, { signal });
    list.addEventListener('keydown', (event) => this.#keys(event), { signal });
    whenRun(this, signal, (run) => {
      this.#run = run;
      run.addEventListener('steps', () => this.#build(), { signal });
      run.addEventListener('step', () => this.#mark(), { signal });
      run.addEventListener('tick', () => this.#progress(), { signal });
      run.addEventListener('loop', () => this.#mark(), { signal });
      run.addEventListener('compare', () => this.#mark(), { signal });
      this.#build();
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }

  #build() {
    const run = this.#run;
    const list = this.#list;
    if (!run || !list) return;
    const focused = list.contains(document.activeElement) ? Number((document.activeElement as HTMLElement).dataset.index) : -1;
    list.replaceChildren(
      ...run.steps.map((step, index) => {
        const li = document.createElement('li');
        li.style.setProperty('--rn-i', String(index));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rn-step';
        button.dataset.index = String(index);
        button.innerHTML = '<span class="rn-step-mark" aria-hidden="true"><svg viewBox="0 0 12 12"><path class="rn-step-tick" d="M2.5 6.4 5 8.8l4.5-5.6" pathLength="1"/></svg></span><span class="rn-step-title"></span><span class="rn-sr">, </span><span class="rn-step-time"></span><span class="rn-sr rn-step-state"></span>';
        button.querySelector('.rn-step-title')!.textContent = step.title;
        const time = button.querySelector<HTMLElement>('.rn-step-time')!;
        time.textContent = clock(step.start);
        const again = document.createElement('button');
        again.type = 'button';
        again.className = 'rn-step-action rn-step-again';
        again.dataset.index = String(index);
        again.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.8v2.6h2.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        li.append(button, again);
        if (run.framed) {
          const compare = document.createElement('button');
          compare.type = 'button';
          compare.className = 'rn-step-action rn-step-compare';
          compare.dataset.index = String(index);
          compare.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
          li.append(compare);
        }
        return li;
      }),
    );
    this.closest('media-container')?.style.setProperty('--rn-steps', String(run.steps.length));
    this.#mark();
    this.#progress();
    if (focused >= 0) list.querySelector<HTMLElement>(`[data-index="${focused}"]`)?.focus();
  }

  #mark() {
    const run = this.#run;
    if (!run || !this.#list) return;
    const buttons = Array.from(this.#list.querySelectorAll<HTMLButtonElement>('.rn-step'));
    const roving = Math.max(0, run.current);
    const tabbing = this.#list.contains(document.activeElement);
    for (const action of this.#list.querySelectorAll<HTMLButtonElement>('.rn-step-action')) {
      const index = Number(action.dataset.index);
      const title = run.steps[index]?.title ?? '';
      if (!tabbing) action.tabIndex = -1;
      if (action.classList.contains('rn-step-again')) {
        const on = run.looping === index;
        action.setAttribute('aria-pressed', String(on));
        action.setAttribute('aria-label', `Run this step again: ${title}`);
        action.closest('li')?.toggleAttribute('data-looping', on);
      } else {
        const on = run.comparing === index;
        action.setAttribute('aria-expanded', String(on));
        action.setAttribute('aria-label', `Compare before and after: ${title}`);
        action.closest('li')?.toggleAttribute('data-comparing', on);
      }
    }
    buttons.forEach((button, index) => {
      const state = stateOf(index, run.current, run.ended);
      button.dataset.state = state;
      const step = run.steps[index];
      // The name is what is drawn (the title, the time as shown), and then the state, heard only (WCAG 2.5.3).
      button.removeAttribute('aria-label');
      const said = `, ${state === 'running' ? 'current step' : state}`;
      const stateEl = button.querySelector('.rn-step-state');
      if (stateEl && stateEl.textContent !== said) stateEl.textContent = said;
      if (state === 'running') button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      if (!tabbing) button.tabIndex = index === roving ? 0 : -1;
    });
    if (this.#count) {
      const n = run.steps.length;
      const text = !n ? '' : run.ended ? `${n}/${n}` : `${Math.max(0, run.current) + (run.current >= 0 ? 1 : 0)}/${n}`;
      if (this.#count.textContent !== text) {
        // The count turns over, like a counter's wheel.
        this.#count.textContent = text;
        this.#count.removeAttribute('data-turn');
        void this.#count.offsetWidth;
        this.#count.setAttribute('data-turn', '');
      }
    }
  }

  /** How far the running step has gone, 0 to 1, for its ring. */
  #progress() {
    const run = this.#run;
    const step = run?.steps[run.current];
    const button = this.#list?.querySelector<HTMLElement>('.rn-step[data-state="running"]');
    if (!run || !step || !button) return;
    const p = Math.min(1, Math.max(0, (run.video.currentTime - step.start) / Math.max(0.001, step.end - step.start)));
    button.style.setProperty('--rn-step-progress', p.toFixed(3));
  }

  /** The list is a grid with one Tab stop: up and down between steps, left and right along a step's row. */
  #keys(event: KeyboardEvent) {
    if (!this.#list || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const rows = Array.from(this.#list.children).map((li) => Array.from(li.querySelectorAll<HTMLButtonElement>('button')));
    const r = rows.findIndex((row) => row.includes(document.activeElement as HTMLButtonElement));
    if (r < 0) return;
    const c = rows[r].indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault();
    // (Kept from the player's own hotkeys: in the list, the arrows move between steps, not the volume or the film.)
    event.stopPropagation();
    let row = r;
    let col = c;
    if (event.key === 'ArrowDown') row = Math.min(rows.length - 1, r + 1);
    else if (event.key === 'ArrowUp') row = Math.max(0, r - 1);
    else if (event.key === 'Home') row = 0;
    else if (event.key === 'End') row = rows.length - 1;
    else col = Math.min(rows[r].length - 1, Math.max(0, c + (event.key === 'ArrowRight' ? 1 : -1)));
    col = Math.min(col, rows[row].length - 1);
    for (const button of rows.flat()) button.tabIndex = -1;
    rows[row][col].tabIndex = 0;
    rows[row][col].focus();
  }
}

/** The bar's key for the plan: the step you're in, and the plan shown or hidden. */
export class RnStepKeyElement extends HTMLElement {
  #abort: AbortController | null = null;
  #button: HTMLButtonElement | null = null;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const container = this.closest<HTMLElement>('media-container');
    const plan = container?.querySelector<HTMLElement>('rn-plan');
    this.innerHTML = '<button type="button" class="media-button rn-step-key"><span class="rn-step-key-count"></span> <span class="rn-step-key-title"></span><span class="rn-sr">, plan</span></button>';
    const button = this.querySelector('button')!;
    this.#button = button;
    if (plan) {
      plan.id ||= `rn-plan-${++ids}`;
      button.setAttribute('aria-controls', plan.id);
    }
    const open = () => container?.getAttribute('data-rn-plan') !== 'closed';
    const sync = () => button.setAttribute('aria-expanded', String(open()));
    let chosen = false;
    button.addEventListener('click', () => {
      chosen = true;
      container?.setAttribute('data-rn-plan', open() ? 'closed' : 'open');
      sync();
    }, { signal });
    // Until someone chooses, the plan is open where there is room for it beside the film, and closed on a phone.
    if (container) {
      const fit = () => {
        const width = container.clientWidth;
        if (chosen || !width) return;
        const want = width < 640 ? 'closed' : 'open';
        if (container.getAttribute('data-rn-plan') !== want) container.setAttribute('data-rn-plan', want);
        sync();
      };
      const watch = new ResizeObserver(fit);
      watch.observe(container);
      signal.addEventListener('abort', () => watch.disconnect());
      fit();
    }
    sync();
    whenRun(this, signal, (run) => {
      const show = () => {
        const n = run.steps.length;
        const i = run.ended ? n - 1 : Math.max(0, run.current);
        const step = run.steps[i];
        this.querySelector('.rn-step-key-count')!.textContent = !n ? '' : run.current < 0 && !run.ended ? `${n}` : `${run.ended ? n : i + 1}/${n}`;
        this.querySelector('.rn-step-key-title')!.textContent = !n ? 'Plan' : run.ended ? 'Completed' : run.current < 0 ? 'steps, ready' : run.looping >= 0 ? `${step.title} ×${run.rounds}` : step.title;
        // Its name is the words it shows, then, heard only, what it opens (WCAG 2.5.3).
      };
      run.addEventListener('steps', show, { signal });
      run.addEventListener('step', show, { signal });
      run.addEventListener('loop', show, { signal });
      show();
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }
}

/** The log line: the film's captions, written in as the step's log. */
export class RnLogElement extends HTMLElement {
  #abort: AbortController | null = null;
  #frame = 0;
  #typed: HTMLElement | null = null;
  #rest: HTMLElement | null = null;
  #text = '';

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.setAttribute('aria-hidden', 'true');
    this.innerHTML = '<span class="rn-log-prompt">›</span><span class="rn-log-step"></span><span class="rn-log-line"><span class="rn-log-typed"></span><span class="rn-log-caret"></span><span class="rn-log-rest"></span></span><span class="rn-log-done"></span>';
    this.#typed = this.querySelector('.rn-log-typed');
    this.#rest = this.querySelector('.rn-log-rest');
    whenRun(this, signal, (run) => {
      const { video } = run;
      let watched: TextTrack | null = null;
      const captions = () => Array.from(video.textTracks).find((t) => (t.kind === 'captions' || t.kind === 'subtitles') && t.mode === 'showing') ?? null;
      const show = () => {
        const track = captions();
        if (track !== watched) {
          watched?.removeEventListener('cuechange', show);
          watched = track;
          watched?.addEventListener('cuechange', show);
        }
        const cue = track ? (Array.from(track.activeCues ?? []).at(-1) as VTTCue | undefined) : undefined;
        const step = run.steps[Math.max(0, run.current)];
        const line = cue ? cue.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
        this.toggleAttribute('data-caption', !!line);
        const text = line || (run.ended ? `Completed in ${clock(video.duration)}` : run.current >= 0 && step ? step.title : run.steps.length ? 'Ready to run' : '');
        // Moved by hand (a drag, a seek), the line decodes into place; playing on, it is typed.
        const slider = this.closest('media-container')?.querySelector('media-time-slider');
        if (line && (video.seeking || slider?.hasAttribute('data-dragging'))) this.#decode(line);
        else this.#write(text, !!line && !video.paused);
      };
      video.textTracks.addEventListener('change', show, { signal });
      video.addEventListener('seeked', show, { signal });
      video.textTracks.addEventListener('addtrack', show, { signal });
      run.addEventListener('step', show, { signal });
      run.addEventListener('steps', show, { signal });

      // The step it is on, for the line when the controls are away (run.css draws it as a pill with the step's
      // progress), and, as a step is finished in play, a moment's word of it: "✓ Predict a word · 15.5 s".
      const container = run.container;
      const stepTag = this.querySelector<HTMLElement>('.rn-log-step')!;
      const done = this.querySelector<HTMLElement>('.rn-log-done')!;
      let was = run.current;
      let toast = 0;
      const progress = () => {
        const step = run.steps[run.current];
        const p = step ? Math.min(1, Math.max(0, (video.currentTime - step.start) / Math.max(0.001, step.end - step.start))) : 0;
        container.style.setProperty('--rn-run-progress', p.toFixed(3));
      };
      const onStep = () => {
        const n = run.steps.length;
        stepTag.textContent = n && run.current >= 0 ? `${run.current + 1}/${n}` : '';
        const finished = run.steps[was];
        if (finished && run.current === was + 1 && !video.paused && !video.seeking) {
          done.textContent = `✓ ${finished.title} · ${(finished.end - finished.start).toFixed(1)} s`;
          this.toggleAttribute('data-done', true);
          clearTimeout(toast);
          toast = window.setTimeout(() => this.removeAttribute('data-done'), 1800);
        }
        was = run.current;
        progress();
      };
      run.addEventListener('step', onStep, { signal });
      run.addEventListener('tick', progress, { signal });
      onStep();
      show();
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    cancelAnimationFrame(this.#frame);
  }

  #decode(text: string) {
    if (text === this.#text) return;
    this.#text = text;
    cancelAnimationFrame(this.#frame);
    this.#rest!.textContent = '';
    this.removeAttribute('data-typing');
    this.#stopDecode?.();
    // Under a drag the line changes many times a second: it is set as it is, readable at once.
    this.#typed!.textContent = text;
  }

  #stopDecode: (() => void) | null = null;
  #typing = 0;

  /** Puts a line in, typed if it is new, playing, and motion is welcome. The rest of it holds its place, unseen. */
  #write(text: string, type: boolean) {
    if (text === this.#text) return;
    this.#text = text;
    cancelAnimationFrame(this.#frame);
    this.#stopDecode?.();
    const typed = this.#typed!;
    const rest = this.#rest!;
    if (!type || reduced()) {
      typed.textContent = text;
      rest.textContent = '';
      this.removeAttribute('data-typing');
      return;
    }
    // The line streams in a word at a time, each out of a light blur, the way a model's answer arrives; all of it
    // is laid out from the start, so nothing reflows. Quick enough to read with the film: in within 0.7 s.
    const words = text.split(/(\s+)/);
    const count = words.filter((w) => w.trim()).length;
    const per = Math.min(70, 700 / Math.max(1, count));
    let n = 0;
    rest.textContent = '';
    typed.replaceChildren(
      ...words.map((word) => {
        if (!word.trim()) return document.createTextNode(word);
        const span = document.createElement('span');
        span.className = 'rn-log-word';
        span.style.setProperty('--rn-d', `${Math.round(n++ * per)}ms`);
        span.textContent = word;
        return span;
      }),
    );
    this.toggleAttribute('data-typing', true);
    clearTimeout(this.#typing);
    this.#typing = window.setTimeout(() => this.removeAttribute('data-typing'), n * per + 320);
  }
}

/** The end of the run: "Completed in 1:12 · 7 steps". */
export class RnDoneElement extends HTMLElement {
  #abort: AbortController | null = null;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', 'Run report');
    this.innerHTML = `
      <span class="rn-done-kicker">Run report</span>
      <span class="rn-done-title"></span>
      <ol class="rn-trace"></ol>
      <div class="rn-done-foot">
        <span class="rn-done-meta"></span>
        <button type="button" class="rn-done-again"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3.75 9a5.25 5.25 0 1 0 1.6-3.78M3.75 3.25v2.5h2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Run again</button>
      </div>`;
    whenRun(this, signal, (run) => {
      const { video } = run;
      // The viewer's own run, measured here: wall time from the first play, stops, steps repeated, seeks.
      let began = 0;
      let stops = 0;
      let seeks = 0;
      let repeats = 0;
      video.addEventListener('play', () => {
        if (!began || run.ended) {
          began = performance.now();
          stops = 0;
          seeks = 0;
          repeats = 0;
        }
      }, { signal });
      video.addEventListener('pause', () => {
        if (!video.ended && video.currentTime < (video.duration || Infinity) - 0.3) stops++;
      }, { signal });
      video.addEventListener('seeked', () => {
        if (run.looping < 0) seeks++;
      }, { signal });
      run.addEventListener('loop', () => {
        if (run.looping >= 0 && run.rounds > 1) repeats++;
      }, { signal });

      this.querySelector('.rn-done-again')!.addEventListener('click', () => {
        run.repeat(-1);
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }, { signal });
      const trace = this.querySelector<HTMLOListElement>('.rn-trace')!;
      trace.addEventListener('click', (event) => {
        const row = (event.target as Element).closest<HTMLButtonElement>('button[data-index]');
        if (row) run.seekTo(Number(row.dataset.index));
      }, { signal });

      const show = () => {
        const d = video.duration;
        this.querySelector('.rn-done-title')!.textContent = Number.isFinite(d) ? `Completed in ${clock(d)}` : 'Completed';
        const n = run.steps.length;
        if (Number.isFinite(d) && d > 0) {
          trace.replaceChildren(
            ...run.steps.map((step, index) => {
              const li = document.createElement('li');
              li.style.setProperty('--rn-i', String(index));
              const button = document.createElement('button');
              button.type = 'button';
              button.dataset.index = String(index);
              button.className = 'rn-trace-row';
              const span = step.end - step.start;
              button.setAttribute('aria-label', `${step.title}, ${spoken(span)}, from ${clock(step.start)}. Go to this step`);
              button.innerHTML = '<span class="rn-trace-title" aria-hidden="true"></span><span class="rn-trace-lane" aria-hidden="true"><span class="rn-trace-bar"></span></span><span class="rn-trace-time" aria-hidden="true"></span>';
              button.querySelector('.rn-trace-title')!.textContent = step.title;
              button.querySelector('.rn-trace-time')!.textContent = `${span.toFixed(1)} s`;
              const bar = button.querySelector<HTMLElement>('.rn-trace-bar')!;
              bar.style.setProperty('--rn-from', String(step.start / d));
              bar.style.setProperty('--rn-span', String(span / d));
              li.append(button);
              return li;
            }),
          );
        }
        const parts = [`${n} step${n === 1 ? '' : 's'}`];
        if (began && run.ended) {
          parts.push(`your run took ${clock((performance.now() - began) / 1000)}`);
          if (stops) parts.push(`stopped ${stops}×`);
          if (repeats) parts.push(`${repeats} step${repeats === 1 ? '' : 's'} run again`);
          if (seeks) parts.push(`moved ${seeks}×`);
        }
        this.querySelector('.rn-done-meta')!.textContent = parts.join(' · ');
      };
      run.addEventListener('step', show, { signal });
      run.addEventListener('steps', show, { signal });
      video.addEventListener('durationchange', show, { signal });
      video.addEventListener('ended', show, { signal });
      show();
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }
}

for (const [name, element] of [
  ['rn-plan', RnPlanElement],
  ['rn-step-key', RnStepKeyElement],
  ['rn-log', RnLogElement],
  ['rn-done', RnDoneElement],
] as const) {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, element);
}
