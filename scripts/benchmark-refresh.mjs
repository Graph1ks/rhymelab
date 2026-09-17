#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareBenchmarkRefresh } from './benchmark-refresh-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}
const root = process.cwd();
const planPath = resolve(argValue('--plan', 'benchmarks/de-v1/plan.json'));
const dbPath = resolve(argValue('--db', process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite'));
const baselineBlindPath = resolve(argValue('--baseline', 'reports/de-rhyme-benchmark-blind.json'));
const referencePath = resolve(argValue('--reference', 'reports/de-rhyme-benchmark-reference.json'));
const queuePath = resolve(argValue('--queue-out', 'data/local/benchmark/de-v1-refresh-queue.json'));
const scratchReviewsPath = resolve(argValue('--scratch-reviews', 'data/local/benchmark/de-v1-refresh-reviews.json'));
const reportPath = resolve(argValue('--report-out', 'reports/de-rhyme-benchmark-refresh.json'));
const deltaPath = resolve(argValue('--blind-out', 'reports/de-rhyme-benchmark-refresh-blind.json'));

const exists = async (path) => {
  try { await access(path); return true; } catch { return false; }
};

if (!await exists(baselineBlindPath)) {
  throw new Error(`Original blind benchmark export not found: ${baselineBlindPath}`);
}
if (!await exists(dbPath)) {
  throw new Error(`Accepted local database not found: ${dbPath}`);
}

const prepare = spawnSync(process.execPath, [
  '--no-warnings', 'scripts/benchmark-prepare.mjs',
  '--plan', planPath,
  '--db', dbPath,
  '--out', queuePath,
  '--reviews', scratchReviewsPath,
], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 64 * 1024 * 1024,
});
if (prepare.status !== 0) {
  const message = String(prepare.stderr || prepare.stdout || 'benchmark prepare failed').trim();
  throw new Error(`Benchmark refresh prepare failed with exit ${prepare.status ?? 'unknown'}: ${message.slice(-4000)}`);
}

const baselineBlind = JSON.parse(await readFile(baselineBlindPath, 'utf8'));
const freshQueue = JSON.parse(await readFile(queuePath, 'utf8'));
let referenceDocument = null;
if (await exists(referencePath)) {
  referenceDocument = JSON.parse(await readFile(referencePath, 'utf8'));
}

const { report, blindDelta } = compareBenchmarkRefresh(baselineBlind, freshQueue, referenceDocument);
report.generated_at = new Date().toISOString();
report.database = dbPath;
report.baseline_blind = baselineBlindPath;
report.reference_file = referenceDocument ? referencePath : null;
report.refresh_queue = queuePath;
report.delta_blind = deltaPath;

await mkdir(dirname(reportPath), { recursive: true });
await mkdir(dirname(deltaPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
await writeFile(deltaPath, JSON.stringify(blindDelta, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  schema: report.schema,
  benchmark_version: report.benchmark_version,
  baseline_queue_fingerprint: report.baseline_queue_fingerprint,
  refreshed_queue_fingerprint: report.refreshed_queue_fingerprint,
  fingerprint_unchanged: report.fingerprint_unchanged,
  baseline_task_count: report.baseline_task_count,
  refreshed_task_count: report.refreshed_task_count,
  counts: report.counts,
  relabel_required: report.relabel_required,
  recommendation: report.recommendation,
  report: reportPath,
  blind_delta: deltaPath,
}, null, 2));
