import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('benchmark rescore compares current phonology without pretending to rerun retrieval', async () => {
  const [source, pkg] = await Promise.all([
    readFile('scripts/benchmark-rescore.mjs', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);
  assert.match(source, /getPhonologyProfile/);
  assert.match(source, /overall_rank:\s*null/);
  assert.match(source, /retrieval, preferred-pronunciation selection and ranking are not recomputed/);
  assert.match(source, /confidence_slices/);
  assert.equal(JSON.parse(pkg).scripts['benchmark:rescore'], 'node --no-warnings scripts/benchmark-rescore.mjs');
});
