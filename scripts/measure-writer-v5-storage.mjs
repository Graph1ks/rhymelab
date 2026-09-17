#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const dbPath = resolve(argValue('--db', 'data/local/rhymelab-v5.sqlite'));
const reportPath = resolve(argValue('--out', 'data/local/writer-v5-storage-report.json'));
const mib = (bytes) => Number((Number(bytes || 0) / 1024 / 1024).toFixed(2));
const pct = (bytes, total) => total > 0 ? Number((Number(bytes || 0) / total * 100).toFixed(2)) : 0;

try {
  await access(dbPath);
} catch {
  throw new Error(`Writer-v5 database not found: ${dbPath}`);
}

const dbFileBytes = Number((await stat(dbPath)).size || 0);
const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  const schema = db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value || null;
  if (schema !== 'rhymelab-local-db-v5') {
    throw new Error(`Storage audit requires rhymelab-local-db-v5; found ${schema || 'missing'}`);
  }

  const pageSize = Number(db.prepare('PRAGMA page_size').get()?.page_size || 0);
  const pageCount = Number(db.prepare('PRAGMA page_count').get()?.page_count || 0);
  const freePages = Number(db.prepare('PRAGMA freelist_count').get()?.freelist_count || 0);
  const logicalBytes = pageSize * pageCount;
  const liveLogicalBytes = pageSize * Math.max(0, pageCount - freePages);

  let rawObjects;
  try {
    rawObjects = db.prepare(`
      SELECT name,
             COUNT(*) AS pages,
             SUM(pgsize) AS bytes,
             SUM(payload) AS payload_bytes,
             SUM(unused) AS unused_bytes
      FROM dbstat
      GROUP BY name
      ORDER BY bytes DESC, name
    `).all();
  } catch (error) {
    throw new Error(
      `SQLite dbstat is unavailable in this Node/SQLite build; cannot attribute storage by object: ${error.message}`,
    );
  }

  const schemaRows = db.prepare(`
    SELECT type,name,tbl_name
    FROM sqlite_schema
    WHERE type IN ('table','index')
  `).all();
  const schemaByName = new Map(schemaRows.map((row) => [String(row.name), row]));

  const objects = rawObjects.map((row) => {
    const name = String(row.name);
    const meta = schemaByName.get(name) || null;
    const bytes = Number(row.bytes || 0);
    const payloadBytes = Number(row.payload_bytes || 0);
    const unusedBytes = Number(row.unused_bytes || 0);
    return {
      name,
      type: meta?.type || (name === 'sqlite_schema' ? 'system' : 'unknown'),
      table: meta?.tbl_name || (name === 'sqlite_schema' ? 'sqlite_schema' : null),
      pages: Number(row.pages || 0),
      bytes,
      mib: mib(bytes),
      pct_of_live_logical: pct(bytes, liveLogicalBytes),
      payload_bytes: payloadBytes,
      payload_mib: mib(payloadBytes),
      unused_bytes: unusedBytes,
      unused_mib: mib(unusedBytes),
    };
  });

  const byTable = new Map();
  for (const object of objects) {
    const table = object.table || object.name;
    const current = byTable.get(table) || {
      table,
      bytes: 0,
      payload_bytes: 0,
      unused_bytes: 0,
      objects: [],
    };
    current.bytes += object.bytes;
    current.payload_bytes += object.payload_bytes;
    current.unused_bytes += object.unused_bytes;
    current.objects.push(object.name);
    byTable.set(table, current);
  }

  const tables = [...byTable.values()]
    .map((row) => ({
      ...row,
      mib: mib(row.bytes),
      pct_of_live_logical: pct(row.bytes, liveLogicalBytes),
      payload_mib: mib(row.payload_bytes),
      unused_mib: mib(row.unused_bytes),
    }))
    .sort((a, b) => b.bytes - a.bytes || a.table.localeCompare(b.table));

  const bytesForTable = (table) => Number(byTable.get(table)?.bytes || 0);
  const categories = {
    writer_anchor: bytesForTable('writer_anchor'),
    writer_morphology_evidence: bytesForTable('writer_morphology_evidence'),
    lexical_form_analysis: bytesForTable('form_analysis'),
  };
  categories.other = Math.max(
    0,
    liveLogicalBytes
      - categories.writer_anchor
      - categories.writer_morphology_evidence
      - categories.lexical_form_analysis,
  );

  const categoryRows = Object.entries(categories)
    .map(([name, bytes]) => ({
      name,
      bytes,
      mib: mib(bytes),
      pct_of_live_logical: pct(bytes, liveLogicalBytes),
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const report = {
    schema: 'rhymelab-writer-v5-storage-report-v1',
    generated_at: new Date().toISOString(),
    database_schema: schema,
    database: dbPath,
    storage: {
      file_bytes: dbFileBytes,
      file_mib: mib(dbFileBytes),
      page_size: pageSize,
      page_count: pageCount,
      freelist_pages: freePages,
      logical_bytes: logicalBytes,
      logical_mib: mib(logicalBytes),
      live_logical_bytes: liveLogicalBytes,
      live_logical_mib: mib(liveLogicalBytes),
    },
    categories: categoryRows,
    tables,
    objects,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Writer-v5 SQLite storage audit: ${mib(liveLogicalBytes)} MiB live logical`);
  for (const row of categoryRows) {
    console.log(
      `  ${row.name.padEnd(30)} ${String(row.mib.toFixed(2)).padStart(10)} MiB  ${String(row.pct_of_live_logical.toFixed(2)).padStart(7)}%`,
    );
  }
  console.log('\nLargest table+index groups:');
  for (const row of tables.slice(0, 12)) {
    console.log(
      `  ${row.table.padEnd(30)} ${String(row.mib.toFixed(2)).padStart(10)} MiB  ${String(row.pct_of_live_logical.toFixed(2)).padStart(7)}%  [${row.objects.join(', ')}]`,
    );
  }
  console.log(`\nWrote ${reportPath}`);
} finally {
  db.close();
}
