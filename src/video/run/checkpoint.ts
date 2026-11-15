/**
 * Checkpoint: what a pause is in a run. Stop the film mid-run and the player keeps a checkpoint of where it is, as
 * an agent keeps its state, and lays the moment out as its context window: the frame it stopped on shrinks to the
 * middle, framed in brass, and the moments either side of it come in beside it, smaller and dimmer the further they
 * are, two seconds apart. Over them, where the run is (the step, how far into it); under them, the line said there,
 * and keys to save the frame as a picture or copy a link that opens the film at this moment.
 *
 * The row is one control, a slider through time: the arrow keys (or a swipe, or a click on a frame beside) move the
 * stop two seconds either way, and the row slides with it. Escape, a play or any other seek puts it away. A page can
 * turn it off with `data-rn-checkpoint="off"` on the player.
 *
 * Everything on it is the film's own (its chapters, its captions, its frames from Mux or drawn from the film) and the
 * player's clock. Under reduced motion nothing moves: the row is simply there.
 */
import { drawnFrame, frame } from './compare';
import { clock, whenRun, type Run } from './run';

/** Seconds between two frames of the row, and how many frames stand either side of the stop. */
const STEP = 2;
const SIDE = 3;
/** How large each frame beside the stop is, by its distance from it, and how strong. */
const SCALE = [1, 0.72, 0.54, 0.42];
const DIM = [1, 0.62, 0.36, 0.18];

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

let ids = 0;

