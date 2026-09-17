import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('German benchmark plan is deterministic, unique and covers core phenomena', async () => {
  const plan = JSON.parse(await readFile('benchmarks/de-v1/plan.json','utf8'));
  assert.equal(plan.schema, 'rhymelab-de-benchmark-plan-v1');
  assert.equal(plan.language, 'de');
  assert.equal(plan.version, 'de-human-rhyme-v1');
  assert.ok(plan.queries.length >= 20);
  const words = plan.queries.map((query) => query.word);
  assert.equal(new Set(words).size, words.length);
  const phenomena = new Set(plan.queries.flatMap((query) => query.phenomena || []));
  for (const required of ['multisyllabic','monosyllabic','diphthong','syllabic_consonant','pronunciation_variants','modern_entity','relation_negative_boundary']) {
    assert.ok(phenomena.has(required), `missing benchmark phenomenon: ${required}`);
  }
  assert.ok(words.includes('hitzefrei'));
  assert.ok(words.includes('Spotify'));
  assert.deepEqual(plan.sound_relations, ['assonance','consonance']);
});
