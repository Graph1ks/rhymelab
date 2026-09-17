import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIME_RANKING_POLICY,
  rankRuntimeRecommendedResults,
  runtimeWithinQueryCommonnessHorizon,
} from '../src/runtime-ranking-policy.mjs';
import {
  MODERN_ENTITY_RELATIVE_COMMONNESS_POLICY,
  rankLexicalHybridResults,
} from '../scripts/ranking-hybrid-policy-core.mjs';

function row(word, usageRank, score, extras = {}) {
  return {
    language: 'de',
    word,
    usageRank,
    score,
    rhymeTier: 3,
    syllableDistance: 0,
    primaryType: 'slant',
    lexiconLayer: 'dictionary',
    lexicalTags: [],
    ...extras,
  };
}

const spotifyQuery = { lexiconLayer: 'modern', entityKind: 'platform', usageRank: 15974 };
const netflixQuery = { lexiconLayer: 'modern', entityKind: 'platform', usageRank: 6849 };
const dictionaryQuery = { lexiconLayer: 'dictionary', usageRank: 210026 };

function experimentalRank(rows, query) {
  return rankLexicalHybridResults(rows, MODERN_ENTITY_RELATIVE_COMMONNESS_POLICY, query)
    .map((item) => item.word);
}

function runtimeRank(rows, query) {
  return rankRuntimeRecommendedResults(rows, query).map((item) => item.word);
}

test('promoted runtime policy id matches the validated v3 experiment', () => {
  assert.equal(RUNTIME_RANKING_POLICY, MODERN_ENTITY_RELATIVE_COMMONNESS_POLICY);
});

test('runtime ranking reproduces Spotify-style v3 score-band gains inside the relative horizon', () => {
  const rows = [
    row('kommenden', 727, 0.6193),
    row('schottische', 18824, 0.7981),
    row('trockene', 12689, 0.7574),
  ];
  const ranked = runtimeRank(rows, spotifyQuery);
  assert.deepEqual(ranked, experimentalRank(rows, spotifyQuery));
  assert.deepEqual(ranked, ['trockene', 'schottische', 'kommenden']);
  assert.ok(ranked.indexOf('schottische') < ranked.indexOf('kommenden'));
});

test('runtime ranking blocks Netflix-style candidates beyond one query-relative decade', () => {
  const rows = [
    row('Technik', 1104, 0.8618, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
    row('Flashbacks', 86344, 0.912, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
    row('Tschetniks', 440168, 0.9812, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
  ];
  assert.deepEqual(runtimeRank(rows, netflixQuery), experimentalRank(rows, netflixQuery));
  assert.deepEqual(runtimeRank(rows, netflixQuery), ['Technik', 'Flashbacks', 'Tschetniks']);
  assert.equal(runtimeWithinQueryCommonnessHorizon(rows[1], netflixQuery), false);
});

test('runtime ranking preserves accepted usage-first order for dictionary queries', () => {
  const rows = [
    row('CommonWeak', 300, 0.61),
    row('Stronger', 8000, 0.92),
  ];
  assert.deepEqual(runtimeRank(rows, dictionaryQuery), experimentalRank(rows, dictionaryQuery));
  assert.deepEqual(runtimeRank(rows, dictionaryQuery), ['CommonWeak', 'Stronger']);
});

test('runtime ranking preserves tier-0 and relation-only rows', () => {
  const exactRows = [
    row('RareExact', 10000, 1, { rhymeTier: 0, primaryType: 'perfect' }),
    row('CommonExact', 10, 0.9, { rhymeTier: 0, primaryType: 'perfect' }),
  ];
  const relationRows = [
    row('RareRelation', 10000, 0.99, { rhymeTier: 4, primaryType: null }),
    row('CommonRelation', 10, 0.7, { rhymeTier: 4, primaryType: null }),
  ];
  assert.deepEqual(runtimeRank(exactRows, spotifyQuery), experimentalRank(exactRows, spotifyQuery));
  assert.deepEqual(runtimeRank(exactRows, spotifyQuery), ['CommonExact', 'RareExact']);
  assert.deepEqual(runtimeRank(relationRows, spotifyQuery), experimentalRank(relationRows, spotifyQuery));
  assert.deepEqual(runtimeRank(relationRows, spotifyQuery), ['CommonRelation', 'RareRelation']);
});

test('runtime ranking falls back to usage-first for missing query or candidate usage', () => {
  const unknownQuery = { lexiconLayer: 'modern', usageRank: null };
  const queryFallbackRows = [
    row('CommonWeak', 300, 0.61),
    row('Stronger', 8000, 0.92),
  ];
  const candidateFallbackRows = [
    row('Ranked', 300, 0.61),
    row('Unknown', null, 0.99),
  ];
  assert.deepEqual(runtimeRank(queryFallbackRows, unknownQuery), experimentalRank(queryFallbackRows, unknownQuery));
  assert.deepEqual(runtimeRank(queryFallbackRows, unknownQuery), ['CommonWeak', 'Stronger']);
  assert.deepEqual(runtimeRank(candidateFallbackRows, spotifyQuery), experimentalRank(candidateFallbackRows, spotifyQuery));
  assert.deepEqual(runtimeRank(candidateFallbackRows, spotifyQuery), ['Ranked', 'Unknown']);
});

test('runtime rare guard matches the validated v3 comparator inside the horizon', () => {
  const rows = [
    row('RareTagged', 12000, 0.799, { lexicalTags: ['rare'] }),
    row('Unmarked', 15000, 0.751),
  ];
  assert.deepEqual(runtimeRank(rows, spotifyQuery), experimentalRank(rows, spotifyQuery));
  assert.equal(runtimeRank(rows, spotifyQuery)[0], 'Unmarked');
});
