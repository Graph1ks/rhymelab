import { getWord } from './local-engine.mjs';
import { findWriterRhymes } from './writer-search.mjs';
import { tokenizePhrase } from '../scripts/phrase-catalog-core.mjs';
import { retrievePhraseMosaicCandidatesV2 } from '../scripts/phrase-mosaic-retrieval-v2-core.mjs';
import { enrichPhraseMosaicCandidates } from '../scripts/phrase-mosaic-ranking-evidence-core.mjs';
import { rankPhraseMosaicCandidatesV2 } from '../scripts/phrase-mosaic-ranking-candidate-v2-core.mjs';
import { diversifyPhraseMosaicWriterPage } from '../scripts/phrase-mosaic-diversity-candidate-core.mjs';

export const UNIFIED_WRITER_SCHEMA = 'rhymelab-unified-writer-v1';
export const UNIFIED_WRITER_POLICY = 'de-unified-word-phrase-writer-v1';
export const ACCEPTED_PHRASE_MOSAIC_ANCHOR_FINGERPRINT =
  '9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059';
export const ACCEPTED_PHRASE_MOSAIC_RANKING_POLICY =
  'de-phrase-writer-utility-v2-phonetic-guard-candidate';
export const ACCEPTED_PHRASE_MOSAIC_DIVERSITY_POLICY =
  'de-phrase-channel-diversity-v1-candidate';

const LANGUAGE_BASES = new Set(['de', 'en', 'both']);
const RESULT_SCOPES = new Set(['all', 'words', 'phrases']);
const PRIMARY_TYPES = new Set([
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
]);

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function normalizeGerman(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE');
}

function tableExists(db, name) {
  if (!db) return false;
  try {
    return Boolean(db.prepare(
      "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?",
    ).get(name));
  } catch {
    return false;
  }
}

function metaValue(db, key) {
  if (!db) return null;
  try {
    return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value ?? null;
  } catch {
    return null;
  }
}

export function normalizeUnifiedLanguageBasis(value) {
  const normalized = String(value || 'de').trim().toLocaleLowerCase('en-US');
  return LANGUAGE_BASES.has(normalized) ? normalized : 'de';
}

export function normalizeUnifiedResultScope(value) {
  const normalized = String(value || 'all').trim().toLocaleLowerCase('en-US');
  return RESULT_SCOPES.has(normalized) ? normalized : 'all';
}

export function unifiedWriterCapabilities({ writerDb = null, phraseDb = null } = {}) {
  const phraseAnchorFingerprint = metaValue(
    phraseDb,
    'phrase_mosaic_retrieval_v2_fingerprint',
  );
  const phraseTablesReady = [
    'phrase',
    'phrase_pronunciation',
    'phrase_mosaic_window',
    'phrase_mosaic_retrieval_anchor',
    'phrase_mosaic_retrieval_v2_anchor',
  ].every((name) => tableExists(phraseDb, name));
  const phraseAccepted =
    phraseTablesReady
    && phraseAnchorFingerprint === ACCEPTED_PHRASE_MOSAIC_ANCHOR_FINGERPRINT;

  return {
    schema: 'rhymelab-unified-writer-capabilities-v1',
    languages: {
      de: {
        available: Boolean(writerDb),
        wordWriter: Boolean(writerDb),
        phraseMosaic: Boolean(writerDb && phraseDb && phraseAccepted),
        phraseReason: !phraseDb
          ? 'phrase_database_unavailable'
          : !phraseTablesReady
            ? 'phrase_runtime_tables_missing'
            : phraseAccepted
              ? null
              : 'phrase_runtime_fingerprint_mismatch',
      },
      en: {
        available: false,
        wordWriter: false,
        phraseMosaic: false,
        reason: 'english_phonology_and_runtime_not_implemented',
      },
    },
    bases: {
      de: Boolean(writerDb),
      en: false,
      both: Boolean(writerDb),
    },
    partialBases: {
      both: Boolean(writerDb),
    },
    phraseAnchorFingerprint,
    acceptedPhraseAnchorFingerprint: ACCEPTED_PHRASE_MOSAIC_ANCHOR_FINGERPRINT,
  };
}

