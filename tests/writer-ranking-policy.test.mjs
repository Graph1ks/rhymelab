import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WRITER_RANKING_POLICY,
  lexicalOverlapEvidence,
  lexicalRedundancy,
  rankWriterRecommendedResults,
  writerUtilityFeatures,
} from '../src/writer-ranking-policy.mjs';

function row(word, score, extras = {}) {
  return {
    language: 'de',
    word,
    normalized: word.toLocaleLowerCase('de-DE'),
    lemma: word,
    score,
    rhymeTier: 1,
    syllableDistance: 0,
    usageRank: 20000,
    lexicalTags: [],
    primaryType: 'multisyllabic_slant',
    ...extras,
  };
}

const query = {
  language: 'de',
  surface: 'Arbeitsweise',
  normalized: 'arbeitsweise',
  lemma: 'Arbeitsweise',
  usageRank: 15000,
};

test('writer ranking policy is explicit and deterministic', () => {
  assert.equal(WRITER_RANKING_POLICY, 'deterministic_writer_utility_v1');
  const rows = [
    row('Hochzeitsreise', 0.96, { usageRank: 12000 }),
    row('Arbeitszweige', 0.93, { usageRank: 10000 }),
    row('Arbeitsweisen', 0.98, { lemma: 'Arbeitsweise', rhymeTier: 0, primaryType: 'perfect', usageRank: 7000 }),
    row('Notfallbleibe', 0.84, { rhymeTier: 3, primaryType: 'slant', syllableDistance: 1, usageRank: 25000 }),
  ];

  const first = rankWriterRecommendedResults(rows, query, { limit: 4 }).map((item) => item.word);
  const second = rankWriterRecommendedResults(rows, query, { limit: 4 }).map((item) => item.word);
  assert.deepEqual(first, second);
  assert.ok(first.indexOf('Hochzeitsreise') < first.indexOf('Arbeitszweige'));
  assert.ok(first.indexOf('Hochzeitsreise') < first.indexOf('Arbeitsweisen'));
  assert.ok(first.indexOf('Notfallbleibe') < first.indexOf('Arbeitsweisen'));
});

test('same lemma and long shared compound prefix are writer-utility penalties, not phonetic penalties', () => {
  const inflection = row('Arbeitsweisen', 0.99, { lemma: 'Arbeitsweise', rhymeTier: 0, primaryType: 'perfect' });
  const compoundClone = row('Arbeitszweige', 0.94);
  const distinct = row('Hochzeitsreise', 0.94);

  const inflectionEvidence = lexicalOverlapEvidence(query, inflection);
  const cloneEvidence = lexicalOverlapEvidence(query, compoundClone);
  const distinctEvidence = lexicalOverlapEvidence(query, distinct);

  assert.equal(inflectionEvidence.sameLemma, true);
  assert.equal(inflectionEvidence.overlap, 1);
  assert.ok(cloneEvidence.sharedPrefixLength >= 7);
  assert.ok(cloneEvidence.overlap > distinctEvidence.overlap);

  const before = { score: inflection.score, type: inflection.primaryType };
  const writer = writerUtilityFeatures(inflection, query);
  assert.deepEqual({ score: inflection.score, type: inflection.primaryType }, before);
  assert.ok(writer.lexicalPenalty > 0);
});

test('surface redundancy catches repeated productive endings without collapsing ordinary -eise rhyme spelling', () => {
  const denkweise = row('Denkweise', 0.91);
  const vorgehensweise = row('Vorgehensweise', 0.91);
  const hochzeitsreise = row('Hochzeitsreise', 0.91);

  assert.ok(lexicalRedundancy(denkweise, vorgehensweise) >= 0.58);
  assert.ok(lexicalRedundancy(denkweise, hochzeitsreise) < lexicalRedundancy(denkweise, vorgehensweise));
});

test('diversity reranking prevents one lexical construction from consuming the top page', () => {
  const rows = [
    row('Denkweise', 0.94, { usageRank: 9000 }),
    row('Vorgehensweise', 0.945, { usageRank: 8000 }),
    row('Lebensweise', 0.94, { usageRank: 7000 }),
    row('Hochzeitsreise', 0.93, { usageRank: 12000 }),
    row('Notfallbleibe', 0.88, { rhymeTier: 2, primaryType: 'family', usageRank: 18000 }),
  ];

  const ranked = rankWriterRecommendedResults(rows, query, { limit: 5 });
  const topThree = ranked.slice(0, 3).map((item) => item.word.toLocaleLowerCase('de-DE'));
  assert.ok(topThree.includes('hochzeitsreise'));
  assert.ok(topThree.filter((word) => word.endsWith('weise')).length <= 2);
  assert.ok(ranked.every((item, index) => item.writerRank === index + 1));
  assert.ok(ranked.every((item) => item.writer?.policy === WRITER_RANKING_POLICY));
});
