import { createHash } from 'node:crypto';
import { analyzeGermanIpa } from './german-ipa.mjs';
import {
  eligibleGermanRhymeAnchorPositions,
  germanAnalysisAtRhymeAnchor,
} from './german-rhyme-anchors.mjs';
import {
  coarseCodaClass,
  scoreGermanRhymeAnalyses,
} from './german-rhyme-features.mjs';
import { computePhraseMosaicWindowFingerprint } from './phrase-mosaic-window-core.mjs';

export const PHRASE_MOSAIC_RETRIEVAL_SCHEMA = 'rhymelab-phrase-mosaic-retrieval-v1';
export const PHRASE_MOSAIC_RETRIEVAL_POLICY = 'de-bounded-indexed-mosaic-retrieval-v1';
export const PHRASE_MOSAIC_RETRIEVAL_ANCHOR_POLICY = 'de-mosaic-rhyme-anchors-v1';
export const PHRASE_MOSAIC_RETRIEVAL_DEFAULT_PER_CHANNEL_LIMIT = 128;
export const PHRASE_MOSAIC_RETRIEVAL_DEFAULT_MAX_CANDIDATES = 512;

const json = (value) => JSON.stringify(value);
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const tableExists = (db, name) => Boolean(db.prepare(
  "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?",
).get(name));

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function rhymeTailTokens(syllables) {
  return syllables.flatMap((syllable, index) => [
    ...(index === 0 ? [] : syllable.onset),
    syllable.nucleus,
    ...syllable.coda,
    ...(index < syllables.length - 1 ? ['.'] : []),
  ]).filter(Boolean);
}

function analysisForSyllableWindow(fullAnalysis, start, end) {
  const syllables = fullAnalysis.syllables.slice(start, end).map((syllable, index) => ({
    ...syllable,
    position: index + 1,
    onset: [...syllable.onset],
    coda: [...syllable.coda],
  }));
  if (!syllables.length) throw new Error('Cannot analyze an empty mosaic window');
  const phonemes = syllables.flatMap((syllable) => [
    ...syllable.onset,
    syllable.nucleus,
    ...syllable.coda,
  ]);
  const tailTokens = rhymeTailTokens(syllables);
  const final = syllables.at(-1);
  const vowelSequence = syllables.map((syllable) => syllable.nucleus).join(' ');
  const consonantSequence = syllables
    .flatMap((syllable, index) => [...(index === 0 ? [] : syllable.onset), ...syllable.coda])
    .join(' ');
  const onsetSequence = syllables
    .flatMap((syllable, index) => index === 0 ? [] : syllable.onset)
    .join(' ');
  return {
    ipa: null,
    canonicalPhonemes: phonemes.join(' '),
    phonemes,
    syllables,
    syllableCount: syllables.length,
    stressPattern: syllables.map((syllable) => Number(syllable.stressLevel || 0)).join(''),
    primaryStressSyllable: 1,
    stressedTail: tailTokens.join(' '),
    finalTail: [final.nucleus, ...final.coda].filter(Boolean).join(' '),
    vowelSequence,
    consonantSequence,
    onsetSequence,
    exactTailKey: tailTokens.join('').replaceAll(' ', ''),
    multisyllableKey: syllables.length >= 2 ? tailTokens.join('').replaceAll(' ', '') : null,
    vowelKey: vowelSequence.replaceAll(' ', '-'),
    codaKey: final.coda.join(' '),
    codaClassKey: coarseCodaClass(final.coda),
    onsetKey: final.onset.join(' '),
    stressShape: syllables.map((syllable) => Number(syllable.stressLevel || 0)).join(''),
    stressedSyllableCount: syllables.length,
  };
}

