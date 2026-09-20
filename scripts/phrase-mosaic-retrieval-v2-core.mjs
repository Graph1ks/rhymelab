import { createHash } from 'node:crypto';
import {
  analyzeGermanIpa,
  germanVowelFamilyKey,
} from './german-ipa.mjs';
import {
  eligibleGermanRhymeAnchorPositions,
  germanAnalysisAtRhymeAnchor,
} from './german-rhyme-anchors.mjs';
import {
  coarseCodaClass,
  scoreGermanRhymeAnalyses,
} from './german-rhyme-features.mjs';
import {
  computePhraseMosaicRetrievalFingerprint,
  PHRASE_MOSAIC_RETRIEVAL_DEFAULT_MAX_CANDIDATES,
  PHRASE_MOSAIC_RETRIEVAL_DEFAULT_PER_CHANNEL_LIMIT,
} from './phrase-mosaic-retrieval-core.mjs';

export const PHRASE_MOSAIC_RETRIEVAL_V2_SCHEMA =
  'rhymelab-phrase-mosaic-retrieval-v2-candidate';
export const PHRASE_MOSAIC_RETRIEVAL_V2_POLICY =
  'de-bounded-indexed-mosaic-retrieval-v2-candidate';
export const PHRASE_MOSAIC_RETRIEVAL_V2_FAMILY_POLICY =
  'de-mosaic-vowel-family-bridge-v1';

const json = (value) => JSON.stringify(value);
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const tableExists = (db, name) => Boolean(
  db.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('table','view') AND name=?").get(name)
  ||db.prepare("SELECT 1 FROM sqlite_temp_schema WHERE type IN ('table','view') AND name=?").get(name)
);

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

export function mosaicAnalysisForSyllableWindow(fullAnalysis, start, end) {
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
  const nuclei = syllables.map((syllable) => syllable.nucleus);
  const vowelSequence = nuclei.join(' ');
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
    vowelFamilyKey: germanVowelFamilyKey(nuclei),
    codaKey: final.coda.join(' '),
    codaClassKey: coarseCodaClass(final.coda),
    onsetKey: final.onset.join(' '),
    stressShape: syllables.map((syllable) => Number(syllable.stressLevel || 0)).join(''),
    stressedSyllableCount: syllables.length,
  };
}

export function ensurePhraseMosaicRetrievalV2Storage(db) {
  db.exec([
    'CREATE TABLE IF NOT EXISTS phrase_mosaic_retrieval_v2_anchor(',
    ' window_id TEXT PRIMARY KEY REFERENCES phrase_mosaic_retrieval_anchor(window_id) ON DELETE CASCADE,',
    ' policy TEXT NOT NULL,',
    ' vowel_family_key TEXT NOT NULL,',
    ' final_coda_class TEXT NOT NULL,',
    ' syllable_count INTEGER NOT NULL,',
    ' fingerprint TEXT NOT NULL);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_mosaic_retrieval_v2_family_coda',
    ' ON phrase_mosaic_retrieval_v2_anchor(vowel_family_key,final_coda_class,syllable_count,window_id);',
  ].join('\n'));
}

