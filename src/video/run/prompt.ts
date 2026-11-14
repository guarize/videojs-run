/**
 * The run's prompt: before the first play the player shows what the run was asked to do, the way an agent's run
 * begins, and its Run key sends it. The words are the page's own (`data-rn-prompt` on the player or its container),
 * written by whoever published the film; nothing is generated. With no prompt given, nothing is drawn.
 */
let ids = 0;

export class RnPromptElement extends HTMLElement {
  #abort: AbortController | null = null;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const container = this.closest<HTMLElement>('media-container');
    if (!container) return;
    const id = `rn-prompt-${++ids}`;
    this.innerHTML = `<span class="rn-prompt-kicker">Prompt</span><p class="rn-prompt-text" id="${id}"><span class="rn-prompt-words"></span><span class="rn-prompt-caret" aria-hidden="true"></span></p>`;
    const words = this.querySelector<HTMLElement>('.rn-prompt-words')!;
    const read = () => {
      const text = (container.closest('[data-rn-prompt]')?.getAttribute('data-rn-prompt') ?? '').trim();
      // Each word a span of its own, so the network Run draws can light the words it starts from (mind.ts); a
      // hostname or a compound with a hyphen stays on one line.
      words.replaceChildren(
        ...text.split(/(\s+)/).filter(Boolean).map((part) => {
          if (/^\s+$/.test(part)) return document.createTextNode(part);
          const span = document.createElement('span');
          span.className = /\w-\w/.test(part) ? 'rn-prompt-word rn-nowrap' : 'rn-prompt-word';
          span.textContent = part;
          return span;
        }),
      );
      container.toggleAttribute('data-rn-prompted', !!text);
      // The large Run key is described by the prompt it sends.
      for (const key of container.querySelectorAll<HTMLElement>('.rn-center-play')) {
        if (text) key.setAttribute('aria-describedby', id);
        else key.removeAttribute('aria-describedby');
      }
    };
    read();
    const host = container.closest('[data-rn-prompt]') ?? container.parentElement;
    if (host) {
      const watch = new MutationObserver(read);
      watch.observe(host, { attributes: true, attributeFilter: ['data-rn-prompt'] });
      signal.addEventListener('abort', () => watch.disconnect());
    }
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-prompt')) customElements.define('rn-prompt', RnPromptElement);
