import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasExplicitRareLexicalEvidence,
  isModernEntityQueryContext,
  lexicalHybridSignals,
  logCommonnessAdjustedScore,
  preservesAcceptedOrderingForPolicy,
  rankLexicalHybridResults,
  relativeCommonnessLog10Delta,
  usageOrderBucket,
  withinQueryCommonnessHorizon,
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

const modernQuery = { lexiconLayer: 'modern', entityKind: 'platform', usageRank: 6849 };
const spotifyQuery = { lexiconLayer: 'modern', entityKind: 'platform', usageRank: 15974 };
const youtubeQuery = { lexiconLayer: 'modern', entityKind: 'platform', usageRank: 4556 };
const tiktokQuery = { lexiconLayer: 'modern', entityKind: 'platform', usageRank: 8510 };
const dictionaryQuery = { lexiconLayer: 'dictionary', usageRank: 210026 };

test('hybrid allows stronger phonetics to win inside the same usage order of magnitude', () => {
  const ranked = rankLexicalHybridResults([
    row('CommonWeak', 1200, 0.701),
    row('Stronger', 8900, 0.799),
  ], 'lexical_hybrid_decade_0_05');
  assert.equal(ranked[0].word, 'Stronger');
});

test('hybrid prevents a much rarer ranked form from crossing commonness decades on score alone', () => {
  const ranked = rankLexicalHybridResults([
    row('Common', 9000, 0.701),
    row('RareStrong', 239014, 0.999),
  ], 'lexical_hybrid_decade_0_05');
  assert.equal(ranked[0].word, 'Common');
  assert.equal(usageOrderBucket(ranked[0]), 3);
  assert.equal(usageOrderBucket(ranked[1]), 5);
});

test('unranked curated modern forms stay ahead of unranked dictionary forms without treating missing rank as rarity', () => {
  const ranked = rankLexicalHybridResults([
    row('DictionaryUnknown', null, 0.99),
    row('ModernUnknown', null, 0.71, { lexiconLayer: 'modern' }),
  ], 'lexical_hybrid_decade_0_05');
  assert.equal(ranked[0].word, 'ModernUnknown');
  assert.equal(lexicalHybridSignals(ranked[0]).usage_evidence_class, 1);
  assert.equal(lexicalHybridSignals(ranked[1]).usage_evidence_class, 2);
});

test('rare guard uses explicit source metadata only inside the same commonness bucket', () => {
  const ranked = rankLexicalHybridResults([
    row('RareTagged', 20000, 0.999, { lexicalTags: ['rare'] }),
    row('Unmarked', 90000, 0.701),
  ], 'lexical_hybrid_decade_rare_guard_0_05');
  assert.equal(hasExplicitRareLexicalEvidence(ranked[1]), true);
  assert.equal(ranked[0].word, 'Unmarked');
});

test('protected primary tiers retain accepted usage-first ordering', () => {
  const ranked = rankLexicalHybridResults([
    row('RareExactStrong', 10000, 0.999, { rhymeTier: 0, primaryType: 'perfect' }),
    row('CommonExact', 10, 0.801, { rhymeTier: 0, primaryType: 'perfect' }),
  ]);
  assert.equal(ranked[0].word, 'CommonExact');
});

test('relation-only rows retain accepted usage-first ordering', () => {
  const ranked = rankLexicalHybridResults([
    row('RelationStrongRare', 10000, 0.999, { rhymeTier: 4, primaryType: null }),
    row('RelationCommon', 10, 0.701, { rhymeTier: 4, primaryType: null }),
  ]);
  assert.equal(ranked[0].word, 'RelationCommon');
});

test('modern entity log policy can reward a large phonetic gain across usage decades', () => {
  const ranked = rankLexicalHybridResults([
    row('kommenden', 727, 0.6193),
    row('schottische', 18824, 0.7981),
  ], 'modern_entity_log_commonness_0_05', spotifyQuery);
  assert.equal(ranked[0].word, 'schottische');
});

