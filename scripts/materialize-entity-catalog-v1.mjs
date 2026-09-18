#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_DB_SCHEMA,
  createEntityStorage,
  popularityTier,
  snapshotIdForEntitySource,
} from './entity-lexicon-core.mjs';
import {
  ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY,
  evaluateRankedEntityCutRows,
  rankHybridV2EntityCutRows,
} from './entity-cut-hybrid-core.mjs';

export const ACCEPTED_ENTITY_CUT_V2_FINGERPRINT =
  '337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201';

const args = process.argv.slice(2);
let stagePath = 'data/work/entity/wikidata-cultural-stage-v1.sqlite';
let taxonomyPath = 'sources/entity/wikidata-entity-taxonomy-v1.json';
let cutReportPath = 'data/local/entity-cut-hybrid-v2-candidate-report.json';
let outPath = 'data/local/rhymelab-entities-v1.sqlite';
let reportPath = 'data/local/entity-catalog-v1-report.json';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--stage') stagePath = args[++i] || stagePath;
  else if (arg === '--taxonomy') taxonomyPath = args[++i] || taxonomyPath;
  else if (arg === '--cut-report') cutReportPath = args[++i] || cutReportPath;
  else if (arg === '--out') outPath = args[++i] || outPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
}

stagePath = resolve(stagePath);
taxonomyPath = resolve(taxonomyPath);
cutReportPath = resolve(cutReportPath);
outPath = resolve(outPath);
reportPath = resolve(reportPath);
await mkdir(dirname(outPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });

const [taxonomyRaw, cutReportRaw] = await Promise.all([
  readFile(taxonomyPath, 'utf8'),
  readFile(cutReportPath, 'utf8'),
]);
const taxonomy = JSON.parse(taxonomyRaw);
const cutReport = JSON.parse(cutReportRaw);

if (cutReport.status !== 'ok') {
  throw new Error('Entity cut v2 report is not accepted.');
}
if (cutReport.semantic_fingerprint !== ACCEPTED_ENTITY_CUT_V2_FINGERPRINT) {
  throw new Error(
    `Entity cut v2 fingerprint mismatch: expected ${ACCEPTED_ENTITY_CUT_V2_FINGERPRINT}, got ${cutReport.semantic_fingerprint || 'missing'}`,
  );
}
if (cutReport.v2_policy !== ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY) {
  throw new Error(
    `Entity cut v2 policy mismatch: expected ${ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY}, got ${cutReport.v2_policy || 'missing'}`,
  );
}

const priorityByCategory = new Map(
  (taxonomy.categories || []).map((row) => [row.category, Number(row.priority ?? 9999)]),
);
const protectedQids = new Set((taxonomy.protected_sentinels || []).map((row) => row.qid));

function compareCategoryMembership(a, b) {
  return Number(priorityByCategory.get(a.category) ?? 9999)
    - Number(priorityByCategory.get(b.category) ?? 9999)
    || a.category.localeCompare(b.category, 'en');
}

function hashRows(hash, rows) {
  for (const row of rows) hash.update(JSON.stringify(row));
}

function sourceSnapshotFromStage(stageDb) {
  const rows = stageDb.prepare('SELECT key,value FROM meta ORDER BY key').all();
  const meta = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const snapshot = {
    source: 'wikidata-qlever-stage',
    snapshotLabel: meta.source_snapshot_label
      || meta.retrieval_label
      || meta.schema
      || 'wikidata-cultural-stage-v1',
    upstreamUrl: null,
    artifactSha256: meta.source_sha256 || null,
    licenseId: 'CC0-1.0',
    importerVersion: ENTITY_DB_SCHEMA,
    metadata: {
      stage_meta: meta,
      cut_policy: ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY,
      cut_fingerprint: ACCEPTED_ENTITY_CUT_V2_FINGERPRINT,
      taxonomy_policy: taxonomy.policy || null,
    },
  };
  return { snapshot, snapshotId: snapshotIdForEntitySource(snapshot) };
}

const stageDb = new DatabaseSync(stagePath, { readOnly: true });
stageDb.exec('PRAGMA query_only=ON;');

const categoryRows = stageDb.prepare(
  'SELECT DISTINCT category FROM entity_stage_category ORDER BY category',
).all().map((row) => row.category);

const evidenceStatement = stageDb.prepare(`
  SELECT
    e.qid,e.qrank,e.wikipedia_sitelink_count,e.has_dewiki,e.has_enwiki,
    e.external_id_count,e.statement_count,c.retention_percentile_floor
  FROM entity_stage_category c
  JOIN entity_stage e USING(qid)
  WHERE c.category=?
`);

const membershipsByQid = new Map();
const retainedQids = new Set();
const categorySummary = [];

