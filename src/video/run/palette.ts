/**
 * The command palette: the player's settings and moves as commands you type, the way AI tools are driven. ⌘K or
 * Ctrl+K (the player in view or focused), "/" inside the player, or its key on the bar opens it; typing narrows the
 * list; the arrows move, Enter runs, Escape closes and gives the focus back. It is a combobox over a listbox
 * (WAI-ARIA 1.2), so a screen reader hears the option it is on.
 */
import { clock, whenRun, type Run } from './run';
import { lift } from './sheet';
import type { RnReasoningElement } from './reasoning';

interface Command {
  id: string;
  group: 'Playback' | 'Steps' | 'View';
  label: string;
  hint?: string;
  /** Words a search may match besides the label. */
  also?: string;
  run: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
let ids = 0;

/** Whether every word typed is the start of a word in the command (so "sp 1.5" finds "Speed 1.5×"). */
export function matches(command: { label: string; also?: string; group: string }, query: string): boolean {
  const words = `${command.label} ${command.also ?? ''} ${command.group}`.toLowerCase().split(/[\s·×:,]+/).filter(Boolean);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((q) => words.some((w) => w.startsWith(q)) || `${command.label}`.toLowerCase().includes(q));
}

export class RnPaletteElement extends HTMLElement {
  #abort: AbortController | null = null;
  #run: Run | null = null;
  #input: HTMLInputElement | null = null;
  #list: HTMLElement | null = null;
  #panel: HTMLElement | null = null;
  #key: HTMLButtonElement | null = null;
  #commands: Command[] = [];
  #shown: Command[] = [];
  #active = 0;
  #opener: HTMLElement | null = null;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const id = `rn-palette-${++ids}`;
    this.innerHTML = `
      <button type="button" class="media-button rn-palette-key" aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}" aria-label="Commands" aria-keyshortcuts="Meta+K Control+K /">
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5.5h6.5M12.5 5.5H15M3 12.5h2.5M8.5 12.5H15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="11" cy="5.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="12.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>
      <div class="rn-palette" id="${id}" role="dialog" aria-label="Commands" hidden>
        <div class="rn-palette-field">
          <span class="rn-palette-prompt" aria-hidden="true">›</span>
          <input class="rn-palette-input" type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="${id}-list" aria-label="Type a command" placeholder="Type a command" autocomplete="off" spellcheck="false" enterkeyhint="go">
          <button type="button" class="rn-palette-esc" aria-label="Close commands"><span class="rn-palette-esc-word">esc</span><svg class="rn-palette-esc-x" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
        </div>
        <div class="rn-palette-list" id="${id}-list" role="listbox" aria-label="Commands"></div>
        <p class="rn-palette-empty" hidden>No command matches</p>
      </div>`;
    this.#key = this.querySelector('.rn-palette-key');
    this.#panel = this.querySelector('.rn-palette');
    this.#input = this.querySelector('.rn-palette-input');
    this.#list = this.querySelector('.rn-palette-list');
    this.#key!.addEventListener('click', () => this.toggle(), { signal });
    this.#input!.addEventListener('input', () => this.#filter(), { signal });
    this.querySelector('.rn-palette-esc')!.addEventListener('click', () => this.toggle(false), { signal });
    this.#input!.addEventListener('keydown', (event) => this.#keys(event), { signal });
    this.#list!.addEventListener('pointermove', (event) => {
      const option = (event.target as Element).closest<HTMLElement>('[role="option"]');
      if (option) this.#select(Number(option.dataset.at));
    }, { signal });
    this.#list!.addEventListener('click', (event) => {
      const option = (event.target as Element).closest<HTMLElement>('[role="option"]');
      if (option) this.#choose(Number(option.dataset.at));
    }, { signal });
    document.addEventListener('pointerdown', (event) => {
      if (this.open && !this.contains(event.target as Node) && !this.#panel?.contains(event.target as Node)) this.toggle(false, false);
    }, { signal });

    whenRun(this, signal, (run) => {
      this.#run = run;
      const container = run.container;
      // ⌘K / Ctrl+K: the player focused, or the page with nothing focused and this player most in view.
      document.addEventListener('keydown', (event) => {
        const target = event.target as HTMLElement | null;
        const inside = !!target && container.contains(target);
        const onPage = !target || target === document.body || target === document.documentElement;
        const typing = target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
        const chord = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k';
        const slash = event.key === '/' && inside && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
        if (!(chord || slash) || (!inside && !onPage) || (typing && !this.contains(target) && !this.#panel?.contains(target))) return;
        if (onPage && !inView(container)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggle(chord ? !this.open : true);
      }, { capture: true, signal });
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }

  get open(): boolean {
    return !!this.#panel && !this.#panel.hidden;
  }

  toggle(on = !this.open, focus = true) {
    const panel = this.#panel;
    if (!panel || !this.#key) return;
    if (on === this.open) return;
    if (on) {
      this.#opener = (document.activeElement as HTMLElement | null) ?? this.#key;
      this.#commands = this.#build();
      this.#input!.value = '';
      lift(panel, true);
      panel.hidden = false;
      this.#key.setAttribute('aria-expanded', 'true');
      this.#run?.container.toggleAttribute('data-rn-palette', true);
      this.#filter();
      this.#input!.focus({ preventScroll: true });
    } else {
      panel.hidden = true;
      lift(panel, false);
      this.#key.setAttribute('aria-expanded', 'false');
      this.#run?.container.removeAttribute('data-rn-palette');
      if (focus) {
        const back = this.#opener && this.#opener.isConnected && this.#opener !== document.body ? this.#opener : this.#key;
        back.focus({ preventScroll: true });
      }
    }
  }

  /** The commands, as the player is now: their labels say what they will do, their hints what is set. */
  #build(): Command[] {
    const run = this.#run;
    if (!run) return [];
    const { video, container } = run;
    const playing = !video.paused && !video.ended;
    const captions = Array.from(video.textTracks).find((t) => t.kind === 'captions' || t.kind === 'subtitles');
    const reasoning = container.querySelector<RnReasoningElement>('rn-reasoning');
    const planOpen = container.getAttribute('data-rn-plan') !== 'closed';
    const doc = document as Document & { pictureInPictureEnabled?: boolean };
    const list: Command[] = [
      { id: 'run', group: 'Playback', label: playing ? 'Stop' : video.ended ? 'Run again' : 'Run', hint: 'Space', also: 'play pause', run: () => (playing ? video.pause() : void video.play().catch(() => undefined)) },
      { id: 'restart', group: 'Playback', label: 'Restart the run', also: 'beginning start over', run: () => { run.repeat(-1); video.currentTime = 0; void video.play().catch(() => undefined); } },
      ...SPEEDS.map((rate) => ({
        id: `speed-${rate}`,
        group: 'Playback' as const,
        label: `Speed ${rate}×`,
        hint: video.playbackRate === rate ? 'Current' : undefined,
        also: 'rate faster slower',
        run: () => (video.playbackRate = rate),
      })),
      { id: 'mute', group: 'Playback', label: video.muted ? 'Unmute' : 'Mute', hint: 'M', also: 'sound volume audio', run: () => (video.muted = !video.muted) },
      ...(captions
        ? [{ id: 'captions', group: 'Playback' as const, label: captions.mode === 'showing' ? 'Turn captions off' : 'Turn captions on', hint: 'C', also: 'subtitles log', run: () => (captions.mode = captions.mode === 'showing' ? 'disabled' : 'showing') }]
        : []),
      ...run.steps.map((step, index) => ({
        id: `step-${index}`,
        group: 'Steps' as const,
        label: `Go to ${step.title}`,
        hint: clock(step.start),
        also: `step ${index + 1} jump seek`,
        run: () => run.seekTo(index),
      })),
      ...(run.current >= 0
        ? [
            { id: 'repeat', group: 'Steps' as const, label: run.looping === run.current ? 'Stop repeating this step' : 'Run this step again', also: 'repeat loop regenerate', run: () => run.repeat(run.current) },
            ...(run.framed ? [{ id: 'compare', group: 'Steps' as const, label: 'Compare this step, before and after', also: 'diff', run: () => run.compare(run.current) }] : []),
          ]
        : []),
      { id: 'plan', group: 'View', label: planOpen ? 'Hide the plan' : 'Show the plan', also: 'steps list', run: () => container.setAttribute('data-rn-plan', planOpen ? 'closed' : 'open') },
      ...(reasoning ? [{ id: 'reasoning', group: 'View' as const, label: 'Show the reasoning', also: 'thought stats source', run: () => reasoning.toggle(true) }] : []),
      ...(doc.pictureInPictureEnabled ? [{ id: 'pip', group: 'View' as const, label: 'Picture in picture', hint: 'I', also: 'pip float', run: () => container.querySelector<HTMLElement>('media-pip-button')?.click() }] : []),
      { id: 'fullscreen', group: 'View', label: 'Fullscreen', hint: 'F', also: 'full screen', run: () => container.querySelector<HTMLElement>('media-fullscreen-button')?.click() },
      {
        id: 'link',
        group: 'View',
        label: 'Copy a link to this moment',
        hint: clock(video.currentTime),
        also: 'share url timestamp',
        run: () => {
          const url = new URL(location.href);
          url.hash = `t=${Math.floor(video.currentTime)}`;
          void navigator.clipboard?.writeText(url.toString()).catch(() => undefined);
        },
      },
    ];
    return list;
  }

  #filter() {
    const query = this.#input?.value.trim() ?? '';
    this.#shown = query ? this.#commands.filter((c) => matches(c, query)) : this.#commands;
    const list = this.#list!;
    const id = this.#panel!.id;
    const out: HTMLElement[] = [];
    let group = '';
    this.#shown.forEach((command, at) => {
      if (command.group !== group) {
        group = command.group;
        const head = document.createElement('div');
        head.className = 'rn-palette-group';
        head.setAttribute('role', 'presentation');
        head.textContent = group;
        out.push(head);
      }
      const option = document.createElement('div');
      option.className = 'rn-palette-option';
      option.id = `${id}-${command.id}`;
      option.setAttribute('role', 'option');
      option.dataset.at = String(at);
      option.innerHTML = '<span class="rn-palette-label"></span><span class="rn-palette-hint"></span>';
      option.querySelector('.rn-palette-label')!.textContent = command.label;
      option.querySelector('.rn-palette-hint')!.textContent = command.hint ?? '';
      out.push(option);
    });
    list.replaceChildren(...out);
    this.#panel!.querySelector<HTMLElement>('.rn-palette-empty')!.hidden = this.#shown.length > 0;
    this.#select(0);
  }

  #select(at: number) {
    if (!this.#shown.length) {
      this.#input?.removeAttribute('aria-activedescendant');
      return;
    }
    this.#active = (at + this.#shown.length) % this.#shown.length;
    for (const option of this.#list!.querySelectorAll<HTMLElement>('[role="option"]')) {
      const on = Number(option.dataset.at) === this.#active;
      option.setAttribute('aria-selected', String(on));
      if (on) {
        this.#input!.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  #choose(at: number) {
    const command = this.#shown[at];
    if (!command) return;
    this.toggle(false);
    command.run();
  }

  #keys(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.#select(this.#active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      if (this.#input!.value) return;
      event.preventDefault();
      this.#select(event.key === 'Home' ? 0 : this.#shown.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.#choose(this.#active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.toggle(false);
    } else if (event.key === 'Tab') {
      // The palette is one stop: Tab leaves it closed, as a menu does.
      this.toggle(false);
    }
    // Typed keys are the palette's, not the player's hotkeys.
    event.stopPropagation();
  }
}

function inView(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
}

if (typeof customElements !== 'undefined' && !customElements.get('rn-palette')) customElements.define('rn-palette', RnPaletteElement);
