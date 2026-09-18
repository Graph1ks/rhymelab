import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  computePhraseMosaicWindowFingerprint,
  generateCrossWordMosaicWindows,
  materializePhraseMosaicWindows,
} from '../scripts/phrase-mosaic-window-core.mjs';

function createFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec([
    'PRAGMA foreign_keys=ON;',
    'CREATE TABLE phrase_pronunciation(',
    ' phrase_pronunciation_id TEXT PRIMARY KEY, phrase_id TEXT NOT NULL, ipa TEXT NOT NULL,',
    ' syllable_count INTEGER NOT NULL, eligible INTEGER NOT NULL,',
    ' word_boundary_syllable_positions_json TEXT NOT NULL);',
    'CREATE TABLE phrase_pronunciation_token(',
    ' phrase_pronunciation_id TEXT NOT NULL REFERENCES phrase_pronunciation(phrase_pronunciation_id) ON DELETE CASCADE,',
    ' token_index INTEGER NOT NULL, syllable_start INTEGER NOT NULL, syllable_end INTEGER NOT NULL,',
    ' PRIMARY KEY(phrase_pronunciation_id,token_index));',
  ].join('\n'));

  db.prepare([
    'INSERT INTO phrase_pronunciation(',
    'phrase_pronunciation_id,phrase_id,ipa,syllable_count,eligible,word_boundary_syllable_positions_json)',
    ' VALUES(?,?,?,?,?,?)',
  ].join('')).run(
    'pron-1',
    'phrase-1',
    'ˈkaɪ̯nə‿ˈaːnʊŋ',
    4,
    1,
    '[2]',
  );
  const insertToken = db.prepare([
    'INSERT INTO phrase_pronunciation_token(',
    'phrase_pronunciation_id,token_index,syllable_start,syllable_end) VALUES(?,?,?,?)',
  ].join(''));
  insertToken.run('pron-1', 0, 0, 2);
  insertToken.run('pron-1', 1, 2, 4);

  db.prepare([
    'INSERT INTO phrase_pronunciation(',
    'phrase_pronunciation_id,phrase_id,ipa,syllable_count,eligible,word_boundary_syllable_positions_json)',
    ' VALUES(?,?,?,?,?,?)',
  ].join('')).run(
    'pron-2',
    'phrase-2',
    'ˈaːnʊŋ',
    2,
    1,
    '[]',
  );
  insertToken.run('pron-2', 0, 0, 2);
  return db;
}

test('11D1 generates only syllable windows that strictly cross a word boundary', () => {
  const windows = generateCrossWordMosaicWindows({
    phrasePronunciationId: 'pron-1',
    phraseId: 'phrase-1',
    ipa: 'ˈkaɪ̯nə‿ˈaːnʊŋ',
    wordBoundarySyllablePositions: [2],
    tokens: [
      { token_index: 0, syllable_start: 0, syllable_end: 2 },
      { token_index: 1, syllable_start: 2, syllable_end: 4 },
    ],
  }, { minSyllables: 2, maxSyllables: 3 });

  assert.deepEqual(
    windows.map((row) => [row.syllableStart, row.syllableEnd]),
    [[0, 3], [1, 3], [1, 4]],
  );
  assert.ok(windows.every((row) => row.crossedWordBoundaries === 1));
  assert.ok(windows.every((row) => row.tokenStartIndex === 0 && row.tokenEndIndex === 1));
  assert.ok(windows.every((row) => row.phonemeKey.length > 0));
  assert.ok(windows.every((row) => row.vowelKey.length > 0));

  const middle = windows.find((row) => row.syllableStart === 1 && row.syllableEnd === 3);
  assert.deepEqual(middle.wordBoundarySyllableOffsets, [1]);
  assert.equal(middle.startsInsideToken, true);
  assert.equal(middle.endsInsideToken, true);
  assert.equal(middle.syllableCount, 2);
});

test('11D1 materialization is deterministic and skips phrases without crossed boundaries', () => {
  const db = createFixture();
  try {
    const first = materializePhraseMosaicWindows(db, { minSyllables: 2, maxSyllables: 3 });
    const firstFingerprint = computePhraseMosaicWindowFingerprint(db);
    const rows = db.prepare(
      'SELECT phrase_id,syllable_start,syllable_end,crossed_word_boundaries FROM phrase_mosaic_window ORDER BY phrase_id,syllable_start,syllable_end',
    ).all();

    assert.equal(first.pronunciationCount, 2);
    assert.equal(first.phrasesWithWindows, 1);
    assert.equal(first.windowCount, 3);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.phrase_id === 'phrase-1'));
    assert.ok(rows.every((row) => row.crossed_word_boundaries === 1));
    assert.equal(first.windowFingerprint, firstFingerprint);

    const second = materializePhraseMosaicWindows(db, { minSyllables: 2, maxSyllables: 3 });
    const secondFingerprint = computePhraseMosaicWindowFingerprint(db);
    assert.equal(second.windowCount, first.windowCount);
    assert.equal(secondFingerprint, firstFingerprint);

    const indexes = db.prepare(
      "SELECT name FROM sqlite_schema WHERE type='index' AND name LIKE 'idx_phrase_mosaic_window_%' ORDER BY name",
    ).all().map((row) => row.name);
    assert.deepEqual(indexes, [
      'idx_phrase_mosaic_window_exact',
      'idx_phrase_mosaic_window_phrase',
      'idx_phrase_mosaic_window_vowel',
    ]);
  } finally {
    db.close();
  }
});
