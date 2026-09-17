#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { openExperimentalWriterDb } from '../src/experimental-writer-db.mjs';
import { findWriterRhymes } from '../src/writer-search.mjs';
import {
  WRITER_V5_RUNTIME_ID,
  materializedWriterRuntimeState,
} from '../src/writer-materialized-runtime.mjs';
import {
  WRITER_V5_REPEATABILITY_SCHEMA,
  evaluateRepeatabilityRuns,
  suiteFingerprint,
  writerResponseFingerprint,
} from './writer-v5-repeatability-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const planPath = resolve(argValue('--plan', 'benchmarks/de-writer-v2/plan.json'));
const dbPath = resolve(argValue('--db', process.env.RHYMELAB_WRITER_V5_DB || 'data/local/rhymelab-v5.sqlite'));
const outPath = resolve(argValue('--out', 'data/local/writer-v5-repeatability-report.json'));
const runCount = Math.max(2, Math.min(7, Number.parseInt(argValue('--runs', '3'), 10) || 3));

const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (plan.schema !== 'rhymelab-de-writer-page-plan-v2') {
  throw new Error(`Unexpected writer-page plan schema: ${plan.schema}`);
}

const writerLimit = Math.max(20, Math.min(250, Number(plan?.sampling?.writer_limit) || 250));
const poolLimit = Math.max(50, Math.min(800, Number(plan?.sampling?.candidate_pool) || 800));
const options = {
  limit: writerLimit,
  poolLimit,
  includeVariants: plan?.sampling?.include_variants === true,
  includeHistorical: plan?.sampling?.include_historical === true,
  type: 'all',
  ensureTypeCoverage: false,
};

const runs = [];
let runtimeContract = null;
for (let run = 1; run <= runCount; run += 1) {
  const db = openExperimentalWriterDb(dbPath);
  try {
    const state = materializedWriterRuntimeState(db, { refresh: true });
    if (!state.active || state.runtimeId !== WRITER_V5_RUNTIME_ID) {
      throw new Error(`Materialized writer runtime contract not active on run ${run}: ${JSON.stringify(state)}`);
    }
    runtimeContract ||= {
      id: state.runtimeId,
      databaseSchema: state.databaseSchema,
      anchorPolicy: state.anchorPolicy,
      anchorStorage: state.anchorStorage,
      anchorCandidateBasis: state.anchorCandidateBasis,
      morphologyPolicy: state.morphologyPolicy,
      morphologyStorage: state.morphologyStorage,
    };

    const started = performance.now();
    const queryFingerprints = [];
    for (const queryPlan of plan.queries || []) {
      const query = queryPlan.word;
      const queryStarted = performance.now();
      const response = findWriterRhymes(db, query, options);
      const elapsedMs = Number((performance.now() - queryStarted).toFixed(1));
      if (!response) throw new Error(`Writer response missing for ${query} on run ${run}`);
      if (response.writerRuntime?.id !== WRITER_V5_RUNTIME_ID) {
        throw new Error(`Unexpected writer runtime for ${query} on run ${run}: ${response.writerRuntime?.id || 'missing'}`);
      }
      const fingerprint = writerResponseFingerprint(response);
      queryFingerprints.push({
        query,
        fingerprint,
        resultCount: response.results?.length || 0,
        elapsedMs,
      });
      console.log(`[repeatability ${run}/${runCount}] ${query.padEnd(16)} ${fingerprint.slice(0, 12)}  ${elapsedMs} ms`);
    }

    runs.push({
      run,
      elapsedMs: Number((performance.now() - started).toFixed(1)),
      suiteFingerprint: suiteFingerprint(queryFingerprints),
      queryFingerprints,
    });
  } finally {
    db.close();
  }
}

const evaluation = evaluateRepeatabilityRuns(runs);
const report = {
  schema: WRITER_V5_REPEATABILITY_SCHEMA,
  generatedAt: new Date().toISOString(),
  status: evaluation.passed ? 'ok' : 'failed',
  database: dbPath,
  plan: {
    path: planPath,
    schema: plan.schema,
    version: plan.version,
  },
  runtimeContract,
  runCount,
  queryCount: (plan.queries || []).length,
  fingerprintScope: 'complete findWriterRhymes response; report timestamps and timing measurements excluded',
  evaluation,
  runs,
  acceptedRuntimeRewired: false,
  nextGate: evaluation.passed
    ? 'Produce the German single-word writer-search acceptance report; keep human NDCG explicitly pending.'
    : 'Investigate deterministic output mismatch before any acceptance decision.',
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`\nrepeatability=${evaluation.passed ? 'PASS' : 'FAIL'}`);
console.log(`suite_fingerprint=${evaluation.baselineSuiteFingerprint || 'n/a'}`);
console.log(`mismatches=${evaluation.mismatches.length}`);
console.log(`Report: ${outPath}`);

if (!evaluation.passed) process.exitCode = 1;
