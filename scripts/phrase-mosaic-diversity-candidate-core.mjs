import { createHash } from 'node:crypto';
import {
  phraseMosaicDiversityKeys,
} from './phrase-mosaic-diversity-diagnostics-core.mjs';

export const PHRASE_MOSAIC_DIVERSITY_CANDIDATE_SCHEMA =
  'rhymelab-phrase-mosaic-diversity-candidate-v1';
export const PHRASE_MOSAIC_DIVERSITY_CANDIDATE_POLICY =
  'de-phrase-channel-diversity-v1-candidate';
export const PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP = 3;

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function suppressionDecision(candidate, state) {
  const keys = phraseMosaicDiversityKeys(candidate);

  if (keys.exactCanonical && state.exactCanonical.has(keys.exactCanonical)) {
    return {
      suppressed: true,
      reason: 'exact_canonical_duplicate',
      key: keys.exactCanonical,
      limit: 1,
      keptBefore: 1,
      keptWindowIds: [state.exactCanonical.get(keys.exactCanonical)],
      keys,
    };
  }

  if (keys.normalizedCanonical
    && state.normalizedCanonical.has(keys.normalizedCanonical)) {
    return {
      suppressed: true,
      reason: 'normalized_canonical_duplicate',
      key: keys.normalizedCanonical,
      limit: 1,
      keptBefore: 1,
      keptWindowIds: [state.normalizedCanonical.get(keys.normalizedCanonical)],
      keys,
    };
  }

  if (keys.phraseFamily && state.phraseFamily.has(keys.phraseFamily)) {
    return {
      suppressed: true,
      reason: 'phrase_family_duplicate',
      key: keys.phraseFamily,
      limit: 1,
      keptBefore: 1,
      keptWindowIds: [state.phraseFamily.get(keys.phraseFamily)],
      keys,
    };
  }

  for (const frame of keys.lexicalFrames || []) {
    const kept = state.lexicalFrames.get(frame) || [];
    if (kept.length >= PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP) {
      return {
        suppressed: true,
        reason: 'lexical_frame_cap',
        key: frame,
        limit: PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP,
        keptBefore: kept.length,
        keptWindowIds: [...kept],
        keys,
      };
    }
  }

  return {
    suppressed: false,
    reason: null,
    key: null,
    limit: null,
    keptBefore: null,
    keptWindowIds: [],
    keys,
  };
}

function remember(candidate, decision, state) {
  const windowId = String(candidate?.windowId || '');
  const keys = decision.keys;

  if (keys.exactCanonical && !state.exactCanonical.has(keys.exactCanonical)) {
    state.exactCanonical.set(keys.exactCanonical, windowId);
  }
  if (keys.normalizedCanonical
    && !state.normalizedCanonical.has(keys.normalizedCanonical)) {
    state.normalizedCanonical.set(keys.normalizedCanonical, windowId);
  }
  if (keys.phraseFamily && !state.phraseFamily.has(keys.phraseFamily)) {
    state.phraseFamily.set(keys.phraseFamily, windowId);
  }

  for (const frame of keys.lexicalFrames || []) {
    const kept = state.lexicalFrames.get(frame) || [];
    kept.push(windowId);
    state.lexicalFrames.set(frame, kept);
  }
}

export function diversifyPhraseMosaicWriterPage(rankedResult) {
  const source = Array.isArray(rankedResult?.writerPageCandidates)
    ? rankedResult.writerPageCandidates
    : [];

  const state = {
    exactCanonical: new Map(),
    normalizedCanonical: new Map(),
    phraseFamily: new Map(),
    lexicalFrames: new Map(),
  };

  const annotated = [];
  const diversified = [];
  const suppressionReasonCounts = {};

  for (const candidate of source) {
    const decision = suppressionDecision(candidate, state);

    if (!decision.suppressed) {
      remember(candidate, decision, state);
      const diversifiedPageRank = diversified.length + 1;
      const retained = {
        ...candidate,
        diversifiedPageRank,
        diversitySuppression: decision,
      };
      diversified.push(retained);
      annotated.push(retained);
      continue;
    }

    suppressionReasonCounts[decision.reason] =
      Number(suppressionReasonCounts[decision.reason] || 0) + 1;
    annotated.push({
      ...candidate,
      diversifiedPageRank: null,
      diversitySuppression: decision,
    });
  }

  const rankByWindow = new Map(
    diversified.map((candidate) => [
      String(candidate.windowId || ''),
      candidate.diversifiedPageRank,
    ]),
  );

  const fingerprint = sha256(JSON.stringify({
    schema: PHRASE_MOSAIC_DIVERSITY_CANDIDATE_SCHEMA,
    policy: PHRASE_MOSAIC_DIVERSITY_CANDIDATE_POLICY,
    inputRankingSchema: rankedResult?.schema || null,
    inputRankingPolicy: rankedResult?.policy || null,
    inputRankingFingerprint: rankedResult?.rankingFingerprint || null,
    lexicalFrameCap: PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP,
    lexicalHeadCap: null,
    rows: annotated.map((candidate) => ({
      windowId: candidate.windowId || null,
      phraseId: candidate.phraseId || null,
      writerPageRank: candidate.writerPageRank ?? null,
      diversifiedPageRank: candidate.diversifiedPageRank ?? null,
      suppressed: Boolean(candidate.diversitySuppression?.suppressed),
      reason: candidate.diversitySuppression?.reason || null,
      key: candidate.diversitySuppression?.key || null,
      limit: candidate.diversitySuppression?.limit ?? null,
    })),
  }));

  return {
    schema: PHRASE_MOSAIC_DIVERSITY_CANDIDATE_SCHEMA,
    policy: PHRASE_MOSAIC_DIVERSITY_CANDIDATE_POLICY,
    inputRankingSchema: rankedResult?.schema || null,
    inputRankingPolicy: rankedResult?.policy || null,
    inputRankingFingerprint: rankedResult?.rankingFingerprint || null,
    writerPageCandidateCount: source.length,
    diversifiedWriterPageCandidateCount: diversified.length,
    suppressedCandidateCount: source.length - diversified.length,
    suppressionReasonCounts,
    rules: {
      exactCanonicalCap: 1,
      normalizedCanonicalCap: 1,
      phraseFamilyCap: 1,
      lexicalFrameCap: PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP,
      lexicalHeadCap: null,
      randomized: false,
      preservesInputOrderAmongRetained: true,
    },
    diversityFingerprint: fingerprint,
    candidates: annotated,
    diversifiedWriterPageCandidates: diversified,
    diversifiedRankByWindow: Object.fromEntries(rankByWindow),
  };
}
