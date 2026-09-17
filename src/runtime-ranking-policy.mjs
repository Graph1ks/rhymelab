export const RUNTIME_RANKING_POLICY = 'modern_entity_relative_commonness_1decade_0_05';
export const RUNTIME_SCORE_BAND_WIDTH = 0.05;
export const RUNTIME_MAX_LOG10_COMMONNESS_DELTA = 1;

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

function primaryScoreBand(value, width = RUNTIME_SCORE_BAND_WIDTH) {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth) || numericWidth <= 0) {
    throw new TypeError('score-band width must be a positive number');
  }
  const numericValue = Number(value);
  return Math.floor(((Number.isFinite(numericValue) ? numericValue : 0) + 1e-9) / numericWidth);
}

export function compareUsageFirstRuntimeResults(a, b) {
  const usageA = numericUsageRank(a);
  const usageB = numericUsageRank(b);
  return numericTier(a) - numericTier(b)
    || numericSyllableDistance(a) - numericSyllableDistance(b)
    || Number(usageA == null) - Number(usageB == null)
    || (usageA ?? Number.MAX_SAFE_INTEGER) - (usageB ?? Number.MAX_SAFE_INTEGER)
    || numericScore(b) - numericScore(a)
    || lexicalCompare(a, b);
}

export function runtimeRelativeCommonnessLog10Delta(row, queryContext) {
  const candidateRank = numericUsageRank(row);
  const queryRank = numericUsageRank(queryContext);
  if (candidateRank == null || queryRank == null) return null;
  return Math.log10(candidateRank / queryRank);
}

export function runtimeWithinQueryCommonnessHorizon(
  row,
  queryContext,
  maxLog10Delta = RUNTIME_MAX_LOG10_COMMONNESS_DELTA,
) {
  const delta = runtimeRelativeCommonnessLog10Delta(row, queryContext);
  const maxDelta = Number(maxLog10Delta);
  if (!Number.isFinite(maxDelta) || maxDelta < 0) {
    throw new TypeError('relative commonness horizon must be non-negative');
  }
  return delta == null ? null : delta <= maxDelta;
}

export function compareRuntimeRecommendedResults(a, b, queryContext = null) {
  const modernQuery = String(queryContext?.lexiconLayer || '').toLocaleLowerCase('en-US') === 'modern';
  if (!modernQuery || numericUsageRank(queryContext) == null) {
    return compareUsageFirstRuntimeResults(a, b);
  }

  const tierDelta = numericTier(a) - numericTier(b);
  if (tierDelta) return tierDelta;
  const syllableDelta = numericSyllableDistance(a) - numericSyllableDistance(b);
  if (syllableDelta) return syllableDelta;

  // Preserve accepted ordering for exact tier-0 results and relation-only rows.
  if (numericTier(a) === 0 || numericTier(b) === 0 || !a?.primaryType || !b?.primaryType) {
    return compareUsageFirstRuntimeResults(a, b);
  }

  const usageA = numericUsageRank(a);
  const usageB = numericUsageRank(b);
  if (usageA == null || usageB == null) return compareUsageFirstRuntimeResults(a, b);

  const withinA = runtimeWithinQueryCommonnessHorizon(a, queryContext);
  const withinB = runtimeWithinQueryCommonnessHorizon(b, queryContext);
  const horizonDelta = Number(!withinA) - Number(!withinB);
  if (horizonDelta) return horizonDelta;
  if (!withinA && !withinB) return compareUsageFirstRuntimeResults(a, b);

  const rareA = lexicalTags(a).includes('rare');
  const rareB = lexicalTags(b).includes('rare');
  const rareDelta = Number(rareA) - Number(rareB);
  if (rareDelta) return rareDelta;

  const scoreBandDelta = primaryScoreBand(numericScore(b)) - primaryScoreBand(numericScore(a));
  if (scoreBandDelta) return scoreBandDelta;

  return usageA - usageB
    || numericScore(b) - numericScore(a)
    || lexicalCompare(a, b);
}

export function rankRuntimeRecommendedResults(rows, queryContext = null) {
  return [...(rows || [])].sort((a, b) => compareRuntimeRecommendedResults(a, b, queryContext));
}
