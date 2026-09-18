import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTITY_CUT_HYBRID_WEIGHTS,
  evaluateRankedEntityCutRows,
  rankControlEntityCutRows,
  rankHybridEntityCutRows,
  rankHybridV2EntityCutRows,
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


test('hybrid v2 preserves v1 scores exactly when QRank is present', () => {
  const rows = [
    row('Q30', { qrank: 1000, sitelinks: 10, de: 1, en: 1, externalIds: 2, statements: 20 }),
    row('Q31', { qrank: 500, sitelinks: 5, de: 1, en: 0, externalIds: 1, statements: 10 }),
    row('Q32', { qrank: 100, sitelinks: 1, statements: 3 }),
  ];
  const v1 = rankHybridEntityCutRows(rows);
  const v2 = rankHybridV2EntityCutRows(rows);
  assert.deepEqual(
    v2.map((entry) => [entry.qid, entry.candidate_score_ppm]),
    v1.map((entry) => [entry.qid, entry.candidate_score_ppm]),
  );
  assert.ok(v2.every((entry) => entry.candidate_available_weight_pct === 100));
});

test('hybrid v2 raises missing-QRank ceiling without full renormalization', () => {
  const rows = [
    row('Q40', { qrank: 1000 }),
    row('Q41', {
      qrank: null,
      sitelinks: 100,
      de: 1,
      en: 1,
      externalIds: 4,
      statements: 100,
    }),
  ];
  const v1Missing = rankHybridEntityCutRows(rows).find((entry) => entry.qid === 'Q41');
  const v2Missing = rankHybridV2EntityCutRows(rows).find((entry) => entry.qid === 'Q41');

  assert.equal(v1Missing.candidate_score_ppm, 450000);
  assert.equal(v2Missing.candidate_raw_score_ppm, 450000);
  assert.equal(v2Missing.candidate_available_evidence_score_ppm, 1000000);
  assert.equal(v2Missing.candidate_available_weight_pct, 45);
  assert.equal(v2Missing.candidate_score_ppm, 670820);
  assert.ok(v2Missing.candidate_score_ppm > v1Missing.candidate_score_ppm);
  assert.ok(v2Missing.candidate_score_ppm < 1000000);
});

test('hybrid v2 can admit strong missing-QRank structural evidence across a strict cut', () => {
  const rows = [
    row('Q50', { qrank: 100, sitelinks: 100, de: 1, en: 1, externalIds: 4, statements: 100 }),
    row('Q51', { qrank: 80, sitelinks: 10, de: 1, en: 0, externalIds: 1, statements: 10 }),
    row('Q52', { qrank: 60, sitelinks: 1, statements: 3 }),
    row('Q53', { qrank: 40, statements: 2 }),
    row('Q54', {
      qrank: null,
      sitelinks: 90,
      de: 1,
      en: 1,
      externalIds: 4,
      statements: 90,
    }),
    row('Q55'),
    row('Q56'),
    row('Q57'),
  ];

  const v1 = evaluateRankedEntityCutRows(rankHybridEntityCutRows(rows), 0.75);
  const v2 = evaluateRankedEntityCutRows(rankHybridV2EntityCutRows(rows), 0.75);

  assert.equal(v1.find((entry) => entry.qid === 'Q54').keep, false);
  assert.equal(v2.find((entry) => entry.qid === 'Q54').keep, true);
  assert.ok(v2.find((entry) => entry.qid === 'Q54').candidate_score_ppm > 450000);
});

test('hybrid v2 does not give weak missing-QRank rows a neutral popularity prior', () => {
  const rows = [
    row('Q60', { qrank: 100 }),
    row('Q61', { qrank: null }),
  ];
  const v2Missing = rankHybridV2EntityCutRows(rows).find((entry) => entry.qid === 'Q61');
  assert.equal(v2Missing.candidate_score_ppm, 0);
  assert.equal(v2Missing.candidate_available_evidence_score_ppm, 0);
});
