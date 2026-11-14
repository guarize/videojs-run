/**
 * A panel that opens from the bar (the palette, Reasoning) lives in the bar, where it is anchored above its key. On a
 * short player (data-rn-short) there is no room above the bar: there it moves into the player itself while it is
 * open, as a sheet over the picture (run.css), and goes back to its place when it closes.
 */
const homes = new WeakMap<HTMLElement, { parent: Node; next: Node | null }>();

export function lift(panel: HTMLElement, open: boolean): void {
  const container = panel.closest('media-container') ?? homes.get(panel)?.parent?.parentElement?.closest('media-container');
  if (open) {
    if (!container?.hasAttribute('data-rn-short') || homes.has(panel)) return;
    homes.set(panel, { parent: panel.parentNode!, next: panel.nextSibling });
    panel.classList.add('rn-sheet');
    container.append(panel);
  } else {
    const home = homes.get(panel);
    if (!home) return;
    homes.delete(panel);
    panel.classList.remove('rn-sheet');
    home.parent.insertBefore(panel, home.next);
  }
}