function exactPhraseQuery(phraseDb, input) {
  if (!phraseDb || !tableExists(phraseDb, 'phrase_pronunciation')) return null;
  const normalized = normalizeGerman(input);
  if (!normalized) return null;

  const row = phraseDb.prepare([
    'SELECT p.phrase_id,p.canonical,p.normalized,p.token_count,',
    'p.phrase_types_json,p.historical_state,p.modern_eligible,',
    'pp.ipa,pp.syllable_count,pp.stress_pattern,',
    'pp.primary_stress_syllables_json,pp.secondary_stress_syllables_json',
    ' FROM phrase p',
    ' JOIN phrase_pronunciation pp ON pp.phrase_id=p.phrase_id',
    ' AND pp.variant_rank=1 AND pp.eligible=1',
    ' WHERE p.normalized=?',
    ' ORDER BY p.phrase_id LIMIT 1',
  ].join('')).get(normalized);

  if (!row) return null;

  let phraseTypes = [];
  let primaryStressSyllables = [];
  let secondaryStressSyllables = [];
  try { phraseTypes = JSON.parse(row.phrase_types_json || '[]'); } catch {}
  try { primaryStressSyllables = JSON.parse(row.primary_stress_syllables_json || '[]'); } catch {}
  try { secondaryStressSyllables = JSON.parse(row.secondary_stress_syllables_json || '[]'); } catch {}

  return {
    kind: 'phrase',
    language: 'de',
    surface: row.canonical,
    normalized: row.normalized,
    preferredIpa: row.ipa,
    ipa: row.ipa,
    syllableCount: Number(row.syllable_count || 0),
    stressPattern: row.stress_pattern || null,
    primaryStressSyllable: primaryStressSyllables[0] ?? null,
    primaryStressSyllables,
    secondaryStressSyllables,
    phraseId: row.phrase_id,
    phraseTypes,
    tokenCount: Number(row.token_count || 0),
    historical: row.historical_state === 'historical_only',
    historicalState: row.historical_state,
    modernEligible: Boolean(row.modern_eligible),
    lexiconLayer: 'phrase',
    partOfSpeech: 'phrase',
    pronunciationProvenance: 'accepted_phrase_catalog_citation_preferred',
    pronunciations: [{
      ipa: row.ipa,
      preferred: true,
      source: 'RhymeLab phrase catalog',
      locale: 'de-DE',
      register: null,
      dialect: null,
    }],
  };
}

function composedPhraseQuery(writerDb, input) {
  const tokens = tokenizePhrase(input);
  if (tokens.length < 2) return null;

  const resolved = [];
  const unresolved = [];

  for (const token of tokens) {
    const detail = getWord(writerDb, token.surface);
    if (!detail?.preferredIpa) {
      unresolved.push(token.surface);
      continue;
    }
    resolved.push({
      surface: token.surface,
      normalized: token.normalized,
      word: detail.surface,
      ipa: detail.preferredIpa,
      syllableCount: Number(detail.syllableCount || 0),
      pronunciationId: detail.preferredPronunciationId || null,
    });
  }

  if (unresolved.length) {
    return {
      kind: 'phrase',
      language: 'de',
      surface: String(input || '').normalize('NFKC').trim().replace(/\s+/g, ' '),
      normalized: normalizeGerman(input),
      resolvable: false,
      unresolvedTokens: unresolved,
      tokens: resolved,
      pronunciationProvenance: 'writer_v5_token_composition_failed',
    };
  }

  return {
    kind: 'phrase',
    language: 'de',
    surface: String(input || '').normalize('NFKC').trim().replace(/\s+/g, ' '),
    normalized: normalizeGerman(input),
    preferredIpa: resolved.map((token) => token.ipa).join(' '),
    ipa: resolved.map((token) => token.ipa).join(' '),
    syllableCount: resolved.reduce((sum, token) => sum + token.syllableCount, 0),
    primaryStressSyllable: null,
    phraseId: null,
    phraseTypes: ['user_query'],
    tokenCount: tokens.length,
    historical: false,
    modernEligible: true,
    lexiconLayer: 'user_phrase',
    partOfSpeech: 'phrase',
    resolvable: true,
    unresolvedTokens: [],
    tokens: resolved,
    pronunciationProvenance: 'writer_v5_preferred_token_citation_composition',
    pronunciations: [{
      ipa: resolved.map((token) => token.ipa).join(' '),
      preferred: true,
      source: 'Writer v5 token pronunciations',
      locale: 'de-DE',
      register: null,
      dialect: null,
    }],
  };
}

export function resolveGermanUnifiedQuery(writerDb, phraseDb, input) {
  const text = String(input || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!text) return null;

  const tokens = tokenizePhrase(text);
  if (tokens.length <= 1) {
    const word = getWord(writerDb, text);
    if (!word?.preferredIpa) return null;
    return {
      ...word,
      kind: 'word',
      language: 'de',
      ipa: word.preferredIpa,
      resolvable: true,
      pronunciationProvenance: 'writer_v5_preferred',
    };
  }

  const catalogPhrase = exactPhraseQuery(phraseDb, text);
  if (catalogPhrase) return { ...catalogPhrase, resolvable: true };

  return composedPhraseQuery(writerDb, text);
}

function relationRows(score) {
  return ['assonance', 'consonance'].flatMap((type) => {
    const relation = score?.relations?.[type];
    return relation?.matched ? [{
      type,
      strength: relation.strength,
      score: Number(relation.score || 0),
      components: relation.components || null,
    }] : [];
  });
}

