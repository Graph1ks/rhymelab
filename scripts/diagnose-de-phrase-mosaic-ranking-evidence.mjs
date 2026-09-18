#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getWord } from '../src/local-engine.mjs';
import { runPhraseMosaicQueryDiagnostics } from './phrase-mosaic-query-diagnostics-core.mjs';
import { retrievePhraseMosaicCandidatesV2 } from './phrase-mosaic-retrieval-v2-core.mjs';
import {
  enrichPhraseMosaicCandidates,
  PHRASE_MOSAIC_RANKING_EVIDENCE_POLICY,
  PHRASE_MOSAIC_RANKING_EVIDENCE_SCHEMA,
} from './phrase-mosaic-ranking-evidence-core.mjs';

const ACCEPTED_11D4_ANCHOR_FINGERPRINT =
  '9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059';
const ACCEPTED_11D4_DIAGNOSTIC_FINGERPRINT =
  '4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let writerDbPath = 'data/local/rhymelab-v5.sqlite';
let planPath = 'benchmarks/de-writer-v2/plan.json';
let reportPath = 'data/local/phrase-mosaic-ranking-evidence-v1-report.json';
let perChannelLimit = 128;
let maxCandidates = 512;
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

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function increment(object, key) {
  const normalized = String(key || 'unknown');
  object[normalized] = Number(object[normalized] || 0) + 1;
}

function evidenceSummary(candidate) {
  if (!candidate) return null;
  const evidence = candidate.rankingEvidence;
  return {
    canonical: candidate.canonical,
    phraseId: candidate.phraseId,
    windowId: candidate.windowId,
    phoneticType: candidate.score?.type || null,
    phoneticScore: candidate.score?.overall ?? null,
    phraseTypes: candidate.phraseTypes || [],
    leipzigCorpusCount: evidence.leipzig.corpusCount,
    leipzigOccurrenceSum: evidence.leipzig.occurrenceSum,
    leipzigSentenceSum: evidence.leipzig.sentenceSum,
    leipzigEqualWeightCommonness: evidence.leipzig.equalWeightCommonness,
    styleTags: evidence.styleTags,
    surfaceSafety: evidence.surfaceSafety,
    queryTokenOverlap: evidence.queryTokenOverlap,
  };
}

const phraseDb = new DatabaseSync(phraseDbPath, { readOnly: true });
const writerDb = new DatabaseSync(writerDbPath, { readOnly: true });

