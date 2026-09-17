import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  WRITER_LEXICAL_PUBLISH_SCHEMA,
  augmentPublishRowV3,
  writerLexicalPublishFields,
  writerLexicalPublishFingerprint,
} from '../scripts/writer-lexical-publish-v3-core.mjs';
import {
  WRITER_LEXICAL_DB_SCHEMA,
  createWriterLexicalStorage,
  insertWriterLexicalAnalyses,
  readWriterLexicalAnalyses,
} from '../scripts/writer-lexical-storage-v5-core.mjs';

const fixture = JSON.parse(await readFile(
  new URL('./fixtures/writer-lexical-v3-options.json', import.meta.url),
  'utf8',
));

function byKey(rows, key) {
  return rows.find((row) => row.k === key);
}

test('writer lexical publish v3 preserves all merged analyses plus deterministic compatibility fields', () => {
  const fields = writerLexicalPublishFields(fixture.options);
  const row = augmentPublishRowV3(fixture.base_row, fixture.options);

  assert.equal(WRITER_LEXICAL_PUBLISH_SCHEMA, 'rhymelab-de-publish-v3');
  assert.equal(fields.analysisCount, fixture.expected.analysis_count);
  assert.deepEqual(fields.analyses.map((analysis) => analysis.k), fixture.expected.analysis_keys);
  assert.equal(row.l, fixture.expected.compatibility_lemma);
  assert.equal(row.p, fixture.expected.compatibility_pos);
  assert.equal(row.a.length, fixture.expected.analysis_count);

  const adjective = byKey(row.a, 'adj-key');
  assert.deepEqual(adjective.sr, fixture.expected.adj_source_record_keys);
  assert.deepEqual(adjective.mk, fixture.expected.adj_match_kinds);
  assert.deepEqual(adjective.ff, fixture.expected.adj_form_features);
});

test('writer lexical publish v3 is independent of source iteration order', () => {
  const forward = augmentPublishRowV3(fixture.base_row, fixture.options);
  const reverse = augmentPublishRowV3(fixture.base_row, [...fixture.options].reverse());

  assert.deepEqual(forward, reverse);
  assert.equal(
    writerLexicalPublishFingerprint(fixture.options),
    writerLexicalPublishFingerprint([...fixture.options].reverse()),
  );
});

test('writer lexical storage v5 keeps one normalized row per form and analysis key', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createWriterLexicalStorage(db);
    const row = augmentPublishRowV3(fixture.base_row, fixture.options);
    const inserted = insertWriterLexicalAnalyses(db, row.o, row.a);
    const stored = readWriterLexicalAnalyses(db, row.o);

    assert.equal(WRITER_LEXICAL_DB_SCHEMA, 'rhymelab-local-db-v5');
    assert.equal(inserted, fixture.expected.analysis_count);
    assert.equal(stored.length, fixture.expected.analysis_count);
    assert.deepEqual(stored.map((analysis) => analysis.analysis_key), fixture.expected.analysis_keys);

    const adjective = stored.find((analysis) => analysis.analysis_key === 'adj-key');
    assert.equal(adjective.lemma, 'stufenweise');
    assert.equal(adjective.pos, 'adj');
    assert.deepEqual(adjective.source_record_keys, fixture.expected.adj_source_record_keys);
    assert.deepEqual(adjective.match_kinds, fixture.expected.adj_match_kinds);
    assert.deepEqual(adjective.form_features, fixture.expected.adj_form_features);
  } finally {
    db.close();
  }
});

test('writer lexical storage v5 rejects duplicate analysis identity for the same form', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createWriterLexicalStorage(db);
    const row = augmentPublishRowV3(fixture.base_row, fixture.options);
    insertWriterLexicalAnalyses(db, row.o, row.a);

    assert.throws(
      () => insertWriterLexicalAnalyses(db, row.o, [row.a[0]]),
      /UNIQUE constraint failed|PRIMARY KEY constraint failed/,
    );
  } finally {
    db.close();
  }
});
