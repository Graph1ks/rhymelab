#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  ENTITY_DB_SCHEMA,
  snapshotIdForEntitySource,
} from './entity-lexicon-core.mjs';
import { openTextLines } from './entity-staging-core.mjs';
import {
  parseSparqlTsvLine,
  qidFromEntityTerm,
} from './qlever-entity-source-core.mjs';
import {
  WIKIDATA_P898_REVIEW_STATE,
  WIKIDATA_P898_SOURCE_KIND,
  WIKIDATA_P898_SOURCE_POLICY,
  WIKIDATA_P898_SOURCE_SCHEMA,
  normalizeP898Ipa,
  p898LocaleFromLanguageQid,
  selectP898TargetName,
} from './entity-wikidata-p898-core.mjs';

const args = process.argv.slice(2);
let entityDbPath = 'data/local/rhymelab-entities-v1.sqlite';
let sourceReportPath = 'data/local/entity-wikidata-p898-source-report.json';
let reportPath = 'data/local/entity-wikidata-p898-materialization-report.json';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--entities') entityDbPath = args[++i] || entityDbPath;
  else if (arg === '--source-report') sourceReportPath = args[++i] || sourceReportPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
}

entityDbPath = resolve(entityDbPath);
sourceReportPath = resolve(sourceReportPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function upsertMeta(db, key, value) {
  db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, String(value));
}

const sourceReport = JSON.parse(await readFile(sourceReportPath, 'utf8'));
if (
  sourceReport.schema !== WIKIDATA_P898_SOURCE_SCHEMA
  || sourceReport.policy !== WIKIDATA_P898_SOURCE_POLICY
  || sourceReport.status !== 'ok'
) {
  throw new Error('Wikidata P898 source report is missing or incompatible.');
}

const artifactPath = resolve(sourceReport.artifact);
const artifactSha256 = await sha256File(artifactPath);
if (artifactSha256 !== sourceReport.gzip_sha256) {
  throw new Error(
    `P898 artifact checksum mismatch: expected ${sourceReport.gzip_sha256}, got ${artifactSha256}`,
  );
}

