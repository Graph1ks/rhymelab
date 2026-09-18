#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  PHRASE_MOSAIC_QUERY_DIAGNOSTICS_POLICY,
  PHRASE_MOSAIC_QUERY_DIAGNOSTICS_SCHEMA,
  runPhraseMosaicQueryDiagnostics,
} from './phrase-mosaic-query-diagnostics-core.mjs';

const ACCEPTED_11D2_ANCHOR_FINGERPRINT =
  '55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae';
const ACCEPTED_11D1_WINDOW_FINGERPRINT =
  '24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let writerDbPath = 'data/local/rhymelab-v5.sqlite';
let planPath = 'benchmarks/de-writer-v2/plan.json';
let reportPath = 'data/local/phrase-mosaic-query-diagnostics-v1-report.json';
let perChannelLimit = 128;
let maxCandidates = 512;
let topCandidates = 20;
const requestedQueries = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--phrases') phraseDbPath = args[++i] || phraseDbPath;
  else if (arg === '--writer') writerDbPath = args[++i] || writerDbPath;
  else if (arg === '--plan') planPath = args[++i] || planPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--query') requestedQueries.push(args[++i] || '');
  else if (arg === '--per-channel-limit') perChannelLimit = Number(args[++i] || perChannelLimit);
  else if (arg === '--max-candidates') maxCandidates = Number(args[++i] || maxCandidates);
  else if (arg === '--top') topCandidates = Number(args[++i] || topCandidates);
}

phraseDbPath = resolve(phraseDbPath);
writerDbPath = resolve(writerDbPath);
planPath = resolve(planPath);
reportPath = resolve(reportPath);

const plan = JSON.parse(await readFile(planPath, 'utf8'));
const planQueries = Array.isArray(plan.queries) ? plan.queries : [];
const queryByLower = new Map(
  planQueries.map((entry) => [String(entry.word || '').toLocaleLowerCase('de-DE'), entry]),
);
const selectedQueries = requestedQueries.length
  ? requestedQueries.filter(Boolean).map((word) =>
      queryByLower.get(String(word).toLocaleLowerCase('de-DE')) || { word, phenomena: [] }
    )
  : planQueries;

if (!selectedQueries.length) throw new Error('No diagnostic queries selected');

const phraseDb = new DatabaseSync(phraseDbPath, { readOnly: true });
const writerDb = new DatabaseSync(writerDbPath, { readOnly: true });

try {
  phraseDb.exec('PRAGMA query_only=ON;');
  writerDb.exec('PRAGMA query_only=ON;');

  const phraseMeta = Object.fromEntries(
    phraseDb.prepare('SELECT key,value FROM meta').all().map((row) => [row.key, row.value]),
  );
  const writerMeta = Object.fromEntries(
    writerDb.prepare("SELECT key,value FROM meta WHERE key IN ('schema','language')").all()
      .map((row) => [row.key, row.value]),
  );

  if (phraseMeta.phrase_mosaic_retrieval_fingerprint !== ACCEPTED_11D2_ANCHOR_FINGERPRINT) {
    throw new Error(
      'Expected accepted 11D2 anchor fingerprint '
      + ACCEPTED_11D2_ANCHOR_FINGERPRINT
      + ', got '
      + String(phraseMeta.phrase_mosaic_retrieval_fingerprint || 'missing'),
    );
  }
  if (phraseMeta.phrase_mosaic_window_fingerprint !== ACCEPTED_11D1_WINDOW_FINGERPRINT) {
    throw new Error(
      'Expected accepted 11D1 window fingerprint '
      + ACCEPTED_11D1_WINDOW_FINGERPRINT
      + ', got '
      + String(phraseMeta.phrase_mosaic_window_fingerprint || 'missing'),
    );
  }
  if (writerMeta.schema !== 'rhymelab-local-db-v5') {
    throw new Error('Expected Writer-v5 query inventory, got ' + String(writerMeta.schema || 'missing'));
  }

  const diagnostics = runPhraseMosaicQueryDiagnostics({
    phraseDb,
    writerDb,
    queries: selectedQueries,
    perChannelLimit,
    maxCandidates,
    topCandidates,
  });

  const report = {
    schema: PHRASE_MOSAIC_QUERY_DIAGNOSTICS_SCHEMA,
    status: 'ok',
    built_at: new Date().toISOString(),
    policy: PHRASE_MOSAIC_QUERY_DIAGNOSTICS_POLICY,
    phrase_database: phraseDbPath,
    writer_database: writerDbPath,
    plan: planPath,
    plan_schema: plan.schema || null,
    plan_version: plan.version || null,
    source_anchor_fingerprint: phraseMeta.phrase_mosaic_retrieval_fingerprint,
    source_window_fingerprint: phraseMeta.phrase_mosaic_window_fingerprint,
    source_phrase_pronunciation_fingerprint:
      phraseMeta.phrase_pronunciation_fingerprint || null,
    base_catalog_fingerprint: phraseMeta.catalog_fingerprint || null,
    writer_schema: writerMeta.schema,
    writer_language: writerMeta.language || 'de',
    settings: {
      perChannelLimit,
      maxCandidates,
      topCandidates,
      requestedQueries: requestedQueries.length ? requestedQueries : null,
    },
    ...diagnostics,
    phraseRankingImplemented: false,
    writerRuntimeRewired: false,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    query_count: report.queryCount,
    status_counts: report.statusCounts,
    mean_elapsed_ms: report.meanElapsedMs,
    total_returned_candidates: report.totalReturnedCandidates,
    aggregate_primary_types: report.aggregatePrimaryTypes,
    aggregate_retrieval_channels: report.aggregateRetrievalChannels,
    semantic_fingerprint: report.semanticFingerprint,
    queries: report.queries.map((entry) => ({
      word: entry.word,
      status: entry.status,
      reason: entry.reason,
      preferred_ipa: entry.query?.preferredIpa || null,
      mosaic_anchor_count: entry.query?.mosaicAnchors?.length || 0,
      raw_matches: entry.retrieval?.rawAnchorWindowMatches ?? 0,
      returned_candidates: entry.candidateSummary?.returnedCandidates ?? 0,
      elapsed_ms: entry.elapsedMs,
      top: entry.topCandidates.slice(0, 5).map((candidate) => ({
        canonical: candidate.canonical,
        type: candidate.score.type,
        score: candidate.score.overall,
        channels: candidate.retrievalChannels,
        span: [candidate.syllableStart, candidate.syllableEnd],
      })),
    })),
    report: reportPath,
  }, null, 2));
} finally {
  phraseDb.close();
  writerDb.close();
}
