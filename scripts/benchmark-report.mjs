#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { computeBenchmarkMetrics } from './benchmark-core.mjs';
import { benchmarkQueueFingerprint, REVIEW_CONFIDENCE } from './benchmark-handoff-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const queuePath = resolve(argValue('--queue', 'data/local/benchmark/de-v1-queue.json'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-reviews.json'));
const outPath = resolve(argValue('--out', 'reports/de-rhyme-benchmark-report.json'));

const queue = JSON.parse(await readFile(queuePath, 'utf8'));
const reviews = JSON.parse(await readFile(reviewsPath, 'utf8'));
if (queue.schema !== 'rhymelab-de-human-benchmark-queue-v1') throw new Error(`Unexpected queue schema: ${queue.schema}`);
if (reviews.schema !== 'rhymelab-de-human-benchmark-reviews-v1') throw new Error(`Unexpected reviews schema: ${reviews.schema}`);
if (queue.benchmark_version !== reviews.benchmark_version) throw new Error(`Benchmark version mismatch: ${queue.benchmark_version} vs ${reviews.benchmark_version}`);

const currentFingerprint = benchmarkQueueFingerprint(queue);
if (reviews.queue_fingerprint && reviews.queue_fingerprint !== currentFingerprint) {
  throw new Error('Review file queue fingerprint does not match the current benchmark queue');
}
const confidence = Object.fromEntries(REVIEW_CONFIDENCE.map((value) => [value, 0]));
let unspecifiedConfidence = 0;
const reviewerSources = {};
for (const review of reviews.reviews || []) {
  if (review.confidence && confidence[review.confidence] != null) confidence[review.confidence] += 1;
  else unspecifiedConfidence += 1;
  const source = review.reviewer_source || (reviews.label_source === 'external_model_reference' ? 'external_model_reference' : 'local_manual');
  reviewerSources[source] = (reviewerSources[source] || 0) + 1;
}

const report = {
  ...computeBenchmarkMetrics(queue, reviews),
  generated_at: new Date().toISOString(),
  queue: queuePath,
  reviews: reviewsPath,
  review_provenance: {
    label_source: reviews.label_source || 'local_manual_review',
    reviewer_sources: reviewerSources,
    evaluator: reviews.evaluator || null,
    queue_fingerprint: currentFingerprint,
    confidence: {
      ...confidence,
      unspecified: unspecifiedConfidence,
    },
  },
};
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  benchmark_version: report.benchmark_version,
  label_source: report.review_provenance.label_source,
  reviewer_sources: report.review_provenance.reviewer_sources,
  reviewed_tasks: report.reviewed_tasks,
  total_tasks: report.total_tasks,
  completion_pct: report.completion_pct,
  primary_exact_accuracy: report.primary.exact_accuracy,
  assonance_precision: report.assonance.precision,
  assonance_recall_within_sample: report.assonance.recall,
  consonance_precision: report.consonance.precision,
  consonance_recall_within_sample: report.consonance.recall,
  mean_ndcg: report.ranking.mean_ndcg,
  saved: outPath,
}, null, 2));
