import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTITY_CUT_HYBRID_WEIGHTS,
  evaluateRankedEntityCutRows,
  rankControlEntityCutRows,
  rankHybridEntityCutRows,
  summarizeEvaluatedEntityCutRows,
} from '../scripts/entity-cut-hybrid-core.mjs';

function row(qid, {
  qrank = null,
  sitelinks = 0,
  de = 0,
  en = 0,
  externalIds = 0,
  statements = 1,
} = {}) {
  return {
    qid,
    qrank,
    wikipedia_sitelink_count: sitelinks,
    has_dewiki: de,
    has_enwiki: en,
    external_id_count: externalIds,
    statement_count: statements,
  };
}

test('hybrid candidate weights are bounded to 100 percent', () => {
  assert.equal(
    Object.values(ENTITY_CUT_HYBRID_WEIGHTS).reduce((sum, value) => sum + value, 0),
    100,
  );
});

test('hybrid candidate removes QRank presence as a binary admission gate', () => {
  const rows = [
    row('Q1', { qrank: 100 }),
    row('Q2', { qrank: 1 }),
    row('Q3', {
      qrank: null,
      sitelinks: 100,
      de: 1,
      en: 1,
      externalIds: 4,
      statements: 100,
    }),
    row('Q4'),
  ];

  const control = evaluateRankedEntityCutRows(rankControlEntityCutRows(rows), 0.5);
  const candidate = evaluateRankedEntityCutRows(rankHybridEntityCutRows(rows), 0.5);

  assert.deepEqual(
    control.filter((entry) => entry.keep).map((entry) => entry.qid),
    ['Q1', 'Q2'],
  );
  assert.deepEqual(
    candidate.filter((entry) => entry.keep).map((entry) => entry.qid),
    ['Q1', 'Q3'],
  );

  const candidateQ3 = candidate.find((entry) => entry.qid === 'Q3');
  const candidateQ2 = candidate.find((entry) => entry.qid === 'Q2');
  assert.equal(candidateQ3.qrank, null);
  assert.equal(candidateQ3.candidate_components_ppm.qrank_percentile, 0);
  assert.ok(candidateQ3.candidate_score_ppm > candidateQ2.candidate_score_ppm);

  assert.equal(summarizeEvaluatedEntityCutRows(control).kept_without_qrank, 0);
  assert.equal(summarizeEvaluatedEntityCutRows(candidate).kept_without_qrank, 1);
});

test('hybrid candidate keeps QRank primary while allowing structural evidence to compete', () => {
  const rows = [
    row('Q10', { qrank: 1000 }),
    row('Q11', {
      qrank: null,
      sitelinks: 500,
      de: 1,
      en: 1,
      externalIds: 4,
      statements: 500,
    }),
  ];

  const candidate = rankHybridEntityCutRows(rows);
  assert.equal(candidate[0].qid, 'Q10');
  assert.equal(candidate[0].candidate_components_ppm.qrank_percentile, 1_000_000);
  assert.equal(candidate[1].candidate_components_ppm.qrank_percentile, 0);
  assert.ok(candidate[0].candidate_score_ppm > candidate[1].candidate_score_ppm);
});

test('protected sentinels remain retained below a category floor', () => {
  const rows = [
    row('Q20', { qrank: 100 }),
    row('Q21', { qrank: 10 }),
    row('Q221074'),
  ];
  const evaluated = evaluateRankedEntityCutRows(
    rankHybridEntityCutRows(rows),
    0.9,
    new Set(['Q221074']),
  );
  assert.equal(evaluated.find((entry) => entry.qid === 'Q221074').keep, true);
});