function anchorFromWindow(fullAnalysis, row) {
  const analysis = analysisForSyllableWindow(
    fullAnalysis,
    Number(row.syllable_start),
    Number(row.syllable_end),
  );
  const final = analysis.syllables.at(-1);
  const anchor = {
    windowId: row.window_id,
    exactTailKey: analysis.exactTailKey,
    vowelKey: analysis.vowelKey,
    finalNucleus: final.nucleus,
    finalCodaKey: analysis.codaKey,
    finalCodaClass: analysis.codaClassKey,
    syllableCount: analysis.syllableCount,
    stressPattern: analysis.stressPattern,
  };
  anchor.fingerprint = sha256(json({
    ...anchor,
    policy: PHRASE_MOSAIC_RETRIEVAL_ANCHOR_POLICY,
  }));
  return anchor;
}

export function ensurePhraseMosaicRetrievalStorage(db) {
  db.exec([
    'CREATE TABLE IF NOT EXISTS phrase_mosaic_retrieval_anchor(',
    ' window_id TEXT PRIMARY KEY REFERENCES phrase_mosaic_window(window_id) ON DELETE CASCADE,',
    ' policy TEXT NOT NULL,',
    ' exact_tail_key TEXT NOT NULL,',
    ' vowel_key TEXT NOT NULL,',
    ' final_nucleus TEXT NOT NULL,',
    ' final_coda_key TEXT NOT NULL,',
    ' final_coda_class TEXT NOT NULL,',
    ' syllable_count INTEGER NOT NULL,',
    ' stress_pattern TEXT NOT NULL,',
    ' fingerprint TEXT NOT NULL);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_mosaic_retrieval_exact',
    ' ON phrase_mosaic_retrieval_anchor(exact_tail_key,syllable_count,window_id);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_mosaic_retrieval_vowel_coda',
    ' ON phrase_mosaic_retrieval_anchor(vowel_key,final_coda_key,syllable_count,window_id);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_mosaic_retrieval_vowel',
    ' ON phrase_mosaic_retrieval_anchor(vowel_key,syllable_count,window_id);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_mosaic_retrieval_final',
    ' ON phrase_mosaic_retrieval_anchor(final_nucleus,final_coda_class,syllable_count,window_id);',
  ].join('\n'));
}

