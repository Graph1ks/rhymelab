export const WRITER_RANKING_POLICY = 'deterministic_writer_utility_v7';

const MAX_EDIT_LENGTH = 96;
const DEFAULT_DIVERSITY_WEIGHT = 0.18;
const VERY_LOW_USAGE_RANK = 250000;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeSurface(value, language = 'de') {
  const locale = language === 'en' ? 'en' : 'de-DE';
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase(locale)
    .slice(0, MAX_EDIT_LENGTH);
}

function commonPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

function commonSuffixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let count = 0;
  while (count < limit && a[a.length - 1 - count] === b[b.length - 1 - count]) count += 1;
  return count;
}

function morphologyFamily(row) {
  const key = String(row?.writerMorphology?.familyKey || '').trim();
  return key || null;
}

function normalizedLexicalTags(row) {
  return Array.isArray(row?.lexicalTags)
    ? row.lexicalTags.map((value) => String(value).trim().toLocaleLowerCase('en-US')).filter(Boolean)
    : [];
}

function lexicalSafetyEvidence(row) {
  const tags = normalizedLexicalTags(row);
  const explicitRareOrHistorical = tags.some((tag) => ['rare', 'archaic', 'obsolete', 'dated'].includes(tag));
  const usageRank = Number(row?.usageRank);
  const hasMeasuredUsage = Number.isFinite(usageRank) && usageRank > 0;
  const unranked = !hasMeasuredUsage;
  const veryLowMeasuredUsage = hasMeasuredUsage && usageRank > VERY_LOW_USAGE_RANK;
  const tierPenalty = explicitRareOrHistorical ? 2 : (unranked || veryLowMeasuredUsage ? 1 : 0);
  const state = explicitRareOrHistorical
    ? 'explicit_rare_or_historical'
    : unranked
      ? 'unranked_unknown'
      : veryLowMeasuredUsage
        ? 'very_low_measured_usage'
        : 'measured';

  return {
    state,
    tierPenalty,
    unranked,
    veryLowMeasuredUsage,
    explicitRareOrHistorical,
    threshold: VERY_LOW_USAGE_RANK,
  };
}

export function normalizedEditSimilarity(left, right, language = 'de') {
  const a = normalizeSurface(left, language);
  const b = normalizeSurface(right, language);
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + Number(a[i - 1] !== b[j - 1]);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return clamp01(1 - previous[b.length] / Math.max(a.length, b.length));
}

