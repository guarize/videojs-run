type Doc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null };
type Orientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

/** Whether this page may put an element in fullscreen. An iPhone's may not: only its own video player gets the screen. */
function elementFullscreen(): boolean {
  const doc = document as Doc;
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

/**
 * Filling the screen, with the skin's own controls, everywhere.
 *
 * Where the page can ask for fullscreen, Video.js does, on the player's container, and this only turns a phone with
 * a landscape film while it has the screen. An iPhone gives fullscreen to no element but a video, in its own player:
 * the plan, the log and Reasoning would be gone. So there the fullscreen key (and F) makes the player fill the window
 * instead: in the top layer, the page behind held still, with the notch's insets (`data-rn-fill`, run.css). Escape,
 * or the key again, puts it back.
 */
export class RnScreenElement extends HTMLElement {
  #abort: AbortController | null = null;
  #container: HTMLElement | null = null;
  #scroll: string | null = null;
  #locked = false;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.hidden = true;
    const container = this.closest<HTMLElement>('media-container');
    this.#container = container;
    if (!container) return;

    const ours = () => !elementFullscreen() || this.filled;
    container.addEventListener('click', (event) => {
      const key = (event.target as Element | null)?.closest?.('media-fullscreen-button');
      if (!key || !container.contains(key) || !ours()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggle();
    }, { capture: true, signal });
    container.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const typing = (event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
      if ((event.key === 'f' || event.key === 'F') && !typing && ours()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggle();
      } else if (event.key === 'Escape' && this.filled && !event.defaultPrevented && !(event.target as Element | null)?.closest?.('[aria-modal="true"], .media-popup, [popover]:popover-open')) {
        event.preventDefault();
        this.toggle(false);
      }
    }, { capture: true, signal });

    // With no fullscreen of any kind, Video.js hides and disables its key. The fill needs no permission: keep the key.
    queueMicrotask(() => {
      const key = container.querySelector<HTMLElement>('media-fullscreen-button');
      if (!key || signal.aborted || elementFullscreen()) return;
      container.toggleAttribute('data-rn-fillable', true);
      const keep = () => {
        if (key.hasAttribute('hidden')) key.removeAttribute('hidden');
        if (key.getAttribute('aria-disabled') === 'true') key.removeAttribute('aria-disabled');
      };
      const watch = new MutationObserver(keep);
      watch.observe(key, { attributes: true, attributeFilter: ['hidden', 'aria-disabled'] });
      signal.addEventListener('abort', () => watch.disconnect());
      keep();
    });

    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, () => this.#turn(), { signal });
    signal.addEventListener('abort', () => {
      if (this.filled) this.toggle(false);
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }

  get filled(): boolean {
    return !!this.#container?.hasAttribute('data-rn-fill');
  }

  toggle(on = !this.filled) {
    const container = this.#container;
    if (!container || on === this.filled) return;
    const root = document.documentElement;
    if (on) {
      container.toggleAttribute('data-rn-fill', true);
      try {
        container.setAttribute('popover', 'manual');
        container.showPopover();
      } catch {
        container.removeAttribute('popover');
      }
      this.#scroll = root.style.overflow;
      root.style.overflow = 'hidden';
    } else {
      try {
        if (container.matches(':popover-open')) container.hidePopover();
      } catch {
        // No popovers here: it was fixed in place, and the attribute going is enough.
      }
      container.removeAttribute('popover');
      container.toggleAttribute('data-rn-fill', false);
      root.style.overflow = this.#scroll ?? '';
      this.#scroll = null;
    }
    const key = container.querySelector<HTMLElement>('media-fullscreen-button');
    key?.toggleAttribute('data-rn-filled', on);
    if (key) key.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
    if (key && document.activeElement !== key && container.contains(document.activeElement)) key.focus({ preventScroll: true });
  }

  #turn() {
    const container = this.#container;
    const doc = document as Doc;
    const orientation = screen.orientation as Orientation | undefined;
    if (!container || !orientation) return;
    const element = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    const full = element === container;
    const video = container.querySelector('video');
    try {
      if (full && video && video.videoWidth > video.videoHeight && matchMedia('(pointer: coarse)').matches && typeof orientation.lock === 'function') {
        this.#locked = true;
        void orientation.lock('landscape').catch(() => {
          this.#locked = false;
        });
      } else if (!full && this.#locked) {
        this.#locked = false;
        orientation.unlock();
      }
    } catch {
      this.#locked = false;
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-screen')) customElements.define('rn-screen', RnScreenElement);
