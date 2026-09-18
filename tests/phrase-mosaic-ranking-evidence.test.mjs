import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  classifyPhraseSurfaceSafety,
  enrichPhraseMosaicCandidates,
  normalizedTokenOverlap,
  PHRASE_MOSAIC_RANKING_EVIDENCE_POLICY,
} from '../scripts/phrase-mosaic-ranking-evidence-core.mjs';

function fixtureDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE phrase_snapshot(
      snapshot_id TEXT PRIMARY KEY,
      snapshot_label TEXT NOT NULL
    );
    CREATE TABLE phrase_usage_evidence(
      phrase_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      policy TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL,
      sentence_count INTEGER NOT NULL,
      per_million_tokens REAL NOT NULL,
      per_million_sentences REAL NOT NULL
    );
    CREATE TABLE phrase_attestation(
      attestation_id TEXT PRIMARY KEY,
      phrase_id TEXT NOT NULL,
      style_tags_json TEXT NOT NULL
    );
  `);
  const snapshots = [
    ['news', 'deu_news_2024_1M'],
    ['wiki', 'deu_wikipedia_2021_1M'],
    ['web', 'deu-de_web_2021_1M'],
  ];
  const insertSnapshot = db.prepare(
    'INSERT INTO phrase_snapshot(snapshot_id,snapshot_label) VALUES(?,?)',
  );
  for (const row of snapshots) insertSnapshot.run(...row);

  db.prepare(`
    INSERT INTO phrase_usage_evidence(
      phrase_id,snapshot_id,policy,occurrence_count,sentence_count,
      per_million_tokens,per_million_sentences
    ) VALUES(?,?,?,?,?,?,?)
  `).run('p-safe', 'news', 'leipzig-exact-token-sequence-v1', 8, 4, 2.5, 4);
  db.prepare(`
    INSERT INTO phrase_usage_evidence(
      phrase_id,snapshot_id,policy,occurrence_count,sentence_count,
      per_million_tokens,per_million_sentences
    ) VALUES(?,?,?,?,?,?,?)
  `).run('p-safe', 'web', 'leipzig-exact-token-sequence-v1', 2, 1, 0.5, 1);
  db.prepare(
    'INSERT INTO phrase_attestation(attestation_id,phrase_id,style_tags_json) VALUES(?,?,?)',
  ).run('a-safe', 'p-safe', '["colloquial","poetic"]');

  return db;
}

function retrievalFixture() {
  const score = {
    type: 'multisyllabic_slant',
    overall: 0.91,
    vowel: 1,
    coda: 0.7,
    stress: 1,
    syllable: 1,
    onset: 0.8,
    consonance: 0.7,
    relationTypes: ['assonance'],
  };
  return {
    schema: 'rhymelab-phrase-mosaic-retrieval-v2-candidate',
    policy: 'de-bounded-indexed-mosaic-retrieval-v2-candidate',
    candidates: [
      {
        windowId: 'w-safe',
        phraseId: 'p-safe',
        canonical: 'dabei seid',
        phraseTypes: ['multiword_lexeme'],
        historicalState: 'current_or_unmarked',
        modernEligible: true,
        syllableCount: 2,
        crossedWordBoundaries: 1,
        score,
      },
      {
        windowId: 'w-marked',
        phraseId: 'p-marked',
        canonical: 'K.-o.-Siegen',
        phraseTypes: ['multiword_lexeme'],
        historicalState: 'current_or_unmarked',
        modernEligible: true,
        syllableCount: 2,
        crossedWordBoundaries: 1,
        score: { ...score, overall: 0.86 },
      },
    ],
  };
}

test('11E1 surface safety marks abbreviation-like surfaces without changing rhyme truth', () => {
  const marked = classifyPhraseSurfaceSafety('K.-o.-Siegen');
  assert.equal(marked.class, 'marked');
  assert.ok(marked.reasons.includes('dotted_single_letter_sequence'));
  assert.ok(marked.reasons.includes('multiple_single_letter_tokens'));

  const safe = classifyPhraseSurfaceSafety('dabei seid');
  assert.deepEqual(safe, { class: 'safe', reasons: [] });

  const historical = classifyPhraseSurfaceSafety('mit Fug und Recht', {
    historicalState: 'historical_only',
    modernEligible: false,
  });
  assert.equal(historical.class, 'restricted');
  assert.ok(historical.reasons.includes('historical_only'));
});

test('11E1 normalized query overlap is deterministic and separate from phonetics', () => {
  const overlap = normalizedTokenOverlap('Arbeitsweise', 'meine Arbeitsweise');
  assert.equal(overlap.queryTokenCount, 1);
  assert.equal(overlap.overlapCount, 1);
  assert.deepEqual(overlap.overlapTokens, ['arbeitsweise']);
  assert.equal(overlap.overlapShare, 1);

  const none = normalizedTokenOverlap('Musik', 'K.-o.-Siegen');
  assert.equal(none.overlapCount, 0);
});

test('11E1 enriches frozen candidates with equal-weight Leipzig evidence and stable fingerprint', () => {
  const db = fixtureDb();
  try {
    const retrieval = retrievalFixture();
    const first = enrichPhraseMosaicCandidates(db, 'Freiheit', retrieval);
    const second = enrichPhraseMosaicCandidates(db, 'Freiheit', retrieval);

    assert.equal(first.policy, PHRASE_MOSAIC_RANKING_EVIDENCE_POLICY);
    assert.equal(first.rankingImplemented, false);
    assert.equal(first.evidenceFingerprint, second.evidenceFingerprint);
    assert.equal(first.retrievalCandidateCount, 2);

    const safe = first.candidates.find((candidate) => candidate.phraseId === 'p-safe');
    assert.ok(safe);
    assert.equal(safe.score.type, 'multisyllabic_slant');
    assert.equal(safe.score.overall, 0.91);
    assert.equal(safe.rankingEvidence.leipzig.corpusCount, 2);
    assert.equal(safe.rankingEvidence.leipzig.occurrenceSum, 10);
    assert.equal(safe.rankingEvidence.leipzig.sentenceSum, 5);
    assert.equal(
      safe.rankingEvidence.leipzig.equalWeightCommonness,
      Number(((Math.log1p(4) + Math.log1p(1)) / 3).toFixed(6)),
    );
    assert.deepEqual(safe.rankingEvidence.styleTags, ['colloquial', 'poetic']);
    assert.equal(safe.rankingEvidence.surfaceSafety.class, 'safe');

    const marked = first.candidates.find((candidate) => candidate.phraseId === 'p-marked');
    assert.ok(marked);
    assert.equal(marked.rankingEvidence.leipzig.corpusCount, 0);
    assert.equal(marked.rankingEvidence.leipzig.equalWeightCommonness, 0);
    assert.equal(marked.rankingEvidence.surfaceSafety.class, 'marked');
  } finally {
    db.close();
  }
});
