import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMorphologyRegression,
  evaluatePageRegression,
  legacyTier0Retention,
  ndcgForResponse,
  pageMetrics,
  queueFingerprint,
  reviewTaskId,
} from '../scripts/writer-page-benchmark-core.mjs';

function row(word, extras = {}) {
  return {
    language: 'de',
    word,
    normalized: word.toLocaleLowerCase('de-DE'),
    lemma: word,
    writerRank: 1,
    primaryType: 'perfect',
    rhymeTier: 0,
    score: 1,
    usageRank: 1000,
    lexicalTags: [],
    pronunciationPreferred: true,
    writer: { cheapRhymeTierPenalty: 0 },
    writerMorphology: null,
    ...extras,
  };
}

function response(query, rows) {
  return {
    query: { surface: query, normalized: query.toLocaleLowerCase('de-DE'), lemma: query },
    results: rows.map((entry, index) => ({ ...entry, writerRank: index + 1 })),
  };
}

test('page metrics separate same-lemma, family repetition, safety and near duplicates', () => {
  const rows = [
    row('Reise', { writerMorphology: { familyKey: 'right:reise' } }),
    row('Pilgerreise', { writerMorphology: { familyKey: 'right:reise' } }),
    row('Arbeitsweise', { lemma: 'Arbeitsweise', usageRank: null }),
  ];
  const metrics = pageMetrics(response('Arbeitsweise', rows), 3);
  assert.equal(metrics.rows, 3);
  assert.equal(metrics.repeatedFamilyRows, 1);
  assert.equal(metrics.sameLemmaRows, 1);
  assert.equal(metrics.unrankedRows, 1);
  assert.ok(metrics.nearDuplicateRows >= 1);
});

test('legacy tier-0 retention reports missing protected candidates', () => {
  const writer = response('Liebe', [row('Diebe'), row('Triebe')]);
  const legacy = response('Liebe', [row('Diebe'), row('Triebe'), row('Hiebe')]);
  const metric = legacyTier0Retention(writer, legacy);
  assert.equal(metric.legacyTier0Rows, 3);
  assert.equal(metric.retainedRows, 2);
  assert.equal(metric.retention, 0.6667);
  assert.deepEqual(metric.missingWords, ['Hiebe']);
});

test('page regression requires candidate rank, primary class and cheapness gates', () => {
  const writer = response('Liebe', [row('Diebe')]);
  const passed = evaluatePageRegression(writer, {
    id: 'liebe-diebe', query: 'Liebe', candidate: 'Diebe', max_rank: 5,
    allowed_primary_types: ['perfect'], max_cheap_tier_penalty: 0,
  });
  assert.equal(passed.passed, true);
  assert.equal(passed.observed.word, 'Diebe');

  const failed = evaluatePageRegression(writer, {
    id: 'missing', query: 'Liebe', candidate: 'Krise', max_rank: 5,
  });
  assert.equal(failed.passed, false);
  assert.ok(failed.failures.includes('candidate_missing'));
});

test('page regression can require a morphology family without overfitting one candidate', () => {
  const writer = response('Arbeitsweise', [
    row('Sonderpreise', { writerMorphology: { familyKey: 'right:preis' } }),
    row('Pilgerreise', { primaryType: 'multisyllabic_perfect', writerMorphology: { familyKey: 'right:reise' } }),
  ]);
  const passed = evaluatePageRegression(writer, {
    id: 'arbeitsweise-reise-family',
    query: 'Arbeitsweise',
    required_family: 'right:reise',
    max_rank: 20,
    allowed_primary_types: ['multisyllabic_perfect', 'perfect'],
    max_cheap_tier_penalty: 0,
  });
  assert.equal(passed.passed, true);
  assert.equal(passed.candidate, null);
  assert.equal(passed.requiredFamily, 'right:reise');
  assert.equal(passed.observed.word, 'Pilgerreise');
  assert.equal(passed.observed.rank, 2);

  const failed = evaluatePageRegression(writer, {
    id: 'missing-family', query: 'Arbeitsweise', required_family: 'right:kreis', max_rank: 20,
  });
  assert.equal(failed.passed, false);
  assert.ok(failed.failures.includes('family_missing'));
});

test('morphology regression compares family and explicit construction rule', () => {
  const result = evaluateMorphologyRegression({
    wordFound: true,
    evidence: {
      familyKey: 'right:weise',
      constructionRule: 'de-adverbial-weise-v2',
      status: 'attested_right_head_candidate',
    },
  }, {
    id: 'stufenweise', word: 'stufenweise', expected_family: 'right:weise',
    expected_construction_rule: 'de-adverbial-weise-v2',
  });
  assert.equal(result.passed, true);
});

test('NDCG remains pending until the writer cutoff is fully human-reviewed', () => {
  const writer = response('Liebe', [row('Diebe'), row('Triebe')]);
  const pending = ndcgForResponse(writer, [
    { query: 'Liebe', candidate: 'Diebe', songwriting_usefulness: 4 },
  ], 2);
  assert.equal(pending.status, 'pending_reference');
  assert.equal(pending.ndcg, null);

  const complete = ndcgForResponse(writer, [
    { query: 'Liebe', candidate: 'Diebe', songwriting_usefulness: 4 },
    { query: 'Liebe', candidate: 'Triebe', songwriting_usefulness: 3 },
  ], 2);
  assert.equal(complete.status, 'ok');
  assert.equal(complete.ndcg, 1);
});

test('review task identifiers and queue fingerprints are deterministic', () => {
  const id = reviewTaskId('Liebe', 'Diebe');
  assert.equal(id, reviewTaskId(' liebe ', 'diebe'));
  const tasks = [{ id, query: 'Liebe', candidate: 'Diebe', queryIpa: 'a', candidateIpa: 'b' }];
  assert.equal(queueFingerprint(tasks), queueFingerprint([...tasks].reverse()));
});
