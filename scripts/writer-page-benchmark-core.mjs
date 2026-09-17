import { createHash } from 'node:crypto';
import { lexicalRedundancy } from '../src/writer-ranking-policy.mjs';

export const WRITER_PAGE_BENCHMARK_SCHEMA = 'rhymelab-writer-page-benchmark-v2';
export const WRITER_PAGE_QUEUE_SCHEMA = 'rhymelab-writer-page-review-queue-v2';
export const WRITER_PAGE_REVIEW_SCHEMA = 'rhymelab-writer-page-reviews-v2';

const RARE_TAGS = new Set(['rare', 'archaic', 'obsolete', 'dated']);

export function normalizeLabelKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE');
}

export function reviewTaskId(query, candidate) {
  const payload = `${normalizeLabelKey(query)}\u0000${normalizeLabelKey(candidate)}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

export function queueFingerprint(tasks) {
  const canonical = [...(tasks || [])]
    .map((task) => ({
      id: task.id,
      query: task.query,
      candidate: task.candidate,
      queryIpa: task.queryIpa ?? null,
      candidateIpa: task.candidateIpa ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function normalizedLemma(value) {
  return normalizeLabelKey(value);
}

function explicitRareOrHistorical(row) {
  return (row?.lexicalTags || []).some((tag) => RARE_TAGS.has(String(tag).trim().toLowerCase()));
}

export function pageMetrics(response, cutoff = 20) {
  const rows = (response?.results || []).slice(0, cutoff);
  const queryLemma = normalizedLemma(response?.query?.lemma);
  const familyCounts = new Map();
  let sameLemmaRows = 0;
  let nearDuplicateRows = 0;
  let exactDuplicateRows = 0;
  let unrankedRows = 0;
  let usageRankOver100kRows = 0;
  let usageRankOver250kRows = 0;
  let explicitRareOrHistoricalRows = 0;
  let preferredPronunciationRows = 0;
  const seenNormalized = new Set();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const normalized = normalizeLabelKey(row?.normalized || row?.word);
    if (seenNormalized.has(normalized)) exactDuplicateRows += 1;
    seenNormalized.add(normalized);

    const lemma = normalizedLemma(row?.lemma);
    if (queryLemma && lemma && queryLemma === lemma) sameLemmaRows += 1;

    const family = String(row?.writerMorphology?.familyKey || '').trim();
    if (family) familyCounts.set(family, (familyCounts.get(family) || 0) + 1);

    if (row?.usageRank == null) unrankedRows += 1;
    if (Number(row?.usageRank) > 100000) usageRankOver100kRows += 1;
    if (Number(row?.usageRank) > 250000) usageRankOver250kRows += 1;
    if (explicitRareOrHistorical(row)) explicitRareOrHistoricalRows += 1;
    if (row?.pronunciationPreferred !== false) preferredPronunciationRows += 1;

    if (index > 0) {
      let maxRedundancy = 0;
      for (let previous = 0; previous < index; previous += 1) {
        maxRedundancy = Math.max(maxRedundancy, lexicalRedundancy(row, rows[previous]));
      }
      if (maxRedundancy >= 0.88) nearDuplicateRows += 1;
    }
  }

  const repeatedFamilyRows = [...familyCounts.values()]
    .reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const resolvedFamilyRows = [...familyCounts.values()].reduce((sum, count) => sum + count, 0);
  const divisor = Math.max(1, rows.length);

  return {
    cutoff,
    rows: rows.length,
    exactDuplicateRows,
    nearDuplicateRows,
    sameLemmaRows,
    repeatedFamilyRows,
    resolvedFamilyRows,
    uniqueFamilies: familyCounts.size,
    morphologyDiversity: resolvedFamilyRows
      ? Number((familyCounts.size / resolvedFamilyRows).toFixed(4))
      : null,
    unrankedRows,
    usageRankOver100kRows,
    usageRankOver250kRows,
    explicitRareOrHistoricalRows,
    preferredPronunciationRows,
    rates: {
      exactDuplicate: Number((exactDuplicateRows / divisor).toFixed(4)),
      nearDuplicate: Number((nearDuplicateRows / divisor).toFixed(4)),
      sameLemma: Number((sameLemmaRows / divisor).toFixed(4)),
      repeatedFamily: Number((repeatedFamilyRows / divisor).toFixed(4)),
      unranked: Number((unrankedRows / divisor).toFixed(4)),
      usageRankOver100k: Number((usageRankOver100kRows / divisor).toFixed(4)),
      usageRankOver250k: Number((usageRankOver250kRows / divisor).toFixed(4)),
      explicitRareOrHistorical: Number((explicitRareOrHistoricalRows / divisor).toFixed(4)),
      preferredPronunciation: Number((preferredPronunciationRows / divisor).toFixed(4)),
    },
  };
}

export function legacyTier0Retention(writerResponse, legacyResponse) {
  const writerSet = new Set((writerResponse?.results || []).map((row) => normalizeLabelKey(row?.normalized || row?.word)));
  const legacyTier0 = (legacyResponse?.results || []).filter((row) => Number(row?.rhymeTier) === 0);
  const retained = legacyTier0.filter((row) => writerSet.has(normalizeLabelKey(row?.normalized || row?.word)));
  return {
    legacyTier0Rows: legacyTier0.length,
    retainedRows: retained.length,
    missingRows: legacyTier0.length - retained.length,
    retention: legacyTier0.length ? Number((retained.length / legacyTier0.length).toFixed(4)) : 1,
    missingWords: legacyTier0
      .filter((row) => !writerSet.has(normalizeLabelKey(row?.normalized || row?.word)))
      .map((row) => row.word),
  };
}

function rowByCandidate(response, candidate) {
  const wanted = normalizeLabelKey(candidate);
  return (response?.results || []).find((row) => normalizeLabelKey(row?.word) === wanted) || null;
}

function rowByFamily(response, family) {
  const wanted = String(family || '').trim();
  if (!wanted) return null;
  return (response?.results || []).find((row) => String(row?.writerMorphology?.familyKey || '').trim() === wanted) || null;
}

export function evaluatePageRegression(response, rule) {
  const candidate = String(rule?.candidate || '').trim();
  const requiredFamily = String(rule?.required_family || '').trim();
  const row = candidate
    ? rowByCandidate(response, candidate)
    : rowByFamily(response, requiredFamily);
  const failures = [];
  if (!row) {
    failures.push(candidate ? 'candidate_missing' : 'family_missing');
  } else {
    if (Number.isInteger(rule?.max_rank) && Number(row.writerRank) > rule.max_rank) failures.push('rank_too_low');
    if (Array.isArray(rule?.allowed_primary_types) && !rule.allowed_primary_types.includes(row.primaryType)) {
      failures.push('primary_type_mismatch');
    }
    if (Number.isFinite(Number(rule?.max_cheap_tier_penalty))
      && Number(row?.writer?.cheapRhymeTierPenalty || 0) > Number(rule.max_cheap_tier_penalty)) {
      failures.push('cheap_tier_penalty_too_high');
    }
  }
  return {
    id: rule?.id || null,
    query: rule?.query || null,
    candidate: candidate || null,
    requiredFamily: requiredFamily || null,
    passed: failures.length === 0,
    failures,
    observed: row ? {
      word: row.word,
      rank: row.writerRank,
      primaryType: row.primaryType,
      score: row.score,
      cheapTierPenalty: row?.writer?.cheapRhymeTierPenalty ?? 0,
      family: row?.writerMorphology?.familyKey || null,
    } : null,
  };
}

export function evaluateMorphologyRegression(wordEvidence, rule) {
  const evidence = wordEvidence?.evidence || null;
  const failures = [];
  if (!wordEvidence?.wordFound) {
    failures.push('word_missing');
  } else {
    const actualFamily = evidence?.familyKey || null;
    const expectedFamily = rule?.expected_family ?? null;
    if (actualFamily !== expectedFamily) failures.push('family_mismatch');
    if (Object.prototype.hasOwnProperty.call(rule || {}, 'expected_construction_rule')) {
      const actualRule = evidence?.constructionRule || null;
      if (actualRule !== (rule.expected_construction_rule ?? null)) failures.push('construction_rule_mismatch');
    }
  }
  return {
    id: rule?.id || null,
    word: rule?.word || null,
    passed: failures.length === 0,
    failures,
    observed: wordEvidence?.wordFound ? {
      family: evidence?.familyKey || null,
      constructionRule: evidence?.constructionRule || null,
      status: evidence?.status || null,
      split: evidence?.split || null,
      wholeLemma: evidence?.wholeLemma || null,
      wholePartOfSpeech: evidence?.wholePartOfSpeech || null,
    } : null,
  };
}

function gain(label) {
  return (2 ** Number(label || 0)) - 1;
}

function dcg(labels) {
  return labels.reduce((sum, label, index) => sum + gain(label) / Math.log2(index + 2), 0);
}

export function ndcgForResponse(response, reviews, cutoff) {
  const queryKey = normalizeLabelKey(response?.query?.surface || response?.query?.normalized);
  const rows = (response?.results || []).slice(0, cutoff);
  const byCandidate = new Map();
  for (const review of reviews || []) {
    if (normalizeLabelKey(review?.query) !== queryKey) continue;
    const usefulness = Number(review?.songwriting_usefulness);
    if (!Number.isInteger(usefulness) || usefulness < 0 || usefulness > 4) continue;
    byCandidate.set(normalizeLabelKey(review?.candidate), usefulness);
  }

  const labels = rows.map((row) => byCandidate.get(normalizeLabelKey(row?.word)));
  const judgedRows = labels.filter((value) => Number.isInteger(value)).length;
  const complete = rows.length === cutoff && judgedRows === rows.length;
  if (!complete) {
    return {
      cutoff,
      status: 'pending_reference',
      judgedRows,
      requiredRows: rows.length,
      coverage: rows.length ? Number((judgedRows / rows.length).toFixed(4)) : 0,
      ndcg: null,
    };
  }

  const actual = dcg(labels);
  const idealLabels = [...byCandidate.values()].sort((a, b) => b - a).slice(0, cutoff);
  while (idealLabels.length < cutoff) idealLabels.push(0);
  const ideal = dcg(idealLabels);
  return {
    cutoff,
    status: 'ok',
    judgedRows,
    requiredRows: rows.length,
    coverage: 1,
    ndcg: Number((ideal > 0 ? actual / ideal : 1).toFixed(4)),
  };
}

export function evaluateProvisionalGates(aggregateTop20, regressions, plan) {
  const gates = plan?.provisional_gates || {};
  const failures = [];
  const compareMax = (field, key) => {
    const max = Number(gates[key]);
    if (Number.isFinite(max) && Number(aggregateTop20?.[field] || 0) > max) {
      failures.push(`${field}>${max}`);
    }
  };
  compareMax('unrankedRows', 'top20_aggregate_unranked_rows_max');
  compareMax('usageRankOver250kRows', 'top20_aggregate_usage_rank_over_250k_rows_max');
  compareMax('explicitRareOrHistoricalRows', 'top20_aggregate_explicit_rare_or_historical_rows_max');
  compareMax('repeatedFamilyRows', 'top20_aggregate_repeated_family_rows_max');
  if (gates.required_regressions_must_pass === true && regressions.some((entry) => !entry.passed)) {
    failures.push('required_regression_failed');
  }
  return { passed: failures.length === 0, failures };
}
