const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const DEFAULT_RELATION_THRESHOLDS = Object.freeze({
  assonance: Object.freeze({
    stressedNucleusMin: 0.90,
    vowelSequenceMin: 0.84,
    minCoverage: 0.67,
    strongSequenceMin: 0.94,
  }),
  consonance: Object.freeze({
    consonantSequenceMin: 0.88,
    minCoverage: 0.67,
    maxVowelSequence: 0.82,
    maxStressedNucleus: 0.88,
    strongSequenceMin: 0.98,
    strongMinCoverage: 1,
    strongMaxVowelSequence: 0.70,
    strongMaxStressedNucleus: 0.88,
    strongRequireExactSequence: true,
  }),
});

function sequenceSimilarity(a, b, tokenSimilarity) {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) dp[i][0] = i;
  for (let j = 1; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const substitution = 1 - clamp01(tokenSimilarity(a[i - 1], b[j - 1]));
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + substitution,
      );
    }
  }
  return clamp01(1 - dp[m][n] / Math.max(m, n));
}

function coverage(a, b) {
  if (!a.length || !b.length) return 0;
  return Math.min(a.length, b.length) / Math.max(a.length, b.length);
}

function exactSequence(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function vowelSymbols(vector) {
  return (vector?.rhyme || []).map((syllable) => syllable?.nucleus?.symbol).filter(Boolean);
}

function consonantSymbols(vector) {
  return (vector?.rhyme || []).flatMap((syllable, index) => [
    ...(index === 0 ? [] : (syllable?.onset || []).map((item) => item.symbol).filter(Boolean)),
    ...(syllable?.coda || []).map((item) => item.symbol).filter(Boolean),
  ]);
}

function relation(type, matched, strength, score, components) {
  return {
    type,
    matched: Boolean(matched),
    strength: matched ? strength : null,
    score: Number(clamp01(score).toFixed(4)),
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [key, Number(clamp01(value).toFixed(4))]),
    ),
  };
}

/**
 * Language-neutral relation classifier.
 *
 * The caller supplies language-specific vowel/consonant similarity functions,
 * thresholds and feature vectors with a common stressed-rhyme-domain shape.
 * This keeps relation logic reusable without sharing one language's inventory
 * or calibration with another language profile.
 */
export function classifySoundRelations(vectorA, vectorB, options = {}) {
  const vowelSimilarity = options.vowelSimilarity;
  const consonantSimilarity = options.consonantSimilarity;
  if (typeof vowelSimilarity !== 'function' || typeof consonantSimilarity !== 'function') {
    throw new TypeError('classifySoundRelations requires vowelSimilarity and consonantSimilarity functions');
  }

  const thresholds = {
    assonance: { ...DEFAULT_RELATION_THRESHOLDS.assonance, ...(options.thresholds?.assonance || {}) },
    consonance: { ...DEFAULT_RELATION_THRESHOLDS.consonance, ...(options.thresholds?.consonance || {}) },
  };
  const exactRhyme = options.exactRhyme === true;

  const vowelsA = vowelSymbols(vectorA);
  const vowelsB = vowelSymbols(vectorB);
  const consonantsA = consonantSymbols(vectorA);
  const consonantsB = consonantSymbols(vectorB);

  const stressedNucleus = vowelsA.length && vowelsB.length
    ? clamp01(vowelSimilarity(vowelsA[0], vowelsB[0]))
    : 0;
  const vowelSequence = sequenceSimilarity(vowelsA, vowelsB, vowelSimilarity);
  const vowelCoverage = coverage(vowelsA, vowelsB);
  const consonantSequence = sequenceSimilarity(consonantsA, consonantsB, consonantSimilarity);
  const consonantCoverage = coverage(consonantsA, consonantsB);

  const assonanceStrong = !exactRhyme
    && stressedNucleus === 1
    && vowelCoverage === 1
    && vowelSequence >= thresholds.assonance.strongSequenceMin;
  const assonancePartial = !exactRhyme
    && stressedNucleus >= thresholds.assonance.stressedNucleusMin
    && vowelSequence >= thresholds.assonance.vowelSequenceMin
    && vowelCoverage >= thresholds.assonance.minCoverage;
  const assonanceMatched = assonanceStrong || assonancePartial;
  const assonanceScore = 0.50 * stressedNucleus + 0.40 * vowelSequence + 0.10 * vowelCoverage;

  const hasConsonantEvidence = consonantsA.length > 0 && consonantsB.length > 0;
  const exactStrongSequenceSatisfied = thresholds.consonance.strongRequireExactSequence === false
    || exactSequence(consonantsA, consonantsB);
  const consonanceStrong = !exactRhyme
    && hasConsonantEvidence
    && exactStrongSequenceSatisfied
    && consonantSequence >= thresholds.consonance.strongSequenceMin
    && consonantCoverage >= thresholds.consonance.strongMinCoverage
    && vowelSequence <= thresholds.consonance.strongMaxVowelSequence
    && stressedNucleus <= thresholds.consonance.strongMaxStressedNucleus;
  const consonancePartial = !exactRhyme
    && hasConsonantEvidence
    && consonantSequence >= thresholds.consonance.consonantSequenceMin
    && consonantCoverage >= thresholds.consonance.minCoverage
    && vowelSequence <= thresholds.consonance.maxVowelSequence
    && stressedNucleus <= thresholds.consonance.maxStressedNucleus;
  const consonanceMatched = consonanceStrong || consonancePartial;
  const consonanceScore = 0.70 * consonantSequence + 0.15 * consonantCoverage + 0.15 * (1 - vowelSequence);

  return {
    version: 'rhyme-relations-v2',
    assonance: relation('assonance', assonanceMatched, assonanceStrong ? 'strong' : 'partial', assonanceScore, {
      stressedNucleus,
      vowelSequence,
      coverage: vowelCoverage,
    }),
    consonance: relation('consonance', consonanceMatched, consonanceStrong ? 'strong' : 'partial', consonanceScore, {
      consonantSequence,
      coverage: consonantCoverage,
      vowelContrast: 1 - vowelSequence,
      stressedNucleus,
    }),
  };
}

export function matchedRelationTypes(relations) {
  return ['assonance', 'consonance'].filter((type) => relations?.[type]?.matched === true);
}
