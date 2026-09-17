import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('DE seed sums duplicate rows within a corpus and counts distinct corpora', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rhymelab-seed-'));
  const a = join(dir, 'a_words.txt');
  const b = join(dir, 'b_words.txt');
  const out = join(dir, 'seed.tsv');

  await writeFile(a, '1\tdie\t10\n2\tdie\t5\n3\tHaus\t2\n', 'utf8');
  await writeFile(b, '1\tdie\t7\n2\tHaus\t3\n', 'utf8');

  await execFileAsync(process.execPath, [
    'scripts/build-de-seed.mjs', a, b, '--limit', '2', '--out', out,
  ]);

  const [, die, haus] = (await readFile(out, 'utf8')).trim().split('\n');
  const dieColumns = die.split('\t');
  const hausColumns = haus.split('\t');

  assert.equal(dieColumns[1], 'die');
  assert.equal(Number(dieColumns[3]), 22);
  assert.equal(Number(dieColumns[4]), 2);
  assert.deepEqual(JSON.parse(dieColumns[5]), {
    'a_words.txt': 15,
    'b_words.txt': 7,
  });

  assert.equal(hausColumns[1], 'Haus');
  assert.equal(Number(hausColumns[3]), 5);
  assert.equal(Number(hausColumns[4]), 2);
});
