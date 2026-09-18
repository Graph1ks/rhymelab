#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  analyzePhrasePronunciationCoverage,
  PHRASE_PRONUNCIATION_COVERAGE_REPORT_SCHEMA,
} from './phrase-pronunciation-coverage-core.mjs';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let reportPath = 'data/local/phrase-pronunciation-coverage-v1-report.json';
let topLimit = 100;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--phrases') phraseDbPath = args[++i] || phraseDbPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--top') topLimit = Number(args[++i] || topLimit);
}

phraseDbPath = resolve(phraseDbPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

const db = new DatabaseSync(phraseDbPath, { readOnly: true });
try {
  const analysis = analyzePhrasePronunciationCoverage(db, { topLimit });
  const meta = db.prepare(
    "SELECT key,value FROM meta WHERE key IN ('catalog_fingerprint','phrase_pronunciation_fingerprint') ORDER BY key",
  ).all();
  const metaValues = Object.fromEntries(meta.map((row) => [row.key, row.value]));
  const report = {
    ...analysis,
    schema: PHRASE_PRONUNCIATION_COVERAGE_REPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    phraseDatabase: phraseDbPath,
    catalogFingerprint: metaValues.catalog_fingerprint || null,
    phrasePronunciationFingerprint: metaValues.phrase_pronunciation_fingerprint || null,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    schema: report.schema,
    phrase_coverage_pct: report.phraseCoveragePct,
    modern_phrase_coverage_pct: report.modernPhraseCoveragePct,
    unresolved_token_occurrences: report.unresolvedTokenOccurrences,
    distinct_unresolved_normalized_tokens: report.distinctUnresolvedNormalizedTokens,
    blocked_phrases: report.blockedPhrases,
    blocked_modern_phrases: report.blockedModernPhrases,
    one_distinct_blocker_modern_phrases: report.oneDistinctBlockerModernPhrases,
    unlock_curve: report.unlockCurve,
    top_blockers: report.topBlockers.slice(0, 20),
    report: reportPath,
  }, null, 2));
} finally {
  db.close();
}
