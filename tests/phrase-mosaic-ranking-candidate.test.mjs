import test from 'node:test';
import assert from 'node:assert/strict';
import {
  phraseMosaicUtilityComponents,
  rankPhraseMosaicCandidates,
  PHRASE_MOSAIC_RANKING_CANDIDATE_POLICY,
} from '../scripts/phrase-mosaic-ranking-candidate-core.mjs';

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
      modernEligible: true,
      historicalState: 'current_or_unmarked',
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

test('11E2 candidate keeps perfect phonetics above common but weaker slant evidence', () => {
  const exact = candidate({
    windowId: 'perfect',
    canonical: 'perfect phrase',
    type: 'multisyllabic_perfect',
    score: 1,
    corpusCount: 0,
    commonness: 0,
    phraseTypes: ['idiom', 'phrase'],
    syllables: 3,
  });
  const commonSlant = candidate({
    windowId: 'common-slant',
    canonical: 'common phrase',
    type: 'slant',
    score: 0.78,
    corpusCount: 3,
    commonness: 6,
    phraseTypes: ['idiom', 'phrase'],
    syllables: 3,
  });

  const ranked = rankPhraseMosaicCandidates(enriched([commonSlant, exact]));
  assert.equal(ranked.policy, PHRASE_MOSAIC_RANKING_CANDIDATE_POLICY);
  assert.equal(ranked.candidates[0].windowId, 'perfect');
  assert.ok(
    ranked.candidates[0].phraseUtility.utility
      > ranked.candidates[1].phraseUtility.utility,
  );
});

test('11E2 candidate strongly demotes marked abbreviation-like surfaces', () => {
  const markedStrong = candidate({
    windowId: 'marked',
    canonical: 'K.-o.-Siegen',
    type: 'multisyllabic_slant',
    score: 0.861,
    safety: 'marked',
    syllables: 2,
  });
  const safeSlant = candidate({
    windowId: 'safe',
    canonical: 'jemandem Brief und Siegel geben',
    type: 'slant',
    score: 0.795,
    safety: 'safe',
    phraseTypes: ['idiom', 'phrase'],
    syllables: 2,
  });

  const ranked = rankPhraseMosaicCandidates(enriched([markedStrong, safeSlant]));
  assert.equal(ranked.candidates[0].windowId, 'safe');
  assert.equal(ranked.candidates[0].rawRank, 2);
  assert.equal(ranked.candidates[1].windowId, 'marked');
  assert.equal(ranked.candidates[1].rawRank, 1);
  assert.equal(
    ranked.candidates[1].phraseUtility.components.surfaceSafety,
    -0.35,
  );
});

test('11E2 commonness acts as a bounded bonus between otherwise similar candidates', () => {
  const uncommon = candidate({
    windowId: 'uncommon',
    canonical: 'uncommon',
    type: 'family',
    score: 0.848,
    corpusCount: 0,
    commonness: 0,
  });
  const attested = candidate({
    windowId: 'attested',
    canonical: 'attested',
    type: 'family',
    score: 0.808,
    corpusCount: 3,
    commonness: 2.86,
  });

  const ranked = rankPhraseMosaicCandidates(enriched([uncommon, attested]));
  assert.equal(ranked.candidates[0].windowId, 'attested');
  assert.ok(
    ranked.candidates[0].phraseUtility.components.commonnessBreadth > 0,
  );
  assert.ok(
    ranked.candidates[0].phraseUtility.components.commonnessMagnitude > 0,
  );
});

test('11E2 missing Leipzig evidence is neutral rather than a negative penalty', () => {
  const row = candidate({
    windowId: 'neutral',
    canonical: 'neutral',
    type: 'slant',
    score: 0.7,
    corpusCount: 0,
    commonness: 0,
  });
  const utility = phraseMosaicUtilityComponents(row);

  assert.equal(utility.components.commonnessBreadth, 0);
  assert.equal(utility.components.commonnessMagnitude, 0);
  assert.equal(utility.components.surfaceSafety, 0);
  assert.equal(utility.components.queryOverlap, 0);
});

test('11E2 ranking is deterministic and fingerprints the complete ordered candidate set', () => {
  const rows = [
    candidate({
      windowId: 'b',
      canonical: 'B',
      type: 'slant',
      score: 0.7,
      corpusCount: 1,
      commonness: 0.5,
    }),
    candidate({
      windowId: 'a',
      canonical: 'A',
      type: 'slant',
      score: 0.7,
      corpusCount: 1,
      commonness: 0.5,
    }),
  ];

  const first = rankPhraseMosaicCandidates(enriched(rows));
  const second = rankPhraseMosaicCandidates(enriched(rows));

  assert.equal(first.rankingFingerprint, second.rankingFingerprint);
  assert.deepEqual(
    first.candidates.map((row) => row.windowId),
    ['a', 'b'],
  );
});
