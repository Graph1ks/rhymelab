#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getWord } from '../src/local-engine.mjs';
import { retrievePhraseMosaicCandidatesV2 } from './phrase-mosaic-retrieval-v2-core.mjs';
import {
  enrichPhraseMosaicCandidates,
  PHRASE_MOSAIC_RANKING_EVIDENCE_POLICY,
  PHRASE_MOSAIC_RANKING_EVIDENCE_SCHEMA,
} from './phrase-mosaic-ranking-evidence-core.mjs';
import {
  rankPhraseMosaicCandidates,
} from './phrase-mosaic-ranking-candidate-core.mjs';
import {
  rankPhraseMosaicCandidatesV2,
  PHRASE_MOSAIC_RANKING_V2_POLICY,
  PHRASE_MOSAIC_RANKING_V2_SCHEMA,
  PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND,
} from './phrase-mosaic-ranking-candidate-v2-core.mjs';

const ACCEPTED_11D4_ANCHOR_FINGERPRINT =
  '9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059';
const ACCEPTED_11E1_SUITE_EVIDENCE_FINGERPRINT =
  '04ecde26f0a59b7615d6b2a192e7cffed26aefe86ebac07e388e546210d58845';
const ACCEPTED_11E2_V1_RANKING_FINGERPRINT =
  '593142fc70cc1e7b760d6bca3d94ea233c0bcaaf295f6f47f7659ccc7e805de4';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let writerDbPath = 'data/local/rhymelab-v5.sqlite';
let planPath = 'benchmarks/de-writer-v2/plan.json';
let reportPath = 'data/local/phrase-mosaic-ranking-v2-candidate-report.json';
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

if (!selectedQueries.length) throw new Error('No ranking diagnostic queries selected');

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function rounded(value, digits = 6) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function summary(candidate) {
  if (!candidate) return null;
  return {
    candidateRank: candidate.candidateRank ?? null,
    writerPageRank: candidate.writerPageRank ?? null,
    rawRank: candidate.rawRank ?? null,
    canonical: candidate.canonical,
    phraseId: candidate.phraseId,
    windowId: candidate.windowId,
    phoneticType: candidate.score?.type || null,
    phoneticScore: rounded(candidate.score?.overall),
    surfaceSafety: candidate.rankingEvidence?.surfaceSafety || null,
    leipzigCorpusCount: candidate.rankingEvidence?.leipzig?.corpusCount || 0,
    leipzigCommonness: candidate.rankingEvidence?.leipzig?.equalWeightCommonness || 0,
    phraseTypes: candidate.rankingEvidence?.phraseTypes || [],
    writerPageEligibility: candidate.writerPageEligibility || null,
    relationTier: candidate.relationTier ?? null,
    safetyTier: candidate.safetyTier ?? null,
    groupBestPhoneticScore: candidate.groupBestPhoneticScore ?? null,
    phoneticDeltaFromGroupBest: candidate.phoneticDeltaFromGroupBest ?? null,
    phoneticBand: candidate.phoneticBand ?? null,
    controlUtility: candidate.controlUtility || null,
  };
}

function findCanonical(candidates, canonical) {
  const hit = candidates.find((candidate) => candidate.canonical === canonical);
  return hit ? summary(hit) : null;
}

