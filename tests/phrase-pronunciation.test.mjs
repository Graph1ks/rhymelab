import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  createPhraseCatalogStorage,
  computePhraseCatalogFingerprint,
  phraseIdForNormalized,
  tokenizePhrase,
  tokenKey,
} from '../scripts/phrase-catalog-core.mjs';
import {
  materializePhrasePronunciations,
  computePhrasePronunciationFingerprint,
} from '../scripts/phrase-pronunciation-core.mjs';
import { getPhraseBrowserStats, getPhraseDetail, searchPhrases } from '../src/phrase-browser-store.mjs';

function insertPhrase(db, canonical) {
  const normalized = canonical.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-DE');
  const tokens = tokenizePhrase(canonical);
  const phraseId = phraseIdForNormalized(normalized);
  db.prepare([
    'INSERT INTO phrase(phrase_id,canonical,normalized,token_key,token_count,phrase_types_json,',
    'historical_state,modern_eligible,identity_fingerprint) VALUES(?,?,?,?,?,?,?,?,?)',
  ].join('')).run(
    phraseId, canonical, normalized, tokenKey(tokens), tokens.length, '["phrase"]',
    'current_or_unmarked', 1, 'fixture-' + phraseId,
  );
  const insert = db.prepare([
    'INSERT INTO phrase_token(phrase_id,token_index,surface,normalized,char_start,char_end,lexical_state,lexical_form_id)',
    ' VALUES(?,?,?,?,?,?,?,NULL)',
  ].join(''));
  for (const token of tokens) {
    insert.run(
      phraseId,token.index,token.surface,token.normalized,token.charStart,token.charEnd,'unresolved',
    );
  }
  return phraseId;
}

function createWriterFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec([
    'CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);',
    "INSERT INTO meta(key,value) VALUES('schema','rhymelab-local-db-v5');",
    'CREATE TABLE hot(',
    ' id INTEGER PRIMARY KEY,publish_order INTEGER NOT NULL,surface TEXT NOT NULL,normalized TEXT NOT NULL,',
    ' historical INTEGER NOT NULL,usage_rank INTEGER,ipa TEXT NOT NULL,pronunciation_source TEXT NOT NULL,',
    " pronunciation_flags TEXT NOT NULL DEFAULT '[]',pronunciation_preferred INTEGER NOT NULL,",
    ' pronunciation_eligible INTEGER NOT NULL,lexicon_layer TEXT NOT NULL,entity_kind TEXT,pos TEXT,lemma TEXT);',
  ].join('\n'));
  const insert = db.prepare([
    'INSERT INTO hot(id,publish_order,surface,normalized,historical,usage_rank,ipa,pronunciation_source,',
    'pronunciation_flags,pronunciation_preferred,pronunciation_eligible,lexicon_layer,entity_kind,pos,lemma)',
    ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ].join(''));
  insert.run(1, 10, 'keine', 'keine', 0, 100, 'ˈkaɪ̯nə', 'fixture', '[]', 1, 1, 'dictionary', null, 'det', 'kein');
  insert.run(2, 10, 'keine', 'keine', 0, 100, 'ˈkaɪnə', 'fixture-alt', '[]', 0, 1, 'dictionary', null, 'det', 'kein');
  insert.run(3, 20, 'Ahnung', 'ahnung', 0, 200, 'ˈaːnʊŋ', 'fixture', '[]', 1, 1, 'dictionary', null, 'noun', 'Ahnung');
  insert.run(4, 30, 'tu', 'tu', 0, 300, 'tuː', 'fixture', '[]', 1, 1, 'dictionary', null, 'verb', 'tun');
  insert.run(5, 40, 'TU', 'tu', 0, 10, 'teːˈʔuː', 'fixture-entity', '[]', 1, 1, 'modern', 'organization', 'name', 'TU');
  insert.run(6, 50, 'das', 'das', 0, 20, 'das', 'fixture', '[]', 1, 1, 'dictionary', null, 'pron', 'das');
  return db;
}

