#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { openWriterDb } from '../src/experimental-writer-db.mjs';
import { openPhraseBrowserDb } from '../src/phrase-browser-store.mjs';
import { findWriterRhymes } from '../src/writer-search.mjs';
import {
  resolveGermanUnifiedQuery,
  searchUnifiedWriter,
  unifiedWriterCapabilities,
} from '../src/unified-writer-search.mjs';

const ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT =
  '1d07ad486bdff8b167a7a394dafa687a60178cb43bd5a48da19044715d33d3a0';
const ACCEPTED_11E3_SUITE_DIVERSITY_FINGERPRINT =
  'ca7e04e91226cd5a3855dbe302a54bffaccce8c6d3a9defff8be049ca6153ef1';

const args = process.argv.slice(2);
let writerDbPath = 'data/local/rhymelab-v5.sqlite';
let phraseDbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let planPath = 'benchmarks/de-writer-v2/plan.json';
let reportPath = 'data/local/unified-writer-acceptance-v1-report.json';
let runs = 3;
let maxCombinedOverheadRatio = 1.5;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--writer') writerDbPath = args[++i] || writerDbPath;
  else if (arg === '--phrases') phraseDbPath = args[++i] || phraseDbPath;
  else if (arg === '--plan') planPath = args[++i] || planPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--runs') runs = Math.max(2, Number(args[++i] || runs));
  else if (arg === '--max-overhead-ratio') {
    maxCombinedOverheadRatio = Math.max(1, Number(args[++i] || maxCombinedOverheadRatio));
  }
}

writerDbPath = resolve(writerDbPath);
phraseDbPath = resolve(phraseDbPath);
planPath = resolve(planPath);
reportPath = resolve(reportPath);

const plan = JSON.parse(await readFile(planPath, 'utf8'));
const queries = (plan.queries || []).map((entry) => String(entry.word || '')).filter(Boolean);
if (!queries.length) throw new Error('Unified Writer acceptance plan has no queries');

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const rounded = (value, digits = 3) => Number(Number(value || 0).toFixed(digits));

function wordProjection(row) {
  return {
    word: row.word,
    normalized: row.normalized,
    ipa: row.ipa,
    primaryType: row.primaryType ?? null,
    type: row.type ?? null,
    relationTypes: row.relationTypes || [],
    score: row.score,
    rhymeTier: row.rhymeTier,
    syllableCount: row.syllableCount,
    syllableDistance: row.syllableDistance,
    usageRank: row.usageRank ?? null,
    usageCount: row.usageCount ?? null,
    historical: Boolean(row.historical),
    writerRank: row.writerRank ?? null,
    writerMorphology: row.writerMorphology ?? null,
  };
}

function phraseProjection(row) {
  return {
    phraseId: row.phraseId,
    windowId: row.windowId,
    word: row.word,
    normalized: row.normalized,
    type: row.type,
    primaryType: row.primaryType,
    relationTypes: row.relationTypes || [],
    score: row.score,
    syllableCount: row.syllableCount,
    crossedWordBoundaries: row.crossedWordBoundaries,
    startsInsideToken: row.startsInsideToken,
    endsInsideToken: row.endsInsideToken,
    retrievalChannels: row.retrievalChannels || [],
    queryAnchor: row.queryAnchor || null,
    writerPageRank: row.writerPageRank,
    diversifiedPageRank: row.diversifiedPageRank,
    phraseTypes: row.phraseTypes || [],
    surfaceSafety: row.surfaceSafety || null,
    diversitySuppression: row.diversitySuppression
      ? {
          suppressed: Boolean(row.diversitySuppression.suppressed),
          reason: row.diversitySuppression.reason || null,
          key: row.diversitySuppression.key || null,
          limit: row.diversitySuppression.limit ?? null,
          keys: row.diversitySuppression.keys || null,
        }
      : null,
  };
}

function queryProjection(query) {
  if (!query) return null;
  return {
    kind: query.kind,
    language: query.language,
    surface: query.surface,
    normalized: query.normalized,
    preferredIpa: query.preferredIpa,
    syllableCount: query.syllableCount,
    phraseId: query.phraseId ?? null,
    pronunciationProvenance: query.pronunciationProvenance ?? null,
    resolvable: query.resolvable !== false,
    unresolvedTokens: query.unresolvedTokens || [],
  };
}

