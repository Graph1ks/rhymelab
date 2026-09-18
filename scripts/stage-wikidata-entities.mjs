#!/usr/bin/env node
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_STAGE_POLICY,
  ENTITY_STAGE_SCHEMA,
  createEntityStageStorage,
  extractStageEntity,
  openTextLines,
  parseWikidataDumpLine,
  stageStats,
  writeStageEntity,
} from './entity-staging-core.mjs';

const args = process.argv.slice(2);
let inputPath = '';
let taxonomyPath = 'sources/entity/wikidata-entity-taxonomy-v1.json';
let outPath = 'data/work/entity/wikidata-cultural-stage-v1.sqlite';
let reportPath = 'data/local/entity-wikidata-stage-v1-report.json';
let snapshotLabel = '';
let sourceUrl = '';
let inputSha256 = '';
let transactionSize = 10000;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--input') inputPath = args[++i] || '';
  else if (arg === '--taxonomy') taxonomyPath = args[++i] || taxonomyPath;
  else if (arg === '--out') outPath = args[++i] || outPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--snapshot') snapshotLabel = args[++i] || '';
  else if (arg === '--source-url') sourceUrl = args[++i] || '';
  else if (arg === '--input-sha256') inputSha256 = args[++i] || '';
  else if (arg === '--transaction-size') transactionSize = Number.parseInt(args[++i] || '', 10) || transactionSize;
}

if (!inputPath || !snapshotLabel) {
  console.error(
    'Usage: node scripts/stage-wikidata-entities.mjs '
    + '--input <wikidata.json[.gz|.bz2]|-> --snapshot <YYYYMMDD-or-pinned-label> '
    + '[--taxonomy sources/entity/wikidata-entity-taxonomy-v1.json] '
    + '[--input-sha256 <official checksum>] '
    + '[--out data/work/entity/wikidata-cultural-stage-v1.sqlite]',
  );
  process.exit(1);
}

if (inputPath !== '-') inputPath = resolve(inputPath);
taxonomyPath = resolve(taxonomyPath);
outPath = resolve(outPath);
reportPath = resolve(reportPath);

await mkdir(dirname(outPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });
await rm(outPath, { force: true });

const taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8'));
if (taxonomy.schema !== 'rhymelab-wikidata-entity-taxonomy-v1') {
  throw new Error(`Unexpected taxonomy schema: ${taxonomy.schema}`);
}

const db = new DatabaseSync(outPath);
let parsedLines = 0;
let malformedLines = 0;
let nonItemLines = 0;
let structuralRejected = 0;
let staged = 0;
let ordinal = 0;
let batchRows = 0;
const startedAt = Date.now();

try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;');
  createEntityStageStorage(db);

  const meta = db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  for (const [key, value] of Object.entries({
    schema: ENTITY_STAGE_SCHEMA,
    policy: ENTITY_STAGE_POLICY,
    snapshot_label: snapshotLabel,
    source_url: sourceUrl,
    input_sha256: inputSha256,
    taxonomy_schema: taxonomy.schema,
    taxonomy_policy: taxonomy.policy,
  })) meta.run(key, String(value ?? ''));

  const stream = openTextLines(inputPath);
  db.exec('BEGIN');
  try {
    for await (const line of stream.lines) {
      parsedLines += 1;
      let item;
      try {
        item = parseWikidataDumpLine(line);
      } catch {
        malformedLines += 1;
        continue;
      }
      if (!item) continue;
      if (item.type && item.type !== 'item') {
        nonItemLines += 1;
        continue;
      }
      ordinal += 1;
      const record = extractStageEntity(item, taxonomy);
      if (!record) {
        structuralRejected += 1;
        continue;
      }
      writeStageEntity(db, record, ordinal);
      staged += 1;
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

  db.exec('ANALYZE; PRAGMA optimize;');
  const stats = stageStats(db);
  const databaseBytes = (await stat(outPath)).size;
  const elapsedMs = Date.now() - startedAt;
  const report = {
    schema: 'rhymelab-wikidata-entity-stage-report-v1',
    status: malformedLines === 0 ? 'ok' : 'ok_with_malformed_lines',
    built_at: new Date().toISOString(),
    stage_schema: ENTITY_STAGE_SCHEMA,
    stage_policy: ENTITY_STAGE_POLICY,
    snapshot_label: snapshotLabel,
    source_url: sourceUrl || null,
    input: inputPath,
    input_sha256: inputSha256 || null,
    taxonomy: taxonomyPath,
    taxonomy_schema: taxonomy.schema,
    taxonomy_policy: taxonomy.policy,
    database: outPath,
    database_bytes: databaseBytes,
    parsed_lines: parsedLines,
    malformed_lines: malformedLines,
    non_item_lines: nonItemLines,
    item_ordinal_count: ordinal,
    structural_rejected: structuralRejected,
    staged_entities: staged,
    elapsed_ms: elapsedMs,
    entities_per_second: elapsedMs > 0 ? Math.round(staged * 1000 / elapsedMs * 100) / 100 : null,
    stats,
    qrank_joined: false,
    runtime_rewired: false,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