export function computePhraseMosaicRetrievalV2Fingerprint(db) {
  if (!tableExists(db, 'phrase_mosaic_retrieval_v2_anchor')) return null;
  const hash = createHash('sha256');
  for (const row of db.prepare([
    'SELECT window_id,policy,vowel_family_key,final_coda_class,syllable_count,fingerprint',
    ' FROM phrase_mosaic_retrieval_v2_anchor ORDER BY window_id',
  ].join('')).iterate()) {
    hash.update(JSON.stringify(row));
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function materializePhraseMosaicRetrievalV2Anchors(db) {
  if (!tableExists(db, 'phrase_mosaic_retrieval_anchor')) {
    throw new Error('Accepted Phase 11D2 retrieval anchors are required');
  }
  const sourceV1FingerprintBefore = computePhraseMosaicRetrievalFingerprint(db);
  if (!sourceV1FingerprintBefore) {
    throw new Error('Accepted Phase 11D2 retrieval fingerprint is unavailable');
  }

  ensurePhraseMosaicRetrievalV2Storage(db);
  const rows = db.prepare([
    'SELECT window_id,vowel_key,final_coda_class,syllable_count',
    ' FROM phrase_mosaic_retrieval_anchor ORDER BY window_id',
  ].join(''));
  const insert = db.prepare([
    'INSERT INTO phrase_mosaic_retrieval_v2_anchor(',
    'window_id,policy,vowel_family_key,final_coda_class,syllable_count,fingerprint)',
    ' VALUES(?,?,?,?,?,?)',
  ].join(''));

  let anchorCount = 0;
  const familyKeys = new Set();
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM phrase_mosaic_retrieval_v2_anchor;');
    for (const row of rows.iterate()) {
      const nuclei = String(row.vowel_key || '').split('-').filter(Boolean);
      const vowelFamilyKey = germanVowelFamilyKey(nuclei);
      const fingerprint = sha256(json({
        windowId: row.window_id,
        policy: PHRASE_MOSAIC_RETRIEVAL_V2_FAMILY_POLICY,
        vowelFamilyKey,
        finalCodaClass: row.final_coda_class,
        syllableCount: Number(row.syllable_count),
      }));
      insert.run(
        row.window_id,
        PHRASE_MOSAIC_RETRIEVAL_V2_FAMILY_POLICY,
        vowelFamilyKey,
        row.final_coda_class,
        Number(row.syllable_count),
        fingerprint,
      );
      anchorCount += 1;
      familyKeys.add(vowelFamilyKey + '|' + row.final_coda_class);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }

  const sourceV1FingerprintAfter = computePhraseMosaicRetrievalFingerprint(db);
  if (sourceV1FingerprintAfter !== sourceV1FingerprintBefore) {
    throw new Error(
      'Accepted 11D2 retrieval fingerprint changed during 11D4 materialization: '
      + sourceV1FingerprintBefore + ' -> ' + sourceV1FingerprintAfter,
    );
  }

  return {
    schema: PHRASE_MOSAIC_RETRIEVAL_V2_SCHEMA,
    policy: PHRASE_MOSAIC_RETRIEVAL_V2_POLICY,
    familyPolicy: PHRASE_MOSAIC_RETRIEVAL_V2_FAMILY_POLICY,
    sourceV1Fingerprint: sourceV1FingerprintBefore,
    sourceV1FingerprintUnchanged: true,
    anchorCount,
    distinctVowelFamilyCodaKeys: familyKeys.size,
    candidateFingerprint: computePhraseMosaicRetrievalV2Fingerprint(db),
  };
}

function queryAnchorIdentity(anchor) {
  return [
    anchor.syllableCount,
    anchor.exactTailKey,
    anchor.vowelKey,
    anchor.vowelFamilyKey,
    anchor.finalCodaClass,
  ].join('|');
}

export function phraseMosaicV2QueryAnchors(queryAnalysis) {
  const anchors = [];
  const seen = new Set();

  for (const position of eligibleGermanRhymeAnchorPositions(queryAnalysis)) {
    const analysis = germanAnalysisAtRhymeAnchor(queryAnalysis, position);
    const syllableCount = Number(analysis.stressedSyllableCount || 0);
    if (syllableCount < 2 || syllableCount > 6) continue;
    const final = analysis.syllables.at(-1);
    const nuclei = analysis.syllables.slice(position - 1).map((syllable) => syllable.nucleus);
    const anchor = {
      anchorId: (position === Number(queryAnalysis.primaryStressSyllable || 1) ? 'primary:' : 'secondary:') + position,
      position,
      kind: position === Number(queryAnalysis.primaryStressSyllable || 1)
        ? 'primary'
        : 'secondary',
      syllableCount,
      exactTailKey: analysis.exactTailKey,
      vowelKey: analysis.vowelKey,
      vowelFamilyKey: germanVowelFamilyKey(nuclei),
      finalNucleus: final?.nucleus || null,
      finalCodaKey: final?.coda?.join(' ') || '',
      finalCodaClass: coarseCodaClass(final?.coda || []),
      analysis,
    };
    const identity = queryAnchorIdentity(anchor);
    if (seen.has(identity)) continue;
    seen.add(identity);
    anchors.push(anchor);
  }

  if (queryAnalysis.syllableCount >= 2 && queryAnalysis.syllableCount <= 6) {
    const analysis = mosaicAnalysisForSyllableWindow(
      queryAnalysis,
      0,
      queryAnalysis.syllableCount,
    );
    const final = analysis.syllables.at(-1);
    const anchor = {
      anchorId: 'full_surface:1',
      position: 1,
      kind: 'full_surface',
      syllableCount: analysis.syllableCount,
      exactTailKey: analysis.exactTailKey,
      vowelKey: analysis.vowelKey,
      vowelFamilyKey: analysis.vowelFamilyKey,
      finalNucleus: final?.nucleus || null,
      finalCodaKey: analysis.codaKey,
      finalCodaClass: analysis.codaClassKey,
      analysis,
    };
    const identity = queryAnchorIdentity(anchor);
    if (!seen.has(identity)) {
      seen.add(identity);
      anchors.push(anchor);
    }
  }

  return anchors.sort((a, b) => {
    const kindOrder = new Map([['primary', 0], ['secondary', 1], ['full_surface', 2]]);
    return (kindOrder.get(a.kind) ?? 9) - (kindOrder.get(b.kind) ?? 9)
      || a.position - b.position
      || b.syllableCount - a.syllableCount
      || a.anchorId.localeCompare(b.anchorId);
  });
}

function candidateSelectSql(whereClause,{generatedOnly=false}={}) {
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
    generatedOnly
      ? " AND EXISTS(SELECT 1 FROM phrase_pronunciation_token ppt WHERE ppt.phrase_pronunciation_id=w.phrase_pronunciation_id AND ppt.pronunciation_source='eSpeak-NG Backfill V2')"
      : '',
  ].join('');
}

function familyCandidateSelectSql({generatedOnly=false}={}) {
  return [
    'SELECT a.window_id,a.exact_tail_key,a.vowel_key,a.final_nucleus,a.final_coda_key,',
    'a.final_coda_class,a.syllable_count AS anchor_syllable_count,',
    'w.phrase_pronunciation_id,w.phrase_id,w.syllable_start,w.syllable_end,w.syllable_count,',
    'w.phoneme_start,w.phoneme_end,w.token_start_index,w.token_end_index,',
    'w.crossed_word_boundaries,w.starts_inside_token,w.ends_inside_token,',
    'p.canonical,p.phrase_types_json,p.historical_state,p.modern_eligible,pp.ipa AS phrase_ipa',
    ' FROM phrase_mosaic_retrieval_v2_anchor f',
    ' JOIN phrase_mosaic_retrieval_anchor a ON a.window_id=f.window_id',
    ' JOIN phrase_mosaic_window w ON w.window_id=a.window_id',
    ' JOIN phrase p ON p.phrase_id=w.phrase_id',
    ' JOIN phrase_pronunciation pp ON pp.phrase_pronunciation_id=w.phrase_pronunciation_id',
    ' WHERE f.vowel_family_key=? AND f.final_coda_class=? AND f.syllable_count=?',
    generatedOnly
      ? " AND EXISTS(SELECT 1 FROM phrase_pronunciation_token ppt WHERE ppt.phrase_pronunciation_id=w.phrase_pronunciation_id AND ppt.pronunciation_source='eSpeak-NG Backfill V2')"
      : '',
    ' ORDER BY f.window_id LIMIT ?',
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
  vowel_family_coda_class: 3,
  final_nucleus_coda_class: 4,
});

function addRows(matches, rows, anchor, channel) {
  for (const row of rows) {
    const key = row.window_id + '|' + anchor.anchorId;
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
  const relationDelta = Number((a.score.relationTypes || []).length)
    - Number((b.score.relationTypes || []).length);
  if (relationDelta) return relationDelta > 0;
  const channelDelta = bestChannelPriority(a.retrievalChannels)
    - bestChannelPriority(b.retrievalChannels);
  if (channelDelta) return channelDelta < 0;
  return a.queryAnchor.anchorId.localeCompare(b.queryAnchor.anchorId) < 0;
}

function isWeakUnrelated(candidate) {
  return candidate.score.type === 'weak'
    && !(candidate.score.relationTypes || []).length;
}

export function retrievePhraseMosaicCandidatesV2(db, queryIpa, options = {}) {
  if (!tableExists(db, 'phrase_mosaic_retrieval_anchor')) {
    throw new Error('Accepted Phase 11D2 retrieval anchors are not materialized');
  }
  if (!tableExists(db, 'phrase_mosaic_retrieval_v2_anchor')) {
    throw new Error('Phase 11D4 candidate vowel-family anchors are not materialized');
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
  const includeWeakUnrelated = options.includeWeakUnrelated === true;
  const generatedOnly = options.generatedOnly === true;
  const queryAnalysis = analyzeGermanIpa(queryIpa);
  const queryAnchors = phraseMosaicV2QueryAnchors(queryAnalysis);
  const matches = new Map();

  const exactStmt = db.prepare(
    candidateSelectSql('a.exact_tail_key=? AND a.syllable_count=?',{generatedOnly})
    + ' ORDER BY a.window_id LIMIT ?'
  );
  const vowelCodaStmt = db.prepare(
    candidateSelectSql('a.vowel_key=? AND a.final_coda_key=? AND a.syllable_count=?',{generatedOnly})
    + ' ORDER BY a.window_id LIMIT ?'
  );
  const vowelStmt = db.prepare(
    candidateSelectSql('a.vowel_key=? AND a.syllable_count=?',{generatedOnly})
    + ' ORDER BY a.window_id LIMIT ?'
  );
  const familyStmt = db.prepare(familyCandidateSelectSql({generatedOnly}));
  const finalStmt = db.prepare(
    candidateSelectSql(
      'a.final_nucleus=? AND a.final_coda_class=? AND a.syllable_count BETWEEN ? AND ?',
      {generatedOnly},
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
      familyStmt.all(
        anchor.vowelFamilyKey,
        anchor.finalCodaClass,
        anchor.syllableCount,
        perChannelLimit,
      ),
      anchor,
      'vowel_family_coda_class',
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
    const candidateAnalysis = mosaicAnalysisForSyllableWindow(
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
      candidatePhonemes: candidateAnalysis.canonicalPhonemes,
      retrievalChannels: [...entry.channels].sort(
        (a, b) => (CHANNEL_PRIORITY[a] ?? 99) - (CHANNEL_PRIORITY[b] ?? 99)
          || a.localeCompare(b),
      ),
      queryAnchor: {
        anchorId: entry.queryAnchor.anchorId,
        position: entry.queryAnchor.position,
        kind: entry.queryAnchor.kind,
        syllableCount: entry.queryAnchor.syllableCount,
        vowelFamilyKey: entry.queryAnchor.vowelFamilyKey,
      },
      score,
    };
    const existing = bestByWindow.get(row.window_id);
    if (!existing || betterMatch(candidate, existing)) bestByWindow.set(row.window_id, candidate);
  }

  const scoredCandidates = [...bestByWindow.values()];
  const weakUnrelatedFiltered = includeWeakUnrelated
    ? 0
    : scoredCandidates.filter(isWeakUnrelated).length;
  const eligibleCandidates = includeWeakUnrelated
    ? scoredCandidates
    : scoredCandidates.filter((candidate) => !isWeakUnrelated(candidate));

  const candidates = eligibleCandidates.sort((a, b) =>
    typeTier(a.score.type) - typeTier(b.score.type)
    || Number(b.score.overall || 0) - Number(a.score.overall || 0)
    || Number((b.score.relationTypes || []).length) - Number((a.score.relationTypes || []).length)
    || bestChannelPriority(a.retrievalChannels) - bestChannelPriority(b.retrievalChannels)
    || a.queryAnchor.anchorId.localeCompare(b.queryAnchor.anchorId)
    || a.windowId.localeCompare(b.windowId)
  ).slice(0, maxCandidates);

  return {
    schema: PHRASE_MOSAIC_RETRIEVAL_V2_SCHEMA,
    policy: PHRASE_MOSAIC_RETRIEVAL_V2_POLICY,
    query: {
      ipa: queryAnalysis.ipa,
      syllableCount: queryAnalysis.syllableCount,
      primaryStressSyllable: queryAnalysis.primaryStressSyllable,
      anchors: queryAnchors.map((anchor) => ({
        anchorId: anchor.anchorId,
        position: anchor.position,
        kind: anchor.kind,
        syllableCount: anchor.syllableCount,
        exactTailKey: anchor.exactTailKey,
        vowelKey: anchor.vowelKey,
        vowelFamilyKey: anchor.vowelFamilyKey,
        finalNucleus: anchor.finalNucleus,
        finalCodaKey: anchor.finalCodaKey,
        finalCodaClass: anchor.finalCodaClass,
      })),
    },
    bounds: {
      perChannelLimit,
      maxCandidates,
      channelsPerAnchor: 5,
      maximumRawRowsBeforeDedup: queryAnchors.length * 5 * perChannelLimit,
      includeWeakUnrelated,
      generatedOnly,
    },
    retrieval: {
      queryAnchorCount: queryAnchors.length,
      rawAnchorWindowMatches: matches.size,
      uniqueWindowsScored: bestByWindow.size,
      weakUnrelatedFiltered,
      eligibleWindowsAfterPhoneticGate: eligibleCandidates.length,
      returnedCandidates: candidates.length,
      fullCorpusScan: false,
    },
    candidates,
  };
}
