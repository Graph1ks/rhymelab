export const WRITER_RANKING_POLICY = 'deterministic_writer_utility_v6';

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

function normalizedEditSimilarityPrepared(a,b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const denominator=Math.max(a.length,b.length);
  let prefix=0;
  const prefixLimit=Math.min(a.length,b.length);
  while(prefix<prefixLimit&&a[prefix]===b[prefix])prefix++;

  let suffix=0;
  const suffixLimit=Math.min(a.length-prefix,b.length-prefix);
  while(
    suffix<suffixLimit
    &&a[a.length-1-suffix]===b[b.length-1-suffix]
  )suffix++;

  const left=a.slice(prefix,a.length-suffix);
  const right=b.slice(prefix,b.length-suffix);
  if(!left.length||!right.length){
    return clamp01(1-Math.abs(left.length-right.length)/denominator);
  }

  // Keep the inner dimension short. This is the exact same Levenshtein metric,
  // only with common edges removed and less allocation/work per comparison.
  const x=left.length>=right.length?left:right;
  const y=left.length>=right.length?right:left;
  const previous=Array.from({length:y.length+1},(_,index)=>index);
  const current=new Array(y.length+1).fill(0);
  for(let i=1;i<=x.length;i++){
    current[0]=i;
    for(let j=1;j<=y.length;j++){
      const substitution=previous[j-1]+Number(x[i-1]!==y[j-1]);
      current[j]=Math.min(previous[j]+1,current[j-1]+1,substitution);
    }
    for(let j=0;j<=y.length;j++)previous[j]=current[j];
  }
  return clamp01(1-previous[y.length]/denominator);
}

function normalizedEditSimilarityAtLeastPrepared(a,b,threshold){
  if(a===b)return 1;
  if(!a.length||!b.length)return 0;

  const denominator=Math.max(a.length,b.length);
  const maxDistance=Math.floor((1-Number(threshold))*denominator+1e-12);
  if(Math.abs(a.length-b.length)>maxDistance)return 0;

  let prefix=0;
  const prefixLimit=Math.min(a.length,b.length);
  while(prefix<prefixLimit&&a[prefix]===b[prefix])prefix++;

  let suffix=0;
  const suffixLimit=Math.min(a.length-prefix,b.length-prefix);
  while(
    suffix<suffixLimit
    &&a[a.length-1-suffix]===b[b.length-1-suffix]
  )suffix++;

  const left=a.slice(prefix,a.length-suffix);
  const right=b.slice(prefix,b.length-suffix);
  if(!left.length||!right.length){
    const distance=Math.abs(left.length-right.length);
    return distance<=maxDistance?clamp01(1-distance/denominator):0;
  }
  if(Math.abs(left.length-right.length)>maxDistance)return 0;

  // If the final edit distance is <= maxDistance, an optimal path never needs
  // to leave this diagonal band. Therefore the exact accepted similarity is
  // retained for near-duplicates, while distant pairs avoid a full matrix.
  const x=left;
  const y=right;
  const infinity=maxDistance+1;
  let previous=new Array(y.length+1).fill(infinity);
  let current=new Array(y.length+1).fill(infinity);
  for(let j=0;j<=Math.min(y.length,maxDistance);j++)previous[j]=j;

  for(let i=1;i<=x.length;i++){
    current.fill(infinity);
    if(i<=maxDistance)current[0]=i;
    const from=Math.max(1,i-maxDistance);
    const to=Math.min(y.length,i+maxDistance);
    for(let j=from;j<=to;j++){
      const substitution=previous[j-1]+Number(x[i-1]!==y[j-1]);
      current[j]=Math.min(previous[j]+1,current[j-1]+1,substitution);
    }
    [previous,current]=[current,previous];
  }
  const distance=previous[y.length];
  return distance<=maxDistance?clamp01(1-distance/denominator):0;
}

