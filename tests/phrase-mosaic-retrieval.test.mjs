import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  computePhraseMosaicWindowFingerprint,
  ensurePhraseMosaicWindowStorage,
  generateCrossWordMosaicWindows,
} from '../scripts/phrase-mosaic-window-core.mjs';
import {
  computePhraseMosaicRetrievalFingerprint,
  materializePhraseMosaicRetrievalAnchors,
  retrievePhraseMosaicCandidates,
} from '../scripts/phrase-mosaic-retrieval-core.mjs';

function insertPhrase(db, phraseId, canonical, ipa) {
  db.prepare(
    'INSERT INTO phrase(phrase_id,canonical,phrase_types_json,historical_state,modern_eligible) VALUES(?,?,?,?,1)',
  ).run(phraseId, canonical, '["phrase"]', 'current_or_unmarked');
  const pronunciationId = 'pron-' + phraseId;
  db.prepare(
    'INSERT INTO phrase_pronunciation(phrase_pronunciation_id,phrase_id,ipa,eligible) VALUES(?,?,?,1)',
  ).run(pronunciationId, phraseId, ipa);

  const windows = generateCrossWordMosaicWindows({
    phrasePronunciationId: pronunciationId,
    phraseId,
    ipa,
    wordBoundarySyllablePositions: [2],
    tokens: [
      { token_index: 0, syllable_start: 0, syllable_end: 2 },
      { token_index: 1, syllable_start: 2, syllable_end: 4 },
    ],
  });
  const insertWindow = db.prepare([
    'INSERT INTO phrase_mosaic_window(',
    'window_id,phrase_pronunciation_id,phrase_id,policy,syllable_start,syllable_end,syllable_count,',
    'phoneme_start,phoneme_end,phoneme_count,token_start_index,token_end_index,token_count,',
    'crossed_word_boundaries,word_boundary_syllable_offsets_json,starts_inside_token,ends_inside_token,',
    'phoneme_key,vowel_key,stress_pattern,final_coda_key,fingerprint)',
    ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ].join(''));
  for (const window of windows) {
    insertWindow.run(
      window.windowId,
      window.phrasePronunciationId,
      window.phraseId,
      'de-cross-word-syllable-windows-v1',
      window.syllableStart,
      window.syllableEnd,
      window.syllableCount,
      window.phonemeStart,
      window.phonemeEnd,
      window.phonemeCount,
      window.tokenStartIndex,
      window.tokenEndIndex,
      window.tokenCount,
      window.crossedWordBoundaries,
      JSON.stringify(window.wordBoundarySyllableOffsets),
      Number(window.startsInsideToken),
      Number(window.endsInsideToken),
      window.phonemeKey,
      window.vowelKey,
      window.stressPattern,
      window.finalCodaKey,
      window.fingerprint,
    );
  }
  return windows.length;
}

function fixtureDb() {
  const db = new DatabaseSync(':memory:');
  db.exec([
    'PRAGMA foreign_keys=ON;',
    'CREATE TABLE phrase(',
    ' phrase_id TEXT PRIMARY KEY,canonical TEXT NOT NULL,phrase_types_json TEXT NOT NULL,',
    ' historical_state TEXT NOT NULL,modern_eligible INTEGER NOT NULL);',
    'CREATE TABLE phrase_pronunciation(',
    ' phrase_pronunciation_id TEXT PRIMARY KEY,phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id),',
    ' ipa TEXT NOT NULL,eligible INTEGER NOT NULL);',
  ].join('\n'));
  ensurePhraseMosaicWindowStorage(db);
  const first = insertPhrase(db, 'p1', 'keine Ahnung', 'ˈkaɪ̯nə‿ˈaːnʊŋ');
  const second = insertPhrase(db, 'p2', 'keine Ordnung', 'ˈkaɪ̯nə‿ˈɔʁdnʊŋ');
  return { db, windowCount: first + second };
}

test('11D2 retrieval anchors preserve the accepted 11D1 window fingerprint', () => {
  const { db, windowCount } = fixtureDb();
  try {
    const before = computePhraseMosaicWindowFingerprint(db);
    const first = materializePhraseMosaicRetrievalAnchors(db);
    const after = computePhraseMosaicWindowFingerprint(db);

    assert.equal(first.anchorCount, windowCount);
    assert.equal(first.sourceWindowFingerprint, before);
    assert.equal(first.windowFingerprintUnchanged, true);
    assert.equal(after, before);
    assert.equal(first.anchorFingerprint, computePhraseMosaicRetrievalFingerprint(db));

    const second = materializePhraseMosaicRetrievalAnchors(db);
    assert.equal(second.anchorFingerprint, first.anchorFingerprint);
    assert.equal(second.anchorCount, first.anchorCount);
    assert.equal(computePhraseMosaicWindowFingerprint(db), before);
  } finally {
    db.close();
  }
});