try {
  phraseDb.exec('PRAGMA query_only=ON;');
  writerDb.exec('PRAGMA query_only=ON;');

  const phraseMeta = Object.fromEntries(
    phraseDb.prepare('SELECT key,value FROM meta').all().map((row) => [row.key, row.value]),
  );
  if (phraseMeta.phrase_mosaic_retrieval_v2_fingerprint !== ACCEPTED_11D4_ANCHOR_FINGERPRINT) {
    throw new Error(
      'Expected accepted 11D4 anchor fingerprint '
      + ACCEPTED_11D4_ANCHOR_FINGERPRINT
      + ', got '
      + String(phraseMeta.phrase_mosaic_retrieval_v2_fingerprint || 'missing'),
    );
  }

  const retrievalControl = runPhraseMosaicQueryDiagnostics({
    phraseDb,
    writerDb,
    queries: selectedQueries,
    perChannelLimit,
    maxCandidates,
    topCandidates: 20,
    retrieveCandidates: retrievePhraseMosaicCandidatesV2,
    diagnosticSchema: 'rhymelab-phrase-mosaic-query-diagnostics-v2-candidate',
    diagnosticPolicy: 'de-writer-v2-representative-query-diagnostics-v2-candidate',
  });

  if (!requestedQueries.length
    && retrievalControl.semanticFingerprint !== ACCEPTED_11D4_DIAGNOSTIC_FINGERPRINT) {
    throw new Error(
      'Frozen 11D4 semantic fingerprint changed: expected '
      + ACCEPTED_11D4_DIAGNOSTIC_FINGERPRINT
      + ', got '
      + retrievalControl.semanticFingerprint,
    );
  }

  const surfaceSafetyCounts = {};
  const phraseTypeCounts = {};
  let totalCandidates = 0;
  let withLeipzigEvidence = 0;
  let withQueryTokenOverlap = 0;
  const queryReports = [];

  for (const query of selectedQueries) {
    const word = typeof query === 'string' ? query : query.word;
    const detail = getWord(writerDb, word);
    if (!detail?.preferredIpa) {
      queryReports.push({
        word,
        status: 'missing_writer_query',
        reason: 'no_preferred_writer_v5_pronunciation',
      });
      continue;
    }

    const retrieval = retrievePhraseMosaicCandidatesV2(
      phraseDb,
      detail.preferredIpa,
      { perChannelLimit, maxCandidates },
    );
    const enriched = enrichPhraseMosaicCandidates(phraseDb, detail.surface || word, retrieval);

    for (const candidate of enriched.candidates) {
      totalCandidates += 1;
      if (candidate.rankingEvidence.leipzig.corpusCount > 0) withLeipzigEvidence += 1;
      if (candidate.rankingEvidence.queryTokenOverlap.overlapCount > 0) {
        withQueryTokenOverlap += 1;
      }
      increment(surfaceSafetyCounts, candidate.rankingEvidence.surfaceSafety.class);
      for (const type of candidate.rankingEvidence.phraseTypes) increment(phraseTypeCounts, type);
    }

    const commonnessSorted = [...enriched.candidates].sort((a, b) =>
      Number(b.rankingEvidence.leipzig.corpusCount)
        - Number(a.rankingEvidence.leipzig.corpusCount)
      || Number(b.rankingEvidence.leipzig.equalWeightCommonness)
        - Number(a.rankingEvidence.leipzig.equalWeightCommonness)
      || Number(b.score?.overall || 0) - Number(a.score?.overall || 0)
      || String(a.windowId).localeCompare(String(b.windowId))
    );
    const safeCandidate = enriched.candidates.find(
      (candidate) => candidate.rankingEvidence.surfaceSafety.class === 'safe',
    ) || null;

    queryReports.push({
      word,
      status: retrieval.query.anchors.length ? 'ok' : 'no_mosaic_query_anchor',
      retrievalCandidateCount: enriched.candidates.length,
      evidenceFingerprint: enriched.evidenceFingerprint,
      rawTop: evidenceSummary(enriched.candidates[0] || null),
      firstSafeInRawOrder: evidenceSummary(safeCandidate),
      strongestCommonnessEvidence: evidenceSummary(commonnessSorted[0] || null),
      markedSurfaceCount: enriched.candidates.filter(
        (candidate) => candidate.rankingEvidence.surfaceSafety.class === 'marked',
      ).length,
      leipzigEvidenceCount: enriched.candidates.filter(
        (candidate) => candidate.rankingEvidence.leipzig.corpusCount > 0,
      ).length,
      queryOverlapCount: enriched.candidates.filter(
        (candidate) => candidate.rankingEvidence.queryTokenOverlap.overlapCount > 0,
      ).length,
    });
  }

  const suiteEvidenceFingerprint = sha256(JSON.stringify(
    queryReports.map((entry) => [entry.word, entry.status, entry.evidenceFingerprint || null]),
  ));

  const report = {
    schema: 'rhymelab-phrase-mosaic-ranking-evidence-diagnostics-v1',
    status: 'ok',
    built_at: new Date().toISOString(),
    evidence_schema: PHRASE_MOSAIC_RANKING_EVIDENCE_SCHEMA,
    evidence_policy: PHRASE_MOSAIC_RANKING_EVIDENCE_POLICY,
    phrase_database: phraseDbPath,
    writer_database: writerDbPath,
    plan: planPath,
    accepted_11d4_anchor_fingerprint: ACCEPTED_11D4_ANCHOR_FINGERPRINT,
    observed_11d4_anchor_fingerprint: phraseMeta.phrase_mosaic_retrieval_v2_fingerprint,
    frozen_11d4_semantic_fingerprint: retrievalControl.semanticFingerprint,
    frozen_11d4_semantic_fingerprint_matches:
      requestedQueries.length ? null
        : retrievalControl.semanticFingerprint === ACCEPTED_11D4_DIAGNOSTIC_FINGERPRINT,
    settings: {
      perChannelLimit,
      maxCandidates,
      requestedQueries: requestedQueries.length ? requestedQueries : null,
    },
    aggregate: {
      queryCount: queryReports.length,
      totalCandidates,
      withLeipzigEvidence,
      withoutLeipzigEvidence: totalCandidates - withLeipzigEvidence,
      withQueryTokenOverlap,
      surfaceSafetyCounts,
      phraseTypeCounts,
    },
    suiteEvidenceFingerprint,
    queries: queryReports,
    phraseUtilityRankingImplemented: false,
    pageDiversificationImplemented: false,
    writerRuntimeRewired: false,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    frozen_11d4_semantic_fingerprint_matches:
      report.frozen_11d4_semantic_fingerprint_matches,
    suite_evidence_fingerprint: report.suiteEvidenceFingerprint,
    aggregate: report.aggregate,
    queries: report.queries.map((entry) => ({
      word: entry.word,
      status: entry.status,
      candidates: entry.retrievalCandidateCount || 0,
      marked: entry.markedSurfaceCount || 0,
      leipzig_evidence: entry.leipzigEvidenceCount || 0,
      raw_top: entry.rawTop,
      first_safe: entry.firstSafeInRawOrder,
      strongest_commonness: entry.strongestCommonnessEvidence,
    })),
    report: reportPath,
  }, null, 2));
} finally {
  phraseDb.close();
  writerDb.close();
}
