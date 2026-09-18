import { createHash } from 'node:crypto';
import { analyzeGermanIpa } from './german-ipa.mjs';
import { computePhraseCatalogFingerprint } from './phrase-catalog-core.mjs';

export const PHRASE_PRONUNCIATION_SCHEMA = 'rhymelab-phrase-pronunciation-v1';
export const PHRASE_PRONUNCIATION_POLICY = 'de-phrase-pronunciation-v1';
export const PHRASE_TOKEN_RESOLVER_POLICY = 'writer-v5-preferred-normalized-exact-v1';
export const PHRASE_CITATION_COMPOSITION_POLICY = 'preferred-token-citation-composition-v1';
export const PHRASE_BOUNDARY_POLICY = 'explicit-word-boundary-v1';
export const PHRASE_CONNECTED_SPEECH_POLICY = 'attested-or-explicit-rule-only-v1';
export const PHRASE_IPA_ANALYZER = 'de-ipa-v2';

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const json = (value) => JSON.stringify(value);
const tableExists = (db, name) => Boolean(db.prepare(
  "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?",
).get(name));

function batches(values, size = 300) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export function ensurePhrasePronunciationStorage(db) {
  db.exec([
    'CREATE TABLE IF NOT EXISTS phrase_token_pronunciation_resolution(',
    ' phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id) ON DELETE CASCADE,',
    ' token_index INTEGER NOT NULL, normalized TEXT NOT NULL, status TEXT NOT NULL, resolver_policy TEXT NOT NULL,',
    ' writer_form_id INTEGER, writer_pronunciation_id INTEGER, writer_surface TEXT, ipa TEXT,',
    ' writer_historical INTEGER, usage_rank INTEGER, available_pronunciations INTEGER NOT NULL DEFAULT 0,',
    ' normalized_form_candidates INTEGER NOT NULL DEFAULT 0, pronunciation_source TEXT,',
    " pronunciation_flags_json TEXT NOT NULL DEFAULT '[]', evidence_json TEXT NOT NULL DEFAULT '{}',",
    ' PRIMARY KEY(phrase_id,token_index));',
    'CREATE TABLE IF NOT EXISTS phrase_pronunciation(',
    ' phrase_pronunciation_id TEXT PRIMARY KEY, phrase_id TEXT NOT NULL REFERENCES phrase(phrase_id) ON DELETE CASCADE,',
    ' variant_rank INTEGER NOT NULL, variant_type TEXT NOT NULL, policy TEXT NOT NULL, analyzer TEXT NOT NULL,',
    ' boundary_policy TEXT NOT NULL, connected_speech_policy TEXT NOT NULL, ipa TEXT NOT NULL,',
    ' canonical_phonemes TEXT NOT NULL, syllable_count INTEGER NOT NULL, stress_pattern TEXT NOT NULL,',
    ' primary_stress_syllables_json TEXT NOT NULL, secondary_stress_syllables_json TEXT NOT NULL,',
    ' vowel_sequence TEXT NOT NULL, consonant_sequence TEXT NOT NULL, exact_tail_key TEXT NOT NULL,',
    ' multisyllable_key TEXT, vowel_key TEXT NOT NULL, vowel_family_key TEXT NOT NULL, coda_key TEXT NOT NULL,',
    ' onset_key TEXT NOT NULL, stressed_syllable_count INTEGER NOT NULL,',
    ' word_boundary_phoneme_positions_json TEXT NOT NULL, word_boundary_syllable_positions_json TEXT NOT NULL,',
    ' eligible INTEGER NOT NULL CHECK(eligible IN (0,1)), ineligible_reason TEXT, fingerprint TEXT NOT NULL,',
    ' UNIQUE(phrase_id,variant_rank));',
    'CREATE TABLE IF NOT EXISTS phrase_pronunciation_token(',
    ' phrase_pronunciation_id TEXT NOT NULL REFERENCES phrase_pronunciation(phrase_pronunciation_id) ON DELETE CASCADE,',
    ' token_index INTEGER NOT NULL, writer_form_id INTEGER NOT NULL, writer_pronunciation_id INTEGER NOT NULL,',
    ' writer_surface TEXT NOT NULL, ipa TEXT NOT NULL, phoneme_start INTEGER NOT NULL, phoneme_end INTEGER NOT NULL,',
    ' syllable_start INTEGER NOT NULL, syllable_end INTEGER NOT NULL, stress_pattern TEXT NOT NULL,',
    ' pronunciation_source TEXT, available_pronunciations INTEGER NOT NULL,',
    ' PRIMARY KEY(phrase_pronunciation_id,token_index));',
    'CREATE INDEX IF NOT EXISTS idx_phrase_token_pron_resolution_status ON phrase_token_pronunciation_resolution(status,normalized);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_pronunciation_phrase ON phrase_pronunciation(phrase_id,eligible,variant_rank);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_pronunciation_exact ON phrase_pronunciation(exact_tail_key,eligible);',
    'CREATE INDEX IF NOT EXISTS idx_phrase_pronunciation_vowel ON phrase_pronunciation(vowel_key,eligible);',
  ].join('\n'));
}

