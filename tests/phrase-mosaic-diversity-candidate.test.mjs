import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diversifyPhraseMosaicWriterPage,
  PHRASE_MOSAIC_DIVERSITY_CANDIDATE_POLICY,
  PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP,
} from '../scripts/phrase-mosaic-diversity-candidate-core.mjs';

function row(rank, windowId, phraseId, canonical) {
  return {
    writerPageRank: rank,
    windowId,
    phraseId,
    canonical,
    score: {
      type: 'family',
      overall: 0.8,
    },
  };
}

function ranked(rows) {
  return {
    schema: 'rhymelab-phrase-mosaic-ranking-candidate-v2',
    policy: 'de-phrase-writer-utility-v2-phonetic-guard-candidate',
    rankingFingerprint: 'fixture-ranking',
    writerPageCandidates: rows,
  };
}

test('11E3 candidate collapses exact, normalized and phrase-family duplicates deterministically', () => {
  const input = ranked([
    row(1, 'w1', 'p1', 'bei Seite'),
    row(2, 'w2', 'p2', 'bei Seite'),
    row(3, 'w3', 'p3', 'Bei   Seite'),
    row(4, 'w4', 'p1', 'an anderer Stelle'),
    row(5, 'w5', 'p5', 'freie Reise'),
  ]);
  const before = JSON.stringify(input);
  const result = diversifyPhraseMosaicWriterPage(input);

  assert.equal(result.policy, PHRASE_MOSAIC_DIVERSITY_CANDIDATE_POLICY);
  assert.equal(result.diversifiedWriterPageCandidateCount, 2);
  assert.deepEqual(
    result.diversifiedWriterPageCandidates.map((candidate) => candidate.windowId),
    ['w1', 'w5'],
  );
  assert.deepEqual(result.suppressionReasonCounts, {
    exact_canonical_duplicate: 1,
    normalized_canonical_duplicate: 1,
    phrase_family_duplicate: 1,
  });
  assert.equal(JSON.stringify(input), before);
});

test('11E3 candidate caps an obvious lexical edge frame at three retained rows', () => {
  const rows = [
    row(1, 'w1', 'p1', 'warf beiseite'),
    row(2, 'w2', 'p2', 'nahm beiseite'),
    row(3, 'w3', 'p3', 'schaff beiseite'),
    row(4, 'w4', 'p4', 'warfst beiseite'),
    row(5, 'w5', 'p5', 'lass beiseite'),
    row(6, 'w6', 'p6', 'frei gelassen'),
  ];
  const result = diversifyPhraseMosaicWriterPage(ranked(rows));

  assert.equal(PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP, 3);
  assert.deepEqual(
    result.diversifiedWriterPageCandidates.map((candidate) => candidate.windowId),
    ['w1', 'w2', 'w3', 'w6'],
  );
  assert.equal(result.suppressionReasonCounts.lexical_frame_cap, 2);

  const suppressed = result.candidates.find((candidate) => candidate.windowId === 'w4');
  assert.equal(suppressed.diversitySuppression.reason, 'lexical_frame_cap');
  assert.equal(
    suppressed.diversitySuppression.key,
    'suffix_without_initial_token:beiseite',
  );
  assert.deepEqual(suppressed.diversitySuppression.keptWindowIds, ['w1', 'w2', 'w3']);
});

test('11E3 candidate does not apply a lexical-head cap', () => {
  const rows = [
    row(1, 'w1', 'p1', 'eins alpha sein'),
    row(2, 'w2', 'p2', 'zwei beta sein'),
    row(3, 'w3', 'p3', 'drei gamma sein'),
    row(4, 'w4', 'p4', 'vier delta sein'),
  ];
  const result = diversifyPhraseMosaicWriterPage(ranked(rows));

  assert.equal(result.rules.lexicalHeadCap, null);
  assert.equal(result.suppressedCandidateCount, 0);
  assert.deepEqual(
    result.diversifiedWriterPageCandidates.map((candidate) => candidate.windowId),
    ['w1', 'w2', 'w3', 'w4'],
  );
});

test('11E3 candidate preserves the first protected row inside a repeated frame', () => {
  const rows = [
    row(1, 'protected', 'p1', 'dabei seid'),
    row(2, 'w2', 'p2', 'dabei wart'),
    row(3, 'w3', 'p3', 'dabei wären'),
    row(4, 'w4', 'p4', 'dabei bliebt'),
  ];
  const result = diversifyPhraseMosaicWriterPage(ranked(rows));

  const protectedRow = result.diversifiedWriterPageCandidates
    .find((candidate) => candidate.windowId === 'protected');
  assert.ok(protectedRow);
  assert.equal(protectedRow.writerPageRank, 1);
  assert.equal(protectedRow.diversifiedPageRank, 1);
  assert.equal(protectedRow.diversitySuppression.suppressed, false);

  const fourth = result.candidates.find((candidate) => candidate.windowId === 'w4');
  assert.equal(fourth.diversitySuppression.suppressed, true);
  assert.equal(fourth.diversitySuppression.reason, 'lexical_frame_cap');
});

test('11E3 candidate preserves v2 order among retained rows and is repeatable', () => {
  const input = ranked([
    row(1, 'w3', 'p3', 'warf beiseite'),
    row(2, 'w2', 'p2', 'nahm beiseite'),
    row(3, 'w1', 'p1', 'schaff beiseite'),
    row(4, 'w4', 'p4', 'warfst beiseite'),
    row(5, 'w5', 'p5', 'anderes Ergebnis'),
  ]);
  const first = diversifyPhraseMosaicWriterPage(input);
  const second = diversifyPhraseMosaicWriterPage(input);

  assert.equal(first.diversityFingerprint, second.diversityFingerprint);
  assert.deepEqual(
    first.diversifiedWriterPageCandidates.map((candidate) => candidate.windowId),
    ['w3', 'w2', 'w1', 'w5'],
  );
  assert.deepEqual(
    first.diversifiedWriterPageCandidates.map((candidate) => candidate.diversifiedPageRank),
    [1, 2, 3, 4],
  );
});
