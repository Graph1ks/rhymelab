import {
  PRIMARY_SCORE_BAND_WIDTH,
  compareUsageFirstResults,
  primaryScoreBand,
} from './ranking-policy-core.mjs';

export const MODERN_ENTITY_RELATIVE_COMMONNESS_POLICY = 'modern_entity_relative_commonness_1decade_0_05';
export const MODERN_ENTITY_RELATIVE_COMMONNESS_MAX_LOG10_DELTA = 1;

export const HYBRID_PRIMARY_RANKING_POLICIES = Object.freeze([
  'lexical_hybrid_decade_0_05',
  'lexical_hybrid_decade_rare_guard_0_05',
  'modern_entity_log_commonness_0_04',
  'modern_entity_log_commonness_0_05',
  'modern_entity_log_commonness_0_06',
  MODERN_ENTITY_RELATIVE_COMMONNESS_POLICY,
]);

export const DEFAULT_HYBRID_PRIMARY_RANKING_POLICY = 'lexical_hybrid_decade_rare_guard_0_05';
export const PROTECTED_PRIMARY_TIER_MAX = 1;
export const MODERN_ENTITY_LOG_COMMONNESS_LAMBDAS = Object.freeze({
  modern_entity_log_commonness_0_04: 0.04,
  modern_entity_log_commonness_0_05: 0.05,
  modern_entity_log_commonness_0_06: 0.06,
});