/** "0:42.2": the clock to a tenth. */
export function stamp(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${clock(s)}.${Math.floor((s % 1) * 10)}`;
}

/** The row's times around a stop, `STEP` apart and inside the film; offset 0 is the stop. */
export function contextTimes(at: number, duration: number): { k: number; t: number }[] {
  const end = Number.isFinite(duration) && duration > 0 ? duration - 0.05 : Infinity;
  const out: { k: number; t: number }[] = [];
  for (let k = -SIDE; k <= SIDE; k++) {
    const t = at + k * STEP;
    if (t >= 0 && t <= end) out.push({ k, t });
  }
  return out;
}

interface Frame {
  el: HTMLElement;
  t: number;
  k: number;
}

export class RnCheckpointElement extends HTMLElement {
  #abort: AbortController | null = null;
  #timer = 0;
  #at = 0;
  #swiped = false;
  #run: Run | null = null;
  #frames = new Map<string, Frame>();
  #rail: HTMLElement | null = null;
  /** When the row was taken: a frame beside the stop that arrives soon after comes in then, not before. */
  #taken = -Infinity;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const id = `rn-checkpoint-${++ids}`;
    this.hidden = true;
    this.setAttribute('role', 'region');
    this.setAttribute('aria-labelledby', `${id}-title`);
    this.innerHTML = `
      <div class="rn-checkpoint-head">
        <p class="rn-checkpoint-kicker" id="${id}-title"><span class="rn-checkpoint-word">Checkpoint</span> <span class="rn-checkpoint-time"></span></p>
        <p class="rn-checkpoint-step"><span class="rn-checkpoint-title"></span><span class="rn-checkpoint-into"></span></p>
      </div>
      <div class="rn-checkpoint-rail" role="slider" tabindex="0" aria-label="Context: the moments around this one" aria-describedby="${id}-hint"></div>
      <div class="rn-checkpoint-foot">
        <p class="rn-checkpoint-line"></p>
        <div class="rn-checkpoint-keys">
          <span class="rn-checkpoint-hint" id="${id}-hint">← → move through the context</span>
          <button type="button" class="media-button rn-checkpoint-key" data-act="save"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v8.5M5.5 8 9 11.5 12.5 8M3.5 14.5h11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="rn-checkpoint-key-word">Save frame</span></button>
          <button type="button" class="media-button rn-checkpoint-key" data-act="link"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M7.5 10.5 10.5 7.5M8 5.5l1.2-1.2a2.8 2.8 0 0 1 4 4L12 9.5M10 12.5l-1.2 1.2a2.8 2.8 0 0 1-4-4L6 8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="rn-checkpoint-key-word">Copy link</span></button>
        </div>
      </div>`;
    this.#rail = this.querySelector('.rn-checkpoint-rail');
    whenRun(this, signal, (run) => {
      this.#run = run;
      const { video, container } = run;
      const rail = this.#rail!;
      const later = () => {
        clearTimeout(this.#timer);
        // A pause that holds: not a seek's, not the end's, not a drag's, and not before the run has begun.
        this.#timer = window.setTimeout(() => {
          const dragging = container.querySelector('media-time-slider')?.hasAttribute('data-dragging');
          const off = container.closest('[data-rn-checkpoint="off"]');
          if (!off && video.paused && !video.ended && !video.seeking && !dragging && container.hasAttribute('data-rn-started') && run.steps.length) this.#open();
        }, 200);
      };
      // The row's frames are asked for the moment the film stops, so they are in by the time the row comes in.
      const ahead = () => {
        if (!run.framed || container.closest('[data-rn-checkpoint="off"]')) return;
        for (const { t } of contextTimes(video.currentTime, video.duration)) {
          void frame(run, t).then((src) => {
            const img = new Image();
            img.src = src;
          }, () => undefined);
        }
      };
      video.addEventListener('pause', () => {
        if (!video.ended && container.hasAttribute('data-rn-started')) ahead();
        later();
      }, { signal });
      for (const type of ['play', 'ended', 'emptied']) video.addEventListener(type, () => this.#close(), { signal });
      // The row's own seeks land on its stop: they keep it (and draw the frame there). Any other seek puts it away, and
      // a paused film that lands elsewhere is kept again there.
      const ours = () => Math.abs(video.currentTime - this.#at) < 0.05;
      video.addEventListener('seeking', () => {
        if (!(ours() && !this.hidden)) this.#close();
      }, { signal });
      video.addEventListener('seeked', () => {
        if (ours()) {
          if (!this.hidden) this.#draw(run);
        } else if (video.paused) later();
      }, { signal });
      // Asked for the plan, the commands, Reasoning or a before-and-after, the checkpoint steps aside for it.
      const asked = new MutationObserver((records) => {
        if (this.hidden) return;
        const opened = records.some((r) => {
          const el = r.target as Element;
          if (r.attributeName === 'aria-expanded') return el.matches('.rn-palette-key, .rn-reasoning-key, .rn-step-key') && el.getAttribute('aria-expanded') === 'true';
          return r.attributeName === 'data-rn-comparing' && container.hasAttribute('data-rn-comparing');
        });
        if (opened) this.#close();
      });
      asked.observe(container, { attributes: true, subtree: true, attributeFilter: ['aria-expanded', 'data-rn-comparing'] });
      signal.addEventListener('abort', () => asked.disconnect());
      const resize = new ResizeObserver(() => !this.hidden && this.#layout(false));
      resize.observe(this);
      signal.addEventListener('abort', () => resize.disconnect());

      this.addEventListener('click', (event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (button?.dataset.act === 'save') return void this.#save(run, button);
        if (button?.dataset.act === 'link') return this.#link(button);
        const picked = (event.target as Element).closest<HTMLElement>('.rn-checkpoint-frame');
        const k = Number(picked?.dataset.k ?? 0);
        if (picked && k) this.#move(k);
      }, { signal });
      this.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.#close();
          container.querySelector<HTMLElement>('.video-controls-row .media-play-button')?.focus();
          return;
        }
        if (event.target !== rail) return;
        const by = ({ ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -SIDE, PageUp: SIDE } as Record<string, number>)[event.key];
        if (!by) return;
        // The row's keys are its own, not the player's hotkeys (which would seek the film five seconds as well).
        event.preventDefault();
        event.stopPropagation();
        this.#move(by);
      }, { signal });
      // A swipe along the row moves it, a frame per swipe; the click a swipe ends with is not a pick.
      let from: { x: number; id: number } | null = null;
      rail.addEventListener('pointerdown', (event) => (from = { x: event.clientX, id: event.pointerId }), { signal });
      rail.addEventListener('pointerup', (event) => {
        if (!from || from.id !== event.pointerId) return;
        const dx = event.clientX - from.x;
        from = null;
        if (Math.abs(dx) <= 32) return;
        this.#swiped = true;
        this.#move(dx < 0 ? 1 : -1);
      }, { signal });
      rail.addEventListener('click', (event) => {
        if (!this.#swiped) return;
        this.#swiped = false;
        event.stopPropagation();
      }, { signal, capture: true });
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    clearTimeout(this.#timer);
  }

  #open() {
    const run = this.#run;
    if (!run) return;
    this.#at = run.video.currentTime;
    this.#foot(run);
    const fresh = this.hidden;
    this.hidden = false;
    run.container.toggleAttribute('data-rn-checkpointing', true);
    for (const f of this.#frames.values()) f.el.remove();
    this.#frames.clear();
    this.#fill(run);
    this.#layout(false);
    this.#draw(run);
    if (fresh) this.#take();
    const say = run.container.querySelector<HTMLElement>('rn-say');
    if (say) {
      say.textContent = '';
      const text = `Checkpoint at ${clock(this.#at)}. ${this.querySelector('.rn-checkpoint-into')?.textContent ?? ''}`;
      requestAnimationFrame(() => (say.textContent = text));
    }
  }

  #close() {
    clearTimeout(this.#timer);
    if (this.hidden) return;
    // Focus inside goes back to the bar before the row leaves, so it is never lost.
    if (this.contains(document.activeElement)) this.#run?.container.querySelector<HTMLElement>('.video-controls-row .media-play-button')?.focus();
    this.hidden = true;
    this.removeAttribute('data-ready');
    this.#run?.container.removeAttribute('data-rn-checkpointing');
  }

  /** Where the picture's free foot is: above the bar where the bar lies over it, the edge where it hangs below. */
  #foot(run: Run) {
    const { container } = run;
    const bar = container.querySelector<HTMLElement>('.video-controls-bottom');
    let foot = 0;
    if (bar && !container.hasAttribute('data-rn-pad')) {
      const over = container.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
      if (over > 0) foot = over;
    }
    this.style.setProperty('--rn-checkpoint-foot', `${Math.round(foot)}px`);
  }

  /** Moves the stop `by` frames along the row: the film goes there (still paused) and the row slides. */
  #move(by: number) {
    const run = this.#run;
    if (!run) return;
    const end = Number.isFinite(run.video.duration) ? run.video.duration - 0.05 : Infinity;
    const to = Math.min(end, Math.max(0, this.#at + by * STEP));
    if (Math.abs(to - this.#at) < 0.01) return;
    this.#at = to;
    run.video.currentTime = to;
    this.#fill(run);
    this.#layout(true);
  }

  /** The words for where the stop is, and the row's frames for it, kept by their time so a move slides them. */
  #fill(run: Run) {
    const { video } = run;
    const at = this.#at;
    const index = run.steps.reduce((found, s, i) => (at + 0.05 >= s.start ? i : found), -1);
    const step = run.steps[index];
    this.querySelector('.rn-checkpoint-time')!.textContent = stamp(at);
    this.querySelector('.rn-checkpoint-title')!.textContent = step ? step.title : '';
    this.querySelector('.rn-checkpoint-into')!.textContent = step ? `${(at - step.start).toFixed(1)} s into step ${index + 1} of ${run.steps.length}` : '';
    const track = Array.from(video.textTracks).find((t) => (t.kind === 'captions' || t.kind === 'subtitles') && t.mode !== 'disabled');
    const cue = track ? (Array.from(track.cues ?? []) as VTTCue[]).filter((c) => c.startTime <= at + 0.01 && c.endTime > at).at(-1) : undefined;
    const line = cue ? cue.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    this.querySelector('.rn-checkpoint-line')!.textContent = line ? `“${line}”` : '';
    const rail = this.#rail!;
    rail.setAttribute('aria-valuemin', '0');
    rail.setAttribute('aria-valuemax', String(Math.round(Number.isFinite(video.duration) ? video.duration : 0)));
    rail.setAttribute('aria-valuenow', at.toFixed(1));
    rail.setAttribute('aria-valuetext', `${clock(at)}${step ? `, ${step.title}` : ''}`);

    const keep = new Set<string>();
    for (const { k, t } of contextTimes(at, video.duration)) {
      const key = t.toFixed(1);
      keep.add(key);
      let f = this.#frames.get(key);
      if (!f) {
        const el = document.createElement('div');
        el.className = 'rn-checkpoint-frame';
        el.innerHTML = '<span class="rn-checkpoint-pic"><img alt="" decoding="async"></span><span class="rn-checkpoint-at"></span>';
        const made: Frame = { el, t, k };
        f = made;
        this.#frames.set(key, made);
        rail.append(el);
        if (run.framed) {
          // Each try loads into an image of its own, which then takes the frame's place (an image whose first
          // address failed may refuse a second one's decode, as Firefox's does).
          const show = (src: string) =>
            new Promise<void>((resolve, reject) => {
              const img = new Image();
              img.alt = '';
              img.decoding = 'async';
              img.onload = () => {
                el.querySelector('img')?.replaceWith(img);
                resolve();
              };
              img.onerror = () => reject(new Error('frame'));
              // A picture that neither comes nor fails (a request held or dropped without a word) is given up.
              window.setTimeout(() => reject(new Error('frame')), 5000);
              img.src = src;
            });
          // From Mux where it is the film's home; drawn from the film itself should Mux's picture not come.
          frame(run, t)
            .then(show)
            .catch(() => drawnFrame(run, t).then(show))
            .then(() => {
              made.el.setAttribute('data-in', '');
              this.#arrive(made);
            }, () => made.el.setAttribute('data-missing', ''))
            .then(() => this.#ready());
        } else el.setAttribute('data-missing', '');
        // New at an edge of a moving row: it comes in from beyond that edge.
        if (!this.hidden && rail.clientWidth) this.#place(made, k + Math.sign(k || 1), false, 0);
      }
      f.k = k;
      f.el.dataset.k = String(k);
      f.el.toggleAttribute('data-now', k === 0);
      f.el.querySelector('.rn-checkpoint-at')!.textContent = k === 0 ? stamp(t) : `${k < 0 ? '−' : '+'}${Math.abs(k * STEP)} s`;
    }
    for (const [key, f] of this.#frames) {
      if (keep.has(key)) continue;
      this.#frames.delete(key);
      const out = f.k + Math.sign(f.k || 1);
      this.#place(f, out, true, 0);
      window.setTimeout(() => f.el.remove(), reduced() ? 0 : 300);
    }
    this.#ready();
  }

  /** Ready once every frame of the row is in (or known missing): the still state the tests wait for. */
  #ready() {
    const all = [...this.#frames.values()].every((f) => f.el.hasAttribute('data-in') || f.el.hasAttribute('data-missing'));
    this.toggleAttribute('data-ready', all);
  }

  /** The row's geometry: the stop's frame as large as the room allows, the others beside it by their distance. */
  #metrics() {
    const rail = this.#rail!;
    const video = this.#run?.video;
    const ratio = video && video.videoWidth ? video.videoWidth / video.videoHeight : 16 / 9;
    const w = Math.max(80, Math.min(rail.clientWidth * 0.5, (rail.clientHeight - 24) * ratio));
    return { w, h: w / ratio, gap: Math.max(8, w * 0.05) };
  }

  /** Where a frame `k` steps from the stop stands, how large and how strong. */
  #place(f: Frame, k: number, animate: boolean, opacity?: number) {
    const { w, gap } = this.#metrics();
    const d = Math.min(Math.abs(k), SCALE.length - 1);
    let x = 0;
    for (let i = 1; i <= Math.abs(k); i++) {
      const a = SCALE[Math.min(i - 1, SCALE.length - 1)];
      const b = SCALE[Math.min(i, SCALE.length - 1)];
      x += (w * a) / 2 + gap + (w * b) / 2;
    }
    x *= Math.sign(k);
    const el = f.el;
    el.style.setProperty('--rn-frame-w', `${w.toFixed(1)}px`);
    el.style.setProperty('--rn-s', String(SCALE[d]));
    el.style.transition = animate && !reduced() ? `transform 280ms ${EASE}, opacity 280ms ${EASE}` : 'none';
    el.style.transform = `translate(-50%, -50%) translateX(${x.toFixed(1)}px) scale(${SCALE[d]})`;
    // The picture dims with distance; its time never does (run.css), and the farthest frames carry none.
    el.style.setProperty('--rn-dim', String(DIM[d]));
    el.toggleAttribute('data-far', d >= SIDE);
    el.style.opacity = String(opacity ?? 1);
    el.style.zIndex = String(10 - d);
  }

  #layout(animate: boolean) {
    for (const f of this.#frames.values()) this.#place(f, f.k, animate);
  }

  /** The stop's own frame, drawn from the film itself over its thumbnail, once the film is there. */
  #draw(run: Run) {
    const now = [...this.#frames.values()].find((f) => f.k === 0);
    for (const c of this.querySelectorAll('.rn-checkpoint-pic canvas')) if (!now?.el.contains(c)) c.remove();
    if (!now) return;
    const { video } = run;
    if (video.readyState < 2 || Math.abs(video.currentTime - now.t) > 0.3) return;
    let canvas = now.el.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      now.el.querySelector('.rn-checkpoint-pic')!.append(canvas);
    }
    canvas.width = Math.min(1280, video.videoWidth);
    canvas.height = Math.round((canvas.width * video.videoHeight) / Math.max(1, video.videoWidth));
    try {
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      now.el.setAttribute('data-in', '');
      this.#ready();
    } catch {
      canvas.remove();
    }
  }

  /** A frame beside the stop whose picture arrives after the take comes in as it arrives. */
  #arrive(f: Frame) {
    if (reduced() || f.k === 0 || this.hidden || performance.now() - this.#taken > 2500) return;
    if (performance.now() - this.#taken < 160 + Math.abs(f.k) * 45) return;
    f.el.animate([{ opacity: 0, transform: `${f.el.style.transform} scale(0.94)` }, { opacity: 1, transform: f.el.style.transform }], { duration: 280, easing: EASE });
  }

  /** The take: the frame comes down from the whole picture into its place, and the context comes in beside it. */
  #take() {
    this.#taken = performance.now();
    if (reduced()) return;
    const rail = this.#rail!;
    const { w, h } = this.#metrics();
    const box = this.getBoundingClientRect();
    const r = rail.getBoundingClientRect();
    for (const f of this.#frames.values()) {
      if (f.k === 0) {
        const scale = Math.max(box.width / w, box.height / h);
        const dy = box.top + box.height / 2 - (r.top + r.height / 2);
        f.el.animate([{ transform: `translate(-50%, -50%) translateY(${dy.toFixed(1)}px) scale(${scale.toFixed(3)})` }, { transform: f.el.style.transform }], { duration: 420, easing: EASE });
      } else if (f.el.hasAttribute('data-in')) {
        f.el.animate([{ opacity: 0, transform: `translate(-50%, -50%) scale(${SCALE[1] * 0.9})` }, { opacity: 1, transform: f.el.style.transform }], { duration: 320, delay: 160 + Math.abs(f.k) * 45, easing: EASE, fill: 'backwards' });
      }
    }
    this.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE });
    for (const part of this.querySelectorAll<HTMLElement>('.rn-checkpoint-head, .rn-checkpoint-foot')) {
      part.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: 300, easing: EASE, fill: 'backwards' });
    }
  }

  /** The frame as a picture with its checkpoint written under it, saved as a file. */
  async #save(run: Run, button: HTMLButtonElement) {
    const word = button.querySelector('.rn-checkpoint-key-word')!;
    const at = this.#at;
    try {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('frame'));
          window.setTimeout(() => reject(new Error('frame')), 5000);
          img.src = src;
        });
      const mux = run.frameAt(at, 1280);
      const img = mux ? await load(mux).catch(async () => load(await drawnFrame(run, at))) : await load(await drawnFrame(run, at));
      const width = 1280;
      const height = Math.round((width * img.naturalHeight) / Math.max(1, img.naturalWidth));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height + 132;
      const ctx = canvas.getContext('2d')!;
      const styles = getComputedStyle(run.container);
      const ink = styles.getPropertyValue('--rn-ink').trim() || '#0f1318';
      const brass = styles.getPropertyValue('--rn-signal-own').trim() || '#c9ae78';
      const paper = styles.getPropertyValue('--rn-text').trim() || '#e9e6df';
      const muted = styles.getPropertyValue('--rn-text-2').trim() || '#aab1bc';
      ctx.fillStyle = ink;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, height);
      // The brass corners the player draws on the stop.
      ctx.strokeStyle = brass;
      ctx.lineWidth = 3;
      for (const [x, y, dx, dy] of [[22, 22, 1, 1], [width - 22, 22, -1, 1], [22, height - 22, 1, -1], [width - 22, height - 22, -1, -1]] as const) {
        ctx.beginPath();
        ctx.moveTo(x, y + dy * 36);
        ctx.lineTo(x, y);
        ctx.lineTo(x + dx * 36, y);
        ctx.stroke();
      }
      ctx.font = `20px "Fragment Mono", ui-monospace, monospace`;
      ctx.fillStyle = brass;
      const head = `CHECKPOINT  ${stamp(at)}`;
      ctx.fillText(head, 40, height + 48);
      ctx.fillStyle = muted;
      const where = [this.querySelector('.rn-checkpoint-title')?.textContent, this.querySelector('.rn-checkpoint-into')?.textContent].filter(Boolean).join(' · ');
      ctx.fillText(where, 40 + ctx.measureText(`${head}    `).width, height + 48);
      ctx.font = `italic 34px "Instrument Serif", Georgia, serif`;
      ctx.fillStyle = paper;
      ctx.fillText(this.querySelector('.rn-checkpoint-line')?.textContent ?? '', 40, height + 98, width - 80);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('save');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `run-checkpoint-${stamp(at).replace(/[:.]/g, '-')}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.#flash(word, 'Saved');
    } catch {
      this.#flash(word, 'Not saved');
    }
  }

  #link(button: HTMLButtonElement) {
    const word = button.querySelector('.rn-checkpoint-key-word')!;
    const url = new URL(location.href);
    url.hash = `t=${this.#at.toFixed(1)}`;
    const failed = () => this.#flash(word, 'Not copied');
    if (navigator.clipboard) void navigator.clipboard.writeText(url.toString()).then(() => this.#flash(word, 'Copied'), failed);
    else failed();
  }

  /** A key's word says what happened, a moment, then its own word again. */
  #flash(word: Element, text: string) {
    const was = word.getAttribute('data-word') ?? word.textContent ?? '';
    word.setAttribute('data-word', was);
    word.textContent = text;
    window.setTimeout(() => (word.textContent = was), 1600);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-checkpoint')) customElements.define('rn-checkpoint', RnCheckpointElement);
