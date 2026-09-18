export const ENTITY_CUT_HYBRID_CANDIDATE_POLICY =
  'category-relative-popularity-hybrid-v1-candidate';

export const ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY =
  'category-relative-popularity-hybrid-v2-geometric-missing-evidence-candidate';

export const ENTITY_CUT_HYBRID_WEIGHTS = Object.freeze({
  qrank_percentile: 55,
  wikipedia_sitelink_percentile: 25,
  de_en_wikipedia_presence: 10,
  external_id_capped: 7,
  statement_count_percentile: 3,
});

const SCORE_SCALE = 1_000_000;
const EXTERNAL_ID_CAP = 4;

function compareQid(a, b) {
  return a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0;
}

function compareNumberDesc(a, b) {
  return Number(b || 0) - Number(a || 0);
}

function percentilePpmByValue(rows, selector, { excludeMissing = false } = {}) {
  const ranked = rows
    .map((row) => ({ row, value: selector(row) }))
    .filter(({ value }) => !excludeMissing || value != null)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0) || compareQid(a.row, b.row));

  const scores = new Map();
  const size = ranked.length;
  if (!size) return scores;
  if (size === 1) {
    scores.set(ranked[0].row.qid, SCORE_SCALE);
    return scores;
  }

  for (let start = 0; start < size;) {
    let end = start;
    while (end + 1 < size && Number(ranked[end + 1].value || 0) === Number(ranked[start].value || 0)) {
      end += 1;
    }
    const ppm = Math.round((size - 1 - end) * SCORE_SCALE / (size - 1));
    for (let index = start; index <= end; index += 1) {
      scores.set(ranked[index].row.qid, ppm);
    }
    start = end + 1;
  }

  return scores;
}

function wikipediaPresencePpm(row) {
  return Math.round((Number(row.has_dewiki || 0) + Number(row.has_enwiki || 0)) * SCORE_SCALE / 2);
}

function externalIdPpm(row) {
  return Math.round(Math.min(Number(row.external_id_count || 0), EXTERNAL_ID_CAP) * SCORE_SCALE / EXTERNAL_ID_CAP);
}

function integerSqrt(value) {
  let n = BigInt(value);
  if (n < 0n) throw new RangeError('integerSqrt requires a non-negative value');
  if (n < 2n) return Number(n);
  let x0 = 1n << (BigInt(n.toString(2).length) >> 1n);
  let x1 = (x0 + n / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) >> 1n;
  }
  return Number(x0);
}

function scoreComponents(rows) {
  const qrankScores = percentilePpmByValue(rows, (row) => row.qrank, { excludeMissing: true });
  const sitelinkScores = percentilePpmByValue(rows, (row) => row.wikipedia_sitelink_count);
  const statementScores = percentilePpmByValue(rows, (row) => row.statement_count);

  return rows.map((row) => {
    const components = {
      qrank_percentile: qrankScores.get(row.qid) || 0,
      wikipedia_sitelink_percentile: sitelinkScores.get(row.qid) || 0,
      de_en_wikipedia_presence: wikipediaPresencePpm(row),
      external_id_capped: externalIdPpm(row),
      statement_count_percentile: statementScores.get(row.qid) || 0,
    };
    const weighted = Object.entries(ENTITY_CUT_HYBRID_WEIGHTS)
      .reduce((sum, [key, weight]) => sum + components[key] * weight, 0);
    return { row, components, weighted };
  });
}

function sortHybridScoredRows(scored) {
  return scored.sort((a, b) =>
    b.candidate_score_ppm - a.candidate_score_ppm
    || compareNumberDesc(a.qrank, b.qrank)
    || compareNumberDesc(a.wikipedia_sitelink_count, b.wikipedia_sitelink_count)
    || compareNumberDesc(
      Number(a.has_dewiki || 0) + Number(a.has_enwiki || 0),
      Number(b.has_dewiki || 0) + Number(b.has_enwiki || 0),
    )
    || compareNumberDesc(a.external_id_count, b.external_id_count)
    || compareNumberDesc(a.statement_count, b.statement_count)
    || compareQid(a, b)
  );
}

