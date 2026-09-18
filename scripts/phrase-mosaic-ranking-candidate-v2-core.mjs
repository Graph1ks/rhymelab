import { createHash } from 'node:crypto';
import {
  phraseMosaicUtilityComponents,
} from './phrase-mosaic-ranking-candidate-core.mjs';

export const PHRASE_MOSAIC_RANKING_V2_SCHEMA =
  'rhymelab-phrase-mosaic-ranking-candidate-v2';
export const PHRASE_MOSAIC_RANKING_V2_POLICY =
  'de-phrase-writer-utility-v2-phonetic-guard-candidate';
export const PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND = 0.02;

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

const RELATION_TIER = Object.freeze({
  multisyllabic_perfect: 0,
  perfect: 0,
  multisyllabic_slant: 1,
  family: 2,
  slant: 3,
  weak: 4,
});

const SAFETY_TIER = Object.freeze({
  safe: 0,
  marked: 1,
  restricted: 2,
});

function rounded(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(digits));
}

function relationTier(candidate) {
  return RELATION_TIER[String(candidate?.score?.type || 'weak')] ?? 9;
}

function safetyTier(candidate) {
  return SAFETY_TIER[String(candidate?.rankingEvidence?.surfaceSafety?.class || 'safe')] ?? 9;
}

function pageEligibility(candidate) {
  const reasons = [];
  const type = String(candidate?.score?.type || 'weak');
  const safety = String(candidate?.rankingEvidence?.surfaceSafety?.class || 'safe');
  const modernEligible = candidate?.rankingEvidence?.modernEligible !== false;

  if (type === 'weak') reasons.push('weak_primary_type');
  if (safety === 'restricted') reasons.push('restricted_surface');
  if (!modernEligible) reasons.push('not_modern_eligible');

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function groupKey(candidate) {
  return [
    pageEligibility(candidate).eligible ? 'eligible' : 'diagnostic_only',
    String(candidate?.rankingEvidence?.surfaceSafety?.class || 'safe'),
    String(candidate?.score?.type || 'weak'),
  ].join('|');
}

function phoneticBand(delta) {
  const normalized = Math.max(0, Number(delta) || 0);
  if (normalized <= PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND) return 0;
  return Math.max(
    1,
    Math.ceil(normalized / PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND) - 1,
  );
}

function comparePrepared(a, b) {
  const eligibleDelta = Number(b.writerPageEligibility.eligible)
    - Number(a.writerPageEligibility.eligible);
  if (eligibleDelta) return eligibleDelta;

  const safetyDelta = a.safetyTier - b.safetyTier;
  if (safetyDelta) return safetyDelta;

  const relationDelta = a.relationTier - b.relationTier;
  if (relationDelta) return relationDelta;

  const bandDelta = a.phoneticBand - b.phoneticBand;
  if (bandDelta) return bandDelta;

  const utilityDelta = Number(b.controlUtility.utility)
    - Number(a.controlUtility.utility);
  if (utilityDelta) return utilityDelta;

  const phoneticDelta = Number(b.score?.overall || 0)
    - Number(a.score?.overall || 0);
  if (phoneticDelta) return phoneticDelta;

  const rawDelta = Number(a.rawRank || 0) - Number(b.rawRank || 0);
  if (rawDelta) return rawDelta;

  return String(a.windowId || '').localeCompare(String(b.windowId || ''));
}

export function rankPhraseMosaicCandidatesV2(enrichedResult) {
  const rawCandidates = enrichedResult?.candidates || [];
  const bestByGroup = new Map();

  for (const candidate of rawCandidates) {
    const key = groupKey(candidate);
    const score = Number(candidate?.score?.overall || 0);
    bestByGroup.set(key, Math.max(score, Number(bestByGroup.get(key) || 0)));
  }

  const candidates = rawCandidates.map((candidate, index) => {
    const key = groupKey(candidate);
    const bestScore = Number(bestByGroup.get(key) || 0);
    const phoneticScore = Number(candidate?.score?.overall || 0);
    const eligibility = pageEligibility(candidate);
    return {
      ...candidate,
      rawRank: index + 1,
      controlUtility: phraseMosaicUtilityComponents(candidate),
      writerPageEligibility: eligibility,
      safetyTier: safetyTier(candidate),
      relationTier: relationTier(candidate),
      groupBestPhoneticScore: rounded(bestScore),
      phoneticDeltaFromGroupBest: rounded(Math.max(0, bestScore - phoneticScore)),
      phoneticBand: phoneticBand(bestScore - phoneticScore),
    };
  }).sort(comparePrepared).map((candidate, index) => ({
    ...candidate,
    candidateRank: index + 1,
  }));

  const writerPageCandidates = candidates
    .filter((candidate) => candidate.writerPageEligibility.eligible)
    .map((candidate, index) => ({
      ...candidate,
      writerPageRank: index + 1,
    }));

  const pageRankByWindow = new Map(
    writerPageCandidates.map((candidate) => [candidate.windowId, candidate.writerPageRank]),
  );
  const candidatesWithPageRank = candidates.map((candidate) => ({
    ...candidate,
    writerPageRank: pageRankByWindow.get(candidate.windowId) || null,
  }));

  const excludedReasonCounts = {};
  for (const candidate of candidatesWithPageRank) {
    for (const reason of candidate.writerPageEligibility.reasons) {
      excludedReasonCounts[reason] = Number(excludedReasonCounts[reason] || 0) + 1;
    }
  }

  const rankingFingerprint = sha256(JSON.stringify({
    schema: PHRASE_MOSAIC_RANKING_V2_SCHEMA,
    policy: PHRASE_MOSAIC_RANKING_V2_POLICY,
    evidenceFingerprint: enrichedResult?.evidenceFingerprint || null,
    phoneticBandWidth: PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND,
    ranking: candidatesWithPageRank.map((candidate) => ({
      windowId: candidate.windowId,
      phraseId: candidate.phraseId,
      rawRank: candidate.rawRank,
      candidateRank: candidate.candidateRank,
      writerPageRank: candidate.writerPageRank,
      writerPageEligibility: candidate.writerPageEligibility,
      safetyTier: candidate.safetyTier,
      relationTier: candidate.relationTier,
      phoneticScore: rounded(candidate.score?.overall || 0),
      groupBestPhoneticScore: candidate.groupBestPhoneticScore,
      phoneticDeltaFromGroupBest: candidate.phoneticDeltaFromGroupBest,
      phoneticBand: candidate.phoneticBand,
      controlUtility: candidate.controlUtility,
    })),
  }));

  return {
    schema: PHRASE_MOSAIC_RANKING_V2_SCHEMA,
    policy: PHRASE_MOSAIC_RANKING_V2_POLICY,
    evidenceSchema: enrichedResult?.schema || null,
    evidencePolicy: enrichedResult?.policy || null,
    evidenceFingerprint: enrichedResult?.evidenceFingerprint || null,
    phoneticBandWidth: PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND,
    candidateCount: candidatesWithPageRank.length,
    writerPageCandidateCount: writerPageCandidates.length,
    diagnosticOnlyCandidateCount:
      candidatesWithPageRank.length - writerPageCandidates.length,
    excludedReasonCounts,
    rankingFingerprint,
    candidates: candidatesWithPageRank,
    writerPageCandidates,
  };
}
