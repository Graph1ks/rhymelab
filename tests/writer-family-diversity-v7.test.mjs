import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WRITER_RANKING_POLICY,
  rankWriterRecommendedResults,
} from '../src/writer-ranking-policy.mjs';

function morphology(familyKey) {
  return familyKey ? { familyKey, status: 'attested_right_head_candidate' } : null;
}

function row(word, extras = {}) {
  return {
    language: 'de',
    word,
    normalized: word.toLocaleLowerCase('de-DE'),
    lemma: word,
    score: 1,
    rhymeTier: 0,
    syllableDistance: 0,
    usageRank: 20000,
    lexicalTags: [],
    primaryType: 'multisyllabic_perfect',
    ...extras,
  };
}

const query = {
  language: 'de',
  surface: 'Arbeitsweise',
  normalized: 'arbeitsweise',
  lemma: 'Arbeitsweise',
  usageRank: 10171,
  writerMorphology: morphology('right:weise'),
};

test('writer v7 separates progressive family diversity from structural redundancy', () => {
  assert.equal(WRITER_RANKING_POLICY, 'deterministic_writer_utility_v7');

  const ranked = rankWriterRecommendedResults([
    row('Pilgerreise', { usageRank: 72076, writerMorphology: morphology('right:reise') }),
    row('Sonderpreise', { usageRank: 54135, writerMorphology: morphology('right:preis') }),
    row('Pauschalreise', { usageRank: 51330, writerMorphology: morphology('right:reise') }),
    row('Hochzeitsreise', { usageRank: 95988, writerMorphology: morphology('right:reise') }),
    row('Krise', {
      score: 0.8645,
      rhymeTier: 1,
      primaryType: 'multisyllabic_slant',
      usageRank: 2140,
      writerMorphology: null,
    }),
  ], query, { limit: 5 });

  const reiseRows = ranked
    .filter((entry) => entry.writerMorphology?.familyKey === 'right:reise')
    .sort((a, b) => a.writerRank - b.writerRank);

  assert.equal(reiseRows.length, 3);
  assert.deepEqual(reiseRows.map((entry) => entry.writer.familyRepeatCount), [0, 1, 2]);
  assert.deepEqual(reiseRows.map((entry) => entry.writer.familyDiversityTierPenalty), [0, 1, 2]);
  assert.ok(reiseRows.every((entry) => entry.writer.structuralDiversityTierPenalty === 0));
  assert.ok(reiseRows.every((entry) => entry.writer.maxStructuralRedundancy === 0));
  assert.equal(reiseRows[1].writer.effectiveTier, 1);
  assert.equal(reiseRows[2].writer.effectiveTier, 2);

  const krise = ranked.find((entry) => entry.word === 'Krise');
  assert.ok(reiseRows[1].writerRank < krise.writerRank);
  assert.ok(krise.writerRank < reiseRows[2].writerRank);
});

test('query-family cheapness remains independent from result-family diversity', () => {
  const ranked = rankWriterRecommendedResults([
    row('stellenweise', { usageRank: 14700, writerMorphology: morphology('right:weise') }),
    row('Sonderpreise', { usageRank: 54135, writerMorphology: morphology('right:preis') }),
  ], query, { limit: 2 });

  const stellenweise = ranked.find((entry) => entry.word === 'stellenweise');
  const sonderpreise = ranked.find((entry) => entry.word === 'Sonderpreise');

  assert.equal(stellenweise.writer.cheapRhymeTierPenalty, 2);
  assert.equal(stellenweise.writer.familyDiversityTierPenalty, 0);
  assert.equal(sonderpreise.writer.cheapRhymeTierPenalty, 0);
  assert.ok(sonderpreise.writerRank < stellenweise.writerRank);
});
