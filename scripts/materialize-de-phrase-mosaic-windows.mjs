#!/usr/bin/env node
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  PHRASE_MOSAIC_MAX_SYLLABLES,
  PHRASE_MOSAIC_MIN_SYLLABLES,
  PHRASE_MOSAIC_SCHEMA,
  PHRASE_MOSAIC_WINDOW_POLICY,
  materializePhraseMosaicWindows,
} from './phrase-mosaic-window-core.mjs';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let reportPath = 'data/local/phrase-mosaic-windows-v1-report.json';
let minSyllables = PHRASE_MOSAIC_MIN_SYLLABLES;
let maxSyllables = PHRASE_MOSAIC_MAX_SYLLABLES;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--phrases') phraseDbPath = args[++i] || phraseDbPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--min-syllables') minSyllables = Number(args[++i] || minSyllables);
  else if (arg === '--max-syllables') maxSyllables = Number(args[++i] || maxSyllables);
}

phraseDbPath = resolve(phraseDbPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

const db = new DatabaseSync(phraseDbPath);

try {
  db.exec('PRAGMA foreign_keys=ON;');
  const getMeta = db.prepare('SELECT value FROM meta WHERE key=?');
  const sourcePronunciationFingerprint =
    getMeta.get('phrase_pronunciation_fingerprint')?.value || null;
  const baseCatalogFingerprint = getMeta.get('catalog_fingerprint')?.value || null;

  if (!sourcePronunciationFingerprint) {
    throw new Error(
      'Missing phrase_pronunciation_fingerprint; run npm run phrase:pronunciation first',
    );
  }

  const result = materializePhraseMosaicWindows(db, { minSyllables, maxSyllables });

  const upsert = db.prepare([
    'INSERT INTO meta(key,value) VALUES(?,?)',
    ' ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ].join(''));
  const builtAt = new Date().toISOString();
  const meta = {
    phrase_mosaic_schema: PHRASE_MOSAIC_SCHEMA,
    phrase_mosaic_window_policy: PHRASE_MOSAIC_WINDOW_POLICY,
    phrase_mosaic_min_syllables: result.minSyllables,
    phrase_mosaic_max_syllables: result.maxSyllables,
    phrase_mosaic_window_fingerprint: result.windowFingerprint,
    phrase_mosaic_source_pronunciation_fingerprint: sourcePronunciationFingerprint,
    phrase_mosaic_updated_at: builtAt,
  };
  for (const [key, value] of Object.entries(meta)) upsert.run(key, String(value));

  db.exec('ANALYZE; PRAGMA optimize;');
  const databaseBytes = (await stat(phraseDbPath)).size;

  const report = {
    schema: 'rhymelab-phrase-mosaic-window-build-report-v1',
    status: 'ok',
    built_at: builtAt,
    phrase_database: phraseDbPath,
    database_bytes: databaseBytes,
    source_phrase_pronunciation_fingerprint: sourcePronunciationFingerprint,
    base_catalog_fingerprint: baseCatalogFingerprint,
    ...result,
    exactIndexedRetrievalReady: true,
    fuzzyCandidateRetrievalImplemented: false,
    phraseRankingImplemented: false,
    writerRuntimeRewired: false,
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    source_phrase_pronunciation_fingerprint: sourcePronunciationFingerprint,
    base_catalog_fingerprint: baseCatalogFingerprint,
    window_fingerprint: result.windowFingerprint,
    pronunciation_count: result.pronunciationCount,
    phrases_with_windows: result.phrasesWithWindows,
    window_count: result.windowCount,
    syllable_count_distribution: result.syllableCountDistribution,
    boundary_count_distribution: result.boundaryCountDistribution,
    report: reportPath,
  }, null, 2));
} finally {
  db.close();
}