export function computePhraseMosaicRetrievalFingerprint(db) {
  if (!tableExists(db, 'phrase_mosaic_retrieval_anchor')) return null;
  const hash = createHash('sha256');
  for (const row of db.prepare([
    'SELECT window_id,policy,exact_tail_key,vowel_key,final_nucleus,final_coda_key,',
    'final_coda_class,syllable_count,stress_pattern,fingerprint',
    ' FROM phrase_mosaic_retrieval_anchor ORDER BY window_id',
  ].join('')).iterate()) {
    hash.update(JSON.stringify(row));
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function materializePhraseMosaicRetrievalAnchors(db) {
  if (!tableExists(db, 'phrase_mosaic_window')
    || !tableExists(db, 'phrase_pronunciation')) {
    throw new Error('Phase 11D1 mosaic windows and 11C1 pronunciations are required');
  }
  const windowFingerprintBefore = computePhraseMosaicWindowFingerprint(db);
  if (!windowFingerprintBefore) throw new Error('Phase 11D1 window fingerprint is unavailable');

  ensurePhraseMosaicRetrievalStorage(db);
  const rows = db.prepare([
    'SELECT w.window_id,w.phrase_pronunciation_id,w.syllable_start,w.syllable_end,pp.ipa',
    ' FROM phrase_mosaic_window w',
    ' JOIN phrase_pronunciation pp ON pp.phrase_pronunciation_id=w.phrase_pronunciation_id',
    ' ORDER BY w.phrase_pronunciation_id,w.syllable_start,w.syllable_end,w.window_id',
  ].join(''));
  const insert = db.prepare([
    'INSERT INTO phrase_mosaic_retrieval_anchor(',
    'window_id,policy,exact_tail_key,vowel_key,final_nucleus,final_coda_key,',
    'final_coda_class,syllable_count,stress_pattern,fingerprint)',
    ' VALUES(?,?,?,?,?,?,?,?,?,?)',
  ].join(''));

  let currentPronunciationId = null;
  let fullAnalysis = null;
  let anchorCount = 0;
  const exactKeys = new Set();
  const vowelKeys = new Set();
  const finalKeys = new Set();

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM phrase_mosaic_retrieval_anchor;');
    for (const row of rows.iterate()) {
      if (row.phrase_pronunciation_id !== currentPronunciationId) {
        currentPronunciationId = row.phrase_pronunciation_id;
        fullAnalysis = analyzeGermanIpa(row.ipa);
      }
      const anchor = anchorFromWindow(fullAnalysis, row);
      insert.run(
        anchor.windowId,
        PHRASE_MOSAIC_RETRIEVAL_ANCHOR_POLICY,
        anchor.exactTailKey,
        anchor.vowelKey,
        anchor.finalNucleus,
        anchor.finalCodaKey,
        anchor.finalCodaClass,
        anchor.syllableCount,
        anchor.stressPattern,
        anchor.fingerprint,
      );
      anchorCount += 1;
      exactKeys.add(anchor.exactTailKey);
      vowelKeys.add(anchor.vowelKey);
      finalKeys.add(anchor.finalNucleus + '|' + anchor.finalCodaClass);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }

  const windowFingerprintAfter = computePhraseMosaicWindowFingerprint(db);
  if (windowFingerprintAfter !== windowFingerprintBefore) {
    throw new Error(
      'Phase 11D1 window fingerprint changed during 11D2 materialization: '
      + windowFingerprintBefore + ' -> ' + windowFingerprintAfter,
    );
  }

  return {
    schema: PHRASE_MOSAIC_RETRIEVAL_SCHEMA,
    policy: PHRASE_MOSAIC_RETRIEVAL_POLICY,
    anchorPolicy: PHRASE_MOSAIC_RETRIEVAL_ANCHOR_POLICY,
    sourceWindowFingerprint: windowFingerprintBefore,
    windowFingerprintUnchanged: true,
    anchorCount,
    distinctExactTailKeys: exactKeys.size,
    distinctVowelKeys: vowelKeys.size,
    distinctFinalNucleusCodaClassKeys: finalKeys.size,
    anchorFingerprint: computePhraseMosaicRetrievalFingerprint(db),
  };
}

function candidateSelectSql(whereClause) {
  return [
    'SELECT a.window_id,a.exact_tail_key,a.vowel_key,a.final_nucleus,a.final_coda_key,',
    'a.final_coda_class,a.syllable_count AS anchor_syllable_count,',
    'w.phrase_pronunciation_id,w.phrase_id,w.syllable_start,w.syllable_end,w.syllable_count,',
    'w.phoneme_start,w.phoneme_end,w.token_start_index,w.token_end_index,',
    'w.crossed_word_boundaries,w.starts_inside_token,w.ends_inside_token,',
    'p.canonical,p.phrase_types_json,p.historical_state,p.modern_eligible,pp.ipa AS phrase_ipa',
    ' FROM phrase_mosaic_retrieval_anchor a',
    ' JOIN phrase_mosaic_window w ON w.window_id=a.window_id',
    ' JOIN phrase p ON p.phrase_id=w.phrase_id',
    ' JOIN phrase_pronunciation pp ON pp.phrase_pronunciation_id=w.phrase_pronunciation_id',
    ' WHERE ' + whereClause,
  ].join('');
}

function typeTier(type) {
  return new Map([
    ['multisyllabic_perfect', 0],
    ['perfect', 0],
    ['multisyllabic_slant', 1],
    ['family', 2],
    ['slant', 3],
    ['weak', 9],
  ]).get(type) ?? 9;
}

const CHANNEL_PRIORITY = Object.freeze({
  exact_tail: 0,
  vowel_coda: 1,
  vowel: 2,
  final_nucleus_coda_class: 3,
});

function queryAnchorsForAnalysis(queryAnalysis) {
  return eligibleGermanRhymeAnchorPositions(queryAnalysis)
    .map((position) => {
      const analysis = germanAnalysisAtRhymeAnchor(queryAnalysis, position);
      const final = analysis.syllables.at(-1);
      const syllableCount = Number(analysis.stressedSyllableCount || 0);
      return {
        position,
        kind: position === Number(queryAnalysis.primaryStressSyllable || 1)
          ? 'primary'
          : 'secondary',
        syllableCount,
        exactTailKey: analysis.exactTailKey,
        vowelKey: analysis.vowelKey,
        finalNucleus: final?.nucleus || null,
        finalCodaKey: final?.coda?.join(' ') || '',
        finalCodaClass: coarseCodaClass(final?.coda || []),
        analysis,
      };
    })
    .filter((anchor) => anchor.syllableCount >= 2 && anchor.syllableCount <= 6);
}

function addRows(matches, rows, anchor, channel) {
  for (const row of rows) {
    const key = row.window_id + '|' + anchor.position;
    let entry = matches.get(key);
    if (!entry) {
      entry = { row, queryAnchor: anchor, channels: new Set() };
      matches.set(key, entry);
    }
    entry.channels.add(channel);
  }
}

function bestChannelPriority(channels) {
  return Math.min(...channels.map((channel) => CHANNEL_PRIORITY[channel] ?? 99));
}

function betterMatch(a, b) {
  const tierDelta = typeTier(a.score.type) - typeTier(b.score.type);
  if (tierDelta) return tierDelta < 0;
  const scoreDelta = Number(a.score.overall || 0) - Number(b.score.overall || 0);
  if (scoreDelta) return scoreDelta > 0;
  const channelDelta = bestChannelPriority(a.retrievalChannels)
    - bestChannelPriority(b.retrievalChannels);
  if (channelDelta) return channelDelta < 0;
  return a.queryAnchor.position < b.queryAnchor.position;
}

export function retrievePhraseMosaicCandidates(db, queryIpa, options = {}) {
  if (!tableExists(db, 'phrase_mosaic_retrieval_anchor')) {
    throw new Error('Phase 11D2 retrieval anchors are not materialized');
  }
  const perChannelLimit = clampInteger(
    options.perChannelLimit,
    PHRASE_MOSAIC_RETRIEVAL_DEFAULT_PER_CHANNEL_LIMIT,
    1,
    512,
  );
  const maxCandidates = clampInteger(
    options.maxCandidates,
    PHRASE_MOSAIC_RETRIEVAL_DEFAULT_MAX_CANDIDATES,
    1,
    2048,
  );
  const queryAnalysis = analyzeGermanIpa(queryIpa);
  const queryAnchors = queryAnchorsForAnalysis(queryAnalysis);
  const matches = new Map();

  const exactStmt = db.prepare(
    candidateSelectSql('a.exact_tail_key=? AND a.syllable_count=?')
    + ' ORDER BY a.window_id LIMIT ?'
  );
  const vowelCodaStmt = db.prepare(
    candidateSelectSql('a.vowel_key=? AND a.final_coda_key=? AND a.syllable_count=?')
    + ' ORDER BY a.window_id LIMIT ?'
  );
  const vowelStmt = db.prepare(
    candidateSelectSql('a.vowel_key=? AND a.syllable_count=?')
    + ' ORDER BY a.window_id LIMIT ?'
  );
  const finalStmt = db.prepare(
    candidateSelectSql(
      'a.final_nucleus=? AND a.final_coda_class=? AND a.syllable_count BETWEEN ? AND ?'
    ) + ' ORDER BY a.syllable_count,a.window_id LIMIT ?'
  );

  for (const anchor of queryAnchors) {
    addRows(
      matches,
      exactStmt.all(anchor.exactTailKey, anchor.syllableCount, perChannelLimit),
      anchor,
      'exact_tail',
    );
    addRows(
      matches,
      vowelCodaStmt.all(
        anchor.vowelKey,
        anchor.finalCodaKey,
        anchor.syllableCount,
        perChannelLimit,
      ),
      anchor,
      'vowel_coda',
    );
    addRows(
      matches,
      vowelStmt.all(anchor.vowelKey, anchor.syllableCount, perChannelLimit),
      anchor,
      'vowel',
    );
    addRows(
      matches,
      finalStmt.all(
        anchor.finalNucleus,
        anchor.finalCodaClass,
        Math.max(2, anchor.syllableCount - 1),
        Math.min(6, anchor.syllableCount + 1),
        perChannelLimit,
      ),
      anchor,
      'final_nucleus_coda_class',
    );
  }

  const phraseAnalysisCache = new Map();
  const bestByWindow = new Map();

  for (const entry of matches.values()) {
    const row = entry.row;
    let phraseAnalysis = phraseAnalysisCache.get(row.phrase_pronunciation_id);
    if (!phraseAnalysis) {
      phraseAnalysis = analyzeGermanIpa(row.phrase_ipa);
      phraseAnalysisCache.set(row.phrase_pronunciation_id, phraseAnalysis);
    }
    const candidateAnalysis = analysisForSyllableWindow(
      phraseAnalysis,
      Number(row.syllable_start),
      Number(row.syllable_end),
    );
    const score = scoreGermanRhymeAnalyses(entry.queryAnchor.analysis, candidateAnalysis);
    const candidate = {
      windowId: row.window_id,
      phrasePronunciationId: row.phrase_pronunciation_id,
      phraseId: row.phrase_id,
      canonical: row.canonical,
      phraseTypes: JSON.parse(row.phrase_types_json || '[]'),
      historicalState: row.historical_state,
      modernEligible: Boolean(row.modern_eligible),
      syllableStart: Number(row.syllable_start),
      syllableEnd: Number(row.syllable_end),
      syllableCount: Number(row.syllable_count),
      phonemeStart: Number(row.phoneme_start),
      phonemeEnd: Number(row.phoneme_end),
      tokenStartIndex: Number(row.token_start_index),
      tokenEndIndex: Number(row.token_end_index),
      crossedWordBoundaries: Number(row.crossed_word_boundaries),
      startsInsideToken: Boolean(row.starts_inside_token),
      endsInsideToken: Boolean(row.ends_inside_token),
      retrievalChannels: [...entry.channels].sort(
        (a, b) => (CHANNEL_PRIORITY[a] ?? 99) - (CHANNEL_PRIORITY[b] ?? 99)
          || a.localeCompare(b),
      ),
      queryAnchor: {
        position: entry.queryAnchor.position,
        kind: entry.queryAnchor.kind,
        syllableCount: entry.queryAnchor.syllableCount,
      },
      score,
    };
    const existing = bestByWindow.get(row.window_id);
    if (!existing || betterMatch(candidate, existing)) bestByWindow.set(row.window_id, candidate);
  }

  const candidates = [...bestByWindow.values()].sort((a, b) =>
    typeTier(a.score.type) - typeTier(b.score.type)
    || Number(b.score.overall || 0) - Number(a.score.overall || 0)
    || bestChannelPriority(a.retrievalChannels) - bestChannelPriority(b.retrievalChannels)
    || a.queryAnchor.position - b.queryAnchor.position
    || a.windowId.localeCompare(b.windowId)
  ).slice(0, maxCandidates);

  return {
    schema: PHRASE_MOSAIC_RETRIEVAL_SCHEMA,
    policy: PHRASE_MOSAIC_RETRIEVAL_POLICY,
    query: {
      ipa: queryAnalysis.ipa,
      syllableCount: queryAnalysis.syllableCount,
      primaryStressSyllable: queryAnalysis.primaryStressSyllable,
      anchors: queryAnchors.map((anchor) => ({
        position: anchor.position,
        kind: anchor.kind,
        syllableCount: anchor.syllableCount,
        exactTailKey: anchor.exactTailKey,
        vowelKey: anchor.vowelKey,
        finalNucleus: anchor.finalNucleus,
        finalCodaKey: anchor.finalCodaKey,
        finalCodaClass: anchor.finalCodaClass,
      })),
    },
    bounds: {
      perChannelLimit,
      maxCandidates,
      channelsPerAnchor: 4,
      maximumRawRowsBeforeDedup: queryAnchors.length * 4 * perChannelLimit,
    },
    retrieval: {
      queryAnchorCount: queryAnchors.length,
      rawAnchorWindowMatches: matches.size,
      uniqueWindowsScored: bestByWindow.size,
      returnedCandidates: candidates.length,
      fullCorpusScan: false,
    },
    candidates,
  };
}
