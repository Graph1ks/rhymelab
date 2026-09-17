#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildBlindBenchmarkExport } from './benchmark-handoff-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const queuePath = resolve(argValue('--queue', 'data/local/benchmark/de-v1-queue.json'));
const outPath = resolve(argValue('--out', 'reports/de-rhyme-benchmark-blind.json'));

let queue;
try {
  queue = JSON.parse(await readFile(queuePath, 'utf8'));
} catch (error) {
  if (error?.code === 'ENOENT') throw new Error(`Benchmark queue not found: ${queuePath}. Run: npm run benchmark:prepare`);
  throw error;
}

const blind = buildBlindBenchmarkExport(queue);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(blind, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  schema: blind.schema,
  benchmark_version: blind.benchmark_version,
  language: blind.language,
  queue_fingerprint: blind.queue_fingerprint,
  task_count: blind.task_count,
  output: outPath,
  next: 'Upload this blind file for external labeling. No engine predictions, scores, ranks, sampling categories, or benchmark phenomena are included in task rows.',
}, null, 2));
