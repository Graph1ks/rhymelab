#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getWord } from '../src/local-engine.mjs';
import { retrievePhraseMosaicCandidatesV2 } from './phrase-mosaic-retrieval-v2-core.mjs';
import { enrichPhraseMosaicCandidates } from './phrase-mosaic-ranking-evidence-core.mjs';
import { rankPhraseMosaicCandidatesV2 } from './phrase-mosaic-ranking-candidate-v2-core.mjs';
import {
  analyzePhraseMosaicDiversity,
} from './phrase-mosaic-diversity-diagnostics-core.mjs';
import {
  diversifyPhraseMosaicWriterPage,
  PHRASE_MOSAIC_DIVERSITY_CANDIDATE_POLICY,
  PHRASE_MOSAIC_DIVERSITY_CANDIDATE_SCHEMA,
  PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP,
} from './phrase-mosaic-diversity-candidate-core.mjs';

const ACCEPTED_11D4_ANCHOR_FINGERPRINT =
  '9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059';
const ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT =
  '1d07ad486bdff8b167a7a394dafa687a60178cb43bd5a48da19044715d33d3a0';
const OWNER_11E3_DIAGNOSTIC_BASELINE_FINGERPRINT =
  '61e10fc5ab4a434f4668e5ee14c5b9ba721269ee1b4bd705d79cc5941cb44f96';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let writerDbPath = 'data/local/rhymelab-v5.sqlite';
let planPath = 'benchmarks/de-writer-v2/plan.json';
let reportPath = 'data/local/phrase-mosaic-diversity-v1-candidate-report.json';
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

if (!selectedQueries.length) throw new Error('No diversity candidate queries selected');

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function rounded(value, digits = 6) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function candidateSummary(candidate) {
  if (!candidate) return null;
  return {
    writerPageRank: candidate.writerPageRank ?? null,
    diversifiedPageRank: candidate.diversifiedPageRank ?? null,
    windowId: candidate.windowId ?? null,
    phraseId: candidate.phraseId ?? null,
    canonical: candidate.canonical ?? null,
    phoneticType: candidate.score?.type || null,
    phoneticScore: rounded(candidate.score?.overall || 0),
    surfaceSafety: candidate.rankingEvidence?.surfaceSafety || null,
    suppressed: Boolean(candidate.diversitySuppression?.suppressed),
    suppressionReason: candidate.diversitySuppression?.reason || null,
    suppressionKey: candidate.diversitySuppression?.key || null,
  };
}

function findByCanonical(result, canonical) {
  const row = result?.candidates?.find((candidate) => candidate.canonical === canonical) || null;
  return candidateSummary(row);
}

function findByWindow(result, windowId) {
  const row = result?.candidates?.find((candidate) => candidate.windowId === windowId) || null;
  return candidateSummary(row);
}

function top20Change(before, after) {
  const beforeIds = before.slice(0, 20).map((candidate) => candidate.windowId);
  const afterIds = after.slice(0, 20).map((candidate) => candidate.windowId);
  const afterSet = new Set(afterIds);
  const beforeSet = new Set(beforeIds);

  return {
    changed: JSON.stringify(beforeIds) !== JSON.stringify(afterIds),
    suppressedFromOriginalTop20: before
      .slice(0, 20)
      .filter((candidate) => !afterSet.has(candidate.windowId))
      .map(candidateSummary),
    promotedFromBelowOriginalTop20: after
      .slice(0, 20)
      .filter((candidate) => !beforeSet.has(candidate.windowId))
      .map(candidateSummary),
  };
}

