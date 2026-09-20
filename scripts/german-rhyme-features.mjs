import { classifySoundRelations, matchedRelationTypes } from './rhyme-relations.mjs';

const VOWELS = {
  'a': [4,1,0,0,0], 'aː': [4,1,0,1,0], 'ɑ': [4,0,0,0,0], 'ɒ': [4,0,1,0,0], 'æ': [4,2,0,0,0],
  'e': [1,2,0,0,0], 'eː': [1,2,0,1,0], 'ɛ': [2,2,0,0,0], 'ɛː': [2,2,0,1,0], 'ə': [2,1,0,0,0], 'ɐ': [3,1,0,0,0],
  'i': [0,2,0,0,0], 'iː': [0,2,0,1,0], 'ɪ': [1,2,0,0,0],
  'o': [1,0,1,0,0], 'oː': [1,0,1,1,0], 'ɔ': [2,0,1,0,0],
  'u': [0,0,1,0,0], 'uː': [0,0,1,1,0], 'ʊ': [1,0,1,0,0],
  'y': [0,2,1,0,0], 'yː': [0,2,1,1,0], 'ʏ': [1,2,1,0,0],
  'ø': [1,2,1,0,0], 'øː': [1,2,1,1,0], 'œ': [2,2,1,0,0],
  'aɪ': [4,2,0,0,1], 'aʊ': [4,0,1,0,1], 'ɔʏ': [2,2,1,0,1], 'eɪ': [1,2,0,0,1], 'oʊ': [1,0,1,0,1],
  'n=': [5,1,0,0,0], 'm=': [5,1,0,0,0], 'l=': [5,1,0,0,0], 'ŋ=': [5,1,0,0,0], 'R=': [5,1,0,0,0],
};

const CONSONANTS = {
  'p': ['bilabial','stop',0,0], 'b': ['bilabial','stop',1,0],
  't': ['alveolar','stop',0,0], 'd': ['alveolar','stop',1,0],
  'k': ['velar','stop',0,0], 'g': ['velar','stop',1,0],
  'ʔ': ['glottal','stop',0,0],
  'f': ['labiodental','fricative',0,0], 'v': ['labiodental','fricative',1,0],
  's': ['alveolar','fricative',0,1], 'z': ['alveolar','fricative',1,1],
  'ʃ': ['postalveolar','fricative',0,1], 'ʒ': ['postalveolar','fricative',1,1],
  'ç': ['palatal','fricative',0,0], 'x': ['velar','fricative',0,0], 'h': ['glottal','fricative',0,0],
  'm': ['bilabial','nasal',1,0], 'n': ['alveolar','nasal',1,0], 'ŋ': ['velar','nasal',1,0],
  'l': ['alveolar','lateral',1,0], 'R': ['uvular','rhotic',1,0], 'j': ['palatal','approximant',1,0],
  'ts': ['alveolar','affricate',0,1], 'pf': ['labial','affricate',0,0], 'tʃ': ['postalveolar','affricate',0,1], 'dʒ': ['postalveolar','affricate',1,1],
};

const PLACE_GROUP = {
  bilabial: 0, labial: 0, labiodental: 0.5,
  alveolar: 1, postalveolar: 1.5, palatal: 2,
  velar: 3, uvular: 3.5, glottal: 4,
};
const MANNER_GROUP = { stop: 0, affricate: 0.5, fricative: 1, nasal: 2, lateral: 2.5, rhotic: 2.5, approximant: 3 };

const EMPTY_CONSONANT_MATCH = 0.6;
const REDUCED_NUCLEI = new Set(['ə', 'ɐ', 'n=', 'm=', 'l=', 'ŋ=', 'R=']);
const REDUCED_NUCLEUS_FLOOR = 0.70;

export const GERMAN_RELATION_THRESHOLDS = Object.freeze({
  assonance: Object.freeze({
    stressedNucleusMin: 0.90,
    vowelSequenceMin: 0.84,
    minCoverage: 0.67,
    strongSequenceMin: 0.94,
  }),
  consonance: Object.freeze({
    consonantSequenceMin: 0.875,
    minCoverage: 0.67,
    maxVowelSequence: 0.90,
    maxStressedNucleus: 1,
    strongSequenceMin: 0.96,
    strongMinCoverage: 0.80,
    strongMaxVowelSequence: 0.85,
    strongMaxStressedNucleus: 0.90,
    strongRequireExactSequence: false,
  }),
});

export const GERMAN_PRIMARY_THRESHOLDS = Object.freeze({
  multisyllabicSlantOverall: 0.85,
  multisyllabicFamilyOverall: 0.80,
  familyOverall: 0.82,
  familyVowelMin: 0.70,
  slantOverall: 0.61,
  slantVowelMin: 0.45,
});

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function mean(values) { return values.length ? values.reduce((a,b) => a+b, 0) / values.length : 1; }

export function vowelFeatures(symbol) {
  const raw = VOWELS[symbol];
  if (!raw) return { symbol, known: false };
  const [height, backness, rounded, long, diphthong] = raw;
  return { symbol, known: true, height, backness, rounded: Boolean(rounded), long: Boolean(long), diphthong: Boolean(diphthong) };
}

