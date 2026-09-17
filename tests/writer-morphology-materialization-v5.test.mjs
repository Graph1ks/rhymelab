import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { normalizeWriterLexicalAnalyses } from '../scripts/writer-lexical-model-core.mjs';
import {
  WRITER_MORPHOLOGY_POLICY,
  WRITER_MORPHOLOGY_STORAGE,
  createWriterMorphologyEvidenceStorage,
  deriveWriterMorphologyForForm,
  insertWriterMorphologyEvidence,
} from '../scripts/writer-morphology-materialization-v5-core.mjs';

const fixture = JSON.parse(await readFile(
  new URL('./fixtures/writer-lexical-v3-options.json', import.meta.url),
  'utf8',
));

function lexicalEvidence(surface, usageRank, analyses = []) {
  return { surface, usageRank, analyses };
}

test('stufenweise adjective/adverb analyses independently converge on right:weise', () => {
  const analyses = normalizeWriterLexicalAnalyses(fixture.options);
  const attested = new Map([
    ['stufen', lexicalEvidence('Stufen', 12000)],
    ['weise', lexicalEvidence('Weise', 5000, [{
      analysisKey: 'weise-noun',
      normalizedLemma: 'weise',
      pos: 'noun',
    }])],
  ]);

  const result = deriveWriterMorphologyForForm(
    { surface: 'stufenweise', normalized: 'stufenweise' },
    analyses,
    attested,
  );

  assert.equal(result.evidence.length, 2);
  assert.ok(result.evidence.every((row) => row.status === 'attested_right_head_candidate'));
  assert.ok(result.evidence.every((row) => row.familyKey === 'right:weise'));
  assert.ok(result.evidence.every((row) => row.constructionRule === 'de-adverbial-weise-v2'));
  assert.equal(result.consensus.status, 'resolved_converged');
  assert.equal(result.consensus.familyKey, 'right:weise');
});

test('Verweise remains unresolved even when Weise and a measured left fragment are attested', () => {
  const attested = new Map([
    ['ver', lexicalEvidence('ver', 1000)],
    ['weise', lexicalEvidence('Weise', 5000, [{
      analysisKey: 'weise-noun',
      normalizedLemma: 'weise',
      pos: 'noun',
    }])],
  ]);
  const result = deriveWriterMorphologyForForm(
    { surface: 'Verweise', normalized: 'verweise' },
    [{ analysisKey: 'verweisen-verb', normalizedLemma: 'verweisen', pos: 'verb' }],
    attested,
  );

  assert.equal(result.evidence[0].status, 'unresolved');
  assert.equal(result.evidence[0].familyKey, null);
  assert.equal(result.consensus.status, 'unresolved');
});

test('conflicting source-supported analyses stay ambiguous instead of selecting one family', () => {
  const attested = new Map([
    ['abc', lexicalEvidence('abc', 1000)],
    ['abcd', lexicalEvidence('abcd', 1200)],
    ['defghi', lexicalEvidence('defghi', 2000, [{
      analysisKey: 'defghi-noun',
      normalizedLemma: 'defghi',
      pos: 'noun',
    }])],
    ['efghi', lexicalEvidence('efghi', 3000, [{
      analysisKey: 'efghi-adj',
      normalizedLemma: 'efghi',
      pos: 'adj',
    }])],
  ]);
  const result = deriveWriterMorphologyForForm(
    { surface: 'abcdefghi', normalized: 'abcdefghi' },
    [
      { analysisKey: 'whole-noun', normalizedLemma: 'abcdefghi', pos: 'noun' },
      { analysisKey: 'whole-adj', normalizedLemma: 'abcdefghi', pos: 'adj' },
    ],
    attested,
  );

  const byAnalysis = new Map(result.evidence.map((row) => [row.analysisKey, row]));
  assert.equal(byAnalysis.get('whole-noun').familyKey, 'right:defghi');
  assert.equal(byAnalysis.get('whole-adj').familyKey, 'right:efghi');
  assert.equal(result.consensus.status, 'ambiguous_conflict');
  assert.equal(result.consensus.familyKey, null);
});

test('compact morphology storage keeps positive per-analysis evidence without duplicated JSON', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createWriterMorphologyEvidenceStorage(db);
    assert.equal(WRITER_MORPHOLOGY_POLICY, 'de-attested-right-head-v4');
    assert.equal(WRITER_MORPHOLOGY_STORAGE, 'positive-evidence-compact-v2');

    const columns = db.prepare('PRAGMA table_info(writer_morphology_evidence)').all().map((row) => row.name);
    assert.deepEqual(columns, [
      'form_id',
      'analysis_key',
      'family_key',
      'construction_rule',
      'split_index',
      'left_normalized',
      'right_normalized',
      'right_head_analysis_key',
    ]);
    const sql = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='writer_morphology_evidence'").get()?.sql || '';
    assert.match(sql, /WITHOUT ROWID/i);
    assert.doesNotMatch(sql, /evidence_json/i);
    assert.doesNotMatch(sql, /morphology_policy/i);
    assert.doesNotMatch(sql, /status\s+TEXT/i);

    const evidence = [
      {
        analysisKey: 'adj-key',
        status: 'attested_right_head_candidate',
        familyKey: 'right:weise',
        constructionRule: 'de-adverbial-weise-v2',
        split: { index: 6 },
        leftEvidence: { normalized: 'stufen' },
        rightHead: { normalized: 'weise', analysisKey: 'weise-noun' },
      },
      {
        analysisKey: 'adv-key',
        status: 'attested_right_head_candidate',
        familyKey: 'right:weise',
        constructionRule: 'de-adverbial-weise-v2',
        split: { index: 6 },
        leftEvidence: { normalized: 'stufen' },
        rightHead: { normalized: 'weise', analysisKey: 'weise-noun' },
      },
      {
        analysisKey: 'unresolved-key',
        status: 'unresolved',
        familyKey: null,
      },
    ];
    assert.equal(insertWriterMorphologyEvidence(db, 1, evidence), 2);

    const rows = db.prepare(`
      SELECT analysis_key,family_key,right_head_analysis_key
      FROM writer_morphology_evidence
      WHERE form_id=1
      ORDER BY analysis_key
    `).all();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.analysis_key), ['adj-key', 'adv-key']);
    assert.ok(rows.every((row) => row.family_key === 'right:weise'));
    assert.ok(rows.every((row) => row.right_head_analysis_key === 'weise-noun'));
  } finally {
    db.close();
  }
});