function phraseProductResult(candidate) {
  const score = candidate?.score || {};
  const primaryType = PRIMARY_TYPES.has(score.type) ? score.type : null;
  const relations = relationRows(score);
  const commonness = candidate?.rankingEvidence?.leipzig || {};
  const occurrenceSum = Number(commonness.occurrenceSum || 0);

  return {
    resultKind: 'phrase',
    language: 'de',
    resultId: String(candidate.windowId || ''),
    phraseId: candidate.phraseId || null,
    windowId: candidate.windowId || null,
    word: candidate.canonical,
    surface: candidate.canonical,
    normalized: normalizeGerman(candidate.canonical),
    ipa: candidate.candidatePhonemes || '',
    ipaKind: 'matched_mosaic_span',
    syllableCount: Number(candidate.syllableCount || 0),
    syllableDistance: 0,
    score: Number(score.overall || 0),
    type: score.type || 'weak',
    primaryType,
    relationTypes: relations.map((relation) => relation.type),
    relations,
    components: {
      vowel: Number(score.vowel || 0),
      coda: Number(score.coda || 0),
      stress: Number(score.stress || 0),
      syllable: Number(score.syllable || 0),
      onset: Number(score.onset || 0),
      consonance: Number(score.consonance || 0),
    },
    phraseTypes: candidate.phraseTypes || [],
    historical: candidate.historicalState === 'historical_only',
    historicalState: candidate.historicalState || null,
    modernEligible: Boolean(candidate.modernEligible),
    usageRank: null,
    usageCount: occurrenceSum || null,
    usageSourceCount: Number(commonness.corpusCount || 0),
    leipzigCommonness: Number(commonness.equalWeightCommonness || 0),
    lexiconLayer: 'phrase',
    partOfSpeech: 'phrase',
    crossedWordBoundaries: Number(candidate.crossedWordBoundaries || 0),
    startsInsideToken: Boolean(candidate.startsInsideToken),
    endsInsideToken: Boolean(candidate.endsInsideToken),
    retrievalChannels: candidate.retrievalChannels || [],
    queryAnchor: candidate.queryAnchor || null,
    channelRank: Number(candidate.diversifiedPageRank || 0),
    writerPageRank: Number(candidate.writerPageRank || 0),
    diversifiedPageRank: Number(candidate.diversifiedPageRank || 0),
    surfaceSafety: candidate.rankingEvidence?.surfaceSafety || null,
    phraseRankingEvidence: candidate.rankingEvidence || null,
    diversitySuppression: candidate.diversitySuppression || null,
  };
}

function wordProductResult(row) {
  return {
    ...row,
    resultKind: 'word',
    language: row.language || 'de',
    resultId: row.normalized,
    channelRank: Number(row.writerRank || 0),
  };
}

function searchGermanPhraseChannel(phraseDb, query, options = {}) {
  if (!phraseDb) {
    return {
      available: false,
      reason: 'phrase_database_unavailable',
      results: [],
    };
  }
  if (!query?.preferredIpa) {
    return {
      available: true,
      reason: 'query_pronunciation_unresolved',
      results: [],
    };
  }

  const retrieval = retrievePhraseMosaicCandidatesV2(
    phraseDb,
    query.preferredIpa,
    {
      perChannelLimit: clampInteger(options.phrasePerChannelLimit, 128, 1, 512),
      maxCandidates: clampInteger(options.phrasePoolLimit, 512, 1, 2048),
    },
  );
  const enriched = enrichPhraseMosaicCandidates(
    phraseDb,
    query.surface,
    retrieval,
  );
  const ranked = rankPhraseMosaicCandidatesV2(enriched);
  const diversified = diversifyPhraseMosaicWriterPage(ranked);
  const limit = clampInteger(options.phraseLimit, 250, 1, 250);
  const results = diversified.diversifiedWriterPageCandidates
    .slice(0, limit)
    .map(phraseProductResult);

  return {
    available: true,
    reason: null,
    schema: diversified.schema,
    policy: diversified.policy,
    rankingPolicy: ranked.policy,
    retrievalPolicy: retrieval.policy,
    retrieval: retrieval.retrieval,
    rankingFingerprint: ranked.rankingFingerprint,
    diversityFingerprint: diversified.diversityFingerprint,
    candidateCount: ranked.candidateCount,
    writerPageCandidateCount: ranked.writerPageCandidateCount,
    diversifiedWriterPageCandidateCount:
      diversified.diversifiedWriterPageCandidateCount,
    suppressedCandidateCount: diversified.suppressedCandidateCount,
    suppressionReasonCounts: diversified.suppressionReasonCounts,
    results,
  };
}

function languageWarning(code) {
  if (code === 'en') {
    return {
      code: 'english_runtime_unavailable',
      language: 'en',
      message:
        'English is selectable in the unified product contract, but the repository does not yet contain an accepted English phonology/runtime database.',
    };
  }
  return null;
}

