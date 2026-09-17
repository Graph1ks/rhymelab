#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { benchmarkTaskId } from './benchmark-core.mjs';
import { benchmarkQueueFingerprint } from './benchmark-handoff-core.mjs';
import { rankPrimaryResults } from './ranking-policy-core.mjs';
import {
  lexicalHybridSignals,
  preservesAcceptedOrderingForPolicy,
  rankLexicalHybridResults,
  relativeCommonnessLog10Delta,
  withinQueryCommonnessHorizon,
} from './ranking-hybrid-policy-core.mjs';
import { findRhymes, getWord, openRhymeDb } from '../src/local-engine.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const planPath = resolve(argValue('--plan', 'benchmarks/de-v1/plan.json'));
const queuePath = resolve(argValue('--queue', 'data/local/benchmark/de-v1-refresh-queue.json'));
const reviewsPath = resolve(argValue('--reviews', 'data/local/benchmark/de-v1-refresh-reviews.json'));
const dbPath = resolve(argValue('--db', process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite'));
const outPath = resolve(argValue('--out', 'reports/de-rhyme-benchmark-ranking-hybrid.json'));
const resultLimit = 250;
const poolLimit = 800;
const topLimit = 20;
const POLICIES = Object.freeze([
  'engine_rank',
  'score_band_0_05',
  'modern_entity_log_commonness_0_04',
  'modern_entity_relative_commonness_1decade_0_05',
]);
const FOCUS_QUERIES = new Set(['Spotify', 'YouTube', 'Netflix', 'TikTok', 'hitzefrei']);

function safeRatio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}
function mean(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(4)) : null;
}
function roundedDelta(candidate, baseline) {
  return candidate == null || baseline == null ? null : Number((candidate - baseline).toFixed(4));
}
function dcg(rows, usefulnessOf) {
  return rows.reduce((sum, row, index) => sum + ((2 ** usefulnessOf(row)) - 1) / Math.log2(index + 2), 0);
}
function resultKey(row) {
  return `${row.normalized ?? String(row.word || '').toLocaleLowerCase('de-DE')}\u0000${row.ipa || ''}`;
}
function queryContext(query) {
  return query ? {
    word: query.surface ?? null,
    lexicon_layer: query.lexiconLayer ?? null,
    entity_kind: query.entityKind ?? null,
    usage_rank: query.usageRank ?? null,
    syllable_count: query.syllableCount ?? null,
  } : null;
}
function relativeSignals(row, context) {
  const applicable = String(context?.lexiconLayer || '').toLocaleLowerCase('en-US') === 'modern'
    && Number.isFinite(Number(context?.usageRank))
    && Number(context.usageRank) > 0;
  if (!applicable) {
    return {
      applicable: false,
      query_usage_rank: context?.usageRank ?? null,
      usage_ratio_vs_query: null,
      log10_usage_ratio_vs_query: null,
      within_query_commonness_1decade: null,
    };
  }
  const delta = relativeCommonnessLog10Delta(row, context);
  const ratio = delta == null ? null : Number((10 ** delta).toFixed(4));
  return {
    applicable: true,
    query_usage_rank: context.usageRank,
    usage_ratio_vs_query: ratio,
    log10_usage_ratio_vs_query: delta == null ? null : Number(delta.toFixed(4)),
    within_query_commonness_1decade: withinQueryCommonnessHorizon(row, context),
  };
}