export function normalizedEditSimilarity(left, right, language = 'de') {
  const a = normalizeSurface(left, language);
  const b = normalizeSurface(right, language);
  return normalizedEditSimilarityPrepared(a,b);
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
  // most letters belong to the rhyme tail. v6 therefore requires independent structural
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

export function lexicalRedundancy(left, right) {
  const language = left?.language || right?.language || 'de';
  const a = normalizeSurface(left?.normalized || left?.surface || left?.word, language);
  const b = normalizeSurface(right?.normalized || right?.surface || right?.word, language);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const lemmaA = normalizeSurface(left?.lemma, language);
  const lemmaB = normalizeSurface(right?.lemma, language);
  if (lemmaA && lemmaB && lemmaA === lemmaB) return 1;

  const familyA = morphologyFamily(left);
  const familyB = morphologyFamily(right);
  if (familyA && familyB && familyA === familyB) return 0.92;

  const surfaceSimilarity = normalizedEditSimilarity(a, b, language);
  const prefixLength = commonPrefixLength(a, b);
  const minLength = Math.max(1, Math.min(a.length, b.length));

  const initialConstruction = prefixLength >= 6 && prefixLength / minLength >= 0.45
    ? clamp01(0.50 + 0.45 * (prefixLength / minLength))
    : 0;
  const nearDuplicate = surfaceSimilarity >= 0.84 ? surfaceSimilarity : 0;

  return Number(Math.max(initialConstruction, nearDuplicate).toFixed(4));
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

function redundancyTierPenalty(maxRedundancy) {
  if (maxRedundancy >= 0.88) return 2;
  if (maxRedundancy >= 0.58) return 1;
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

function preparedDiversityIdentity(row){
  const language=row?.language||'de';
  return {
    language,
    surface:normalizeSurface(row?.normalized||row?.surface||row?.word,language),
    lemma:normalizeSurface(row?.lemma,language),
    family:morphologyFamily(row),
  };
}

function lexicalRedundancyPrepared(left,right,currentMax=0){
  const a=left.surface;
  const b=right.surface;
  if(!a||!b)return 0;
  if(a===b)return 1;
  if(left.lemma&&right.lemma&&left.lemma===right.lemma)return 1;
  if(left.family&&right.family&&left.family===right.family)return 0.92;

  const prefixLength=commonPrefixLength(a,b);
  const minLength=Math.max(1,Math.min(a.length,b.length));
  const initialConstruction=prefixLength>=6&&prefixLength/minLength>=0.45
    ?clamp01(0.50+0.45*(prefixLength/minLength))
    :0;

  // Exact Levenshtein similarity can never exceed minLen/maxLen. If both that
  // bound and the prefix rule are already below the best known redundancy,
  // this pair cannot change ranking and the DP is provably unnecessary.
  const similarityUpperBound=Math.min(a.length,b.length)/Math.max(a.length,b.length);
  if(Math.max(initialConstruction,similarityUpperBound)<=currentMax)return 0;

  const surfaceSimilarity=normalizedEditSimilarityAtLeastPrepared(a,b,0.84);
  const nearDuplicate=surfaceSimilarity;
  return Number(Math.max(initialConstruction,nearDuplicate).toFixed(4));
}

export function rankWriterRecommendedResults(rows, query, options = {}) {
  const requestedLimit = Number.parseInt(String(options.limit ?? rows?.length ?? 1), 10);
  const limit = Math.min(rows?.length ?? 0, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 1));
  const diversityWeight = clamp01(options.diversityWeight ?? DEFAULT_DIVERSITY_WEIGHT);
  const remaining = (rows || []).map((row, baseIndex) => ({
    row,
    baseIndex,
    writer: writerUtilityFeatures(row, query),
    diversityIdentity:preparedDiversityIdentity(row),
    maxRedundancy: 0,
  }));
  const selected = [];

  while (remaining.length && selected.length < limit) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestEffectiveTier = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const diversityTierPenalty = redundancyTierPenalty(candidate.maxRedundancy);
      const effectiveTier = candidate.writer.writerTier + diversityTierPenalty;
      const diversifiedScore = candidate.writer.utility - diversityWeight * candidate.maxRedundancy;
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
    const diversityTierPenalty = redundancyTierPenalty(winner.maxRedundancy);
    selected.push({
      ...winner,
      effectiveTier: winner.writer.writerTier + diversityTierPenalty,
      diversityTierPenalty,
      diversifiedScore: Number(bestScore.toFixed(4)),
      redundancyPenalty: Number((diversityWeight * winner.maxRedundancy).toFixed(4)),
    });

    for (const candidate of remaining) {
      candidate.maxRedundancy = Math.max(
        candidate.maxRedundancy,
        lexicalRedundancyPrepared(
          candidate.diversityIdentity,
          winner.diversityIdentity,
          candidate.maxRedundancy,
        ),
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
      diversifiedScore: item.diversifiedScore ?? item.writer.utility,
      redundancyPenalty: item.redundancyPenalty ?? 0,
      maxRedundancy: Number((item.maxRedundancy ?? 0).toFixed(4)),
    },
  }));
}