export function lexicalOverlapEvidence(query, candidate) {
  const language = candidate?.language || query?.language || 'de';
  const querySurface = normalizeSurface(query?.normalized || query?.surface || query?.word, language);
  const candidateSurface = normalizeSurface(candidate?.normalized || candidate?.surface || candidate?.word, language);
  const minLength = Math.max(1, Math.min(querySurface.length, candidateSurface.length));
  const prefixLength = commonPrefixLength(querySurface, candidateSurface);
  const suffixLength = commonSuffixLength(querySurface, candidateSurface);
  const queryLemma = normalizeSurface(query?.lemma, language);
  const candidateLemma = normalizeSurface(candidate?.lemma, language);
  const sameLemma = Boolean(queryLemma && candidateLemma && queryLemma === candidateLemma);
  const queryMorphologyFamily = morphologyFamily(query);
  const candidateMorphologyFamily = morphologyFamily(candidate);
  const sameMorphologyFamily = Boolean(
    queryMorphologyFamily
    && candidateMorphologyFamily
    && queryMorphologyFamily === candidateMorphologyFamily
  );
  const surfaceSimilarity = normalizedEditSimilarity(querySurface, candidateSurface, language);
  const prefixOverlap = prefixLength / minLength;
  const suffixOverlap = suffixLength / minLength;

  // Orthographic rhyme similarity is not lexical cheapness. Short perfect rhymes such as
  // Liebe/Diebe, Leben/neben or Nacht/macht naturally have high edit similarity because
  // most letters belong to the rhyme tail. v6+ therefore requires independent structural
  // evidence before edit distance may affect the writer tier.
  const initialConstructionOverlap = prefixLength >= 6 && prefixOverlap >= 0.45
    ? clamp01(0.50 + 0.45 * prefixOverlap)
    : 0;
  const longNearDuplicateOverlap = minLength >= 8 && surfaceSimilarity >= 0.88
    ? surfaceSimilarity * 0.90
    : 0;
  const longSuffixOverlap = suffixLength >= 7 ? suffixOverlap * 0.45 : 0;

  const overlap = Math.max(
    sameLemma ? 1 : 0,
    sameMorphologyFamily ? 0.92 : 0,
    initialConstructionOverlap,
    longNearDuplicateOverlap,
    longSuffixOverlap,
  );

  return {
    sameLemma,
    sameMorphologyFamily,
    queryMorphologyFamily,
    candidateMorphologyFamily,
    surfaceSimilarity: Number(surfaceSimilarity.toFixed(4)),
    sharedPrefixLength: prefixLength,
    sharedSuffixLength: suffixLength,
    prefixOverlap: Number(prefixOverlap.toFixed(4)),
    suffixOverlap: Number(suffixOverlap.toFixed(4)),
    initialConstructionOverlap: Number(initialConstructionOverlap.toFixed(4)),
    longNearDuplicateOverlap: Number(longNearDuplicateOverlap.toFixed(4)),
    overlap: Number(clamp01(overlap).toFixed(4)),
    novelty: Number((1 - clamp01(overlap)).toFixed(4)),
  };
}

function structuralRedundancy(left, right) {
  const language = left?.language || right?.language || 'de';
  const a = normalizeSurface(left?.normalized || left?.surface || left?.word, language);
  const b = normalizeSurface(right?.normalized || right?.surface || right?.word, language);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const lemmaA = normalizeSurface(left?.lemma, language);
  const lemmaB = normalizeSurface(right?.lemma, language);
  if (lemmaA && lemmaB && lemmaA === lemmaB) return 1;

  const surfaceSimilarity = normalizedEditSimilarity(a, b, language);
  const prefixLength = commonPrefixLength(a, b);
  const minLength = Math.max(1, Math.min(a.length, b.length));

  const initialConstruction = prefixLength >= 6 && prefixLength / minLength >= 0.45
    ? clamp01(0.50 + 0.45 * (prefixLength / minLength))
    : 0;
  const nearDuplicate = surfaceSimilarity >= 0.84 ? surfaceSimilarity : 0;

  return Number(Math.max(initialConstruction, nearDuplicate).toFixed(4));
}

export function lexicalRedundancy(left, right) {
  const structural = structuralRedundancy(left, right);
  const familyA = morphologyFamily(left);
  const familyB = morphologyFamily(right);
  const sameFamily = Boolean(familyA && familyB && familyA === familyB);
  return Number(Math.max(structural, sameFamily ? 0.92 : 0).toFixed(4));
}

function syllableUtility(row) {
  const distance = Math.max(0, Number(row?.syllableDistance) || 0);
  return 1 / (1 + distance);
}

function commonnessUtility(row, query) {
  const candidateRank = Number(row?.usageRank);
  const queryRank = Number(query?.usageRank);
  if (!Number.isFinite(candidateRank) || candidateRank <= 0) return 0.25;
  if (!Number.isFinite(queryRank) || queryRank <= 0) {
    return clamp01(1 - Math.log10(Math.max(1, candidateRank)) / 7);
  }
  const delta = Math.log10(candidateRank / queryRank);
  if (delta <= 0) return 1;
  if (delta <= 1) return 1 - 0.15 * delta;
  return clamp01(0.85 - 0.30 * (delta - 1));
}

function rarePenalty(row) {
  return lexicalSafetyEvidence(row).explicitRareOrHistorical ? 0.08 : 0;
}

