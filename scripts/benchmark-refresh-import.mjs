#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mergeBenchmarkRefreshReferences } from './benchmark-refresh-import-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}
function hasFlag(flag) { return args.includes(flag); }

const queuePath = resolve(argValue('--queue', 'data/local/benchmark/de-v1-refresh-queue.json'));
const baselinePath = resolve(argValue('--baseline-reference', 'reports/de-rhyme-benchmark-reference.json'));
const refreshPath = resolve(argValue('--refresh-reference', 'reports/de-rhyme-benchmark-refresh-reference.json'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-refresh-reviews.json'));
const replaceExisting = hasFlag('--replace-existing');

const queue = JSON.parse(await readFile(queuePath, 'utf8'));
const baselineReference = JSON.parse(await readFile(baselinePath, 'utf8'));
const refreshReference = JSON.parse(await readFile(refreshPath, 'utf8'));
const { reviewDocument, importSummary } = mergeBenchmarkRefreshReferences(queue, baselineReference, refreshReference);

try {
  const existing = JSON.parse(await readFile(reviewsPath, 'utf8'));
  const existingCount = Array.isArray(existing?.reviews) ? existing.reviews.length : 0;
  if (existingCount > 0 && !replaceExisting) {
    throw new Error(`Refusing to overwrite ${existingCount} existing refreshed review(s) at ${reviewsPath}. Re-run with --replace-existing only if intentional.`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await mkdir(dirname(reviewsPath), { recursive: true });
const tempPath = `${reviewsPath}.tmp`;
await writeFile(tempPath, JSON.stringify(reviewDocument, null, 2) + '\n', 'utf8');
await rename(tempPath, reviewsPath);

console.log(JSON.stringify({
  schema: reviewDocument.schema,
  benchmark_version: reviewDocument.benchmark_version,
  queue_fingerprint: reviewDocument.queue_fingerprint,
  label_source: reviewDocument.label_source,
  evaluator: reviewDocument.evaluator,
  ...importSummary,
  queue: queuePath,
  baseline_reference: baselinePath,
  refresh_reference: refreshPath,
  reviews: reviewsPath,
  next: 'Run the refreshed benchmark report.',
}, null, 2));
