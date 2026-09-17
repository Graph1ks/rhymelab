import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRankingExperiment } from '../scripts/benchmark-ranking-experiment-core.mjs';

function task(id, word, engineRank, score, usageRank) {
  return {
    id,
    query: { word: 'Test' },
    candidate: { word, usage_rank: usageRank },
    engine: {
      overall_rank: engineRank,
      rhyme_tier: 3,
      syllable_distance: 0,
      primary_score: score,
      primary_type: 'slant',
    },
  };
}

test('score-first ranking can outperform usage-first engine order on stronger sampled rhymes', () => {
  const queue = {
    benchmark_version: 'de-human-rhyme-v1',
    language: 'de',
    tasks: [
      task('a', 'CommonWeak', 1, 0.62, 10),
      task('b', 'RareStrong', 2, 0.90, 1000),
      task('c', 'Middle', 3, 0.75, 100),
    ],
  };
  const reviews = {
    reviews: [
      { task_id: 'a', usefulness: 1, confidence: 'medium' },
      { task_id: 'b', usefulness: 4, confidence: 'high' },
      { task_id: 'c', usefulness: 2, confidence: 'medium' },
    ],
  };
  const report = buildRankingExperiment(queue, reviews);
  assert.equal(report.schema, 'rhymelab-benchmark-ranking-experiment-v1');
  assert.ok(report.aggregate.score_first.mean_pairwise_concordance > report.aggregate.engine_rank.mean_pairwise_concordance);
  assert.equal(report.per_query[0].policies.score_first.top[0].word, 'RareStrong');
});

test('score-band policies keep usage ordering inside a phonetic quality band', () => {
  const queue = {
    benchmark_version: 'de-human-rhyme-v1',
    language: 'de',
    tasks: [
      task('a', 'Common', 1, 0.901, 10),
      task('b', 'Rare', 2, 0.909, 1000),
    ],
  };
  const reviews = {
    reviews: [
      { task_id: 'a', usefulness: 4, confidence: 'high' },
      { task_id: 'b', usefulness: 2, confidence: 'medium' },
    ],
  };
  const report = buildRankingExperiment(queue, reviews);
  assert.equal(report.per_query[0].policies.score_band_0_02.top[0].word, 'Common');
});
