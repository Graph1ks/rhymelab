import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  ensurePhraseMosaicWindowStorage,
  generateCrossWordMosaicWindows,
} from '../scripts/phrase-mosaic-window-core.mjs';
import {
  materializePhraseMosaicRetrievalAnchors,
} from '../scripts/phrase-mosaic-retrieval-core.mjs';
import {
  diagnosePhraseMosaicQuery,
  runPhraseMosaicQueryDiagnostics,
} from '../scripts/phrase-mosaic-query-diagnostics-core.mjs';

function createPhraseDb() {
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

  const addPhrase = (phraseId, canonical, ipa) => {
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
  };

  addPhrase('p1', 'keine Ahnung', 'ˈkaɪ̯nə‿ˈaːnʊŋ');
  addPhrase('p2', 'keine Ordnung', 'ˈkaɪ̯nə‿ˈɔʁdnʊŋ');
  materializePhraseMosaicRetrievalAnchors(db);
  return db;
}

function createWriterDb() {
  const db = new DatabaseSync(':memory:');
  db.exec([
    'CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);',
    "INSERT INTO meta(key,value) VALUES('language','de');",
    'CREATE TABLE hot(',
    ' surface TEXT,normalized TEXT,usage_rank INTEGER,usage_score REAL,usage_count INTEGER,',
    ' usage_source_count INTEGER,lemma TEXT,pos TEXT,gender TEXT,lexicon_layer TEXT,entity_kind TEXT,',
    ' historical INTEGER,lexical_tags TEXT,syllable_count INTEGER,stress TEXT,primary_stress INTEGER,',
    ' ipa TEXT,pronunciation_preferred INTEGER,pronunciation_eligible INTEGER,pronunciation_rank INTEGER,',
    ' pronunciation_evidence INTEGER,pronunciation_source_order INTEGER,pronunciation_source TEXT,',
    ' pronunciation_tags TEXT,pronunciation_raw_tags TEXT,pronunciation_flags TEXT,locale TEXT,dialect TEXT,',
    ' pronunciation_register TEXT,phonemes TEXT,rhyme_tail TEXT,final_tail TEXT,vowels TEXT,consonants TEXT,',
    ' rhyme_syllables INTEGER);',
  ].join('\n'));

  const insert = db.prepare([
    'INSERT INTO hot(',
    'surface,normalized,usage_rank,usage_score,usage_count,usage_source_count,lemma,pos,gender,',
    'lexicon_layer,entity_kind,historical,lexical_tags,syllable_count,stress,primary_stress,ipa,',
    'pronunciation_preferred,pronunciation_eligible,pronunciation_rank,pronunciation_evidence,',
    'pronunciation_source_order,pronunciation_source,pronunciation_tags,pronunciation_raw_tags,',
    'pronunciation_flags,locale,dialect,pronunciation_register,phonemes,rhyme_tail,final_tail,',
    'vowels,consonants,rhyme_syllables)',
    ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ].join(''));

  const add = (surface, normalized, ipa, syllables, primaryStress) => insert.run(
    surface, normalized, 1, 1, 1, 1, normalized, 'NOUN', null,
    'dictionary', null, 0, '[]', syllables, '', primaryStress, ipa,
    1, 1, 1, 1, 1, 'fixture', '[]', '[]', '[]', null, null, null,
    '', '', '', '', '', syllables,
  );

  add('MeineAhnung', 'meineahnung', 'ˈmaɪ̯nəˈaːnʊŋ', 4, 1);
  add('Nacht', 'nacht', 'naxt', 1, 1);
  add('Musik', 'musik', 'muˈziːk', 2, 2);
  return db;
}

test('representative diagnostics return deterministic semantic results for a supported query', () => {
  const phraseDb = createPhraseDb();
  const writerDb = createWriterDb();
  try {
    const first = diagnosePhraseMosaicQuery({
      phraseDb,
      writerDb,
      word: 'MeineAhnung',
      phenomena: ['fixture'],
      perChannelLimit: 16,
      maxCandidates: 32,
      topCandidates: 10,
    });
    const second = diagnosePhraseMosaicQuery({
      phraseDb,
      writerDb,
      word: 'MeineAhnung',
      phenomena: ['fixture'],
      perChannelLimit: 16,
      maxCandidates: 32,
      topCandidates: 10,
    });

    assert.equal(first.status, 'ok');
    assert.equal(first.semanticFingerprint, second.semanticFingerprint);
    assert.equal(first.retrieval.fullCorpusScan, false);
    assert.ok(first.candidateSummary.returnedCandidates > 0);
    assert.ok(first.candidateSummary.uniqueCanonicalPhrases > 0);
    assert.ok(first.topCandidates.some((candidate) => candidate.canonical === 'keine Ahnung'));
    assert.ok(
      first.topCandidates.some((candidate) =>
        candidate.canonical === 'keine Ahnung'
        && candidate.score.type === 'multisyllabic_perfect'
      ),
    );
  } finally {
    phraseDb.close();
    writerDb.close();
  }
});

test('diagnostics expose current 2-syllable mosaic query-domain limitations explicitly', () => {
  const phraseDb = createPhraseDb();
  const writerDb = createWriterDb();
  try {
    const mono = diagnosePhraseMosaicQuery({ phraseDb, writerDb, word: 'Nacht' });
    assert.equal(mono.status, 'no_mosaic_query_anchor');
    assert.equal(mono.reason, 'query_below_2_syllable_mosaic_minimum');

    const finalStress = diagnosePhraseMosaicQuery({ phraseDb, writerDb, word: 'Musik' });
    assert.equal(finalStress.status, 'no_mosaic_query_anchor');
    assert.equal(
      finalStress.reason,
      'accepted_rhyme_domain_below_2_syllable_mosaic_minimum',
    );
    assert.equal(finalStress.query.syllableCount, 2);
  } finally {
    phraseDb.close();
    writerDb.close();
  }
});

test('suite diagnostics aggregate statuses and remain semantically repeatable', () => {
  const phraseDb = createPhraseDb();
  const writerDb = createWriterDb();
  try {
    const options = {
      phraseDb,
      writerDb,
      queries: [
        { word: 'MeineAhnung', phenomena: ['fixture'] },
        { word: 'Nacht', phenomena: ['monosyllabic'] },
        { word: 'Musik', phenomena: ['final_stress'] },
      ],
      perChannelLimit: 16,
      maxCandidates: 32,
      topCandidates: 5,
    };
    const first = runPhraseMosaicQueryDiagnostics(options);
    const second = runPhraseMosaicQueryDiagnostics(options);

    assert.equal(first.queryCount, 3);
    assert.deepEqual(first.statusCounts, {
      no_mosaic_query_anchor: 2,
      ok: 1,
    });
    assert.equal(first.semanticFingerprint, second.semanticFingerprint);
    assert.ok(first.totalReturnedCandidates > 0);
  } finally {
    phraseDb.close();
    writerDb.close();
  }
});
