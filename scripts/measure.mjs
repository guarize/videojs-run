/**
 * The numbers the site prints, measured, never typed: the skin's weight (gzipped, from the workbench build in dist/),
 * the browser battery's last result (test-results/report.json, from `pnpm test:e2e --reporter=json`), and the proofs'
 * own numbers (test-results/measure/*.json, from the measure reporter: contrast over the film's brightest and darkest
 * frames, touch targets, Tab rings, stillness under reduced motion). Written to apps/site/src/content/measured.json.
 * Run after `pnpm build` and the battery.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const assets = readdirSync('dist/assets');
const gz = (prefix, ext) => {
  const file = assets.find((f) => f.startsWith(prefix) && f.endsWith(ext));
  return file ? gzipSync(readFileSync(`dist/assets/${file}`)).length : 0;
};
const js = gz('skin-', '.js');
const css = gz('skin-', '.css');

let tests = null;
if (existsSync('test-results/report.json')) {
  const report = JSON.parse(readFileSync('test-results/report.json', 'utf8'));
  const engines = new Set();
  let passed = 0;
  let failed = 0;
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        engines.add(test.projectName);
        const status = test.results?.at(-1)?.status;
        // A test skipped on purpose (one an engine cannot run) is neither.
        if (status === 'skipped') continue;
        if (status === 'passed') passed++;
        else failed++;
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  tests = { passed, failed, engines: [...engines], at: new Date(report.stats?.startTime ?? Date.now()).toISOString().slice(0, 10) };
}

/** The proofs' rows of one spec, or none. */
const rows = (spec) => (existsSync(`test-results/measure/${spec}.json`) ? JSON.parse(readFileSync(`test-results/measure/${spec}.json`, 'utf8')) : []);
let proofs = null;
const contrast = rows('contrast');
const targets = rows('targets');
const keyboard = rows('keyboard');
const motion = rows('motion');
if (contrast.length && targets.length && keyboard.length && motion.length) {
  const worst = (kinds) => Math.min(...contrast.flatMap((r) => kinds.map((k) => r.data?.[k]?.ratio).filter((v) => typeof v === 'number')));
  proofs = {
    passed: [contrast, targets, keyboard, motion].every((list) => list.every((r) => r.status === 'passed')),
    text: worst(['text', 'large']),
    marks: worst(['graphics', 'boundary', 'unplayed']),
    target: Math.min(...targets.map((r) => Math.min(r.data?.smallest?.width ?? Infinity, r.data?.smallest?.height ?? Infinity))),
    stops: Math.max(...keyboard.map((r) => r.data?.stops ?? 0)),
    ringless: keyboard.reduce((n, r) => n + (r.data?.ringless ?? 0), 0),
    still: motion.every((r) => r.status === 'passed' && Object.values(r.data?.still ?? {}).every(Boolean)),
    engines: [...new Set([...contrast, ...targets, ...keyboard, ...motion].map((r) => r.project))],
  };
}

const measured = { kB: { js: Math.round(js / 102.4) / 10, css: Math.round(css / 102.4) / 10 }, tests, proofs };
writeFileSync('apps/site/src/content/measured.json', `${JSON.stringify(measured, null, 2)}\n`);
console.log(measured);
