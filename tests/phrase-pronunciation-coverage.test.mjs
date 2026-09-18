import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  createPhraseCatalogStorage,
  phraseIdForNormalized,
  tokenizePhrase,
  tokenKey,
} from '../scripts/phrase-catalog-core.mjs';
import { materializePhrasePronunciations } from '../scripts/phrase-pronunciation-core.mjs';
import { analyzePhrasePronunciationCoverage } from '../scripts/phrase-pronunciation-coverage-core.mjs';

function insertPhrase(db, canonical) {
  const normalized = canonical.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-DE');
  const tokens = tokenizePhrase(canonical);
  const phraseId = phraseIdForNormalized(normalized);
  db.prepare([
    'INSERT INTO phrase(phrase_id,canonical,normalized,token_key,token_count,phrase_types_json,',
    'historical_state,modern_eligible,identity_fingerprint) VALUES(?,?,?,?,?,?,?,?,?)',
  ].join('')).run(
    phraseId,canonical,normalized,tokenKey(tokens),tokens.length,'["phrase"]',
    'current_or_unmarked',1,'fixture-' + phraseId,
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
  insert.run(1,10,'keine','keine',0,100,'ˈkaɪ̯nə','fixture','[]',1,1,'dictionary',null,'det','kein');
  insert.run(2,20,'Ahnung','ahnung',0,200,'ˈaːnʊŋ','fixture','[]',1,1,'dictionary',null,'noun','Ahnung');
  insert.run(3,30,'das','das',0,20,'das','fixture','[]',1,1,'dictionary',null,'pron','das');
  return db;
}

test('11C2 coverage analysis ranks true single-token unlock impact without double counting', () => {
  const phraseDb = new DatabaseSync(':memory:');
  const writerDb = createWriterFixture();
  try {
    phraseDb.exec('PRAGMA foreign_keys=ON;');
    createPhraseCatalogStorage(phraseDb);
    insertPhrase(phraseDb, 'keine Ahnung');
    insertPhrase(phraseDb, 'keine Quuxwort');
    insertPhrase(phraseDb, 'Quuxwort das');
    insertPhrase(phraseDb, 'Quuxwort Quuxwort');
    insertPhrase(phraseDb, 'Quuxwort Blorpwort');
    insertPhrase(phraseDb, 'Blorpwort das');

    materializePhrasePronunciations(phraseDb, writerDb);
    const result = analyzePhrasePronunciationCoverage(phraseDb);

    assert.equal(result.totalPhrases, 6);
    assert.equal(result.readyPhrases, 1);
    assert.equal(result.blockedPhrases, 5);
    assert.equal(result.distinctUnresolvedNormalizedTokens, 2);
    assert.equal(result.oneDistinctBlockerPhrases, 4);

    const [quux, blorp] = result.topBlockers;
    assert.equal(quux.normalized, 'quuxwort');
    assert.equal(quux.tokenOccurrences, 5);
    assert.equal(quux.phraseCount, 4);
    assert.equal(quux.singleBlockerPhraseCount, 3);
    assert.equal(quux.singleBlockerModernPhraseCount, 3);

    assert.equal(blorp.normalized, 'blorpwort');
    assert.equal(blorp.phraseCount, 2);
    assert.equal(blorp.singleBlockerPhraseCount, 1);

    assert.deepEqual(
      result.unlockCurve.map((row) => ({
        top: row.topNormalizedTokens,
        unlocked: row.resolutionUnblockedPhrases,
        coverage: row.projectedPhraseCoverageUpperBoundPct,
      })),
      [
        { top: 1, unlocked: 3, coverage: 66.67 },
        { top: 2, unlocked: 5, coverage: 100 },
      ],
    );
  } finally {
    writerDb.close();
    phraseDb.close();
  }
});