function sampleResult(task, language) {
  return {
    language: language || 'de',
    word: task?.candidate?.word || '',
    normalized: task?.candidate?.normalized || null,
    ipa: task?.candidate?.ipa || '',
    usageRank: task?.candidate?.usage_rank ?? null,
    lexiconLayer: task?.candidate?.lexicon_layer ?? null,
    lexicalTags: Array.isArray(task?.candidate?.lexical_tags) ? task.candidate.lexical_tags : [],
    score: Number(task?.engine?.primary_score ?? 0),
    rhymeTier: Number(task?.engine?.rhyme_tier ?? 99),
    syllableDistance: Number(task?.engine?.syllable_distance ?? 99),
    primaryType: task?.engine?.primary_type || null,
    engineRank: Number(task?.engine?.overall_rank ?? Number.MAX_SAFE_INTEGER),
  };
}
function rankResults(rows, policy, context) {
  if (policy === 'engine_rank') return [...rows];
  if (policy === 'score_band_0_05') return rankPrimaryResults(rows, 'score_band_0_05');
  return rankLexicalHybridResults(rows, policy, context);
}
function rankSampleRows(rows, policy, context) {
  const copied = rows.map((row) => ({ ...row, result: { ...row.result } }));
  if (policy === 'engine_rank') return copied.sort((a, b) => a.result.engineRank - b.result.engineRank);
  const ordered = rankResults(copied.map((row) => row.result), policy, context);
  const byKey = new Map(copied.map((row) => [resultKey(row.result), row]));
  return ordered.map((result) => byKey.get(resultKey(result)));
}
function sampleMetrics(rows, policy, context) {
  const ranked = rankSampleRows(rows, policy, context);
  const ideal = [...rows].sort((a, b) => b.usefulness - a.usefulness || a.result.engineRank - b.result.engineRank);
  const idealDcg = dcg(ideal, (row) => row.usefulness);
  let comparablePairs = 0;
  let concordantPairs = 0;
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      if (ranked[i].usefulness === ranked[j].usefulness) continue;
      comparablePairs += 1;
      if (ranked[i].usefulness > ranked[j].usefulness) concordantPairs += 1;
    }
  }
  return {
    ranked_tasks: ranked.length,
    ndcg: idealDcg ? Number((dcg(ranked, (row) => row.usefulness) / idealDcg).toFixed(4)) : null,
    pairwise_concordance: safeRatio(concordantPairs, comparablePairs),
    comparable_pairs: comparablePairs,
    top: ranked.slice(0, 8).map((row, index) => ({
      rank: index + 1,
      word: row.result.word,
      engine_rank: row.result.engineRank,
      primary: row.result.primaryType || 'none',
      primary_score: row.result.score,
      usage_rank: row.result.usageRank,
      usefulness: row.usefulness,
      confidence: row.review.confidence ?? null,
      hybrid_signals: lexicalHybridSignals(row.result),
      relative_commonness: relativeSignals(row.result, context),
    })),
  };
}
function buildSampleSection(queue, reviews, queryContexts) {
  const reviewById = new Map((reviews.reviews || []).map((review) => [String(review.task_id), review]));
  const byQuery = new Map();
  for (const task of queue.tasks || []) {
    if (task?.engine?.overall_rank == null) continue;
    const review = reviewById.get(String(task.id));
    if (!review || review.skip) continue;
    const query = String(task?.query?.word || '');
    if (!byQuery.has(query)) byQuery.set(query, []);
    byQuery.get(query).push({
      review,
      usefulness: Number(review.usefulness ?? 0),
      result: sampleResult(task, queue.language),
    });
  }
  const perQuery = [...byQuery.entries()].map(([query, rows]) => {
    const context = queryContexts.get(query) || null;
    return {
      query,
      query_context: queryContext(context),
      policies: Object.fromEntries(POLICIES.map((policy) => [policy, sampleMetrics(rows, policy, context)])),
    };
  }).sort((a, b) => a.query.localeCompare(b.query, 'de'));
  const aggregate = Object.fromEntries(POLICIES.map((policy) => [policy, {
    mean_ndcg: mean(perQuery.map((row) => row.policies[policy].ndcg)),
    mean_pairwise_concordance: mean(perQuery.map((row) => row.policies[policy].pairwise_concordance)),
  }]));
  for (const policy of POLICIES) {
    aggregate[policy].delta_vs_engine_rank = {
      mean_ndcg: roundedDelta(aggregate[policy].mean_ndcg, aggregate.engine_rank.mean_ndcg),
      mean_pairwise_concordance: roundedDelta(
        aggregate[policy].mean_pairwise_concordance,
        aggregate.engine_rank.mean_pairwise_concordance,
      ),
    };
  }
  return {
    scope: 'fixed reviewed benchmark sample with current local DB query context; reviewer usefulness remains evidence, not the sole product objective',
    aggregate,
    per_query: perQuery,
  };
}

