import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runtimeResultKey,
  sameRuntimeResultOrder,
} from '../scripts/runtime-ranking-retrieval-core.mjs';
import {
  metricsForReviewed,
  safetyForRows,
  sumSafety,
} from '../scripts/runtime-ranking-report-core.mjs';

const modernQuery = {
  lexiconLayer: 'modern',
  usageRank: 1000,
};

function row(word, usageRank, extras = {}) {
  return {
    language: 'de',
    word,
    normalized: word.toLocaleLowerCase('de-DE'),
    ipa: `/${word}/`,
    usageRank,
    lexiconLayer: 'dictionary',
    lexicalTags: [],
    score: 0.8,
    rhymeTier: 2,
    syllableDistance: 0,
    primaryType: 'family',
    ...extras,
  };
}

test('runtime result keys and order comparison are deterministic', () => {
  const a = row('Alpha', 100);
  const b = row('Beta', 200);
  assert.equal(runtimeResultKey(a), `alpha\u0000/Alpha/`);
  assert.equal(sameRuntimeResultOrder(
    [runtimeResultKey(a), runtimeResultKey(b)],
    [runtimeResultKey(a), runtimeResultKey(b)],
  ), true);
  assert.equal(sameRuntimeResultOrder(
    [runtimeResultKey(a), runtimeResultKey(b)],
    [runtimeResultKey(b), runtimeResultKey(a)],
  ), false);
});

test('runtime-candidate safety counts query-relative horizon violations', () => {
  const safety = safetyForRows([
    row('Inside', 9000),
    row('Outside', 10001),
    row('Unknown', null),
  ], modernQuery);

  assert.equal(safety.candidates, 3);
  assert.equal(safety.without_usage_rank, 1);
  assert.equal(safety.outside_query_relative_1decade_horizon, 1);
  assert.equal(safety.query_relative_horizon_unknown, 1);
});

test('runtime-candidate safety aggregation preserves horizon evidence', () => {
  const combined = sumSafety([
    safetyForRows([row('Inside', 5000)], modernQuery),
    safetyForRows([row('Outside', 20000)], modernQuery),
  ]);
  assert.equal(combined.candidates, 2);
  assert.equal(combined.outside_query_relative_1decade_horizon, 1);
});

test('reviewed runtime metrics reward useful ordering', () => {
  const good = [
    { ...row('Strong', 100), rank: 1, reference: { usefulness: 4 } },
    { ...row('Weak', 200), rank: 2, reference: { usefulness: 1 } },
  ];
  const bad = [
    { ...good[1], rank: 1 },
    { ...good[0], rank: 2 },
  ];

  assert.equal(metricsForReviewed(good).ndcg, 1);
  assert.equal(metricsForReviewed(good).pairwise_concordance, 1);
  assert.ok(metricsForReviewed(bad).ndcg < 1);
  assert.equal(metricsForReviewed(bad).pairwise_concordance, 0);
});
