#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { computeBenchmarkMetrics } from './benchmark-core.mjs';
import { benchmarkQueueFingerprint, REVIEW_CONFIDENCE } from './benchmark-handoff-core.mjs';
import { getPhonologyProfile } from './phonology-profiles.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const queuePath = resolve(argValue('--queue', 'data/local/benchmark/de-v1-queue.json'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-reviews.json'));
const outPath = resolve(argValue('--out', 'reports/de-rhyme-benchmark-rescore.json'));

const queue = JSON.parse(await readFile(queuePath, 'utf8'));
const reviews = JSON.parse(await readFile(reviewsPath, 'utf8'));
if (queue.schema !== 'rhymelab-de-human-benchmark-queue-v1') throw new Error(`Unexpected queue schema: ${queue.schema}`);
if (reviews.schema !== 'rhymelab-de-human-benchmark-reviews-v1') throw new Error(`Unexpected reviews schema: ${reviews.schema}`);
if (queue.benchmark_version !== reviews.benchmark_version) throw new Error(`Benchmark version mismatch: ${queue.benchmark_version} vs ${reviews.benchmark_version}`);
const fingerprint = benchmarkQueueFingerprint(queue);
if (reviews.queue_fingerprint && reviews.queue_fingerprint !== fingerprint) throw new Error('Review file queue fingerprint does not match the current benchmark queue');

const profile = getPhonologyProfile(queue.language || 'de');

function rescoredEngine(task) {
  const query = profile.analyzeIpa(task.query.ipa);
  const candidate = profile.analyzeIpa(task.candidate.ipa);
  const score = profile.scoreAnalyses(query, candidate);
  const relations = ['assonance','consonance'].flatMap((type) => {
    const relation = score.relations?.[type];
    return relation?.matched ? [{
      type,
      strength: relation.strength,
      score: relation.score,
      components: relation.components,
    }] : [];
  });
  return {
    ...(task.engine || {}),
    primary_type: score.type === 'weak' ? null : score.type,
    primary_score: Number(score.overall.toFixed(4)),
    relation_types: score.relationTypes || [],
    relations,
    components: {
      vowel: Number(score.vowel.toFixed(4)),
      coda: Number(score.coda.toFixed(4)),
      stress: Number(score.stress.toFixed(4)),
      syllable: Number(score.syllable.toFixed(4)),
      onset: Number((score.onset ?? 0).toFixed(4)),
      consonance: Number(score.consonance.toFixed(4)),
      coda_anchor: Boolean(score.codaAnchor),
    },
    // Retrieval/ranking is deliberately not recomputed by this pair-only rescore.
    overall_rank: null,
  };
}

const rescoredQueue = {
  ...queue,
  tasks: queue.tasks.map((task) => ({ ...task, engine: rescoredEngine(task) })),
};

function metricsForConfidence(levels, sourceQueue) {
  const allowed = new Set(levels);
  const reviewByTask = new Map((reviews.reviews || []).map((review) => [review.task_id, review]));
  const tasks = sourceQueue.tasks.filter((task) => allowed.has(reviewByTask.get(task.id)?.confidence));
  const taskIds = new Set(tasks.map((task) => task.id));
  return computeBenchmarkMetrics(
    { ...sourceQueue, tasks },
    { ...reviews, reviews: (reviews.reviews || []).filter((review) => taskIds.has(review.task_id)) },
  );
}

function compact(metrics) {
  return {
    reviewed: metrics.usable_reviewed_tasks,
    primary_exact_accuracy: metrics.primary.exact_accuracy,
    primary_per_class: metrics.primary.per_class,
    assonance: {
      precision: metrics.assonance.precision,
      recall: metrics.assonance.recall,
      f1: metrics.assonance.f1,
      false_positive_rate: metrics.assonance.false_positive_rate,
      strength_exact: metrics.assonance.strength_exact,
    },
    consonance: {
      precision: metrics.consonance.precision,
      recall: metrics.consonance.recall,
      f1: metrics.consonance.f1,
      false_positive_rate: metrics.consonance.false_positive_rate,
      strength_exact: metrics.consonance.strength_exact,
    },
  };
}

const baseline = computeBenchmarkMetrics(queue, reviews);
const rescored = computeBenchmarkMetrics(rescoredQueue, reviews);
const confidenceCounts = Object.fromEntries(REVIEW_CONFIDENCE.map((level) => [level, (reviews.reviews || []).filter((review) => review.confidence === level).length]));
const report = {
  schema: 'rhymelab-de-benchmark-rescore-v1',
  benchmark_version: queue.benchmark_version,
  language: queue.language,
  generated_at: new Date().toISOString(),
  queue_fingerprint: fingerprint,
  pair_count: queue.tasks.length,
  scope: 'classification_rescore_of_existing_sample_only; retrieval, preferred-pronunciation selection and ranking are not recomputed',
  phonology: {
    analyzer: profile.analyzerVersion,
    scorer: profile.scorerVersion,
    relation_policy: profile.relationPolicyVersion,
  },
  reference_provenance: {
    label_source: reviews.label_source || 'local_manual_review',
    evaluator: reviews.evaluator || null,
    confidence: confidenceCounts,
  },
  baseline: compact(baseline),
  rescored: compact(rescored),
  delta: {
    primary_exact_accuracy: rescored.primary.exact_accuracy == null || baseline.primary.exact_accuracy == null ? null : Number((rescored.primary.exact_accuracy - baseline.primary.exact_accuracy).toFixed(4)),
    assonance_f1: rescored.assonance.f1 == null || baseline.assonance.f1 == null ? null : Number((rescored.assonance.f1 - baseline.assonance.f1).toFixed(4)),
    consonance_f1: rescored.consonance.f1 == null || baseline.consonance.f1 == null ? null : Number((rescored.consonance.f1 - baseline.consonance.f1).toFixed(4)),
  },
  confidence_slices: {
    high: compact(metricsForConfidence(['high'], rescoredQueue)),
    high_and_medium: compact(metricsForConfidence(['high','medium'], rescoredQueue)),
  },
  by_phenomenon: rescored.by_phenomenon,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  phonology: report.phonology,
  pair_count: report.pair_count,
  baseline: {
    primary_exact_accuracy: report.baseline.primary_exact_accuracy,
    assonance_f1: report.baseline.assonance.f1,
    consonance_f1: report.baseline.consonance.f1,
  },
  rescored: {
    primary_exact_accuracy: report.rescored.primary_exact_accuracy,
    assonance_f1: report.rescored.assonance.f1,
    consonance_f1: report.rescored.consonance.f1,
  },
  delta: report.delta,
  saved: outPath,
}, null, 2));
