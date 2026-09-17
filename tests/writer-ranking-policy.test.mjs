import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WRITER_RANKING_POLICY,
  lexicalOverlapEvidence,
  lexicalRedundancy,
  rankWriterRecommendedResults,
  writerUtilityFeatures,
} from '../src/writer-ranking-policy.mjs';

function morphology(familyKey) {
  return familyKey ? { familyKey, status: 'attested_right_head_candidate' } : null;
}

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
  writerMorphology: morphology('right:weise'),
};

test('writer ranking policy is explicit and deterministic', () => {
  assert.equal(WRITER_RANKING_POLICY, 'deterministic_writer_utility_v5');
  const rows = [
    row('Hochzeitsreise', 0.96, { usageRank: 12000, writerMorphology: morphology('right:reise') }),
    row('Arbeitszweige', 0.93, { usageRank: 10000, writerMorphology: morphology('right:zweige') }),
    row('Arbeitsweisen', 0.98, { lemma: 'Arbeitsweise', rhymeTier: 0, primaryType: 'perfect', usageRank: 7000 }),
    row('Notfallbleibe', 0.84, { rhymeTier: 3, primaryType: 'slant', syllableDistance: 1, usageRank: 25000 }),
  ];

  const first = rankWriterRecommendedResults(rows, query, { limit: 4 }).map((item) => item.word);
  const second = rankWriterRecommendedResults(rows, query, { limit: 4 }).map((item) => item.word);
  assert.deepEqual(first, second);
  assert.ok(first.indexOf('Hochzeitsreise') < first.indexOf('Arbeitszweige'));
  assert.ok(first.indexOf('Hochzeitsreise') < first.indexOf('Arbeitsweisen'));
});

test('same lemma and long shared compound prefix are writer penalties, not phonetic penalties', () => {
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
  assert.equal(writer.cheapRhymeTierPenalty, 3);
});

test('same attested right-head family is a writer penalty without changing phonetic truth', () => {
  const sameFamily = row('stellenweise', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    writerMorphology: morphology('right:weise'),
  });
  const differentFamily = row('Hochzeitsreise', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    writerMorphology: morphology('right:reise'),
  });

  const evidence = lexicalOverlapEvidence(query, sameFamily);
  assert.equal(evidence.sameMorphologyFamily, true);
  assert.equal(writerUtilityFeatures(sameFamily, query).cheapRhymeTierPenalty, 2);
  assert.equal(writerUtilityFeatures(differentFamily, query).cheapRhymeTierPenalty, 0);
  assert.equal(sameFamily.score, 1);
  assert.equal(sameFamily.primaryType, 'multisyllabic_perfect');
});

test('rhyme suffix spelling alone is not result redundancy', () => {
  const hochzeitsreise = row('Hochzeitsreise', 1, { writerMorphology: morphology('right:reise') });
  const sonderpreise = row('Sonderpreise', 1, { writerMorphology: morphology('right:preis') });
  const vorspeise = row('Vorspeise', 1, { writerMorphology: morphology('right:speise') });

  assert.equal(lexicalRedundancy(hochzeitsreise, sonderpreise), 0);
  assert.equal(lexicalRedundancy(hochzeitsreise, vorspeise), 0);
});

test('same morphology family is strong result-set redundancy', () => {
  const pilgerreise = row('Pilgerreise', 1, { writerMorphology: morphology('right:reise') });
  const pauschalreise = row('Pauschalreise', 1, { writerMorphology: morphology('right:reise') });
  const sonderpreise = row('Sonderpreise', 1, { writerMorphology: morphology('right:preis') });

  assert.equal(lexicalRedundancy(pilgerreise, pauschalreise), 0.92);
  assert.equal(lexicalRedundancy(pilgerreise, sonderpreise), 0);
});

test('shared lexical stems remain valid redundancy evidence', () => {
  const arbeitsreise = row('Arbeitsreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect' });
  const arbeitskreise = row('Arbeitskreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect' });
  const hochzeitsreise = row('Hochzeitsreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect' });

  assert.ok(lexicalRedundancy(arbeitsreise, arbeitskreise) >= 0.58);
  assert.equal(lexicalRedundancy(arbeitsreise, hochzeitsreise), 0);
});

