#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRhymeDb } from '../src/local-engine.mjs';
import { findWriterRhymes } from '../src/writer-search.mjs';

const DEFAULT_QUERIES = Object.freeze([
  'Arbeitsweise',
  'Liebe',
  'Leben',
  'Zeit',
  'Nacht',
  'Feuer',
  'verloren',
  'Gedanken',
  'Freiheit',
  'Musik',
  'Spotify',
  'hitzefrei',
]);

const args = process.argv.slice(2).map((value) => String(value).trim()).filter(Boolean);
const queries = args.length ? args : [...DEFAULT_QUERIES];
const dbPath = resolve(process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');
const outPath = resolve(process.env.RHYMELAB_WRITER_PAGE_REPORT || 'reports/writer-page-diagnostic.json');
const topLimit = Math.max(10, Math.min(100, Number.parseInt(process.env.RHYMELAB_WRITER_PAGE_LIMIT || '30', 10) || 30));
const poolLimit = Math.max(50, Math.min(800, Number.parseInt(process.env.RHYMELAB_WRITER_PAGE_POOL || '800', 10) || 800));

function familyStats(rows) {
  const counts = new Map();
  for (const row of rows) {
    const family = row.writerMorphology?.familyKey;
    if (!family) continue;
    counts.set(family, (counts.get(family) || 0) + 1);
  }
  const repeated = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const dominant = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    .slice(0, 8)
    .map(([family, count]) => ({ family, count }));
  return {
    resolvedRows: rows.filter((row) => row.writerMorphology?.status === 'attested_right_head_candidate').length,
    uniqueFamilies: counts.size,
    repeatedFamilyRows: repeated,
    dominant,
  };
}

function lexicalSafety(rows) {
  const rareTags = new Set(['rare', 'archaic', 'obsolete', 'dated']);
  return {
    unranked: rows.filter((row) => row.usageRank == null).length,
    usageRankOver100k: rows.filter((row) => Number(row.usageRank) > 100000).length,
    usageRankOver250k: rows.filter((row) => Number(row.usageRank) > 250000).length,
    explicitRareOrHistorical: rows.filter((row) => (row.lexicalTags || []).some((tag) => rareTags.has(String(tag).toLowerCase()))).length,
    writerSafetyTierPenalized: rows.filter((row) => Number(row.writer?.lexicalSafetyTierPenalty || 0) > 0).length,
  };
}

function splitEvidence(row) {
  const morphology = row.writerMorphology;
  if (morphology?.status !== 'attested_right_head_candidate') return null;
  return {
    rank: row.writerRank,
    word: row.word,
    wholeLemma: row.lemma || null,
    wholePartOfSpeech: row.partOfSpeech || null,
    family: morphology.familyKey,
    leftRaw: morphology.split?.leftRaw || null,
    right: morphology.split?.right || null,
    leftEvidence: morphology.leftEvidence || null,
    rightHead: morphology.rightHead || null,
    checks: morphology.checks || null,
  };
}

function compactRow(row) {
  return {
    rank: row.writerRank,
    word: row.word,
    primaryType: row.primaryType,
    score: row.score,
    usageRank: row.usageRank ?? null,
    family: row.writerMorphology?.familyKey || null,
    split: row.writerMorphology?.split
      ? `${row.writerMorphology.split.leftRaw}|${row.writerMorphology.split.right}`
      : null,
    cheapTierPenalty: row.writer?.cheapRhymeTierPenalty ?? 0,
    lexicalSafetyTierPenalty: row.writer?.lexicalSafetyTierPenalty ?? 0,
    lexicalSafetyState: row.writer?.lexicalSafety?.state || null,
    diversityTierPenalty: row.writer?.diversityTierPenalty ?? 0,
    effectiveTier: row.writer?.effectiveTier ?? null,
    anchor: row.writerAnchor || null,
  };
}

const db = openRhymeDb(dbPath);
const results = [];

try {
  for (const query of queries) {
    const started = performance.now();
    const response = findWriterRhymes(db, query, {
      limit: topLimit,
      poolLimit,
      includeVariants: false,
      includeHistorical: false,
      type: 'all',
      ensureTypeCoverage: false,
    });
    const elapsedMs = Number((performance.now() - started).toFixed(1));

    if (!response) {
      results.push({ query, status: 'missing', elapsedMs });
      console.log(`${query.padEnd(16)} MISSING`);
      continue;
    }

    const rows = response.results.slice(0, topLimit);
    const families = familyStats(rows);
    const safety = lexicalSafety(rows);
    const resolvedRatio = rows.length ? families.resolvedRows / rows.length : 0;
    const splitReview = rows.map(splitEvidence).filter(Boolean);

    const entry = {
      query,
      status: 'ok',
      elapsedMs,
      rankingPolicy: response.rankingPolicy,
      writerAnchorPolicy: response.phonology?.writerAnchorPolicy || null,
      morphologyPolicy: response.writerMorphology?.policy || null,
      retrieval: response.writerRetrieval,
      queryMorphology: response.query?.writerMorphology || null,
      topCount: rows.length,
      morphology: {
        ...families,
        resolvedRatio: Number(resolvedRatio.toFixed(4)),
      },
      lexicalSafety: safety,
      rows: rows.map(compactRow),
      splitReview,
    };
    results.push(entry);

    const repeat = String(families.repeatedFamilyRows).padStart(2);
    const unresolved = String(rows.length - families.resolvedRows).padStart(2);
    const unranked = String(safety.unranked).padStart(2);
    const rare = String(safety.explicitRareOrHistorical).padStart(2);
    const safetyTier = String(safety.writerSafetyTierPenalized).padStart(2);
    console.log(`${query.padEnd(16)} ${String(elapsedMs).padStart(8)} ms  repeat-family=${repeat}  unresolved=${unresolved}  unranked=${unranked}  rare=${rare}  safety-tier=${safetyTier}`);
  }

  const ok = results.filter((entry) => entry.status === 'ok');
  const report = {
    schema: 'rhymelab-writer-page-diagnostic-v2',
    generatedAt: new Date().toISOString(),
    database: dbPath,
    topLimit,
    poolLimit,
    queryCount: results.length,
    okQueries: ok.length,
    missingQueries: results.length - ok.length,
    aggregate: {
      meanElapsedMs: ok.length
        ? Number((ok.reduce((sum, entry) => sum + entry.elapsedMs, 0) / ok.length).toFixed(1))
        : null,
      repeatedFamilyRows: ok.reduce((sum, entry) => sum + entry.morphology.repeatedFamilyRows, 0),
      unrankedRows: ok.reduce((sum, entry) => sum + entry.lexicalSafety.unranked, 0),
      usageRankOver100kRows: ok.reduce((sum, entry) => sum + entry.lexicalSafety.usageRankOver100k, 0),
      usageRankOver250kRows: ok.reduce((sum, entry) => sum + entry.lexicalSafety.usageRankOver250k, 0),
      explicitRareOrHistoricalRows: ok.reduce((sum, entry) => sum + entry.lexicalSafety.explicitRareOrHistorical, 0),
      writerSafetyTierPenalizedRows: ok.reduce((sum, entry) => sum + entry.lexicalSafety.writerSafetyTierPenalized, 0),
    },
    queries: results,
  };

  await mkdir(resolve(outPath, '..'), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nReport: ${outPath}`);
} finally {
  db.close();
}
