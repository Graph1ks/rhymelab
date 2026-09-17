import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import {
  WRITER_ANCHOR_CANDIDATE_BASIS,
  WRITER_ANCHOR_POLICY,
  WRITER_ANCHOR_STORAGE,
  createWriterAnchorStorage,
  insertWriterCandidateSuffixRows,
  lookupWriterAnchorRows,
  writerAnchorLookupPlan,
  writerCandidateSuffixRows,
  writerQueryAnchorKeys,
} from '../scripts/writer-anchor-materialization-v5-core.mjs';

function row(id, normalized, ipa, usageRank) {
  const analysis = analyzeGermanIpa(ipa);
  return {
    id,
    normalized,
    ipa: analysis.ipa,
    vowelKey: analysis.vowelKey,
    syllables: analysis.syllableCount,
    usageRank,
  };
}

function fixtureDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE hot(
      id INTEGER PRIMARY KEY,
      normalized TEXT NOT NULL,
      ipa TEXT NOT NULL,
      vowel_key TEXT NOT NULL,
      syllable_count INTEGER NOT NULL,
      pronunciation_preferred INTEGER NOT NULL,
      historical INTEGER NOT NULL,
      usage_rank INTEGER
    );
  `);
  createWriterAnchorStorage(db);
  return db;
}

test('candidate suffix rows preserve legacy vowel-key string-suffix semantics', () => {
  const rows = writerCandidateSuffixRows(7, 'ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə');
  assert.ok(rows.some((entry) => entry.key === 'aɪ-aɪ-ə'));
  assert.ok(rows.some((entry) => entry.key === 'aɪ-ə'));
  assert.ok(rows.every((entry) => entry.policy === WRITER_ANCHOR_POLICY));
  assert.ok(rows.every((entry) => entry.kind === 'legacy_vowel_key_string_suffix_lookup'));
  assert.equal(WRITER_ANCHOR_CANDIDATE_BASIS, 'legacy-vowel-key-string-suffix-v1');
});

test('pre-primary nuclei do not leak into candidate suffix keys', () => {
  const beiseite = writerCandidateSuffixRows(8, 'ˌbaɪ̯ˈzaɪ̯tə').map((entry) => entry.key);
  const beileibe = writerCandidateSuffixRows(9, 'baɪ̯ˈlaɪ̯bə').map((entry) => entry.key);
  assert.ok(beiseite.includes('aɪ-ə'));
  assert.ok(beileibe.includes('aɪ-ə'));
  assert.ok(!beiseite.includes('aɪ-aɪ-ə'));
  assert.ok(!beileibe.includes('aɪ-aɪ-ə'));
});

test('candidate materialization preserves LIKE matches that begin inside a canonical nucleus string', () => {
  const rows = writerCandidateSuffixRows(10, 'ˈbaɪ̯tə').map((entry) => entry.key);
  assert.ok(rows.includes('aɪ-ə'));
  assert.ok(rows.includes('ɪ-ə'));
});

test('compact anchor storage keeps only lookup key and pronunciation identity', () => {
  const db = fixtureDb();
  try {
    assert.equal(WRITER_ANCHOR_STORAGE, 'compact-primary-key-v2');
    const columns = db.prepare('PRAGMA table_info(writer_anchor)').all().map((row) => row.name);
    assert.deepEqual(columns, ['anchor_key', 'pronunciation_id']);
    const sql = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='writer_anchor'").get()?.sql || '';
    assert.match(sql, /WITHOUT ROWID/i);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS c FROM sqlite_schema WHERE type='index' AND name='idx_writer_anchor_lookup'").get().c,
      0,
    );
  } finally {
    db.close();
  }
});

test('Arbeitsweise query keys retain the validated secondary-anchor channels', () => {
  const keys = writerQueryAnchorKeys('ˈaʁbaɪ̯t͡sˌvaɪ̯zə');
  assert.ok(keys.some((entry) => entry.kind === 'secondary_anchor_context' && entry.key === 'aɪ-aɪ-ə'));
  assert.ok(keys.some((entry) => entry.kind === 'secondary_anchor' && entry.key === 'aɪ-ə'));
});

test('indexed writer-anchor lookup is candidate-equivalent to the validation-time LIKE suffix scan', () => {
  const db = fixtureDb();
  try {
    const query = row(1, 'arbeitsweise', 'ˈaʁbaɪ̯t͡sˌvaɪ̯zə', 1000);
    const candidates = [
      row(2, 'hochzeitsreise', 'ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə', 2000),
      row(3, 'weiterreise', 'ˈvaɪ̯tɐˌʁaɪ̯zə', 3000),
      row(4, 'arbeitsphase', 'ˈaʁbaɪ̯t͡sˌfaːzə', 4000),
      row(5, 'beiseite', 'ˌbaɪ̯ˈzaɪ̯tə', 1500),
      row(6, 'beileibe', 'baɪ̯ˈlaɪ̯bə', 1600),
    ];
    const insertHot = db.prepare(`
      INSERT INTO hot(
        id,normalized,ipa,vowel_key,syllable_count,pronunciation_preferred,historical,usage_rank
      ) VALUES(?,?,?,?,?,1,0,?)
    `);
    for (const entry of [query, ...candidates]) {
      insertHot.run(
        entry.id,
        entry.normalized,
        entry.ipa,
        entry.vowelKey,
        entry.syllables,
        entry.usageRank,
      );
      insertWriterCandidateSuffixRows(db, entry.id, entry.ipa);
    }

    for (const key of writerQueryAnchorKeys(query.ipa)) {
      const newIds = lookupWriterAnchorRows(db, key.key, {
        queryNormalized: query.normalized,
        querySyllables: query.syllables,
        limit: 800,
      }).map((hit) => Number(hit.id));
      const oldIds = db.prepare(`
        SELECT id FROM hot
        WHERE vowel_key LIKE ?
          AND normalized != ?
          AND ABS(syllable_count-?) <= 1
          AND pronunciation_preferred=1
          AND historical=0
        ORDER BY ABS(syllable_count-?), usage_rank IS NULL, usage_rank, id
        LIMIT 800
      `).all(`%${key.key}`, query.normalized, query.syllables, query.syllables)
        .map((hit) => Number(hit.id));
      assert.deepEqual(newIds, oldIds, `channel mismatch for ${key.kind}:${key.key}`);
      if (key.key === 'aɪ-aɪ-ə') {
        assert.ok(!newIds.includes(5), 'beiseite must not leak into secondary-anchor context');
        assert.ok(!newIds.includes(6), 'beileibe must not leak into secondary-anchor context');
      }
      if (key.key === 'aɪ-ə') {
        assert.ok(newIds.includes(5), 'beiseite remains a legacy suffix match for the short channel');
        assert.ok(newIds.includes(6), 'beileibe remains a legacy suffix match for the short channel');
      }
    }

    const protectedIds = lookupWriterAnchorRows(db, 'aɪ-aɪ-ə', {
      queryNormalized: query.normalized,
      querySyllables: query.syllables,
      limit: 800,
    }).map((hit) => Number(hit.id));
    assert.ok(protectedIds.includes(2), 'Hochzeitsreise must remain in the right-edge candidate universe');
  } finally {
    db.close();
  }
});

test('writer anchor lookup uses the WITHOUT ROWID primary key', () => {
  const db = fixtureDb();
  try {
    const plan = writerAnchorLookupPlan(db, 'aɪ-ə');
    const detail = plan.map((row) => String(row.detail || '')).join('\n');
    assert.match(detail, /USING PRIMARY KEY/);
    assert.match(detail, /anchor_key=\?/);
  } finally {
    db.close();
  }
});