test('phonetic tier gate stops unrelated slants from beating available family rhymes on commonness alone', () => {
  const rows = [
    row('Wartezeiten', 0.80, { rhymeTier: 2, primaryType: 'family', usageRank: 9000 }),
    row('jahrelange', 0.90, { rhymeTier: 3, primaryType: 'slant', usageRank: 1 }),
    row('Fragezeichen', 0.88, { rhymeTier: 3, primaryType: 'slant', usageRank: 2 }),
  ];

  const ranked = rankWriterRecommendedResults(rows, query, { limit: 3 });
  assert.equal(ranked[0].word, 'Wartezeiten');
  assert.equal(ranked[0].writer.effectiveTier, 2);
  assert.ok(ranked.slice(1).every((item) => item.writer.effectiveTier >= 3));
});

test('unranked and very-low-usage exact rhymes receive a conservative writer safety tier', () => {
  const commonExact = row('Sonderpreise', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: 54135,
  });
  const unknownExact = row('spiebe', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: null,
  });
  const veryLowExact = row('umschweben', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: 994833,
  });
  const commonSlant = row('Krise', 0.86, {
    rhymeTier: 1,
    primaryType: 'multisyllabic_slant',
    usageRank: 2140,
  });

  const unknownFeatures = writerUtilityFeatures(unknownExact, query);
  const veryLowFeatures = writerUtilityFeatures(veryLowExact, query);
  assert.equal(unknownFeatures.lexicalSafety.state, 'unranked_unknown');
  assert.equal(unknownFeatures.lexicalSafetyTierPenalty, 1);
  assert.equal(veryLowFeatures.lexicalSafety.state, 'very_low_measured_usage');
  assert.equal(veryLowFeatures.lexicalSafetyTierPenalty, 1);

  const ranked = rankWriterRecommendedResults(
    [unknownExact, veryLowExact, commonSlant, commonExact],
    query,
    { limit: 4 },
  );
  assert.equal(ranked[0].word, 'Sonderpreise');
  assert.ok(ranked.findIndex((item) => item.word === 'Krise') < ranked.findIndex((item) => item.word === 'spiebe'));
  assert.ok(ranked.findIndex((item) => item.word === 'Krise') < ranked.findIndex((item) => item.word === 'umschweben'));
});

test('explicit rare or historical lexical evidence receives stronger safety demotion than unknown usage', () => {
  const rareExact = row('RareForm', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: 10000,
    lexicalTags: ['rare'],
  });
  const unknownExact = row('UnknownForm', 1, {
    rhymeTier: 0,
    primaryType: 'multisyllabic_perfect',
    usageRank: null,
  });

  const rare = writerUtilityFeatures(rareExact, query);
  const unknown = writerUtilityFeatures(unknownExact, query);
  assert.equal(rare.lexicalSafety.state, 'explicit_rare_or_historical');
  assert.equal(rare.lexicalSafetyTierPenalty, 2);
  assert.equal(unknown.lexicalSafetyTierPenalty, 1);
});

test('family diversity rotates exact rhyme heads before repeating one family', () => {
  const rows = [
    row('Pilgerreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', usageRank: 9000, writerMorphology: morphology('right:reise') }),
    row('Pauschalreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', usageRank: 10000, writerMorphology: morphology('right:reise') }),
    row('Sonderpreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', usageRank: 12000, writerMorphology: morphology('right:preis') }),
    row('Kirchenkreise', 1, { rhymeTier: 0, primaryType: 'multisyllabic_perfect', usageRank: 13000, writerMorphology: morphology('right:kreis') }),
  ];

  const ranked = rankWriterRecommendedResults(rows, query, { limit: 4 });
  const topThreeFamilies = ranked.slice(0, 3).map((item) => item.writerMorphology.familyKey);
  assert.equal(new Set(topThreeFamilies).size, 3);
  assert.ok(ranked.every((item, index) => item.writerRank === index + 1));
  assert.ok(ranked.every((item) => item.writer?.policy === WRITER_RANKING_POLICY));
});
