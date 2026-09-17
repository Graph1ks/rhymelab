import test from 'node:test';
import assert from 'node:assert/strict';
import { rankWriterRecommendedResults } from '../src/writer-ranking-policy.mjs';

function morphology(familyKey) {
  return familyKey ? { familyKey, status: 'attested_right_head_candidate' } : null;
}

function candidate(index) {
  const families = ['right:reise', 'right:preis', 'right:kreis', 'right:speise', null];
  const familyKey = families[index % families.length];
  const word = `Kandidat${String(index).padStart(3, '0')}${index % 7 === 0 ? 'reise' : 'wort'}`;
  return {
    language: 'de',
    word,
    normalized: word.toLocaleLowerCase('de-DE'),
    lemma: `lemma${index % 17}`,
    score: Number((1 - (index % 23) * 0.013).toFixed(4)),
    rhymeTier: index % 9 === 0 ? 0 : (index % 4) + 1,
    syllableDistance: index % 3,
    usageRank: index % 19 === 0 ? null : 1000 + index * 137,
    lexicalTags: index % 31 === 0 ? ['rare'] : [],
    primaryType: index % 9 === 0 ? 'multisyllabic_perfect' : 'multisyllabic_slant',
    writerMorphology: morphology(familyKey),
  };
}

const query = {
  language: 'de',
  surface: 'Arbeitsweise',
  normalized: 'arbeitsweise',
  lemma: 'Arbeitsweise',
  usageRank: 15000,
  writerMorphology: morphology('right:weise'),
};

test('greedy writer ranking is prefix-stable when selection stops at the requested page', () => {
  const rows = Array.from({ length: 90 }, (_, index) => candidate(index));
  const full = rankWriterRecommendedResults(rows, query, { limit: rows.length });
  const page = rankWriterRecommendedResults(rows, query, { limit: 25 });

  assert.deepEqual(
    page.slice(0, 25),
    full.slice(0, 25),
    'stopping greedy selection at page size must preserve the exact ranked prefix',
  );
});