export function consonantFeatures(symbol) {
  const raw = CONSONANTS[symbol];
  if (!raw) return { symbol, known: false };
  const [place, manner, voiced, sibilant] = raw;
  return { symbol, known: true, place, manner, voiced: Boolean(voiced), sibilant: Boolean(sibilant) };
}

export function vowelSimilarity(a, b) {
  if (a === b) return 1;
  const x = vowelFeatures(a), y = vowelFeatures(b);
  if (!x.known || !y.known) return 0.25;
  if (x.height === 5 || y.height === 5) return x.height === y.height ? 0.72 : 0.08;
  const height = Math.abs(x.height - y.height) / 4;
  const backness = Math.abs(x.backness - y.backness) / 2;
  const rounded = x.rounded === y.rounded ? 0 : 1;
  const length = x.long === y.long ? 0 : 1;
  const diph = x.diphthong === y.diphthong ? 0 : 1;
  return clamp01(1 - (0.34*height + 0.26*backness + 0.14*rounded + 0.10*length + 0.16*diph));
}

export function germanRelationVowelSimilarity(a, b) {
  const base = vowelSimilarity(a, b);
  if (REDUCED_NUCLEI.has(a) && REDUCED_NUCLEI.has(b)) return Math.max(base, REDUCED_NUCLEUS_FLOOR);
  return base;
}

export function consonantSimilarity(a, b) {
  if (a === b) return 1;
  const x = consonantFeatures(a), y = consonantFeatures(b);
  if (!x.known || !y.known) return 0.2;
  const place = Math.min(1, Math.abs((PLACE_GROUP[x.place] ?? 2) - (PLACE_GROUP[y.place] ?? 2)) / 2.5);
  const manner = Math.min(1, Math.abs((MANNER_GROUP[x.manner] ?? 2) - (MANNER_GROUP[y.manner] ?? 2)) / 2.5);
  const voiced = x.voiced === y.voiced ? 0 : 1;
  const sibilant = x.sibilant === y.sibilant ? 0 : 1;
  return clamp01(1 - (0.36*place + 0.38*manner + 0.18*voiced + 0.08*sibilant));
}

function sequenceSimilarity(a, b, tokenSimilarity) {
  if (!a.length && !b.length) return EMPTY_CONSONANT_MATCH;
  const m = a.length, n = b.length;
  const previous=Array.from({length:n+1},(_,index)=>index);
  const current=new Array(n+1).fill(0);
  for(let i=1;i<=m;i++){
    current[0]=i;
    for(let j=1;j<=n;j++){
      const substitution=1-tokenSimilarity(a[i-1],b[j-1]);
      current[j]=Math.min(
        previous[j]+1,
        current[j-1]+1,
        previous[j-1]+substitution,
      );
    }
    for(let j=0;j<=n;j++)previous[j]=current[j];
  }
  return clamp01(1-previous[n]/Math.max(m,n));
}

function stressSimilarity(a, b) {
  const max = Math.max(a.length,b.length,1);
  let score = 0;
  for (let i=0;i<max;i++) {
    const x = a[a.length - 1 - i] ?? -1;
    const y = b[b.length - 1 - i] ?? -1;
    score += x === y ? 1 : (x >= 0 && y >= 0 && Math.abs(x-y) === 1 ? 0.55 : 0);
  }
  return score / max;
}

export function featureVectorForAnalysis(analysis) {
  const start = Math.max(0, Number(analysis.primaryStressSyllable || 1) - 1);
  const rhyme = analysis.syllables.slice(start).map((s, index) => ({
    stress: Number(s.stressLevel || 0),
    nucleus: vowelFeatures(s.nucleus),
    coda: s.coda.map(consonantFeatures),
    onset: index === 0 ? [] : s.onset.map(consonantFeatures),
  }));
  return {
    version: 'de-phon-v3',
    syllableCount: analysis.syllableCount,
    rhymeSyllableCount: rhyme.length,
    primaryStressSyllable: analysis.primaryStressSyllable,
    rhyme,
  };
}

function symbols(items) { return items.map((x) => x.symbol); }
function relationPayload(relations) { return { relations, relationTypes: matchedRelationTypes(relations) }; }

function hasExactCodaAnchor(a, b) {
  const left = new Set(a.rhyme.flatMap((syllable) => symbols(syllable.coda)));
  if (!left.size) return false;
  return b.rhyme.some((syllable) => symbols(syllable.coda).some((symbol) => left.has(symbol)));
}

