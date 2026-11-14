/**
 * Reasoning: the player's own decisions, said the way an assistant shows its thinking.
 *
 * The key reads "Thought for 0.4 s": the last time the film was waited for (from asking it to play, or from a stall,
 * to its first frame after), measured here. Open, it lists what the player actually decided and what it sees, all
 * read from the film and from sources.ts as it happens: which source it opened and why, the picture's size and its
 * changes, how much is loaded ahead, how many times and how long it waited, frames dropped. Nothing is invented and
 * no model is involved; the panel says so.
 */
import { lift } from './sheet';
import { choiceOf, type SourceChoice } from './sources';

let ids = 0;

/** "0.4 s", "1.2 s", "12 s". */
export function seconds(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`;
}

function host(src: string): string {
  try {
    const url = new URL(src, location.href);
    return url.host === location.host ? 'this site' : url.host === 'stream.mux.com' ? 'Mux' : url.host;
  } catch {
    return 'this site';
  }
}

/** What the player says about the source it took. */
export function sourceLine(choice: SourceChoice | undefined): string {
  if (!choice) return 'No source opened yet.';
  const from = host(choice.src);
  switch (choice.why) {
    case 'stream':
      return `Opened the HLS stream from ${from}: this browser plays HLS itself, so no library was loaded.`;
    case 'no-hls':
      return `Opened the MP4 from ${from}: this browser has no HLS of its own, and a file needs no library.`;
    case 'failed':
      return `The first source would not open, so it moved on to the next one, from ${from}.`;
    default:
      return `Opened the file from ${from}.`;
  }
}

function rendition(height: number): string {
  if (!height) return '';
  const steps = [2160, 1440, 1080, 720, 540, 480, 360, 240];
  const p = steps.find((h) => height >= h * 0.95) ?? height;
  return `${p}p`;
}

export class RnReasoningElement extends HTMLElement {
  #abort: AbortController | null = null;
  #video: HTMLVideoElement | null = null;
  #button: HTMLButtonElement | null = null;
  #panel: HTMLElement | null = null;
  #lines: HTMLElement | null = null;
  #asked = 0;
  #thought = 0;
  #waits = 0;
  #waited = 0;
  #sizes: string[] = [];
  /** Where in the film each wait happened and how long it took, and where the picture changed size. */
  #marks: { at: number; kind: 'wait' | 'size'; ms?: number; label?: string }[] = [];
  #askedAt = 0;
  #timer = 0;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const container = this.closest<HTMLElement>('media-container');
    const id = `rn-reasoning-${++ids}`;
    this.innerHTML = `
      <button type="button" class="media-button rn-reasoning-key" aria-expanded="false" aria-controls="${id}">
        <span class="rn-reasoning-glyph" aria-hidden="true"></span><span class="rn-reasoning-label">Thinking…</span>
      </button>
      <div class="rn-reasoning-panel" id="${id}" role="group" aria-label="Reasoning" hidden>
        <div class="rn-reasoning-head"><span class="rn-reasoning-title">Reasoning</span><button type="button" class="rn-reasoning-close" aria-label="Close reasoning"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>
        <div class="rn-reasoning-trace" aria-hidden="true"><div class="rn-trace-track"></div><div class="rn-trace-legend"><span><i class="rn-key-wait"></i>Waited</span><span><i class="rn-key-size"></i>Picture changed</span><span><i class="rn-key-loaded"></i>Loaded</span></div></div>
        <ul class="rn-reasoning-lines"></ul>
        <p class="rn-reasoning-note">Measured by the player · no model</p>
      </div>`;
    this.#button = this.querySelector('button');
    this.#panel = this.querySelector('.rn-reasoning-panel');
    this.#lines = this.querySelector('.rn-reasoning-lines');
    this.#button!.addEventListener('click', () => this.toggle(), { signal });
    this.querySelector('.rn-reasoning-close')!.addEventListener('click', () => this.toggle(false), { signal });
    container?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.open && (this.contains(document.activeElement) || this.#panel?.contains(document.activeElement))) {
        event.preventDefault();
        event.stopPropagation();
        this.toggle(false);
      }
    }, { signal, capture: true });
    document.addEventListener('pointerdown', (event) => {
      if (this.open && !this.contains(event.target as Node) && !this.#panel?.contains(event.target as Node)) this.toggle(false, false);
    }, { signal });

    const attach = () => {
      const video = container?.querySelector('video');
      if (!video || video === this.#video) return;
      this.#video = video;
      this.#listen(video, signal);
    };
    attach();
    if (!this.#video && container) {
      const watch = new MutationObserver(attach);
      watch.observe(container, { childList: true, subtree: true });
      signal.addEventListener('abort', () => watch.disconnect());
    }
  }

  disconnectedCallback() {
    this.#abort?.abort();
    clearInterval(this.#timer);
  }

  get open(): boolean {
    return this.#button?.getAttribute('aria-expanded') === 'true';
  }

  toggle(on = !this.open, focus = true) {
    if (!this.#button || !this.#panel) return;
    this.#button.setAttribute('aria-expanded', String(on));
    lift(this.#panel, on);
    this.#panel.hidden = !on;
    this.toggleAttribute('data-open', on);
    clearInterval(this.#timer);
    if (on) {
      this.#render();
      // While it is open the numbers are live: loaded ahead changes as the film plays.
      this.#timer = window.setInterval(() => this.#render(), 500);
    } else if (focus) {
      this.#button.focus();
    }
  }

  #listen(video: HTMLVideoElement, signal: AbortSignal) {
    const opts = { signal };
    const ask = () => {
      if (!this.#asked) {
        this.#asked = performance.now();
        this.#askedAt = video.currentTime;
      }
    };
    video.addEventListener('play', ask, opts);
    video.addEventListener('waiting', () => {
      ask();
      this.#label('Thinking…');
      this.toggleAttribute('data-thinking', true);
    }, opts);
    video.addEventListener('seeking', ask, opts);
    video.addEventListener('playing', () => this.#landed(), opts);
    // A seek in play ends its wait at seeked or canplay, and may never fire playing again (WebKit).
    video.addEventListener('seeked', () => this.#landed(), opts);
    video.addEventListener('canplay', () => this.#landed(), opts);
    video.addEventListener('pause', () => {
      this.#asked = 0;
      this.toggleAttribute('data-thinking', false);
      this.#label(this.#thought ? `Thought for ${seconds(this.#thought)}` : 'Ready');
    }, opts);
    video.addEventListener('resize', () => {
      const size = rendition(video.videoHeight);
      if (size && this.#sizes.at(-1) !== size) {
        this.#sizes.push(size);
        this.#marks.push({ at: video.currentTime, kind: 'size', label: size });
      }
      if (this.open) this.#render();
    }, opts);
    video.addEventListener('rn-source', () => this.open && this.#render(), opts);
    video.addEventListener('loadedmetadata', () => {
      if (!this.#asked && !this.#thought) this.#label('Ready');
    }, opts);
    if (video.readyState >= 1) this.#label('Ready');
  }

  #landed() {
    if (!this.#asked) return;
    const took = performance.now() - this.#asked;
    this.#asked = 0;
    // A seek answered within a frame or two was no wait: it is not counted, and the last real one stands (or, if
    // there is none yet, the player says it waited for nothing to speak of).
    if (took < 50) {
      this.toggleAttribute('data-thinking', false);
      if (!this.#thought) this.#label(`Thought for ${seconds(took)}`);
      return;
    }
    // The first wait counts as one; every one after is a stall or a seek the player waited on.
    this.#waits++;
    this.#waited += took;
    this.#marks.push({ at: this.#askedAt, kind: 'wait', ms: took });
    this.#thought = took;
    this.toggleAttribute('data-thinking', false);
    this.#label(`Thought for ${seconds(took)}`);
    if (this.open) this.#render();
  }

  #label(text: string) {
    const label = this.querySelector('.rn-reasoning-label');
    if (label && label.textContent !== text) label.textContent = text;
    this.#button?.setAttribute('aria-label', `Reasoning: ${text.replace('…', '')}`);
  }

  /** The trace: the film's length as a line, what is loaded on it, and where the player waited or changed size. */
  #trace(video: HTMLVideoElement) {
    const track = this.#panel?.querySelector<HTMLElement>('.rn-trace-track');
    const d = video.duration;
    if (!track || !Number.isFinite(d) || d <= 0) return;
    const pct = (t: number) => `${Math.min(100, Math.max(0, (t / d) * 100)).toFixed(2)}%`;
    const parts: HTMLElement[] = [];
    for (let i = 0; i < video.buffered.length; i++) {
      const band = document.createElement('span');
      band.className = 'rn-trace-loaded';
      band.style.left = pct(video.buffered.start(i));
      band.style.width = `calc(${pct(video.buffered.end(i))} - ${pct(video.buffered.start(i))})`;
      parts.push(band);
    }
    for (const mark of this.#marks) {
      const m = document.createElement('span');
      m.className = `rn-trace-mark rn-trace-${mark.kind}`;
      m.style.left = pct(mark.at);
      if (mark.kind === 'wait') m.style.setProperty('--rn-h', `${Math.min(18, 4 + (mark.ms ?? 0) / 120)}px`);
      if (mark.label) m.dataset.label = mark.label;
      parts.push(m);
    }
    const head = document.createElement('span');
    head.className = 'rn-trace-head';
    head.style.left = pct(video.currentTime);
    parts.push(head);
    track.replaceChildren(...parts);
  }

  #render() {
    const video = this.#video;
    const list = this.#lines;
    if (!video || !list) return;
    this.#trace(video);
    const lines: string[] = [sourceLine(choiceOf(video))];
    if (video.videoHeight) {
      const now = rendition(video.videoHeight);
      const before = this.#sizes.slice(0, -1);
      lines.push(
        before.length
          ? `Picture at ${now} (${video.videoWidth} × ${video.videoHeight}), after ${before.join(', ')}.`
          : `Picture at ${now} (${video.videoWidth} × ${video.videoHeight}).`,
      );
    }
    let ahead = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime + 0.1 && video.buffered.end(i) >= video.currentTime) ahead = video.buffered.end(i) - video.currentTime;
    }
    if (video.readyState >= 1) lines.push(ahead >= 0.5 ? `${Math.round(ahead)} s loaded ahead of the playhead.` : 'Nothing loaded ahead yet.');
    if (this.#waits) {
      lines.push(
        this.#waits === 1
          ? `Waited once, for ${seconds(this.#waited)}, before the first frame.`
          : `Waited ${this.#waits} times, ${seconds(this.#waited)} in all, the last for ${seconds(this.#thought)}.`,
      );
    }
    const quality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;
    if (quality && quality.totalVideoFrames > 0) {
      const dropped = quality.droppedVideoFrames;
      lines.push(dropped ? `Dropped ${dropped} of ${quality.totalVideoFrames} frames.` : `No frames dropped of ${quality.totalVideoFrames}.`);
    }
    const items = lines.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    });
    if (items.length !== list.children.length || items.some((li, i) => li.textContent !== list.children[i].textContent)) list.replaceChildren(...items);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-reasoning')) customElements.define('rn-reasoning', RnReasoningElement);
