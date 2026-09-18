#!/usr/bin/env node
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_STAGE_POLICY,
  ENTITY_STAGE_SCHEMA,
  createEntityStageStorage,
  createStageEntityWriter,
  createTaxonomyRawPrefilter,
  extractStageEntity,
  finalizeEntityStageStorage,
  openTextLines,
  parseWikidataDumpLine,
  stageStats,
} from './entity-staging-core.mjs';

const args = process.argv.slice(2);
let inputPath = '';
let taxonomyPath = 'sources/entity/wikidata-entity-taxonomy-v1.json';
let outPath = 'data/work/entity/wikidata-cultural-stage-v1.sqlite';
let reportPath = 'data/local/entity-wikidata-stage-v1-report.json';
let snapshotLabel = '';
let sourceUrl = '';
let inputSha256 = '';
let transactionSize = 50000;
let progressEvery = 250000;

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
  else if (arg === '--progress-every') progressEvery = Number.parseInt(args[++i] || '', 10) || progressEvery;
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
let linesRead = 0;
let jsonParsedLines = 0;
let prefilterSkippedLines = 0;
let malformedLines = 0;
let nonItemLines = 0;
let structuralRejected = 0;
let staged = 0;
let ordinal = 0;
let batchRows = 0;
const startedAt = Date.now();

try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY; PRAGMA locking_mode=EXCLUSIVE; PRAGMA cache_size=-131072;');
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
  const prefilter = createTaxonomyRawPrefilter(taxonomy);
  const writeStage = createStageEntityWriter(db);

  const printProgress = () => {
    const elapsedMs = Date.now() - startedAt;
    const elapsedSeconds = Math.max(0.001, elapsedMs / 1000);
    const linesPerSecond = linesRead / elapsedSeconds;
    const parsedPct = linesRead ? jsonParsedLines * 100 / linesRead : 0;
    console.error(
      '[wikidata-stage] '
      + `lines=${linesRead.toLocaleString('en-US')} `
      + `json=${jsonParsedLines.toLocaleString('en-US')} (${parsedPct.toFixed(2)}%) `
      + `staged=${staged.toLocaleString('en-US')} `
      + `rate=${Math.round(linesPerSecond).toLocaleString('en-US')} lines/s `
      + `elapsed=${(elapsedSeconds / 3600).toFixed(2)}h`,
    );
  };

  console.error(
    '[wikidata-stage] '
    + `decompressor=${stream.decompressor} `
    + `taxonomy-prefilter-qids=${prefilter.qids.length} `
    + `transaction-size=${transactionSize.toLocaleString('en-US')}`,
  );

  db.exec('BEGIN');
  try {
    for await (const line of stream.lines) {
      linesRead += 1;

      if (!prefilter.test(line)) {
        prefilterSkippedLines += 1;
        if (progressEvery > 0 && linesRead % progressEvery === 0) printProgress();
        continue;
      }

      jsonParsedLines += 1;
      let item;
      try {
        item = parseWikidataDumpLine(line);
      } catch {
        malformedLines += 1;
        if (progressEvery > 0 && linesRead % progressEvery === 0) printProgress();
        continue;
      }
      if (!item) {
        if (progressEvery > 0 && linesRead % progressEvery === 0) printProgress();
        continue;
      }
      if (item.type && item.type !== 'item') {
        nonItemLines += 1;
        if (progressEvery > 0 && linesRead % progressEvery === 0) printProgress();
        continue;
      }

      ordinal += 1;
      const record = extractStageEntity(item, taxonomy);
      if (!record) {
        structuralRejected += 1;
        if (progressEvery > 0 && linesRead % progressEvery === 0) printProgress();
        continue;
      }

      writeStage(record, ordinal);
      staged += 1;
      batchRows += 1;

      if (batchRows >= transactionSize) {
        db.exec('COMMIT; BEGIN;');
        batchRows = 0;
      }

      if (progressEvery > 0 && linesRead % progressEvery === 0) printProgress();
    }
    db.exec('COMMIT');
    await stream.done;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }

  printProgress();
  finalizeEntityStageStorage(db);
  db.exec('PRAGMA optimize;');
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
    lines_read: linesRead,
    json_parsed_lines: jsonParsedLines,
    prefilter_skipped_lines: prefilterSkippedLines,
    json_parse_share_pct: linesRead ? Math.round(jsonParsedLines * 10000 / linesRead) / 100 : 0,
    taxonomy_prefilter_qids: prefilter.qids,
    decompressor: stream.decompressor,
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