function lexicalTierPenalty(lexical) {
  if (lexical.sameLemma) return 3;
  if (lexical.sameMorphologyFamily) return 2;
  if (lexical.overlap >= 0.85) return 2;
  if (lexical.overlap >= 0.65) return 1;
  return 0;
}

function structuralRedundancyTierPenalty(maxStructuralRedundancy) {
  if (maxStructuralRedundancy >= 0.88) return 2;
  if (maxStructuralRedundancy >= 0.58) return 1;
  return 0;
}

function familyDiversityTierPenalty(familyRepeatCount) {
  if (familyRepeatCount >= 2) return 2;
  if (familyRepeatCount >= 1) return 1;
  return 0;
}

export function writerUtilityFeatures(row, query) {
  const lexical = lexicalOverlapEvidence(query, row);
  const safety = lexicalSafetyEvidence(row);
  const phonetic = clamp01(row?.score);
  const syllable = syllableUtility(row);
  const commonness = commonnessUtility(row, query);
  const baseTier = Math.max(0, Number.isFinite(Number(row?.rhymeTier)) ? Number(row.rhymeTier) : 6);
  const cheapRhymeTierPenalty = lexicalTierPenalty(lexical);
  const lexicalSafetyTierPenalty = safety.tierPenalty;
  const writerTier = baseTier + cheapRhymeTierPenalty + lexicalSafetyTierPenalty;

  const soundUtility = 0.72 * phonetic + 0.16 * syllable + 0.12 * commonness;
  const lexicalPenalty = 0.16 * lexical.overlap;
  const utility = clamp01(soundUtility - lexicalPenalty - rarePenalty(row));

  return {
    policy: WRITER_RANKING_POLICY,
    utility: Number(utility.toFixed(4)),
    soundUtility: Number(soundUtility.toFixed(4)),
    lexicalPenalty: Number(lexicalPenalty.toFixed(4)),
    lexicalNovelty: lexical.novelty,
    queryOverlap: lexical.overlap,
    commonness: Number(commonness.toFixed(4)),
    baseTier,
    cheapRhymeTierPenalty,
    lexicalSafetyTierPenalty,
    lexicalSafety: safety,
    writerTier,
    evidence: lexical,
  };
}

function lexicalCompare(a, b) {
  const locale = a?.language === 'en' ? 'en' : 'de';
  return String(a?.word || '').localeCompare(String(b?.word || ''), locale);
}

