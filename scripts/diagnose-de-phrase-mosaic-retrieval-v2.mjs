#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  PHRASE_MOSAIC_QUERY_DIAGNOSTICS_POLICY,
  PHRASE_MOSAIC_QUERY_DIAGNOSTICS_SCHEMA,
  runPhraseMosaicQueryDiagnostics,
} from './phrase-mosaic-query-diagnostics-core.mjs';
import {
  PHRASE_MOSAIC_RETRIEVAL_V2_POLICY,
  PHRASE_MOSAIC_RETRIEVAL_V2_SCHEMA,
  retrievePhraseMosaicCandidatesV2,
} from './phrase-mosaic-retrieval-v2-core.mjs';

const ACCEPTED_11D2_ANCHOR_FINGERPRINT =
  '55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae';
const ACCEPTED_11D1_WINDOW_FINGERPRINT =
  '24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac';
const ACCEPTED_11D3_BASELINE_SEMANTIC_FINGERPRINT =
  '294a26d670e0202a0b5171d51c16d6059eff3f03620dd5b57369a04b4a87625c';

const CANDIDATE_DIAGNOSTIC_SCHEMA =
  'rhymelab-phrase-mosaic-query-diagnostics-v2-candidate';
const CANDIDATE_DIAGNOSTIC_POLICY =
  'de-writer-v2-representative-query-diagnostics-v2-candidate';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let writerDbPath = 'data/local/rhymelab-v5.sqlite';
let planPath = 'benchmarks/de-writer-v2/plan.json';
let reportPath = 'data/local/phrase-mosaic-query-diagnostics-v2-candidate-report.json';
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

function countPrimary(report, type) {
  return Number(report.aggregatePrimaryTypes?.[type] || 0);
}

function weakShare(report) {
  const total = Number(report.totalReturnedCandidates || 0);
  return total ? Number(((countPrimary(report, 'weak') / total) * 100).toFixed(2)) : 0;
}

function channelAssignments(report) {
  return Object.values(report.aggregateRetrievalChannels || {})
    .reduce((sum, value) => sum + Number(value || 0), 0);
}

function channelShare(report, channel) {
  const total = channelAssignments(report);
  return total
    ? Number(((Number(report.aggregateRetrievalChannels?.[channel] || 0) / total) * 100).toFixed(2))
    : 0;
}

function noAnchorWords(report) {
  return (report.queries || [])
    .filter((entry) => entry.status === 'no_mosaic_query_anchor')
    .map((entry) => entry.word);
}

function fullSurfaceWords(report) {
  return (report.queries || [])
    .filter((entry) =>
      (entry.query?.mosaicAnchors || []).some((anchor) => anchor.kind === 'full_surface')
    )
    .map((entry) => entry.word);
}

