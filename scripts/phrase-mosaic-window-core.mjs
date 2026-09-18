import { createHash } from 'node:crypto';
import { analyzeGermanIpa } from './german-ipa.mjs';

export const PHRASE_MOSAIC_SCHEMA = 'rhymelab-phrase-mosaic-v1';
export const PHRASE_MOSAIC_WINDOW_POLICY = 'de-cross-word-syllable-windows-v1';
export const PHRASE_MOSAIC_MIN_SYLLABLES = 2;
export const PHRASE_MOSAIC_MAX_SYLLABLES = 6;

const json = (value) => JSON.stringify(value);
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const tableExists = (db, name) => Boolean(db.prepare(
  "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?",
).get(name));

function integerArray(value, field) {
  const parsed = Array.isArray(value) ? value : JSON.parse(String(value || '[]'));
  if (!Array.isArray(parsed) || parsed.some((item) => !Number.isInteger(Number(item)))) {
    throw new Error(field + ' must be an integer array');
  }
  return parsed.map(Number);
}

function syllablePhonemeSpans(analysis) {
  const spans = [];
  let offset = 0;
  for (const syllable of analysis.syllables) {
    const count = syllable.onset.length + 1 + syllable.coda.length;
    spans.push({ start: offset, end: offset + count });
    offset += count;
  }
  if (offset !== analysis.phonemes.length) {
    throw new Error(
      'Syllable/phoneme reconstruction mismatch: ' + offset + ' != ' + analysis.phonemes.length,
    );
  }
  return spans;
}

function normalizeTokenRows(tokens) {
  return [...tokens].map((row) => ({
    tokenIndex: Number(row.token_index ?? row.tokenIndex),
    syllableStart: Number(row.syllable_start ?? row.syllableStart),
    syllableEnd: Number(row.syllable_end ?? row.syllableEnd),
  })).sort((a, b) => a.tokenIndex - b.tokenIndex);
}

function validateTokenCoverage(tokens, syllableCount) {
  if (!tokens.length) throw new Error('Phrase pronunciation has no token span rows');
  for (const token of tokens) {
    if (!Number.isInteger(token.tokenIndex)
      || !Number.isInteger(token.syllableStart)
      || !Number.isInteger(token.syllableEnd)
      || token.syllableStart < 0
      || token.syllableEnd <= token.syllableStart
      || token.syllableEnd > syllableCount) {
      throw new Error('Invalid phrase pronunciation token syllable span');
    }
  }
}

function windowFingerprintPayload(window) {
  return {
    phrasePronunciationId: window.phrasePronunciationId,
    phraseId: window.phraseId,
    syllableStart: window.syllableStart,
    syllableEnd: window.syllableEnd,
    phonemeStart: window.phonemeStart,
    phonemeEnd: window.phonemeEnd,
    tokenStartIndex: window.tokenStartIndex,
    tokenEndIndex: window.tokenEndIndex,
    crossedWordBoundaries: window.crossedWordBoundaries,
    wordBoundarySyllableOffsets: window.wordBoundarySyllableOffsets,
    startsInsideToken: window.startsInsideToken,
    endsInsideToken: window.endsInsideToken,
    phonemeKey: window.phonemeKey,
    vowelKey: window.vowelKey,
    stressPattern: window.stressPattern,
    finalCodaKey: window.finalCodaKey,
    policy: PHRASE_MOSAIC_WINDOW_POLICY,
  };
}

