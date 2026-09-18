import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  buildEntityPrototype,
  computeEntityFingerprint,
  createEntityStorage,
  entityStats,
  searchEntityNames,
  sentinelChecks,
  writeEntityPrototype,
} from '../scripts/entity-lexicon-core.mjs';

const [fixture, taxonomy] = await Promise.all([
  readFile('fixtures/entity/wikidata-cultural-v1.json', 'utf8').then(JSON.parse),
  readFile('sources/entity/wikidata-entity-taxonomy-v1.json', 'utf8').then(JSON.parse),
]);

function prototype() {
  return buildEntityPrototype(fixture.items, taxonomy);
}

function buildMemoryDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  createEntityStorage(db);
  writeEntityPrototype(db, prototype(), {
    source: 'wikidata-phase12a-fixture',
    snapshotLabel: fixture.schema,
    artifactSha256: 'fixture-sha',
    metadata: { fixture_scale_only: true },
  });
  return db;
}

test('entity fixture applies structural and category-relative popularity gates', () => {
  const result = prototype();

  assert.deepEqual(result.structuralRejected, ['Q900000004']);
  assert.deepEqual(result.popularityRejected, ['Q900000002', 'Q900000003']);

  const retained = new Set(result.retained.map((row) => row.qid));
  for (const qid of ['Q221074', 'Q130798', 'Q178516', 'Q47703', 'Q17452', 'Q3244512']) {
    assert.equal(retained.has(qid), true, `${qid} should be retained`);
  }

  const bud = result.retained.find((row) => row.qid === 'Q221074');
  const actor = bud.categories.find((row) => row.category === 'person.actor');
  assert.equal(actor.categoryTier, 'A');
  assert.equal(actor.categoryPercentile, 1);
  assert.equal(bud.retention.retainedBySentinel, 1);

  const midActor = result.retained.find((row) => row.qid === 'Q900000001');
  assert.equal(midActor.categories.find((row) => row.category === 'person.actor').categoryTier, 'B');
});

test('protected cultural sentinel passes without flattening category evidence', () => {
  const checks = sentinelChecks(prototype(), taxonomy);
  assert.deepEqual(checks, [{
    qid: 'Q221074',
    name: 'Bud Spencer',
    retained: true,
    category: 'person.actor',
    categoryTier: 'A',
    expectedTier: 'A',
    pass: true,
  }]);
});

test('entity names preserve source aliases and do not invent arbitrary token aliases', () => {
  const result = prototype();
  const kendrick = result.retained.find((row) => row.qid === 'Q130798');
  const surfaces = kendrick.names.map((row) => row.surface);

  assert.equal(surfaces.includes('Kendrick Lamar'), true);
  assert.equal(surfaces.includes('K.Dot'), true);
  assert.equal(surfaces.includes('Oklama'), true);
  assert.equal(surfaces.includes('Kendrick'), false);
  assert.equal(surfaces.includes('Lamar'), false);
});

test('entity SQLite prototype stores normalized names, FTS and empty pronunciation layer', () => {
  const db = buildMemoryDb();
  try {
    const stats = entityStats(db);
    assert.equal(stats.entities, 7);
    assert.equal(stats.pronunciations, 0);
    assert.equal(stats.phoneticAnalyses, 0);

    const gucci = searchEntityNames(db, 'Gucci');
    assert.equal(gucci[0].qid, 'Q178516');
    assert.equal(gucci[0].surface, 'Gucci');

    const kdot = searchEntityNames(db, 'K.Dot');
    assert.equal(kdot.some((row) => row.qid === 'Q130798'), true);

    const invented = searchEntityNames(db, 'Kendrick');
    assert.equal(invented.some((row) => row.surface === 'Kendrick'), false);
  } finally {
    db.close();
  }
});

test('entity prototype semantic fingerprint is repeatable across independent SQLite builds', () => {
  const first = buildMemoryDb();
  const second = buildMemoryDb();
  try {
    assert.equal(computeEntityFingerprint(first), computeEntityFingerprint(second));
  } finally {
    first.close();
    second.close();
  }
});