test('11D2 exact rhyme-tail retrieval ignores the first onset and reuses de-phon-v3 scoring', () => {
  const { db } = fixtureDb();
  try {
    materializePhraseMosaicRetrievalAnchors(db);
    const result = retrievePhraseMosaicCandidates(db, 'ˈmaɪ̯nəˈaːnʊŋ', {
      perChannelLimit: 16,
      maxCandidates: 32,
    });

    assert.ok(result.query.anchors.length >= 1);
    assert.equal(result.retrieval.fullCorpusScan, false);
    const exact = result.candidates.find(
      (candidate) => candidate.canonical === 'keine Ahnung'
        && candidate.syllableStart === 0
        && candidate.syllableEnd === 4,
    );
    assert.ok(exact, 'expected the full keine Ahnung window');
    assert.ok(exact.retrievalChannels.includes('exact_tail'));
    assert.equal(exact.score.type, 'multisyllabic_perfect');
    assert.equal(exact.score.overall, 1);

    const broader = result.candidates.find(
      (candidate) => candidate.canonical === 'keine Ordnung'
    );
    assert.ok(broader, 'expected bounded broader-anchor retrieval');
    assert.ok(
      broader.retrievalChannels.includes('final_nucleus_coda_class')
      || broader.retrievalChannels.includes('vowel'),
    );
    assert.ok(broader.score.overall < exact.score.overall);
  } finally {
    db.close();
  }
});

test('11D2 retrieval SQL uses explicit indexes for every candidate channel', () => {
  const { db } = fixtureDb();
  try {
    materializePhraseMosaicRetrievalAnchors(db);
    const checks = [
      {
        sql: 'EXPLAIN QUERY PLAN SELECT window_id FROM phrase_mosaic_retrieval_anchor WHERE exact_tail_key=? AND syllable_count=? ORDER BY window_id LIMIT 10',
        args: ['aɪ.nə.aː.nʊŋ', 4],
        index: 'idx_phrase_mosaic_retrieval_exact',
      },
      {
        sql: 'EXPLAIN QUERY PLAN SELECT window_id FROM phrase_mosaic_retrieval_anchor WHERE vowel_key=? AND final_coda_key=? AND syllable_count=? ORDER BY window_id LIMIT 10',
        args: ['aɪ-ə-aː-ʊ', 'ŋ', 4],
        index: 'idx_phrase_mosaic_retrieval_vowel_coda',
      },
      {
        sql: 'EXPLAIN QUERY PLAN SELECT window_id FROM phrase_mosaic_retrieval_anchor WHERE vowel_key=? AND syllable_count=? ORDER BY window_id LIMIT 10',
        args: ['aɪ-ə-aː-ʊ', 4],
        index: 'idx_phrase_mosaic_retrieval_vowel',
      },
      {
        sql: 'EXPLAIN QUERY PLAN SELECT window_id FROM phrase_mosaic_retrieval_anchor WHERE final_nucleus=? AND final_coda_class=? AND syllable_count BETWEEN ? AND ? ORDER BY syllable_count,window_id LIMIT 10',
        args: ['ʊ', 'DOR-NAS', 3, 5],
        index: 'idx_phrase_mosaic_retrieval_final',
      },
    ];

    for (const check of checks) {
      const detail = db.prepare(check.sql).all(...check.args)
        .map((row) => String(row.detail || ''))
        .join('\n');
      assert.match(detail, new RegExp(check.index));
      assert.doesNotMatch(detail, /SCAN phrase_mosaic_retrieval_anchor/);
    }
  } finally {
    db.close();
  }
});

test('11D2 enforces hard per-channel and final candidate bounds', () => {
  const { db } = fixtureDb();
  try {
    materializePhraseMosaicRetrievalAnchors(db);
    const result = retrievePhraseMosaicCandidates(db, 'ˈmaɪ̯nəˈaːnʊŋ', {
      perChannelLimit: 1,
      maxCandidates: 2,
    });
    assert.equal(result.bounds.perChannelLimit, 1);
    assert.equal(result.bounds.maxCandidates, 2);
    assert.ok(result.candidates.length <= 2);
    assert.ok(
      result.retrieval.rawAnchorWindowMatches
      <= result.bounds.maximumRawRowsBeforeDedup,
    );
  } finally {
    db.close();
  }
});
