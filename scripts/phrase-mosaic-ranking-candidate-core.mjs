import { createHash } from 'node:crypto';

export const PHRASE_MOSAIC_RANKING_CANDIDATE_SCHEMA =
  'rhymelab-phrase-mosaic-ranking-candidate-v1';
export const PHRASE_MOSAIC_RANKING_CANDIDATE_POLICY =
  'de-phrase-writer-utility-v1-candidate';

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

const TYPE_BASE = Object.freeze({
  multisyllabic_perfect: 1.00,
  perfect: 1.00,
  multisyllabic_slant: 0.82,
  family: 0.78,
  slant: 0.65,
  weak: 0.25,
});

const COMMONNESS_LOG_CAP = 6;
const WEIGHTS = Object.freeze({
  phoneticOverall: 0.45,
  matchedSpan: 0.03,
  commonnessBreadth: 0.03,
  commonnessMagnitude: 0.07,
  phraseTypeMax: 0.025,
  queryOverlap: -0.08,
  surfaceMarked: -0.35,
  surfaceRestricted: -0.50,
});

function rounded(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(digits));
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function phraseTypePrior(types) {
  const set = new Set(types || []);
  if (set.has('proverb')) return 0.025;
  if (set.has('idiom')) return 0.020;
  if (set.has('figurative_expression')) return 0.020;
  if (set.has('phrase')) return 0.015;
  return 0;
}

function safetyPenalty(surfaceSafety) {
  if (surfaceSafety?.class === 'restricted') return WEIGHTS.surfaceRestricted;
  if (surfaceSafety?.class === 'marked') return WEIGHTS.surfaceMarked;
  return 0;
}

export function phraseMosaicUtilityComponents(candidate) {
  const evidence = candidate?.rankingEvidence || {};
  const leipzig = evidence.leipzig || {};
  const type = String(candidate?.score?.type || evidence.phoneticType || 'weak');
  const phoneticScore = clamp(candidate?.score?.overall ?? evidence.phoneticScore, 0, 1);
  const matchedSyllables = Math.max(0, Number(evidence.matchedSyllables ?? candidate?.syllableCount ?? 0));
  const corpusCount = Math.max(0, Math.min(3, Number(leipzig.corpusCount || 0)));
  const commonness = Math.max(0, Number(leipzig.equalWeightCommonness || 0));
  const overlapShare = clamp(evidence.queryTokenOverlap?.overlapShare || 0, 0, 1);

  const components = {
    phoneticTypeBase: Number(TYPE_BASE[type] ?? TYPE_BASE.weak),
    phoneticOverall: rounded(WEIGHTS.phoneticOverall * phoneticScore),
    matchedSpan: rounded(WEIGHTS.matchedSpan * Math.min(matchedSyllables, 6) / 6),
    commonnessBreadth: rounded(WEIGHTS.commonnessBreadth * corpusCount / 3),
    commonnessMagnitude: rounded(
      WEIGHTS.commonnessMagnitude * Math.min(commonness, COMMONNESS_LOG_CAP) / COMMONNESS_LOG_CAP,
    ),
    phraseType: rounded(Math.min(WEIGHTS.phraseTypeMax, phraseTypePrior(evidence.phraseTypes))),
    queryOverlap: rounded(WEIGHTS.queryOverlap * overlapShare),
    surfaceSafety: rounded(safetyPenalty(evidence.surfaceSafety)),
  };

  const utility = rounded(Object.values(components).reduce((sum, value) => sum + Number(value || 0), 0));

  return {
    policy: PHRASE_MOSAIC_RANKING_CANDIDATE_POLICY,
    utility,
    components,
  };
}

function compareRanked(a, b) {
  const utilityDelta = Number(b.phraseUtility.utility) - Number(a.phraseUtility.utility);
  if (utilityDelta) return utilityDelta;

  const phoneticDelta = Number(b.score?.overall || 0) - Number(a.score?.overall || 0);
  if (phoneticDelta) return phoneticDelta;

  const commonnessDelta =
    Number(b.rankingEvidence?.leipzig?.equalWeightCommonness || 0)
    - Number(a.rankingEvidence?.leipzig?.equalWeightCommonness || 0);
  if (commonnessDelta) return commonnessDelta;

  const corpusDelta =
    Number(b.rankingEvidence?.leipzig?.corpusCount || 0)
    - Number(a.rankingEvidence?.leipzig?.corpusCount || 0);
  if (corpusDelta) return corpusDelta;

  return String(a.windowId || '').localeCompare(String(b.windowId || ''));
}

export function rankPhraseMosaicCandidates(enrichedResult) {
  const rawCandidates = enrichedResult?.candidates || [];
  const candidates = rawCandidates.map((candidate, index) => ({
    ...candidate,
    rawRank: index + 1,
    phraseUtility: phraseMosaicUtilityComponents(candidate),
  })).sort(compareRanked).map((candidate, index) => ({
    ...candidate,
    candidateRank: index + 1,
  }));

  const rankingFingerprint = sha256(JSON.stringify({
    schema: PHRASE_MOSAIC_RANKING_CANDIDATE_SCHEMA,
    policy: PHRASE_MOSAIC_RANKING_CANDIDATE_POLICY,
    evidenceFingerprint: enrichedResult?.evidenceFingerprint || null,
    ranking: candidates.map((candidate) => ({
      windowId: candidate.windowId,
      phraseId: candidate.phraseId,
      rawRank: candidate.rawRank,
      candidateRank: candidate.candidateRank,
      phoneticType: candidate.score?.type || null,
      phoneticScore: rounded(candidate.score?.overall || 0),
      phraseUtility: candidate.phraseUtility,
    })),
  }));

  return {
    schema: PHRASE_MOSAIC_RANKING_CANDIDATE_SCHEMA,
    policy: PHRASE_MOSAIC_RANKING_CANDIDATE_POLICY,
    evidenceSchema: enrichedResult?.schema || null,
    evidencePolicy: enrichedResult?.policy || null,
    evidenceFingerprint: enrichedResult?.evidenceFingerprint || null,
    candidateCount: candidates.length,
    rankingFingerprint,
    weights: {
      typeBase: TYPE_BASE,
      commonnessLogCap: COMMONNESS_LOG_CAP,
      ...WEIGHTS,
    },
    candidates,
  };
}
