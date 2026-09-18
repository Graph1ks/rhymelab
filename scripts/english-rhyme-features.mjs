import { classifySoundRelations, matchedRelationTypes } from './rhyme-relations.mjs';

const VOWELS = {
  'i': [0,2,0,1,0,0,0], 'ɪ': [1,2,0,0,0,0,0], 'e': [1,2,0,1,0,0,0], 'eɪ': [1,2,0,1,1,0,0],
  'ɛ': [2,2,0,0,0,0,0], 'æ': [4,2,0,0,0,0,0], 'ɑ': [4,0,0,0,0,0,0], 'ɒ': [4,0,1,0,0,0,0],
  'ɔ': [2,0,1,0,0,0,0], 'oʊ': [1,0,1,1,1,0,0], 'ʊ': [1,0,1,0,0,0,0], 'u': [0,0,1,1,0,0,0],
  'ʌ': [2,1,0,0,0,0,0], 'ə': [2,1,0,0,0,0,1], 'ɐ': [3,1,0,0,0,0,1],
  'ɜ': [2,1,0,1,0,0,0], 'ɚ': [2,1,0,0,0,1,1], 'ɝ': [2,1,0,1,0,1,0],
  'aɪ': [4,2,0,0,1,0,0], 'aʊ': [4,0,1,0,1,0,0], 'ɔɪ': [2,2,1,0,1,0,0],
  'ɪə': [1,1,0,0,1,0,0], 'eə': [2,1,0,0,1,0,0], 'ʊə': [1,1,1,0,1,0,0],
  'n=': [5,1,0,0,0,0,1], 'm=': [5,1,0,0,0,0,1], 'l=': [5,1,0,0,0,0,1],
};

const CONSONANTS = {
  'p': ['bilabial','stop',0,0], 'b': ['bilabial','stop',1,0],
  't': ['alveolar','stop',0,0], 'd': ['alveolar','stop',1,0],
  'k': ['velar','stop',0,0], 'g': ['velar','stop',1,0], 'ʔ': ['glottal','stop',0,0],
  'f': ['labiodental','fricative',0,0], 'v': ['labiodental','fricative',1,0],
  'θ': ['dental','fricative',0,0], 'ð': ['dental','fricative',1,0],
  's': ['alveolar','fricative',0,1], 'z': ['alveolar','fricative',1,1],
  'ʃ': ['postalveolar','fricative',0,1], 'ʒ': ['postalveolar','fricative',1,1], 'h': ['glottal','fricative',0,0],
  'm': ['bilabial','nasal',1,0], 'n': ['alveolar','nasal',1,0], 'ŋ': ['velar','nasal',1,0],
  'l': ['alveolar','lateral',1,0], 'ɹ': ['alveolar','rhotic',1,0], 'j': ['palatal','approximant',1,0], 'w': ['labiovelar','approximant',1,0],
  'tʃ': ['postalveolar','affricate',0,1], 'dʒ': ['postalveolar','affricate',1,1],
};

const PLACE = {
  bilabial:0, labiodental:0.5, dental:0.8, alveolar:1, postalveolar:1.5,
  palatal:2, velar:3, labiovelar:3.2, glottal:4,
};
const MANNER = { stop:0, affricate:0.5, fricative:1, nasal:2, lateral:2.5, rhotic:2.6, approximant:3 };

export const ENGLISH_RELATION_THRESHOLDS = Object.freeze({
  assonance: Object.freeze({ stressedNucleusMin:0.92, vowelSequenceMin:0.86, minCoverage:0.67, strongSequenceMin:0.96 }),
  consonance: Object.freeze({
    consonantSequenceMin:0.88, minCoverage:0.67, maxVowelSequence:0.84, maxStressedNucleus:0.90,
    strongSequenceMin:0.97, strongMinCoverage:0.80, strongMaxVowelSequence:0.78, strongMaxStressedNucleus:0.86,
    strongRequireExactSequence:false,
  }),
});

export const ENGLISH_PRIMARY_THRESHOLDS = Object.freeze({
  multisyllabicSlantOverall:0.84,
  familyOverall:0.79,
  familyVowelMin:0.68,
  familyCodaMin:0.72,
  slantOverall:0.60,
  slantVowelMin:0.46,
});

function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function mean(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:0.6;}

export function englishVowelFeatures(symbol){
  const raw=VOWELS[symbol];
  if(!raw) return {symbol,known:false};
  const [height,backness,rounded,tense,diphthong,rhotic,reduced]=raw;
  return {symbol,known:true,height,backness,rounded:Boolean(rounded),tense:Boolean(tense),diphthong:Boolean(diphthong),rhotic:Boolean(rhotic),reduced:Boolean(reduced)};
}

export function englishConsonantFeatures(symbol){
  const raw=CONSONANTS[symbol];
  if(!raw) return {symbol,known:false};
  const [place,manner,voiced,sibilant]=raw;
  return {symbol,known:true,place,manner,voiced:Boolean(voiced),sibilant:Boolean(sibilant)};
}

export function englishVowelSimilarity(a,b){
  if(a===b) return 1;
  const x=englishVowelFeatures(a), y=englishVowelFeatures(b);
  if(!x.known||!y.known) return 0.2;
  if(x.height===5||y.height===5) return x.height===y.height?0.68:0.06;
  const distance=
    0.30*(Math.abs(x.height-y.height)/4)+
    0.22*(Math.abs(x.backness-y.backness)/2)+
    0.10*(x.rounded===y.rounded?0:1)+
    0.10*(x.tense===y.tense?0:1)+
    0.18*(x.diphthong===y.diphthong?0:1)+
    0.06*(x.rhotic===y.rhotic?0:1)+
    0.04*(x.reduced===y.reduced?0:1);
  let score=clamp01(1-distance);
  if(x.diphthong&&y.diphthong&&a!==b) score=clamp01(score-0.12);
  return score;
}

