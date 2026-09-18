#!/usr/bin/env node
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  QRANK_STAGE_SCHEMA,
  createQRankStageStorage,
  finalizeQRankStage,
  openTextLines,
  parseQRankLine,
  qrankStageStats,
} from './entity-staging-core.mjs';

const args = process.argv.slice(2);
let inputPath = '';
let outPath = 'data/work/entity/qrank-stage-v1.sqlite';
let reportPath = 'data/local/entity-qrank-stage-v1-report.json';
let snapshotLabel = '';
let sourceUrl = 'https://qrank.toolforge.org/download/qrank.csv.gz';
let inputSha256 = '';
let transactionSize = 50000;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--input') inputPath = args[++i] || '';
  else if (arg === '--out') outPath = args[++i] || outPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--snapshot') snapshotLabel = args[++i] || '';
  else if (arg === '--source-url') sourceUrl = args[++i] || sourceUrl;
  else if (arg === '--input-sha256') inputSha256 = args[++i] || '';
  else if (arg === '--transaction-size') transactionSize = Number.parseInt(args[++i] || '', 10) || transactionSize;
}

if (!inputPath || !snapshotLabel) {
  console.error(
    'Usage: node scripts/stage-qrank.mjs --input <qrank.csv[.gz]|-> --snapshot <label> '
    + '[--input-sha256 <checksum>] [--out data/work/entity/qrank-stage-v1.sqlite]',
  );
  process.exit(1);
}

if (inputPath !== '-') inputPath = resolve(inputPath);
outPath = resolve(outPath);
reportPath = resolve(reportPath);
await mkdir(dirname(outPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });
await rm(outPath, { force: true });

const db = new DatabaseSync(outPath);
let linesRead = 0;
let rowsInserted = 0;
let malformedRows = 0;
let batchRows = 0;
const startedAt = Date.now();

try {
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY;');
  createQRankStageStorage(db);
  const meta = db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  for (const [key, value] of Object.entries({
    schema: QRANK_STAGE_SCHEMA,
    snapshot_label: snapshotLabel,
    source_url: sourceUrl,
    input_sha256: inputSha256,
  })) meta.run(key, String(value ?? ''));

  const insert = db.prepare('INSERT INTO qrank_stage(qid,qrank) VALUES(?,?)');
  const stream = openTextLines(inputPath);
  db.exec('BEGIN');
  try {
    for await (const line of stream.lines) {
      linesRead += 1;
      const parsed = parseQRankLine(line, linesRead);
      if (!parsed) {
        if (String(line).trim() && !(linesRead === 1 && /^Entity\s*,/iu.test(String(line)))) malformedRows += 1;
        continue;
      }
      insert.run(parsed.qid, parsed.qrank);
      rowsInserted += 1;
      batchRows += 1;
      if (batchRows >= transactionSize) {
        db.exec('COMMIT; BEGIN;');
        batchRows = 0;
      }
    }
    db.exec('COMMIT');
    await stream.done;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }

  finalizeQRankStage(db);
  const stats = qrankStageStats(db);
  const databaseBytes = (await stat(outPath)).size;
  const elapsedMs = Date.now() - startedAt;
  const report = {
    schema: 'rhymelab-qrank-stage-report-v1',
    status: malformedRows === 0 ? 'ok' : 'ok_with_malformed_rows',
    built_at: new Date().toISOString(),
    qrank_schema: QRANK_STAGE_SCHEMA,
    snapshot_label: snapshotLabel,
    source_url: sourceUrl,
    input: inputPath,
    input_sha256: inputSha256 || null,
    database: outPath,
    database_bytes: databaseBytes,
    lines_read: linesRead,
    rows_inserted: rowsInserted,
    malformed_rows: malformedRows,
    elapsed_ms: elapsedMs,
    rows_per_second: elapsedMs > 0 ? Math.round(rowsInserted * 1000 / elapsedMs * 100) / 100 : null,
    stats,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