function resultStatus(result) {
  const count = Number(result?.channels?.phrases?.retrieval?.queryAnchorCount || 0);
  return count > 0 ? 'ok' : 'no_mosaic_query_anchor';
}

function phraseTop(result) {
  return result?.channels?.phrases?.results || [];
}

function maxFrameGroupSize(rows, cutoff = 20) {
  const counts = new Map();
  for (const row of rows.slice(0, cutoff)) {
    const frames = row.diversitySuppression?.keys?.lexicalFrames || [];
    for (const frame of frames) counts.set(frame, Number(counts.get(frame) || 0) + 1);
  }
  return counts.size ? Math.max(...counts.values()) : 0;
}

function phraseProvenanceComplete(row) {
  return Boolean(
    row?.phraseId
    && row?.windowId
    && row?.queryAnchor
    && Array.isArray(row?.retrievalChannels)
    && row.retrievalChannels.length
    && row?.phraseRankingEvidence
    && row?.diversitySuppression
  );
}

function checkProtected(resultsByWord) {
  const liefde = phraseTop(resultsByWord.get('Liebe'));
  const freiheit = phraseTop(resultsByWord.get('Freiheit'));
  const gedanken = phraseTop(resultsByWord.get('Gedanken'));
  const arbeitsweise = phraseTop(resultsByWord.get('Arbeitsweise'));
  const leben = phraseTop(resultsByWord.get('Leben'));
  const musik = phraseTop(resultsByWord.get('Musik'));
  const verloren = phraseTop(resultsByWord.get('verloren'));

  const markedMusikRank = musik.findIndex((row) => row.word === 'K.-o.-Siegen') + 1;

  return {
    liebePerfectRank1:
      liefde[0]?.word === 'dastehen wie bestellt und nicht abgeholt'
      && liefde[0]?.type === 'multisyllabic_perfect'
      && Number(liefde[0]?.score) === 1,
    freiheitDabeiSeidRank1: freiheit[0]?.word === 'dabei seid',
    gedankenWriterTopRank1: gedanken[0]?.word === 'notleidende Banken',
    arbeitsweiseWriterTopRank1: arbeitsweise[0]?.word === 'dabei gewesen',
    verlorenPhoneticTopPreserved:
      verloren[0]?.word === 'hoch geschätzt'
      && Number(verloren[0]?.score) === 0.7,
    musikMarkedStillOutsideTop20: markedMusikRank === 0 || markedMusikRank > 20,
    lebenStillEmpty: leben.length === 0,
  };
}

