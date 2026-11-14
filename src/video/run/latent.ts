/**
 * Seeking, lit. While the time slider is dragged, the film stays in view and seeks under the hand; over it, the
 * player's brass traces the picture's edge as a turning glow (the halo people now read as an assistant at work), and
 * a band of light crosses the picture each time it lands somewhere new. Let go, and the light goes. It answers the
 * hand only, and under reduced motion nothing of it is drawn.
 */
import { whenRun } from './run';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class RnLatentElement extends HTMLElement {
  #abort: AbortController | null = null;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.setAttribute('aria-hidden', 'true');
    this.innerHTML = '<span class="rn-halo"></span><span class="rn-sweep"></span>';
    const sweep = this.querySelector<HTMLElement>('.rn-sweep')!;
    whenRun(this, signal, (run) => {
      const slider = run.container.querySelector<HTMLElement>('media-time-slider');
      if (!slider) return;
      let last = -1;
      let lastAt = 0;
      slider.addEventListener('pointermove', (event) => {
        if (reduced() || !slider.hasAttribute('data-dragging')) return;
        const box = slider.getBoundingClientRect();
        const d = run.video.duration;
        if (!Number.isFinite(d) || !box.width) return;
        const time = ((event.clientX - box.left) / box.width) * d;
        const now = performance.now();
        // A pass of light for each new place, no more often than it can be seen through.
        if (Math.abs(time - last) < 0.5 || now - lastAt < 260) return;
        sweep.setAttribute('data-dir', time >= last ? 'on' : 'back');
        last = time;
        lastAt = now;
        sweep.removeAttribute('data-pass');
        void sweep.offsetWidth;
        sweep.setAttribute('data-pass', '');
      }, { signal });
      new MutationObserver(() => {
        const on = slider.hasAttribute('data-dragging') && !reduced();
        if (on) {
          this.toggleAttribute('data-on', true);
          this.removeAttribute('data-leaving');
          return;
        }
        if (!this.hasAttribute('data-on')) return;
        this.setAttribute('data-leaving', '');
        setTimeout(() => {
          if (slider.hasAttribute('data-dragging')) return;
          this.removeAttribute('data-on');
          this.removeAttribute('data-leaving');
          last = -1;
        }, 420);
      }).observe(slider, { attributes: true, attributeFilter: ['data-dragging'] });
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-latent')) customElements.define('rn-latent', RnLatentElement);