function metricsForReviewed(rows) {
  const reviewed = rows.filter((row) => row.reference);
  if (!reviewed.length) return { reviewed_candidates: 0, ndcg: null, pairwise_concordance: null, comparable_pairs: 0 };
  const ideal = [...reviewed].sort((a, b) => b.reference.usefulness - a.reference.usefulness || a.rank - b.rank);
  const idealDcg = dcg(ideal, (row) => row.reference.usefulness);
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
    ndcg: idealDcg ? Number((dcg(reviewed, (row) => row.reference.usefulness) / idealDcg).toFixed(4)) : null,
    pairwise_concordance: safeRatio(concordantPairs, comparablePairs),
    comparable_pairs: comparablePairs,
  };
}
function compact(row, context) {
  return {
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
    lexical_tags: row.lexicalTags ?? [],
    hybrid_signals: lexicalHybridSignals(row),
    relative_commonness: relativeSignals(row, context),
    reference: row.reference,
  };
}
function safetyForRows(rows) {
  const buckets = {};
  let withoutUsageRank = 0;
  let unrankedDictionary = 0;
  let unrankedModern = 0;
  let explicitRare = 0;
  let worseThan100k = 0;
  let worseThan500k = 0;
  let outsideRelativeHorizon = 0;
  let relativeHorizonUnknown = 0;
  for (const row of rows) {
    const usageRank = row?.usage_rank ?? row?.usageRank ?? null;
    const lexiconLayer = row?.lexicon_layer ?? row?.lexiconLayer ?? null;
    const lexicalTags = row?.lexical_tags ?? row?.lexicalTags ?? [];
    const signalRow = {
      ...row,
      usageRank,
      lexiconLayer,
      lexicalTags,
      rhymeTier: row?.rhyme_tier ?? row?.rhymeTier,
      primaryType: row?.primary === 'none' ? null : (row?.primary ?? row?.primaryType),
    };
    const signals = lexicalHybridSignals(signalRow);
    if (signals.usage_rank == null) {
      withoutUsageRank += 1;
      if (String(signals.lexicon_layer || '').toLocaleLowerCase('en-US') === 'modern') unrankedModern += 1;
      else unrankedDictionary += 1;
    } else {
      if (signals.usage_rank > 100000) worseThan100k += 1;
      if (signals.usage_rank > 500000) worseThan500k += 1;
      const key = String(signals.usage_order_bucket);
      buckets[key] = (buckets[key] || 0) + 1;
    }
    if (signals.explicit_rare) explicitRare += 1;
    const relative = row?.relative_commonness;
    if (relative?.applicable) {
      if (relative.within_query_commonness_1decade === false) outsideRelativeHorizon += 1;
      if (relative.within_query_commonness_1decade == null) relativeHorizonUnknown += 1;
    }
  }
  return {
    candidates: rows.length,
    without_usage_rank: withoutUsageRank,
    unranked_dictionary: unrankedDictionary,
    unranked_modern: unrankedModern,
    explicit_rare: explicitRare,
    usage_rank_worse_than_100000: worseThan100k,
    usage_rank_worse_than_500000: worseThan500k,
    outside_query_relative_1decade_horizon: outsideRelativeHorizon,
    query_relative_horizon_unknown: relativeHorizonUnknown,
    usage_order_bucket_counts: buckets,
  };
}
function annotateRanks(rows) {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
function sameKeyOrder(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function protectedOrderingMatches(engineRanked, candidateRanked, policy, context) {
  const engineProtected = engineRanked
    .filter((row) => preservesAcceptedOrderingForPolicy(row, policy, context))
    .map(resultKey);
  const candidateProtected = candidateRanked
    .filter((row) => preservesAcceptedOrderingForPolicy(row, policy, context))
    .map(resultKey);
  return sameKeyOrder(engineProtected, candidateProtected);
}
function summarizeLive(queryReports) {
  const aggregate = {
    query_count: queryReports.length,
    missing_queries: [],
    reconstruction_mismatch_queries: queryReports.filter((row) => !row.reconstruction_matches_engine).map((row) => row.query),
    policies: {},
  };
  for (const policy of POLICIES) {
    const topRows = queryReports.flatMap((row) => row.policies[policy].top20);
    const newRows = queryReports.flatMap((row) => row.policies[policy].new_in_top20);
    aggregate.policies[policy] = {
      reference_metrics: {
        mean_ndcg: mean(queryReports.map((row) => row.policies[policy].reference_metrics.ndcg)),
        mean_pairwise_concordance: mean(queryReports.map((row) => row.policies[policy].reference_metrics.pairwise_concordance)),
      },
      top20_safety: safetyForRows(topRows),
      new_top20_safety: safetyForRows(newRows),
      queries_with_top20_change: queryReports.filter((row) => row.policies[policy].top20_changed).map((row) => row.query),
      protected_order_mismatch_queries: queryReports
        .filter((row) => !row.policies[policy].protected_order_matches_engine)
        .map((row) => row.query),
    };
  }
  for (const policy of POLICIES) {
    const current = aggregate.policies[policy].reference_metrics;
    const baseline = aggregate.policies.engine_rank.reference_metrics;
    current.delta_vs_engine_rank = {
      mean_ndcg: roundedDelta(current.mean_ndcg, baseline.mean_ndcg),
      mean_pairwise_concordance: roundedDelta(current.mean_pairwise_concordance, baseline.mean_pairwise_concordance),
    };
  }
  return aggregate;
}

const plan = JSON.parse(await readFile(planPath, 'utf8'));
const queue = JSON.parse(await readFile(queuePath, 'utf8'));
const reviews = JSON.parse(await readFile(reviewsPath, 'utf8'));
if (plan.schema !== 'rhymelab-de-benchmark-plan-v1') throw new Error(`Unexpected benchmark plan schema: ${plan.schema}`);
if (queue.schema !== 'rhymelab-de-human-benchmark-queue-v1') throw new Error(`Unexpected queue schema: ${queue.schema}`);
if (reviews.schema !== 'rhymelab-de-human-benchmark-reviews-v1') throw new Error(`Unexpected benchmark reviews schema: ${reviews.schema}`);
if (queue.benchmark_version !== reviews.benchmark_version) throw new Error(`Benchmark version mismatch: ${queue.benchmark_version} vs ${reviews.benchmark_version}`);
const queueFingerprint = benchmarkQueueFingerprint(queue);
if (reviews.queue_fingerprint && reviews.queue_fingerprint !== queueFingerprint) {
  throw new Error('Review file queue fingerprint does not match the refreshed queue');
}
const reviewByTaskId = new Map((reviews.reviews || []).filter((row) => !row.skip).map((row) => [String(row.task_id), row]));

const db = openRhymeDb(dbPath);
const queryContexts = new Map();
const allQueryWords = new Set([
  ...(plan.queries || []).map((row) => String(row.word || '').trim()).filter(Boolean),
  ...(queue.tasks || []).map((row) => String(row?.query?.word || '').trim()).filter(Boolean),
]);
for (const word of allQueryWords) queryContexts.set(word, getWord(db, word));

const sample = buildSampleSection(queue, reviews, queryContexts);
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
    const context = live.query || null;
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
    const reconstructionMatchesEngine = sameKeyOrder(engineRows.map(resultKey), reconstructed.map(resultKey));
    const engineRanked = annotateRanks(engineRows);
    const engineTopKeys = new Set(engineRanked.slice(0, topLimit).map(resultKey));
    const policies = {};

    for (const policy of POLICIES) {
      const ranked = annotateRanks(rankResults(engineRows, policy, context));
      const top20 = ranked.slice(0, topLimit);
      const topKeys = new Set(top20.map(resultKey));
      const newInTop20 = policy === 'engine_rank' ? [] : top20.filter((row) => !engineTopKeys.has(resultKey(row)));
      const droppedFromTop20 = policy === 'engine_rank'
        ? [] : engineRanked.slice(0, topLimit).filter((row) => !topKeys.has(resultKey(row)));
      const movers = ranked
        .map((row) => {
          const oldRank = engineRanked.find((engineRow) => resultKey(engineRow) === resultKey(row))?.rank ?? row.rank;
          return { ...compact(row, context), old_rank: oldRank, rank_delta: oldRank - row.rank };
        })
        .filter((row) => row.rank_delta !== 0)
        .sort((a, b) => Math.abs(b.rank_delta) - Math.abs(a.rank_delta) || a.rank - b.rank)
        .slice(0, 20);
      const compactTop20 = top20.map((row) => compact(row, context));
      const compactNew = newInTop20.map((row) => compact(row, context));
      policies[policy] = {
        reference_metrics: metricsForReviewed(ranked),
        protected_order_matches_engine: protectedOrderingMatches(engineRanked, ranked, policy, context),
        top20_changed: newInTop20.length > 0 || droppedFromTop20.length > 0,
        top20_safety: safetyForRows(compactTop20),
        new_top20_safety: safetyForRows(compactNew),
        new_in_top20: compactNew,
        dropped_from_top20: droppedFromTop20.map((row) => compact(row, context)),
        unreviewed_in_top20: top20.filter((row) => !row.reference).map((row) => compact(row, context)),
        biggest_rank_moves: movers,
        top20: compactTop20,
      };
    }

    queryReports.push({
      query: word,
      query_ipa: live.query.preferredIpa || null,
      query_context: queryContext(context),
      candidate_count: engineRows.length,
      reconstruction_matches_engine: reconstructionMatchesEngine,
      policies,
    });
  }
} finally {
  db.close();
}

