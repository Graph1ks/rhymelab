#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { openRhymeDb, findRhymes, getWord } from '../src/local-engine.mjs';
import { findWriterRhymes } from '../src/writer-search.mjs';
import { resolveWriterMorphologyBatch } from '../src/writer-morphology.mjs';
import {
  WRITER_PAGE_BENCHMARK_SCHEMA,
  WRITER_PAGE_REVIEW_SCHEMA,
  evaluateMorphologyRegression,
  evaluatePageRegression,
  evaluateProvisionalGates,
  legacyTier0Retention,
  ndcgForResponse,
  pageMetrics,
} from './writer-page-benchmark-core.mjs';

const args = process.argv.slice(2);
let planPath = 'benchmarks/de-writer-v2/plan.json';
let dbPath = process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite';
let reviewsPath = process.env.RHYMELAB_WRITER_PAGE_REVIEWS || 'data/local/benchmark/de-writer-v2-reviews.json';
let outPath = process.env.RHYMELAB_WRITER_PAGE_BENCHMARK_REPORT || 'reports/de-writer-page-benchmark-v2.json';
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--plan') planPath = args[++index] || planPath;
  else if (args[index] === '--db') dbPath = args[++index] || dbPath;
  else if (args[index] === '--reviews') reviewsPath = args[++index] || reviewsPath;
  else if (args[index] === '--out') outPath = args[++index] || outPath;
}
planPath = resolve(planPath);
dbPath = resolve(dbPath);
reviewsPath = resolve(reviewsPath);
outPath = resolve(outPath);

const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (plan.schema !== 'rhymelab-de-writer-page-plan-v2') throw new Error(`Unexpected writer-page plan schema: ${plan.schema}`);

