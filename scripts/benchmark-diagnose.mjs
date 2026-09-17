#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildBenchmarkDiagnostics } from './benchmark-diagnostics-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const queuePath = resolve(argValue('--queue', 'data/local/benchmark/de-v1-refresh-queue.json'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-refresh-reviews.json'));
const outPath = resolve(argValue('--out', 'reports/de-rhyme-benchmark-diagnostics.json'));

const [queue, reviews] = await Promise.all([
  readFile(queuePath, 'utf8').then(JSON.parse),
  readFile(reviewsPath, 'utf8').then(JSON.parse),
]);

if (queue.schema !== 'rhymelab-de-human-benchmark-queue-v1') throw new Error(`Unexpected queue schema: ${queue.schema || 'missing'}`);
if (reviews.schema !== 'rhymelab-de-human-benchmark-reviews-v1') throw new Error(`Unexpected reviews schema: ${reviews.schema || 'missing'}`);
if (queue.benchmark_version !== reviews.benchmark_version) {
  throw new Error(`Benchmark version mismatch: ${queue.benchmark_version} != ${reviews.benchmark_version}`);
}

const diagnostics = buildBenchmarkDiagnostics(queue, reviews);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(diagnostics, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  schema: diagnostics.schema,
  benchmark_version: diagnostics.benchmark_version,
  total_queue_tasks: diagnostics.summary.total_queue_tasks,
  reviewed_usable_tasks: diagnostics.summary.reviewed_usable_tasks,
  primary_mismatches: diagnostics.summary.primary_mismatches,
  tasks_with_any_mismatch: diagnostics.summary.tasks_with_any_mismatch,
  queries_with_ranking_attention: diagnostics.summary.queries_with_ranking_attention,
  output: outPath,
}, null, 2));
