import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { FullConfig, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

interface Row {
  spec: string;
  project: string;
  test: string;
  status: string;
  data: Record<string, unknown>;
}

/**
 * Collects the `measure` attachments the proof specs make (contrast, targets, keyboard, motion) and writes them per
 * spec to <output>/measure/<spec>.json (test-results/, or the folder `--output` names), so every number the report quotes can be read back. Used by
 * `pnpm test:proofs` (adapted from Flipbook's).
 */
export default class MeasureReporter implements Reporter {
  #rows: Row[] = [];
  #out = join(process.cwd(), 'test-results');

  onBegin(config: FullConfig): void {
    // Beside the run's own output (`--output`), so a run in its own folder keeps its numbers there.
    const root = config.configFile ? dirname(config.configFile) : process.cwd();
    this.#out = config.projects[0]?.outputDir ?? join(root, 'test-results');
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    for (const attachment of result.attachments) {
      if (attachment.name !== 'measure' || !attachment.body) continue;
      this.#rows.push({
        spec: basename(test.location.file).replace(/\.spec\.ts$/, ''),
        project: test.parent.project()?.name ?? 'unknown',
        test: test.titlePath().slice(2).join(' › '),
        status: result.status,
        data: JSON.parse(attachment.body.toString()),
      });
    }
  }

  onEnd(): void {
    if (!this.#rows.length) return;
    const dir = join(this.#out, 'measure');
    mkdirSync(dir, { recursive: true });
    for (const spec of new Set(this.#rows.map((r) => r.spec))) {
      const rows = this.#rows.filter((r) => r.spec === spec);
      writeFileSync(join(dir, `${spec}.json`), `${JSON.stringify(rows, null, 2)}\n`);
    }
  }
}
