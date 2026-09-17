#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { benchmarkTaskId } from './benchmark-core.mjs';
import { rankPrimaryResults, CANDIDATE_PRIMARY_RANKING_POLICY } from './ranking-policy-core.mjs';
import { findRhymes, openRhymeDb } from '../src/local-engine.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const planPath = resolve(argValue('--plan', 'benchmarks/de-v1/plan.json'));
const dbPath = resolve(argValue('--db', process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-refresh-reviews.json'));
const outPath = resolve(argValue('--out', 'reports/de-rhyme-benchmark-ranking-live-preview.json'));
const resultLimit = 250;
const poolLimit = 800;
const topLimit = 20;

function safeRatio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function mean(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(4)) : null;
}

function dcg(rows) {
  return rows.reduce((sum, row, index) => sum + ((2 ** row.reference.usefulness) - 1) / Math.log2(index + 2), 0);
}

function key(row) {
  return `${row.normalized}\u0000${row.ipa}`;
}

function metricsForReviewed(rows) {
  const reviewed = rows.filter((row) => row.reference);
  if (!reviewed.length) {
    return { reviewed_candidates: 0, ndcg: null, pairwise_concordance: null, comparable_pairs: 0 };
  }
  const ideal = [...reviewed].sort((a, b) => b.reference.usefulness - a.reference.usefulness || a.rank - b.rank);
  const idealDcg = dcg(ideal);
  let comparablePairs = 0;
  let concordantPairs = 0;
  for (let i = 0; i < reviewed.length; i += 1) {
    for (let j = i + 1; j < reviewed.length; j += 1) {
      if (reviewed[i].reference.usefulness === reviewed[j].reference.usefulness) continue;
      comparablePairs += 1;
      if (reviewed[i].reference.usefulness > reviewed[j].reference.usefulness) concordantPairs += 1;
    }
  }
  return {
    reviewed_candidates: reviewed.length,
    ndcg: idealDcg ? Number((dcg(reviewed) / idealDcg).toFixed(4)) : null,
    pairwise_concordance: safeRatio(concordantPairs, comparablePairs),
    comparable_pairs: comparablePairs,
  };
}

const plan = JSON.parse(await readFile(planPath, 'utf8'));
const reviews = JSON.parse(await readFile(reviewsPath, 'utf8'));
if (plan.schema !== 'rhymelab-de-benchmark-plan-v1') throw new Error(`Unexpected benchmark plan schema: ${plan.schema}`);
if (reviews.schema !== 'rhymelab-de-human-benchmark-reviews-v1') throw new Error(`Unexpected benchmark reviews schema: ${reviews.schema}`);
const reviewByTaskId = new Map((reviews.reviews || []).filter((row) => !row.skip).map((row) => [String(row.task_id), row]));

const db = openRhymeDb(dbPath);
const queryReports = [];
const missingQueries = [];
try {
  for (const queryPlan of plan.queries || []) {
    const word = String(queryPlan.word || '').trim();
    if (!word) continue;
    const live = findRhymes(db, word, {
      limit: resultLimit,
      poolLimit,
      type: 'all',
      includeVariants: false,
      includeHistorical: false,
      ensureTypeCoverage: false,
    });
    if (!live) {
      missingQueries.push(word);
      continue;
    }

    const attachReference = (row) => {
      const taskId = benchmarkTaskId(live.query.surface, row.word, live.query.preferredIpa || '', row.ipa || '');
      const review = reviewByTaskId.get(taskId) || null;
      return {
        ...row,
        taskId,
        reference: review ? {
          primary: review.primary,
          usefulness: Number(review.usefulness ?? 0),
          confidence: review.confidence ?? null,
          reviewer_source: review.reviewer_source ?? null,
        } : null,
      };
    };

    const engineRows = live.results.map(attachReference);
    const reconstructed = rankPrimaryResults(engineRows, 'usage_first');
    const candidate = rankPrimaryResults(engineRows, CANDIDATE_PRIMARY_RANKING_POLICY);
    const engineKeys = engineRows.map(key);
    const reconstructedKeys = reconstructed.map(key);
    const reconstructionMatchesEngine = engineKeys.length === reconstructedKeys.length
      && engineKeys.every((value, index) => value === reconstructedKeys[index]);

    const annotateRanks = (rows) => rows.map((row, index) => ({ ...row, rank: index + 1 }));
    const engineRanked = annotateRanks(engineRows);
    const candidateRanked = annotateRanks(candidate);
    const engineRankByKey = new Map(engineRanked.map((row) => [key(row), row.rank]));
    const candidateRankByKey = new Map(candidateRanked.map((row) => [key(row), row.rank]));

    const compact = (row) => ({
      rank: row.rank,
      word: row.word,
      ipa: row.ipa,
      primary: row.primaryType || 'none',
      score: row.score,
      rhyme_tier: row.rhymeTier,
      syllable_distance: row.syllableDistance,
      usage_rank: row.usageRank ?? null,
      lexicon_layer: row.lexiconLayer ?? null,
      entity_kind: row.entityKind ?? null,
      reference: row.reference,
    });

    const engineTop = engineRanked.slice(0, topLimit);
    const candidateTop = candidateRanked.slice(0, topLimit);
    const engineTopKeys = new Set(engineTop.map(key));
    const candidateTopKeys = new Set(candidateTop.map(key));
    const newInCandidateTop = candidateTop.filter((row) => !engineTopKeys.has(key(row)));
    const droppedFromCandidateTop = engineTop.filter((row) => !candidateTopKeys.has(key(row)));

    const movers = candidateRanked
      .map((row) => ({
        ...compact(row),
        old_rank: engineRankByKey.get(key(row)) ?? null,
        rank_delta: (engineRankByKey.get(key(row)) ?? row.rank) - row.rank,
      }))
      .filter((row) => row.rank_delta !== 0)
      .sort((a, b) => Math.abs(b.rank_delta) - Math.abs(a.rank_delta) || a.rank - b.rank)
      .slice(0, 20);

    queryReports.push({
      query: word,
      query_ipa: live.query.preferredIpa || null,
      candidate_count: engineRows.length,
      reconstruction_matches_engine: reconstructionMatchesEngine,
      reference_metrics: {
        engine_rank: metricsForReviewed(engineRanked),
        score_band_0_05: metricsForReviewed(candidateRanked),
      },
      top20_changed: newInCandidateTop.length > 0 || droppedFromCandidateTop.length > 0,
      new_in_score_band_top20: newInCandidateTop.map(compact),
      dropped_from_score_band_top20: droppedFromCandidateTop.map(compact),
      unreviewed_in_score_band_top20: candidateTop.filter((row) => !row.reference).map(compact),
      biggest_rank_moves: movers,
      engine_top20: engineTop.map(compact),
      score_band_0_05_top20: candidateTop.map(compact),
    });
  }
} finally {
  db.close();
}

const aggregate = {
  query_count: queryReports.length,
  missing_queries: missingQueries,
  reconstruction_mismatch_queries: queryReports.filter((row) => !row.reconstruction_matches_engine).map((row) => row.query),
  queries_with_top20_change: queryReports.filter((row) => row.top20_changed).map((row) => row.query),
  total_new_score_band_top20_candidates: queryReports.reduce((sum, row) => sum + row.new_in_score_band_top20.length, 0),
  total_unreviewed_score_band_top20_candidates: queryReports.reduce((sum, row) => sum + row.unreviewed_in_score_band_top20.length, 0),
  reference_metrics: {
    engine_rank: {
      mean_ndcg: mean(queryReports.map((row) => row.reference_metrics.engine_rank.ndcg)),
      mean_pairwise_concordance: mean(queryReports.map((row) => row.reference_metrics.engine_rank.pairwise_concordance)),
    },
    score_band_0_05: {
      mean_ndcg: mean(queryReports.map((row) => row.reference_metrics.score_band_0_05.ndcg)),
      mean_pairwise_concordance: mean(queryReports.map((row) => row.reference_metrics.score_band_0_05.pairwise_concordance)),
    },
  },
};
aggregate.reference_metrics.score_band_0_05.delta_vs_engine_rank = {
  mean_ndcg: aggregate.reference_metrics.score_band_0_05.mean_ndcg == null || aggregate.reference_metrics.engine_rank.mean_ndcg == null
    ? null
    : Number((aggregate.reference_metrics.score_band_0_05.mean_ndcg - aggregate.reference_metrics.engine_rank.mean_ndcg).toFixed(4)),
  mean_pairwise_concordance: aggregate.reference_metrics.score_band_0_05.mean_pairwise_concordance == null || aggregate.reference_metrics.engine_rank.mean_pairwise_concordance == null
    ? null
    : Number((aggregate.reference_metrics.score_band_0_05.mean_pairwise_concordance - aggregate.reference_metrics.engine_rank.mean_pairwise_concordance).toFixed(4)),
};

const report = {
  schema: 'rhymelab-benchmark-ranking-live-preview-v1',
  benchmark_version: reviews.benchmark_version || plan.version || null,
  language: plan.language || 'de',
  generated_at: new Date().toISOString(),
  scope: 'reorder the current engine top-250 candidate set under the 0.05 primary-score-band policy; runtime order, retrieval, scorer, DB and labels are unchanged',
  limitation: 'candidates outside the current usage-first top-250 are not surfaced by this preview and require a later runtime-candidate validation if the policy is promoted',
  candidate_policy: CANDIDATE_PRIMARY_RANKING_POLICY,
  candidate_source: 'current_engine_top_250_per_query_with_pool_limit_800',
  top_preview: topLimit,
  aggregate,
  queries: queryReports,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  candidate_policy: report.candidate_policy,
  aggregate: report.aggregate,
  saved: outPath,
}, null, 2));
