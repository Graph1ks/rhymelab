import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));

test('publish ranking compactor removes JSON evidence but preserves ranking and numeric usage provenance', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'rhymelab-publish-ranking-'));
  const input = join(temp, 'usage.tsv');
  const output = join(temp, 'publish.tsv');

  try {
    await writeFile(input, [
      'rank\tform\tnormalized_form\tusage_score\tcombined_count\tsource_count\tsource_counts_json\tsource_per_million_json',
      '1\tHaus\thaus\t12.50000000\t125\t3\t{"a":1}\t{"a":2}',
      '2\tLiebe\tliebe\t9.25000000\t99\t2\t{"b":1}\t{"b":2}',
      '',
    ].join('\n'), 'utf8');

    const run = spawnSync(process.execPath, [
      'scripts/prepare-de-publish-ranking.mjs',
      '--input', input,
      '--out', output,
    ], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);

    const text = await readFile(output, 'utf8');
    assert.equal(text, [
      'rank\tform\tnormalized_form\tusage_score\tcombined_count\tsource_count',
      '1\tHaus\thaus\t12.50000000\t125\t3',
      '2\tLiebe\tliebe\t9.25000000\t99\t2',
      '',
    ].join('\n'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
