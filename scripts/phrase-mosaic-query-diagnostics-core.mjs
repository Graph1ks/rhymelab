import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { getWord } from '../src/local-engine.mjs';
import { retrievePhraseMosaicCandidates } from './phrase-mosaic-retrieval-core.mjs';

export const PHRASE_MOSAIC_QUERY_DIAGNOSTICS_SCHEMA =
  'rhymelab-phrase-mosaic-query-diagnostics-v1';
export const PHRASE_MOSAIC_QUERY_DIAGNOSTICS_POLICY =
  'de-writer-v2-representative-query-diagnostics-v1';

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function increment(map, key) {
  const normalized = String(key ?? 'unknown');
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function objectFromMap(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]), 'en')
  ));
}

function rounded(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function candidateSummary(candidate) {
  return {
    candidatePhonemes: candidate.candidatePhonemes || undefined,
    windowId: candidate.windowId,
    phraseId: candidate.phraseId,
    canonical: candidate.canonical,
    phraseTypes: candidate.phraseTypes,
    historicalState: candidate.historicalState,
    modernEligible: candidate.modernEligible,
    syllableStart: candidate.syllableStart,
    syllableEnd: candidate.syllableEnd,
    syllableCount: candidate.syllableCount,
    tokenStartIndex: candidate.tokenStartIndex,
    tokenEndIndex: candidate.tokenEndIndex,
    crossedWordBoundaries: candidate.crossedWordBoundaries,
    startsInsideToken: candidate.startsInsideToken,
    endsInsideToken: candidate.endsInsideToken,
    retrievalChannels: candidate.retrievalChannels,
    queryAnchor: candidate.queryAnchor,
    score: {
      type: candidate.score.type,
      overall: rounded(candidate.score.overall),
      vowel: rounded(candidate.score.vowel),
      coda: rounded(candidate.score.coda),
      stress: rounded(candidate.score.stress),
      syllable: rounded(candidate.score.syllable),
      onset: rounded(candidate.score.onset),
      consonance: rounded(candidate.score.consonance),
      relationTypes: candidate.score.relationTypes || [],
    },
  };
}

function querySemanticFingerprint(entry) {
  return sha256(JSON.stringify({
    word: entry.word,
    status: entry.status,
    query: entry.query,
    retrieval: entry.retrieval,
    candidateSummary: entry.candidateSummary,
    topCandidates: entry.topCandidates,
  }));
}

export function diagnosePhraseMosaicQuery({
  phraseDb,
  writerDb,
  word,
  phenomena = [],
  perChannelLimit = 128,
  maxCandidates = 512,
  topCandidates = 20,
  retrieveCandidates = retrievePhraseMosaicCandidates,
  retrievalOptions = {},
}) {
  const detail = getWord(writerDb, word);
  if (!detail?.preferredIpa) {
    const entry = {
      word,
      phenomena,
      status: 'missing_writer_query',
      reason: 'no_preferred_writer_v5_pronunciation',
      query: null,
      elapsedMs: 0,
      retrieval: null,
      candidateSummary: null,
      topCandidates: [],
    };
    entry.semanticFingerprint = querySemanticFingerprint(entry);
    return entry;
  }

  const started = performance.now();
  const result = retrieveCandidates(
    phraseDb,
    detail.preferredIpa,
    { perChannelLimit, maxCandidates, ...retrievalOptions },
  );
  const elapsedMs = rounded(performance.now() - started, 1);

  if (!result.query.anchors.length) {
    const entry = {
      word,
      phenomena,
      status: 'no_mosaic_query_anchor',
      reason: Number(result.query.syllableCount || 0) < 2
        ? 'query_below_2_syllable_mosaic_minimum'
        : 'accepted_rhyme_domain_below_2_syllable_mosaic_minimum',
      query: {
        normalized: detail.normalized,
        surface: detail.surface,
        preferredIpa: detail.preferredIpa,
        syllableCount: detail.syllableCount,
        primaryStressSyllable: detail.primaryStressSyllable,
        mosaicAnchors: result.query.anchors,
      },
      elapsedMs,
      retrieval: result.retrieval,
      candidateSummary: {
        returnedCandidates: 0,
        uniqueCanonicalPhrases: 0,
        primaryTypes: {},
        retrievalChannels: {},
        queryAnchorKinds: {},
        relationTypes: {},
        modernEligible: 0,
        historicalOrOther: 0,
        startsInsideToken: 0,
        endsInsideToken: 0,
        multiBoundary: 0,
      },
      topCandidates: [],
    };
    entry.semanticFingerprint = querySemanticFingerprint(entry);
    return entry;
  }

  const primaryTypes = new Map();
  const channels = new Map();
  const anchorKinds = new Map();
  const relations = new Map();
  const canonical = new Set();
  let modernEligible = 0;
  let historicalOrOther = 0;
  let startsInsideToken = 0;
  let endsInsideToken = 0;
  let multiBoundary = 0;

  for (const candidate of result.candidates) {
    canonical.add(candidate.canonical);
    increment(primaryTypes, candidate.score.type);
    for (const channel of candidate.retrievalChannels || []) increment(channels, channel);
    increment(anchorKinds, candidate.queryAnchor?.kind || 'unknown');
    for (const relation of candidate.score.relationTypes || []) increment(relations, relation);
    if (candidate.modernEligible) modernEligible += 1;
    else historicalOrOther += 1;
    if (candidate.startsInsideToken) startsInsideToken += 1;
    if (candidate.endsInsideToken) endsInsideToken += 1;
    if (Number(candidate.crossedWordBoundaries || 0) > 1) multiBoundary += 1;
  }

  const entry = {
    word,
    phenomena,
    status: 'ok',
    reason: null,
    query: {
      normalized: detail.normalized,
      surface: detail.surface,
      preferredIpa: detail.preferredIpa,
      syllableCount: detail.syllableCount,
      primaryStressSyllable: detail.primaryStressSyllable,
      mosaicAnchors: result.query.anchors,
    },
    elapsedMs,
    bounds: result.bounds,
    retrieval: result.retrieval,
    candidateSummary: {
      returnedCandidates: result.candidates.length,
      uniqueCanonicalPhrases: canonical.size,
      primaryTypes: objectFromMap(primaryTypes),
      retrievalChannels: objectFromMap(channels),
      queryAnchorKinds: objectFromMap(anchorKinds),
      relationTypes: objectFromMap(relations),
      modernEligible,
      historicalOrOther,
      startsInsideToken,
      endsInsideToken,
      multiBoundary,
    },
    topCandidates: result.candidates
      .slice(0, Math.max(1, Number(topCandidates) || 20))
      .map(candidateSummary),
  };
  entry.semanticFingerprint = querySemanticFingerprint(entry);
  return entry;
}

export function runPhraseMosaicQueryDiagnostics({
  phraseDb,
  writerDb,
  queries,
  perChannelLimit = 128,
  maxCandidates = 512,
  topCandidates = 20,
  retrieveCandidates = retrievePhraseMosaicCandidates,
  retrievalOptions = {},
  diagnosticSchema = PHRASE_MOSAIC_QUERY_DIAGNOSTICS_SCHEMA,
  diagnosticPolicy = PHRASE_MOSAIC_QUERY_DIAGNOSTICS_POLICY,
}) {
  const results = (queries || []).map((query) =>
    diagnosePhraseMosaicQuery({
      phraseDb,
      writerDb,
      word: typeof query === 'string' ? query : query.word,
      phenomena: typeof query === 'string' ? [] : (query.phenomena || []),
      perChannelLimit,
      maxCandidates,
      topCandidates,
      retrieveCandidates,
      retrievalOptions,
    })
  );

  const statusCounts = new Map();
  const primaryTypes = new Map();
  const channels = new Map();
  let elapsedTotal = 0;
  let elapsedCount = 0;
  let returnedCandidates = 0;
  let weakUnrelatedFiltered = 0;

  for (const entry of results) {
    increment(statusCounts, entry.status);
    if (Number.isFinite(Number(entry.elapsedMs))) {
      elapsedTotal += Number(entry.elapsedMs);
      elapsedCount += 1;
    }
    returnedCandidates += Number(entry.candidateSummary?.returnedCandidates || 0);
    weakUnrelatedFiltered += Number(entry.retrieval?.weakUnrelatedFiltered || 0);
    for (const [key, value] of Object.entries(entry.candidateSummary?.primaryTypes || {})) {
      primaryTypes.set(key, (primaryTypes.get(key) || 0) + Number(value));
    }
    for (const [key, value] of Object.entries(entry.candidateSummary?.retrievalChannels || {})) {
      channels.set(key, (channels.get(key) || 0) + Number(value));
    }
  }

  const semanticFingerprint = sha256(JSON.stringify(
    results.map((entry) => [entry.word, entry.semanticFingerprint]),
  ));

  return {
    schema: diagnosticSchema,
    policy: diagnosticPolicy,
    queryCount: results.length,
    statusCounts: objectFromMap(statusCounts),
    meanElapsedMs: elapsedCount ? rounded(elapsedTotal / elapsedCount, 1) : null,
    totalReturnedCandidates: returnedCandidates,
    totalWeakUnrelatedFiltered: weakUnrelatedFiltered,
    aggregatePrimaryTypes: objectFromMap(primaryTypes),
    aggregateRetrievalChannels: objectFromMap(channels),
    semanticFingerprint,
    queries: results,
  };
}
