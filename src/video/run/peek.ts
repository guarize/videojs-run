/**
 * A step's peek: under a pointer, or the keyboard's focus, a step of the plan shows a card beside it with the step's
 * opening frame, its number and title, and the first line its log will say. It answers the pointer or the focus only;
 * it is decoration for sight (aria-hidden), since the step's own label says the same.
 */
import { frame, prefetch } from './compare';
import { clock, whenRun, type Run } from './run';

function firstLine(video: HTMLVideoElement, start: number, end: number): string {
  const track = Array.from(video.textTracks).find((t) => (t.kind === 'captions' || t.kind === 'subtitles') && t.cues?.length);
  const cue = track && (Array.from(track.cues ?? []) as VTTCue[]).find((c) => c.endTime > start + 0.05 && c.startTime < end);
  return cue ? cue.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

export class RnPeekElement extends HTMLElement {
  #abort: AbortController | null = null;
  #index = -1;
  #hide = 0;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.setAttribute('aria-hidden', 'true');
    this.hidden = true;
    this.innerHTML = `
      <div class="rn-peek-frame"><img class="rn-scrub-img" alt=""><img class="rn-scrub-img" alt=""><span class="rn-scrub-corners"><i></i><i></i><i></i><i></i></span></div>
      <div class="rn-scrub-meta"><span class="rn-scrub-step"><b class="rn-scrub-num"></b><span class="rn-scrub-title"></span></span><span class="rn-scrub-time"></span></div>
      <div class="rn-peek-line"></div>`;
    whenRun(this, signal, (run) => {
      const plan = run.container.querySelector<HTMLElement>('rn-plan');
      if (!plan) return;
      const hover = matchMedia('(hover: hover)');
      plan.addEventListener('pointerover', (event) => {
        if (!hover.matches || event.pointerType === 'touch') return;
        const step = (event.target as Element).closest<HTMLElement>('.rn-step');
        if (step) this.#show(run, step);
      }, { signal });
      plan.addEventListener('pointerleave', () => this.#later(), { signal });
      plan.addEventListener('focusin', (event) => {
        const step = (event.target as Element).closest<HTMLElement>('.rn-step');
        if (step && step.matches(':focus-visible')) this.#show(run, step);
        else this.#later();
      }, { signal });
      plan.addEventListener('focusout', () => this.#later(), { signal });
      run.addEventListener('compare', () => this.#close(), { signal });
      // Each step's opening frame, fetched once the plan is known, where a pointer can hover: the peek opens on it.
      const warm = () => {
        if (!hover.matches || !run.frameAt(0)) return;
        for (const step of run.steps) prefetch(run.frameAt(step.start + 0.4));
      };
      run.addEventListener('steps', warm, { signal });
      run.video.addEventListener('loadedmetadata', warm, { signal, once: true });
      warm();
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }

  #later() {
    clearTimeout(this.#hide);
    this.#hide = window.setTimeout(() => this.#close(), 120);
  }

  #close() {
    this.hidden = true;
    this.removeAttribute('data-open');
    this.#index = -1;
  }

  #show(run: Run, row: HTMLElement) {
    clearTimeout(this.#hide);
    const index = Number(row.dataset.index);
    const step = run.steps[index];
    if (!step || run.comparing >= 0 || !run.framed) return;
    const container = run.container;
    const box = container.getBoundingClientRect();
    const plan = container.querySelector('rn-plan')!.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    this.style.left = `${plan.right - box.left + 10}px`;
    this.style.top = `${Math.max(8, r.top - box.top + r.height / 2 - 18)}px`;
    if (index === this.#index && !this.hidden) return;
    this.#index = index;
    this.querySelector('.rn-scrub-num')!.textContent = `Step ${String(index + 1).padStart(2, '0')}`;
    this.querySelector('.rn-scrub-title')!.textContent = step.title;
    this.querySelector('.rn-scrub-time')!.textContent = clock(step.start);
    this.querySelector('.rn-peek-line')!.textContent = firstLine(run.video, step.start, step.end);
    const [a, b] = Array.from(this.querySelectorAll<HTMLImageElement>('.rn-scrub-img'));
    const front = a.hasAttribute('data-front') ? a : b.hasAttribute('data-front') ? b : null;
    const back = front === a ? b : a;
    this.hidden = false;
    requestAnimationFrame(() => this.toggleAttribute('data-open', true));
    void frame(run, step.start + 0.4).then((src) => {
      if (this.#index !== index) return;
      back.src = src;
      return back.decode().catch(() => undefined).then(() => {
        if (this.#index !== index) return;
        back.toggleAttribute('data-front', true);
        front?.toggleAttribute('data-front', false);
      });
    }, () => undefined);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-peek')) customElements.define('rn-peek', RnPeekElement);