test('11C1 materializes one citation pronunciation with explicit boundaries', () => {
  const phraseDb = new DatabaseSync(':memory:');
  const writerDb = createWriterFixture();
  try {
    phraseDb.exec('PRAGMA foreign_keys=ON;');
    createPhraseCatalogStorage(phraseDb);
    const readyId = insertPhrase(phraseDb, 'keine Ahnung');
    insertPhrase(phraseDb, 'keine Quuxwort');

    const baseBefore = computePhraseCatalogFingerprint(phraseDb);
    const result = materializePhrasePronunciations(phraseDb, writerDb);
    const baseAfter = computePhraseCatalogFingerprint(phraseDb);

    assert.equal(baseAfter, baseBefore);
    assert.equal(result.baseCatalogFingerprint, baseBefore);
    assert.equal(result.tokenResolutions, 4);
    assert.equal(result.resolvedTokens, 3);
    assert.equal(result.unresolvedTokens, 1);
    assert.equal(result.readyPhrases, 1);
    assert.equal(result.phraseCount, 2);
    assert.equal(result.unresolvedReasonCounts.unresolved_no_writer_form, 1);
    assert.equal(result.ineligiblePhraseReasonCounts.unresolved_no_writer_form, 1);

    const pronunciation = phraseDb.prepare(
      'SELECT * FROM phrase_pronunciation WHERE phrase_id=?',
    ).get(readyId);
    assert.equal(pronunciation.variant_type, 'citation_preferred');
    assert.equal(pronunciation.ipa, 'ˈkaɪ̯nə‿ˈaːnʊŋ');
    assert.equal(pronunciation.syllable_count, 4);
    assert.equal(pronunciation.stress_pattern, '2020');
    assert.deepEqual(JSON.parse(pronunciation.primary_stress_syllables_json), [1, 3]);
    assert.equal(JSON.parse(pronunciation.word_boundary_phoneme_positions_json).length, 1);
    assert.deepEqual(JSON.parse(pronunciation.word_boundary_syllable_positions_json), [2]);

    const tokens = phraseDb.prepare(
      'SELECT * FROM phrase_pronunciation_token WHERE phrase_pronunciation_id=? ORDER BY token_index',
    ).all(pronunciation.phrase_pronunciation_id);
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0].available_pronunciations, 2);
    assert.equal(tokens[0].phoneme_start, 0);
    assert.equal(tokens[0].phoneme_end, tokens[1].phoneme_start);
    assert.equal(tokens[0].syllable_end, tokens[1].syllable_start);

    const originalTokens = phraseDb.prepare(
      'SELECT lexical_state,lexical_form_id FROM phrase_token WHERE phrase_id=? ORDER BY token_index',
    ).all(readyId);
    assert.deepEqual(
      originalTokens.map((row) => ({
        lexical_state: row.lexical_state,
        lexical_form_id: row.lexical_form_id,
      })),
      [
        { lexical_state: 'unresolved', lexical_form_id: null },
        { lexical_state: 'unresolved', lexical_form_id: null },
      ],
    );

    const browserRows = searchPhrases(phraseDb, { q: 'keine Ahnung', evidence: 'pronunciation' });
    assert.equal(browserRows.length, 1);
    assert.equal(browserRows[0].pronunciationReady, true);
    assert.equal(browserRows[0].ipa, 'ˈkaɪ̯nə‿ˈaːnʊŋ');
    const detail = getPhraseDetail(phraseDb, readyId);
    assert.equal(detail.pronunciationReady, true);
    assert.equal(detail.pronunciation.tokens.length, 2);
    assert.deepEqual(detail.pronunciation.wordBoundarySyllablePositions, [2]);
    const browserStats = getPhraseBrowserStats(phraseDb);
    assert.equal(browserStats.pronunciation.readyPhrases, 1);
    assert.equal(browserStats.pronunciation.resolvedTokens, 3);
  } finally {
    writerDb.close();
    phraseDb.close();
  }
});

test('11C1 rebuild is deterministic and does not expand token alternates', () => {
  const phraseDb = new DatabaseSync(':memory:');
  const writerDb = createWriterFixture();
  try {
    phraseDb.exec('PRAGMA foreign_keys=ON;');
    createPhraseCatalogStorage(phraseDb);
    insertPhrase(phraseDb, 'keine Ahnung');

    const first = materializePhrasePronunciations(phraseDb, writerDb);
    const firstFingerprint = computePhrasePronunciationFingerprint(phraseDb);
    const firstCount = Number(phraseDb.prepare('SELECT COUNT(*) c FROM phrase_pronunciation').get().c);

    const second = materializePhrasePronunciations(phraseDb, writerDb);
    const secondFingerprint = computePhrasePronunciationFingerprint(phraseDb);
    const secondCount = Number(phraseDb.prepare('SELECT COUNT(*) c FROM phrase_pronunciation').get().c);

    assert.equal(first.pronunciationFingerprint, firstFingerprint);
    assert.equal(second.pronunciationFingerprint, secondFingerprint);
    assert.equal(secondFingerprint, firstFingerprint);
    assert.equal(firstCount, 1);
    assert.equal(secondCount, 1);
  } finally {
    writerDb.close();
    phraseDb.close();
  }
});


test('11C1 resolver keeps lowercase lexical tu separate from uppercase TU entity', () => {
  const phraseDb = new DatabaseSync(':memory:');
  const writerDb = createWriterFixture();
  try {
    phraseDb.exec('PRAGMA foreign_keys=ON;');
    createPhraseCatalogStorage(phraseDb);
    const lowerId = insertPhrase(phraseDb, 'tu das');
    const upperId = insertPhrase(phraseDb, 'TU keine');

    const result = materializePhrasePronunciations(phraseDb, writerDb);
    assert.equal(result.readyPhrases, 2);

    const lower = phraseDb.prepare(
      'SELECT ipa FROM phrase_pronunciation WHERE phrase_id=? AND variant_rank=1',
    ).get(lowerId);
    const upper = phraseDb.prepare(
      'SELECT ipa FROM phrase_pronunciation WHERE phrase_id=? AND variant_rank=1',
    ).get(upperId);
    assert.equal(lower.ipa, 'tuː‿das');
    assert.equal(upper.ipa, 'teːˈʔuː‿ˈkaɪ̯nə');

    const lowerResolution = phraseDb.prepare(
      'SELECT writer_surface,evidence_json FROM phrase_token_pronunciation_resolution WHERE phrase_id=? AND token_index=0',
    ).get(lowerId);
    const upperResolution = phraseDb.prepare(
      'SELECT writer_surface,evidence_json FROM phrase_token_pronunciation_resolution WHERE phrase_id=? AND token_index=0',
    ).get(upperId);
    assert.equal(lowerResolution.writer_surface, 'tu');
    assert.equal(upperResolution.writer_surface, 'TU');
    assert.equal(JSON.parse(lowerResolution.evidence_json).matching, 'exact_surface');
    assert.equal(JSON.parse(upperResolution.evidence_json).matching, 'exact_surface');
  } finally {
    writerDb.close();
    phraseDb.close();
  }
});