function semanticProjection(result) {
  return {
    status: result.status,
    languageBasis: result.languageBasis,
    scope: result.scope,
    activeLanguages: result.activeLanguages,
    unavailableLanguages: result.unavailableLanguages,
    query: queryProjection(result.query),
    words: (result.channels?.words?.results || []).map(wordProjection),
    phrases: (result.channels?.phrases?.results || []).map(phraseProjection),
    phraseRankingFingerprint: result.channels?.phrases?.rankingFingerprint || null,
    phraseDiversityFingerprint: result.channels?.phrases?.diversityFingerprint || null,
  };
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

async function runOnce(runIndex, { compareFrozenWords = false } = {}) {
  const writerDb = openWriterDb(writerDbPath);
  const phraseDb = openPhraseBrowserDb(phraseDbPath);

  try {
    const capabilities = unifiedWriterCapabilities({ writerDb, phraseDb });
    const perQuery = [];
    const resultsByWord = new Map();
    const phraseRankingRows = [];
    const phraseDiversityRows = [];
    const directWordTimes = [];
    const unifiedTimes = [];
    const wordMismatches = [];

    for (const word of queries) {
      let direct = null;
      let directMs = null;

      if (compareFrozenWords) {
        const directStart = performance.now();
        direct = findWriterRhymes(writerDb, word, {
          limit: 250,
          poolLimit: 800,
          includeVariants: false,
          includeHistorical: false,
          type: 'all',
          ensureTypeCoverage: false,
        });
        directMs = performance.now() - directStart;
        directWordTimes.push(directMs);
      }

      const unifiedStart = performance.now();
      const unified = searchUnifiedWriter(
        { writerDb, phraseDb },
        word,
        {
          language: 'de',
          scope: 'all',
          type: 'all',
          includeVariants: false,
          includeHistorical: false,
          wordLimit: 250,
          wordPoolLimit: 800,
          phraseLimit: 250,
          phrasePoolLimit: 512,
          phrasePerChannelLimit: 128,
        },
      );
      const unifiedMs = performance.now() - unifiedStart;
      unifiedTimes.push(unifiedMs);
      resultsByWord.set(word, unified);

      const status = resultStatus(unified);
      phraseRankingRows.push([
        word,
        status,
        unified.channels?.phrases?.rankingFingerprint || null,
      ]);
      phraseDiversityRows.push([
        word,
        status,
        unified.channels?.phrases?.diversityFingerprint || null,
      ]);

      let wordEquivalent = null;
      if (direct) {
        const directRows = (direct.results || []).map(wordProjection);
        const unifiedRows = (unified.channels?.words?.results || []).map(wordProjection);
        wordEquivalent = JSON.stringify(directRows) === JSON.stringify(unifiedRows);
        if (!wordEquivalent) wordMismatches.push(word);
      }

      const phraseRows = phraseTop(unified);
      perQuery.push({
        word,
        status: unified.status,
        mosaicStatus: status,
        directWordMs: directMs == null ? null : rounded(directMs),
        unifiedMs: rounded(unifiedMs),
        wordEquivalent,
        wordCount: unified.channels?.words?.results?.length || 0,
        phraseCount: phraseRows.length,
        phraseRankingFingerprint:
          unified.channels?.phrases?.rankingFingerprint || null,
        phraseDiversityFingerprint:
          unified.channels?.phrases?.diversityFingerprint || null,
        phraseTop20MaxLexicalFrameGroupSize: maxFrameGroupSize(phraseRows, 20),
        phraseTop20ProvenanceComplete:
          phraseRows.slice(0, 20).every(phraseProvenanceComplete),
        phraseTop20HistoricalRows:
          phraseRows.slice(0, 20).filter((row) => row.historical).length,
        phraseTop20RestrictedRows:
          phraseRows.slice(0, 20).filter(
            (row) => row.surfaceSafety?.class === 'restricted',
          ).length,
        phraseTop20MarkedRows:
          phraseRows.slice(0, 20).filter(
            (row) => row.surfaceSafety?.class === 'marked',
          ).length,
      });
    }

    const rankingSuiteFingerprint = sha256(JSON.stringify(phraseRankingRows));
    const diversitySuiteFingerprint = sha256(JSON.stringify(phraseDiversityRows));

    const scopeAll = resultsByWord.get('Arbeitsweise');
    const wordsOnly = searchUnifiedWriter(
      { writerDb, phraseDb },
      'Arbeitsweise',
      { language: 'de', scope: 'words', wordLimit: 250, wordPoolLimit: 800 },
    );
    const phrasesOnly = searchUnifiedWriter(
      { writerDb, phraseDb },
      'Arbeitsweise',
      {
        language: 'de',
        scope: 'phrases',
        phraseLimit: 250,
        phrasePoolLimit: 512,
        phrasePerChannelLimit: 128,
      },
    );
    const enOnly = searchUnifiedWriter(
      { writerDb, phraseDb },
      'Liebe',
      { language: 'en', scope: 'all' },
    );
    const both = searchUnifiedWriter(
      { writerDb, phraseDb },
      'Liebe',
      { language: 'both', scope: 'words', wordLimit: 20, wordPoolLimit: 800 },
    );

    const catalogPhrase = resolveGermanUnifiedQuery(
      writerDb,
      phraseDb,
      'dastehen wie bestellt und nicht abgeholt',
    );
    const composedPhrase = resolveGermanUnifiedQuery(
      writerDb,
      phraseDb,
      'Arbeitsweise Spotify',
    );

    const allPhraseRows = [...resultsByWord.values()].flatMap(phraseTop);
    const protectedChecks = checkProtected(resultsByWord);
    const structuralChecks = {
      deWordWriterAvailable: capabilities.languages.de.wordWriter === true,
      dePhraseMosaicAvailable: capabilities.languages.de.phraseMosaic === true,
      englishCapabilityExplicitlyUnavailable:
        capabilities.languages.en.available === false
        && capabilities.languages.en.reason
          === 'english_phonology_and_runtime_not_implemented',
      allScopeHasWords:
        (scopeAll?.channels?.words?.results?.length || 0) > 0,
      allScopeHasPhrases:
        (scopeAll?.channels?.phrases?.results?.length || 0) > 0,
      wordsScopeSuppressesPhraseExecution:
        (wordsOnly.channels?.words?.results?.length || 0) > 0
        && (wordsOnly.channels?.phrases?.results?.length || 0) === 0,
      phrasesScopeSuppressesWordExecution:
        (phrasesOnly.channels?.words?.results?.length || 0) === 0
        && (phrasesOnly.channels?.phrases?.results?.length || 0) > 0,
      englishOnlyReturnsUnavailable:
        enOnly.status === 'language_unavailable'
        && enOnly.activeLanguages.length === 0,
      bothRunsGermanAndWarnsEnglish:
        both.status === 'ok'
        && both.activeLanguages.includes('de')
        && both.unavailableLanguages.includes('en')
        && both.warnings.some((warning) => warning.code === 'english_runtime_unavailable'),
      exactCatalogPhraseQueryResolves:
        catalogPhrase?.kind === 'phrase'
        && catalogPhrase?.resolvable === true
        && Boolean(catalogPhrase?.phraseId)
        && Boolean(catalogPhrase?.preferredIpa),
      arbitraryMultiwordQueryComposesWithoutGuessing:
        composedPhrase?.kind === 'phrase'
        && composedPhrase?.resolvable === true
        && composedPhrase?.pronunciationProvenance
          === 'writer_v5_preferred_token_citation_composition'
        && Boolean(composedPhrase?.preferredIpa),
      phraseResultsCrossAtLeastOneBoundary:
        allPhraseRows.length > 0
        && allPhraseRows.every((row) => Number(row.crossedWordBoundaries || 0) >= 1),
      suiteCoversMultipleBoundaries:
        allPhraseRows.some((row) => Number(row.crossedWordBoundaries || 0) >= 2),
      suiteCoversSecondaryStress:
        [...resultsByWord.values()].some((result) =>
          (result.channels?.phrases?.queryAnchors || []).some(
            (anchor) => anchor.kind === 'secondary',
          )
        ),
      phraseTop20ProvenanceComplete:
        perQuery.every((entry) => entry.phraseTop20ProvenanceComplete),
      noHistoricalPhraseRowsInDefaultTop20:
        perQuery.every((entry) => entry.phraseTop20HistoricalRows === 0),
      noRestrictedPhraseRowsInDefaultTop20:
        perQuery.every((entry) => entry.phraseTop20RestrictedRows === 0),
      lexicalFrameCapRespectedInTop20:
        perQuery.every(
          (entry) => entry.phraseTop20MaxLexicalFrameGroupSize <= 3,
        ),
      acceptedPhraseRankingFingerprintReproduced:
        rankingSuiteFingerprint === ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT,
      acceptedPhraseDiversityFingerprintReproduced:
        diversitySuiteFingerprint === ACCEPTED_11E3_SUITE_DIVERSITY_FINGERPRINT,
      frozenWordWriterEquivalent:
        compareFrozenWords ? wordMismatches.length === 0 : true,
    };

    const directTotalMs = directWordTimes.reduce((sum, value) => sum + value, 0);
    const unifiedTotalMs = unifiedTimes.reduce((sum, value) => sum + value, 0);
    const overheadRatio = compareFrozenWords && directTotalMs > 0
      ? unifiedTotalMs / directTotalMs
      : null;

    const performanceGate = {
      measured: compareFrozenWords,
      directWordTotalMs: compareFrozenWords ? rounded(directTotalMs) : null,
      unifiedTotalMs: rounded(unifiedTotalMs),
      directWordMeanMs: compareFrozenWords ? rounded(mean(directWordTimes)) : null,
      unifiedMeanMs: rounded(mean(unifiedTimes)),
      combinedOverheadRatio:
        overheadRatio == null ? null : rounded(overheadRatio, 4),
      maxCombinedOverheadRatio,
      pass:
        !compareFrozenWords
        || (overheadRatio != null && overheadRatio <= maxCombinedOverheadRatio),
    };

    const semantic = {
      capabilities,
      queries: queries.map((word) =>
        semanticProjection(resultsByWord.get(word))
      ),
      protectedChecks,
      structuralChecks: {
        ...structuralChecks,
        frozenWordWriterEquivalent: true,
      },
      rankingSuiteFingerprint,
      diversitySuiteFingerprint,
    };

    return {
      run: runIndex,
      semanticFingerprint: sha256(JSON.stringify(semantic)),
      rankingSuiteFingerprint,
      diversitySuiteFingerprint,
      capabilities,
      protectedChecks,
      structuralChecks,
      wordMismatches,
      performance: performanceGate,
      perQuery,
      semantic,
    };
  } finally {
    phraseDb.close();
    writerDb.close();
  }
}

const runReports = [];
for (let run = 1; run <= runs; run += 1) {
  runReports.push(await runOnce(run, { compareFrozenWords: run === 1 }));
}

const firstSemanticFingerprint = runReports[0].semanticFingerprint;
const repeatabilityMismatches = runReports
  .filter((entry) => entry.semanticFingerprint !== firstSemanticFingerprint)
  .map((entry) => ({
    run: entry.run,
    expected: firstSemanticFingerprint,
    actual: entry.semanticFingerprint,
  }));

const first = runReports[0];
const allProtectedChecksPass = Object.values(first.protectedChecks)
  .every((value) => value === true);
const allStructuralChecksPass = Object.values(first.structuralChecks)
  .every((value) => value === true);
const repeatable = repeatabilityMismatches.length === 0;
const performancePass = first.performance.pass === true;
const acceptancePass =
  allProtectedChecksPass
  && allStructuralChecksPass
  && repeatable
  && performancePass;

const report = {
  schema: 'rhymelab-unified-writer-acceptance-v1',
  status: acceptancePass ? 'ok' : 'failed',
  built_at: new Date().toISOString(),
  writer_db: writerDbPath,
  phrase_db: phraseDbPath,
  plan: planPath,
  runs,
  accepted_11e2_v2_suite_ranking_fingerprint:
    ACCEPTED_11E2_V2_SUITE_RANKING_FINGERPRINT,
  accepted_11e3_suite_diversity_fingerprint:
    ACCEPTED_11E3_SUITE_DIVERSITY_FINGERPRINT,
  ranking_suite_fingerprint: first.rankingSuiteFingerprint,
  diversity_suite_fingerprint: first.diversitySuiteFingerprint,
  protected_checks: first.protectedChecks,
  structural_checks: first.structuralChecks,
  all_protected_checks_pass: allProtectedChecksPass,
  all_structural_checks_pass: allStructuralChecksPass,
  performance: first.performance,
  repeatability: {
    repeatable,
    semantic_fingerprint: firstSemanticFingerprint,
    mismatches: repeatabilityMismatches,
    runs: runReports.map((entry) => ({
      run: entry.run,
      semanticFingerprint: entry.semanticFingerprint,
      unifiedMeanMs: entry.performance.unifiedMeanMs,
    })),
  },
  per_query: first.perQuery,
  decision_gate: {
    acceptance_pass: acceptancePass,
    phase_11_close_allowed: acceptancePass,
    english_runtime_required_for_phase_11_close: false,
    english_runtime_phase: 12,
    next_step: acceptancePass
      ? 'accept_11e4f_and_close_phase_11_then_begin_phase_12_english'
      : 'inspect_failed_gate_before_closing_phase_11',
  },
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  report: reportPath,
  status: report.status,
  acceptance_pass: acceptancePass,
  all_protected_checks_pass: allProtectedChecksPass,
  all_structural_checks_pass: allStructuralChecksPass,
  performance: first.performance,
  repeatability: report.repeatability,
  ranking_suite_fingerprint: first.rankingSuiteFingerprint,
  diversity_suite_fingerprint: first.diversitySuiteFingerprint,
}, null, 2));

if (!acceptancePass) process.exitCode = 1;