function diversifiedDiagnosticInput(diversity) {
  return {
    schema: diversity.schema,
    policy: diversity.policy,
    rankingFingerprint: diversity.diversityFingerprint,
    writerPageCandidates: diversity.diversifiedWriterPageCandidates.map((candidate) => ({
      ...candidate,
      writerPageRank: candidate.diversifiedPageRank,
    })),
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

  const queryReports = [];
  const v2SuiteRows = [];
  const diagnosticSuiteRows = [];
  const diversitySuiteRows = [];

  for (const query of selectedQueries) {
    const word = typeof query === 'string' ? query : query.word;
    const detail = getWord(writerDb, word);

    if (!detail?.preferredIpa) {
      const status = 'missing_writer_query';
      queryReports.push({
        word,
        status,
        v2RankingFingerprint: null,
        diagnosticFingerprint: null,
        diversityFingerprint: null,
      });
      v2SuiteRows.push([word, status, null]);
      diagnosticSuiteRows.push([word, status, null, null]);
      diversitySuiteRows.push([word, status, null]);
      continue;
    }

    const retrieval = retrievePhraseMosaicCandidatesV2(
      phraseDb,
      detail.preferredIpa,
      { perChannelLimit, maxCandidates },
    );
    const enriched = enrichPhraseMosaicCandidates(
      phraseDb,
      detail.surface || word,
      retrieval,
    );
    const v2 = rankPhraseMosaicCandidatesV2(enriched);
    const baselineDiagnostic = analyzePhraseMosaicDiversity(v2);
    const diversity = diversifyPhraseMosaicWriterPage(v2);
    const afterDiagnostic = analyzePhraseMosaicDiversity(
      diversifiedDiagnosticInput(diversity),
    );
    const status = retrieval.query.anchors.length ? 'ok' : 'no_mosaic_query_anchor';

    v2SuiteRows.push([word, status, v2.rankingFingerprint]);
    diagnosticSuiteRows.push([
      word,
      status,
      v2.rankingFingerprint,
      baselineDiagnostic.diagnosticFingerprint,
    ]);
    diversitySuiteRows.push([word, status, diversity.diversityFingerprint]);

    const writerTop = v2.writerPageCandidates[0] || null;
    const musikMarked = word === 'Musik'
      ? v2.candidates.find((candidate) => candidate.canonical === 'K.-o.-Siegen') || null
      : null;
    const change = top20Change(
      v2.writerPageCandidates,
      diversity.diversifiedWriterPageCandidates,
    );

    queryReports.push({
      word,
      phenomena: Array.isArray(query?.phenomena) ? query.phenomena : [],
      status,
      v2RankingFingerprint: v2.rankingFingerprint,
      diagnosticFingerprint: baselineDiagnostic.diagnosticFingerprint,
      diversityFingerprint: diversity.diversityFingerprint,
      writerPageCandidateCount: v2.writerPageCandidateCount,
      diversifiedWriterPageCandidateCount:
        diversity.diversifiedWriterPageCandidateCount,
      suppressedCandidateCount: diversity.suppressedCandidateCount,
      suppressionReasonCounts: diversity.suppressionReasonCounts,
      top20: {
        ...change,
        beforeFrameMaxGroupSize:
          baselineDiagnostic.top['20']?.lexicalFrame?.maxGroupSize || 0,
        afterFrameMaxGroupSize:
          afterDiagnostic.top['20']?.lexicalFrame?.maxGroupSize || 0,
        before: v2.writerPageCandidates
          .slice(0, Math.max(1, Number(topCandidates) || 20))
          .map(candidateSummary),
        after: diversity.diversifiedWriterPageCandidates
          .slice(0, Math.max(1, Number(topCandidates) || 20))
          .map(candidateSummary),
      },
      protected: {
        liebePerfect: word === 'Liebe'
          ? findByCanonical(diversity, 'dastehen wie bestellt und nicht abgeholt')
          : null,
        freiheitDabeiSeid: word === 'Freiheit'
          ? findByCanonical(diversity, 'dabei seid')
          : null,
        gedankenWriterTop: word === 'Gedanken' && writerTop
          ? findByWindow(diversity, writerTop.windowId)
          : null,
        arbeitsweiseWriterTop: word === 'Arbeitsweise' && writerTop
          ? findByWindow(diversity, writerTop.windowId)
          : null,
        hitzefreiWriterTop: String(word).toLocaleLowerCase('de-DE') === 'hitzefrei' && writerTop
          ? findByWindow(diversity, writerTop.windowId)
          : null,
        musikMarkedSurface: musikMarked ? {
          canonical: musikMarked.canonical,
          writerPageRank: musikMarked.writerPageRank,
          diversifiedPageRank:
            diversity.diversifiedRankByWindow[String(musikMarked.windowId || '')] || null,
          surfaceSafety: musikMarked.rankingEvidence?.surfaceSafety || null,
          remainsOutsideTop20:
            !diversity.diversifiedRankByWindow[String(musikMarked.windowId || '')]
            || diversity.diversifiedRankByWindow[String(musikMarked.windowId || '')] > 20,
        } : null,
        lebenEmptyWriterPage: word === 'Leben'
          ? diversity.diversifiedWriterPageCandidateCount === 0
          : null,
      },
    });
  }

  const suiteV2RankingFingerprint = sha256(JSON.stringify(v2SuiteRows));
  const suiteDiagnosticFingerprint = sha256(JSON.stringify(diagnosticSuiteRows));
  const suiteDiversityFingerprint = sha256(JSON.stringify(diversitySuiteRows));

  if (!requestedQueries.length
    && suiteV2RankingFingerprint !== ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT) {
    throw new Error(
      '11E2-v2 ranking fingerprint changed: expected '
      + ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT
      + ', got '
      + suiteV2RankingFingerprint,
    );
  }

  if (!requestedQueries.length
    && suiteDiagnosticFingerprint !== OWNER_11E3_DIAGNOSTIC_BASELINE_FINGERPRINT) {
    throw new Error(
      '11E3 diagnostic baseline fingerprint changed: expected '
      + OWNER_11E3_DIAGNOSTIC_BASELINE_FINGERPRINT
      + ', got '
      + suiteDiagnosticFingerprint,
    );
  }

  const aggregateReasonCounts = {};
  let totalWriterCandidates = 0;
  let totalDiversifiedCandidates = 0;
  let totalSuppressed = 0;
  let queriesWithChangedTop20 = 0;
  let top20Suppressed = 0;
  let top20Promoted = 0;

  for (const entry of queryReports) {
    totalWriterCandidates += Number(entry.writerPageCandidateCount || 0);
    totalDiversifiedCandidates += Number(entry.diversifiedWriterPageCandidateCount || 0);
    totalSuppressed += Number(entry.suppressedCandidateCount || 0);
    if (entry.top20?.changed) queriesWithChangedTop20 += 1;
    top20Suppressed += Number(entry.top20?.suppressedFromOriginalTop20?.length || 0);
    top20Promoted += Number(entry.top20?.promotedFromBelowOriginalTop20?.length || 0);
    for (const [reason, count] of Object.entries(entry.suppressionReasonCounts || {})) {
      aggregateReasonCounts[reason] =
        Number(aggregateReasonCounts[reason] || 0) + Number(count || 0);
    }
  }

  const protectedChecks = {
    liebePerfectRank1: queryReports.find((entry) => entry.word === 'Liebe')
      ?.protected?.liebePerfect?.diversifiedPageRank === 1,
    freiheitDabeiSeidRank1: queryReports.find((entry) => entry.word === 'Freiheit')
      ?.protected?.freiheitDabeiSeid?.diversifiedPageRank === 1,
    gedankenWriterTopRank1: queryReports.find((entry) => entry.word === 'Gedanken')
      ?.protected?.gedankenWriterTop?.diversifiedPageRank === 1,
    arbeitsweiseWriterTopRank1: queryReports.find((entry) => entry.word === 'Arbeitsweise')
      ?.protected?.arbeitsweiseWriterTop?.diversifiedPageRank === 1,
    hitzefreiWriterTopRank1: queryReports.find(
      (entry) => String(entry.word).toLocaleLowerCase('de-DE') === 'hitzefrei',
    )?.protected?.hitzefreiWriterTop?.diversifiedPageRank === 1,
    musikMarkedStillOutsideTop20: queryReports.find((entry) => entry.word === 'Musik')
      ?.protected?.musikMarkedSurface?.remainsOutsideTop20 === true,
    lebenStillEmpty: queryReports.find((entry) => entry.word === 'Leben')
      ?.protected?.lebenEmptyWriterPage === true,
  };

  const report = {
    schema: 'rhymelab-phrase-mosaic-diversity-v1-candidate-report',
    status: 'ok',
    built_at: new Date().toISOString(),
    candidate_schema: PHRASE_MOSAIC_DIVERSITY_CANDIDATE_SCHEMA,
    candidate_policy: PHRASE_MOSAIC_DIVERSITY_CANDIDATE_POLICY,
    lexical_frame_cap: PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP,
    lexical_head_cap: null,
    phrase_db: phraseDbPath,
    writer_db: writerDbPath,
    plan: planPath,
    accepted_11d4_anchor_fingerprint: ACCEPTED_11D4_ANCHOR_FINGERPRINT,
    accepted_11e2_v2_suite_ranking_fingerprint:
      ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT,
    owner_11e3_diagnostic_baseline_fingerprint:
      OWNER_11E3_DIAGNOSTIC_BASELINE_FINGERPRINT,
    suite_v2_ranking_fingerprint: suiteV2RankingFingerprint,
    suite_v2_ranking_fingerprint_matches:
      requestedQueries.length
        ? null
        : suiteV2RankingFingerprint === ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT,
    suite_diagnostic_baseline_fingerprint: suiteDiagnosticFingerprint,
    suite_diagnostic_baseline_fingerprint_matches:
      requestedQueries.length
        ? null
        : suiteDiagnosticFingerprint === OWNER_11E3_DIAGNOSTIC_BASELINE_FINGERPRINT,
    suite_diversity_candidate_fingerprint: suiteDiversityFingerprint,
    query_count: queryReports.length,
    aggregate: {
      writer_page_candidates: totalWriterCandidates,
      diversified_writer_page_candidates: totalDiversifiedCandidates,
      suppressed_candidates: totalSuppressed,
      suppression_reason_counts: aggregateReasonCounts,
      queries_with_changed_top20: queriesWithChangedTop20,
      original_top20_suppressed: top20Suppressed,
      promoted_into_top20: top20Promoted,
      protected_checks: protectedChecks,
      all_protected_checks_pass:
        Object.values(protectedChecks).every((value) => value === true),
    },
    queries: queryReports,
    decision_gate: {
      candidate_only: true,
      runtime_integration_allowed: false,
      acceptance_requires_owner_ab: true,
      acceptance_requires_repeatability: true,
      next_step:
        'review_owner_ab_then_run_repeatability_before_accepting_11e3',
    },
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    report: reportPath,
    suite_v2_ranking_fingerprint: suiteV2RankingFingerprint,
    suite_diagnostic_baseline_fingerprint: suiteDiagnosticFingerprint,
    suite_diversity_candidate_fingerprint: suiteDiversityFingerprint,
    aggregate: report.aggregate,
    lexical_frame_cap: PHRASE_MOSAIC_DIVERSITY_LEXICAL_FRAME_CAP,
    lexical_head_cap: null,
  }, null, 2));
} finally {
  phraseDb.close();
  writerDb.close();
}
