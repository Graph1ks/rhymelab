import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLIND_EXPORT_SCHEMA,
  REFERENCE_LABEL_SCHEMA,
  benchmarkQueueFingerprint,
  buildBlindBenchmarkExport,
  validateAndBuildImportedReviews,
} from '../scripts/benchmark-handoff-core.mjs';

function fixtureQueue() {
  return {
    schema: 'rhymelab-de-human-benchmark-queue-v1',
    benchmark_version: 'de-human-rhyme-v1',
    language: 'de',
    tasks: [
      {
        id: 'task-a',
        query: { word: 'Haus', ipa: 'haʊs', phenomena: ['diphthong', 'assonance'] },
        candidate: { word: 'Baum', ipa: 'baʊm', usage_rank: 123, historical: false },
        engine: { primary_type: 'slant', primary_score: 0.77, overall_rank: 9, sampling_categories: ['assonance'] },
      },
      {
        id: 'task-b',
        query: { word: 'Haus', ipa: 'haʊs', phenomena: ['perfect'] },
        candidate: { word: 'Maus', ipa: 'maʊs', usage_rank: 44, historical: false },
        engine: { primary_type: 'perfect', primary_score: 1, overall_rank: 1, sampling_categories: ['perfect'] },
      },
    ],
  };
}

test('blind export strips engine predictions, ranks, sampling hints and phenomenon labels', () => {
  const queue = fixtureQueue();
  const blind = buildBlindBenchmarkExport(queue);
  assert.equal(blind.schema, BLIND_EXPORT_SCHEMA);
  assert.equal(blind.requested_output.schema, REFERENCE_LABEL_SCHEMA);
  assert.equal(blind.task_count, 2);
  assert.deepEqual(Object.keys(blind.tasks[0]).sort(), ['candidate', 'query', 'task_id']);
  assert.deepEqual(Object.keys(blind.tasks[0].query).sort(), ['ipa', 'word']);
  assert.deepEqual(Object.keys(blind.tasks[0].candidate).sort(), ['ipa', 'word']);
  assert.equal(blind.tasks[0].query.phenomena, undefined);
  assert.equal(blind.tasks[0].candidate.usage_rank, undefined);
  assert.equal(blind.tasks[0].engine, undefined);
  const taskJson = JSON.stringify(blind.tasks);
  for (const leaked of ['primary_type', 'primary_score', 'overall_rank', 'sampling_categories', 'phenomena', 'usage_rank']) {
    assert.equal(taskJson.includes(leaked), false, `blind task export leaked ${leaked}`);
  }
});

test('queue fingerprint is stable across task order but binds task content', () => {
  const queue = fixtureQueue();
  const reversed = { ...queue, tasks: [...queue.tasks].reverse() };
  assert.equal(benchmarkQueueFingerprint(queue), benchmarkQueueFingerprint(reversed));
  const changed = fixtureQueue();
  changed.tasks[0].candidate.ipa = 'baːm';
  assert.notEqual(benchmarkQueueFingerprint(queue), benchmarkQueueFingerprint(changed));
});

test('reference import validates queue identity and converts ambiguous labels to skips', () => {
  const queue = fixtureQueue();
  const blind = buildBlindBenchmarkExport(queue);
  const reference = {
    schema: REFERENCE_LABEL_SCHEMA,
    benchmark_version: queue.benchmark_version,
    language: queue.language,
    queue_fingerprint: blind.queue_fingerprint,
    evaluator: { type: 'language_model', name: 'test-evaluator' },
    labels: [
      {
        task_id: 'task-a', primary: 'slant', assonance: 'strong', consonance: 'none', usefulness: 3, confidence: 'high', note: 'clear vowel relation',
      },
      {
        task_id: 'task-b', ambiguous: true, confidence: 'low', note: 'fixture ambiguity',
      },
    ],
  };
  const result = validateAndBuildImportedReviews(queue, reference);
  assert.equal(result.reviewDocument.label_source, 'external_model_reference');
  assert.equal(result.reviewDocument.evaluator.name, 'test-evaluator');
  assert.equal(result.reviewDocument.reviews.length, 2);
  assert.equal(result.reviewDocument.reviews[0].confidence, 'high');
  assert.equal(result.reviewDocument.reviews[0].reviewer_source, 'external_model_reference');
  assert.equal(result.reviewDocument.reviews[1].skip, true);
  assert.equal(result.importSummary.ambiguous_skipped, 1);
  assert.deepEqual(result.importSummary.confidence, { high: 1, medium: 0, low: 1 });
  assert.equal(result.importSummary.complete, true);
});

test('reference import rejects mismatched, incomplete and duplicate label files', () => {
  const queue = fixtureQueue();
  const blind = buildBlindBenchmarkExport(queue);
  const base = {
    schema: REFERENCE_LABEL_SCHEMA,
    benchmark_version: queue.benchmark_version,
    language: queue.language,
    queue_fingerprint: blind.queue_fingerprint,
    labels: [
      { task_id: 'task-a', primary: 'slant', assonance: 'strong', consonance: 'none', usefulness: 3, confidence: 'medium' },
      { task_id: 'task-b', primary: 'perfect', assonance: 'none', consonance: 'none', usefulness: 4, confidence: 'high' },
    ],
  };
  assert.throws(() => validateAndBuildImportedReviews(queue, { ...base, queue_fingerprint: 'wrong' }), /fingerprint/);
  assert.throws(() => validateAndBuildImportedReviews(queue, { ...base, labels: base.labels.slice(0, 1) }), /incomplete/);
  assert.throws(() => validateAndBuildImportedReviews(queue, { ...base, labels: [base.labels[0], base.labels[0]] }), /Duplicate/);
});
