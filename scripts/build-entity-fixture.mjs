#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_DB_SCHEMA,
  ENTITY_POPULARITY_POLICY,
  buildEntityPrototype,
  computeEntityFingerprint,
  createEntityStorage,
  entityStats,
  sentinelChecks,
  writeEntityPrototype,
} from './entity-lexicon-core.mjs';

const args = process.argv.slice(2);
let fixturePath = 'fixtures/entity/wikidata-cultural-v1.json';
let taxonomyPath = 'sources/entity/wikidata-entity-taxonomy-v1.json';
let outPath = 'data/local/rhymelab-entities-v1-fixture.sqlite';
let reportPath = 'data/local/entity-lexicon-v1-fixture-report.json';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--fixture') fixturePath = args[++i] || fixturePath;
  else if (arg === '--taxonomy') taxonomyPath = args[++i] || taxonomyPath;
  else if (arg === '--out') outPath = args[++i] || outPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
}

fixturePath = resolve(fixturePath);
taxonomyPath = resolve(taxonomyPath);
outPath = resolve(outPath);
reportPath = resolve(reportPath);

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

await mkdir(dirname(outPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });
await rm(outPath, { force: true });

const [fixtureRaw, taxonomyRaw, fixtureSha256, taxonomySha256] = await Promise.all([
  readFile(fixturePath, 'utf8'),
  readFile(taxonomyPath, 'utf8'),
  sha256File(fixturePath),
  sha256File(taxonomyPath),
]);

const fixture = JSON.parse(fixtureRaw);
const taxonomy = JSON.parse(taxonomyRaw);

if (fixture.schema !== 'rhymelab-entity-fixture-v1') {
  throw new Error(`Unexpected entity fixture schema: ${fixture.schema}`);
}
if (taxonomy.schema !== 'rhymelab-wikidata-entity-taxonomy-v1') {
  throw new Error(`Unexpected entity taxonomy schema: ${taxonomy.schema}`);
}

const prototype = buildEntityPrototype(fixture.items || [], taxonomy);
const sentinel = sentinelChecks(prototype, taxonomy);
const allSentinelsPass = sentinel.every((row) => row.pass);

const db = new DatabaseSync(outPath);
try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;');
  createEntityStorage(db);
  db.exec('BEGIN');
  try {
    writeEntityPrototype(db, prototype, {
      source: 'wikidata-phase12a-fixture',
      snapshotLabel: fixture.schema,
      upstreamUrl: 'https://www.wikidata.org/',
      artifactSha256: fixtureSha256,
      licenseId: 'CC0-1.0',
      importerVersion: ENTITY_DB_SCHEMA,
      metadata: {
        fixture_schema: fixture.schema,
        fixture_scale_only: true,
        taxonomy_sha256: taxonomySha256,
        popularity_policy: ENTITY_POPULARITY_POLICY,
      },
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  db.exec('ANALYZE; PRAGMA optimize;');

  const fingerprint = computeEntityFingerprint(db);
  const stats = entityStats(db);
  const fileBytes = (await stat(outPath)).size;
  const categories = db.prepare(`
    SELECT category,COUNT(*) AS retained_entities,
      SUM(CASE WHEN category_tier='A' THEN 1 ELSE 0 END) AS tier_a,
      SUM(CASE WHEN category_tier='B' THEN 1 ELSE 0 END) AS tier_b,
      SUM(CASE WHEN category_tier='C' THEN 1 ELSE 0 END) AS tier_c
    FROM entity_category
    GROUP BY category
    ORDER BY category
  `).all();

  const report = {
    schema: 'rhymelab-entity-lexicon-fixture-report-v1',
    status: allSentinelsPass ? 'ok' : 'sentinel_failure',
    built_at: new Date().toISOString(),
    entity_schema: ENTITY_DB_SCHEMA,
    popularity_policy: ENTITY_POPULARITY_POLICY,
    fixture: fixturePath,
    fixture_sha256: fixtureSha256,
    taxonomy: taxonomyPath,
    taxonomy_sha256: taxonomySha256,
    database: outPath,
    database_bytes: fileBytes,
    semantic_fingerprint: fingerprint,
    input_items: (fixture.items || []).length,
    structural_candidates: prototype.candidates.length,
    retained_entities: prototype.retained.length,
    structural_rejected: prototype.structuralRejected,
    popularity_rejected: prototype.popularityRejected,
    sentinels: sentinel,
    all_sentinels_pass: allSentinelsPass,
    categories,
    stats,
    pronunciation_materialized: false,
    runtime_rewired: false,
    fixture_popularity_is_live_data: false,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  if (!allSentinelsPass) process.exitCode = 1;
} finally {
  db.close();
}