for (const category of categoryRows) {
  const rows = evidenceStatement.all(category).map((row) => ({
    ...row,
    qrank: row.qrank == null ? null : Number(row.qrank),
    wikipedia_sitelink_count: Number(row.wikipedia_sitelink_count || 0),
    has_dewiki: Number(row.has_dewiki || 0),
    has_enwiki: Number(row.has_enwiki || 0),
    external_id_count: Number(row.external_id_count || 0),
    statement_count: Number(row.statement_count || 0),
    retention_percentile_floor: Number(row.retention_percentile_floor || 0),
  }));
  if (!rows.length) continue;
  const floor = rows[0].retention_percentile_floor;
  const evaluated = evaluateRankedEntityCutRows(
    rankHybridV2EntityCutRows(rows),
    floor,
    protectedQids,
  );

  let kept = 0;
  for (const row of evaluated) {
    const list = membershipsByQid.get(row.qid) || [];
    list.push({
      category,
      scorePpm: Number(row.candidate_score_ppm || 0),
      rank: Number(row.rank || 0),
      percentile: Number(row.percentile || 0),
      tier: row.tier,
      floor,
      retained: row.keep ? 1 : 0,
    });
    membershipsByQid.set(row.qid, list);
    if (row.keep) {
      retainedQids.add(row.qid);
      kept += 1;
    }
  }

  const anchored = (cutReport.categories || []).find((row) => row.category === category);
  const expectedKept = Number(anchored?.v2?.kept ?? -1);
  const expectedMissing = Number(anchored?.v2?.kept_without_qrank ?? -1);
  const actualMissing = evaluated.filter((row) => row.keep && row.qrank == null).length;
  if (kept !== expectedKept || actualMissing !== expectedMissing) {
    throw new Error(
      `Entity cut reproduction mismatch for ${category}: kept ${kept}/${expectedKept}, missing-QRank kept ${actualMissing}/${expectedMissing}`,
    );
  }
  categorySummary.push({
    category,
    candidates: rows.length,
    kept,
    kept_without_qrank: actualMissing,
  });
}

if (retainedQids.size !== Number(cutReport.v2_distinct_retained_entities)) {
  throw new Error(
    `Distinct retained entity mismatch: recomputed ${retainedQids.size}, report ${cutReport.v2_distinct_retained_entities}`,
  );
}

