/**
 * The site's pictures, each a capture of the real player on the test page (the dev server at 4480), retaken at every
 * build so the page never shows a player that no longer exists. Written to apps/preview/public/site/*.jpg at 2× a
 * 1080 px player (2160 × 1215), and the share picture (1200 × 630 JPEG).
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = 'apps/preview/public/site';
const TMP = 'scratch/stills';
mkdirSync(TMP, { recursive: true });
const base = process.env.RUN_URL ?? 'http://127.0.0.1:4480/run.html?muted';
const browser = await chromium.launch({ args: ['--mute-audio'] });

async function page() {
  const p = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 2 });
  await p.goto(base);
  await p.addStyleTag({ content: 'body{padding:24px 50px!important} #player{width:1080px!important}' });
  await p.waitForFunction(() => document.querySelectorAll('.rn-step').length > 0 && document.querySelector('video').readyState >= 2);
  return p;
}
const slow = (p, k) => p.evaluate((k) => { const raf = requestAnimationFrame.bind(window); const pn = performance.now.bind(performance); window.requestAnimationFrame = (cb) => raf((t) => cb(t / k)); performance.now = () => pn() / k; }, k);
const shot = async (p, name) => {
  await p.locator('media-container').screenshot({ path: `${TMP}/${name}.png` });
  await p.locator('media-container').screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 86 });
};
const seek = (p, t) => p.evaluate(async (t) => { const v = document.querySelector('video'); v.currentTime = t; await new Promise((r) => v.addEventListener('seeked', r, { once: true })); }, t);
const show = (p) => p.mouse.move(700, 300);

// Think: the network, mid-way.
{
  const p = await page();
  await slow(p, 8);
  await p.locator('.rn-center-play').click();
  await p.evaluate(() => { document.querySelector('video').pause(); document.getAnimations().forEach((a) => (a.playbackRate = 1 / 8)); });
  await p.waitForTimeout(6400);
  await shot(p, 'think');
  await p.close();
}
// Plan: a step's peek.
{
  const p = await page();
  await p.evaluate(async () => { const v = document.querySelector('video'); await v.play(); v.pause(); });
  await seek(p, 40);
  await show(p);
  await p.locator('.rn-step').nth(3).hover();
  await p.waitForTimeout(2500);
  await shot(p, 'plan');
  await p.close();
}
// Log: the pill at rest.
{
  const p = await page();
  await p.evaluate(async () => { const v = document.querySelector('video'); await v.play(); });
  await seek(p, 19);
  await p.mouse.move(5, 5);
  await p.waitForTimeout(5000);
  await shot(p, 'log');
  await p.close();
}
// Tokens: a drag, held.
{
  const p = await page();
  await p.evaluate(async () => { const v = document.querySelector('video'); await v.play(); v.pause(); });
  await seek(p, 30);
  await show(p);
  const s = await p.locator('media-time-slider').boundingBox();
  await p.mouse.move(s.x + s.width * 0.38, s.y + s.height / 2);
  await p.mouse.down();
  await p.mouse.move(s.x + s.width * 0.52, s.y + s.height / 2, { steps: 8 });
  await p.waitForTimeout(900);
  await p.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  await shot(p, 'tokens');
  await p.mouse.up();
  await p.close();
}
// Reasoning: open, after the film has played and changed size.
{
  const p = await page();
  await p.evaluate(async () => { const v = document.querySelector('video'); await v.play(); });
  await p.waitForTimeout(6000);
  await show(p);
  await p.locator('.rn-reasoning-key').click();
  await p.waitForTimeout(700);
  await shot(p, 'reasoning');
  await p.close();
}
// Commands: the palette.
{
  const p = await page();
  await p.evaluate(async () => { const v = document.querySelector('video'); await v.play(); v.pause(); });
  await seek(p, 36);
  await show(p);
  await p.keyboard.press('Control+k');
  await p.waitForTimeout(500);
  await shot(p, 'commands');
  await p.close();
}
// Report: the end.
{
  const p = await page();
  await p.evaluate(async () => { const v = document.querySelector('video'); await v.play(); v.currentTime = v.duration - 1; });
  await p.waitForFunction(() => document.querySelector('video').ended, null, { timeout: 15000 });
  await show(p);
  await p.waitForTimeout(1600);
  await shot(p, 'report');
  // The share picture: the report's moment would say "the end"; the plan's is the idea. 1200 × 630 from the plan still.
  await p.close();
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${TMP}/plan.png`, '-vf', 'scale=1200:-2,crop=1200:630', '-q:v', '3', `${OUT}/share.jpg`]);
await browser.close();
console.log('stills written to', OUT);
