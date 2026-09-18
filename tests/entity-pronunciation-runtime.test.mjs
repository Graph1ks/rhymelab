import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  buildEntityPrototype,
  createEntityStorage,
  writeEntityPrototype,
} from '../scripts/entity-lexicon-core.mjs';
import {
  ENTITY_PHONETIC_RUNTIME,
  ENTITY_RUNTIME_ANALYZER,
  analyzeEntityPronunciation,
  composeEntityNamePronunciation,
  entityRetrievalAnchors,
} from '../scripts/entity-pronunciation-core.mjs';
import {
  entityWriterCapabilities,
  searchEntityRhymes,
} from '../src/entity-writer-runtime.mjs';

const [fixture, taxonomy, materializerSource] = await Promise.all([
  readFile('fixtures/entity/wikidata-cultural-v1.json', 'utf8').then(JSON.parse),
  readFile('sources/entity/wikidata-entity-taxonomy-v1.json', 'utf8').then(JSON.parse),
  readFile('scripts/materialize-entity-pronunciations.mjs', 'utf8'),
]);

function buildEntityRuntimeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  createEntityStorage(db);
  writeEntityPrototype(db, buildEntityPrototype(fixture.items, taxonomy), {
    source: 'wikidata-phase12a-fixture',
    snapshotLabel: fixture.schema,
    artifactSha256: 'fixture-sha',
  });

  const name = db.prepare(`
    SELECT n.name_id
    FROM entity_name n
    JOIN entity e USING(entity_id)
    WHERE e.qid='Q130798' AND n.surface='Kendrick Lamar' AND n.language='de'
  `).get();
  assert.ok(name?.name_id);

  const ipa = 'ˈkɛndʁɪk laˈmaːʁ';
  const inserted = db.prepare(`
    INSERT INTO entity_pronunciation(
      name_id,locale,pronunciation_role,ipa,preferred,source_kind,
      generated,confidence,review_state
    ) VALUES(?,?,?,?,1,'fixture_source',0,1,'accepted')
  `).run(name.name_id, 'de-DE', 'de-DE', ipa);
  const pronunciationId = Number(inserted.lastInsertRowid);
  const analyzed = analyzeEntityPronunciation(ipa, 'de');
  const row = analyzed.row;
  db.prepare(`
    INSERT INTO entity_phonetic_analysis(
      pronunciation_id,analyzer_id,phonemes,syllables,syllable_count,
      primary_stress,secondary_stress,stress_pattern,vowel_sequence,
      consonant_sequence,rhyme_tail,rhyme_signature
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    pronunciationId,
    analyzed.analyzerId,
    row.phonemes,
    row.syllables,
    row.syllableCount,
    row.primaryStress,
    row.secondaryStress,
    row.stressPattern,
    row.vowelSequence,
    row.consonantSequence,
    row.rhymeTail,
    row.rhymeSignature,
  );
  const insertAnchor = db.prepare(`
    INSERT INTO entity_rhyme_anchor(analyzer_id,channel,anchor_key,pronunciation_id)
    VALUES(?,?,?,?)
  `);
  for (const anchor of entityRetrievalAnchors(analyzed.analysis, 'de')) {
    insertAnchor.run(analyzed.analyzerId, anchor.channel, anchor.key, pronunciationId);
  }
  const upsertMeta = db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);
  upsertMeta.run('entity_phonetic_runtime', ENTITY_PHONETIC_RUNTIME);
  upsertMeta.run('entity_phonetic_analyzer', ENTITY_RUNTIME_ANALYZER);
  upsertMeta.run('entity_phonetic_analyses', 1);
  return { db, ipa };
}

test('entity name pronunciation composition requires every token to resolve', () => {
  const details = new Map([
    ['Kendrick', { surface: 'Kendrick', preferredIpa: 'ˈkɛndʁɪk', syllableCount: 2, preferredPronunciationId: 1 }],
    ['Lamar', { surface: 'Lamar', preferredIpa: 'laˈmaːʁ', syllableCount: 2, preferredPronunciationId: 2 }],
  ]);
  const resolved = composeEntityNamePronunciation('Kendrick Lamar', (token) => details.get(token));
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.ipa, 'ˈkɛndʁɪk laˈmaːʁ');
  assert.equal(resolved.syllableCount, 4);

  const unresolved = composeEntityNamePronunciation('Kendrick Unknown', (token) => details.get(token));
  assert.equal(unresolved.status, 'unresolved_token');
  assert.deepEqual(unresolved.unresolvedTokens, ['Unknown']);
  assert.equal(unresolved.ipa, null);
});

test('entity phonetic runtime exposes indexed Rapper and Musician categories', () => {
  const { db, ipa } = buildEntityRuntimeDb();
  try {
    const capabilities = entityWriterCapabilities(db);
    assert.equal(capabilities.available, true);
    assert.equal(capabilities.analyzer, 'de-ipa-v2');
    assert.ok(capabilities.categories.includes('person.rapper'));
    assert.ok(capabilities.categories.includes('person.musician'));

    const result = searchEntityRhymes(db, {
      surface: 'Testwort',
      preferredIpa: ipa,
      syllableCount: 4,
    }, {
      language: 'de',
      category: 'person.rapper',
      limit: 20,
    });
    assert.equal(result.available, true);
    assert.equal(result.results[0].entityQid, 'Q130798');
    assert.equal(result.results[0].word, 'Kendrick Lamar');
    assert.equal(result.results[0].primaryType, 'multisyllabic_perfect');
    assert.equal(result.results[0].pronunciationSource, 'fixture_source');
    assert.ok(result.results[0].entityCategories.some((row) => row.category === 'person.rapper'));
    assert.ok(result.results[0].entityCategories.some((row) => row.category === 'person.musician'));

    const actorOnly = searchEntityRhymes(db, {
      surface: 'Testwort',
      preferredIpa: ipa,
      syllableCount: 4,
    }, {
      language: 'de',
      category: 'person.actor',
      limit: 20,
    });
    assert.equal(actorOnly.results.length, 0);
  } finally {
    db.close();
  }
});


test('entity pronunciation materializer exposes progress and resumable checkpoints', () => {
  assert.match(materializerSource, /const CHECKPOINT_EVERY = 10000/);
  assert.match(materializerSource, /const PROGRESS_EVERY = 5000/);
  assert.match(materializerSource, /phase 1\/3/);
  assert.match(materializerSource, /phase 2\/3/);
  assert.match(materializerSource, /phase 3\/3/);
  assert.match(materializerSource, /entity_pronunciation_name_checkpoint/);
  assert.match(materializerSource, /entity_phonetic_analysis_checkpoint/);
  assert.match(materializerSource, /compatible partial analyzer index found; resuming/);
  assert.match(materializerSource, /statement\.iterate/);
  assert.match(materializerSource, /PRAGMA wal_checkpoint\(TRUNCATE\)/);
});