let reviewsPayload = null;
try {
  reviewsPayload = JSON.parse(await readFile(reviewsPath, 'utf8'));
  if (reviewsPayload.schema !== WRITER_PAGE_REVIEW_SCHEMA) {
    throw new Error(`Unexpected writer-page review schema: ${reviewsPayload.schema}`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const reviews = Array.isArray(reviewsPayload?.reviews) ? reviewsPayload.reviews : [];

const writerLimit = Math.max(20, Math.min(250, Number(plan?.sampling?.writer_limit) || 250));
const legacyLimit = Math.max(20, Math.min(250, Number(plan?.sampling?.legacy_limit) || 250));
const poolLimit = Math.max(50, Math.min(800, Number(plan?.sampling?.candidate_pool) || 800));
const cutoffs = [...new Set((plan?.sampling?.page_cutoffs || [10, 20]).map(Number).filter((value) => Number.isInteger(value) && value > 0))]
  .sort((a, b) => a - b);

function aggregateMetricBlocks(entries, cutoff) {
  const blocks = entries.map((entry) => entry.pageMetrics[String(cutoff)]).filter(Boolean);
  const sum = (field) => blocks.reduce((total, block) => total + Number(block?.[field] || 0), 0);
  const rate = (field) => {
    const rows = sum('rows');
    return rows ? Number((sum(field) / rows).toFixed(4)) : 0;
  };
  const diversities = blocks.map((block) => block.morphologyDiversity).filter((value) => Number.isFinite(value));
  return {
    cutoff,
    queryCount: blocks.length,
    rows: sum('rows'),
    exactDuplicateRows: sum('exactDuplicateRows'),
    nearDuplicateRows: sum('nearDuplicateRows'),
    sameLemmaRows: sum('sameLemmaRows'),
    repeatedFamilyRows: sum('repeatedFamilyRows'),
    resolvedFamilyRows: sum('resolvedFamilyRows'),
    uniqueFamiliesSummed: sum('uniqueFamilies'),
    meanMorphologyDiversity: diversities.length
      ? Number((diversities.reduce((total, value) => total + value, 0) / diversities.length).toFixed(4))
      : null,
    unrankedRows: sum('unrankedRows'),
    usageRankOver100kRows: sum('usageRankOver100kRows'),
    usageRankOver250kRows: sum('usageRankOver250kRows'),
    explicitRareOrHistoricalRows: sum('explicitRareOrHistoricalRows'),
    preferredPronunciationRows: sum('preferredPronunciationRows'),
    rates: {
      exactDuplicate: rate('exactDuplicateRows'),
      nearDuplicate: rate('nearDuplicateRows'),
      sameLemma: rate('sameLemmaRows'),
      repeatedFamily: rate('repeatedFamilyRows'),
      unranked: rate('unrankedRows'),
      usageRankOver100k: rate('usageRankOver100kRows'),
      usageRankOver250k: rate('usageRankOver250kRows'),
      explicitRareOrHistorical: rate('explicitRareOrHistoricalRows'),
      preferredPronunciation: rate('preferredPronunciationRows'),
    },
  };
}

const db = openRhymeDb(dbPath);
const queryReports = [];
const pageRegressionResults = [];
const morphologyRegressionResults = [];

try {
  for (const queryPlan of plan.queries || []) {
    const query = queryPlan.word;
    const started = performance.now();
    const writer = findWriterRhymes(db, query, {
      limit: writerLimit,
      poolLimit,
      includeVariants: plan?.sampling?.include_variants === true,
      includeHistorical: plan?.sampling?.include_historical === true,
      type: 'all',
      ensureTypeCoverage: false,
    });
    const writerElapsedMs = Number((performance.now() - started).toFixed(1));
    const legacy = findRhymes(db, query, {
      limit: legacyLimit,
      poolLimit,
      includeVariants: plan?.sampling?.include_variants === true,
      includeHistorical: plan?.sampling?.include_historical === true,
      type: 'all',
      ensureTypeCoverage: false,
    });

    if (!writer || !legacy) {
      queryReports.push({ query, status: 'missing', writerElapsedMs });
      continue;
    }

    const pageMetricBlocks = Object.fromEntries(cutoffs.map((cutoff) => [String(cutoff), pageMetrics(writer, cutoff)]));
    const ndcg = Object.fromEntries(cutoffs.map((cutoff) => [String(cutoff), ndcgForResponse(writer, reviews, cutoff)]));
    const regressions = (plan.page_regressions || [])
      .filter((rule) => String(rule.query).toLocaleLowerCase('de-DE') === query.toLocaleLowerCase('de-DE'))
      .map((rule) => evaluatePageRegression(writer, rule));
    pageRegressionResults.push(...regressions);

    queryReports.push({
      query,
      status: 'ok',
      phenomena: queryPlan.phenomena || [],
      writerElapsedMs,
      rankingPolicy: writer.rankingPolicy,
      writerAnchorPolicy: writer.phonology?.writerAnchorPolicy || null,
      morphologyPolicy: writer.writerMorphology?.policy || null,
      retrieval: writer.writerRetrieval || null,
      pageMetrics: pageMetricBlocks,
      legacyTier0Retention: legacyTier0Retention(writer, legacy),
      ndcg,
      regressions,
    });

    console.log(`${query.padEnd(16)} ${String(writerElapsedMs).padStart(8)} ms  top20-unranked=${String(pageMetricBlocks['20']?.unrankedRows ?? '-').padStart(2)}  top20-repeat-family=${String(pageMetricBlocks['20']?.repeatedFamilyRows ?? '-').padStart(2)}  tier0-retention=${queryReports.at(-1).legacyTier0Retention.retention}`);
  }

  const morphologyRules = plan.morphology_regressions || [];
  const morphologyRows = [];
  const wordState = new Map();
  for (const rule of morphologyRules) {
    const word = getWord(db, rule.word);
    if (!word) {
      wordState.set(rule.id, { wordFound: false, evidence: null });
      continue;
    }
    morphologyRows.push(word);
    wordState.set(rule.id, { wordFound: true, normalized: word.normalized, evidence: null });
  }
  const morphologyMap = resolveWriterMorphologyBatch(db, morphologyRows, plan.language || 'de');
  for (const rule of morphologyRules) {
    const state = wordState.get(rule.id) || { wordFound: false, evidence: null };
    if (state.wordFound) state.evidence = morphologyMap.get(state.normalized) || null;
    const result = evaluateMorphologyRegression(state, rule);
    morphologyRegressionResults.push(result);
    console.log(`${rule.word.padEnd(20)} morphology ${result.passed ? 'PASS' : 'FAIL'} ${result.observed?.family ?? 'null'} ${result.observed?.constructionRule ?? ''}`);
  }

  const okQueries = queryReports.filter((entry) => entry.status === 'ok');
  const aggregate = Object.fromEntries(cutoffs.map((cutoff) => [String(cutoff), aggregateMetricBlocks(okQueries, cutoff)]));
  const allRegressions = [...pageRegressionResults, ...morphologyRegressionResults];
  const top20 = aggregate['20'] || aggregate[String(cutoffs.at(-1))] || null;
  const provisional = evaluateProvisionalGates(top20, allRegressions, plan);

  const retentionRows = okQueries.map((entry) => entry.legacyTier0Retention);
  const retentionDenominator = retentionRows.reduce((sum, entry) => sum + entry.legacyTier0Rows, 0);
  const retentionNumerator = retentionRows.reduce((sum, entry) => sum + entry.retainedRows, 0);
  const tier0Retention = {
    legacyTier0Rows: retentionDenominator,
    retainedRows: retentionNumerator,
    missingRows: retentionDenominator - retentionNumerator,
    retention: retentionDenominator ? Number((retentionNumerator / retentionDenominator).toFixed(4)) : 1,
  };

  const ndcgSummary = {};
  for (const cutoff of cutoffs) {
    const values = okQueries.map((entry) => entry.ndcg[String(cutoff)]).filter((entry) => entry?.status === 'ok' && Number.isFinite(entry.ndcg));
    ndcgSummary[String(cutoff)] = {
      status: values.length === okQueries.length && okQueries.length > 0 ? 'ok' : 'pending_reference',
      completeQueries: values.length,
      queryCount: okQueries.length,
      meanNdcg: values.length
        ? Number((values.reduce((sum, entry) => sum + entry.ndcg, 0) / values.length).toFixed(4))
        : null,
    };
  }

  const referencePending = Object.values(ndcgSummary).some((entry) => entry.status !== 'ok');
  const report = {
    schema: WRITER_PAGE_BENCHMARK_SCHEMA,
    generatedAt: new Date().toISOString(),
    plan: {
      path: planPath,
      schema: plan.schema,
      version: plan.version,
    },
    database: dbPath,
    reviews: reviewsPayload ? {
      path: reviewsPath,
      schema: reviewsPayload.schema,
      queueFingerprint: reviewsPayload.queueFingerprint || null,
      reviewCount: reviews.length,
    } : {
      path: reviewsPath,
      schema: null,
      queueFingerprint: null,
      reviewCount: 0,
    },
    status: provisional.passed
      ? (referencePending ? 'structural_ok_reference_pending' : 'ok')
      : 'failed_structural',
    structuralGate: provisional,
    queryCount: queryReports.length,
    okQueries: okQueries.length,
    missingQueries: queryReports.length - okQueries.length,
    aggregate,
    legacyTier0Retention: tier0Retention,
    ndcg: ndcgSummary,
    pageRegressions: pageRegressionResults,
    morphologyRegressions: morphologyRegressionResults,
    queries: queryReports,
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nstatus=${report.status}`);
  console.log(`structural_gate=${provisional.passed ? 'PASS' : 'FAIL'}`);
  console.log(`legacy_tier0_retention=${tier0Retention.retention}`);
  console.log(`ndcg@10=${ndcgSummary['10']?.meanNdcg ?? 'pending'}  ndcg@20=${ndcgSummary['20']?.meanNdcg ?? 'pending'}`);
  console.log(`Report: ${outPath}`);

  if (!provisional.passed) process.exitCode = 1;
} finally {
  db.close();
}