export function generateCrossWordMosaicWindows({
  phrasePronunciationId,
  phraseId,
  ipa,
  wordBoundarySyllablePositions,
  tokens,
}, {
  minSyllables = PHRASE_MOSAIC_MIN_SYLLABLES,
  maxSyllables = PHRASE_MOSAIC_MAX_SYLLABLES,
} = {}) {
  if (!phrasePronunciationId || !phraseId) {
    throw new Error('phrasePronunciationId and phraseId are required');
  }
  const minimum = Math.max(2, Number(minSyllables) || PHRASE_MOSAIC_MIN_SYLLABLES);
  const maximum = Math.max(minimum, Number(maxSyllables) || PHRASE_MOSAIC_MAX_SYLLABLES);
  const analysis = analyzeGermanIpa(ipa);
  const boundaries = integerArray(
    wordBoundarySyllablePositions,
    'wordBoundarySyllablePositions',
  ).sort((a, b) => a - b);
  if (boundaries.some((position, index) =>
    position <= 0
    || position >= analysis.syllableCount
    || (index > 0 && position === boundaries[index - 1])
  )) {
    throw new Error('Invalid or duplicate word-boundary syllable position');
  }

  const normalizedTokens = normalizeTokenRows(tokens);
  validateTokenCoverage(normalizedTokens, analysis.syllableCount);
  const syllableSpans = syllablePhonemeSpans(analysis);
  const windows = [];

  for (let start = 0; start < analysis.syllableCount; start += 1) {
    const largest = Math.min(maximum, analysis.syllableCount - start);
    for (let length = minimum; length <= largest; length += 1) {
      const end = start + length;
      const crossed = boundaries.filter((position) => position > start && position < end);
      if (!crossed.length) continue;

      const overlappingTokens = normalizedTokens.filter(
        (token) => token.syllableStart < end && token.syllableEnd > start,
      );
      if (overlappingTokens.length < 2) {
        throw new Error('Cross-word window did not overlap at least two token spans');
      }

      const syllables = analysis.syllables.slice(start, end);
      const phonemeStart = syllableSpans[start].start;
      const phonemeEnd = syllableSpans[end - 1].end;
      const phonemes = analysis.phonemes.slice(phonemeStart, phonemeEnd);
      const firstToken = overlappingTokens[0];
      const lastToken = overlappingTokens.at(-1);
      const startsInsideToken = start > firstToken.syllableStart;
      const endsInsideToken = end < lastToken.syllableEnd;

      const row = {
        phrasePronunciationId,
        phraseId,
        syllableStart: start,
        syllableEnd: end,
        syllableCount: length,
        phonemeStart,
        phonemeEnd,
        phonemeCount: phonemes.length,
        tokenStartIndex: firstToken.tokenIndex,
        tokenEndIndex: lastToken.tokenIndex,
        tokenCount: lastToken.tokenIndex - firstToken.tokenIndex + 1,
        crossedWordBoundaries: crossed.length,
        wordBoundarySyllableOffsets: crossed.map((position) => position - start),
        startsInsideToken,
        endsInsideToken,
        phonemeKey: phonemes.join(' '),
        vowelKey: syllables.map((syllable) => syllable.nucleus).join('-'),
        stressPattern: syllables.map((syllable) => syllable.stressLevel).join(''),
        finalCodaKey: syllables.at(-1).coda.join(' '),
      };
      row.windowId = 'mosaic-window:' + sha256(json([
        phrasePronunciationId,
        start,
        end,
        PHRASE_MOSAIC_WINDOW_POLICY,
      ])).slice(0, 24);
      row.fingerprint = sha256(json(windowFingerprintPayload(row)));
      windows.push(row);
    }
  }

  return windows;
}

export function ensurePhraseMosaicWindowStorage(db) {
  db.exec([
    'CREATE TABLE IF NOT EXISTS phrase_mosaic_window(',
    ' window_id TEXT PRIMARY KEY,',
    ' phrase_pronunciation_id TEXT NOT NULL REFERENCES phrase_pronunciation(phrase_pronunciation_id) ON DELETE CASCADE,',
    ' phrase_id TEXT NOT NULL,',
    ' policy TEXT NOT NULL,',
    ' syllable_start INTEGER NOT NULL, syllable_end INTEGER NOT NULL, syllable_count INTEGER NOT NULL,',
    ' phoneme_start INTEGER NOT NULL, phoneme_end INTEGER NOT NULL, phoneme_count INTEGER NOT NULL,',
    ' token_start_index INTEGER NOT NULL, token_end_index INTEGER NOT NULL, token_count INTEGER NOT NULL,',
    ' crossed_word_boundaries INTEGER NOT NULL, word_boundary_syllable_offsets_json TEXT NOT NULL,',
    ' starts_inside_token INTEGER NOT NULL CHECK(starts_inside_token IN (0,1)),',
    ' ends_inside_token INTEGER NOT NULL CHECK(ends_inside_token IN (0,1)),',
    ' phoneme_key TEXT NOT NULL, vowel_key TEXT NOT NULL, stress_pattern TEXT NOT NULL, final_coda_key TEXT NOT NULL,',
    ' fingerprint TEXT NOT NULL,',
    ' UNIQUE(phrase_pronunciation_id,syllable_start,syllable_end));',
    'CREATE INDEX IF NOT EXISTS idx_phrase_mosaic_window_exact',
    ' ON phrase_mosaic_window(phoneme_key,syllable_count,crossed_word_boundaries);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_mosaic_window_vowel',
    ' ON phrase_mosaic_window(vowel_key,syllable_count,crossed_word_boundaries);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_mosaic_window_phrase',
    ' ON phrase_mosaic_window(phrase_id,syllable_start,syllable_end);',
  ].join('\n'));
}

