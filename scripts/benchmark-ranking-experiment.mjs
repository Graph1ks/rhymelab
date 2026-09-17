#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildRankingExperiment } from './benchmark-ranking-experiment-core.mjs';
import { benchmarkQueueFingerprint } from './benchmark-handoff-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const queuePath = resolve(argValue('--queue', 'data/local/benchmark/de-v1-refresh-queue.json'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-refresh-reviews.json'));
const outPath = resolve(argValue('--out', 'reports/de-rhyme-benchmark-ranking-experiment.json'));

const queue = JSON.parse(await readFile(queuePath, 'utf8'));
const reviews = JSON.parse(await readFile(reviewsPath, 'utf8'));
if (queue.schema !== 'rhymelab-de-human-benchmark-queue-v1') throw new Error(`Unexpected queue schema: ${queue.schema}`);
if (reviews.schema !== 'rhymelab-de-human-benchmark-reviews-v1') throw new Error(`Unexpected reviews schema: ${reviews.schema}`);
if (queue.benchmark_version !== reviews.benchmark_version) throw new Error(`Benchmark version mismatch: ${queue.benchmark_version} vs ${reviews.benchmark_version}`);
const fingerprint = benchmarkQueueFingerprint(queue);
if (reviews.queue_fingerprint && reviews.queue_fingerprint !== fingerprint) throw new Error('Review file queue fingerprint does not match the refreshed queue');

const report = buildRankingExperiment(queue, reviews);
report.queue_fingerprint = fingerprint;
report.queue = queuePath;
report.reviews = reviewsPath;

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  queue_fingerprint: report.queue_fingerprint,
  aggregate: report.aggregate,
  best_challenger: report.best_challenger,
  saved: outPath,
}, null, 2));
