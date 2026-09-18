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
  findDiversityRow,
  repetitionExposure,
  PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_POLICY,
  PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_SCHEMA,
} from './phrase-mosaic-diversity-diagnostics-core.mjs';

const ACCEPTED_11D4_ANCHOR_FINGERPRINT =
  '9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059';
const ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT =
  '1d07ad486bdff8b167a7a394dafa687a60178cb43bd5a48da19044715d33d3a0';

const args = process.argv.slice(2);
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let writerDbPath = 'data/local/rhymelab-v5.sqlite';
let planPath = 'benchmarks/de-writer-v2/plan.json';
let reportPath = 'data/local/phrase-mosaic-diversity-v1-diagnostic-report.json';
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

if (!selectedQueries.length) throw new Error('No diversity diagnostic queries selected');

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function inspectRow(diagnostic, selector, limit = 50) {
  const row = findDiversityRow(diagnostic, { ...selector, limit });
  return row ? {
    writerPageRank: row.writerPageRank,
    windowId: row.windowId,
    phraseId: row.phraseId,
    canonical: row.canonical,
    phoneticType: row.phoneticType,
    phoneticScore: row.phoneticScore,
    repetitionExposure: repetitionExposure(row),
    repeatedClusters: row.repeatedClusters,
  } : null;
}

