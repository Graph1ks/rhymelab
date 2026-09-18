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
  PHRASE_MOSAIC_RANKING_CANDIDATE_POLICY,
  PHRASE_MOSAIC_RANKING_CANDIDATE_SCHEMA,
} from './phrase-mosaic-ranking-candidate-core.mjs';

const ACCEPTED_11D4_ANCHOR_FINGERPRINT =
  '9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059';
const ACCEPTED_11E1_SUITE_EVIDENCE_FINGERPRINT =
  '04ecde26f0a59b7615d6b2a192e7cffed26aefe86ebac07e388e546210d58845';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let writerDbPath = 'data/local/rhymelab-v5.sqlite';
let planPath = 'benchmarks/de-writer-v2/plan.json';
let reportPath = 'data/local/phrase-mosaic-ranking-v1-candidate-report.json';
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
    rawRank: candidate.rawRank ?? null,
    canonical: candidate.canonical,
    phraseId: candidate.phraseId,
    windowId: candidate.windowId,
    phoneticType: candidate.score?.type || null,
    phoneticScore: rounded(candidate.score?.overall),
    phraseUtility: candidate.phraseUtility || null,
    leipzigCorpusCount: candidate.rankingEvidence?.leipzig?.corpusCount || 0,
    leipzigCommonness: candidate.rankingEvidence?.leipzig?.equalWeightCommonness || 0,
    phraseTypes: candidate.rankingEvidence?.phraseTypes || [],
    surfaceSafety: candidate.rankingEvidence?.surfaceSafety || null,
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
  let totalCandidates = 0;
  let changedTopCount = 0;
  let rawMarkedTopCount = 0;
  let rankedMarkedTopCount = 0;
  let rawTop20Marked = 0;
  let rankedTop20Marked = 0;
  let rawTop20WithLeipzig = 0;
  let rankedTop20WithLeipzig = 0;

  for (const query of selectedQueries) {
    const word = typeof query === 'string' ? query : query.word;
    const detail = getWord(writerDb, word);

    if (!detail?.preferredIpa) {
      queryReports.push({
        word,
        status: 'missing_writer_query',
        evidenceFingerprint: null,
        rankingFingerprint: null,
        rawTop: null,
        rankedTop: null,
        topChanged: false,
      });
      evidenceSuiteRows.push([word, 'missing_writer_query', null]);
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
    const ranked = rankPhraseMosaicCandidates(enriched);

    evidenceSuiteRows.push([
      word,
      retrieval.query.anchors.length ? 'ok' : 'no_mosaic_query_anchor',
      enriched.evidenceFingerprint,
    ]);

    const rawTop = enriched.candidates[0] || null;
    const rankedTop = ranked.candidates[0] || null;
    const topChanged = Boolean(
      rawTop && rankedTop && rawTop.windowId !== rankedTop.windowId,
    );

    totalCandidates += ranked.candidateCount;
    if (topChanged) changedTopCount += 1;
    if (rawTop?.rankingEvidence?.surfaceSafety?.class === 'marked') rawMarkedTopCount += 1;
    if (rankedTop?.rankingEvidence?.surfaceSafety?.class === 'marked') rankedMarkedTopCount += 1;
    rawTop20Marked += countTop(
      enriched.candidates,
      (candidate) => candidate.rankingEvidence?.surfaceSafety?.class === 'marked',
      20,
    );
    rankedTop20Marked += countTop(
      ranked.candidates,
      (candidate) => candidate.rankingEvidence?.surfaceSafety?.class === 'marked',
      20,
    );
    rawTop20WithLeipzig += countTop(
      enriched.candidates,
      (candidate) => Number(candidate.rankingEvidence?.leipzig?.corpusCount || 0) > 0,
      20,
    );
    rankedTop20WithLeipzig += countTop(
      ranked.candidates,
      (candidate) => Number(candidate.rankingEvidence?.leipzig?.corpusCount || 0) > 0,
      20,
    );

    queryReports.push({
      word,
      status: retrieval.query.anchors.length ? 'ok' : 'no_mosaic_query_anchor',
      candidateCount: ranked.candidateCount,
      evidenceFingerprint: enriched.evidenceFingerprint,
      rankingFingerprint: ranked.rankingFingerprint,
      topChanged,
      rawTop: summary(rawTop),
      rankedTop: summary(rankedTop),
      protected: {
        liebePerfect: word === 'Liebe'
          ? findCanonical(ranked.candidates, 'dastehen wie bestellt und nicht abgeholt')
          : null,
        freiheitDabeiSeid: word === 'Freiheit'
          ? findCanonical(ranked.candidates, 'dabei seid')
          : null,
        musikAbbreviation: word === 'Musik'
          ? findCanonical(ranked.candidates, 'K.-o.-Siegen')
          : null,
        lebenWeakOnly: word === 'Leben'
          ? summary(ranked.candidates[0] || null)
          : null,
      },
      topCandidates: ranked.candidates
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

  const suiteRankingFingerprint = sha256(JSON.stringify(
    queryReports.map((entry) => [
      entry.word,
      entry.status,
      entry.rankingFingerprint,
    ]),
  ));

  const report = {
    schema: 'rhymelab-phrase-mosaic-ranking-v1-candidate-diagnostics',
    status: 'ok',
    built_at: new Date().toISOString(),
    candidate_schema: PHRASE_MOSAIC_RANKING_CANDIDATE_SCHEMA,
    candidate_policy: PHRASE_MOSAIC_RANKING_CANDIDATE_POLICY,
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
    suite_ranking_fingerprint: suiteRankingFingerprint,
    settings: {
      perChannelLimit,
      maxCandidates,
      topCandidates,
      requestedQueries: requestedQueries.length ? requestedQueries : null,
    },
    aggregate: {
      queryCount: queryReports.length,
      totalCandidates,
      changedTopCount,
      rawMarkedTopCount,
      rankedMarkedTopCount,
      rawTop20Marked,
      rankedTop20Marked,
      rawTop20WithLeipzig,
      rankedTop20WithLeipzig,
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
    suite_ranking_fingerprint: report.suite_ranking_fingerprint,
    aggregate: report.aggregate,
    queries: report.queries.map((entry) => ({
      word: entry.word,
      status: entry.status,
      top_changed: entry.topChanged,
      raw_top: entry.rawTop,
      ranked_top: entry.rankedTop,
      protected: entry.protected,
    })),
    report: reportPath,
  }, null, 2));
} finally {
  phraseDb.close();
  writerDb.close();
}