export function englishConsonantSimilarity(a,b){
  if(a===b) return 1;
  const x=englishConsonantFeatures(a), y=englishConsonantFeatures(b);
  if(!x.known||!y.known) return 0.18;
  const place=Math.min(1,Math.abs((PLACE[x.place]??2)-(PLACE[y.place]??2))/2.5);
  const manner=Math.min(1,Math.abs((MANNER[x.manner]??2)-(MANNER[y.manner]??2))/2.5);
  const voiced=x.voiced===y.voiced?0:1;
  const sibilant=x.sibilant===y.sibilant?0:1;
  return clamp01(1-(0.34*place+0.38*manner+0.20*voiced+0.08*sibilant));
}

function sequenceSimilarity(a,b,tokenSimilarity){
  if(!a.length&&!b.length) return 0.6;
  if(!a.length||!b.length) return 0;
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=1;i<=m;i++) dp[i][0]=i;
  for(let j=1;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
    const substitution=1-tokenSimilarity(a[i-1],b[j-1]);
    dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+substitution);
  }
  return clamp01(1-dp[m][n]/Math.max(m,n));
}

function stressSimilarity(a,b){
  const max=Math.max(a.length,b.length,1);
  let score=0;
  for(let i=0;i<max;i++){
    const x=a[a.length-1-i]??-1,y=b[b.length-1-i]??-1;
    score+=x===y?1:(x>=0&&y>=0&&Math.abs(x-y)===1?0.5:0);
  }
  return score/max;
}

export function featureVectorForEnglishAnalysis(analysis){
  const start=Math.max(0,Number(analysis.rhymeStartSyllable||analysis.primaryStressSyllable||1)-1);
  const rhyme=analysis.syllables.slice(start).map((s,index)=>({
    stress:Number(s.stressLevel||0),
    nucleus:englishVowelFeatures(s.nucleus),
    coda:s.coda.map(englishConsonantFeatures),
    onset:index===0?[]:s.onset.map(englishConsonantFeatures),
  }));
  return {version:'en-phon-v1-candidate',syllableCount:analysis.syllableCount,rhymeSyllableCount:rhyme.length,rhyme};
}

function symbols(items){return items.map(x=>x.symbol);}
function relationPayload(relations){return {relations,relationTypes:matchedRelationTypes(relations)};}

function classifyPrimary(va,vb,{overall,vowel,coda}){
  const multi=va.rhymeSyllableCount>=2&&vb.rhymeSyllableCount>=2;
  if(multi&&overall>=ENGLISH_PRIMARY_THRESHOLDS.multisyllabicSlantOverall) return 'multisyllabic_slant';
  if(overall>=ENGLISH_PRIMARY_THRESHOLDS.familyOverall&&vowel>=ENGLISH_PRIMARY_THRESHOLDS.familyVowelMin&&coda>=ENGLISH_PRIMARY_THRESHOLDS.familyCodaMin) return 'family';
  if(overall>=ENGLISH_PRIMARY_THRESHOLDS.slantOverall&&vowel>=ENGLISH_PRIMARY_THRESHOLDS.slantVowelMin) return 'slant';
  return 'weak';
}

export function scoreEnglishRhymeAnalyses(a,b){
  const exactRhyme=Boolean(a.exactTailKey&&a.exactTailKey===b.exactTailKey);
  const va=featureVectorForEnglishAnalysis(a), vb=featureVectorForEnglishAnalysis(b);
  const relations=classifySoundRelations(va,vb,{
    vowelSimilarity:englishVowelSimilarity,
    consonantSimilarity:englishConsonantSimilarity,
    exactRhyme,
    thresholds:ENGLISH_RELATION_THRESHOLDS,
  });
  if(exactRhyme){
    return {overall:1,type:va.rhymeSyllableCount>=2&&vb.rhymeSyllableCount>=2?'multisyllabic_perfect':'perfect',vowel:1,coda:1,stress:1,syllable:1,onset:1,consonance:1,...relationPayload(relations)};
  }
  const pairs=Math.max(va.rhyme.length,vb.rhyme.length,1);
  const vowelScores=[],codaScores=[],onsetScores=[];
  for(let i=0;i<pairs;i++){
    const x=va.rhyme[va.rhyme.length-1-i], y=vb.rhyme[vb.rhyme.length-1-i];
    if(!x||!y){vowelScores.push(0);codaScores.push(0);onsetScores.push(0);continue;}
    vowelScores.push(englishVowelSimilarity(x.nucleus.symbol,y.nucleus.symbol));
    codaScores.push(sequenceSimilarity(symbols(x.coda),symbols(y.coda),englishConsonantSimilarity));
    onsetScores.push(sequenceSimilarity(symbols(x.onset),symbols(y.onset),englishConsonantSimilarity));
  }
  const vowel=mean(vowelScores), coda=mean(codaScores), onset=mean(onsetScores);
  const stress=stressSimilarity(va.rhyme.map(x=>x.stress),vb.rhyme.map(x=>x.stress));
  const syllable=1-Math.min(1,Math.abs(va.rhymeSyllableCount-vb.rhymeSyllableCount)/Math.max(va.rhymeSyllableCount,vb.rhymeSyllableCount,1));
  const consonance=0.82*coda+0.18*onset;
  const overall=clamp01(0.50*vowel+0.28*coda+0.10*stress+0.07*syllable+0.05*onset);
  return {overall,type:classifyPrimary(va,vb,{overall,vowel,coda}),vowel,coda,stress,syllable,onset,consonance,...relationPayload(relations)};
}
