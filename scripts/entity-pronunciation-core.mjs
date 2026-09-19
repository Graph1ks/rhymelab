import { tokenizePhrase } from './phrase-catalog-core.mjs';
import { getPhonologyProfile } from './phonology-profiles.mjs';
import { coarseCodaClass } from './german-rhyme-features.mjs';
import { englishCoarseCodaClass } from './en-writer-db-core.mjs';

export const ENTITY_PRONUNCIATION_POLICY = 'entity-pronunciation-source-composition-v1';
export const ENTITY_PHONETIC_RUNTIME = 'entity-phonetic-runtime-de-v1';
export const ENTITY_RUNTIME_ANALYZER = 'de-ipa-v2';

const ELIGIBLE_REVIEW_STATES = new Set([
  'accepted',
  'reviewed',
  'accepted_source_composition',
]);

export function entityPronunciationRuntimeEligible(row) {
  return String(row?.locale || '') === 'de-DE'
    && ELIGIBLE_REVIEW_STATES.has(String(row?.review_state || ''));
}

export function composeEntityNamePronunciation(surface, resolveToken) {
  if (typeof resolveToken !== 'function') {
    throw new TypeError('composeEntityNamePronunciation requires resolveToken');
  }
  const tokens = tokenizePhrase(surface);
  if (!tokens.length) {
    return {
      status: 'unresolved_empty_surface',
      surface: String(surface || ''),
      tokens: [],
      unresolvedTokens: [],
      ipa: null,
      syllableCount: 0,
    };
  }

  const resolved = [];
  const unresolvedTokens = [];
  for (const token of tokens) {
    const detail = resolveToken(token.surface);
    if (!detail?.preferredIpa) {
      unresolvedTokens.push(token.surface);
      continue;
    }
    resolved.push({
      surface: token.surface,
      normalized: token.normalized,
      resolvedSurface: detail.surface || token.surface,
      ipa: detail.preferredIpa,
      syllableCount: Number(detail.syllableCount || 0),
      pronunciationId: detail.preferredPronunciationId || null,
    });
  }

  if (unresolvedTokens.length) {
    return {
      status: 'unresolved_token',
      surface: String(surface || ''),
      tokens: resolved,
      unresolvedTokens,
      ipa: null,
      syllableCount: 0,
    };
  }

  return {
    status: 'resolved',
    surface: String(surface || ''),
    tokens: resolved,
    unresolvedTokens: [],
    ipa: resolved.map((token) => token.ipa).join(' '),
    syllableCount: resolved.reduce((sum, token) => sum + token.syllableCount, 0),
  };
}

export function analyzeEntityPronunciation(ipa, language = 'de') {
  const profile = getPhonologyProfile(language);
  const analysis = profile.analyzeIpa(ipa);
  const secondary = analysis.syllables
    .filter((syllable) => Number(syllable.stressLevel || 0) === 1)
    .map((syllable) => Number(syllable.position));
  return {
    analyzerId: profile.analyzerVersion,
    language: profile.language,
    analysis,
    row: {
      phonemes: JSON.stringify(analysis.phonemes || []),
      syllables: JSON.stringify(analysis.syllables || []),
      syllableCount: Number(analysis.syllableCount || 0),
      primaryStress: Number(analysis.primaryStressSyllable || 0) || null,
      secondaryStress: JSON.stringify(secondary),
      stressPattern: analysis.stressPattern || null,
      vowelSequence: analysis.vowelSequence || null,
      consonantSequence: analysis.consonantSequence || null,
      rhymeTail: analysis.stressedTail || null,
      rhymeSignature: analysis.exactTailKey || null,
    },
  };
}

export function entityRetrievalAnchors(analysis, language = 'de') {
  const profile = getPhonologyProfile(language);
  const final = analysis?.syllables?.at?.(-1) || null;
  const values = [];

  const add = (channel, key) => {
    const clean = String(key || '').trim();
    if (clean) values.push({ channel, key: clean });
  };

  add('exact_tail', analysis?.exactTailKey);
  add('vowel_sequence', analysis?.vowelKey);
  add('vowel_family', analysis?.vowelFamilyKey);
  if (final?.nucleus) {
    const codaClass=language==='en'
      ?englishCoarseCodaClass((final.coda||[]).join(' '))
      :coarseCodaClass(final.coda||[]);
    add('final_nucleus_coda', `${final.nucleus}|${codaClass}`);
    add('final_nucleus', final.nucleus);
  }
  for (const entry of profile.writerRetrievalKeys?.(analysis) || []) {
    add(`writer_${entry.kind}`, entry.key);
  }

  const seen = new Set();
  return values.filter((entry) => {
    const signature = `${entry.channel}\u001f${entry.key}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
