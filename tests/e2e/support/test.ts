import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * The battery's `test`. Every page in every context it makes mutes each film as the film starts to load (a test that
 * checks mute then unmutes it on purpose; neither source carries an audio track). Every spec imports `test` from
 * here, never from `@playwright/test`.
 */
export const MUTE_ON_LOAD = () => {
  const seen = new WeakSet<HTMLMediaElement>();
  document.addEventListener(
    'loadstart',
    (event) => {
      const media = event.target;
      if (!(media instanceof HTMLMediaElement) || seen.has(media)) return;
      seen.add(media);
      media.muted = true;
    },
    true,
  );
};

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(MUTE_ON_LOAD);
    await use(context);
  },
});
