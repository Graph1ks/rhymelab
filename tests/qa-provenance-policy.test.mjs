import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applyPronunciationProvenanceIntegrity, auditPronunciationSourceDuplicates } from '../scripts/qa-provenance-policy.mjs';

function baseReport() {
  return {
    status: 'attention',
    gates: {
      source_syntax: true,
      tests: true,
      local_only_guard: true,
      database_integrity: false,
      rhyme_smoke: true,
    },
    database: {
      missing: false,
      ok: false,
      integrity_check: 'ok',
      invalid_total: 0,
      indexes: { missing: [] },
      duplicates: { exact_surface_ipa_groups: 1 },
    },
  };
}

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE hot(
      surface TEXT NOT NULL,
      ipa TEXT NOT NULL,
      pronunciation_source TEXT NOT NULL,
      lexicon_layer TEXT NOT NULL
    );
  `);
  return db;
}

test('same surface+IPA from independent sources is provenance evidence, not a duplicate failure', () => {
  const db = database();
  try {
    const insert = db.prepare('INSERT INTO hot(surface,ipa,pronunciation_source,lexicon_layer) VALUES(?,?,?,?)');
    insert.run('Twitter', 'ˈtvɪtɐ', 'German Wiktionary via Kaikki/wiktextract', 'dictionary');
    insert.run('Twitter', 'ˈtvɪtɐ', 'RhymeLab curated modern lexicon', 'modern');
    const audit = auditPronunciationSourceDuplicates(db);
    assert.equal(audit.exact_surface_ipa_cross_source_groups, 1);
    assert.equal(audit.exact_surface_ipa_same_source_groups, 0);
    const report = applyPronunciationProvenanceIntegrity(baseReport(), audit);
    assert.equal(report.database.ok, true);
    assert.equal(report.gates.database_integrity, true);
    assert.equal(report.status, 'ok');
  } finally {
    db.close();
  }
});

test('same surface+IPA repeated within one source still fails database integrity', () => {
  const db = database();
  try {
    const insert = db.prepare('INSERT INTO hot(surface,ipa,pronunciation_source,lexicon_layer) VALUES(?,?,?,?)');
    insert.run('Twitter', 'ˈtvɪtɐ', 'German Wiktionary via Kaikki/wiktextract', 'dictionary');
    insert.run('Twitter', 'ˈtvɪtɐ', 'German Wiktionary via Kaikki/wiktextract', 'dictionary');
    const audit = auditPronunciationSourceDuplicates(db);
    assert.equal(audit.exact_surface_ipa_same_source_groups, 1);
    const report = applyPronunciationProvenanceIntegrity(baseReport(), audit);
    assert.equal(report.database.ok, false);
    assert.equal(report.gates.database_integrity, false);
    assert.equal(report.status, 'attention');
  } finally {
    db.close();
  }
});