function aggregateCut(queryReports, limit) {
  const entries = queryReports
    .map((entry) => entry.diversity?.top?.[String(limit)])
    .filter(Boolean);

  const sum = (selector) => entries.reduce(
    (total, entry) => total + Number(selector(entry) || 0),
    0,
  );
  const count = (selector) => entries.filter(selector).length;

  return {
    queryCount: entries.length,
    candidateCount: sum((entry) => entry.candidateCount),
    exactCanonicalDuplicateExcess: sum(
      (entry) => entry.exactCanonical.excessMembershipCount,
    ),
    normalizedCanonicalDuplicateExcess: sum(
      (entry) => entry.normalizedCanonical.excessMembershipCount,
    ),
    repeatedLexicalHeadMemberships: sum(
      (entry) => entry.lexicalHead.repeatedMembershipCount,
    ),
    repeatedPhraseFamilyMemberships: sum(
      (entry) => entry.phraseFamily.repeatedMembershipCount,
    ),
    repeatedLexicalFrameMemberships: sum(
      (entry) => entry.lexicalFrame.repeatedMembershipCount,
    ),
    queriesWithExactCanonicalDuplicates: count(
      (entry) => entry.exactCanonical.excessMembershipCount > 0,
    ),
    queriesWithNormalizedCanonicalDuplicates: count(
      (entry) => entry.normalizedCanonical.excessMembershipCount > 0,
    ),
    queriesWithRepeatedLexicalHeads: count(
      (entry) => entry.lexicalHead.repeatedGroupCount > 0,
    ),
    queriesWithRepeatedPhraseFamilies: count(
      (entry) => entry.phraseFamily.repeatedGroupCount > 0,
    ),
    queriesWithRepeatedLexicalFrames: count(
      (entry) => entry.lexicalFrame.repeatedGroupCount > 0,
    ),
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

  for (const query of selectedQueries) {
    const word = typeof query === 'string' ? query : query.word;
    const detail = getWord(writerDb, word);

    if (!detail?.preferredIpa) {
      const status = 'missing_writer_query';
      queryReports.push({
        word,
        status,
        v2RankingFingerprint: null,
        diversity: null,
      });
      v2SuiteRows.push([word, status, null]);
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
    const diversity = analyzePhraseMosaicDiversity(v2);
    const status = retrieval.query.anchors.length ? 'ok' : 'no_mosaic_query_anchor';

    v2SuiteRows.push([word, status, v2.rankingFingerprint]);

    const writerTop = v2.writerPageCandidates[0] || null;
    const musikMarked = word === 'Musik'
      ? v2.candidates.find((candidate) => candidate.canonical === 'K.-o.-Siegen') || null
      : null;

    queryReports.push({
      word,
      phenomena: Array.isArray(query?.phenomena) ? query.phenomena : [],
      status,
      v2RankingFingerprint: v2.rankingFingerprint,
      writerPageCandidateCount: v2.writerPageCandidateCount,
      diversity,
      protected: {
        liebePerfect: word === 'Liebe'
          ? inspectRow(
              diversity,
              { canonical: 'dastehen wie bestellt und nicht abgeholt' },
            )
          : null,
        freiheitDabeiSeid: word === 'Freiheit'
          ? inspectRow(diversity, { canonical: 'dabei seid' })
          : null,
        gedankenWriterTop: word === 'Gedanken' && writerTop
          ? inspectRow(diversity, { windowId: writerTop.windowId })
          : null,
        arbeitsweiseWriterTop: word === 'Arbeitsweise' && writerTop
          ? inspectRow(diversity, { windowId: writerTop.windowId })
          : null,
        hitzefreiWriterTop: String(word).toLocaleLowerCase('de-DE') === 'hitzefrei' && writerTop
          ? inspectRow(diversity, { windowId: writerTop.windowId })
          : null,
        musikMarkedSurface: musikMarked ? {
          canonical: musikMarked.canonical,
          writerPageRank: musikMarked.writerPageRank,
          surfaceSafety: musikMarked.rankingEvidence?.surfaceSafety || null,
          remainsOutsideTop20: !musikMarked.writerPageRank || musikMarked.writerPageRank > 20,
        } : null,
        lebenEmptyWriterPage: word === 'Leben'
          ? v2.writerPageCandidateCount === 0
          : null,
      },
    });
  }

  const suiteV2RankingFingerprint = sha256(JSON.stringify(v2SuiteRows));
  if (!requestedQueries.length
    && suiteV2RankingFingerprint !== ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT) {
    throw new Error(
      '11E2-v2 ranking fingerprint changed: expected '
      + ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT
      + ', got '
      + suiteV2RankingFingerprint,
    );
  }

  const suiteDiversityFingerprint = sha256(JSON.stringify(
    queryReports.map((entry) => [
      entry.word,
      entry.status,
      entry.v2RankingFingerprint,
      entry.diversity?.diagnosticFingerprint || null,
    ]),
  ));

  const protectedRows = queryReports.flatMap((entry) =>
    Object.entries(entry.protected || {})
      .filter(([, value]) => value && value.repetitionExposure)
      .map(([name, value]) => ({
        word: entry.word,
        name,
        ...value,
      }))
  );
  const protectedRowsWithRepetitionExposure = protectedRows.filter(
    (entry) => entry.repetitionExposure?.exposed,
  );

  const report = {
    schema: 'rhymelab-phrase-mosaic-diversity-diagnostic-report-v1',
    status: 'ok',
    built_at: new Date().toISOString(),
    diagnostic_schema: PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_SCHEMA,
    diagnostic_policy: PHRASE_MOSAIC_DIVERSITY_DIAGNOSTIC_POLICY,
    read_only: true,
    suppression_implemented: false,
    phrase_db: phraseDbPath,
    writer_db: writerDbPath,
    plan: planPath,
    accepted_11d4_anchor_fingerprint: ACCEPTED_11D4_ANCHOR_FINGERPRINT,
    accepted_11e2_v2_suite_ranking_fingerprint:
      ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT,
    suite_v2_ranking_fingerprint: suiteV2RankingFingerprint,
    suite_v2_ranking_fingerprint_matches:
      requestedQueries.length
        ? null
        : suiteV2RankingFingerprint === ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT,
    suite_diversity_fingerprint: suiteDiversityFingerprint,
    query_count: queryReports.length,
    aggregate: {
      top10: aggregateCut(queryReports, 10),
      top20: aggregateCut(queryReports, 20),
      top50: aggregateCut(queryReports, 50),
      protected_rows_inspected: protectedRows.length,
      protected_rows_with_repetition_exposure:
        protectedRowsWithRepetitionExposure.length,
      protected_repetition_exposure: protectedRowsWithRepetitionExposure,
      inflection_identity_available: false,
      inflection_identity_reason:
        'accepted_11e2_v2_candidate_payload_has_no_lemma_or_inflection_family_key',
    },
    queries: queryReports,
    decision_gate: {
      suppression_policy_selected: false,
      next_step:
        'owner_review_diagnostic_concentration_then_select_minimal_deterministic_diversification_candidate',
    },
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    report: reportPath,
    suite_v2_ranking_fingerprint: suiteV2RankingFingerprint,
    suite_diversity_fingerprint: suiteDiversityFingerprint,
    aggregate_top20: report.aggregate.top20,
    protected_rows_with_repetition_exposure:
      report.aggregate.protected_rows_with_repetition_exposure,
    suppression_implemented: false,
  }, null, 2));
} finally {
  phraseDb.close();
  writerDb.close();
}