test('modern entity log policy blocks a Netflix-style rarer candidate when score gain does not pay the commonness cost', () => {
  const ranked = rankLexicalHybridResults([
    row('Technik', 1104, 0.8618, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
    row('Tschetniks', 440168, 0.9812, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
  ], 'modern_entity_log_commonness_0_05', modernQuery);
  assert.equal(ranked[0].word, 'Technik');
});

test('modern entity log policy keeps same adjusted band TikTok-style candidates usage ordered', () => {
  const ranked = rankLexicalHybridResults([
    row('Rebstock', 118332, 0.8815, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
    row('Trickshot', 987390, 0.9202, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
  ], 'modern_entity_log_commonness_0_05', tiktokQuery);
  assert.equal(ranked[0].word, 'Rebstock');
});

test('dictionary query falls back exactly to accepted usage-first ordering', () => {
  const ranked = rankLexicalHybridResults([
    row('CommonWeak', 300, 0.61),
    row('Stronger', 8000, 0.92),
  ], 'modern_entity_log_commonness_0_05', dictionaryQuery);
  assert.equal(ranked[0].word, 'CommonWeak');
});

test('modern entity contextual policy protects exact tier and relation-only ordering', () => {
  const exact = rankLexicalHybridResults([
    row('RareExact', 10000, 1, { rhymeTier: 0, primaryType: 'perfect' }),
    row('CommonExact', 10, 0.9, { rhymeTier: 0, primaryType: 'perfect' }),
  ], 'modern_entity_log_commonness_0_05', modernQuery);
  assert.equal(exact[0].word, 'CommonExact');

  const relation = rankLexicalHybridResults([
    row('RareRelation', 10000, 0.99, { rhymeTier: 4, primaryType: null }),
    row('CommonRelation', 10, 0.7, { rhymeTier: 4, primaryType: null }),
  ], 'modern_entity_log_commonness_0_05', modernQuery);
  assert.equal(relation[0].word, 'CommonRelation');
});

test('modern entity context and protection contract are explicit', () => {
  assert.equal(isModernEntityQueryContext(modernQuery), true);
  assert.equal(
    preservesAcceptedOrderingForPolicy(
      row('TierOne', 1000, 0.9, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
      'modern_entity_log_commonness_0_05',
      modernQuery,
    ),
    false,
  );
  assert.equal(
    preservesAcceptedOrderingForPolicy(
      row('Dictionary', 1000, 0.9),
      'modern_entity_log_commonness_0_05',
      dictionaryQuery,
    ),
    true,
  );
  assert.ok(logCommonnessAdjustedScore(row('Adjusted', 1000, 0.8), 0.05) < 0.8);
});

test('relative commonness policy lets Spotify-style phonetic gains reorder inside one query-relative decade', () => {
  const ranked = rankLexicalHybridResults([
    row('kommenden', 727, 0.6193),
    row('schottische', 18824, 0.7981),
  ], 'modern_entity_relative_commonness_1decade_0_05', spotifyQuery);
  assert.equal(ranked[0].word, 'schottische');
  assert.equal(withinQueryCommonnessHorizon(ranked[0], spotifyQuery), true);
});

test('relative commonness policy blocks every Netflix-style promotion beyond one query-relative decade', () => {
  const ranked = rankLexicalHybridResults([
    row('Technik', 1104, 0.8618, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
    row('Flashbacks', 86344, 0.912, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
    row('Tschetniks', 440168, 0.9812, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
  ], 'modern_entity_relative_commonness_1decade_0_05', modernQuery);
  assert.deepEqual(ranked.map((item) => item.word), ['Technik', 'Flashbacks', 'Tschetniks']);
  assert.equal(withinQueryCommonnessHorizon(row('Flashbacks', 86344, 0.912), modernQuery), false);
});

test('relative commonness policy does not chase YouTube reviewer gain driven by an extremely rare candidate', () => {
  const ranked = rankLexicalHybridResults([
    row('U-Boot', 15975, 0.8835, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
    row('Toeloop', 982321, 0.9208, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
  ], 'modern_entity_relative_commonness_1decade_0_05', youtubeQuery);
  assert.equal(ranked[0].word, 'U-Boot');
  assert.ok(relativeCommonnessLog10Delta(ranked[1], youtubeQuery) > 2);
});

test('relative commonness policy keeps TikTok distant candidates on usage-first order', () => {
  const ranked = rankLexicalHybridResults([
    row('Rebstock', 118332, 0.8815, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
    row('Flipflop', 198268, 0.8718, { rhymeTier: 1, primaryType: 'multisyllabic_slant' }),
  ], 'modern_entity_relative_commonness_1decade_0_05', tiktokQuery);
  assert.deepEqual(ranked.map((item) => item.word), ['Rebstock', 'Flipflop']);
});

test('relative commonness policy falls back to usage-first when query usage is unknown', () => {
  const unknownQuery = { lexiconLayer: 'modern', usageRank: null };
  const ranked = rankLexicalHybridResults([
    row('CommonWeak', 300, 0.61),
    row('Stronger', 8000, 0.92),
  ], 'modern_entity_relative_commonness_1decade_0_05', unknownQuery);
  assert.equal(ranked[0].word, 'CommonWeak');
});
