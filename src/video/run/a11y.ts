/**
 * Semantics the markup and Video.js's primitives don't carry on their own (copied from Flipbook, where each was
 * found and tested):
 *
 * - The mute key is a plain toggle; the volume popup opens on hover and focus (WCAG 4.1.2).
 * - Escape in the volume popup puts focus back on the mute key instead of losing it.
 * - Tooltips stay open while the pointer is on them (WCAG 1.4.13).
 * - The large center play key is a pointer target only: Tab doesn't stop on "Run" twice in a row.
 * - Firefox makes the film itself a Tab stop: there it is taken out of the order.
 * - Waiting is said once, politely, as "Thinking" (the status announcer covers play, pause and the rest).
 */
interface OpenChange {
  open: boolean;
  reason?: string;
}

type Hoverable = HTMLElement & { disableHoverablePopup?: boolean; closeDelay?: number };
type HoverOpener = HTMLElement & { openOnHover?: boolean };

const TOOLTIP_LINGER = 120;

/** The keys the player answers to (skin.html's hotkeys, and Space and Enter, which are handled here). */
const PLAYER_KEYS = new Set([' ', 'Enter', 'k', 'm', 'f', 'c', 'i', 'j', 'l', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', '<', '>', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

export class RnA11yElement extends HTMLElement {
  #abort: AbortController | null = null;
  #observers: MutationObserver[] = [];

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.hidden = true;
    const container = this.closest<HTMLElement>('media-container');
    if (!container) return;
    queueMicrotask(() => {
      if (signal.aborted) return;
      this.#mute(container, signal);
      this.#tooltips(container);
      this.#centerPlay(container);
      this.#film(container);
      this.#waiting(container);
      this.#space(container, signal);
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    for (const observer of this.#observers) observer.disconnect();
    this.#observers = [];
  }

  #watch(target: Node, options: MutationObserverInit, react: () => void) {
    const observer = new MutationObserver(react);
    observer.observe(target, options);
    this.#observers.push(observer);
    react();
  }

  #mute(container: HTMLElement, signal: AbortSignal) {
    const mute = container.querySelector<HTMLElement>('media-mute-button');
    const popup = container.querySelector<HoverOpener>('media-volume-popover');
    if (!mute) return;
    const POPUP_ARIA = ['aria-haspopup', 'aria-expanded', 'aria-controls'];
    this.#watch(mute, { attributes: true, attributeFilter: POPUP_ARIA }, () => {
      for (const name of POPUP_ARIA) if (mute.hasAttribute(name)) mute.removeAttribute(name);
    });
    if (!popup) return;
    popup.addEventListener('open-change', (event) => {
      const detail = (event as CustomEvent<OpenChange>).detail;
      if (detail?.open || detail?.reason !== 'escape' || !popup.contains(document.activeElement)) return;
      const opens = popup.openOnHover;
      popup.openOnHover = false;
      mute.focus();
      popup.openOnHover = opens;
    }, { signal });
  }

  #tooltips(container: HTMLElement) {
    for (const tip of container.querySelectorAll<Hoverable>('media-tooltip')) {
      tip.disableHoverablePopup = false;
      if (!tip.closeDelay) tip.closeDelay = TOOLTIP_LINGER;
    }
  }

  #centerPlay(container: HTMLElement) {
    for (const play of container.querySelectorAll<HTMLElement>('.rn-center-play')) {
      // Video.js sets tabindex="0" each time the key connects.
      this.#watch(play, { attributes: true, attributeFilter: ['tabindex'] }, () => {
        if (play.getAttribute('tabindex') !== '-1') play.setAttribute('tabindex', '-1');
      });
    }
  }

  /** Firefox makes every film a Tab stop (and a second, its own picture-in-picture toggle). Told by a property only Firefox answers to. */
  #film(container: HTMLElement) {
    if (!CSS.supports('-moz-appearance', 'none')) return;
    const film = container.querySelector('video');
    if (film && !film.controls && !film.hasAttribute('tabindex')) film.tabIndex = -1;
  }

  /**
   * Space and Enter run and stop the film from anywhere: the page, the player, its track, its plan. A focused button
   * keeps its own Space and Enter (they press it), as does anything one types into. With several players on a page,
   * the one holding the focus answers, or else the one most in view. Measured in Firefox (Zen), where focus lands on
   * the film and the player in ways Chromium's does not.
   */
  #space(container: HTMLElement, signal: AbortSignal) {
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input:not([type="range"]), textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      const inside = !!target && container.contains(target);
      const onPage = !target || target === document.body || target === document.documentElement;
      if (!inside && !onPage) return;
      if (onPage && !this.#mostInView(container)) return;

      // The page has nothing focused: the player's own keys (arrows, M, F, C, J, K, L, numbers…) go to the player
      // most in view, as on a video site. Its container takes the focus quietly, and the key is handed on to it.
      if (onPage && PLAYER_KEYS.has(event.key) && event.key !== ' ' && event.key !== 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        container.focus({ preventScroll: true });
        container.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, code: event.code, shiftKey: event.shiftKey, bubbles: true, cancelable: true }));
        return;
      }

      if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat) return;
      // A button presses itself, except a step of the plan: there Space runs and stops, and Enter goes to the step.
      const button = target?.closest?.('button, media-play-button, media-mute-button, [role="button"], a[href]');
      const step = target?.closest?.('.rn-step');
      if (button && !(step && event.key === ' ')) return;
      const video = container.querySelector('video');
      if (!video) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (video.paused || video.ended) void video.play().catch(() => undefined);
      else video.pause();
    }, { capture: true, signal });
  }

  #mostInView(container: HTMLElement): boolean {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    };
    const all = Array.from(document.querySelectorAll('media-container.rn'));
    const best = all.reduce<Element | null>((a, b) => (!a || visible(b) > visible(a) ? b : a), null);
    return best === container && visible(container) > 0;
  }

  #waiting(container: HTMLElement) {
    const indicator = container.querySelector<HTMLElement>('.media-buffering-indicator');
    const announcer = container.querySelector<HTMLElement>('rn-say');
    if (!indicator || !announcer) return;
    let shown = indicator.hasAttribute('data-visible');
    this.#watch(indicator, { attributes: true, attributeFilter: ['data-visible'] }, () => {
      const now = indicator.hasAttribute('data-visible');
      if (now === shown) return;
      shown = now;
      if (now) {
        announcer.textContent = '';
        requestAnimationFrame(() => (announcer.textContent = 'Thinking'));
      }
    });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-a11y')) customElements.define('rn-a11y', RnA11yElement);