function assertWriterDb(writerDb) {
  if (!tableExists(writerDb, 'hot') || !tableExists(writerDb, 'meta')) {
    throw new Error('Writer pronunciation inventory is missing hot/meta');
  }
  const schema = writerDb.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  if (schema !== 'rhymelab-local-db-v5') throw new Error('Expected rhymelab-local-db-v5, got ' + String(schema || 'missing'));
  return schema;
}

function resolveWriterForms(phraseDb, writerDb) {
  const normalized = phraseDb.prepare(
    "SELECT DISTINCT normalized FROM phrase_token WHERE normalized<>'' ORDER BY normalized",
  ).all().map((row) => row.normalized);
  const candidates = new Map();

  for (const batch of batches(normalized)) {
    const marks = batch.map(() => '?').join(',');
    const rows = writerDb.prepare(
      'SELECT id pronunciation_id,publish_order form_id,surface,normalized,historical,usage_rank,ipa,' +
      'pronunciation_source,pronunciation_flags FROM hot WHERE normalized IN (' + marks + ') ' +
      'AND pronunciation_preferred=1 AND pronunciation_eligible=1 ' +
      'ORDER BY normalized,historical,usage_rank IS NULL,usage_rank,publish_order,id',
    ).all(...batch);
    for (const row of rows) {
      const list = candidates.get(row.normalized) || [];
      list.push(row);
      candidates.set(row.normalized, list);
    }
  }

  const selected = new Map();
  const formIds = [];
  for (const value of normalized) {
    const rows = candidates.get(value) || [];
    if (!rows.length) continue;
    selected.set(value, {
      ...rows[0],
      normalizedFormCandidates: new Set(rows.map((row) => Number(row.form_id))).size,
    });
    formIds.push(Number(rows[0].form_id));
  }

  const counts = new Map();
  for (const batch of batches([...new Set(formIds)])) {
    const marks = batch.map(() => '?').join(',');
    for (const row of writerDb.prepare(
      'SELECT publish_order form_id,COUNT(*) pronunciation_count FROM hot WHERE publish_order IN (' +
      marks + ') GROUP BY publish_order',
    ).all(...batch)) counts.set(Number(row.form_id), Number(row.pronunciation_count));
  }
  for (const row of selected.values()) row.availablePronunciations = counts.get(Number(row.form_id)) || 1;
  return { normalized, selected };
}

