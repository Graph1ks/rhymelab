import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIMARY_SCORE_BAND_WIDTH,
  compareScoreBandResults,
  compareUsageFirstResults,
  primaryScoreBand,
  rankPrimaryResults,
} from '../scripts/ranking-policy-core.mjs';

function row(word, score, usageRank, overrides = {}) {
  return {
    language: 'de',
    word,
    score,
    usageRank,
    rhymeTier: 3,
    syllableDistance: 0,
    ...overrides,
  };
}

test('0.05 score bands preserve usage order inside the same quality band', () => {
  const common = row('Common', 0.851, 10);
  const rare = row('Rare', 0.899, 10000);
  assert.equal(primaryScoreBand(common.score), primaryScoreBand(rare.score));
  assert.ok(compareScoreBandResults(common, rare) < 0);
  assert.deepEqual(rankPrimaryResults([rare, common], 'score_band_0_05').map((item) => item.word), ['Common', 'Rare']);
});

test('0.05 score bands can promote clearly stronger phonetic matches over common weaker matches', () => {
  const commonWeak = row('CommonWeak', 0.649, 10);
  const rareStrong = row('RareStrong', 0.701, 10000);
  assert.notEqual(primaryScoreBand(commonWeak.score), primaryScoreBand(rareStrong.score));
  assert.ok(compareUsageFirstResults(commonWeak, rareStrong) < 0);
  assert.ok(compareScoreBandResults(rareStrong, commonWeak) < 0);
});

test('rhyme tier and syllable distance remain stronger ordering constraints than score bands', () => {
  const betterTier = row('BetterTier', 0.61, 10000, { rhymeTier: 1, syllableDistance: 1 });
  const worseTier = row('WorseTier', 0.99, 1, { rhymeTier: 2, syllableDistance: 0 });
  assert.ok(compareScoreBandResults(betterTier, worseTier) < 0);

  const closer = row('Closer', 0.61, 10000, { rhymeTier: 2, syllableDistance: 0 });
  const farther = row('Farther', 0.99, 1, { rhymeTier: 2, syllableDistance: 1 });
  assert.ok(compareScoreBandResults(closer, farther) < 0);
});

test('missing usage evidence remains behind ranked usage evidence inside a score band', () => {
  const known = row('Known', 0.872, 5000);
  const unknown = row('Unknown', 0.879, null);
  assert.equal(primaryScoreBand(known.score, PRIMARY_SCORE_BAND_WIDTH), primaryScoreBand(unknown.score, PRIMARY_SCORE_BAND_WIDTH));
  assert.ok(compareScoreBandResults(known, unknown) < 0);
});
