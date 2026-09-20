import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTITY_PHONETIC_BAND_WIDTH,
  ENTITY_WRITER_RANKING_POLICY,
  entityPhoneticBand,
  entityRankingGuardViolations,
  rankAndDiversifyEntityRows,
} from '../src/entity-writer-ranking.mjs';

function row(overrides = {}) {
  return {
    rhymeTier: 0,
    score: 0.95,
    syllableDistance: 0,
    selectedCategory: { percentile: 0.5 },
    popularityPercentile: 0.5,
    popularityScore: 10,
    namePreferred: true,
    surface: 'Example',
    normalized: 'example',
    language: 'en',
    entityQid: 'Q1',
    ...overrides,
  };
}

test('Entity Writer ranking uses stable phonetic bands', () => {
  assert.equal(ENTITY_PHONETIC_BAND_WIDTH, 0.02);
  assert.equal(entityPhoneticBand(1), 0);
  assert.equal(entityPhoneticBand(0.991), 0);
  assert.equal(entityPhoneticBand(0.979), 1);
});

test('materially stronger phonetics outrank prominence', () => {
  const strong = row({
    entityQid: 'Qstrong',
    surface: 'Strong',
    normalized: 'strong',
    score: 0.96,
    popularityScore: 1,
    selectedCategory: { percentile: 0.01 },
  });
  const famousWeak = row({
    entityQid: 'Qfamous',
    surface: 'Famous',
    normalized: 'famous',
    score: 0.90,
    popularityScore: 999999,
    selectedCategory: { percentile: 1 },
  });
  const ranked = rankAndDiversifyEntityRows([famousWeak, strong], { limit: 10 });
  assert.equal(ranked.policy, ENTITY_WRITER_RANKING_POLICY);
  assert.equal(ranked.results[0].entityQid, 'Qstrong');
  assert.deepEqual(ranked.guardViolations, []);
});

test('prominence may reorder only inside the same guarded phonetic neighborhood', () => {
  const betterSound = row({
    entityQid: 'Qbetter',
    surface: 'Better',
    normalized: 'better',
    score: 0.931,
    popularityScore: 1,
    selectedCategory: { percentile: 0.05 },
  });
  const nearTieFamous = row({
    entityQid: 'Qfamous',
    surface: 'Famous',
    normalized: 'famous',
    score: 0.929,
    popularityScore: 1000,
    selectedCategory: { percentile: 0.99 },
  });
  assert.equal(entityPhoneticBand(betterSound.score), entityPhoneticBand(nearTieFamous.score));
  const ranked = rankAndDiversifyEntityRows([betterSound, nearTieFamous], { limit: 10 });
  assert.equal(ranked.results[0].entityQid, 'Qfamous');
  assert.deepEqual(entityRankingGuardViolations(ranked.results), []);
});

test('syllable distance remains ahead of prominence inside a phonetic band', () => {
  const closeSyllables = row({
    entityQid: 'Qclose',
    surface: 'Close',
    normalized: 'close',
    score: 0.931,
    syllableDistance: 0,
    popularityScore: 1,
    selectedCategory: { percentile: 0.01 },
  });
  const famousFar = row({
    entityQid: 'Qfar',
    surface: 'Far',
    normalized: 'far',
    score: 0.929,
    syllableDistance: 2,
    popularityScore: 9999,
    selectedCategory: { percentile: 1 },
  });
  const ranked = rankAndDiversifyEntityRows([famousFar, closeSyllables], { limit: 10 });
  assert.equal(ranked.results[0].entityQid, 'Qclose');
});

test('Entity Writer returns one row per surface and retains same-surface identities as metadata', () => {
  const ranked = rankAndDiversifyEntityRows([
    row({
      entityQid: 'Q1', normalized: 'same', surface: 'Same', score: 0.95,
      primaryCategory:'person.singer',
      entityCategories:[{category:'person.singer'}],
      ipa:'seɪm',locale:'en-US',
    }),
    row({ entityQid: 'Q1', normalized: 'alias', surface: 'Alias', score: 0.949 }),
    row({
      entityQid: 'Q2', normalized: 'same', surface: 'Same', score: 0.948,
      primaryCategory:'work.video_game',
      entityCategories:[{category:'work.video_game'}],
      ipa:'seɪm',locale:'en-US',
    }),
    row({ entityQid: 'Q3', normalized: 'same', surface: 'Same', score: 0.947 }),
  ], { limit: 10 });

  assert.deepEqual(ranked.results.map((item) => item.entityQid), ['Q1']);
  assert.deepEqual(ranked.results[0].entityQids,['Q1','Q2','Q3']);
  assert.deepEqual(
    ranked.results[0].entityCategories.map((entry)=>entry.category),
    ['person.singer','work.video_game'],
  );
  assert.equal(ranked.results[0].mergedEntityCount,3);
  assert.equal(ranked.suppressionReasonCounts.duplicate_entity_qid, 1);
  assert.equal(ranked.suppressionReasonCounts.repeated_surface_cap, 2);
});
