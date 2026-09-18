#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_CUT_DIAGNOSTIC_POLICY,
  attachAndJoinQRank,
  categoryCutDiagnostics,
  sentinelCutChecks,
  stageStats,
} from './entity-staging-core.mjs';

const args = process.argv.slice(2);
let entityStagePath = 'data/work/entity/wikidata-cultural-stage-v1.sqlite';
let qrankStagePath = 'data/work/entity/qrank-stage-v1.sqlite';
let taxonomyPath = 'sources/entity/wikidata-entity-taxonomy-v1.json';
let reportPath = 'data/local/entity-cut-diagnostics-v1-report.json';
let joinQRank = true;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--entities') entityStagePath = args[++i] || entityStagePath;
  else if (arg === '--qrank') qrankStagePath = args[++i] || qrankStagePath;
  else if (arg === '--taxonomy') taxonomyPath = args[++i] || taxonomyPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--skip-qrank-join') joinQRank = false;
}

entityStagePath = resolve(entityStagePath);
qrankStagePath = resolve(qrankStagePath);
taxonomyPath = resolve(taxonomyPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

const taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8'));
const db = new DatabaseSync(entityStagePath);
try {
  if (joinQRank) {
    attachAndJoinQRank(db, qrankStagePath);
    db.exec('ANALYZE; PRAGMA optimize;');
  }

  const retainedQids = new Set();
  const categories = categoryCutDiagnostics(db, taxonomy, { retainedQids });
  const sentinels = sentinelCutChecks(db, taxonomy);
  const stats = stageStats(db);
  const stageBytes = (await stat(entityStagePath)).size;
  const totalCategoryCandidates = categories.reduce((sum, row) => sum + row.candidates, 0);
  const totalCategoryKept = categories.reduce((sum, row) => sum + row.kept, 0);
  const distinctRetainedEntities = retainedQids.size;
  const retainedMembershipOverlap = totalCategoryKept - distinctRetainedEntities;

  const report = {
    schema: 'rhymelab-entity-cut-diagnostics-v1',
    status: sentinels.every((row) => row.pass) ? 'ok' : 'sentinel_failure',
    built_at: new Date().toISOString(),
    policy: ENTITY_CUT_DIAGNOSTIC_POLICY,
    entity_stage: entityStagePath,
    qrank_stage: joinQRank ? qrankStagePath : null,
    qrank_join_performed: joinQRank,
    taxonomy: taxonomyPath,
    database_bytes: stageBytes,
    stats,
    sentinels,
    all_sentinels_pass: sentinels.every((row) => row.pass),
    total_category_memberships: totalCategoryCandidates,
    total_kept_category_memberships: totalCategoryKept,
    distinct_retained_entities: distinctRetainedEntities,
    retained_membership_overlap: retainedMembershipOverlap,
    retained_memberships_per_entity: distinctRetainedEntities
      ? Math.round(totalCategoryKept * 1_000_000 / distinctRetainedEntities) / 1_000_000
      : 0,
    categories,
    note: 'This is a staging cut diagnostic. It ranks QRank first, then sitelinks/DE+EN presence/IDs/statements. Final popularity scoring and final DB materialization remain later gates.',
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!report.all_sentinels_pass) process.exitCode = 1;
} finally {
  db.close();
}
