import { analyzeGermanIpa } from './german-ipa.mjs';
import { scoreGermanRhymeAnalyses } from './german-rhyme-features.mjs';
import {
  germanRightEdgeVowelSuffixKeys,
  scoreGermanRhymeAnalysesWithAnchors,
} from './german-rhyme-anchors.mjs';
import {
  analyzeEnglishArpabet,
  analyzeEnglishIpa,
  analyzeEnglishPronunciation,
} from './english-phonology.mjs';
import { scoreEnglishRhymeAnalyses } from './english-rhyme-features.mjs';

const ENGLISH_PROFILE=Object.freeze({
  language:'en',
  locale:'en-US',
  status:'accepted_product_v1',
  analyzerVersion:'en-pron-v1-candidate',
  scorerVersion:'en-phon-v1-candidate',
  relationPolicyVersion:'rhyme-relations-v2',
  analyzePronunciation:analyzeEnglishPronunciation,
  analyzeArpabet:analyzeEnglishArpabet,
  analyzeIpa:analyzeEnglishIpa,
  scoreAnalyses:scoreEnglishRhymeAnalyses,
  scoreWriterAnalyses:scoreEnglishRhymeAnalyses,
  normalizeSurface(value){
    return String(value??'')
      .normalize('NFKC')
      .replace(/[’‘]/g,"'")
      .trim()
      .replace(/\s+/g,' ')
      .toLocaleLowerCase('en-US');
  },
});

const PROFILES=new Map([
  ['de',Object.freeze({
    language:'de',
    locale:'de-DE',
    analyzerVersion:'de-ipa-v2',
    scorerVersion:'de-phon-v3',
    relationPolicyVersion:'rhyme-relations-v2',
    writerAnchorPolicyVersion:'de-right-edge-anchors-v1',
    analyzeIpa:analyzeGermanIpa,
    scoreAnalyses:scoreGermanRhymeAnalyses,
    scoreWriterAnalyses:scoreGermanRhymeAnalysesWithAnchors,
    writerRetrievalKeys:germanRightEdgeVowelSuffixKeys,
    normalizeSurface(value){
      return String(value??'')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g,' ')
        .toLocaleLowerCase('de-DE');
    },
  })],
  ['en',ENGLISH_PROFILE],
]);

// Compatibility surface for code/tests that still imports the old candidate accessor.
// The profile object is now the same accepted product profile, not a second phonology.
const CANDIDATE_PROFILES=new Map([
  ['en',ENGLISH_PROFILE],
]);

export const SUPPORTED_PHONOLOGY_LANGUAGES=Object.freeze([...PROFILES.keys()]);
export const CANDIDATE_PHONOLOGY_LANGUAGES=Object.freeze([...CANDIDATE_PROFILES.keys()]);

export function getPhonologyProfile(language='de'){
  const code=String(language||'de').trim().toLocaleLowerCase('en-US');
  const profile=PROFILES.get(code);
  if(!profile) throw new Error(`Unsupported RhymeLab phonology language: ${code||'missing'}`);
  return profile;
}

export function getCandidatePhonologyProfile(language){
  const code=String(language||'').trim().toLocaleLowerCase('en-US');
  const profile=CANDIDATE_PROFILES.get(code);
  if(!profile) throw new Error(`Unsupported RhymeLab candidate phonology language: ${code||'missing'}`);
  return profile;
}

export function normalizeForLanguage(value,language='de'){
  return getPhonologyProfile(language).normalizeSurface(value);
}
