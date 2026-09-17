import { benchmarkTaskId } from './benchmark-core.mjs';
import {
  isModernEntityQueryContext,
  relativeCommonnessLog10Delta,
  withinQueryCommonnessHorizon,
} from './ranking-hybrid-policy-core.mjs';
import { runtimeResultKey } from './runtime-ranking-retrieval-core.mjs';

export function mean(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length
    ? Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(4))
    : null;
}

export function roundedDelta(candidate, baseline) {
  return candidate == null || baseline == null ? null : Number((candidate - baseline).toFixed(4));
}

function safeRatio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function dcg(rows, usefulnessOf) {
  return rows.reduce((sum, row, index) => sum + ((2 ** usefulnessOf(row)) - 1) / Math.log2(index + 2), 0);
}

export function queryContext(query) {
  return query ? {
    word: query.surface ?? null,
    lexicon_layer: query.lexiconLayer ?? null,
    entity_kind: query.entityKind ?? null,
    usage_rank: query.usageRank ?? null,
    syllable_count: query.syllableCount ?? null,
  } : null;
}

export function attachReference(rows, query, reviewByTaskId) {
  return rows.map((row, index) => {
    const taskId = benchmarkTaskId(query.surface, row.word, query.preferredIpa || '', row.ipa || '');
    const review = reviewByTaskId.get(taskId) || null;
    return {
      ...row,
      rank: index + 1,
      taskId,
      reference: review ? {
        primary: review.primary,
        usefulness: Number(review.usefulness ?? 0),
        confidence: review.confidence ?? null,
        reviewer_source: review.reviewer_source ?? null,
      } : null,
    };
  });
}

export function metricsForReviewed(rows) {
  const reviewed = rows.filter((row) => row.reference);
  if (!reviewed.length) {
    return { reviewed_candidates: 0, ndcg: null, pairwise_concordance: null, comparable_pairs: 0 };
  }

  const ideal = [...reviewed].sort(
    (a, b) => b.reference.usefulness - a.reference.usefulness || a.rank - b.rank,
  );
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

function relativeSignals(row, context) {
  const applicable = isModernEntityQueryContext(context)
    && Number.isFinite(Number(context?.usageRank))
    && Number(context.usageRank) > 0
    && Number.isFinite(Number(row?.usageRank))
    && Number(row.usageRank) > 0;

  if (!applicable) {
    return {
      applicable: false,
      usage_ratio_vs_query: null,
      log10_usage_ratio_vs_query: null,
      within_query_commonness_1decade: null,
    };
  }

  const ratio = Number(row.usageRank) / Number(context.usageRank);
  return {
    applicable: true,
    usage_ratio_vs_query: Number(ratio.toFixed(4)),
    log10_usage_ratio_vs_query: Number(relativeCommonnessLog10Delta(row, context).toFixed(4)),
    within_query_commonness_1decade: withinQueryCommonnessHorizon(row, context),
  };
}

export function safetyForRows(rows, context) {
  let withoutUsageRank = 0;
  let explicitRare = 0;
  let worseThan100k = 0;
  let worseThan500k = 0;
  let outsideHorizon = 0;
  let horizonUnknown = 0;
  const buckets = {};

  for (const row of rows) {
    const usage = Number(row?.usageRank);
    const hasUsage = Number.isFinite(usage) && usage > 0;

    if (!hasUsage) withoutUsageRank += 1;
    else {
      if (usage > 100000) worseThan100k += 1;
      if (usage > 500000) worseThan500k += 1;
      const bucket = String(Math.floor(Math.log10(usage)));
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    }

    if ((row?.lexicalTags || []).map((value) => String(value).toLocaleLowerCase('en-US')).includes('rare')) {
      explicitRare += 1;
    }

    if (isModernEntityQueryContext(context)) {
      const within = withinQueryCommonnessHorizon(row, context);
      if (within === false) outsideHorizon += 1;
      else if (within == null) horizonUnknown += 1;
    }
  }

  return {
    candidates: rows.length,
    without_usage_rank: withoutUsageRank,
    explicit_rare: explicitRare,
    usage_rank_worse_than_100000: worseThan100k,
    usage_rank_worse_than_500000: worseThan500k,
    outside_query_relative_1decade_horizon: outsideHorizon,
    query_relative_horizon_unknown: horizonUnknown,
    usage_order_bucket_counts: buckets,
  };
}

export function sumSafety(rows) {
  const totals = {
    candidates: 0,
    without_usage_rank: 0,
    explicit_rare: 0,
    usage_rank_worse_than_100000: 0,
    usage_rank_worse_than_500000: 0,
    outside_query_relative_1decade_horizon: 0,
    query_relative_horizon_unknown: 0,
    usage_order_bucket_counts: {},
  };

  for (const row of rows) {
    for (const key of [
      'candidates',
      'without_usage_rank',
      'explicit_rare',
      'usage_rank_worse_than_100000',
      'usage_rank_worse_than_500000',
      'outside_query_relative_1decade_horizon',
      'query_relative_horizon_unknown',
    ]) totals[key] += Number(row?.[key] || 0);

    for (const [bucket, count] of Object.entries(row?.usage_order_bucket_counts || {})) {
      totals.usage_order_bucket_counts[bucket] =
        (totals.usage_order_bucket_counts[bucket] || 0) + Number(count || 0);
    }
  }

  return totals;
}

export function compactRuntimeCandidate(row, context, baselineRank = null) {
  return {
    rank: row.rank,
    baseline_rank: baselineRank,
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
    relative_commonness: relativeSignals(row, context),
    reference: row.reference,
  };
}

export function rankByKey(rows) {
  return new Map(rows.map((row) => [runtimeResultKey(row), row.rank]));
}
