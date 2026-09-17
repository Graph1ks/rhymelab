import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBenchmarkDiagnostics } from '../scripts/benchmark-diagnostics-core.mjs';

function queueTask(id, query, candidate, rank, primary, relations = []) {
  return {
    id,
    query: { word: query, ipa: 'q', phenomena: [] },
    candidate: { word: candidate, ipa: 'c', usage_rank: null, lexicon_layer: 'dictionary', historical: false },
    engine: {
      primary_type: primary === 'none' ? null : primary,
      primary_score: 0.8,
      overall_rank: rank,
      relation_types: relations.map((row) => row.type),
      relations,
      components: { vowel: 0.8 },
      sampling_categories: [],
    },
  };
}

function review(taskId, primary, usefulness, { assonance = 'none', consonance = 'none', confidence = 'high' } = {}) {
  return {
    task_id: taskId,
    skip: false,
    primary,
    assonance,
    consonance,
    usefulness,
    confidence,
    reviewer_source: 'external_model_reference',
    reference_set: 'test',
  };
}

test('benchmark diagnostics exposes class/relation mismatches and ranking inversions', () => {
  const queue = {
    schema: 'rhymelab-de-human-benchmark-queue-v1',
    benchmark_version: 'de-human-rhyme-v1',
    language: 'de',
    tasks: [
      queueTask('a', 'Haus', 'weak-first', 1, 'family', [{ type: 'assonance', strength: 'partial', score: 0.9 }]),
      queueTask('b', 'Haus', 'strong-second', 2, 'perfect'),
      queueTask('c', 'Zeit', 'correct', 1, 'slant', [{ type: 'consonance', strength: 'partial', score: 0.9 }]),
    ],
  };
  const reviews = {
    schema: 'rhymelab-de-human-benchmark-reviews-v1',
    benchmark_version: 'de-human-rhyme-v1',
    queue_fingerprint: 'fingerprint',
    reviews: [
      review('a', 'slant', 1, { assonance: 'strong' }),
      review('b', 'perfect', 4),
      review('c', 'slant', 3, { consonance: 'partial' }),
    ],
  };

  const report = buildBenchmarkDiagnostics(queue, reviews);
  assert.equal(report.schema, 'rhymelab-benchmark-diagnostics-v1');
  assert.equal(report.summary.total_queue_tasks, 3);
  assert.equal(report.summary.primary_mismatches, 1);
  assert.equal(report.summary.assonance_presence_mismatches, 0);
  assert.equal(report.summary.assonance_strength_only_mismatches, 1);
  assert.equal(report.summary.consonance_presence_mismatches, 0);
  assert.equal(report.summary.tasks_with_any_mismatch, 1);
  assert.equal(report.prioritized_mismatches[0].task_id, 'a');

  const haus = report.query_diagnostics.find((row) => row.query === 'Haus');
  assert.equal(haus.primary_accuracy, 0.5);
  assert.equal(haus.ranking.pairwise_concordance, 0);
  assert.equal(haus.ranking.discordant_pairs.length, 1);
  assert.equal(haus.ranking.discordant_pairs[0].higher_engine_rank.word, 'weak-first');
  assert.equal(haus.ranking.discordant_pairs[0].lower_engine_rank.word, 'strong-second');
  assert.ok(report.ranking_attention.some((row) => row.query === 'Haus'));
});