function queryComparison(baseline, candidate) {
  const baseByWord = new Map((baseline.queries || []).map((entry) => [entry.word, entry]));
  return (candidate.queries || []).map((entry) => {
    const base = baseByWord.get(entry.word);
    return {
      word: entry.word,
      baselineStatus: base?.status || null,
      candidateStatus: entry.status,
      baselineReturned: Number(base?.candidateSummary?.returnedCandidates || 0),
      candidateReturned: Number(entry.candidateSummary?.returnedCandidates || 0),
      returnedDelta:
        Number(entry.candidateSummary?.returnedCandidates || 0)
        - Number(base?.candidateSummary?.returnedCandidates || 0),
      baselineWeak: Number(base?.candidateSummary?.primaryTypes?.weak || 0),
      candidateWeak: Number(entry.candidateSummary?.primaryTypes?.weak || 0),
      weakUnrelatedFiltered: Number(entry.retrieval?.weakUnrelatedFiltered || 0),
      candidateAnchorKinds: entry.candidateSummary?.queryAnchorKinds || {},
      topCandidate: entry.topCandidates?.[0] || null,
    };
  });
}

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
  if (!phraseMeta.phrase_mosaic_retrieval_v2_fingerprint) {
    throw new Error(
      'Missing 11D4 candidate materialization; run npm run phrase:mosaic:retrieval:v2 first',
    );
  }
  if (writerMeta.schema !== 'rhymelab-local-db-v5') {
    throw new Error('Expected Writer-v5 query inventory, got ' + String(writerMeta.schema || 'missing'));
  }

  const common = {
    phraseDb,
    writerDb,
    queries: selectedQueries,
    perChannelLimit,
    maxCandidates,
    topCandidates,
  };

  const baseline = runPhraseMosaicQueryDiagnostics(common);
  if (!requestedQueries.length
    && baseline.semanticFingerprint !== ACCEPTED_11D3_BASELINE_SEMANTIC_FINGERPRINT) {
    throw new Error(
      '11D3 baseline semantic fingerprint changed: expected '
      + ACCEPTED_11D3_BASELINE_SEMANTIC_FINGERPRINT
      + ', got '
      + baseline.semanticFingerprint,
    );
  }

  const candidate = runPhraseMosaicQueryDiagnostics({
    ...common,
    retrieveCandidates: retrievePhraseMosaicCandidatesV2,
    diagnosticSchema: CANDIDATE_DIAGNOSTIC_SCHEMA,
    diagnosticPolicy: CANDIDATE_DIAGNOSTIC_POLICY,
  });

  const comparison = {
    baselineSemanticFingerprint: baseline.semanticFingerprint,
    acceptedBaselineSemanticFingerprint:
      requestedQueries.length ? null : ACCEPTED_11D3_BASELINE_SEMANTIC_FINGERPRINT,
    baselineFingerprintMatchesAccepted:
      requestedQueries.length ? null
        : baseline.semanticFingerprint === ACCEPTED_11D3_BASELINE_SEMANTIC_FINGERPRINT,
    candidateSemanticFingerprint: candidate.semanticFingerprint,
    baselineQueriesWithAnchors:
      baseline.queryCount - Number(baseline.statusCounts?.no_mosaic_query_anchor || 0),
    candidateQueriesWithAnchors:
      candidate.queryCount - Number(candidate.statusCounts?.no_mosaic_query_anchor || 0),
    baselineNoAnchorWords: noAnchorWords(baseline),
    candidateNoAnchorWords: noAnchorWords(candidate),
    candidateFullSurfaceWords: fullSurfaceWords(candidate),
    baselineReturnedCandidates: baseline.totalReturnedCandidates,
    candidateReturnedCandidates: candidate.totalReturnedCandidates,
    returnedCandidateDelta:
      Number(candidate.totalReturnedCandidates || 0) - Number(baseline.totalReturnedCandidates || 0),
    baselineWeakCandidates: countPrimary(baseline, 'weak'),
    candidateWeakCandidates: countPrimary(candidate, 'weak'),
    baselineWeakSharePct: weakShare(baseline),
    candidateWeakSharePct: weakShare(candidate),
    weakUnrelatedFiltered: candidate.totalWeakUnrelatedFiltered,
    baselineFinalFallbackAssignments:
      Number(baseline.aggregateRetrievalChannels?.final_nucleus_coda_class || 0),
    candidateFinalFallbackAssignments:
      Number(candidate.aggregateRetrievalChannels?.final_nucleus_coda_class || 0),
    baselineFinalFallbackAssignmentSharePct:
      channelShare(baseline, 'final_nucleus_coda_class'),
    candidateFinalFallbackAssignmentSharePct:
      channelShare(candidate, 'final_nucleus_coda_class'),
    candidateVowelFamilyAssignments:
      Number(candidate.aggregateRetrievalChannels?.vowel_family_coda_class || 0),
    baselineMeanElapsedMs: baseline.meanElapsedMs,
    candidateMeanElapsedMs: candidate.meanElapsedMs,
    queryComparison: queryComparison(baseline, candidate),
  };

  const report = {
    schema: 'rhymelab-phrase-mosaic-11d4-candidate-comparison-v1',
    status: 'ok',
    built_at: new Date().toISOString(),
    candidate_schema: PHRASE_MOSAIC_RETRIEVAL_V2_SCHEMA,
    candidate_policy: PHRASE_MOSAIC_RETRIEVAL_V2_POLICY,
    phrase_database: phraseDbPath,
    writer_database: writerDbPath,
    plan: planPath,
    plan_schema: plan.schema || null,
    plan_version: plan.version || null,
    accepted_source_v1_fingerprint: phraseMeta.phrase_mosaic_retrieval_fingerprint,
    candidate_anchor_fingerprint: phraseMeta.phrase_mosaic_retrieval_v2_fingerprint,
    source_window_fingerprint: phraseMeta.phrase_mosaic_window_fingerprint,
    writer_schema: writerMeta.schema,
    settings: {
      perChannelLimit,
      maxCandidates,
      topCandidates,
      requestedQueries: requestedQueries.length ? requestedQueries : null,
    },
    baseline,
    candidate,
    comparison,
    phraseRankingImplemented: false,
    writerRuntimeRewired: false,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    candidate_anchor_fingerprint: report.candidate_anchor_fingerprint,
    comparison: {
      baseline_fingerprint_matches: comparison.baselineFingerprintMatchesAccepted,
      baseline_queries_with_anchors: comparison.baselineQueriesWithAnchors,
      candidate_queries_with_anchors: comparison.candidateQueriesWithAnchors,
      baseline_no_anchor_words: comparison.baselineNoAnchorWords,
      candidate_no_anchor_words: comparison.candidateNoAnchorWords,
      candidate_full_surface_words: comparison.candidateFullSurfaceWords,
      baseline_returned_candidates: comparison.baselineReturnedCandidates,
      candidate_returned_candidates: comparison.candidateReturnedCandidates,
      baseline_weak_share_pct: comparison.baselineWeakSharePct,
      candidate_weak_share_pct: comparison.candidateWeakSharePct,
      weak_unrelated_filtered: comparison.weakUnrelatedFiltered,
      baseline_final_fallback_share_pct:
        comparison.baselineFinalFallbackAssignmentSharePct,
      candidate_final_fallback_share_pct:
        comparison.candidateFinalFallbackAssignmentSharePct,
      candidate_vowel_family_assignments:
        comparison.candidateVowelFamilyAssignments,
      baseline_mean_elapsed_ms: comparison.baselineMeanElapsedMs,
      candidate_mean_elapsed_ms: comparison.candidateMeanElapsedMs,
    },
    queries: comparison.queryComparison.map((entry) => ({
      word: entry.word,
      baseline_status: entry.baselineStatus,
      candidate_status: entry.candidateStatus,
      baseline_returned: entry.baselineReturned,
      candidate_returned: entry.candidateReturned,
      weak_unrelated_filtered: entry.weakUnrelatedFiltered,
      anchor_kinds: entry.candidateAnchorKinds,
      top: entry.topCandidate ? {
        canonical: entry.topCandidate.canonical,
        candidate_phonemes: entry.topCandidate.candidatePhonemes || null,
        type: entry.topCandidate.score.type,
        score: entry.topCandidate.score.overall,
        relations: entry.topCandidate.score.relationTypes,
        channels: entry.topCandidate.retrievalChannels,
        query_anchor: entry.topCandidate.queryAnchor,
      } : null,
    })),
    report: reportPath,
  }, null, 2));
} finally {
  phraseDb.close();
  writerDb.close();
}
