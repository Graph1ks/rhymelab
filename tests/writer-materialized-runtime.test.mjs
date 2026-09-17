import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  materializedWriterRuntimeState,
  lookupMaterializedWriterAnchorRows,
  resolveMaterializedWriterMorphologyBatch,
} from '../src/writer-materialized-runtime.mjs';

function fixtureDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE hot(
      id INTEGER PRIMARY KEY,
      publish_order INTEGER NOT NULL,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      lemma TEXT,
      pos TEXT,
      usage_rank INTEGER,
      historical INTEGER NOT NULL DEFAULT 0,
      pronunciation_preferred INTEGER NOT NULL DEFAULT 1,
      syllable_count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE form_analysis(
      form_id INTEGER NOT NULL,
      analysis_key TEXT NOT NULL,
      normalized_lemma TEXT NOT NULL,
      pos TEXT,
      PRIMARY KEY(form_id,analysis_key)
    );
    CREATE TABLE writer_anchor(
      anchor_key TEXT NOT NULL,
      pronunciation_id INTEGER NOT NULL,
      PRIMARY KEY(anchor_key,pronunciation_id)
    ) WITHOUT ROWID;
    CREATE TABLE writer_morphology_evidence(
      form_id INTEGER NOT NULL,
      analysis_key TEXT NOT NULL,
      family_key TEXT NOT NULL,
      construction_rule TEXT,
      split_index INTEGER,
      left_normalized TEXT,
      right_normalized TEXT,
      right_head_analysis_key TEXT,
      PRIMARY KEY(form_id,analysis_key)
    ) WITHOUT ROWID;
  `);
  const meta = db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  for (const [key, value] of [
    ['schema', 'rhymelab-local-db-v5'],
    ['writer_anchor_policy', 'de-right-edge-anchors-v1'],
    ['writer_anchor_storage', 'compact-primary-key-v2'],
    ['writer_anchor_candidate_basis', 'legacy-vowel-key-string-suffix-v1'],
    ['writer_morphology_policy', 'de-attested-right-head-v4'],
    ['writer_morphology_storage', 'positive-evidence-compact-v2'],
  ]) meta.run(key, value);
  return db;
}

function insertHot(db, id, formId, surface, lemma, pos, usageRank = 1000) {
  db.prepare(`
    INSERT INTO hot(id,publish_order,surface,normalized,lemma,pos,usage_rank,historical,pronunciation_preferred,syllable_count)
    VALUES(?,?,?,?,?,?,?,0,1,3)
  `).run(id, formId, surface, surface.toLocaleLowerCase('de-DE'), lemma, pos, usageRank);
}

test('materialized writer runtime activates only for the complete v5 storage contract', () => {
  const db = fixtureDb();
  try {
    const state = materializedWriterRuntimeState(db, { refresh: true });
    assert.equal(state.active, true);
    assert.equal(state.runtimeId, 'materialized-writer-v5-v1');
    assert.equal(state.anchorCandidateBasis, 'legacy-vowel-key-string-suffix-v1');
  } finally {
    db.close();
  }
});

test('materialized anchor lookup uses the compact candidate table', () => {
  const db = fixtureDb();
  try {
    insertHot(db, 1, 1, 'Hochzeitsreise', 'Hochzeitsreise', 'noun', 2000);
    insertHot(db, 2, 2, 'Weiterreise', 'Weiterreise', 'noun', 1000);
    db.prepare('INSERT INTO writer_anchor(anchor_key,pronunciation_id) VALUES(?,?)').run('aɪ-aɪ-ə', 1);
    db.prepare('INSERT INTO writer_anchor(anchor_key,pronunciation_id) VALUES(?,?)').run('aɪ-aɪ-ə', 2);
    const rows = lookupMaterializedWriterAnchorRows(db, 'aɪ-aɪ-ə', {
      queryNormalized: 'arbeitsweise',
      querySyllables: 4,
      limit: 50,
    });
    assert.deepEqual(rows.map((row) => row.normalized), ['weiterreise', 'hochzeitsreise']);
  } finally {
    db.close();
  }
});

test('materialized morphology reconstructs converged, unresolved and ambiguous multi-analysis state', () => {
  const db = fixtureDb();
  try {
    insertHot(db, 1, 10, 'stufenweise', 'stufenweise', 'adj');
    insertHot(db, 2, 20, 'Verweise', 'Verweis', 'noun');
    insertHot(db, 3, 30, 'Testwort', 'Testwort', 'noun');

    const analysis = db.prepare('INSERT INTO form_analysis(form_id,analysis_key,normalized_lemma,pos) VALUES(?,?,?,?)');
    analysis.run(10, 'adj-key', 'stufenweise', 'adj');
    analysis.run(10, 'adv-key', 'stufenweise', 'adv');
    analysis.run(20, 'noun-key', 'verweis', 'noun');
    analysis.run(30, 'a-key', 'testwort', 'noun');
    analysis.run(30, 'b-key', 'testwort', 'noun');

    const evidence = db.prepare(`
      INSERT INTO writer_morphology_evidence(
        form_id,analysis_key,family_key,construction_rule,split_index,left_normalized,right_normalized,right_head_analysis_key
      ) VALUES(?,?,?,?,?,?,?,?)
    `);
    evidence.run(10, 'adj-key', 'right:weise', 'de-adverbial-weise-v2', 6, 'stufe', 'weise', 'weise-noun');
    evidence.run(10, 'adv-key', 'right:weise', 'de-adverbial-weise-v2', 6, 'stufe', 'weise', 'weise-noun');
    evidence.run(30, 'a-key', 'right:foo', null, 4, 'test', 'foo', 'foo-key');
    evidence.run(30, 'b-key', 'right:bar', null, 4, 'test', 'bar', 'bar-key');

    const rows = [
      { normalized: 'stufenweise', lemma: 'stufenweise', partOfSpeech: 'adj' },
      { normalized: 'verweise', lemma: 'Verweis', partOfSpeech: 'noun' },
      { normalized: 'testwort', lemma: 'Testwort', partOfSpeech: 'noun' },
    ];
    const result = resolveMaterializedWriterMorphologyBatch(db, rows, 'de');

    const stufenweise = result.get('stufenweise');
    assert.equal(stufenweise.status, 'attested_right_head_candidate');
    assert.equal(stufenweise.consensusStatus, 'resolved_converged');
    assert.equal(stufenweise.familyKey, 'right:weise');
    assert.equal(stufenweise.constructionRule, 'de-adverbial-weise-v2');
    assert.equal(stufenweise.analysisCount, 2);

    const verweise = result.get('verweise');
    assert.equal(verweise.status, 'unresolved');
    assert.equal(verweise.familyKey, null);
    assert.equal(verweise.analysisCount, 1);

    const ambiguous = result.get('testwort');
    assert.equal(ambiguous.status, 'ambiguous_conflict');
    assert.equal(ambiguous.familyKey, null);
    assert.deepEqual(ambiguous.supportedFamilies.map((entry) => entry.familyKey), ['right:bar', 'right:foo']);
  } finally {
    db.close();
  }
});
