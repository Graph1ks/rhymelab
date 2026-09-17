#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { WRITER_LEXICAL_DB_SCHEMA } from './writer-lexical-storage-v5-core.mjs';
import {
  WRITER_ANCHOR_CANDIDATE_BASIS,
  WRITER_ANCHOR_POLICY,
  WRITER_ANCHOR_STORAGE,
  createWriterAnchorStorage,
  insertWriterCandidateSuffixRows,
  prepareWriterAnchorInsert,
  writerAnchorLookupPlan,
} from './writer-anchor-materialization-v5-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const dbPath = resolve(argValue('--db', 'data/local/rhymelab-v5.sqlite'));
const reportPath = resolve(argValue('--report', 'data/local/writer-anchor-rematerialization-v5-report.json'));
const batchSize = Math.max(50, Math.min(5000, Number.parseInt(argValue('--batch-size', '2000'), 10) || 2000));
const mib = (bytes) => Number((Number(bytes || 0) / 1024 / 1024).toFixed(2));

try {
  await access(dbPath);
} catch {
  throw new Error(`Experimental writer database not found: ${dbPath}`);
}

function storageBytes(db) {
  const pageCount = Number(db.prepare('PRAGMA page_count').get()?.page_count || 0);
  const freePages = Number(db.prepare('PRAGMA freelist_count').get()?.freelist_count || 0);
  const pageSize = Number(db.prepare('PRAGMA page_size').get()?.page_size || 0);
  return {
    logicalBytes: pageCount * pageSize,
    liveLogicalBytes: Math.max(0, pageCount - freePages) * pageSize,
    pageCount,
    freePages,
    pageSize,
  };
}

const db = new DatabaseSync(dbPath);
try {
  const metaBefore = Object.fromEntries(
    db.prepare('SELECT key,value FROM meta').all().map((row) => [row.key, row.value]),
  );
  if (metaBefore.schema !== WRITER_LEXICAL_DB_SCHEMA) {
    throw new Error(`Anchor rematerialization requires ${WRITER_LEXICAL_DB_SCHEMA}; found ${metaBefore.schema || 'missing'}`);
  }
  if (metaBefore.writer_morphology_storage !== 'positive-evidence-compact-v2') {
    throw new Error('Expected already-materialized compact morphology evidence; refusing anchor-only migration.');
  }
  const morphologyRowsBefore = Number(
    db.prepare('SELECT COUNT(*) AS c FROM writer_morphology_evidence').get()?.c || 0,
  );

  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  const before = storageBytes(db);
  db.exec('DROP TABLE IF EXISTS writer_anchor;');
  createWriterAnchorStorage(db);
  const insert = prepareWriterAnchorInsert(db);

  let afterId = 0;
  let pronunciations = 0;
  let anchorRows = 0;
  let batches = 0;
  while (true) {
    const rows = db.prepare(`
      SELECT id,ipa
      FROM hot
      WHERE id>?
      ORDER BY id
      LIMIT ?
    `).all(afterId, batchSize);
    if (!rows.length) break;
    db.exec('BEGIN');
    try {
      for (const row of rows) {
        anchorRows += insertWriterCandidateSuffixRows(db, Number(row.id), row.ipa, insert);
        pronunciations += 1;
        afterId = Number(row.id);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    batches += 1;
    console.log(
      `[writer-v5 anchors-only] batches=${batches} pronunciations=${pronunciations.toLocaleString('de-DE')} rows=${anchorRows.toLocaleString('de-DE')}`,
    );
  }

  const sampleAnchor = db.prepare(`
    SELECT anchor_key
    FROM writer_anchor
    ORDER BY length(anchor_key) DESC, anchor_key
    LIMIT 1
  `).get()?.anchor_key || null;
  const lookupPlan = sampleAnchor
    ? writerAnchorLookupPlan(db, sampleAnchor).map((row) => String(row.detail || ''))
    : [];
  const usesPrimaryKey = lookupPlan.some(
    (detail) => detail.includes('USING PRIMARY KEY') && detail.includes('anchor_key=?'),
  );

  const meta = db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)');
  meta.run('writer_anchor_policy', WRITER_ANCHOR_POLICY);
  meta.run('writer_anchor_storage', WRITER_ANCHOR_STORAGE);
  meta.run('writer_anchor_candidate_basis', WRITER_ANCHOR_CANDIDATE_BASIS);
  meta.run('writer_anchor_rows', String(anchorRows));

  db.exec('ANALYZE writer_anchor;');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const after = storageBytes(db);
  const morphologyRowsAfter = Number(
    db.prepare('SELECT COUNT(*) AS c FROM writer_morphology_evidence').get()?.c || 0,
  );
  if (morphologyRowsAfter !== morphologyRowsBefore) {
    throw new Error(`Morphology table changed during anchor-only migration: ${morphologyRowsBefore} -> ${morphologyRowsAfter}`);
  }

  const report = {
    schema: 'rhymelab-writer-anchor-rematerialization-v5-report-v1',
    generated_at: new Date().toISOString(),
    database_schema: metaBefore.schema,
    anchor_policy: WRITER_ANCHOR_POLICY,
    anchor_storage: WRITER_ANCHOR_STORAGE,
    anchor_candidate_basis: WRITER_ANCHOR_CANDIDATE_BASIS,
    pronunciations_processed: pronunciations,
    anchor_rows: anchorRows,
    batches,
    morphology_rows_before: morphologyRowsBefore,
    morphology_rows_after: morphologyRowsAfter,
    morphology_untouched: morphologyRowsAfter === morphologyRowsBefore,
    sample_query_plan: lookupPlan,
    sample_query_plan_uses_primary_key: usesPrimaryKey,
    storage: {
      live_mib_before: mib(before.liveLogicalBytes),
      live_mib_after: mib(after.liveLogicalBytes),
      live_mib_delta: mib(after.liveLogicalBytes - before.liveLogicalBytes),
      freelist_pages_after: after.freePages,
    },
    accepted_runtime_rewired: false,
    writer_runtime_rewired: false,
    next_gate: 'Rerun writer-v5 real-data equivalence before any runtime switch.',
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nWriter-v5 anchors rematerialized: ${anchorRows.toLocaleString('de-DE')} rows`);
  console.log(`  candidate basis: ${WRITER_ANCHOR_CANDIDATE_BASIS}`);
  console.log(`  morphology untouched: ${report.morphology_untouched}`);
  console.log(`  primary-key plan: ${usesPrimaryKey}`);
  console.log(`  live SQLite: ${report.storage.live_mib_after} MiB`);
  console.log(`Wrote ${reportPath}`);

  if (!usesPrimaryKey || !report.morphology_untouched) process.exitCode = 1;
} finally {
  db.close();
}
