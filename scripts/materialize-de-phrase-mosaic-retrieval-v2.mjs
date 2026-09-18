#!/usr/bin/env node
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  PHRASE_MOSAIC_RETRIEVAL_V2_FAMILY_POLICY,
  PHRASE_MOSAIC_RETRIEVAL_V2_POLICY,
  PHRASE_MOSAIC_RETRIEVAL_V2_SCHEMA,
  materializePhraseMosaicRetrievalV2Anchors,
} from './phrase-mosaic-retrieval-v2-core.mjs';

const ACCEPTED_11D2_ANCHOR_FINGERPRINT =
  '55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae';
const ACCEPTED_11D1_WINDOW_FINGERPRINT =
  '24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let reportPath = 'data/local/phrase-mosaic-retrieval-v2-candidate-report.json';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--phrases') phraseDbPath = args[++i] || phraseDbPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
}

phraseDbPath = resolve(phraseDbPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

const db = new DatabaseSync(phraseDbPath);

try {
  db.exec('PRAGMA foreign_keys=ON;');
  const metaRows = db.prepare('SELECT key,value FROM meta').all();
  const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));

  if (meta.phrase_mosaic_retrieval_fingerprint !== ACCEPTED_11D2_ANCHOR_FINGERPRINT) {
    throw new Error(
      'Expected accepted 11D2 retrieval fingerprint '
      + ACCEPTED_11D2_ANCHOR_FINGERPRINT
      + ', got '
      + String(meta.phrase_mosaic_retrieval_fingerprint || 'missing'),
    );
  }
  if (meta.phrase_mosaic_window_fingerprint !== ACCEPTED_11D1_WINDOW_FINGERPRINT) {
    throw new Error(
      'Expected accepted 11D1 window fingerprint '
      + ACCEPTED_11D1_WINDOW_FINGERPRINT
      + ', got '
      + String(meta.phrase_mosaic_window_fingerprint || 'missing'),
    );
  }

  const result = materializePhraseMosaicRetrievalV2Anchors(db);
  if (result.sourceV1Fingerprint !== ACCEPTED_11D2_ANCHOR_FINGERPRINT) {
    throw new Error('11D4 source fingerprint mismatch after materialization');
  }

  const builtAt = new Date().toISOString();
  const upsert = db.prepare([
    'INSERT INTO meta(key,value) VALUES(?,?)',
    ' ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ].join(''));
  const candidateMeta = {
    phrase_mosaic_retrieval_v2_schema: PHRASE_MOSAIC_RETRIEVAL_V2_SCHEMA,
    phrase_mosaic_retrieval_v2_policy: PHRASE_MOSAIC_RETRIEVAL_V2_POLICY,
    phrase_mosaic_retrieval_v2_family_policy: PHRASE_MOSAIC_RETRIEVAL_V2_FAMILY_POLICY,
    phrase_mosaic_retrieval_v2_fingerprint: result.candidateFingerprint,
    phrase_mosaic_retrieval_v2_source_v1_fingerprint: result.sourceV1Fingerprint,
    phrase_mosaic_retrieval_v2_updated_at: builtAt,
  };
  for (const [key, value] of Object.entries(candidateMeta)) upsert.run(key, String(value));

  db.exec('ANALYZE; PRAGMA optimize;');
  const databaseBytes = (await stat(phraseDbPath)).size;

  const report = {
    schema: 'rhymelab-phrase-mosaic-retrieval-v2-candidate-build-report-v1',
    status: 'ok',
    built_at: builtAt,
    phrase_database: phraseDbPath,
    database_bytes: databaseBytes,
    accepted_source_v1_fingerprint: ACCEPTED_11D2_ANCHOR_FINGERPRINT,
    accepted_source_window_fingerprint: ACCEPTED_11D1_WINDOW_FINGERPRINT,
    source_phrase_pronunciation_fingerprint:
      meta.phrase_pronunciation_fingerprint || null,
    base_catalog_fingerprint: meta.catalog_fingerprint || null,
    ...result,
    fullSurfaceQueryDomainImplemented: true,
    vowelFamilyBridgeImplemented: true,
    weakUnrelatedDefaultFilterImplemented: true,
    phraseRankingImplemented: false,
    writerRuntimeRewired: false,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    source_v1_fingerprint: report.sourceV1Fingerprint,
    source_v1_unchanged: report.sourceV1FingerprintUnchanged,
    anchor_count: report.anchorCount,
    distinct_vowel_family_coda_keys: report.distinctVowelFamilyCodaKeys,
    candidate_fingerprint: report.candidateFingerprint,
    database_bytes: report.database_bytes,
    report: reportPath,
  }, null, 2));
} finally {
  db.close();
}