function classifyPrimaryRhyme(va, vb, { overall, vowel, codaAnchor }) {
  const bothMultisyllabic = va.rhymeSyllableCount >= 2 && vb.rhymeSyllableCount >= 2;
  if (bothMultisyllabic && overall >= GERMAN_PRIMARY_THRESHOLDS.multisyllabicSlantOverall) {
    return 'multisyllabic_slant';
  }
  if (bothMultisyllabic && overall >= GERMAN_PRIMARY_THRESHOLDS.multisyllabicFamilyOverall) {
    return 'family';
  }
  if (overall >= GERMAN_PRIMARY_THRESHOLDS.familyOverall
      && vowel >= GERMAN_PRIMARY_THRESHOLDS.familyVowelMin
      && codaAnchor) {
    return 'family';
  }
  if (overall >= GERMAN_PRIMARY_THRESHOLDS.slantOverall
      && vowel >= GERMAN_PRIMARY_THRESHOLDS.slantVowelMin) {
    return 'slant';
  }
  return 'weak';
}

export function prepareGermanRhymeAnalysis(analysis){
  return {
    analysis,
    vector:featureVectorForAnalysis(analysis),
    exactTailKey:analysis?.exactTailKey||null,
    stressedSyllableCount:Number(analysis?.stressedSyllableCount||0),
  };
}

export function scorePreparedGermanRhymeAnalyses(preparedA,preparedB) {
  const a=preparedA.analysis;
  const b=preparedB.analysis;
  const exactRhyme=Boolean(
    preparedA.exactTailKey
    &&preparedA.exactTailKey===preparedB.exactTailKey
  );
  const va=preparedA.vector;
  const vb=preparedB.vector;
  const relations = classifySoundRelations(va, vb, {
    vowelSimilarity: germanRelationVowelSimilarity,
    consonantSimilarity,
    exactRhyme,
    thresholds: GERMAN_RELATION_THRESHOLDS,
  });

  if (exactRhyme) {
    return {
      overall: 1,
      type: preparedA.stressedSyllableCount >= 2 && preparedB.stressedSyllableCount >= 2
        ? 'multisyllabic_perfect'
        : 'perfect',
      vowel: 1, coda: 1, stress: 1, syllable: 1, onset: 1, consonance: 1,
      codaAnchor: true,
      ...relationPayload(relations),
    };
  }

  const pairs = Math.max(va.rhyme.length, vb.rhyme.length, 1);
  const vowelScores = [], codaScores = [], onsetScores = [];
  for (let i=0;i<pairs;i++) {
    const xIndex = va.rhyme.length - 1 - i;
    const yIndex = vb.rhyme.length - 1 - i;
    const x = va.rhyme[xIndex], y = vb.rhyme[yIndex];
    if (!x || !y) { vowelScores.push(0); codaScores.push(0); onsetScores.push(0); continue; }
    const postStressReducedPair = xIndex > 0 && yIndex > 0;
    vowelScores.push(postStressReducedPair
      ? germanRelationVowelSimilarity(x.nucleus.symbol, y.nucleus.symbol)
      : vowelSimilarity(x.nucleus.symbol, y.nucleus.symbol));
    codaScores.push(sequenceSimilarity(symbols(x.coda), symbols(y.coda), consonantSimilarity));
    onsetScores.push(sequenceSimilarity(symbols(x.onset), symbols(y.onset), consonantSimilarity));
  }
  const vowel = mean(vowelScores);
  const coda = mean(codaScores);
  const onset = mean(onsetScores);
  const stress = stressSimilarity(va.rhyme.map((x) => x.stress), vb.rhyme.map((x) => x.stress));
  const syllable = 1 - Math.min(1, Math.abs(va.rhymeSyllableCount-vb.rhymeSyllableCount) / Math.max(va.rhymeSyllableCount,vb.rhymeSyllableCount,1));
  const consonance = 0.8*coda + 0.2*onset;
  const overall = clamp01(0.48*vowel + 0.30*coda + 0.10*stress + 0.08*syllable + 0.04*onset);
  const codaAnchor = hasExactCodaAnchor(va, vb);
  const type = classifyPrimaryRhyme(va, vb, { overall, vowel, codaAnchor });
  return { overall, type, vowel, coda, stress, syllable, onset, consonance, codaAnchor, ...relationPayload(relations) };
}

export function scoreGermanRhymeAnalyses(a, b) {
  return scorePreparedGermanRhymeAnalyses(
    prepareGermanRhymeAnalysis(a),
    prepareGermanRhymeAnalysis(b),
  );
}

export function coarseCodaClass(coda) {
  if (!coda?.length) return 'OPEN';
  return coda.map((symbol) => {
    const f = consonantFeatures(symbol);
    if (!f.known) return `?${symbol}`;
    const place = ['bilabial','labial','labiodental'].includes(f.place) ? 'LAB' : ['alveolar','postalveolar'].includes(f.place) ? 'COR' : ['palatal','velar'].includes(f.place) ? 'DOR' : f.place === 'uvular' ? 'UV' : 'GLO';
    const manner = f.manner === 'stop' ? 'STOP' : f.manner === 'affricate' ? 'AFF' : f.manner === 'fricative' ? 'FRIC' : f.manner === 'nasal' ? 'NAS' : ['lateral','rhotic','approximant'].includes(f.manner) ? 'SON' : 'OTH';
    return `${place}-${manner}`;
  }).join('+');
}