function numericUsageRank(row) {
  const value = Number(row?.usageRank);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function numericScore(row) {
  const value = Number(row?.score);
  return Number.isFinite(value) ? value : 0;
}
function numericTier(row) {
  const value = Number(row?.rhymeTier);
  return Number.isFinite(value) ? value : 99;
}
function numericSyllableDistance(row) {
  const value = Number(row?.syllableDistance);
  return Number.isFinite(value) ? value : 99;
}
function lexicalTags(row) {
  return Array.isArray(row?.lexicalTags)
    ? row.lexicalTags.map((value) => String(value).trim().toLocaleLowerCase('en-US')).filter(Boolean)
    : [];
}
function lexicalCompare(a, b) {
  const locale = a?.language === 'en' ? 'en' : 'de';
  return String(a?.word || '').localeCompare(String(b?.word || ''), locale);
}
function isModernEntityPolicy(policy) {
  return Object.hasOwn(MODERN_ENTITY_LOG_COMMONNESS_LAMBDAS, policy)
    || policy === MODERN_ENTITY_RELATIVE_COMMONNESS_POLICY;
}

export function usageOrderBucket(row) {
  const rank = numericUsageRank(row);
  return rank == null ? null : Math.floor(Math.log10(rank));
}
export function missingUsageEvidenceClass(row) {
  if (numericUsageRank(row) != null) return 0;
  return String(row?.lexiconLayer || '').toLocaleLowerCase('en-US') === 'modern' ? 1 : 2;
}
export function hasExplicitRareLexicalEvidence(row) {
  return lexicalTags(row).includes('rare');
}
export function isModernEntityQueryContext(queryContext) {
  return String(queryContext?.lexiconLayer || '').toLocaleLowerCase('en-US') === 'modern';
}
export function preservesAcceptedOrdering(row) {
  return numericTier(row) <= PROTECTED_PRIMARY_TIER_MAX || !row?.primaryType;
}
export function preservesAcceptedOrderingForPolicy(row, policy, queryContext = null) {
  if (!isModernEntityPolicy(policy)) return preservesAcceptedOrdering(row);
  if (!isModernEntityQueryContext(queryContext)) return true;
  return numericTier(row) === 0 || !row?.primaryType;
}
export function lexicalHybridSignals(row) {
  return {
    usage_rank: numericUsageRank(row),
    usage_order_bucket: usageOrderBucket(row),
    usage_evidence_class: missingUsageEvidenceClass(row),
    lexicon_layer: row?.lexiconLayer ?? null,
    explicit_rare: hasExplicitRareLexicalEvidence(row),
    accepted_ordering_protected: preservesAcceptedOrdering(row),
  };
}
export function logCommonnessAdjustedScore(row, lambda) {
  const rank = numericUsageRank(row);
  if (rank == null) return null;
  const numericLambda = Number(lambda);
  if (!Number.isFinite(numericLambda) || numericLambda < 0) throw new TypeError('commonness lambda must be non-negative');
  return numericScore(row) - numericLambda * Math.log10(rank);
}
export function relativeCommonnessLog10Delta(row, queryContext) {
  const candidateRank = numericUsageRank(row);
  const queryRank = numericUsageRank(queryContext);
  if (candidateRank == null || queryRank == null) return null;
  return Math.log10(candidateRank / queryRank);
}
export function withinQueryCommonnessHorizon(
  row,
  queryContext,
  maxLog10Delta = MODERN_ENTITY_RELATIVE_COMMONNESS_MAX_LOG10_DELTA,
) {
  const delta = relativeCommonnessLog10Delta(row, queryContext);
  const maxDelta = Number(maxLog10Delta);
  if (!Number.isFinite(maxDelta) || maxDelta < 0) throw new TypeError('relative commonness horizon must be non-negative');
  return delta == null ? null : delta <= maxDelta;
}

export function compareLexicalHybridResults(a, b, options = {}) {
  const width = Number(options.scoreBandWidth ?? PRIMARY_SCORE_BAND_WIDTH);
  const rareGuard = options.rareGuard === true;
  const tierDelta = numericTier(a) - numericTier(b);
  if (tierDelta) return tierDelta;
  const syllableDelta = numericSyllableDistance(a) - numericSyllableDistance(b);
  if (syllableDelta) return syllableDelta;
  if (preservesAcceptedOrdering(a) || preservesAcceptedOrdering(b)) return compareUsageFirstResults(a, b);

  const usageEvidenceDelta = missingUsageEvidenceClass(a) - missingUsageEvidenceClass(b);
  if (usageEvidenceDelta) return usageEvidenceDelta;
  const bucketA = usageOrderBucket(a);
  const bucketB = usageOrderBucket(b);
  const bucketDelta = (bucketA ?? Number.MAX_SAFE_INTEGER) - (bucketB ?? Number.MAX_SAFE_INTEGER);
  if (bucketDelta) return bucketDelta;
  if (rareGuard) {
    const rareDelta = Number(hasExplicitRareLexicalEvidence(a)) - Number(hasExplicitRareLexicalEvidence(b));
    if (rareDelta) return rareDelta;
  }
  const scoreBandDelta = primaryScoreBand(numericScore(b), width) - primaryScoreBand(numericScore(a), width);
  if (scoreBandDelta) return scoreBandDelta;
  const usageA = numericUsageRank(a) ?? Number.MAX_SAFE_INTEGER;
  const usageB = numericUsageRank(b) ?? Number.MAX_SAFE_INTEGER;
  return usageA - usageB || numericScore(b) - numericScore(a) || lexicalCompare(a, b);
}

export function compareModernEntityLogCommonnessResults(a, b, options = {}) {
  const policy = String(options.policy || 'modern_entity_log_commonness_0_05');
  const lambda = Number(options.lambda ?? MODERN_ENTITY_LOG_COMMONNESS_LAMBDAS[policy] ?? 0.05);
  const width = Number(options.scoreBandWidth ?? PRIMARY_SCORE_BAND_WIDTH);
  const queryContext = options.queryContext ?? null;
  if (!isModernEntityQueryContext(queryContext)) return compareUsageFirstResults(a, b);

  const tierDelta = numericTier(a) - numericTier(b);
  if (tierDelta) return tierDelta;
  const syllableDelta = numericSyllableDistance(a) - numericSyllableDistance(b);
  if (syllableDelta) return syllableDelta;
  if (numericTier(a) === 0 || numericTier(b) === 0 || !a?.primaryType || !b?.primaryType) {
    return compareUsageFirstResults(a, b);
  }

  const usageEvidenceDelta = missingUsageEvidenceClass(a) - missingUsageEvidenceClass(b);
  if (usageEvidenceDelta) return usageEvidenceDelta;
  const rareDelta = Number(hasExplicitRareLexicalEvidence(a)) - Number(hasExplicitRareLexicalEvidence(b));
  if (rareDelta) return rareDelta;

  const adjustedA = logCommonnessAdjustedScore(a, lambda);
  const adjustedB = logCommonnessAdjustedScore(b, lambda);
  if (adjustedA != null && adjustedB != null) {
    const adjustedBandDelta = primaryScoreBand(adjustedB, width) - primaryScoreBand(adjustedA, width);
    if (adjustedBandDelta) return adjustedBandDelta;
  }

  const usageA = numericUsageRank(a) ?? Number.MAX_SAFE_INTEGER;
  const usageB = numericUsageRank(b) ?? Number.MAX_SAFE_INTEGER;
  return usageA - usageB || numericScore(b) - numericScore(a) || lexicalCompare(a, b);
}

export function compareModernEntityRelativeCommonnessResults(a, b, options = {}) {
  const width = Number(options.scoreBandWidth ?? PRIMARY_SCORE_BAND_WIDTH);
  const queryContext = options.queryContext ?? null;
  const maxLog10Delta = Number(
    options.maxLog10Delta ?? MODERN_ENTITY_RELATIVE_COMMONNESS_MAX_LOG10_DELTA,
  );
  if (!isModernEntityQueryContext(queryContext) || numericUsageRank(queryContext) == null) {
    return compareUsageFirstResults(a, b);
  }

  const tierDelta = numericTier(a) - numericTier(b);
  if (tierDelta) return tierDelta;
  const syllableDelta = numericSyllableDistance(a) - numericSyllableDistance(b);
  if (syllableDelta) return syllableDelta;
  if (numericTier(a) === 0 || numericTier(b) === 0 || !a?.primaryType || !b?.primaryType) {
    return compareUsageFirstResults(a, b);
  }

  const usageA = numericUsageRank(a);
  const usageB = numericUsageRank(b);
  if (usageA == null || usageB == null) return compareUsageFirstResults(a, b);

  const withinA = withinQueryCommonnessHorizon(a, queryContext, maxLog10Delta);
  const withinB = withinQueryCommonnessHorizon(b, queryContext, maxLog10Delta);
  const horizonDelta = Number(!withinA) - Number(!withinB);
  if (horizonDelta) return horizonDelta;
  if (!withinA && !withinB) return compareUsageFirstResults(a, b);

  const rareDelta = Number(hasExplicitRareLexicalEvidence(a)) - Number(hasExplicitRareLexicalEvidence(b));
  if (rareDelta) return rareDelta;
  const scoreBandDelta = primaryScoreBand(numericScore(b), width) - primaryScoreBand(numericScore(a), width);
  if (scoreBandDelta) return scoreBandDelta;
  return usageA - usageB || numericScore(b) - numericScore(a) || lexicalCompare(a, b);
}

export function rankLexicalHybridResults(rows, policy = DEFAULT_HYBRID_PRIMARY_RANKING_POLICY, queryContext = null) {
  const copy = [...(rows || [])];
  if (policy === 'lexical_hybrid_decade_0_05') {
    return copy.sort((a, b) => compareLexicalHybridResults(a, b, {
      scoreBandWidth: PRIMARY_SCORE_BAND_WIDTH,
      rareGuard: false,
    }));
  }
  if (policy === 'lexical_hybrid_decade_rare_guard_0_05') {
    return copy.sort((a, b) => compareLexicalHybridResults(a, b, {
      scoreBandWidth: PRIMARY_SCORE_BAND_WIDTH,
      rareGuard: true,
    }));
  }
  if (Object.hasOwn(MODERN_ENTITY_LOG_COMMONNESS_LAMBDAS, policy)) {
    return copy.sort((a, b) => compareModernEntityLogCommonnessResults(a, b, {
      policy,
      lambda: MODERN_ENTITY_LOG_COMMONNESS_LAMBDAS[policy],
      scoreBandWidth: PRIMARY_SCORE_BAND_WIDTH,
      queryContext,
    }));
  }
  if (policy === MODERN_ENTITY_RELATIVE_COMMONNESS_POLICY) {
    return copy.sort((a, b) => compareModernEntityRelativeCommonnessResults(a, b, {
      scoreBandWidth: PRIMARY_SCORE_BAND_WIDTH,
      maxLog10Delta: MODERN_ENTITY_RELATIVE_COMMONNESS_MAX_LOG10_DELTA,
      queryContext,
    }));
  }
  throw new Error(`Unknown lexical hybrid ranking policy: ${policy}`);
}
