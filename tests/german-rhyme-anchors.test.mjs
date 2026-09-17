import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import {
  eligibleGermanRhymeAnchorPositions,
  germanRightEdgeVowelSuffixKeys,
  scoreGermanRhymeAnalysesWithAnchors,
} from '../scripts/german-rhyme-anchors.mjs';

test('German compounds expose explicit secondary-stress right-edge anchors', () => {
  const analysis = analyzeGermanIpa('ˈaʁbaɪ̯t͡sˌvaɪ̯zə');
  assert.deepEqual(eligibleGermanRhymeAnchorPositions(analysis), [1, 3]);
  const keys = germanRightEdgeVowelSuffixKeys(analysis).map((entry) => entry.key);
  assert.ok(keys.includes('aɪ-aɪ-ə'));
  assert.ok(keys.includes('aɪ-ə'));
});

test('Arbeitsweise and Hochzeitsreise become a strong right-edge anchor match', () => {
  const query = analyzeGermanIpa('ˈaʁbaɪ̯t͡sˌvaɪ̯zə');
  const candidate = analyzeGermanIpa('ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə');
  const score = scoreGermanRhymeAnalysesWithAnchors(query, candidate);

  assert.equal(score.anchor.queryPosition, 3);
  assert.equal(score.anchor.candidatePosition, 3);
  assert.equal(score.type, 'multisyllabic_perfect');
  assert.equal(score.overall, 1);
});

test('primary-stress-only words keep the existing scorer behavior', () => {
  const query = analyzeGermanIpa('ˈliːbə');
  const candidate = analyzeGermanIpa('ˈtriːbə');
  const score = scoreGermanRhymeAnalysesWithAnchors(query, candidate);
  assert.equal(score.anchor.queryPosition, 1);
  assert.equal(score.anchor.candidatePosition, 1);
});