export function rankWriterRecommendedResults(rows, query, options = {}) {
  const requestedLimit = Number.parseInt(String(options.limit ?? rows?.length ?? 1), 10);
  const limit = Math.min(rows?.length ?? 0, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 1));
  const diversityWeight = clamp01(options.diversityWeight ?? DEFAULT_DIVERSITY_WEIGHT);
  const remaining = (rows || []).map((row, baseIndex) => ({
    row,
    baseIndex,
    writer: writerUtilityFeatures(row, query),
    maxRedundancy: 0,
    maxStructuralRedundancy: 0,
  }));
  const selected = [];
  const selectedFamilyCounts = new Map();

  while (remaining.length && selected.length < limit) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestEffectiveTier = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const family = morphologyFamily(candidate.row);
      const familyRepeatCount = family ? (selectedFamilyCounts.get(family) || 0) : 0;
      const familyTierPenalty = familyDiversityTierPenalty(familyRepeatCount);
      const structuralTierPenalty = structuralRedundancyTierPenalty(candidate.maxStructuralRedundancy);
      const diversityTierPenalty = familyTierPenalty + structuralTierPenalty;
      const effectiveTier = candidate.writer.writerTier + diversityTierPenalty;
      const diversifiedScore = candidate.writer.utility - diversityWeight * candidate.maxStructuralRedundancy;
      const incumbent = bestIndex >= 0 ? remaining[bestIndex] : null;
      const better = effectiveTier < bestEffectiveTier
        || (effectiveTier === bestEffectiveTier && (
          candidate.writer.lexicalSafetyTierPenalty < (incumbent?.writer.lexicalSafetyTierPenalty ?? Number.POSITIVE_INFINITY)
          || (candidate.writer.lexicalSafetyTierPenalty === (incumbent?.writer.lexicalSafetyTierPenalty ?? Number.POSITIVE_INFINITY) && (
            diversifiedScore > bestScore + 1e-9
            || (Math.abs(diversifiedScore - bestScore) <= 1e-9
              && (candidate.writer.utility > (incumbent?.writer.utility ?? -1) + 1e-9
                || (Math.abs(candidate.writer.utility - (incumbent?.writer.utility ?? -1)) <= 1e-9
                  && (candidate.baseIndex < (incumbent?.baseIndex ?? Number.MAX_SAFE_INTEGER)
                    || (candidate.baseIndex === incumbent?.baseIndex
                      && lexicalCompare(candidate.row, incumbent?.row) < 0)))))
          ))
        ));
      if (better) {
        bestIndex = index;
        bestScore = diversifiedScore;
        bestEffectiveTier = effectiveTier;
      }
    }

    const [winner] = remaining.splice(bestIndex, 1);
    const winnerFamily = morphologyFamily(winner.row);
    const familyRepeatCount = winnerFamily ? (selectedFamilyCounts.get(winnerFamily) || 0) : 0;
    const familyTierPenalty = familyDiversityTierPenalty(familyRepeatCount);
    const structuralTierPenalty = structuralRedundancyTierPenalty(winner.maxStructuralRedundancy);
    const diversityTierPenalty = familyTierPenalty + structuralTierPenalty;
    selected.push({
      ...winner,
      effectiveTier: winner.writer.writerTier + diversityTierPenalty,
      diversityTierPenalty,
      familyRepeatCount,
      familyDiversityTierPenalty: familyTierPenalty,
      structuralDiversityTierPenalty: structuralTierPenalty,
      diversifiedScore: Number(bestScore.toFixed(4)),
      redundancyPenalty: Number((diversityWeight * winner.maxStructuralRedundancy).toFixed(4)),
    });
    if (winnerFamily) selectedFamilyCounts.set(winnerFamily, familyRepeatCount + 1);

    for (const candidate of remaining) {
      candidate.maxRedundancy = Math.max(
        candidate.maxRedundancy,
        lexicalRedundancy(candidate.row, winner.row),
      );
      candidate.maxStructuralRedundancy = Math.max(
        candidate.maxStructuralRedundancy,
        structuralRedundancy(candidate.row, winner.row),
      );
    }
  }

  const tail = remaining.sort((a, b) => a.writer.writerTier - b.writer.writerTier
    || a.writer.lexicalSafetyTierPenalty - b.writer.lexicalSafetyTierPenalty
    || b.writer.utility - a.writer.utility
    || a.baseIndex - b.baseIndex
    || lexicalCompare(a.row, b.row));

  return [...selected, ...tail].map((item, index) => ({
    ...item.row,
    writerRank: index + 1,
    writer: {
      ...item.writer,
      effectiveTier: item.effectiveTier ?? item.writer.writerTier,
      diversityTierPenalty: item.diversityTierPenalty ?? 0,
      familyRepeatCount: item.familyRepeatCount ?? 0,
      familyDiversityTierPenalty: item.familyDiversityTierPenalty ?? 0,
      structuralDiversityTierPenalty: item.structuralDiversityTierPenalty ?? 0,
      diversifiedScore: item.diversifiedScore ?? item.writer.utility,
      redundancyPenalty: item.redundancyPenalty ?? 0,
      maxRedundancy: Number((item.maxRedundancy ?? 0).toFixed(4)),
      maxStructuralRedundancy: Number((item.maxStructuralRedundancy ?? 0).toFixed(4)),
    },
  }));
}
