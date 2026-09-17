#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateAndBuildImportedReviews } from './benchmark-handoff-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}
function hasFlag(flag) { return args.includes(flag); }

const queuePath = resolve(argValue('--queue', 'data/local/benchmark/de-v1-queue.json'));
const inputPath = resolve(argValue('--input', 'reports/de-rhyme-benchmark-reference.json'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-reviews.json'));
const replaceExisting = hasFlag('--replace-existing');

const queue = JSON.parse(await readFile(queuePath, 'utf8'));
const reference = JSON.parse(await readFile(inputPath, 'utf8'));
const { reviewDocument, importSummary } = validateAndBuildImportedReviews(queue, reference, { requireComplete: true });

try {
  const existing = JSON.parse(await readFile(reviewsPath, 'utf8'));
  const existingCount = Array.isArray(existing?.reviews) ? existing.reviews.length : 0;
  if (existingCount > 0 && !replaceExisting) {
    throw new Error(`Refusing to overwrite ${existingCount} existing review(s) at ${reviewsPath}. Re-run with --replace-existing only if that is intentional.`);
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
  input: inputPath,
  reviews: reviewsPath,
  next: 'Run: npm run benchmark:report',
}, null, 2));
