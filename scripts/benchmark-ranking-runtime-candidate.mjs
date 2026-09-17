#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  MODERN_ENTITY_RELATIVE_COMMONNESS_POLICY,
  preservesAcceptedOrderingForPolicy,
  rankLexicalHybridResults,
} from './ranking-hybrid-policy-core.mjs';
import {
  retrieveAllRuntimeCandidates,
  runtimeResultKey,
  sameRuntimeResultOrder,
} from './runtime-ranking-retrieval-core.mjs';
import {
  attachReference,
  compactRuntimeCandidate,
  mean,
  metricsForReviewed,
  queryContext,
  rankByKey,
  roundedDelta,
  safetyForRows,
  sumSafety,
} from './runtime-ranking-report-core.mjs';
import { loadRuntimeCandidateReferenceAssets } from './runtime-candidate-reference-assets.mjs';
import { findRhymes, openRhymeDb } from '../src/local-engine.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const planPath = resolve(argValue('--plan', 'benchmarks/de-v1/plan.json'));
const queuePath = resolve(argValue('--queue', 'data/local/benchmark/de-v1-refresh-queue.json'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-refresh-reviews.json'));
const dbPath = resolve(argValue('--db', process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite'));
const outPath = resolve(argValue('--out', 'reports/de-rhyme-benchmark-ranking-runtime-candidate.json'));
const poolLimit = 800;
const resultLimit = 250;
const topLimit = 20;
const candidatePolicy = MODERN_ENTITY_RELATIVE_COMMONNESS_POLICY;
const FOCUS_QUERIES = new Set(['Spotify', 'YouTube', 'Netflix', 'TikTok', 'hitzefrei']);

const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (plan.schema !== 'rhymelab-de-benchmark-plan-v1') {
  throw new Error(`Unexpected benchmark plan schema: ${plan.schema}`);
}

const referenceAssets = await loadRuntimeCandidateReferenceAssets(queuePath, reviewsPath);
const queue = referenceAssets.queue;
const reviews = referenceAssets.reviews;
const reviewByTaskId = referenceAssets.reviewByTaskId;

const queryReports = [];
const missingQueries = [];
const db = openRhymeDb(dbPath);

try {
  for (const queryPlan of plan.queries || []) {
    const word = String(queryPlan.word || '').trim();
    if (!word) continue;

    const runtime = findRhymes(db, word, {
      limit: resultLimit,
      poolLimit,
      type: 'all',
      includeVariants: false,
      includeHistorical: false,
      ensureTypeCoverage: false,
    });

    const retrieved = retrieveAllRuntimeCandidates(db, word, {
      poolLimit,
      includeVariants: false,
      includeHistorical: false,
    });

    if (!runtime || !retrieved?.query) {
      missingQueries.push(word);
      continue;
    }

    const context = retrieved.query;
    const acceptedUsageFirstTop250 = retrieved.results.slice(0, resultLimit);
    const expectedCandidateAll = rankLexicalHybridResults(
      retrieved.results,
      candidatePolicy,
      context,
    );
    const expectedCandidateTop250 = expectedCandidateAll.slice(0, resultLimit);

    const runtimeMatchesCandidate = sameRuntimeResultOrder(
      runtime.results.map(runtimeResultKey),
      expectedCandidateTop250.map(runtimeResultKey),
    );
    const runtimeReportsCandidatePolicy = runtime.rankingPolicy === candidatePolicy;

    const protectedEngine = retrieved.results
      .filter((row) => preservesAcceptedOrderingForPolicy(row, candidatePolicy, context))
      .map(runtimeResultKey);
    const protectedCandidate = expectedCandidateAll
      .filter((row) => preservesAcceptedOrderingForPolicy(row, candidatePolicy, context))
      .map(runtimeResultKey);
    const protectedOrderMatchesFullRetrieval = sameRuntimeResultOrder(
      protectedEngine,
      protectedCandidate,
    );

    const engineRows = attachReference(acceptedUsageFirstTop250, context, reviewByTaskId);
    const candidateRows = attachReference(runtime.results, context, reviewByTaskId);

    const engineRankByKey = rankByKey(engineRows);
    const engine250Keys = new Set(engineRows.map(runtimeResultKey));
    const engine20Keys = new Set(engineRows.slice(0, topLimit).map(runtimeResultKey));
    const candidate250Keys = new Set(candidateRows.map(runtimeResultKey));
    const candidate20 = candidateRows.slice(0, topLimit);
    const candidate20Keys = new Set(candidate20.map(runtimeResultKey));

    const newInTop250 = candidateRows
      .filter((row) => !engine250Keys.has(runtimeResultKey(row)));
    const droppedFromTop250 = engineRows
      .filter((row) => !candidate250Keys.has(runtimeResultKey(row)));
    const newInTop20 = candidate20
      .filter((row) => !engine20Keys.has(runtimeResultKey(row)));
    const droppedFromTop20 = engineRows.slice(0, topLimit)
      .filter((row) => !candidate20Keys.has(runtimeResultKey(row)));

    queryReports.push({
      query: word,
      query_ipa: context.preferredIpa || null,
      query_context: queryContext(context),
      retrieved_candidate_count: retrieved.results.length,
      runtime_matches_validated_candidate: runtimeMatchesCandidate,
      runtime_reports_candidate_policy: runtimeReportsCandidatePolicy,
      runtime_reported_policy: runtime.rankingPolicy || null,
      protected_order_matches_full_retrieval: protectedOrderMatchesFullRetrieval,
      engine_runtime: {
        source: 'accepted_usage_first_retrieval_reconstruction',
        reference_metrics: metricsForReviewed(engineRows),
        top20_safety: safetyForRows(engineRows.slice(0, topLimit), context),
      },
      candidate_runtime: {
        source: 'live_findRhymes_runtime',
        policy: candidatePolicy,
        reference_metrics: metricsForReviewed(candidateRows),
        top20_changed: newInTop20.length > 0 || droppedFromTop20.length > 0,
        top250_membership_changed: newInTop250.length > 0 || droppedFromTop250.length > 0,
        top20_safety: safetyForRows(candidate20, context),
        new_top20_safety: safetyForRows(newInTop20, context),
        new_top250_safety: safetyForRows(newInTop250, context),
        new_in_top20: newInTop20.map((row) => compactRuntimeCandidate(
          row,
          context,
          engineRankByKey.get(runtimeResultKey(row)) ?? null,
        )),
        dropped_from_top20: droppedFromTop20.map((row) => compactRuntimeCandidate(
          row,
          context,
          engineRankByKey.get(runtimeResultKey(row)) ?? row.rank,
        )),
        new_in_top250: newInTop250.map((row) => compactRuntimeCandidate(row, context, null)),
        dropped_from_top250: droppedFromTop250.map((row) => compactRuntimeCandidate(
          row,
          context,
          row.rank,
        )),
      },
    });
  }
} finally {
  db.close();
}

const aggregate = {
  query_count: queryReports.length,
  missing_queries: missingQueries,
  runtime_candidate_mismatch_queries: queryReports
    .filter((row) => !row.runtime_matches_validated_candidate)
    .map((row) => row.query),
  runtime_policy_mismatch_queries: queryReports
    .filter((row) => !row.runtime_reports_candidate_policy)
    .map((row) => row.query),
  protected_order_mismatch_queries: queryReports
    .filter((row) => !row.protected_order_matches_full_retrieval)
    .map((row) => row.query),
  engine_runtime: {
    source: 'accepted_usage_first_retrieval_reconstruction',
    reference_metrics: {
      mean_ndcg: mean(queryReports.map((row) => row.engine_runtime.reference_metrics.ndcg)),
      mean_pairwise_concordance: mean(
        queryReports.map((row) => row.engine_runtime.reference_metrics.pairwise_concordance),
      ),
    },
  },
  candidate_runtime: {
    source: 'live_findRhymes_runtime',
    policy: candidatePolicy,
    reference_metrics: {
      mean_ndcg: mean(queryReports.map((row) => row.candidate_runtime.reference_metrics.ndcg)),
      mean_pairwise_concordance: mean(
        queryReports.map((row) => row.candidate_runtime.reference_metrics.pairwise_concordance),
      ),
    },
    new_top20_safety: sumSafety(
      queryReports.map((row) => row.candidate_runtime.new_top20_safety),
    ),
    new_top250_safety: sumSafety(
      queryReports.map((row) => row.candidate_runtime.new_top250_safety),
    ),
    queries_with_top20_change: queryReports
      .filter((row) => row.candidate_runtime.top20_changed)
      .map((row) => row.query),
    queries_with_top250_membership_change: queryReports
      .filter((row) => row.candidate_runtime.top250_membership_changed)
      .map((row) => row.query),
  },
};

aggregate.candidate_runtime.reference_metrics.delta_vs_engine_runtime = {
  mean_ndcg: roundedDelta(
    aggregate.candidate_runtime.reference_metrics.mean_ndcg,
    aggregate.engine_runtime.reference_metrics.mean_ndcg,
  ),
  mean_pairwise_concordance: roundedDelta(
    aggregate.candidate_runtime.reference_metrics.mean_pairwise_concordance,
    aggregate.engine_runtime.reference_metrics.mean_pairwise_concordance,
  ),
};

const focusQueries = queryReports
  .filter((row) => FOCUS_QUERIES.has(row.query))
  .map((row) => ({
    query: row.query,
    query_context: row.query_context,
    retrieved_candidate_count: row.retrieved_candidate_count,
    runtime_matches_validated_candidate: row.runtime_matches_validated_candidate,
    runtime_reports_candidate_policy: row.runtime_reports_candidate_policy,
    runtime_reported_policy: row.runtime_reported_policy,
    protected_order_matches_full_retrieval: row.protected_order_matches_full_retrieval,
    engine_runtime: row.engine_runtime,
    candidate_runtime: row.candidate_runtime,
  }));

const referenceEvidence = {
  status: referenceAssets.status,
  queue_path: queue ? queuePath : null,
  reviews_path: reviews ? reviewsPath : null,
  metrics_available: referenceAssets.status === 'available',
};

const report = {
  schema: 'rhymelab-benchmark-ranking-runtime-candidate-v2',
  benchmark_version: reviews?.benchmark_version || plan.version || null,
  language: plan.language || queue?.language || 'de',
  generated_at: new Date().toISOString(),
  queue_fingerprint: referenceAssets.queueFingerprint,
  reference_evidence: referenceEvidence,
  candidate_policy: candidatePolicy,
  status: aggregate.missing_queries.length
    || aggregate.runtime_candidate_mismatch_queries.length
    || aggregate.runtime_policy_mismatch_queries.length
    || aggregate.protected_order_mismatch_queries.length
    ? 'validation_error'
    : 'ok',
  scope: referenceAssets.status === 'available'
    ? 'post-promotion retrieval-aware runtime acceptance: reconstruct the accepted usage-first candidate set, derive the validated v3 order before top-250 truncation, require live findRhymes to match it exactly, and report reviewed reference metrics'
    : 'retrieval-aware legacy/runtime invariance: reconstruct the accepted usage-first candidate set, derive the validated v3 order before top-250 truncation, and require live findRhymes to match it exactly; historical review metrics are unavailable locally',
  limitation: referenceAssets.status === 'available'
    ? 'uses the accepted runtime retrieval keys and pool limit 800; validates ranking before result truncation but does not broaden retrieval beyond the current local-engine candidatePool strategy; balanced coverage and type-specific UI modes retain their separate usage-first ordering'
    : 'local refresh queue/reviews are absent, so NDCG/pairwise reference metrics are null; this run is valid for runtime-order, ranking-policy, protected-order and safety invariance only, not for re-establishing historical reviewed metrics',
  runtime_default_changed: true,
  scorer_changed: false,
  relation_policy_changed: false,
  aggregate,
  focus_queries: focusQueries,
  queries: queryReports,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  reference_evidence: report.reference_evidence,
  candidate_policy: report.candidate_policy,
  aggregate: report.aggregate,
  focus_queries: report.focus_queries.map((row) => ({
    query: row.query,
    runtime_matches_validated_candidate: row.runtime_matches_validated_candidate,
    runtime_reported_policy: row.runtime_reported_policy,
    engine: row.engine_runtime.reference_metrics,
    candidate: row.candidate_runtime.reference_metrics,
    new_top20_safety: row.candidate_runtime.new_top20_safety,
    new_top250_safety: row.candidate_runtime.new_top250_safety,
  })),
  saved: outPath,
}, null, 2));

if (report.status !== 'ok') process.exitCode = 1;
