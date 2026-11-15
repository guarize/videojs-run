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

/** "<1 ms", "38 ms", "0.4 s", "1.2 s", "12 s": under a tenth of a second in whole milliseconds, never "0.0 s". */
export function seconds(ms: number): string {
  if (ms < 1) return '<1 ms';
  if (ms < 100) return `${Math.round(ms)} ms`;
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

/** The source in a few words, for a line in the log. */
export function sourceShort(choice: SourceChoice | undefined): string {
  if (!choice) return '';
  const from = host(choice.src);
  switch (choice.why) {
    case 'stream':
      return `picked ${from}'s HLS stream: this browser plays it itself`;
    case 'no-hls':
      return `picked ${from}'s MP4: this browser has no HLS of its own`;
    case 'failed':
      return `the first source failed, so it moved on to ${from}`;
    default:
      return `picked the file from ${from}`;
  }
}

/** Asides: at most one in this long, so the log stays the film's. */
const ASIDE_GAP = 8000;

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
  /** The last answer under 50 ms (too quick to count as a wait), said while no real wait has been; -1 for none. */
  #quick = -1;
  /** When the player last said something in the log, unasked, and the picture size it last said. */
  #asideAt = -Infinity;
  #saidSize = '';
  #first = true;
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
    clearTimeout(this.#sizeTimer);
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
      // While it is open and the film plays, the numbers are live: loaded ahead changes as it goes. Paused, the panel
      // holds what it last said (the pause draws it once more), so nothing on it moves while the film is still.
      this.#timer = window.setInterval(() => {
        if (this.#video && !this.#video.paused) this.#render();
      }, 500);
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
    video.addEventListener('playing', () => {
      this.#landed();
      if (!this.#first) return;
      this.#first = false;
      // The first frame of the run: what it took and what it chose, said once, after the network has been drawn.
      const container = this.closest<HTMLElement>('media-container');
      let tries = 0;
      const say = () => {
        if (container?.hasAttribute('data-rn-mind') && tries++ < 20) return void window.setTimeout(say, 150);
        const took = this.#thought || this.#quick;
        const size = rendition(video.videoHeight);
        const from = sourceShort(choiceOf(video));
        this.#saidSize = size;
        const line = [took >= 0 ? `Thought for ${seconds(took)}` : '', from].filter(Boolean).join(' · ');
        if (line) this.#aside(line[0].toUpperCase() + line.slice(1));
      };
      window.setTimeout(say, 400);
    }, opts);
    // A seek in play ends its wait at seeked or canplay, and may never fire playing again (WebKit).
    video.addEventListener('seeked', () => this.#landed(), opts);
    video.addEventListener('canplay', () => this.#landed(), opts);
    video.addEventListener('pause', () => {
      this.#asked = 0;
      this.toggleAttribute('data-thinking', false);
      const last = this.#thought || this.#quick;
      this.#label(last >= 0 ? `Thought for ${seconds(last)}` : 'Ready');
      if (this.open) this.#render();
    }, opts);
    video.addEventListener('resize', () => {
      const size = rendition(video.videoHeight);
      if (size && this.#sizes.at(-1) !== size) {
        this.#sizes.push(size);
        this.#marks.push({ at: video.currentTime, kind: 'size', label: size });
        // A change of picture in play is the stream's decision: said in the log, once the last aside has had its time.
        this.#sizeSoon(video);
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
    // there is none yet, the player says how few milliseconds it took).
    if (took < 50) {
      this.toggleAttribute('data-thinking', false);
      if (!this.#thought) {
        this.#quick = took;
        this.#label(`Thought for ${seconds(took)}`);
      }
      return;
    }
    // The first wait counts as one; every one after is a stall or a seek the player waited on.
    this.#waits++;
    this.#waited += took;
    this.#marks.push({ at: this.#askedAt, kind: 'wait', ms: took });
    this.#thought = took;
    this.toggleAttribute('data-thinking', false);
    if (this.#waits > 1 && took >= 300) this.#aside(`Waited ${seconds(took)} for the film`);
    this.#label(`Thought for ${seconds(took)}`);
    if (this.open) this.#render();
  }

  #sizeTimer = 0;

  /** Says the picture's new size in the log when it differs from the last said, waiting out the last aside's gap. */
  #sizeSoon(video: HTMLVideoElement) {
    clearTimeout(this.#sizeTimer);
    const size = rendition(video.videoHeight);
    if (!this.#saidSize || !size || size === this.#saidSize || video.paused) return;
    const wait = ASIDE_GAP - (performance.now() - this.#asideAt);
    if (wait > 0) {
      this.#sizeTimer = window.setTimeout(() => this.#sizeSoon(video), wait + 50);
      return;
    }
    this.#saidSize = size;
    this.#aside(`Switched to ${size}, as the stream allowed`);
  }

  /** A line the player says in the log, unasked, for a real decision it made (run.ts RnLogElement shows it a moment). */
  #aside(text: string) {
    // Said only while the film runs: a paused player changes nothing by itself.
    if (!this.#video || this.#video.paused) return;
    const now = performance.now();
    if (now - this.#asideAt < ASIDE_GAP) return;
    this.#asideAt = now;
    this.closest('media-container')?.dispatchEvent(new CustomEvent('rn-aside', { detail: text }));
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