export function searchUnifiedWriter(
  { writerDb, phraseDb = null } = {},
  input,
  options = {},
) {
  if (!writerDb) throw new Error('German Writer runtime is unavailable');

  const languageBasis = normalizeUnifiedLanguageBasis(options.language);
  const scope = normalizeUnifiedResultScope(options.scope);
  const capabilities = unifiedWriterCapabilities({ writerDb, phraseDb });
  const requestedLanguages = languageBasis === 'both'
    ? ['de', 'en']
    : [languageBasis];
  const activeLanguages = requestedLanguages.filter(
    (language) => capabilities.languages[language]?.available,
  );
  const unavailableLanguages = requestedLanguages.filter(
    (language) => !capabilities.languages[language]?.available,
  );
  const warnings = unavailableLanguages.map(languageWarning).filter(Boolean);

  if (!activeLanguages.length) {
    return {
      schema: UNIFIED_WRITER_SCHEMA,
      policy: UNIFIED_WRITER_POLICY,
      status: 'language_unavailable',
      input: String(input || ''),
      languageBasis,
      scope,
      capabilities,
      requestedLanguages,
      activeLanguages,
      unavailableLanguages,
      warnings,
      query: null,
      channels: {
        words: { available: false, reason: 'language_unavailable', results: [] },
        phrases: { available: false, reason: 'language_unavailable', results: [] },
      },
      results: [],
    };
  }

  const query = resolveGermanUnifiedQuery(writerDb, phraseDb, input);
  if (!query) {
    return {
      schema: UNIFIED_WRITER_SCHEMA,
      policy: UNIFIED_WRITER_POLICY,
      status: 'query_not_found',
      input: String(input || ''),
      languageBasis,
      scope,
      capabilities,
      requestedLanguages,
      activeLanguages,
      unavailableLanguages,
      warnings,
      query: null,
      channels: {
        words: { available: true, reason: 'query_not_found', results: [] },
        phrases: { available: Boolean(phraseDb), reason: 'query_not_found', results: [] },
      },
      results: [],
    };
  }

  const includeWords = scope !== 'phrases';
  const includePhrases = scope !== 'words';
  let wordChannel = {
    available: true,
    reason: query.kind === 'word' ? null : 'multiword_query_uses_phrase_mosaic_channel',
    results: [],
  };

  if (includeWords && query.kind === 'word') {
    const wordResult = findWriterRhymes(writerDb, query.surface, {
      limit: clampInteger(options.wordLimit, 250, 1, 250),
      poolLimit: clampInteger(options.wordPoolLimit, 800, 50, 800),
      includeVariants: options.includeVariants === true,
      includeHistorical: options.includeHistorical === true,
      type: options.type || 'all',
      ensureTypeCoverage: false,
    });
    wordChannel = wordResult
      ? {
          available: true,
          reason: null,
          rankingPolicy: wordResult.rankingPolicy,
          writerRuntime: wordResult.writerRuntime,
          writerRetrieval: wordResult.writerRetrieval,
          writerMorphology: wordResult.writerMorphology,
          results: wordResult.results.map(wordProductResult),
        }
      : {
          available: true,
          reason: 'query_not_found',
          results: [],
        };
  }

  let phraseChannel = {
    available: false,
    reason: includePhrases ? 'phrase_channel_not_requested' : 'scope_words_only',
    results: [],
  };
  if (includePhrases) {
    const deCapability = capabilities.languages.de;
    phraseChannel = deCapability.phraseMosaic
      ? searchGermanPhraseChannel(phraseDb, query, options)
      : {
          available: false,
          reason: deCapability.phraseReason || 'phrase_runtime_unavailable',
          results: [],
        };
  }

  const wordResults = wordChannel.results || [];
  const phraseResults = phraseChannel.results || [];
  const results = [
    ...wordResults,
    ...phraseResults,
  ];

  return {
    schema: UNIFIED_WRITER_SCHEMA,
    policy: UNIFIED_WRITER_POLICY,
    status: query.resolvable === false ? 'query_pronunciation_unresolved' : 'ok',
    input: String(input || ''),
    languageBasis,
    scope,
    capabilities,
    requestedLanguages,
    activeLanguages,
    unavailableLanguages,
    warnings,
    query,
    ordering: {
      crossChannelCalibration: false,
      default:
        'channel_preserving: frozen single-word Writer order plus accepted Phrase/Mosaic order; UI groups channels instead of comparing uncalibrated numeric scores',
      phraseQuota: false,
    },
    channels: {
      words: wordChannel,
      phrases: phraseChannel,
    },
    counts: {
      words: wordResults.length,
      phrases: phraseResults.length,
      total: results.length,
    },
    results,
  };
}