function countTop(candidates, predicate, limit = 20) {
  return candidates.slice(0, limit).filter(predicate).length;
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
  const evidenceSuiteRows = [];
  const v1SuiteRows = [];

  let totalDiagnosticCandidates = 0;
  let totalWriterPageCandidates = 0;
  let totalDiagnosticOnlyCandidates = 0;
  let weakExcluded = 0;
  let restrictedExcluded = 0;
  let rawVsV2TopChanged = 0;
  let v1VsV2TopChanged = 0;
  let rawTop20WithLeipzig = 0;
  let v1Top20WithLeipzig = 0;
  let v2Top20WithLeipzig = 0;
  let rawTop20Marked = 0;
  let v1Top20Marked = 0;
  let v2Top20Marked = 0;
  let guardViolationCount = 0;

  for (const query of selectedQueries) {
    const word = typeof query === 'string' ? query : query.word;
    const detail = getWord(writerDb, word);

    if (!detail?.preferredIpa) {
      queryReports.push({
        word,
        status: 'missing_writer_query',
        evidenceFingerprint: null,
        v1RankingFingerprint: null,
        v2RankingFingerprint: null,
      });
      evidenceSuiteRows.push([word, 'missing_writer_query', null]);
      v1SuiteRows.push([word, 'missing_writer_query', null]);
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
    const v1 = rankPhraseMosaicCandidates(enriched);
    const v2 = rankPhraseMosaicCandidatesV2(enriched);

    const status = retrieval.query.anchors.length ? 'ok' : 'no_mosaic_query_anchor';
    evidenceSuiteRows.push([word, status, enriched.evidenceFingerprint]);
    v1SuiteRows.push([word, status, v1.rankingFingerprint]);

    const rawTop = enriched.candidates[0] || null;
    const v1Top = v1.candidates[0] || null;
    const v2Top = v2.writerPageCandidates[0] || null;

    const rawVsV2Changed = Boolean(
      rawTop && v2Top && rawTop.windowId !== v2Top.windowId,
    );
    const v1VsV2Changed = Boolean(
      v1Top && v2Top && v1Top.windowId !== v2Top.windowId,
    );
    if (rawVsV2Changed) rawVsV2TopChanged += 1;
    if (v1VsV2Changed) v1VsV2TopChanged += 1;

    totalDiagnosticCandidates += v2.candidateCount;
    totalWriterPageCandidates += v2.writerPageCandidateCount;
    totalDiagnosticOnlyCandidates += v2.diagnosticOnlyCandidateCount;
    weakExcluded += Number(v2.excludedReasonCounts?.weak_primary_type || 0);
    restrictedExcluded += Number(v2.excludedReasonCounts?.restricted_surface || 0);

    rawTop20WithLeipzig += countTop(
      enriched.candidates,
      (candidate) => Number(candidate.rankingEvidence?.leipzig?.corpusCount || 0) > 0,
      20,
    );
    v1Top20WithLeipzig += countTop(
      v1.candidates,
      (candidate) => Number(candidate.rankingEvidence?.leipzig?.corpusCount || 0) > 0,
      20,
    );
    v2Top20WithLeipzig += countTop(
      v2.writerPageCandidates,
      (candidate) => Number(candidate.rankingEvidence?.leipzig?.corpusCount || 0) > 0,
      20,
    );

    rawTop20Marked += countTop(
      enriched.candidates,
      (candidate) => candidate.rankingEvidence?.surfaceSafety?.class === 'marked',
      20,
    );
    v1Top20Marked += countTop(
      v1.candidates,
      (candidate) => candidate.rankingEvidence?.surfaceSafety?.class === 'marked',
      20,
    );
    v2Top20Marked += countTop(
      v2.writerPageCandidates,
      (candidate) => candidate.rankingEvidence?.surfaceSafety?.class === 'marked',
      20,
    );

    let topPhoneticDrop = null;
    let guardExemptReason = null;
    if (rawTop && v2Top) {
      topPhoneticDrop = rounded(
        Math.max(0, Number(rawTop.score?.overall || 0) - Number(v2Top.score?.overall || 0)),
      );
      const rawSafety = rawTop.rankingEvidence?.surfaceSafety?.class || 'safe';
      const rawType = rawTop.score?.type || null;
      if (rawType === 'weak') guardExemptReason = 'raw_top_weak_not_page_eligible';
      else if (rawSafety === 'restricted') guardExemptReason = 'raw_top_restricted_not_page_eligible';
      else if (rawSafety === 'marked') guardExemptReason = 'raw_top_marked_surface_demotion';
      else if (rawType !== v2Top.score?.type) guardExemptReason = 'relation_type_guard_changed_surface_class';
      else if (topPhoneticDrop > PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND) {
        guardViolationCount += 1;
      }
    }

    queryReports.push({
      word,
      status,
      diagnosticCandidateCount: v2.candidateCount,
      writerPageCandidateCount: v2.writerPageCandidateCount,
      diagnosticOnlyCandidateCount: v2.diagnosticOnlyCandidateCount,
      excludedReasonCounts: v2.excludedReasonCounts,
      evidenceFingerprint: enriched.evidenceFingerprint,
      v1RankingFingerprint: v1.rankingFingerprint,
      v2RankingFingerprint: v2.rankingFingerprint,
      rawVsV2TopChanged: rawVsV2Changed,
      v1VsV2TopChanged: v1VsV2Changed,
      topPhoneticDrop,
      guardExemptReason,
      rawTop: summary(rawTop),
      v1Top: summary(v1Top),
      v2WriterTop: summary(v2Top),
      protected: {
        liebePerfect: word === 'Liebe'
          ? findCanonical(v2.candidates, 'dastehen wie bestellt und nicht abgeholt')
          : null,
        freiheitDabeiSeid: word === 'Freiheit'
          ? findCanonical(v2.candidates, 'dabei seid')
          : null,
        musikAbbreviation: word === 'Musik'
          ? findCanonical(v2.candidates, 'K.-o.-Siegen')
          : null,
        lebenWeakOnly: word === 'Leben'
          ? findCanonical(v2.candidates, 'Heiliger Abende')
          : null,
        arbeitsweiseRawTop: word === 'Arbeitsweise' && rawTop
          ? findCanonical(v2.candidates, rawTop.canonical)
          : null,
        hitzefreiRawTop: word === 'hitzefrei' && rawTop
          ? findCanonical(v2.candidates, rawTop.canonical)
          : null,
      },
      topWriterPageCandidates: v2.writerPageCandidates
        .slice(0, Math.max(1, Number(topCandidates) || 20))
        .map(summary),
    });
  }

  const suiteEvidenceFingerprint = sha256(JSON.stringify(evidenceSuiteRows));
  if (!requestedQueries.length
    && suiteEvidenceFingerprint !== ACCEPTED_11E1_SUITE_EVIDENCE_FINGERPRINT) {
    throw new Error(
      '11E1 evidence fingerprint changed: expected '
      + ACCEPTED_11E1_SUITE_EVIDENCE_FINGERPRINT
      + ', got '
      + suiteEvidenceFingerprint,
    );
  }

  const suiteV1RankingFingerprint = sha256(JSON.stringify(v1SuiteRows));
  if (!requestedQueries.length
    && suiteV1RankingFingerprint !== ACCEPTED_11E2_V1_RANKING_FINGERPRINT) {
    throw new Error(
      '11E2-v1 control fingerprint changed: expected '
      + ACCEPTED_11E2_V1_RANKING_FINGERPRINT
      + ', got '
      + suiteV1RankingFingerprint,
    );
  }

  const suiteV2RankingFingerprint = sha256(JSON.stringify(
    queryReports.map((entry) => [
      entry.word,
      entry.status,
      entry.v2RankingFingerprint,
    ]),
  ));

  const report = {
    schema: 'rhymelab-phrase-mosaic-ranking-v2-candidate-diagnostics',
    status: 'ok',
    built_at: new Date().toISOString(),
    candidate_schema: PHRASE_MOSAIC_RANKING_V2_SCHEMA,
    candidate_policy: PHRASE_MOSAIC_RANKING_V2_POLICY,
    phonetic_near_tie_band: PHRASE_MOSAIC_RANKING_V2_PHONETIC_BAND,
    evidence_schema: PHRASE_MOSAIC_RANKING_EVIDENCE_SCHEMA,
    evidence_policy: PHRASE_MOSAIC_RANKING_EVIDENCE_POLICY,
    phrase_database: phraseDbPath,
    writer_database: writerDbPath,
    plan: planPath,
    accepted_11d4_anchor_fingerprint: ACCEPTED_11D4_ANCHOR_FINGERPRINT,
    observed_11d4_anchor_fingerprint: phraseMeta.phrase_mosaic_retrieval_v2_fingerprint,
    accepted_11e1_suite_evidence_fingerprint:
      requestedQueries.length ? null : ACCEPTED_11E1_SUITE_EVIDENCE_FINGERPRINT,
    suite_evidence_fingerprint: suiteEvidenceFingerprint,
    suite_evidence_fingerprint_matches:
      requestedQueries.length ? null
        : suiteEvidenceFingerprint === ACCEPTED_11E1_SUITE_EVIDENCE_FINGERPRINT,
    accepted_11e2_v1_ranking_fingerprint:
      requestedQueries.length ? null : ACCEPTED_11E2_V1_RANKING_FINGERPRINT,
    suite_v1_ranking_fingerprint: suiteV1RankingFingerprint,
    suite_v1_ranking_fingerprint_matches:
      requestedQueries.length ? null
        : suiteV1RankingFingerprint === ACCEPTED_11E2_V1_RANKING_FINGERPRINT,
    suite_v2_ranking_fingerprint: suiteV2RankingFingerprint,
    settings: {
      perChannelLimit,
      maxCandidates,
      topCandidates,
      requestedQueries: requestedQueries.length ? requestedQueries : null,
    },
    aggregate: {
      queryCount: queryReports.length,
      totalDiagnosticCandidates,
      totalWriterPageCandidates,
      totalDiagnosticOnlyCandidates,
      weakExcluded,
      restrictedExcluded,
      rawVsV2TopChanged,
      v1VsV2TopChanged,
      guardViolationCount,
      rawTop20WithLeipzig,
      v1Top20WithLeipzig,
      v2Top20WithLeipzig,
      rawTop20Marked,
      v1Top20Marked,
      v2Top20Marked,
    },
    queries: queryReports,
    pageDiversificationImplemented: false,
    writerRuntimeRewired: false,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    evidence_fingerprint_matches: report.suite_evidence_fingerprint_matches,
    v1_control_fingerprint_matches: report.suite_v1_ranking_fingerprint_matches,
    suite_v2_ranking_fingerprint: report.suite_v2_ranking_fingerprint,
    aggregate: report.aggregate,
    queries: report.queries.map((entry) => ({
      word: entry.word,
      status: entry.status,
      writer_page_candidates: entry.writerPageCandidateCount,
      top_phonetic_drop: entry.topPhoneticDrop,
      guard_exempt_reason: entry.guardExemptReason,
      raw_top: entry.rawTop,
      v1_top: entry.v1Top,
      v2_writer_top: entry.v2WriterTop,
      protected: entry.protected,
    })),
    report: reportPath,
  }, null, 2));
} finally {
  phraseDb.close();
  writerDb.close();
}
