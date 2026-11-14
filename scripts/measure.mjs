/**
 * The numbers the site prints, measured, never typed: the skin's weight (gzipped, from the workbench build in dist/)
 * and the browser battery's last result (test-results/report.json, from `pnpm test:e2e --reporter=json`). Written to
 * apps/site/src/content/measured.json. Run after `pnpm build` and the battery.
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
        const ok = test.results?.at(-1)?.status === 'passed';
        if (ok) passed++;
        else failed++;
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  tests = { passed, failed, engines: [...engines], at: new Date(report.stats?.startTime ?? Date.now()).toISOString().slice(0, 10) };
}

const measured = { kB: { js: Math.round(js / 102.4) / 10, css: Math.round(css / 102.4) / 10 }, tests };
writeFileSync('apps/site/src/content/measured.json', `${JSON.stringify(measured, null, 2)}\n`);
console.log(measured);
