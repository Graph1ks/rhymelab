#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { normalizeWord } from '../src/local-engine.mjs';
import { getPhonologyProfile } from './phonology-profiles.mjs';
import {
  compareOrderedIds,
  evaluateMorphologyRegression,
  materializedMorphologySummary,
  median,
} from './writer-v5-equivalence-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const dbPath = resolve(argValue('--db', 'data/local/rhymelab-v5.sqlite'));
const planPath = resolve(argValue('--plan', 'benchmarks/de-writer-v2/plan.json'));
const outPath = resolve(argValue('--out', 'data/local/writer-v5-equivalence-report.json'));
const iterations = Math.max(1, Math.min(20, Number.parseInt(argValue('--iterations', '5'), 10) || 5));
const round = (value, digits = 3) => Number(Number(value || 0).toFixed(digits));

try {
  await access(dbPath);
} catch {
  throw new Error(`Experimental writer database not found: ${dbPath}`);
}

const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (plan.schema !== 'rhymelab-de-writer-page-plan-v2') {
  throw new Error(`Unexpected writer benchmark plan schema: ${plan.schema || 'missing'}`);
}

function timedLookup(fn) {
  const samples = [];
  let rows = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    rows = fn();
    samples.push(performance.now() - started);
  }
  return {
    rows,
    samplesMs: samples.map((value) => round(value)),
    medianMs: round(median(samples)),
  };
}

function describeIds(db, ids = [], limit = 12) {
  const chosen = [...new Set(ids.map(Number))].slice(0, limit);
  if (!chosen.length) return [];
  const placeholders = chosen.map(() => '?').join(',');
  const byId = new Map(db.prepare(`
    SELECT id,surface,normalized,ipa
    FROM hot
    WHERE id IN (${placeholders})
  `).all(...chosen).map((row) => [Number(row.id), row]));
  return chosen.map((id) => byId.get(id) || { id });
}

