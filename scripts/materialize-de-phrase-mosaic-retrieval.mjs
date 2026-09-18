#!/usr/bin/env node
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  PHRASE_MOSAIC_RETRIEVAL_ANCHOR_POLICY,
  PHRASE_MOSAIC_RETRIEVAL_POLICY,
  PHRASE_MOSAIC_RETRIEVAL_SCHEMA,
  materializePhraseMosaicRetrievalAnchors,
} from './phrase-mosaic-retrieval-core.mjs';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let reportPath = 'data/local/phrase-mosaic-retrieval-v1-report.json';

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
  const getMeta = db.prepare('SELECT value FROM meta WHERE key=?');
  const sourceWindowFingerprint =
    getMeta.get('phrase_mosaic_window_fingerprint')?.value || null;
  const sourcePronunciationFingerprint =
    getMeta.get('phrase_pronunciation_fingerprint')?.value || null;
  const baseCatalogFingerprint = getMeta.get('catalog_fingerprint')?.value || null;

  if (!sourceWindowFingerprint) {
    throw new Error(
      'Missing phrase_mosaic_window_fingerprint; run npm run phrase:mosaic:windows first',
    );
  }
  if (!sourcePronunciationFingerprint) {
    throw new Error(
      'Missing phrase_pronunciation_fingerprint; run npm run phrase:pronunciation first',
    );
  }

  const result = materializePhraseMosaicRetrievalAnchors(db);
  if (result.sourceWindowFingerprint !== sourceWindowFingerprint) {
    throw new Error(
      'Stored mosaic-window fingerprint differs from current rows: '
      + sourceWindowFingerprint + ' != ' + result.sourceWindowFingerprint,
    );
  }

  const builtAt = new Date().toISOString();
  const upsert = db.prepare([
    'INSERT INTO meta(key,value) VALUES(?,?)',
    ' ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ].join(''));
  const meta = {
    phrase_mosaic_retrieval_schema: PHRASE_MOSAIC_RETRIEVAL_SCHEMA,
    phrase_mosaic_retrieval_policy: PHRASE_MOSAIC_RETRIEVAL_POLICY,
    phrase_mosaic_retrieval_anchor_policy: PHRASE_MOSAIC_RETRIEVAL_ANCHOR_POLICY,
    phrase_mosaic_retrieval_fingerprint: result.anchorFingerprint,
    phrase_mosaic_retrieval_source_window_fingerprint: sourceWindowFingerprint,
    phrase_mosaic_retrieval_updated_at: builtAt,
  };
  for (const [key, value] of Object.entries(meta)) upsert.run(key, String(value));

  db.exec('ANALYZE; PRAGMA optimize;');
  const databaseBytes = (await stat(phraseDbPath)).size;
  const report = {
    schema: 'rhymelab-phrase-mosaic-retrieval-build-report-v1',
    status: 'ok',
    built_at: builtAt,
    phrase_database: phraseDbPath,
    database_bytes: databaseBytes,
    source_window_fingerprint: sourceWindowFingerprint,
    source_phrase_pronunciation_fingerprint: sourcePronunciationFingerprint,
    base_catalog_fingerprint: baseCatalogFingerprint,
    ...result,
    boundedIndexedCandidateRetrievalImplemented: true,
    phraseRankingImplemented: false,
    writerRuntimeRewired: false,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    source_window_fingerprint: sourceWindowFingerprint,
    anchor_fingerprint: result.anchorFingerprint,
    anchor_count: result.anchorCount,
    distinct_exact_tail_keys: result.distinctExactTailKeys,
    distinct_vowel_keys: result.distinctVowelKeys,
    distinct_final_nucleus_coda_class_keys: result.distinctFinalNucleusCodaClassKeys,
    database_bytes: databaseBytes,
    report: reportPath,
  }, null, 2));
} finally {
  db.close();
}
