export const WRITER_RANKING_POLICY = 'deterministic_writer_utility_v1';

const MAX_EDIT_LENGTH = 96;
const DEFAULT_DIVERSITY_WEIGHT = 0.18;

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
  const surfaceSimilarity = normalizedEditSimilarity(querySurface, candidateSurface, language);
  const prefixOverlap = prefixLength / minLength;
  const suffixOverlap = suffixLength / minLength;

  // Query overlap measures lexical cheapness, not rhyme quality. Long shared prefixes are
  // particularly important for German compounds (Arbeitsweise -> Arbeitszweige).
  const overlap = Math.max(
    sameLemma ? 1 : 0,
    surfaceSimilarity >= 0.72 ? surfaceSimilarity * 0.90 : surfaceSimilarity * 0.55,
    prefixLength >= 5 ? prefixOverlap * 0.96 : 0,
    suffixLength >= 6 ? suffixOverlap * 0.72 : 0,
  );

  return {
    sameLemma,
    surfaceSimilarity: Number(surfaceSimilarity.toFixed(4)),
    sharedPrefixLength: prefixLength,
    sharedSuffixLength: suffixLength,
    prefixOverlap: Number(prefixOverlap.toFixed(4)),
    suffixOverlap: Number(suffixOverlap.toFixed(4)),
    overlap: Number(clamp01(overlap).toFixed(4)),
    novelty: Number((1 - clamp01(overlap)).toFixed(4)),
  };
}

export function lexicalRedundancy(left, right) {
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
  const suffixLength = commonSuffixLength(a, b);
  const minLength = Math.max(1, Math.min(a.length, b.length));

  // Five shared final characters are enough to catch productive lexical constructions
  // such as *-weise without treating the ordinary four-letter rhyme ending -eise as
  // duplicate lexical material. This is deliberately a surface baseline until explicit
  // morphology is stored in the database.
  const terminalConstruction = suffixLength >= 5
    ? clamp01(0.58 + 0.07 * (suffixLength - 5))
    : 0;
  const initialConstruction = prefixLength >= 6 && prefixLength / minLength >= 0.45
    ? clamp01(0.50 + 0.45 * (prefixLength / minLength))
    : 0;
  const nearDuplicate = surfaceSimilarity >= 0.78 ? surfaceSimilarity : 0;

  return Number(Math.max(terminalConstruction, initialConstruction, nearDuplicate).toFixed(4));
}

function tierUtility(row) {
  const tier = Number(row?.rhymeTier);
  if (!Number.isFinite(tier)) return 0;
  return clamp01(1 - Math.max(0, tier) * 0.12);
}

function syllableUtility(row) {
  const distance = Math.max(0, Number(row?.syllableDistance) || 0);
  return 1 / (1 + distance);
}

function commonnessUtility(row, query) {
  const candidateRank = Number(row?.usageRank);
  const queryRank = Number(query?.usageRank);
  if (!Number.isFinite(candidateRank) || candidateRank <= 0) return 0.35;
  if (!Number.isFinite(queryRank) || queryRank <= 0) {
    return clamp01(1 - Math.log10(Math.max(1, candidateRank)) / 7);
  }
  const delta = Math.log10(candidateRank / queryRank);
  if (delta <= 0) return 1;
  if (delta <= 1) return 1 - 0.15 * delta;
  return clamp01(0.85 - 0.30 * (delta - 1));
}

function rarePenalty(row) {
  const tags = Array.isArray(row?.lexicalTags)
    ? row.lexicalTags.map((value) => String(value).trim().toLocaleLowerCase('en-US'))
    : [];
  return tags.some((tag) => ['rare', 'archaic', 'obsolete', 'dated'].includes(tag)) ? 0.08 : 0;
}

export function writerUtilityFeatures(row, query) {
  const lexical = lexicalOverlapEvidence(query, row);
  const phonetic = clamp01(row?.score);
  const tier = tierUtility(row);
  const syllable = syllableUtility(row);
  const commonness = commonnessUtility(row, query);

  // Intentionally explicit and deterministic. Phonetic evidence remains the dominant
  // signal; lexical overlap only changes writer usefulness, never the rhyme relation.
  const soundUtility = 0.58 * phonetic + 0.24 * tier + 0.10 * syllable + 0.08 * commonness;
  const lexicalPenalty = 0.30 * lexical.overlap;
  const utility = clamp01(soundUtility - lexicalPenalty - rarePenalty(row));

  return {
    policy: WRITER_RANKING_POLICY,
    utility: Number(utility.toFixed(4)),
    soundUtility: Number(soundUtility.toFixed(4)),
    lexicalPenalty: Number(lexicalPenalty.toFixed(4)),
    lexicalNovelty: lexical.novelty,
    queryOverlap: lexical.overlap,
    commonness: Number(commonness.toFixed(4)),
    evidence: lexical,
  };
}

function lexicalCompare(a, b) {
  const locale = a?.language === 'en' ? 'en' : 'de';
  return String(a?.word || '').localeCompare(String(b?.word || ''), locale);
}

export function rankWriterRecommendedResults(rows, query, options = {}) {
  const limit = Math.max(1, Number.parseInt(String(options.limit ?? rows?.length ?? 1), 10) || 1);
  const diversityWeight = clamp01(options.diversityWeight ?? DEFAULT_DIVERSITY_WEIGHT);
  const remaining = (rows || []).map((row, baseIndex) => {
    const writer = writerUtilityFeatures(row, query);
    return { row, baseIndex, writer };
  });
  const selected = [];

  while (remaining.length && selected.length < limit) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestRedundancy = 0;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      let redundancy = 0;
      for (const previous of selected) {
        redundancy = Math.max(redundancy, lexicalRedundancy(candidate.row, previous.row));
      }
      const diversifiedScore = candidate.writer.utility - diversityWeight * redundancy;
      const incumbent = bestIndex >= 0 ? remaining[bestIndex] : null;
      const better = diversifiedScore > bestScore + 1e-9
        || (Math.abs(diversifiedScore - bestScore) <= 1e-9
          && (candidate.writer.utility > (incumbent?.writer.utility ?? -1) + 1e-9
            || (Math.abs(candidate.writer.utility - (incumbent?.writer.utility ?? -1)) <= 1e-9
              && (candidate.baseIndex < (incumbent?.baseIndex ?? Number.MAX_SAFE_INTEGER)
                || (candidate.baseIndex === incumbent?.baseIndex
                  && lexicalCompare(candidate.row, incumbent?.row) < 0)))));
      if (better) {
        bestIndex = index;
        bestScore = diversifiedScore;
        bestRedundancy = redundancy;
      }
    }

    const [winner] = remaining.splice(bestIndex, 1);
    selected.push({
      ...winner,
      diversifiedScore: Number(bestScore.toFixed(4)),
      redundancyPenalty: Number((diversityWeight * bestRedundancy).toFixed(4)),
      maxRedundancy: Number(bestRedundancy.toFixed(4)),
    });
  }

  // Keep remaining rows deterministic so callers may request a larger page without
  // changing the relative order of already selected rows.
  const tail = remaining.sort((a, b) => b.writer.utility - a.writer.utility
    || a.baseIndex - b.baseIndex
    || lexicalCompare(a.row, b.row));

  return [...selected, ...tail].map((item, index) => ({
    ...item.row,
    writerRank: index + 1,
    writer: {
      ...item.writer,
      diversifiedScore: item.diversifiedScore ?? item.writer.utility,
      redundancyPenalty: item.redundancyPenalty ?? 0,
      maxRedundancy: item.maxRedundancy ?? 0,
    },
  }));
}
