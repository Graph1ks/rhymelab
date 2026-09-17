import { analyzeGermanIpa } from './german-ipa.mjs';
import { scoreGermanRhymeAnalyses } from './german-rhyme-features.mjs';

const PROFILES = new Map([
  ['de', Object.freeze({
    language: 'de',
    locale: 'de-DE',
    analyzerVersion: 'de-ipa-v2',
    scorerVersion: 'de-phon-v3',
    relationPolicyVersion: 'rhyme-relations-v2',
    analyzeIpa: analyzeGermanIpa,
    scoreAnalyses: scoreGermanRhymeAnalyses,
    normalizeSurface(value) {
      return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('de-DE');
    },
  })],
]);

export const SUPPORTED_PHONOLOGY_LANGUAGES = Object.freeze([...PROFILES.keys()]);

export function getPhonologyProfile(language = 'de') {
  const code = String(language || 'de').trim().toLocaleLowerCase('en-US');
  const profile = PROFILES.get(code);
  if (!profile) throw new Error(`Unsupported RhymeLab phonology language: ${code || 'missing'}`);
  return profile;
}

export function normalizeForLanguage(value, language = 'de') {
  return getPhonologyProfile(language).normalizeSurface(value);
}
