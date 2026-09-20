import { performance } from 'node:perf_hooks';
import { getWord } from './local-engine.mjs';
import {
  findWriterRhymes,
  findWriterRhymesFromExternalQuery,
} from './writer-search.mjs';
import { tokenizePhrase } from '../scripts/phrase-catalog-core.mjs';
import { retrievePhraseMosaicCandidatesV2 } from '../scripts/phrase-mosaic-retrieval-v2-core.mjs';
import { enrichPhraseMosaicCandidates } from '../scripts/phrase-mosaic-ranking-evidence-core.mjs';
import { rankPhraseMosaicCandidatesV2 } from '../scripts/phrase-mosaic-ranking-candidate-v2-core.mjs';
import { diversifyPhraseMosaicWriterPage } from '../scripts/phrase-mosaic-diversity-candidate-core.mjs';
import { entityWriterCapabilities, searchEntityRhymes } from './entity-writer-runtime.mjs';
import {
  englishWriterCapabilities,
  getEnglishWord,
  searchEnglishWriter,
  searchEnglishWriterFromExternalQuery,
} from './english-writer-runtime.mjs';
import { getPhonologyProfile } from '../scripts/phonology-profiles.mjs';

export const UNIFIED_WRITER_SCHEMA = 'rhymelab-unified-writer-v1';
export const UNIFIED_WRITER_POLICY = 'de-unified-word-phrase-writer-v1';
export const ACCEPTED_PHRASE_MOSAIC_ANCHOR_FINGERPRINT =
  '9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059';
export const ACCEPTED_PHRASE_MOSAIC_RANKING_POLICY =
  'de-phrase-writer-utility-v2-phonetic-guard-candidate';
export const ACCEPTED_PHRASE_MOSAIC_DIVERSITY_POLICY =
  'de-phrase-channel-diversity-v1-candidate';

const LANGUAGE_BASES = new Set(['de', 'en', 'both']);
const RESULT_SCOPES = new Set(['all', 'words', 'phrases', 'entities']);
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
    return Boolean(
      db.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('table','view') AND name=?").get(name)
      ||db.prepare("SELECT 1 FROM sqlite_temp_schema WHERE type IN ('table','view') AND name=?").get(name)
    );
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

export function normalizeUnifiedResultLanguage(value, fallback = 'de') {
  const normalized = String(value || fallback || 'de').trim().toLocaleLowerCase('en-US');
  return LANGUAGE_BASES.has(normalized) ? normalized : normalizeUnifiedLanguageBasis(fallback);
}