const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  db.exec('PRAGMA query_only=ON;');
  const meta = Object.fromEntries(db.prepare('SELECT key,value FROM meta').all().map((row) => [row.key, row.value]));
  if (meta.schema !== 'rhymelab-local-db-v5') {
    throw new Error(`Writer-v5 equivalence requires rhymelab-local-db-v5; found ${meta.schema || 'missing'}`);
  }
  if (meta.writer_anchor_storage !== 'compact-primary-key-v2') {
    throw new Error(`Expected compact writer anchor storage; found ${meta.writer_anchor_storage || 'missing'}`);
  }
  if (meta.writer_morphology_storage !== 'positive-evidence-compact-v2') {
    throw new Error(`Expected compact writer morphology storage; found ${meta.writer_morphology_storage || 'missing'}`);
  }

  const language = String(meta.language || plan.language || 'de');
  const profile = getPhonologyProfile(language);
  const poolLimit = Math.max(50, Math.min(800, Number(plan.sampling?.candidate_pool || 800)));
  const includeVariants = plan.sampling?.include_variants === true;
  const includeHistorical = plan.sampling?.include_historical === true;
  const preferredSql = includeVariants ? '' : ' AND pronunciation_preferred=1';
  const preferredJoinSql = includeVariants ? '' : ' AND h.pronunciation_preferred=1';
  const historicalSql = includeHistorical ? '' : ' AND historical=0';
  const historicalJoinSql = includeHistorical ? '' : ' AND h.historical=0';

  function queryRow(word) {
    const normalized = normalizeWord(word, language);
    return db.prepare(`
      SELECT id,surface,normalized,ipa,syllable_count,usage_rank
      FROM hot
      WHERE normalized=?
        AND pronunciation_preferred=1
        ${includeHistorical ? '' : 'AND historical=0'}
      ORDER BY usage_rank IS NULL,usage_rank,pronunciation_rank,id
      LIMIT 1
    `).get(normalized) || null;
  }

  function oldLookup(anchorKey, queryNormalized, querySyllables) {
    return db.prepare(`
      SELECT id,surface,normalized,ipa
      FROM hot
      WHERE vowel_key LIKE ?
        AND normalized != ?
        AND ABS(syllable_count-?) <= 1
        ${preferredSql}${historicalSql}
      ORDER BY ABS(syllable_count-?), usage_rank IS NULL, usage_rank, id
      LIMIT ?
    `).all(`%${anchorKey}`, queryNormalized, querySyllables, querySyllables, poolLimit);
  }

  function indexedLookup(anchorKey, queryNormalized, querySyllables) {
    return db.prepare(`
      SELECT h.id,h.surface,h.normalized,h.ipa
      FROM writer_anchor a
      JOIN hot h ON h.id=a.pronunciation_id
      WHERE a.anchor_key=?
        AND h.normalized != ?
        AND ABS(h.syllable_count-?) <= 1
        ${preferredJoinSql}${historicalJoinSql}
      ORDER BY ABS(h.syllable_count-?), h.usage_rank IS NULL, h.usage_rank, h.id
      LIMIT ?
    `).all(anchorKey, queryNormalized, querySyllables, querySyllables, poolLimit);
  }

  const queryReports = [];
  const missingQueries = [];
  const retrievalMismatchQueries = [];
  let samplePlan = [];
  let samplePlanUsesPrimaryKey = false;

  for (const querySpec of plan.queries || []) {
    const row = queryRow(querySpec.word);
    if (!row) {
      missingQueries.push(querySpec.word);
      queryReports.push({ word: querySpec.word, found: false });
      continue;
    }

    const analysis = profile.analyzeIpa(row.ipa);
    const keys = typeof profile.writerRetrievalKeys === 'function'
      ? profile.writerRetrievalKeys(analysis)
      : [];
    const channels = [];
    const oldUnion = new Set();
    const indexedUnion = new Set();
    const indexedWords = new Set();
    let queryOldMedianMs = 0;
    let queryIndexedMedianMs = 0;

    for (const entry of keys) {
      // Prime both paths once before collecting timing samples so the correctness gate
      // does not depend on cold-cache asymmetry.
      oldLookup(entry.key, row.normalized, row.syllable_count);
      indexedLookup(entry.key, row.normalized, row.syllable_count);

      let oldTimed;
      let indexedTimed;
      if (channels.length % 2 === 0) {
        oldTimed = timedLookup(() => oldLookup(entry.key, row.normalized, row.syllable_count));
        indexedTimed = timedLookup(() => indexedLookup(entry.key, row.normalized, row.syllable_count));
      } else {
        indexedTimed = timedLookup(() => indexedLookup(entry.key, row.normalized, row.syllable_count));
        oldTimed = timedLookup(() => oldLookup(entry.key, row.normalized, row.syllable_count));
      }

      const oldIds = oldTimed.rows.map((candidate) => Number(candidate.id));
      const indexedIds = indexedTimed.rows.map((candidate) => Number(candidate.id));
      const comparison = compareOrderedIds(oldIds, indexedIds);
      for (const candidate of oldTimed.rows) oldUnion.add(Number(candidate.id));
      for (const candidate of indexedTimed.rows) {
        indexedUnion.add(Number(candidate.id));
        indexedWords.add(String(candidate.normalized));
      }
      queryOldMedianMs += Number(oldTimed.medianMs || 0);
      queryIndexedMedianMs += Number(indexedTimed.medianMs || 0);

      channels.push({
        kind: entry.kind,
        key: entry.key,
        old_count: oldIds.length,
        indexed_count: indexedIds.length,
        ordered_ids_equal: comparison.equal,
        first_mismatch_index: comparison.firstMismatchIndex,
        only_old_count: comparison.onlyExpected.length,
        only_indexed_count: comparison.onlyActual.length,
        only_old_sample: describeIds(db, comparison.onlyExpected),
        only_indexed_sample: describeIds(db, comparison.onlyActual),
        timing: {
          old_like_samples_ms: oldTimed.samplesMs,
          old_like_median_ms: oldTimed.medianMs,
          indexed_samples_ms: indexedTimed.samplesMs,
          indexed_median_ms: indexedTimed.medianMs,
          speedup_x: indexedTimed.medianMs > 0
            ? round(oldTimed.medianMs / indexedTimed.medianMs, 2)
            : null,
        },
      });
    }

    const unionComparison = compareOrderedIds(
      [...oldUnion].sort((a, b) => a - b),
      [...indexedUnion].sort((a, b) => a - b),
    );
    const retrievalEqual = channels.every((channel) => channel.ordered_ids_equal) && unionComparison.equal;
    if (!retrievalEqual) retrievalMismatchQueries.push(querySpec.word);

    const queryReport = {
      word: querySpec.word,
      found: true,
      normalized: row.normalized,
      ipa: row.ipa,
      syllables: Number(row.syllable_count),
      key_count: keys.length,
      retrieval_equal: retrievalEqual,
      union_old_ids: oldUnion.size,
      union_indexed_ids: indexedUnion.size,
      channels,
      timing: {
        old_like_channel_medians_total_ms: round(queryOldMedianMs),
        indexed_channel_medians_total_ms: round(queryIndexedMedianMs),
        speedup_x: queryIndexedMedianMs > 0 ? round(queryOldMedianMs / queryIndexedMedianMs, 2) : null,
      },
    };
    if (querySpec.word === 'Arbeitsweise') {
      queryReport.protected_hochzeitsreise_retrieved = indexedWords.has('hochzeitsreise');
    }
    queryReports.push(queryReport);
    console.log(
      `[writer-v5 equivalence] ${querySpec.word}: keys=${keys.length} equal=${retrievalEqual} `
      + `old=${round(queryOldMedianMs)}ms indexed=${round(queryIndexedMedianMs)}ms`,
    );

    if (!samplePlan.length && keys.length) {
      samplePlan = db.prepare(`
        EXPLAIN QUERY PLAN
        SELECT h.id
        FROM writer_anchor a
        JOIN hot h ON h.id=a.pronunciation_id
        WHERE a.anchor_key=?
      `).all(keys[0].key).map((entry) => String(entry.detail || ''));
      samplePlanUsesPrimaryKey = samplePlan.some(
        (detail) => /writer_anchor|\ba\b/i.test(detail)
          && /PRIMARY KEY|INDEX/i.test(detail)
          && /anchor_key/i.test(detail),
      );
    }
  }

  const morphologyReports = [];
  const morphologyRegressionFailures = [];
  for (const regression of plan.morphology_regressions || []) {
    const row = queryRow(regression.word);
    if (!row) {
      morphologyRegressionFailures.push(regression.id);
      morphologyReports.push({ id: regression.id, word: regression.word, found: false, pass: false });
      continue;
    }
    const formId = Number(db.prepare(`
      SELECT publish_order AS form_id
      FROM hot
      WHERE normalized=? AND pronunciation_preferred=1
      ORDER BY historical,usage_rank IS NULL,usage_rank,id
      LIMIT 1
    `).get(row.normalized)?.form_id || 0);
    const analyses = formId
      ? db.prepare('SELECT analysis_key FROM form_analysis WHERE form_id=? ORDER BY analysis_key').all(formId)
      : [];
    const positiveRows = formId
      ? db.prepare(`
          SELECT analysis_key,family_key,construction_rule,split_index,left_normalized,
                 right_normalized,right_head_analysis_key
          FROM writer_morphology_evidence
          WHERE form_id=?
          ORDER BY analysis_key
        `).all(formId)
      : [];
    const summary = materializedMorphologySummary(analyses, positiveRows);
    const evaluation = evaluateMorphologyRegression(regression, summary);
    if (!evaluation.pass) morphologyRegressionFailures.push(regression.id);
    morphologyReports.push({
      id: regression.id,
      word: regression.word,
      found: true,
      form_id: formId,
      analysis_count: summary.analysisCount,
      stored_positive_count: summary.storedPositiveCount,
      ...evaluation,
    });
  }

  const arbeitsweise = queryReports.find((row) => row.word === 'Arbeitsweise');
  const protectedHochzeitsreise = arbeitsweise?.protected_hochzeitsreise_retrieved === true;
  const oldTotalMs = queryReports.reduce(
    (sum, row) => sum + Number(row.timing?.old_like_channel_medians_total_ms || 0),
    0,
  );
  const indexedTotalMs = queryReports.reduce(
    (sum, row) => sum + Number(row.timing?.indexed_channel_medians_total_ms || 0),
    0,
  );
  const correctnessOk = missingQueries.length === 0
    && retrievalMismatchQueries.length === 0
    && morphologyRegressionFailures.length === 0
    && protectedHochzeitsreise
    && samplePlanUsesPrimaryKey;

  const report = {
    schema: 'rhymelab-writer-v5-equivalence-v1',
    generated_at: new Date().toISOString(),
    status: correctnessOk ? 'ok' : 'failed',
    database: dbPath,
    database_schema: meta.schema,
    benchmark_plan: planPath,
    benchmark_plan_version: plan.version,
    sampling: {
      candidate_pool: poolLimit,
      include_variants: includeVariants,
      include_historical: includeHistorical,
      timing_iterations: iterations,
    },
    storage_contract: {
      anchor_policy: meta.writer_anchor_policy || null,
      anchor_storage: meta.writer_anchor_storage || null,
      morphology_policy: meta.writer_morphology_policy || null,
      morphology_storage: meta.writer_morphology_storage || null,
    },
    retrieval: {
      query_count: (plan.queries || []).length,
      missing_queries: missingQueries,
      mismatch_queries: retrievalMismatchQueries,
      protected_arbeitsweise_hochzeitsreise: protectedHochzeitsreise,
      sample_query_plan: samplePlan,
      sample_query_plan_uses_primary_key: samplePlanUsesPrimaryKey,
      queries: queryReports,
    },
    morphology: {
      regression_count: (plan.morphology_regressions || []).length,
      failure_ids: morphologyRegressionFailures,
      regressions: morphologyReports,
    },
    performance: {
      scope: 'right-edge-retrieval-only; sum of per-channel medians across frozen writer-v2 queries',
      old_like_total_ms: round(oldTotalMs),
      indexed_total_ms: round(indexedTotalMs),
      speedup_x: indexedTotalMs > 0 ? round(oldTotalMs / indexedTotalMs, 2) : null,
      gate: 'informational_until_full_writer_runtime_benchmark',
    },
    accepted_runtime_rewired: false,
    writer_runtime_rewired: false,
    next_gate: correctnessOk
      ? 'Wire only the experimental v5 writer runtime to compact anchors/materialized morphology, then rerun Writer Page Benchmark v2.'
      : 'Do not rewire runtime. Resolve real-data retrieval or morphology equivalence failures first.',
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nWriter-v5 equivalence: ${report.status.toUpperCase()}`);
  console.log(`  retrieval mismatches: ${retrievalMismatchQueries.length}`);
  console.log(`  morphology failures:  ${morphologyRegressionFailures.length}`);
  console.log(`  Hochzeitsreise guard:  ${protectedHochzeitsreise}`);
  console.log(`  old LIKE total:        ${round(oldTotalMs)} ms`);
  console.log(`  indexed total:         ${round(indexedTotalMs)} ms`);
  console.log(`  retrieval speedup:     ${report.performance.speedup_x ?? 'n/a'}x`);
  console.log(`Wrote ${outPath}`);

  if (!correctnessOk) process.exitCode = 1;
} finally {
  db.close();
}