export function rankControlEntityCutRows(rows) {
  return [...rows].sort((a, b) => {
    const aMissing = a.qrank == null ? 1 : 0;
    const bMissing = b.qrank == null ? 1 : 0;
    return aMissing - bMissing
      || compareNumberDesc(a.qrank, b.qrank)
      || compareNumberDesc(a.wikipedia_sitelink_count, b.wikipedia_sitelink_count)
      || compareNumberDesc(
        Number(a.has_dewiki || 0) + Number(a.has_enwiki || 0),
        Number(b.has_dewiki || 0) + Number(b.has_enwiki || 0),
      )
      || compareNumberDesc(a.external_id_count, b.external_id_count)
      || compareNumberDesc(a.statement_count, b.statement_count)
      || compareQid(a, b);
  });
}

export function rankHybridEntityCutRows(rows) {
  const scored = scoreComponents(rows).map(({ row, components, weighted }) => ({
    ...row,
    candidate_score_ppm: Math.round(weighted / 100),
    candidate_components_ppm: components,
  }));
  return sortHybridScoredRows(scored);
}

export function rankHybridV2EntityCutRows(rows) {
  const qrankWeight = ENTITY_CUT_HYBRID_WEIGHTS.qrank_percentile;
  const totalWeight = Object.values(ENTITY_CUT_HYBRID_WEIGHTS)
    .reduce((sum, weight) => sum + weight, 0);
  const missingAvailableWeight = totalWeight - qrankWeight;

  const scored = scoreComponents(rows).map(({ row, components, weighted }) => {
    const rawScorePpm = Math.round(weighted / totalWeight);
    if (row.qrank != null) {
      return {
        ...row,
        candidate_score_ppm: rawScorePpm,
        candidate_raw_score_ppm: rawScorePpm,
        candidate_available_evidence_score_ppm: rawScorePpm,
        candidate_available_weight_pct: totalWeight,
        candidate_missing_evidence_adjustment: 'none_qrank_present',
        candidate_components_ppm: components,
      };
    }

    const availableEvidenceScorePpm = Math.round(weighted / missingAvailableWeight);
    const geometricScorePpm = integerSqrt(
      BigInt(rawScorePpm) * BigInt(availableEvidenceScorePpm),
    );
    return {
      ...row,
      candidate_score_ppm: geometricScorePpm,
      candidate_raw_score_ppm: rawScorePpm,
      candidate_available_evidence_score_ppm: availableEvidenceScorePpm,
      candidate_available_weight_pct: missingAvailableWeight,
      candidate_missing_evidence_adjustment:
        'geometric_mean_zero_fill_and_available_evidence_normalization',
      candidate_components_ppm: components,
    };
  });

  return sortHybridScoredRows(scored);
}

export function evaluateRankedEntityCutRows(rankedRows, retentionPercentileFloor, protectedQids = new Set()) {
  const size = rankedRows.length;
  return rankedRows.map((row, index) => {
    const percentile = size <= 1 ? 1 : 1 - index / (size - 1);
    const tier = percentile >= 0.80 ? 'A' : percentile >= 0.35 ? 'B' : 'C';
    const keep = percentile >= Number(retentionPercentileFloor) || protectedQids.has(row.qid);
    return {
      ...row,
      rank: index + 1,
      percentile: Math.round(percentile * SCORE_SCALE) / SCORE_SCALE,
      tier,
      keep,
    };
  });
}

export function summarizeEvaluatedEntityCutRows(rows) {
  const qrankCoverage = rows.reduce((sum, row) => sum + (row.qrank == null ? 0 : 1), 0);
  const kept = rows.filter((row) => row.keep);
  const keptWithoutQRank = kept.filter((row) => row.qrank == null).length;
  const qrankMissing = rows.length - qrankCoverage;
  return {
    candidates: rows.length,
    qrank_coverage: qrankCoverage,
    qrank_coverage_pct: rows.length ? Math.round(qrankCoverage * 10000 / rows.length) / 100 : 0,
    qrank_missing: qrankMissing,
    kept: kept.length,
    kept_with_qrank: kept.length - keptWithoutQRank,
    kept_without_qrank: keptWithoutQRank,
    qrank_missing_retention_pct: qrankMissing
      ? Math.round(keptWithoutQRank * 10000 / qrankMissing) / 100
      : 0,
  };
}