function writeTokenResolutions(phraseDb, selected) {
  const insert = phraseDb.prepare([
    'INSERT INTO phrase_token_pronunciation_resolution(',
    'phrase_id,token_index,normalized,status,resolver_policy,writer_form_id,writer_pronunciation_id,writer_surface,ipa,',
    'writer_historical,usage_rank,available_pronunciations,normalized_form_candidates,pronunciation_source,',
    'pronunciation_flags_json,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ].join(''));
  const byToken = new Map();
  const reasons = new Map();

  for (const token of phraseDb.prepare(
    'SELECT phrase_id,token_index,normalized FROM phrase_token ORDER BY phrase_id,token_index',
  ).all()) {
    const writer = selected.get(token.normalized) || null;
    const status = writer ? 'resolved_preferred' : 'unresolved_no_writer_form';
    if (!writer) reasons.set(status, (reasons.get(status) || 0) + 1);
    const row = {
      phraseId: token.phrase_id,
      tokenIndex: Number(token.token_index),
      normalized: token.normalized,
      status,
      writerFormId: writer ? Number(writer.form_id) : null,
      writerPronunciationId: writer ? Number(writer.pronunciation_id) : null,
      writerSurface: writer?.surface ?? null,
      ipa: writer?.ipa ?? null,
      historical: writer ? Number(writer.historical || 0) : null,
      usageRank: writer?.usage_rank ?? null,
      pronunciationCount: writer?.availablePronunciations ?? 0,
      candidateCount: writer?.normalizedFormCandidates ?? 0,
      source: writer?.pronunciation_source ?? null,
      flags: writer?.pronunciation_flags || '[]',
    };
    insert.run(
      row.phraseId,row.tokenIndex,row.normalized,row.status,PHRASE_TOKEN_RESOLVER_POLICY,
      row.writerFormId,row.writerPronunciationId,row.writerSurface,row.ipa,row.historical,row.usageRank,
      row.pronunciationCount,row.candidateCount,row.source,row.flags,
      json({ source_database_schema: 'rhymelab-local-db-v5', matching: 'exact_normalized_form' }),
    );
    byToken.set(row.phraseId + '\u001f' + row.tokenIndex, row);
  }
  return { byToken, reasons };
}

function composePhrase(phrase, tokens, byToken) {
  const parts = [];
  for (const token of tokens) {
    const resolved = byToken.get(phrase.phrase_id + '\u001f' + token.token_index);
    if (!resolved || resolved.status !== 'resolved_preferred') {
      return { ready: false, reason: resolved?.status || 'unresolved_token' };
    }
    try {
      parts.push({ token, resolved, analysis: analyzeGermanIpa(resolved.ipa) });
    } catch {
      return { ready: false, reason: 'token_ipa_analysis_failed' };
    }
  }

  const ipa = parts.map((part) => part.analysis.ipa).join('‿');
  let analysis;
  try { analysis = analyzeGermanIpa(ipa); }
  catch { return { ready: false, reason: 'phrase_ipa_analysis_failed' }; }

  const phonemeTotal = parts.reduce((sum, part) => sum + part.analysis.phonemes.length, 0);
  const syllableTotal = parts.reduce((sum, part) => sum + part.analysis.syllableCount, 0);
  if (analysis.phonemes.length !== phonemeTotal || analysis.syllableCount !== syllableTotal) {
    return { ready: false, reason: 'boundary_reconstruction_mismatch' };
  }

  let phonemeOffset = 0;
  let syllableOffset = 0;
  const tokenRows = [];
  const phonemeBoundaries = [];
  const syllableBoundaries = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const phonemeStart = phonemeOffset;
    const syllableStart = syllableOffset;
    phonemeOffset += part.analysis.phonemes.length;
    syllableOffset += part.analysis.syllableCount;
    tokenRows.push({
      tokenIndex: Number(part.token.token_index),
      writerFormId: part.resolved.writerFormId,
      writerPronunciationId: part.resolved.writerPronunciationId,
      writerSurface: part.resolved.writerSurface,
      ipa: part.analysis.ipa,
      phonemeStart, phonemeEnd: phonemeOffset,
      syllableStart, syllableEnd: syllableOffset,
      stressPattern: part.analysis.stressPattern,
      source: part.resolved.source,
      pronunciationCount: part.resolved.pronunciationCount,
    });
    if (index < parts.length - 1) {
      phonemeBoundaries.push(phonemeOffset);
      syllableBoundaries.push(syllableOffset);
    }
  }

  const primaryStress = analysis.syllables.filter((s) => s.stressLevel === 2).map((s) => s.position);
  const secondaryStress = analysis.syllables.filter((s) => s.stressLevel === 1).map((s) => s.position);
  const payload = {
    ipa,
    canonicalPhonemes: analysis.canonicalPhonemes,
    syllableCount: analysis.syllableCount,
    stressPattern: analysis.stressPattern,
    primaryStress,
    secondaryStress,
    vowelSequence: analysis.vowelSequence,
    consonantSequence: analysis.consonantSequence,
    exactTailKey: analysis.exactTailKey,
    multisyllableKey: analysis.multisyllableKey,
    vowelKey: analysis.vowelKey,
    vowelFamilyKey: analysis.vowelFamilyKey,
    codaKey: analysis.codaKey,
    onsetKey: analysis.onsetKey,
    stressedSyllableCount: analysis.stressedSyllableCount,
    phonemeBoundaries,
    syllableBoundaries,
    tokenRows,
  };
  return { ready: true, ...payload, fingerprint: sha256(json(payload)) };
}

function writePhrases(phraseDb, byToken) {
  const insertPhrase = phraseDb.prepare([
    'INSERT INTO phrase_pronunciation(',
    'phrase_pronunciation_id,phrase_id,variant_rank,variant_type,policy,analyzer,boundary_policy,connected_speech_policy,',
    'ipa,canonical_phonemes,syllable_count,stress_pattern,primary_stress_syllables_json,secondary_stress_syllables_json,',
    'vowel_sequence,consonant_sequence,exact_tail_key,multisyllable_key,vowel_key,vowel_family_key,coda_key,onset_key,',
    'stressed_syllable_count,word_boundary_phoneme_positions_json,word_boundary_syllable_positions_json,eligible,',
    'ineligible_reason,fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ].join(''));
  const insertToken = phraseDb.prepare([
    'INSERT INTO phrase_pronunciation_token(',
    'phrase_pronunciation_id,token_index,writer_form_id,writer_pronunciation_id,writer_surface,ipa,phoneme_start,',
    'phoneme_end,syllable_start,syllable_end,stress_pattern,pronunciation_source,available_pronunciations)',
    ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ].join(''));
  const tokenQuery = phraseDb.prepare(
    'SELECT phrase_id,token_index,surface,normalized FROM phrase_token WHERE phrase_id=? ORDER BY token_index',
  );
  const reasons = new Map();
  let ready = 0;
  let readyModern = 0;
  let phraseCount = 0;

  for (const phrase of phraseDb.prepare(
    'SELECT phrase_id,canonical,modern_eligible FROM phrase ORDER BY phrase_id',
  ).iterate()) {
    phraseCount += 1;
    const composed = composePhrase(phrase, tokenQuery.all(phrase.phrase_id), byToken);
    if (!composed.ready) {
      reasons.set(composed.reason, (reasons.get(composed.reason) || 0) + 1);
      continue;
    }
    const id = 'phrase-pron:' + sha256(json([
      phrase.phrase_id, 1, PHRASE_CITATION_COMPOSITION_POLICY,
    ])).slice(0, 24);
    insertPhrase.run(
      id,phrase.phrase_id,1,'citation_preferred',PHRASE_PRONUNCIATION_POLICY,PHRASE_IPA_ANALYZER,
      PHRASE_BOUNDARY_POLICY,PHRASE_CONNECTED_SPEECH_POLICY,composed.ipa,composed.canonicalPhonemes,
      composed.syllableCount,composed.stressPattern,json(composed.primaryStress),json(composed.secondaryStress),
      composed.vowelSequence,composed.consonantSequence,composed.exactTailKey,composed.multisyllableKey,
      composed.vowelKey,composed.vowelFamilyKey,composed.codaKey,composed.onsetKey,composed.stressedSyllableCount,
      json(composed.phonemeBoundaries),json(composed.syllableBoundaries),1,null,composed.fingerprint,
    );
    for (const token of composed.tokenRows) {
      insertToken.run(
        id,token.tokenIndex,token.writerFormId,token.writerPronunciationId,token.writerSurface,token.ipa,
        token.phonemeStart,token.phonemeEnd,token.syllableStart,token.syllableEnd,token.stressPattern,
        token.source,token.pronunciationCount,
      );
    }
    ready += 1;
    if (phrase.modern_eligible) readyModern += 1;
  }
  return { phraseCount, ready, readyModern, reasons };
}

export function computePhrasePronunciationFingerprint(db) {
  if (!tableExists(db, 'phrase_pronunciation')) return null;
  const resolutions = db.prepare(
    'SELECT * FROM phrase_token_pronunciation_resolution ORDER BY phrase_id,token_index',
  ).all();
  const pronunciations = db.prepare(
    'SELECT * FROM phrase_pronunciation ORDER BY phrase_pronunciation_id',
  ).all();
  const tokens = db.prepare(
    'SELECT * FROM phrase_pronunciation_token ORDER BY phrase_pronunciation_id,token_index',
  ).all();
  return sha256(json({ resolutions, pronunciations, tokens }));
}

export function phrasePronunciationStats(db) {
  if (!tableExists(db, 'phrase_token_pronunciation_resolution')) {
    return { tokenResolutions: 0, resolvedTokens: 0, unresolvedTokens: 0, readyPhrases: 0 };
  }
  const token = db.prepare(
    "SELECT COUNT(*) total,SUM(CASE WHEN status='resolved_preferred' THEN 1 ELSE 0 END) resolved " +
    'FROM phrase_token_pronunciation_resolution',
  ).get();
  const phrase = db.prepare(
    'SELECT COUNT(DISTINCT phrase_id) phrases FROM phrase_pronunciation WHERE eligible=1',
  ).get();
  return {
    tokenResolutions: Number(token.total || 0),
    resolvedTokens: Number(token.resolved || 0),
    unresolvedTokens: Number(token.total || 0) - Number(token.resolved || 0),
    readyPhrases: Number(phrase.phrases || 0),
  };
}

export function materializePhrasePronunciations(phraseDb, writerDb) {
  const writerSchema = assertWriterDb(writerDb);
  ensurePhrasePronunciationStorage(phraseDb);
  const baseBefore = computePhraseCatalogFingerprint(phraseDb);

  phraseDb.exec('BEGIN');
  try {
    phraseDb.exec([
      'DELETE FROM phrase_pronunciation_token;',
      'DELETE FROM phrase_pronunciation;',
      'DELETE FROM phrase_token_pronunciation_resolution;',
    ].join('\n'));
    const resolved = resolveWriterForms(phraseDb, writerDb);
    const tokenResult = writeTokenResolutions(phraseDb, resolved.selected);
    const phraseResult = writePhrases(phraseDb, tokenResult.byToken);
    phraseDb.exec('COMMIT');

    const baseAfter = computePhraseCatalogFingerprint(phraseDb);
    if (baseAfter !== baseBefore) {
      throw new Error('Base phrase catalog fingerprint changed: ' + baseBefore + ' -> ' + baseAfter);
    }
    const stats = phrasePronunciationStats(phraseDb);
    return {
      schema: PHRASE_PRONUNCIATION_SCHEMA,
      policy: PHRASE_PRONUNCIATION_POLICY,
      resolverPolicy: PHRASE_TOKEN_RESOLVER_POLICY,
      compositionPolicy: PHRASE_CITATION_COMPOSITION_POLICY,
      boundaryPolicy: PHRASE_BOUNDARY_POLICY,
      connectedSpeechPolicy: PHRASE_CONNECTED_SPEECH_POLICY,
      analyzer: PHRASE_IPA_ANALYZER,
      writerSchema,
      baseCatalogFingerprint: baseBefore,
      pronunciationFingerprint: computePhrasePronunciationFingerprint(phraseDb),
      distinctNormalizedTokens: resolved.normalized.length,
      phraseCount: phraseResult.phraseCount,
      readyModernPhrases: phraseResult.readyModern,
      ...stats,
      tokenCoverage: stats.tokenResolutions ? stats.resolvedTokens / stats.tokenResolutions : 0,
      phraseCoverage: phraseResult.phraseCount ? phraseResult.ready / phraseResult.phraseCount : 0,
      unresolvedReasonCounts: Object.fromEntries([...tokenResult.reasons.entries()].sort()),
      ineligiblePhraseReasonCounts: Object.fromEntries([...phraseResult.reasons.entries()].sort()),
    };
  } catch (error) {
    try { phraseDb.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