const db = new DatabaseSync(entityDbPath);
try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  const schema = db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  if (schema !== ENTITY_DB_SCHEMA) {
    throw new Error(`Unexpected entity database schema: ${schema || 'missing'}`);
  }

  const snapshot = {
    source: 'wikidata-p898-qlever',
    snapshotLabel: sourceReport.retrieval_label,
    upstreamUrl: sourceReport.endpoint,
    artifactSha256,
    licenseId: sourceReport.source_license || 'CC0-1.0',
    importerVersion: WIKIDATA_P898_SOURCE_POLICY,
    metadata: {
      query_sha256: sourceReport.query_sha256,
      retrieval_started_at: sourceReport.retrieval_started_at,
      retrieval_finished_at: sourceReport.retrieval_finished_at,
      rows: sourceReport.rows,
      taxonomy_sha256: sourceReport.taxonomy_sha256,
      freshness_semantics: sourceReport.freshness_semantics,
    },
  };
  const snapshotId = snapshotIdForEntitySource(snapshot);
  db.prepare(`
    INSERT OR IGNORE INTO entity_source_snapshot(
      snapshot_id,source,snapshot_label,upstream_url,artifact_sha256,
      license_id,importer_version,metadata_json
    ) VALUES(?,?,?,?,?,?,?,?)
  `).run(
    snapshotId,
    snapshot.source,
    snapshot.snapshotLabel,
    snapshot.upstreamUrl,
    snapshot.artifactSha256,
    snapshot.licenseId,
    snapshot.importerVersion,
    JSON.stringify(snapshot.metadata),
  );

  const getEntity = db.prepare('SELECT entity_id FROM entity WHERE qid=?');
  const getNames = db.prepare(`
    SELECT name_id,surface,normalized,language,name_kind,preferred
    FROM entity_name
    WHERE entity_id=?
    ORDER BY preferred DESC,language,name_kind,name_id
  `);
  const insertPronunciation = db.prepare(`
    INSERT INTO entity_pronunciation(
      name_id,locale,pronunciation_role,ipa,preferred,source_kind,source_record,
      generated,model_id,confidence,review_state
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `);

  const previousRows = Number(db.prepare(`
    SELECT COUNT(*) AS c
    FROM entity_pronunciation
    WHERE source_kind=? AND review_state=?
  `).get(WIKIDATA_P898_SOURCE_KIND, WIKIDATA_P898_REVIEW_STATE).c || 0);
  const previousAnalyzedRows = Number(db.prepare(`
    SELECT COUNT(*) AS c
    FROM entity_pronunciation p
    WHERE p.source_kind=? AND p.review_state=?
      AND EXISTS (
        SELECT 1 FROM entity_phonetic_analysis a
        WHERE a.pronunciation_id=p.pronunciation_id
      )
  `).get(WIKIDATA_P898_SOURCE_KIND, WIKIDATA_P898_REVIEW_STATE).c || 0);
  if (previousAnalyzedRows > 0) {
    throw new Error(
      `Refusing to replace ${previousAnalyzedRows} P898 evidence rows that already have phonetic analyses.`,
    );
  }

  db.exec('BEGIN');
  try {
    db.prepare(`
      DELETE FROM entity_pronunciation
      WHERE source_kind=? AND review_state=?
    `).run(WIKIDATA_P898_SOURCE_KIND, WIKIDATA_P898_REVIEW_STATE);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const stream = openTextLines(artifactPath);
  let header = null;
  let sourceRows = 0;
  let retainedRows = 0;
  let inserted = 0;
  let duplicateRows = 0;
  let invalidIpa = 0;
  let unmapped = 0;
  const strategyCounts = new Map();
  const localeCounts = new Map();
  const languageQidCounts = new Map();
  const seen = new Set();

  db.exec('BEGIN');
  try {
    for await (const line of stream.lines) {
      if (header === null) {
        header = String(line).replace(/\r$/u, '').split('\t')
          .map((value) => value.replace(/^\?/u, ''));
        continue;
      }
      if (!line) continue;
      sourceRows += 1;
      const values = parseSparqlTsvLine(line);
      const row = {};
      for (let i = 0; i < header.length; i += 1) row[header[i]] = values[i] ?? null;

      const qid = qidFromEntityTerm(row.item);
      if (!qid) continue;
      const entity = getEntity.get(qid);
      if (!entity) continue;
      retainedRows += 1;

      const ipa = normalizeP898Ipa(row.ipa);
      if (!ipa) {
        invalidIpa += 1;
        continue;
      }

      const languageQid = qidFromEntityTerm(row.language);
      const varietyQid = qidFromEntityTerm(row.variety);
      if (languageQid) {
        languageQidCounts.set(languageQid, (languageQidCounts.get(languageQid) || 0) + 1);
      }
      const names = getNames.all(entity.entity_id);
      const selection = selectP898TargetName(names, {
        appliesName: row.appliesName,
        appliesNameLanguage: row.appliesNameLanguage,
        languageQid,
      });
      strategyCounts.set(
        selection.strategy,
        (strategyCounts.get(selection.strategy) || 0) + 1,
      );
      if (!selection.name) {
        unmapped += 1;
        continue;
      }

      const locale = p898LocaleFromLanguageQid(languageQid);
      const signature = [
        selection.name.name_id,
        locale || '',
        ipa,
        row.statement || '',
      ].join('\u001f');
      if (seen.has(signature)) {
        duplicateRows += 1;
        continue;
      }
      seen.add(signature);

      const sourceRecord = {
        policy: WIKIDATA_P898_SOURCE_POLICY,
        snapshot_id: snapshotId,
        qid,
        statement: row.statement || null,
        language_qid: languageQid,
        pronunciation_variety_qid: varietyQid,
        applies_to_name: row.appliesName || null,
        applies_to_name_language: row.appliesNameLanguage || null,
        mapping_strategy: selection.strategy,
      };

      insertPronunciation.run(
        selection.name.name_id,
        locale,
        locale ? `${locale}-source-attested` : 'source-attested',
        ipa,
        0,
        WIKIDATA_P898_SOURCE_KIND,
        JSON.stringify(sourceRecord),
        0,
        null,
        1,
        WIKIDATA_P898_REVIEW_STATE,
      );
      inserted += 1;
      const localeKey = locale || 'unprofiled';
      localeCounts.set(localeKey, (localeCounts.get(localeKey) || 0) + 1);

      if (inserted % 10000 === 0) {
        console.error(
          `[entity-p898] inserted ${inserted.toLocaleString()} source-attested IPA rows`,
        );
        db.exec('COMMIT');
        db.exec('BEGIN');
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    await stream.done;
  }

  if (header === null) throw new Error('P898 source artifact is empty.');
  if (sourceRows !== Number(sourceReport.rows)) {
    throw new Error(
      `P898 row-count mismatch: expected ${sourceReport.rows}, got ${sourceRows}`,
    );
  }

  const namesWithEvidence = Number(db.prepare(`
    SELECT COUNT(DISTINCT name_id) AS c
    FROM entity_pronunciation
    WHERE source_kind=? AND review_state=?
  `).get(WIKIDATA_P898_SOURCE_KIND, WIKIDATA_P898_REVIEW_STATE).c || 0);
  const preferredNamesWithEvidence = Number(db.prepare(`
    SELECT COUNT(DISTINCT p.name_id) AS c
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    WHERE p.source_kind=? AND p.review_state=? AND n.preferred=1
  `).get(WIKIDATA_P898_SOURCE_KIND, WIKIDATA_P898_REVIEW_STATE).c || 0);

  const categoryTier = db.prepare(`
    SELECT
      c.category,
      c.category_tier AS tier,
      COUNT(DISTINCT p.name_id) AS names_with_p898
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    JOIN entity_category c USING(entity_id)
    WHERE p.source_kind=? AND p.review_state=? AND n.preferred=1
    GROUP BY c.category,c.category_tier
    ORDER BY c.category,
      CASE c.category_tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END
  `).all(WIKIDATA_P898_SOURCE_KIND, WIKIDATA_P898_REVIEW_STATE)
    .map((row) => ({
      category: row.category,
      tier: row.tier,
      preferred_names_with_p898: Number(row.names_with_p898 || 0),
    }));

  upsertMeta(db, 'entity_wikidata_p898_policy', WIKIDATA_P898_SOURCE_POLICY);
  upsertMeta(db, 'entity_wikidata_p898_snapshot_id', snapshotId);
  upsertMeta(db, 'entity_wikidata_p898_rows', inserted);
  upsertMeta(db, 'entity_wikidata_p898_runtime_eligible', 0);
  db.exec('ANALYZE; PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE);');

  const reportBase = {
    schema: 'rhymelab-wikidata-p898-materialization-report-v1',
    status: 'ok',
    policy: WIKIDATA_P898_SOURCE_POLICY,
    entity_database: entityDbPath,
    source_report: sourceReportPath,
    source_artifact: artifactPath,
    source_snapshot_id: snapshotId,
    source_rows: sourceRows,
    retained_entity_rows: retainedRows,
    previous_unprofiled_rows_replaced: previousRows,
    inserted_pronunciations: inserted,
    duplicate_rows: duplicateRows,
    invalid_ipa_rows: invalidIpa,
    unmapped_rows: unmapped,
    names_with_source_evidence: namesWithEvidence,
    preferred_names_with_source_evidence: preferredNamesWithEvidence,
    mapping_strategy_counts: Object.fromEntries(
      [...strategyCounts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en')),
    ),
    locale_counts: Object.fromEntries(
      [...localeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en')),
    ),
    language_qid_counts: Object.fromEntries(
      [...languageQidCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en')),
    ),
    preferred_name_evidence_by_category_tier: categoryTier,
    review_state: WIKIDATA_P898_REVIEW_STATE,
    runtime_eligible_rows: 0,
    runtime_changed: false,
    generated_g2p_used: false,
    database_bytes: (await stat(entityDbPath)).size,
  };
  const semanticFingerprint = createHash('sha256')
    .update(JSON.stringify(reportBase))
    .digest('hex');
  const report = { ...reportBase, semantic_fingerprint: semanticFingerprint };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.error('');
  console.error('[entity-p898] COMPLETE');
  console.error(`  source rows                ${sourceRows.toLocaleString()}`);
  console.error(`  retained rows              ${retainedRows.toLocaleString()}`);
  console.error(`  source IPA rows inserted   ${inserted.toLocaleString()}`);
  console.error(`  names with P898 evidence   ${namesWithEvidence.toLocaleString()}`);
  console.error(`  unmapped rows              ${unmapped.toLocaleString()}`);
  console.error('  runtime rows promoted      0 (intentional)');
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
