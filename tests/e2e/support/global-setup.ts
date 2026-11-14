import type { FullConfig } from '@playwright/test';

/**
 * The battery runs against the dev server that is already up (`pnpm dev`) and never starts one: with nothing
 * answering, it stops here instead of timing out test by test.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const base = config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:4480';
  const url = new URL('/run.html', base).href;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Nothing answers at ${url} (${(error as Error).message}): start the dev server with \`pnpm dev\`, then run the battery.`);
  }
}
