import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareOrderedIds,
  evaluateMorphologyRegression,
  materializedMorphologySummary,
  median,
} from '../scripts/writer-v5-equivalence-core.mjs';

test('ordered candidate comparison detects both order and membership changes', () => {
  assert.equal(compareOrderedIds([1, 2, 3], [1, 2, 3]).equal, true);
  const order = compareOrderedIds([1, 2, 3], [1, 3, 2]);
  assert.equal(order.equal, false);
  assert.equal(order.firstMismatchIndex, 1);
  assert.deepEqual(order.onlyExpected, []);
  assert.deepEqual(order.onlyActual, []);

  const membership = compareOrderedIds([1, 2, 3], [1, 3, 4]);
  assert.deepEqual(membership.onlyExpected, [2]);
  assert.deepEqual(membership.onlyActual, [4]);
});

test('median handles odd and even timing samples', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test('absence of compact morphology evidence reconstructs unresolved analyses', () => {
  const summary = materializedMorphologySummary(['verb-key'], []);
  assert.equal(summary.consensus.status, 'unresolved');
  assert.equal(summary.consensus.familyKey, null);
  assert.equal(summary.storedPositiveCount, 0);
  const evaluation = evaluateMorphologyRegression({ expected_family: null }, summary);
  assert.equal(evaluation.pass, true);
});

test('converged compact positive evidence preserves family and construction semantics', () => {
  const summary = materializedMorphologySummary(
    ['adj-key', 'adv-key'],
    [
      { analysis_key: 'adj-key', family_key: 'right:weise', construction_rule: 'de-adverbial-weise-v2' },
      { analysis_key: 'adv-key', family_key: 'right:weise', construction_rule: 'de-adverbial-weise-v2' },
    ],
  );
  assert.equal(summary.consensus.status, 'resolved_converged');
  assert.equal(summary.consensus.familyKey, 'right:weise');
  const evaluation = evaluateMorphologyRegression({
    expected_family: 'right:weise',
    expected_construction_rule: 'de-adverbial-weise-v2',
  }, summary);
  assert.equal(evaluation.pass, true);
});

test('conflicting positive false splits do not pass a negative morphology regression', () => {
  const summary = materializedMorphologySummary(
    ['noun-key', 'adj-key'],
    [
      { analysis_key: 'noun-key', family_key: 'right:foo', construction_rule: null },
      { analysis_key: 'adj-key', family_key: 'right:bar', construction_rule: null },
    ],
  );
  assert.equal(summary.consensus.status, 'ambiguous_conflict');
  assert.equal(summary.consensus.familyKey, null);
  const evaluation = evaluateMorphologyRegression({ expected_family: null }, summary);
  assert.equal(evaluation.pass, false);
});