await rm(outPath, { force: true });
const outDb = new DatabaseSync(outPath);
try {
  outDb.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=OFF;
    PRAGMA synchronous=OFF;
    PRAGMA temp_store=MEMORY;
    PRAGMA locking_mode=EXCLUSIVE;
  `);
  createEntityStorage(outDb);

  const { snapshot, snapshotId } = sourceSnapshotFromStage(stageDb);
  outDb.prepare(`
    INSERT INTO entity_source_snapshot(
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

  const getEntity = stageDb.prepare('SELECT * FROM entity_stage WHERE qid=?');
  const getNames = stageDb.prepare(`
    SELECT language,surface,normalized,name_kind,preferred
    FROM entity_stage_name
    WHERE qid=?
    ORDER BY preferred DESC,language,normalized,surface
  `);
  const getExternalIds = stageDb.prepare(`
    SELECT property_id,system,value
    FROM entity_stage_external_id
    WHERE qid=?
    ORDER BY system,value
  `);

  const insertEntity = outDb.prepare(`
    INSERT INTO entity(
      qid,primary_category,description_de,description_en,fixture_only,
      popularity_score,popularity_de,popularity_en,popularity_percentile,
      popularity_tier,source_snapshot_id
    ) VALUES(?,?,?,?,0,?,?,?,?,?,?)
  `);
  const insertCategory = outDb.prepare(`
    INSERT INTO entity_category(
      entity_id,category,category_score,category_rank,category_percentile,
      category_tier,retention_percentile_floor,retained_by_category
    ) VALUES(?,?,?,?,?,?,?,?)
  `);
  const insertName = outDb.prepare(`
    INSERT INTO entity_name(
      entity_id,surface,normalized,language,script,name_kind,
      preferred,searchable,source_kind,source_record
    ) VALUES(?,?,?,?,?,?,?,?,?,?)
  `);
  const insertFts = outDb.prepare(`
    INSERT INTO entity_name_fts(surface,normalized,entity_id,name_id,language)
    VALUES(?,?,?,?,?)
  `);
  const insertEvidence = outDb.prepare(`
    INSERT INTO entity_popularity_evidence(
      entity_id,policy,qrank_score,qrank_raw,candidate_score_ppm,
      wikipedia_sitelink_count,has_dewiki,has_enwiki,external_id_count,
      statement_count,pageviews_de_score,pageviews_en_score
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertExternal = outDb.prepare(`
    INSERT INTO entity_external_id(entity_id,property_id,system,value)
    VALUES(?,?,?,?)
  `);
  const insertMeta = outDb.prepare('INSERT INTO meta(key,value) VALUES(?,?)');

  const qids = [...retainedQids].sort((a, b) => a.localeCompare(b, 'en'));
  const fingerprint = createHash('sha256');

  outDb.exec('BEGIN');
  try {
    for (const qid of qids) {
      const stage = getEntity.get(qid);
      if (!stage) throw new Error(`Missing staged entity for retained QID ${qid}`);
      const memberships = (membershipsByQid.get(qid) || []).sort(compareCategoryMembership);
      const retainedMemberships = memberships.filter((row) => row.retained);
      const displayMembership = retainedMemberships[0] || memberships[0];
      const bestMembership = [...memberships].sort((a, b) =>
        b.percentile - a.percentile || b.scorePpm - a.scorePpm || compareCategoryMembership(a, b)
      )[0];
      const popularityScore = Number(bestMembership?.scorePpm || 0) / 1_000_000;
      const popularityPercentile = Number(bestMembership?.percentile || 0);
      const popularityTierValue = popularityTier(popularityPercentile);

      const inserted = insertEntity.run(
        qid,
        displayMembership?.category || stage.primary_category,
        stage.description_de,
        stage.description_en,
        popularityScore,
        null,
        null,
        popularityPercentile,
        popularityTierValue,
        snapshotId,
      );
      const entityId = Number(inserted.lastInsertRowid);

      for (const membership of memberships) {
        insertCategory.run(
          entityId,
          membership.category,
          membership.scorePpm / 1_000_000,
          membership.rank,
          membership.percentile,
          membership.tier,
          membership.floor,
          membership.retained,
        );
      }

      const names = getNames.all(qid);
      for (const name of names) {
        const nameInserted = insertName.run(
          entityId,
          name.surface,
          name.normalized,
          name.language,
          'auto',
          name.name_kind,
          Number(name.preferred || 0),
          1,
          'wikidata_qlever',
          qid,
        );
        const nameId = Number(nameInserted.lastInsertRowid);
        insertFts.run(name.surface, name.normalized, entityId, nameId, name.language);
      }

      insertEvidence.run(
        entityId,
        ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY,
        null,
        stage.qrank == null ? null : Number(stage.qrank),
        Number(bestMembership?.scorePpm || 0),
        Number(stage.wikipedia_sitelink_count || 0),
        Number(stage.has_dewiki || 0),
        Number(stage.has_enwiki || 0),
        Number(stage.external_id_count || 0),
        Number(stage.statement_count || 0),
        null,
        null,
      );

      for (const external of getExternalIds.all(qid)) {
        insertExternal.run(entityId, external.property_id, external.system, external.value);
      }

      hashRows(fingerprint, [{
        qid,
        primary_category: displayMembership?.category || stage.primary_category,
        score_ppm: Number(bestMembership?.scorePpm || 0),
        percentile: popularityPercentile,
        tier: popularityTierValue,
      }, memberships, names]);
    }

    const meta = {
      schema: ENTITY_DB_SCHEMA,
      taxonomy_policy: taxonomy.policy || 'wikidata-cultural-entity-taxonomy-v1',
      popularity_policy: ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY,
      popularity_cut_fingerprint: ACCEPTED_ENTITY_CUT_V2_FINGERPRINT,
      source_snapshot_id: snapshotId,
      retained_entities: qids.length,
      phonetic_runtime_ready: 0,
    };
    for (const [key, value] of Object.entries(meta)) insertMeta.run(key, String(value));
    outDb.exec('COMMIT');
  } catch (error) {
    outDb.exec('ROLLBACK');
    throw error;
  }

  outDb.exec('ANALYZE; PRAGMA optimize;');

  const stats = {
    entities: Number(outDb.prepare('SELECT COUNT(*) AS c FROM entity').get().c),
    categories: Number(outDb.prepare('SELECT COUNT(*) AS c FROM entity_category').get().c),
    names: Number(outDb.prepare('SELECT COUNT(*) AS c FROM entity_name').get().c),
    external_ids: Number(outDb.prepare('SELECT COUNT(*) AS c FROM entity_external_id').get().c),
    pronunciations: Number(outDb.prepare('SELECT COUNT(*) AS c FROM entity_pronunciation').get().c),
  };
  const report = {
    schema: 'rhymelab-entity-catalog-materialization-report-v1',
    status: 'ok',
    entity_schema: ENTITY_DB_SCHEMA,
    popularity_policy: ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY,
    accepted_cut_fingerprint: ACCEPTED_ENTITY_CUT_V2_FINGERPRINT,
    stage_database: stagePath,
    taxonomy: taxonomyPath,
    cut_report: cutReportPath,
    database: outPath,
    database_bytes: (await stat(outPath)).size,
    semantic_fingerprint: fingerprint.digest('hex'),
    stats,
    category_summary: categorySummary,
    pronunciation_materialized: false,
    runtime_rewired: false,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally {
  stageDb.close();
  outDb.close();
}
