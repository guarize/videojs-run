import { mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * The browser battery for the Run skin, against the page the skin is built on (apps/preview/run.html).
 *
 * It tests the dev server that is already running (`pnpm dev`, 127.0.0.1:4480) and never starts or stops one of its
 * own: global-setup.ts fails the run with a clear message when nothing answers there.
 *
 * The page plays the film from Mux (HLS) where the browser has HLS of its own (Chromium, WebKit) and from the local
 * file where it has none (Firefox), so the three engines cover both sources. Both carry the film's music, and every
 * film is muted as it starts to load (support/test.ts), Chromium also with --mute-audio and Firefox with its own
 * volume at nothing: nothing plays sound in a test.
 *
 * Browsers come from ~/.playwright-browsers; nothing is downloaded. Firefox needs a home of its own on this Mac
 * (CFFIXED_USER_HOME, an empty folder) and its sandboxes off, set here for its worker processes.
 */
process.env.PLAYWRIGHT_BROWSERS_PATH ||= join(homedir(), '.playwright-browsers');

// Outside test-results/, which Playwright empties at the start of a run.
const FIREFOX_HOME = join(tmpdir(), 'run-skin-e2e-firefox-home');
mkdirSync(FIREFOX_HOME, { recursive: true });

const viewport = { width: 1280, height: 800 };

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  globalSetup: './tests/e2e/support/global-setup.ts',
  fullyParallel: true,
  // Other sessions share this machine.
  workers: 2,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4480',
    viewport,
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport,
        deviceScaleFactor: 1,
        launchOptions: { args: ['--mute-audio'] },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport, deviceScaleFactor: 1 },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport,
        deviceScaleFactor: 1,
        launchOptions: {
          env: {
            ...process.env,
            CFFIXED_USER_HOME: process.env.CFFIXED_USER_HOME ?? FIREFOX_HOME,
            MOZ_DISABLE_CONTENT_SANDBOX: '1',
            MOZ_DISABLE_GMP_SANDBOX: '1',
            MOZ_DISABLE_RDD_SANDBOX: '1',
            MOZ_DISABLE_SOCKET_PROCESS_SANDBOX: '1',
          },
          firefoxUserPrefs: {
            'media.volume_scale': '0.0',
            // Firefox's own "Pop out this video" toggle comes over the film under a pointer: no part of the skin.
            'media.videocontrols.picture-in-picture.video-toggle.enabled': false,
          },
        },
      },
    },
  ],
});