function externalClientQueryDetail(input, language, pronunciation = null) {
  const ipa = String(pronunciation?.ipa || '').trim();
  if (!ipa) return null;
  const profile = getPhonologyProfile(language);
  let analysis;
  try {
    analysis = profile.analyzeIpa(ipa);
  } catch {
    return null;
  }
  const locale = language === 'de' ? 'de-DE' : 'en-US';
  const surface = String(input || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  const normalized = surface.toLocaleLowerCase(locale);
  const tokenCount = tokenizePhrase(surface).length;
  const kind = tokenCount > 1 ? 'phrase' : 'word';
  return {
    kind,
    language,
    surface,
    normalized,
    preferredIpa: ipa,
    ipa,
    syllableCount: Number(analysis.syllableCount || 0),
    primaryStressSyllable: Number(analysis.primaryStressSyllable || 0) || null,
    stressPattern: analysis.stressPattern || null,
    primaryStressSyllables: Number(analysis.primaryStressSyllable || 0)
      ? [Number(analysis.primaryStressSyllable)]
      : [],
    secondaryStressSyllables: (analysis.syllables || [])
      .filter((syllable) => Number(syllable.stressLevel || 0) === 1)
      .map((syllable) => Number(syllable.position)),
    historical: false,
    modernEligible: true,
    lexiconLayer: kind === 'phrase' ? 'user_phrase' : 'generated_query',
    partOfSpeech: kind === 'phrase' ? 'phrase' : null,
    lemma: null,
    tokenCount,
    phraseTypes: kind === 'phrase' ? ['user_query'] : [],
    resolvable: true,
    generatedPronunciation: true,
    pronunciationProvenance: 'client_generated_query_pronunciation',
    queryPronunciation: {
      policy: 'client-total-query-pronunciation-v2',
      generated: true,
      sourceBacked: pronunciation?.sourceBacked === true,
      clientOnly: true,
      method: pronunciation?.method || 'client_unknown',
      components: pronunciation?.components || null,
      language,
      locale,
      networkRequiredForGeneration: false,
      hostExecutableRequired: false,
      persisted: false,
      canonicalLexicalFact: false,
    },
    pronunciations: [{
      ipa,
      preferred: true,
      source: pronunciation?.sourceBacked
        ? 'Client composition from source-backed RhymeLab references'
        : 'Client-generated query pronunciation',
      locale,
      register: null,
      dialect: null,
      generated: true,
    }],
  };
}

export function unifiedWriterCapabilities({
  writerDb = null,
  englishDb = null,
  phraseDb = null,
  entityDb = null,
  generatedOverlay = false,
} = {}) {
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
  const servingPhraseRuntime=
    metaValue(phraseDb,'schema')==='rhymelab-serving-v1'
    &&metaValue(phraseDb,'runtime_status')==='complete'
    &&metaValue(phraseDb,'product_adapter_status')==='complete';
  const phraseAccepted =
    phraseTablesReady
    && (
      servingPhraseRuntime
      || generatedOverlay === true
      || phraseAnchorFingerprint === ACCEPTED_PHRASE_MOSAIC_ANCHOR_FINGERPRINT
    );
  const entityCapability = entityWriterCapabilities(entityDb);

  return {
    schema: 'rhymelab-unified-writer-capabilities-v1',
    languages: {
      de: {
        available: Boolean(writerDb),
        wordWriter: Boolean(writerDb),
        phraseMosaic: Boolean(writerDb && phraseDb && phraseAccepted),
        entityRhymes: Boolean(writerDb && entityCapability.languages?.de?.available),
        entityReason: entityCapability.languages?.de?.reason || entityCapability.reason,
        phraseReason: !phraseDb
          ? 'phrase_database_unavailable'
          : !phraseTablesReady
            ? 'phrase_runtime_tables_missing'
            : phraseAccepted
              ? null
              : 'phrase_runtime_fingerprint_mismatch',
      },
      en: (() => {
        const english = englishWriterCapabilities(englishDb);
        return {
          available: Boolean(english.available),
          wordWriter: Boolean(english.wordWriter),
          phraseMosaic: false,
          entityRhymes: Boolean(
            english.available
            && entityCapability.languages?.en?.available
          ),
          entityReason: entityCapability.languages?.en?.reason || null,
          reason: english.reason,
          runtime: english.productRuntime,
          policy: english.productPolicy,
          qualityCandidate: english.qualityCandidate,
          diversityWeight: english.diversityWeight,
          databaseFingerprint: english.semanticFingerprint,
          publishFingerprint: english.publishFingerprint,
        };
      })(),
    },
    bases: {
      de: Boolean(writerDb),
      en: Boolean(englishDb && englishWriterCapabilities(englishDb).available),
      both: Boolean(writerDb || (englishDb && englishWriterCapabilities(englishDb).available)),
    },
    partialBases: {
      both: Boolean(writerDb) !== Boolean(englishDb && englishWriterCapabilities(englishDb).available),
    },
    phraseAnchorFingerprint,
    acceptedPhraseAnchorFingerprint: ACCEPTED_PHRASE_MOSAIC_ANCHOR_FINGERPRINT,
    entities: entityCapability,
    ...(generatedOverlay?{generatedOverlay:true}:{}),
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
    ...(candidate.generatedPronunciation?{generatedPronunciation:true}:{}),
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

function generatedPhrasePronunciationIds(phraseDb,candidates){
  const ids=[...new Set(
    (candidates||[])
      .map((candidate)=>String(candidate?.phrasePronunciationId||''))
      .filter(Boolean)
  )];
  if(!ids.length)return new Set();
  const out=new Set();
  for(let offset=0;offset<ids.length;offset+=300){
    const batch=ids.slice(offset,offset+300);
    const marks=batch.map(()=>'?').join(',');
    const rows=phraseDb.prepare(`
      SELECT DISTINCT phrase_pronunciation_id
      FROM phrase_pronunciation_token
      WHERE phrase_pronunciation_id IN (${marks})
        AND LOWER(COALESCE(pronunciation_source,'')) LIKE '%espeak%'
    `).all(...batch);
    for(const row of rows)out.add(String(row.phrase_pronunciation_id));
  }
  return out;
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
      generatedOnly:options.generatedOnly===true,
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
  const selected=diversified.diversifiedWriterPageCandidates.slice(0,limit);
  const generatedIds=options.generatedOverlay===true
    ?generatedPhrasePronunciationIds(phraseDb,selected)
    :new Set();
  const results=selected.map((candidate)=>phraseProductResult({
    ...candidate,
    generatedPronunciation:generatedIds.has(String(candidate.phrasePronunciationId||'')),
  }));

  return {
    available: true,
    reason: null,
    schema: diversified.schema,
    policy: diversified.policy,
    rankingPolicy: ranked.policy,
    retrievalPolicy: retrieval.policy,
    retrieval: retrieval.retrieval,
    queryAnchors: retrieval.query?.anchors || [],
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
  {
    writerDb,
    englishDb = null,
    phraseDb = null,
    entityDb = null,
    generatedOverlay = false,
  } = {},
  input,
  options = {},
) {
  if (!writerDb) throw new Error('German Writer runtime is unavailable');

  const profileStages=options.profileStages===true;
  const profileStarted=performance.now();
  const stageTimings={};
  const timed=(name,fn)=>{
    if(!profileStages)return fn();
    const started=performance.now();
    try{return fn();}
    finally{stageTimings[name]=Number((performance.now()-started).toFixed(3));}
  };

  const languageBasis = normalizeUnifiedLanguageBasis(options.language);
  const resultLanguageBasis = normalizeUnifiedResultLanguage(options.resultLanguage, languageBasis);
  const scope = normalizeUnifiedResultScope(options.scope);
  const capabilities = unifiedWriterCapabilities({
    writerDb,
    englishDb,
    phraseDb,
    entityDb,
    generatedOverlay,
  });
  const generatedOnly=options.generatedOnly===true&&generatedOverlay===true;
  const requestedLanguages = languageBasis === 'both'
    ? ['de', 'en']
    : [languageBasis];
  const resultLanguages = resultLanguageBasis === 'both'
    ? ['de', 'en']
    : [resultLanguageBasis];
  const activeLanguages = requestedLanguages.filter(
    (language) => capabilities.languages[language]?.available,
  );
  const unavailableLanguages = requestedLanguages.filter(
    (language) => !capabilities.languages[language]?.available,
  );
  const activeResultLanguages = resultLanguages.filter(
    (language) => capabilities.languages[language]?.available,
  );
  const unavailableResultLanguages = resultLanguages.filter(
    (language) => !capabilities.languages[language]?.available,
  );
  const warnings = [
    ...unavailableLanguages,
    ...unavailableResultLanguages,
  ].filter((language,index,array)=>array.indexOf(language)===index)
    .map(languageWarning).filter(Boolean);

  if (!activeLanguages.length) {
    return {
      schema: UNIFIED_WRITER_SCHEMA,
      policy: UNIFIED_WRITER_POLICY,
      status: 'language_unavailable',
      input: String(input || ''),
      languageBasis,
      resultLanguageBasis,
      scope,
      capabilities,
      requestedLanguages,
      resultLanguages,
      activeLanguages,
      activeResultLanguages,
      unavailableLanguages,
      unavailableResultLanguages,
      resolvedLanguages: [],
      warnings,
      query: null,
      queries: { de: null, en: null },
      channels: {
        words: { available: false, reason: 'language_unavailable', results: [] },
        phrases: { available: false, reason: 'language_unavailable', results: [] },
        entities: { available: false, reason: 'language_unavailable', results: [] },
      },
      results: [],
    };
  }

  const clientPronunciations = options.queryPronunciations || {};
  const sourceDeQuery = requestedLanguages.includes('de') && capabilities.languages.de.available
    ? timed('query_de',()=>resolveGermanUnifiedQuery(writerDb, phraseDb, input))
    : null;
  const sourceEnQuery = requestedLanguages.includes('en') && capabilities.languages.en.available
    ? timed('query_en',()=>getEnglishWord(englishDb, input))
    : null;
  const clientDeQuery = requestedLanguages.includes('de') && capabilities.languages.de.available
    ? externalClientQueryDetail(input, 'de', clientPronunciations.de)
    : null;
  const clientEnQuery = requestedLanguages.includes('en') && capabilities.languages.en.available
    ? externalClientQueryDetail(input, 'en', clientPronunciations.en)
    : null;
  const deQuery = sourceDeQuery?.preferredIpa
    ? sourceDeQuery
    : (clientDeQuery || sourceDeQuery);
  const enQuery = sourceEnQuery?.preferredIpa
    ? sourceEnQuery
    : clientEnQuery;
  const queries = { de: deQuery, en: enQuery };
  const resolvedLanguages = [
    ...(deQuery ? ['de'] : []),
    ...(enQuery ? ['en'] : []),
  ];

  if (!deQuery && !enQuery) {
    return {
      schema: UNIFIED_WRITER_SCHEMA,
      policy: UNIFIED_WRITER_POLICY,
      status: 'query_not_found',
      input: String(input || ''),
      languageBasis,
      resultLanguageBasis,
      scope,
      capabilities,
      requestedLanguages,
      resultLanguages,
      activeLanguages,
      activeResultLanguages,
      unavailableLanguages,
      unavailableResultLanguages,
      resolvedLanguages,
      warnings,
      query: null,
      queries,
      channels: {
        words: { available: true, reason: 'query_not_found', results: [] },
        phrases: { available: Boolean(phraseDb), reason: 'query_not_found', results: [] },
        entities: {
          available: Boolean(capabilities.entities?.multilingualAvailable),
          reason: 'query_not_found',
          results: [],
        },
      },
      results: [],
    };
  }

  const query = languageBasis === 'en'
    ? enQuery
    : languageBasis === 'de'
      ? deQuery
      : (deQuery?.resolvable === false ? (enQuery || deQuery) : (deQuery || enQuery));

  const includeWords = scope === 'all' || scope === 'words';
  const includePhrases = scope === 'all' || scope === 'phrases';
  const includeEntities = scope === 'all' || scope === 'entities';

  const targetGermanWords = resultLanguages.includes('de');
  const targetEnglishWords = resultLanguages.includes('en');

  let deWordChannel = {
    available: Boolean(targetGermanWords && capabilities.languages.de.wordWriter),
    reason: !includeWords
      ? 'scope_excludes_words'
      : !targetGermanWords
        ? 'result_language_excludes_german'
        : (deQuery?.preferredIpa || enQuery?.preferredIpa)
          ? null
          : 'query_not_found',
    results: [],
  };
  if (includeWords && targetGermanWords && capabilities.languages.de.wordWriter) {
    const queryOptions = {
      limit: clampInteger(options.wordLimit, 250, 1, 250),
      poolLimit: clampInteger(options.wordPoolLimit, 800, 50, 800),
      includeVariants: options.includeVariants === true,
      includeHistorical: options.includeHistorical === true,
      type: options.type || 'all',
      ensureTypeCoverage: false,
      generatedOnly,
    };
    const wordResult = timed('words_de',()=>deQuery?.preferredIpa
      ? (
          deQuery.kind === 'word' && !deQuery.generatedPronunciation
            ? findWriterRhymes(writerDb, deQuery.surface, queryOptions)
            : findWriterRhymesFromExternalQuery(writerDb, deQuery, queryOptions)
        )
      : (!deQuery && enQuery?.preferredIpa)
        ? findWriterRhymesFromExternalQuery(writerDb, enQuery, queryOptions)
        : null);
    deWordChannel = wordResult
      ? {
          available: true,
          reason: null,
          rankingPolicy: wordResult.rankingPolicy,
          writerRuntime: wordResult.writerRuntime,
          writerRetrieval: wordResult.writerRetrieval,
          writerMorphology: wordResult.writerMorphology,
          crossLanguageQuery: !deQuery && enQuery ? {
            sourceLanguage: enQuery.language || 'en',
            targetLanguage: 'de',
            sourceIpa: enQuery.preferredIpa || enQuery.ipa,
            policy: 'source-pronunciation-to-target-phonology-v1',
          } : null,
          results: wordResult.results.map(wordProductResult),
        }
      : {
          available: true,
          reason: 'query_pronunciation_not_supported_by_german_profile',
          results: [],
        };
  }

  let enWordChannel = {
    available: Boolean(targetEnglishWords && capabilities.languages.en.wordWriter),
    reason: !includeWords
      ? 'scope_excludes_words'
      : !targetEnglishWords
        ? 'result_language_excludes_english'
        : (enQuery || deQuery?.preferredIpa)
          ? null
          : 'query_not_found',
    results: [],
  };
  if (includeWords && targetEnglishWords && capabilities.languages.en.wordWriter) {
    const englishOptions = {
      limit: clampInteger(options.wordLimit, 250, 1, 250),
      type: options.type || 'all',
      generatedOnly,
    };
    const wordResult = timed('words_en',()=>enQuery
      ? (
          enQuery.generatedPronunciation
            ? searchEnglishWriterFromExternalQuery(englishDb, enQuery, englishOptions)
            : searchEnglishWriter(englishDb, enQuery.surface, englishOptions)
        )
      : deQuery?.preferredIpa
        ? searchEnglishWriterFromExternalQuery(englishDb, deQuery, englishOptions)
        : null);
    enWordChannel = wordResult
      ? {
          available: true,
          reason: null,
          rankingPolicy: wordResult.rankingPolicy,
          rankingEvidencePolicy: wordResult.rankingEvidencePolicy,
          qualityCandidate: wordResult.qualityCandidate,
          diversityWeight: wordResult.diversityWeight,
          writerRuntime: wordResult.writerRuntime,
          writerRetrieval: wordResult.writerRetrieval,
          crossLanguageQuery: wordResult.crossLanguageQuery || null,
          results: wordResult.results,
        }
      : {
          available: true,
          reason: deQuery?.preferredIpa
            ? 'cross_language_query_not_supported_by_english_profile'
            : 'query_not_found',
          results: [],
        };
  }

  const wordResults = [
    ...(deWordChannel.results || []),
    ...(enWordChannel.results || []),
  ].sort((a, b) =>
    Number(a.channelRank || 0) - Number(b.channelRank || 0)
    || (a.language === b.language ? 0 : a.language === 'de' ? -1 : 1)
    || String(a.normalized || '').localeCompare(String(b.normalized || ''), 'en')
  );
  const wordChannel = {
    available: Boolean(deWordChannel.available || enWordChannel.available),
    reason: wordResults.length
      ? null
      : (deWordChannel.reason === enWordChannel.reason
          ? deWordChannel.reason
          : 'no_word_results_for_resolved_language_queries'),
    rankingPolicy: resultLanguageBasis === 'both'
      ? 'language_channel_rank_interleave_no_cross_language_score_calibration'
      : (resultLanguageBasis === 'en'
          ? enWordChannel.rankingPolicy
          : deWordChannel.rankingPolicy),
    byLanguage: {
      de: deWordChannel,
      en: enWordChannel,
    },
    results: wordResults,
  };

  let phraseChannel = {
    available: false,
    reason: includePhrases ? 'phrase_runtime_unavailable' : 'scope_excludes_phrases',
    results: [],
  };
  if (includePhrases) {
    if (!resultLanguages.includes('de')) {
      phraseChannel = {
        available: false,
        reason: requestedLanguages.includes('de')
          ? 'result_language_excludes_german_phrases'
          : 'english_phrase_mosaic_not_implemented',
        results: [],
      };
    } else if (!requestedLanguages.includes('de')) {
      phraseChannel = {
        available: false,
        reason: 'english_phrase_mosaic_not_implemented',
        results: [],
      };
    } else if (!deQuery) {
      phraseChannel = {
        available: Boolean(capabilities.languages.de.phraseMosaic),
        reason: 'german_query_not_found',
        results: [],
      };
    } else {
      const deCapability = capabilities.languages.de;
      phraseChannel = deCapability.phraseMosaic
        ? timed('phrases_de',()=>searchGermanPhraseChannel(phraseDb, deQuery, {
            ...options,
            generatedOverlay,
            generatedOnly,
          }))
        : {
            available: false,
            reason: deCapability.phraseReason || 'phrase_runtime_unavailable',
            results: [],
          };
    }
  }

  const emptyEntityLanguageChannel=(language,reason)=>({
    available:false,
    reason,
    language,
    results:[],
  });
  let deEntityChannel=emptyEntityLanguageChannel(
    'de',
    includeEntities?'german_entity_runtime_unavailable':'scope_excludes_entities',
  );
  let enEntityChannel=emptyEntityLanguageChannel(
    'en',
    includeEntities?'english_entity_runtime_unavailable':'scope_excludes_entities',
  );

  if(includeEntities&&resultLanguages.includes('de')){
    const targetQuery=deQuery||enQuery;
    if(targetQuery&&capabilities.languages.de?.entityRhymes){
      deEntityChannel=timed('entities_de',()=>searchEntityRhymes(entityDb,targetQuery,{
        language:'de',
        category:options.entityCategory||'all',
        type:options.type||'all',
        limit:clampInteger(options.entityLimit,100,1,250),
        poolLimit:clampInteger(options.entityPoolLimit,192,16,512),
        generatedOnly,
      }));
    }else{
      deEntityChannel=emptyEntityLanguageChannel(
        'de',
        (deQuery||enQuery)
          ?capabilities.languages.de?.entityReason||'german_entity_runtime_unavailable'
          :'query_not_found',
      );
    }
  }

  if(includeEntities&&resultLanguages.includes('en')){
    const targetQuery=enQuery||deQuery;
    if(targetQuery&&capabilities.languages.en?.entityRhymes){
      enEntityChannel=timed('entities_en',()=>searchEntityRhymes(entityDb,targetQuery,{
        language:'en',
        category:options.entityCategory||'all',
        type:options.type||'all',
        limit:clampInteger(options.entityLimit,100,1,250),
        poolLimit:clampInteger(options.entityPoolLimit,192,16,512),
        generatedOnly,
      }));
    }else{
      enEntityChannel=emptyEntityLanguageChannel(
        'en',
        (enQuery||deQuery)
          ?capabilities.languages.en?.entityReason||'english_entity_runtime_unavailable'
          :'query_not_found',
      );
    }
  }

  const entityResults=[
    ...(deEntityChannel.results||[]),
    ...(enEntityChannel.results||[]),
  ].sort((a,b)=>
    Number(a.channelRank||0)-Number(b.channelRank||0)
    ||(a.language===b.language?0:a.language==='de'?-1:1)
    ||String(a.normalized||'').localeCompare(String(b.normalized||''),'en')
  );

  const entityChannel={
    available:Boolean(deEntityChannel.available||enEntityChannel.available),
    reason:entityResults.length
      ?null
      :deEntityChannel.reason===enEntityChannel.reason
        ?deEntityChannel.reason
        :'no_entity_results_for_resolved_language_queries',
    policy:'language_local_entity_channels_no_cross_language_score_calibration',
    byLanguage:{
      de:deEntityChannel,
      en:enEntityChannel,
    },
    results:entityResults,
  };

  const phraseResults = phraseChannel.results || [];
  const results = [
    ...wordResults,
    ...phraseResults,
    ...entityResults,
  ];
  const unresolvedGermanPhrase = Boolean(
    deQuery
    && deQuery.resolvable === false
    && !enQuery
  );

  return {
    schema: UNIFIED_WRITER_SCHEMA,
    policy: UNIFIED_WRITER_POLICY,
    status: unresolvedGermanPhrase ? 'query_pronunciation_unresolved' : 'ok',
    input: String(input || ''),
    languageBasis,
    resultLanguageBasis,
    scope,
    generatedOnly,
    capabilities,
    requestedLanguages,
    resultLanguages,
    activeLanguages,
    activeResultLanguages,
    unavailableLanguages,
    unavailableResultLanguages,
    resolvedLanguages,
    warnings,
    query,
    queries,
    ordering: {
      crossChannelCalibration: false,
      crossLanguageCalibration: false,
      default:
        languageBasis === 'both'
          ? 'word results interleave deterministic per-language channel ranks; German Phrase/Mosaic and Entity channels remain separate; no DE/EN numeric score comparison'
          : 'channel-preserving deterministic language-local Writer order; Phrase/Mosaic and Entity channels are not numerically cross-calibrated',
      phraseQuota: false,
    },
    channels: {
      words: wordChannel,
      phrases: phraseChannel,
      entities: entityChannel,
    },
    ...(profileStages?{
      performanceProfile:{
        stages_ms:stageTimings,
        total_ms:Number((performance.now()-profileStarted).toFixed(3)),
      },
    }:{}),
    counts: {
      words: wordResults.length,
      germanWords: deWordChannel.results?.length || 0,
      englishWords: enWordChannel.results?.length || 0,
      phrases: phraseResults.length,
      entities: entityResults.length,
      germanEntities: deEntityChannel.results?.length || 0,
      englishEntities: enEntityChannel.results?.length || 0,
      total: results.length,
      searchPool: {
        germanWords: Number(deWordChannel.writerRetrieval?.mergedCandidates || deWordChannel.results?.length || 0),
        englishWords: Number(enWordChannel.writerRetrieval?.normalizedCandidates || enWordChannel.results?.length || 0),
        phrases: Number(phraseChannel.candidateCount || phraseResults.length || 0),
        germanEntities: Number(deEntityChannel.scoredCandidateCount || deEntityChannel.results?.length || 0),
        englishEntities: Number(enEntityChannel.scoredCandidateCount || enEntityChannel.results?.length || 0),
      },
    },
    results,
  };
}

