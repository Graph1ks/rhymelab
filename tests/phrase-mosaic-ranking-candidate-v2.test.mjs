import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankPhraseMosaicCandidatesV2,
  PHRASE_MOSAIC_RANKING_V2_POLICY,
  PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND,
} from '../scripts/phrase-mosaic-ranking-candidate-v2-core.mjs';

function candidate({
  windowId,
  canonical,
  type,
  score,
  safety = 'safe',
  corpusCount = 0,
  commonness = 0,
  phraseTypes = ['multiword_lexeme'],
  syllables = 2,
  modernEligible = true,
}) {
  return {
    windowId,
    phraseId: 'phrase-' + windowId,
    canonical,
    syllableCount: syllables,
    score: {
      type,
      overall: score,
      relationTypes: [],
    },
    rankingEvidence: {
      phoneticType: type,
      phoneticScore: score,
      matchedSyllables: syllables,
      crossedWordBoundaries: 1,
      modernEligible,
      historicalState: safety === 'restricted' ? 'historical_only' : 'current_or_unmarked',
      leipzig: {
        corpusCount,
        occurrenceSum: 0,
        sentenceSum: 0,
        equalWeightCommonness: commonness,
      },
      phraseTypes,
      styleTags: [],
      surfaceSafety: { class: safety, reasons: safety === 'safe' ? [] : ['fixture'] },
      queryTokenOverlap: {
        queryTokenCount: 1,
        overlapCount: 0,
        overlapTokens: [],
        overlapShare: 0,
      },
    },
  };
}

function enriched(candidates) {
  return {
    schema: 'rhymelab-phrase-mosaic-ranking-evidence-v1',
    policy: 'de-phrase-ranking-evidence-v1',
    evidenceFingerprint: 'fixture-evidence',
    candidates,
  };
}

test('11E2-v2 commonness cannot cross a material phonetic gap', () => {
  const stronger = candidate({
    windowId: 'stronger',
    canonical: 'stronger',
    type: 'slant',
    score: 0.70,
    corpusCount: 0,
    commonness: 0,
  });
  const commonWeaker = candidate({
    windowId: 'common-weaker',
    canonical: 'common weaker',
    type: 'slant',
    score: 0.622,
    corpusCount: 3,
    commonness: 6,
    phraseTypes: ['idiom', 'phrase'],
  });

  const ranked = rankPhraseMosaicCandidatesV2(enriched([stronger, commonWeaker]));
  assert.equal(ranked.policy, PHRASE_MOSAIC_RANKING_V2_POLICY);
  assert.equal(ranked.writerPageCandidates[0].windowId, 'stronger');
  assert.ok(ranked.candidates.find((row) => row.windowId === 'common-weaker').phoneticBand > 0);
});

test('11E2-v2 commonness can reorder a genuine near-tie', () => {
  const stronger = candidate({
    windowId: 'stronger',
    canonical: 'stronger',
    type: 'family',
    score: 0.848,
    corpusCount: 0,
    commonness: 0,
  });
  const commonNearTie = candidate({
    windowId: 'common-near',
    canonical: 'common near tie',
    type: 'family',
    score: 0.838,
    corpusCount: 3,
    commonness: 3,
  });

  const ranked = rankPhraseMosaicCandidatesV2(enriched([stronger, commonNearTie]));
  assert.equal(PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND, 0.02);
  assert.equal(ranked.writerPageCandidates[0].windowId, 'common-near');
  assert.equal(ranked.writerPageCandidates[0].phoneticBand, 0);
});

test('11E2-v2 relation type remains a hard guard before product evidence', () => {
  const family = candidate({
    windowId: 'family',
    canonical: 'family',
    type: 'family',
    score: 0.78,
    corpusCount: 0,
    commonness: 0,
  });
  const commonSlant = candidate({
    windowId: 'slant',
    canonical: 'common slant',
    type: 'slant',
    score: 0.80,
    corpusCount: 3,
    commonness: 6,
    phraseTypes: ['idiom', 'phrase'],
  });

  const ranked = rankPhraseMosaicCandidatesV2(enriched([commonSlant, family]));
  assert.equal(ranked.writerPageCandidates[0].windowId, 'family');
});

test('11E2-v2 marked surfaces remain diagnostic and strongly demoted', () => {
  const marked = candidate({
    windowId: 'marked',
    canonical: 'K.-o.-Siegen',
    type: 'multisyllabic_slant',
    score: 0.861,
    safety: 'marked',
  });
  const safe = candidate({
    windowId: 'safe',
    canonical: 'Brief und Siegel',
    type: 'slant',
    score: 0.795,
    safety: 'safe',
  });

  const ranked = rankPhraseMosaicCandidatesV2(enriched([marked, safe]));
  assert.equal(ranked.writerPageCandidates[0].windowId, 'safe');
  const markedRow = ranked.candidates.find((row) => row.windowId === 'marked');
  assert.equal(markedRow.writerPageEligibility.eligible, true);
  assert.equal(markedRow.safetyTier, 1);
});

test('11E2-v2 weak candidates remain diagnostic but not Writer-page eligible', () => {
  const weak = candidate({
    windowId: 'weak',
    canonical: 'Heiliger Abende',
    type: 'weak',
    score: 0.52,
  });

  const ranked = rankPhraseMosaicCandidatesV2(enriched([weak]));
  assert.equal(ranked.candidateCount, 1);
  assert.equal(ranked.writerPageCandidateCount, 0);
  assert.equal(ranked.diagnosticOnlyCandidateCount, 1);
  assert.equal(ranked.candidates[0].writerPageRank, null);
  assert.deepEqual(
    ranked.candidates[0].writerPageEligibility.reasons,
    ['weak_primary_type'],
  );
});

test('11E2-v2 restricted historical surfaces are diagnostic-only', () => {
  const restricted = candidate({
    windowId: 'restricted',
    canonical: 'historical phrase',
    type: 'family',
    score: 0.9,
    safety: 'restricted',
    modernEligible: false,
  });

  const ranked = rankPhraseMosaicCandidatesV2(enriched([restricted]));
  assert.equal(ranked.writerPageCandidateCount, 0);
  assert.ok(
    ranked.candidates[0].writerPageEligibility.reasons.includes('restricted_surface'),
  );
  assert.ok(
    ranked.candidates[0].writerPageEligibility.reasons.includes('not_modern_eligible'),
  );
});

test('11E2-v2 is deterministic including page eligibility and guard bands', () => {
  const rows = [
    candidate({
      windowId: 'b',
      canonical: 'B',
      type: 'slant',
      score: 0.70,
      corpusCount: 1,
      commonness: 0.5,
    }),
    candidate({
      windowId: 'a',
      canonical: 'A',
      type: 'slant',
      score: 0.70,
      corpusCount: 1,
      commonness: 0.5,
    }),
  ];

  const first = rankPhraseMosaicCandidatesV2(enriched(rows));
  const second = rankPhraseMosaicCandidatesV2(enriched(rows));

  assert.equal(first.rankingFingerprint, second.rankingFingerprint);
  assert.deepEqual(
    first.writerPageCandidates.map((row) => row.windowId),
    ['b', 'a'],
  );
});
