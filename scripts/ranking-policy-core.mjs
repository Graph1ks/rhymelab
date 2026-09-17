export const PRIMARY_RANKING_POLICIES = Object.freeze([
  'usage_first',
  'score_band_0_05',
]);

export const CANDIDATE_PRIMARY_RANKING_POLICY = 'score_band_0_05';
export const PRIMARY_SCORE_BAND_WIDTH = 0.05;

function usageRank(row) {
  const value = Number(row?.usageRank);
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function score(row) {
  const value = Number(row?.score);
  return Number.isFinite(value) ? value : 0;
}

function tier(row) {
  const value = Number(row?.rhymeTier);
  return Number.isFinite(value) ? value : 99;
}

function syllableDistance(row) {
  const value = Number(row?.syllableDistance);
  return Number.isFinite(value) ? value : 99;
}

function lexicalCompare(a, b) {
  const locale = a?.language === 'en' ? 'en' : 'de';
  return String(a?.word || '').localeCompare(String(b?.word || ''), locale);
}

export function primaryScoreBand(value, width = PRIMARY_SCORE_BAND_WIDTH) {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth) || numericWidth <= 0) throw new TypeError('score-band width must be a positive number');
  const numericScore = Number(value);
  return Math.floor(((Number.isFinite(numericScore) ? numericScore : 0) + 1e-9) / numericWidth);
}

export function compareUsageFirstResults(a, b) {
  return tier(a) - tier(b)
    || syllableDistance(a) - syllableDistance(b)
    || Number(usageRank(a) === Number.MAX_SAFE_INTEGER) - Number(usageRank(b) === Number.MAX_SAFE_INTEGER)
    || usageRank(a) - usageRank(b)
    || score(b) - score(a)
    || lexicalCompare(a, b);
}

export function compareScoreBandResults(a, b, width = PRIMARY_SCORE_BAND_WIDTH) {
  return tier(a) - tier(b)
    || syllableDistance(a) - syllableDistance(b)
    || primaryScoreBand(score(b), width) - primaryScoreBand(score(a), width)
    || Number(usageRank(a) === Number.MAX_SAFE_INTEGER) - Number(usageRank(b) === Number.MAX_SAFE_INTEGER)
    || usageRank(a) - usageRank(b)
    || score(b) - score(a)
    || lexicalCompare(a, b);
}

export function rankPrimaryResults(rows, policy = 'usage_first') {
  const copy = [...(rows || [])];
  if (policy === 'usage_first') return copy.sort(compareUsageFirstResults);
  if (policy === 'score_band_0_05') return copy.sort((a, b) => compareScoreBandResults(a, b, PRIMARY_SCORE_BAND_WIDTH));
  throw new Error(`Unknown primary ranking policy: ${policy}`);
}