export function computePhraseMosaicWindowFingerprint(db) {
  if (!tableExists(db, 'phrase_mosaic_window')) return null;
  const hash = createHash('sha256');
  for (const row of db.prepare([
    'SELECT window_id,phrase_pronunciation_id,phrase_id,policy,',
    'syllable_start,syllable_end,syllable_count,phoneme_start,phoneme_end,phoneme_count,',
    'token_start_index,token_end_index,token_count,crossed_word_boundaries,',
    'word_boundary_syllable_offsets_json,starts_inside_token,ends_inside_token,',
    'phoneme_key,vowel_key,stress_pattern,final_coda_key,fingerprint',
    ' FROM phrase_mosaic_window ORDER BY window_id',
  ].join('')).iterate()) {
    hash.update(JSON.stringify(row));
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function materializePhraseMosaicWindows(db, options = {}) {
  if (!tableExists(db, 'phrase_pronunciation')
    || !tableExists(db, 'phrase_pronunciation_token')) {
    throw new Error('Phase 11C1 phrase pronunciation tables are required');
  }
  ensurePhraseMosaicWindowStorage(db);

  const pronunciationRows = db.prepare([
    'SELECT phrase_pronunciation_id,phrase_id,ipa,syllable_count,',
    'word_boundary_syllable_positions_json',
    ' FROM phrase_pronunciation WHERE eligible=1 ORDER BY phrase_pronunciation_id',
  ].join(''));
  const tokenRows = db.prepare([
    'SELECT token_index,syllable_start,syllable_end',
    ' FROM phrase_pronunciation_token WHERE phrase_pronunciation_id=? ORDER BY token_index',
  ].join(''));
  const insert = db.prepare([
    'INSERT INTO phrase_mosaic_window(',
    'window_id,phrase_pronunciation_id,phrase_id,policy,syllable_start,syllable_end,syllable_count,',
    'phoneme_start,phoneme_end,phoneme_count,token_start_index,token_end_index,token_count,',
    'crossed_word_boundaries,word_boundary_syllable_offsets_json,starts_inside_token,ends_inside_token,',
    'phoneme_key,vowel_key,stress_pattern,final_coda_key,fingerprint)',
    ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ].join(''));

  const minSyllables = Math.max(
    2,
    Number(options.minSyllables) || PHRASE_MOSAIC_MIN_SYLLABLES,
  );
  const maxSyllables = Math.max(
    minSyllables,
    Number(options.maxSyllables) || PHRASE_MOSAIC_MAX_SYLLABLES,
  );

  let pronunciationCount = 0;
  let phrasesWithWindows = 0;
  let windowCount = 0;
  const syllableCountDistribution = new Map();
  const boundaryCountDistribution = new Map();

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM phrase_mosaic_window;');
    for (const pronunciation of pronunciationRows.iterate()) {
      pronunciationCount += 1;
      const windows = generateCrossWordMosaicWindows({
        phrasePronunciationId: pronunciation.phrase_pronunciation_id,
        phraseId: pronunciation.phrase_id,
        ipa: pronunciation.ipa,
        wordBoundarySyllablePositions: pronunciation.word_boundary_syllable_positions_json,
        tokens: tokenRows.all(pronunciation.phrase_pronunciation_id),
      }, { minSyllables, maxSyllables });
      if (windows.length) phrasesWithWindows += 1;

      for (const window of windows) {
        insert.run(
          window.windowId,
          window.phrasePronunciationId,
          window.phraseId,
          PHRASE_MOSAIC_WINDOW_POLICY,
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
          json(window.wordBoundarySyllableOffsets),
          Number(window.startsInsideToken),
          Number(window.endsInsideToken),
          window.phonemeKey,
          window.vowelKey,
          window.stressPattern,
          window.finalCodaKey,
          window.fingerprint,
        );
        windowCount += 1;
        syllableCountDistribution.set(
          window.syllableCount,
          (syllableCountDistribution.get(window.syllableCount) || 0) + 1,
        );
        boundaryCountDistribution.set(
          window.crossedWordBoundaries,
          (boundaryCountDistribution.get(window.crossedWordBoundaries) || 0) + 1,
        );
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }

  return {
    schema: PHRASE_MOSAIC_SCHEMA,
    policy: PHRASE_MOSAIC_WINDOW_POLICY,
    minSyllables,
    maxSyllables,
    pronunciationCount,
    phrasesWithWindows,
    windowCount,
    syllableCountDistribution: Object.fromEntries(
      [...syllableCountDistribution.entries()].sort((a, b) => a[0] - b[0]),
    ),
    boundaryCountDistribution: Object.fromEntries(
      [...boundaryCountDistribution.entries()].sort((a, b) => a[0] - b[0]),
    ),
    windowFingerprint: computePhraseMosaicWindowFingerprint(db),
  };
}
