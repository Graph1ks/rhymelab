import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  buildPhraseMatcher,
  countPhraseMatchesInSentence,
  createPhraseCatalogStorage,
  phraseIdForNormalized,
  registerPhraseSnapshot,
  registerPhraseSource,
  snapshotIdFor,
  tokenKey,
  tokenizePhrase,
} from '../scripts/phrase-catalog-core.mjs';
import {
  COLOGNE_KIEZDEUTSCH_MATCH_POLICY,
  cleanConversationTranscriptLine,
  computeRegisterEvidenceFingerprint,
  ensurePhraseRegisterEvidenceStorage,
  registerEvidenceStats,
  writeRegisterEvidence,
} from '../scripts/phrase-register-evidence-core.mjs';

function insertPhrase(db, canonical) {
  const normalized = canonical.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-DE');
  const tokens = tokenizePhrase(canonical);
  const phraseId = phraseIdForNormalized(normalized);
  db.prepare(
    'INSERT INTO phrase(phrase_id,canonical,normalized,token_key,token_count,phrase_types_json,historical_state,modern_eligible,identity_fingerprint) VALUES(?,?,?,?,?,?,?,?,?)',
  ).run(
    phraseId,
    canonical,
    normalized,
    tokenKey(tokens),
    tokens.length,
    '["phrase"]',
    'current_or_unmarked',
    1,
    'fixture-' + phraseId,
  );
  const insertToken = db.prepare(
    'INSERT INTO phrase_token(phrase_id,token_index,surface,normalized,char_start,char_end,lexical_state,lexical_form_id) VALUES(?,?,?,?,?,?,?,NULL)',
  );
  for (const token of tokens) {
    insertToken.run(
      phraseId,
      token.index,
      token.surface,
      token.normalized,
      token.charStart,
      token.charEnd,
      'unresolved',
    );
  }
  return phraseId;
}

test('Cologne transcript cleaner removes speaker/annotation noise conservatively', () => {
  assert.equal(
    cleanConversationTranscriptLine('001 ME12: ich hab keine Ahnung (laughs)'),
    'ich hab keine Ahnung',
  );
  assert.equal(
    cleanConversationTranscriptLine('MO4 - das ist doch krass'),
    'das ist doch krass',
  );
  assert.equal(
    cleanConversationTranscriptLine('Kölner Korpus des Kiezdeutschen'),
    '',
  );
});

test('register evidence is additive, exact-token matched and provenance-fingerprinted', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON;');
    createPhraseCatalogStorage(db);
    ensurePhraseRegisterEvidenceStorage(db);

    registerPhraseSource(db, {
      source_id: 'fixture-cologne',
      name: 'Fixture Cologne',
      role: 'modern_youth_register',
      homepage_url: 'https://example.invalid/cologne',
      license_id: 'CC-BY-4.0',
      license_url: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Fixture',
      redistribution_policy: 'Fixture only',
    });

    const phraseA = insertPhrase(db, 'keine Ahnung');
    const phraseB = insertPhrase(db, 'das ist doch krass');
    const matcher = buildPhraseMatcher(db);

    const artifactSha256 = 'a'.repeat(64);
    const snapshotId = snapshotIdFor({
      sourceId: 'fixture-cologne',
      snapshotLabel: 'fixture:G1',
      artifactSha256,
    });
    registerPhraseSnapshot(db, {
      snapshot_id: snapshotId,
      source_id: 'fixture-cologne',
      snapshot_label: 'fixture:G1',
      artifact_path: '/local/ignored.pdf',
      artifact_sha256: artifactSha256,
      upstream_url: 'https://example.invalid/G1.pdf',
      evidence_year: 2023,
      genre: 'informal_spoken_youth',
      country: 'DE',
      metadata: { group: 'G1' },
    });

    const occurrenceCounts = new Map();
    const unitCounts = new Map();
    let corpusTokenCount = 0;
    let corpusUnitCount = 0;

    for (const line of [
      'ME12: ich hab keine Ahnung',
      'MO4: das ist doch krass',
      'ME12: keine Ahnung, wirklich keine Ahnung',
    ]) {
      const cleaned = cleanConversationTranscriptLine(line);
      const match = countPhraseMatchesInSentence(matcher, cleaned);
      corpusTokenCount += match.tokenCount;
      corpusUnitCount += 1;
      for (const [phraseId, count] of match.counts) {
        occurrenceCounts.set(phraseId, (occurrenceCounts.get(phraseId) || 0) + count);
      }
      for (const phraseId of match.seenInSentence) {
        unitCounts.set(phraseId, (unitCounts.get(phraseId) || 0) + 1);
      }
    }

    assert.equal(occurrenceCounts.get(phraseA), 3);
    assert.equal(unitCounts.get(phraseA), 2);
    assert.equal(occurrenceCounts.get(phraseB), 1);

    const inserted = writeRegisterEvidence(db, {
      snapshotId,
      policy: COLOGNE_KIEZDEUTSCH_MATCH_POLICY,
      registerTags: ['youth', 'spoken', 'urban'],
      occurrenceCounts,
      unitCounts,
      corpusTokenCount,
      corpusUnitCount,
      evidence: { scope: 'register_only' },
    });
    assert.equal(inserted, 2);

    const firstFingerprint = computeRegisterEvidenceFingerprint(db);
    assert.match(firstFingerprint, /^[a-f0-9]{64}$/u);

    const insertedAgain = writeRegisterEvidence(db, {
      snapshotId,
      policy: COLOGNE_KIEZDEUTSCH_MATCH_POLICY,
      registerTags: ['urban', 'spoken', 'youth'],
      occurrenceCounts,
      unitCounts,
      corpusTokenCount,
      corpusUnitCount,
      evidence: { scope: 'register_only' },
    });
    assert.equal(insertedAgain, 2);
    assert.equal(computeRegisterEvidenceFingerprint(db), firstFingerprint);

    const stats = registerEvidenceStats(db);
    assert.deepEqual(stats, {
      rows: 2,
      matchedPhrases: 2,
      snapshots: 1,
      occurrences: 4,
    });

    db.prepare(
      'UPDATE phrase_snapshot SET evidence_year=2024 WHERE snapshot_id=?',
    ).run(snapshotId);
    assert.notEqual(computeRegisterEvidenceFingerprint(db), firstFingerprint);
  } finally {
    db.close();
  }
});
