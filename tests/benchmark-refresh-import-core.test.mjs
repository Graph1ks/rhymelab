import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkQueueFingerprint } from '../scripts/benchmark-handoff-core.mjs';
import { mergeBenchmarkRefreshReferences } from '../scripts/benchmark-refresh-import-core.mjs';

function task(id, query, candidate) {
  return {
    id,
    query: { word: query, ipa: `${query}-ipa`, phenomena: [] },
    candidate: { word: candidate, ipa: `${candidate}-ipa` },
    engine: { primary_type: null, relation_types: [], relations: [], overall_rank: 1 },
  };
}

function label(taskId, primary = 'slant') {
  return {
    task_id: taskId,
    primary,
    assonance: 'partial',
    consonance: 'none',
    usefulness: 2,
    confidence: 'medium',
    ambiguous: false,
  };
}

test('refresh merge reuses baseline task IDs and fills only delta labels', () => {
  const queue = {
    schema: 'rhymelab-de-human-benchmark-queue-v1',
    benchmark_version: 'de-human-rhyme-v1',
    language: 'de',
    tasks: [task('keep-a', 'Haus', 'Maus'), task('keep-b', 'Zeit', 'weit'), task('new-c', 'Feuer', 'Käufer')],
  };
  const fingerprint = benchmarkQueueFingerprint(queue);
  const baseline = {
    schema: 'rhymelab-benchmark-reference-v1',
    benchmark_version: queue.benchmark_version,
    language: queue.language,
    queue_fingerprint: 'baseline-fingerprint',
    evaluator: { type: 'language_model', name: 'A' },
    labels: [label('keep-a', 'perfect'), label('keep-b', 'perfect'), label('removed-old')],
  };
  const refresh = {
    schema: 'rhymelab-benchmark-refresh-reference-v1',
    benchmark_version: queue.benchmark_version,
    language: queue.language,
    baseline_queue_fingerprint: baseline.queue_fingerprint,
    full_queue_fingerprint: fingerprint,
    evaluator: { type: 'language_model', name: 'A' },
    labels: [label('new-c', 'multisyllabic_slant')],
  };
  const { reviewDocument, importSummary } = mergeBenchmarkRefreshReferences(queue, baseline, refresh);
  assert.equal(importSummary.reused_baseline_labels, 2);
  assert.equal(importSummary.refresh_delta_labels, 1);
  assert.equal(importSummary.labels_imported, 3);
  assert.equal(importSummary.complete, true);
  assert.equal(reviewDocument.queue_fingerprint, fingerprint);
  assert.deepEqual(reviewDocument.reviews.map((row) => row.reference_set), ['baseline_reused', 'baseline_reused', 'refresh_delta']);
});

test('refresh merge rejects incomplete delta reference', () => {
  const queue = {
    schema: 'rhymelab-de-human-benchmark-queue-v1',
    benchmark_version: 'de-human-rhyme-v1',
    language: 'de',
    tasks: [task('keep-a', 'Haus', 'Maus'), task('new-c', 'Feuer', 'Käufer')],
  };
  const baseline = {
    schema: 'rhymelab-benchmark-reference-v1',
    benchmark_version: queue.benchmark_version,
    language: queue.language,
    queue_fingerprint: 'baseline-fingerprint',
    labels: [label('keep-a', 'perfect')],
  };
  const refresh = {
    schema: 'rhymelab-benchmark-refresh-reference-v1',
    benchmark_version: queue.benchmark_version,
    language: queue.language,
    baseline_queue_fingerprint: baseline.queue_fingerprint,
    full_queue_fingerprint: benchmarkQueueFingerprint(queue),
    labels: [],
  };
  assert.throws(() => mergeBenchmarkRefreshReferences(queue, baseline, refresh), /incomplete/i);
});

test('refresh merge rejects a refreshed queue fingerprint mismatch', () => {
  const queue = {
    schema: 'rhymelab-de-human-benchmark-queue-v1',
    benchmark_version: 'de-human-rhyme-v1',
    language: 'de',
    tasks: [task('new-c', 'Feuer', 'Käufer')],
  };
  const baseline = {
    schema: 'rhymelab-benchmark-reference-v1',
    benchmark_version: queue.benchmark_version,
    language: queue.language,
    queue_fingerprint: 'baseline-fingerprint',
    labels: [],
  };
  const refresh = {
    schema: 'rhymelab-benchmark-refresh-reference-v1',
    benchmark_version: queue.benchmark_version,
    language: queue.language,
    baseline_queue_fingerprint: baseline.queue_fingerprint,
    full_queue_fingerprint: 'wrong',
    labels: [label('new-c')],
  };
  assert.throws(() => mergeBenchmarkRefreshReferences(queue, baseline, refresh), /fingerprint/i);
});
