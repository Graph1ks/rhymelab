import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import {
  ensurePhraseMosaicWindowStorage,
  generateCrossWordMosaicWindows,
} from '../scripts/phrase-mosaic-window-core.mjs';
import {
  computePhraseMosaicRetrievalFingerprint,
  materializePhraseMosaicRetrievalAnchors,
} from '../scripts/phrase-mosaic-retrieval-core.mjs';
import {
  computePhraseMosaicRetrievalV2Fingerprint,
  materializePhraseMosaicRetrievalV2Anchors,
  phraseMosaicV2QueryAnchors,
  retrievePhraseMosaicCandidatesV2,
} from '../scripts/phrase-mosaic-retrieval-v2-core.mjs';

function createDb() {
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
  return db;
}

function insertPhrase(db, {
  phraseId,
  canonical,
  ipa,
  boundary,
  tokenSyllableSpans,
}) {
  db.prepare(
    'INSERT INTO phrase(phrase_id,canonical,phrase_types_json,historical_state,modern_eligible) VALUES(?,?,?,?,1)',
  ).run(phraseId, canonical, '["phrase"]', 'current_or_unmarked');
  const pronunciationId = 'pron-' + phraseId;
  db.prepare(
    'INSERT INTO phrase_pronunciation(phrase_pronunciation_id,phrase_id,ipa,eligible) VALUES(?,?,?,1)',
  ).run(pronunciationId, phraseId, ipa);

  const tokens = tokenSyllableSpans.map(([start, end], tokenIndex) => ({
    token_index: tokenIndex,
    syllable_start: start,
    syllable_end: end,
  }));
  const windows = generateCrossWordMosaicWindows({
    phrasePronunciationId: pronunciationId,
    phraseId,
    ipa,
    wordBoundarySyllablePositions: [boundary],
    tokens,
  });

  const insert = db.prepare([
    'INSERT INTO phrase_mosaic_window(',
    'window_id,phrase_pronunciation_id,phrase_id,policy,syllable_start,syllable_end,syllable_count,',
    'phoneme_start,phoneme_end,phoneme_count,token_start_index,token_end_index,token_count,',
    'crossed_word_boundaries,word_boundary_syllable_offsets_json,starts_inside_token,ends_inside_token,',
    'phoneme_key,vowel_key,stress_pattern,final_coda_key,fingerprint)',
    ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ].join(''));
  for (const window of windows) {
    insert.run(
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
  return windows;
}

test('11D4 additive family anchors preserve accepted 11D2 fingerprint and repeat', () => {
  const db = createDb();
  try {
    insertPhrase(db, {
      phraseId: 'p1',
      canonical: 'be te',
      ipa: 'ˈbe‿tə',
      boundary: 1,
      tokenSyllableSpans: [[0, 1], [1, 2]],
    });
    materializePhraseMosaicRetrievalAnchors(db);
    const before = computePhraseMosaicRetrievalFingerprint(db);

    const first = materializePhraseMosaicRetrievalV2Anchors(db);
    const after = computePhraseMosaicRetrievalFingerprint(db);
    const second = materializePhraseMosaicRetrievalV2Anchors(db);

    assert.equal(after, before);
    assert.equal(first.sourceV1Fingerprint, before);
    assert.equal(first.sourceV1FingerprintUnchanged, true);
    assert.equal(first.anchorCount, 1);
    assert.equal(first.candidateFingerprint, computePhraseMosaicRetrievalV2Fingerprint(db));
    assert.equal(second.candidateFingerprint, first.candidateFingerprint);
    assert.equal(computePhraseMosaicRetrievalFingerprint(db), before);
  } finally {
    db.close();
  }
});

test('11D4 adds a full-surface domain for final-stressed multisyllabic queries', () => {
  const anchors = phraseMosaicV2QueryAnchors(analyzeGermanIpa('muˈziːk'));
  assert.equal(anchors.some((anchor) => anchor.kind === 'full_surface'), true);
  const full = anchors.find((anchor) => anchor.kind === 'full_surface');
  assert.equal(full.syllableCount, 2);
  assert.equal(full.vowelKey, 'u-iː');

  const mono = phraseMosaicV2QueryAnchors(analyzeGermanIpa('naxt'));
  assert.deepEqual(mono, []);
});

test('11D4 vowel-family bridge retrieves length-near vowels without exact-vowel equality', () => {
  const db = createDb();
  try {
    insertPhrase(db, {
      phraseId: 'family',
      canonical: 'be te',
      ipa: 'ˈbe‿tə',
      boundary: 1,
      tokenSyllableSpans: [[0, 1], [1, 2]],
    });
    materializePhraseMosaicRetrievalAnchors(db);
    materializePhraseMosaicRetrievalV2Anchors(db);

    const result = retrievePhraseMosaicCandidatesV2(db, 'ˈmeːtə', {
      perChannelLimit: 16,
      maxCandidates: 32,
    });
    const candidate = result.candidates.find((row) => row.canonical === 'be te');

    assert.ok(candidate, 'expected vowel-family bridge candidate');
    assert.equal(candidate.retrievalChannels.includes('vowel'), false);
    assert.equal(candidate.retrievalChannels.includes('vowel_family_coda_class'), true);
    assert.notEqual(candidate.score.type, 'weak');
  } finally {
    db.close();
  }
});

test('11D4 full-surface retrieval makes a final-stressed two-syllable query searchable', () => {
  const db = createDb();
  try {
    insertPhrase(db, {
      phraseId: 'music',
      canonical: 'du Bik',
      ipa: 'du‿ˈbiːk',
      boundary: 1,
      tokenSyllableSpans: [[0, 1], [1, 2]],
    });
    materializePhraseMosaicRetrievalAnchors(db);
    materializePhraseMosaicRetrievalV2Anchors(db);

    const result = retrievePhraseMosaicCandidatesV2(db, 'muˈziːk', {
      perChannelLimit: 16,
      maxCandidates: 32,
    });

    assert.equal(result.query.anchors.some((anchor) => anchor.kind === 'full_surface'), true);
    assert.ok(result.retrieval.uniqueWindowsScored > 0);
    const candidate = result.candidates.find((row) => row.canonical === 'du Bik');
    assert.ok(candidate, 'expected full-surface mosaic candidate');
    assert.equal(candidate.queryAnchor.kind, 'full_surface');
  } finally {
    db.close();
  }
});

test('11D4 filters weak candidates with no matched sound relation by default', () => {
  const db = createDb();
  try {
    insertPhrase(db, {
      phraseId: 'weak',
      canonical: 'zu ko er',
      ipa: 'ˈzuː‿koːɐ',
      boundary: 1,
      tokenSyllableSpans: [[0, 1], [1, 3]],
    });
    materializePhraseMosaicRetrievalAnchors(db);
    materializePhraseMosaicRetrievalV2Anchors(db);

    const defaultResult = retrievePhraseMosaicCandidatesV2(db, 'ˈnaxtə', {
      perChannelLimit: 16,
      maxCandidates: 32,
    });
    const controlResult = retrievePhraseMosaicCandidatesV2(db, 'ˈnaxtə', {
      perChannelLimit: 16,
      maxCandidates: 32,
      includeWeakUnrelated: true,
    });

    assert.ok(controlResult.retrieval.uniqueWindowsScored >= defaultResult.retrieval.uniqueWindowsScored);
    assert.ok(defaultResult.retrieval.weakUnrelatedFiltered >= 1);
    assert.equal(defaultResult.candidates.some((row) => row.canonical === 'zu ko er'), false);
    assert.equal(controlResult.candidates.some((row) => row.canonical === 'zu ko er'), true);
  } finally {
    db.close();
  }
});

test('11D4 vowel-family channel is index-backed', () => {
  const db = createDb();
  try {
    insertPhrase(db, {
      phraseId: 'family',
      canonical: 'be te',
      ipa: 'ˈbe‿tə',
      boundary: 1,
      tokenSyllableSpans: [[0, 1], [1, 2]],
    });
    materializePhraseMosaicRetrievalAnchors(db);
    materializePhraseMosaicRetrievalV2Anchors(db);

    const detail = db.prepare([
      'EXPLAIN QUERY PLAN SELECT window_id FROM phrase_mosaic_retrieval_v2_anchor',
      ' WHERE vowel_family_key=? AND final_coda_class=? AND syllable_count=?',
      ' ORDER BY window_id LIMIT 10',
    ].join('')).all('E_CLOSE-SCHWA', 'OPEN', 2)
      .map((row) => String(row.detail || ''))
      .join('\n');

    assert.match(detail, /idx_phrase_mosaic_retrieval_v2_family_coda/);
    assert.doesNotMatch(detail, /SCAN phrase_mosaic_retrieval_v2_anchor/);
  } finally {
    db.close();
  }
});
