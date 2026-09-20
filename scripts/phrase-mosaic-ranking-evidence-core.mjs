import { createHash } from 'node:crypto';
import { tokenizePhrase } from './phrase-catalog-core.mjs';

export const PHRASE_MOSAIC_RANKING_EVIDENCE_SCHEMA =
  'rhymelab-phrase-mosaic-ranking-evidence-v1';
export const PHRASE_MOSAIC_RANKING_EVIDENCE_POLICY =
  'de-phrase-ranking-evidence-v1';

export const PHRASE_MOSAIC_GENERAL_COMMONNESS_CORPORA = Object.freeze([
  'deu_news_2024_1M',
  'deu_wikipedia_2021_1M',
  'deu-de_web_2021_1M',
]);

const LEIPZIG_POLICY = 'leipzig-exact-token-sequence-v1';
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function rounded(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(digits));
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortedUnique(values) {
  return [...new Set((values || []).map((value) => String(value || '')).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'de'));
}

export function classifyPhraseSurfaceSafety(
  canonical,
  { historicalState = 'current_or_unmarked', modernEligible = true } = {},
) {
  const surface = String(canonical || '').normalize('NFKC');
  const reasons = [];

  if (!modernEligible || historicalState === 'historical_only') {
    reasons.push('historical_only');
  }
  if (/\p{N}/u.test(surface)) reasons.push('digit_bearing');
  if (/(?:\p{L}\.(?:[-–—]?)){2,}/u.test(surface)) {
    reasons.push('dotted_single_letter_sequence');
  }

  const lexicalTokens = tokenizePhrase(surface);
  const singleLetterTokens = lexicalTokens.filter(
    (token) => [...token.surface].length === 1 && /\p{L}/u.test(token.surface),
  ).length;
  if (singleLetterTokens >= 2) reasons.push('multiple_single_letter_tokens');

  const punctuationCount = [...surface].filter(
    (character) => /[^\p{L}\p{N}\s'’\-]/u.test(character),
  ).length;
  const compactLength = [...surface].filter((character) => !/\s/u.test(character)).length;
  if (punctuationCount >= 2 && compactLength > 0 && punctuationCount / compactLength >= 0.15) {
    reasons.push('punctuation_heavy');
  }

  const uniqueReasons = sortedUnique(reasons);
  return {
    class: uniqueReasons.includes('historical_only')
      ? 'restricted'
      : (uniqueReasons.length ? 'marked' : 'safe'),
    reasons: uniqueReasons,
  };
}

export function normalizedTokenOverlap(querySurface, candidateSurface) {
  const queryTokens = sortedUnique(
    tokenizePhrase(querySurface).map((token) => token.normalized),
  );
  const candidateTokens = new Set(
    tokenizePhrase(candidateSurface).map((token) => token.normalized),
  );
  const overlapTokens = queryTokens.filter((token) => candidateTokens.has(token));
  return {
    queryTokenCount: queryTokens.length,
    overlapCount: overlapTokens.length,
    overlapTokens,
    overlapShare: queryTokens.length
      ? rounded(overlapTokens.length / queryTokens.length, 6)
      : 0,
  };
}

function commonnessFromRows(rows) {
  const byCorpus = new Map(
    (rows || []).map((row) => [String(row.snapshot_label), row]),
  );
  let occurrenceSum = 0;
  let sentenceSum = 0;
  let corpusCount = 0;
  let logRateSum = 0;
  const corpora = {};

  for (const corpus of PHRASE_MOSAIC_GENERAL_COMMONNESS_CORPORA) {
    const row = byCorpus.get(corpus);
    const occurrenceCount = Number(row?.occurrence_count || 0);
    const sentenceCount = Number(row?.sentence_count || 0);
    const perMillionTokens = Number(row?.per_million_tokens || 0);
    const perMillionSentences = Number(row?.per_million_sentences || 0);
    const matched = Boolean(row);

    if (matched) corpusCount += 1;
    occurrenceSum += occurrenceCount;
    sentenceSum += sentenceCount;
    logRateSum += Math.log1p(Math.max(0, perMillionSentences));
    corpora[corpus] = {
      matched,
      occurrenceCount,
      sentenceCount,
      perMillionTokens: rounded(perMillionTokens),
      perMillionSentences: rounded(perMillionSentences),
    };
  }

  return {
    policy: 'leipzig-equal-weight-log1p-per-million-sentences-v1',
    corpusCount,
    occurrenceSum,
    sentenceSum,
    equalWeightCommonness: rounded(
      logRateSum / PHRASE_MOSAIC_GENERAL_COMMONNESS_CORPORA.length,
    ),
    corpora,
  };
}

export function createPhraseRankingEvidenceResolver(db) {
  let serving=false;
  try{
    serving=
      db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value==='rhymelab-serving-v1'
      &&db.prepare("SELECT value FROM meta WHERE key='product_adapter_status'").get()?.value==='complete';
  }catch{}

  const usage = serving
    ?db.prepare([
      'SELECT snapshot_label,occurrence_count,sentence_count,',
      'per_million_tokens,per_million_sentences',
      ' FROM runtime_phrase_usage',
      ' WHERE runtime_phrase_id=?',
      ' ORDER BY snapshot_label',
    ].join(''))
    :db.prepare([
      'SELECT s.snapshot_label,u.occurrence_count,u.sentence_count,',
      'u.per_million_tokens,u.per_million_sentences',
      ' FROM phrase_usage_evidence u',
      ' JOIN phrase_snapshot s ON s.snapshot_id=u.snapshot_id',
      ' WHERE u.phrase_id=? AND u.policy=?',
      ' AND s.snapshot_label IN (?,?,?)',
      ' ORDER BY s.snapshot_label',
    ].join(''));

  const attestations = serving
    ?db.prepare([
      'SELECT style_tags_json FROM runtime_phrase_attestation',
      ' WHERE runtime_phrase_id=? ORDER BY ordinal',
    ].join(''))
    :db.prepare([
      'SELECT style_tags_json FROM phrase_attestation',
      ' WHERE phrase_id=? ORDER BY attestation_id',
    ].join(''));

  const cache = new Map();

  return (phraseId,runtimePhraseId=null) => {
    const lookupId=serving?Number(runtimePhraseId||0):String(phraseId||'');
    const key=(serving?'runtime:':'phrase:')+String(lookupId);
    const existing = cache.get(key);
    if (existing) return existing;

    const usageRows = serving
      ?usage.all(lookupId)
      :usage.all(
        lookupId,
        LEIPZIG_POLICY,
        ...PHRASE_MOSAIC_GENERAL_COMMONNESS_CORPORA,
      );
    const styleTags = sortedUnique(
      attestations.all(lookupId).flatMap((row) => parseArray(row.style_tags_json)),
    );

    const evidence = {
      commonness: commonnessFromRows(usageRows),
      styleTags,
    };
    cache.set(key, evidence);
    return evidence;
  };
}

export function enrichPhraseMosaicCandidates(db, querySurface, retrievalResult) {
  const resolvePhrase = createPhraseRankingEvidenceResolver(db);
  const candidates = (retrievalResult?.candidates || []).map((candidate) => {
    const phraseEvidence = resolvePhrase(candidate.phraseId,candidate.runtimePhraseId);
    const surfaceSafety = classifyPhraseSurfaceSafety(candidate.canonical, {
      historicalState: candidate.historicalState,
      modernEligible: candidate.modernEligible,
    });
    const queryOverlap = normalizedTokenOverlap(querySurface, candidate.canonical);

    return {
      ...candidate,
      rankingEvidence: {
        phoneticType: candidate.score?.type || null,
        phoneticScore: rounded(candidate.score?.overall || 0),
        matchedSyllables: Number(candidate.syllableCount || 0),
        crossedWordBoundaries: Number(candidate.crossedWordBoundaries || 0),
        modernEligible: Boolean(candidate.modernEligible),
        historicalState: candidate.historicalState || null,
        leipzig: phraseEvidence.commonness,
        phraseTypes: sortedUnique(candidate.phraseTypes || []),
        styleTags: phraseEvidence.styleTags,
        surfaceSafety,
        queryTokenOverlap: queryOverlap,
      },
    };
  });

  const evidenceFingerprint = sha256(JSON.stringify({
    schema: PHRASE_MOSAIC_RANKING_EVIDENCE_SCHEMA,
    policy: PHRASE_MOSAIC_RANKING_EVIDENCE_POLICY,
    querySurface: String(querySurface || '').normalize('NFKC'),
    retrievalSchema: retrievalResult?.schema || null,
    retrievalPolicy: retrievalResult?.policy || null,
    candidates: candidates.map((candidate) => ({
      windowId: candidate.windowId,
      phraseId: candidate.phraseId,
      score: candidate.score,
      rankingEvidence: candidate.rankingEvidence,
    })),
  }));

  return {
    schema: PHRASE_MOSAIC_RANKING_EVIDENCE_SCHEMA,
    policy: PHRASE_MOSAIC_RANKING_EVIDENCE_POLICY,
    querySurface: String(querySurface || ''),
    retrievalSchema: retrievalResult?.schema || null,
    retrievalPolicy: retrievalResult?.policy || null,
    retrievalCandidateCount: candidates.length,
    rankingImplemented: false,
    evidenceFingerprint,
    candidates,
  };
}