const live = summarizeLive(queryReports);
live.missing_queries = missingQueries;
const focusQueries = queryReports.filter((row) => FOCUS_QUERIES.has(row.query)).map((row) => ({
  query: row.query,
  query_context: row.query_context,
  policies: Object.fromEntries(POLICIES.map((policy) => [policy, {
    reference_metrics: row.policies[policy].reference_metrics,
    top20_safety: row.policies[policy].top20_safety,
    new_top20_safety: row.policies[policy].new_top20_safety,
    new_in_top20: row.policies[policy].new_in_top20,
    dropped_from_top20: row.policies[policy].dropped_from_top20,
  }])),
}));

const report = {
  schema: 'rhymelab-benchmark-ranking-hybrid-v3',
  benchmark_version: reviews.benchmark_version || plan.version || null,
  language: plan.language || queue.language || 'de',
  generated_at: new Date().toISOString(),
  queue_fingerprint: queueFingerprint,
  scope: 'third isolated ranking pass after v2 preserved dictionary safety but still promoted several much-rarer Netflix candidates; accepted runtime remains unchanged',
  limitation: 'live comparison reorders only current engine top-250 candidates per query with pool limit 800; a passing policy still requires retrieval-aware validation before runtime promotion',
  policy_notes: {
    baseline_runtime: 'engine_rank remains accepted v0.10 usage-first ordering',
    v2_reference: 'modern_entity_log_commonness_0_04 is retained as the strongest v2 reference policy',
    product_objective: 'reviewer ranking gains are balanced against the default-search requirement not to promote candidates that are orders of magnitude rarer than the modern query',
    modern_query_gate: 'experimental policies activate only when current DB query provenance has lexicon_layer=modern; dictionary queries fall back exactly to accepted usage-first ordering',
    relative_commonness: 'the v3 policy permits score-band reordering only for ranked candidates no more than one base-10 order of magnitude (10x) rarer than the modern query usage rank; this is query-relative, not a global frequency cutoff',
    outside_horizon: 'ranked candidates beyond the one-decade query-relative horizon retain accepted usage-first order and cannot leapfrog in-horizon candidates on phonetic score alone',
    missing_usage: 'if query usage rank is unavailable the whole v3 policy falls back to accepted usage-first; candidate pairs involving missing usage also keep accepted usage-first order',
    exact_relation_protection: 'within modern queries, primary tier 0 and relation-only rows retain accepted usage-first ordering',
    rare_guard: 'explicit source tag rare remains a negative lexical-quality signal inside the experimental reorderable set',
  },
  policies: POLICIES,
  sample,
  live,
  focus_queries: focusQueries,
  queries: queryReports,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  queue_fingerprint: report.queue_fingerprint,
  sample_aggregate: report.sample.aggregate,
  live_aggregate: report.live,
  saved: outPath,
}, null, 2));
