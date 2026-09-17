import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson,
  evaluateRepeatabilityRuns,
  semanticFingerprint,
  suiteFingerprint,
  writerResponseFingerprint,
} from '../scripts/writer-v5-repeatability-core.mjs';

test('canonical fingerprints ignore object key insertion order but preserve array order', () => {
  const left = { b: 2, a: { y: 2, x: 1 }, rows: [{ z: 3, a: 1 }, { z: 4 }] };
  const right = { rows: [{ a: 1, z: 3 }, { z: 4 }], a: { x: 1, y: 2 }, b: 2 };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(semanticFingerprint(left), semanticFingerprint(right));

  const reordered = { ...right, rows: [...right.rows].reverse() };
  assert.notEqual(semanticFingerprint(left), semanticFingerprint(reordered));
});

test('writer response fingerprint changes when ranked semantics change', () => {
  const base = {
    query: { normalized: 'arbeitsweise' },
    writerRuntime: { id: 'materialized-writer-v5-v1' },
    results: [
      { word: 'Weiterreise', writerRank: 1, score: 1 },
      { word: 'Hochzeitsreise', writerRank: 2, score: 1 },
    ],
  };
  const changed = {
    ...base,
    results: [...base.results].reverse(),
  };
  assert.notEqual(writerResponseFingerprint(base), writerResponseFingerprint(changed));
});

test('repeatability evaluation passes identical query and suite fingerprints', () => {
  const queries = [
    { query: 'Arbeitsweise', fingerprint: 'aaa' },
    { query: 'Liebe', fingerprint: 'bbb' },
  ];
  const suite = suiteFingerprint(queries);
  const result = evaluateRepeatabilityRuns([
    { run: 1, suiteFingerprint: suite, queryFingerprints: queries },
    { run: 2, suiteFingerprint: suite, queryFingerprints: queries.map((row) => ({ ...row })) },
    { run: 3, suiteFingerprint: suite, queryFingerprints: queries.map((row) => ({ ...row })) },
  ]);
  assert.equal(result.passed, true);
  assert.equal(result.suiteFingerprintsEqual, true);
  assert.deepEqual(result.mismatches, []);
});

test('repeatability evaluation identifies exact query mismatch', () => {
  const baselineQueries = [
    { query: 'Arbeitsweise', fingerprint: 'aaa' },
    { query: 'Liebe', fingerprint: 'bbb' },
  ];
  const changedQueries = [
    { query: 'Arbeitsweise', fingerprint: 'changed' },
    { query: 'Liebe', fingerprint: 'bbb' },
  ];
  const result = evaluateRepeatabilityRuns([
    { run: 1, suiteFingerprint: suiteFingerprint(baselineQueries), queryFingerprints: baselineQueries },
    { run: 2, suiteFingerprint: suiteFingerprint(changedQueries), queryFingerprints: changedQueries },
  ]);
  assert.equal(result.passed, false);
  assert.ok(result.mismatches.some((entry) => entry.type === 'query_fingerprint_mismatch' && entry.query === 'Arbeitsweise'));
  assert.ok(result.mismatches.some((entry) => entry.type === 'suite_fingerprint_mismatch'));
});

test('repeatability requires at least two runs', () => {
  const result = evaluateRepeatabilityRuns([{ run: 1, suiteFingerprint: 'x', queryFingerprints: [] }]);
  assert.equal(result.passed, false);
  assert.equal(result.mismatches[0].type, 'insufficient_runs');
});
