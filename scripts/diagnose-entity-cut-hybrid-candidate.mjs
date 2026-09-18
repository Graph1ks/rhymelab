import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_CUT_HYBRID_CANDIDATE_POLICY,
  ENTITY_CUT_HYBRID_WEIGHTS,
  evaluateRankedEntityCutRows,
  rankControlEntityCutRows,
  rankHybridEntityCutRows,
  summarizeEvaluatedEntityCutRows,
} from './entity-cut-hybrid-core.mjs';
import { ENTITY_CUT_DIAGNOSTIC_POLICY } from './entity-staging-core.mjs';

const args = process.argv.slice(2);
let entityStagePath = 'data/work/entity/wikidata-cultural-stage-v1.sqlite';
let taxonomyPath = 'sources/entity/wikidata-entity-taxonomy-v1.json';
let reportPath = 'data/local/entity-cut-hybrid-v1-candidate-report.json';
let printJson = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--entities') entityStagePath = args[++i] || entityStagePath;
  else if (arg === '--taxonomy') taxonomyPath = args[++i] || taxonomyPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--print-json') printJson = true;
}

entityStagePath = resolve(entityStagePath);
taxonomyPath = resolve(taxonomyPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

const taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8'));
const protectedQids = new Set((taxonomy.protected_sentinels || []).map((row) => row.qid));
const targetRange = [500000, 1200000];
const preferredRange = [600000, 900000];

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function compareQid(a, b) {
  return a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0;
}

const db = new DatabaseSync(entityStagePath, { readOnly: true });
try {
  const categories = db.prepare(
    'SELECT DISTINCT category FROM entity_stage_category ORDER BY category',
  ).all().map((row) => row.category);

  const evidenceStatement = db.prepare(`
    SELECT
      e.qid,
      e.qrank,
      e.wikipedia_sitelink_count,
      e.has_dewiki,
      e.has_enwiki,
      e.external_id_count,
      e.statement_count,
      c.retention_percentile_floor
    FROM entity_stage_category c
    JOIN entity_stage e USING(qid)
    WHERE c.category=?
  `);
  const preferredNameStatement = db.prepare(`
    SELECT surface
    FROM entity_stage_name
    WHERE qid=? AND preferred=1
    ORDER BY
      CASE language WHEN 'de' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,
      surface
    LIMIT 1
  `);

  const controlDistinct = new Set();
  const candidateDistinct = new Set();
  const categoryReports = [];
  const sentinelReports = [];
  let totalControlKept = 0;
  let totalCandidateKept = 0;
  let totalPromoted = 0;
  let totalDemoted = 0;

  const sampleRow = (candidateRow, controlRow) => ({
    qid: candidateRow.qid,
    name: preferredNameStatement.get(candidateRow.qid)?.surface || null,
    qrank: candidateRow.qrank == null ? null : Number(candidateRow.qrank),
    wikipedia_sitelinks: Number(candidateRow.wikipedia_sitelink_count || 0),
    has_dewiki: Number(candidateRow.has_dewiki || 0),
    has_enwiki: Number(candidateRow.has_enwiki || 0),
    external_ids: Number(candidateRow.external_id_count || 0),
    statements: Number(candidateRow.statement_count || 0),
    control_rank: controlRow.rank,
    candidate_rank: candidateRow.rank,
    candidate_rank_delta: candidateRow.rank - controlRow.rank,
    candidate_score_ppm: candidateRow.candidate_score_ppm,
    candidate_components_ppm: candidateRow.candidate_components_ppm,
  });

  for (const category of categories) {
    const rows = evidenceStatement.all(category).map((row) => ({
      ...row,
      qrank: row.qrank == null ? null : Number(row.qrank),
      wikipedia_sitelink_count: Number(row.wikipedia_sitelink_count || 0),
      has_dewiki: Number(row.has_dewiki || 0),
      has_enwiki: Number(row.has_enwiki || 0),
      external_id_count: Number(row.external_id_count || 0),
      statement_count: Number(row.statement_count || 0),
      retention_percentile_floor: Number(row.retention_percentile_floor),
    }));
    if (!rows.length) continue;

    const floor = rows[0].retention_percentile_floor;
    const control = evaluateRankedEntityCutRows(
      rankControlEntityCutRows(rows),
      floor,
      protectedQids,
    );
    const candidate = evaluateRankedEntityCutRows(
      rankHybridEntityCutRows(rows),
      floor,
      protectedQids,
    );
    const controlByQid = new Map(control.map((row) => [row.qid, row]));
    const candidateByQid = new Map(candidate.map((row) => [row.qid, row]));

    for (const row of control) if (row.keep) controlDistinct.add(row.qid);
    for (const row of candidate) if (row.keep) candidateDistinct.add(row.qid);

    const promoted = candidate
      .filter((row) => row.keep && !controlByQid.get(row.qid).keep)
      .map((row) => sampleRow(row, controlByQid.get(row.qid)))
      .sort((a, b) => a.candidate_rank_delta - b.candidate_rank_delta || compareQid(a, b))
      .slice(0, 5);
    const demoted = control
      .filter((row) => row.keep && !candidateByQid.get(row.qid).keep)
      .map((row) => sampleRow(candidateByQid.get(row.qid), row))
      .sort((a, b) => b.candidate_rank_delta - a.candidate_rank_delta || compareQid(a, b))
      .slice(0, 5);

    const controlSummary = summarizeEvaluatedEntityCutRows(control);
    const candidateSummary = summarizeEvaluatedEntityCutRows(candidate);
    const promotedCount = candidate.reduce(
      (sum, row) => sum + (row.keep && !controlByQid.get(row.qid).keep ? 1 : 0),
      0,
    );
    const demotedCount = control.reduce(
      (sum, row) => sum + (row.keep && !candidateByQid.get(row.qid).keep ? 1 : 0),
      0,
    );
    const keptIntersection = controlSummary.kept - demotedCount;

    totalControlKept += controlSummary.kept;
    totalCandidateKept += candidateSummary.kept;
    totalPromoted += promotedCount;
    totalDemoted += demotedCount;

    categoryReports.push({
      category,
      retention_percentile_floor: floor,
      qrank_coverage_pct: controlSummary.qrank_coverage_pct,
      control: controlSummary,
      candidate: candidateSummary,
      churn: {
        kept_intersection: keptIntersection,
        promoted: promotedCount,
        demoted: demotedCount,
        kept_jaccard_pct: controlSummary.kept + candidateSummary.kept - keptIntersection
          ? Math.round(
            keptIntersection * 10000
            / (controlSummary.kept + candidateSummary.kept - keptIntersection),
          ) / 100
          : 100,
      },
      samples: { promoted, demoted },
    });

    for (const sentinel of (taxonomy.protected_sentinels || [])
      .filter((entry) => entry.required_category === category)) {
      const controlRow = controlByQid.get(sentinel.qid);
      const candidateRow = candidateByQid.get(sentinel.qid);
      const pass = Boolean(
        candidateRow?.keep
        && (!sentinel.expected_tier || candidateRow?.tier === sentinel.expected_tier)
      );
      sentinelReports.push({
        qid: sentinel.qid,
        name: sentinel.name,
        required_category: sentinel.required_category,
        expected_tier: sentinel.expected_tier || null,
        control_rank: controlRow?.rank ?? null,
        control_percentile: controlRow?.percentile ?? null,
        control_tier: controlRow?.tier ?? null,
        candidate_rank: candidateRow?.rank ?? null,
        candidate_percentile: candidateRow?.percentile ?? null,
        candidate_tier: candidateRow?.tier ?? null,
        candidate_score_ppm: candidateRow?.candidate_score_ppm ?? null,
        candidate_keep: Boolean(candidateRow?.keep),
        pass,
      });
    }
  }

  const allSentinelsPass = sentinelReports.every((row) => row.pass);
  const fingerprintPayload = {
    control_policy: ENTITY_CUT_DIAGNOSTIC_POLICY,
    candidate_policy: ENTITY_CUT_HYBRID_CANDIDATE_POLICY,
    weights: ENTITY_CUT_HYBRID_WEIGHTS,
    control_distinct_retained_entities: controlDistinct.size,
    candidate_distinct_retained_entities: candidateDistinct.size,
    total_control_kept_category_memberships: totalControlKept,
    total_candidate_kept_category_memberships: totalCandidateKept,
    total_promoted_memberships: totalPromoted,
    total_demoted_memberships: totalDemoted,
    sentinels: sentinelReports,
    categories: categoryReports.map((row) => ({
      category: row.category,
      retention_percentile_floor: row.retention_percentile_floor,
      qrank_coverage_pct: row.qrank_coverage_pct,
      control: row.control,
      candidate: row.candidate,
      churn: row.churn,
      samples: row.samples,
    })),
  };

  const report = {
    schema: 'rhymelab-entity-cut-hybrid-ab-v1',
    status: allSentinelsPass ? 'ok' : 'sentinel_failure',
    control_policy: ENTITY_CUT_DIAGNOSTIC_POLICY,
    candidate_policy: ENTITY_CUT_HYBRID_CANDIDATE_POLICY,
    candidate_weights_pct: ENTITY_CUT_HYBRID_WEIGHTS,
    candidate_missing_qrank_rule: 'qrank_percentile_component_zero_not_binary_presence_gate',
    entity_stage: entityStagePath,
    taxonomy: taxonomyPath,
    database_bytes: (await stat(entityStagePath)).size,
    all_sentinels_pass: allSentinelsPass,
    sentinels: sentinelReports,
    total_control_kept_category_memberships: totalControlKept,
    total_candidate_kept_category_memberships: totalCandidateKept,
    control_distinct_retained_entities: controlDistinct.size,
    candidate_distinct_retained_entities: candidateDistinct.size,
    candidate_distinct_delta: candidateDistinct.size - controlDistinct.size,
    candidate_target_range: targetRange,
    candidate_in_target_range:
      candidateDistinct.size >= targetRange[0] && candidateDistinct.size <= targetRange[1],
    candidate_preferred_range: preferredRange,
    candidate_in_preferred_range:
      candidateDistinct.size >= preferredRange[0] && candidateDistinct.size <= preferredRange[1],
    total_promoted_memberships: totalPromoted,
    total_demoted_memberships: totalDemoted,
    membership_churn_pct: totalControlKept
      ? Math.round((totalPromoted + totalDemoted) * 10000 / (2 * totalControlKept)) / 100
      : 0,
    categories: categoryReports,
    semantic_fingerprint: sha256Json(fingerprintPayload),
    note: 'Candidate-only A/B diagnostic. It does not mutate stage data, category floors, the accepted v1 control policy, or any runtime database.',
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (printJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify({
      status: report.status,
      all_sentinels_pass: report.all_sentinels_pass,
      control_distinct_retained_entities: report.control_distinct_retained_entities,
      candidate_distinct_retained_entities: report.candidate_distinct_retained_entities,
      candidate_distinct_delta: report.candidate_distinct_delta,
      candidate_in_target_range: report.candidate_in_target_range,
      candidate_in_preferred_range: report.candidate_in_preferred_range,
      total_promoted_memberships: report.total_promoted_memberships,
      total_demoted_memberships: report.total_demoted_memberships,
      membership_churn_pct: report.membership_churn_pct,
      sentinels: report.sentinels,
      category_ab_summary: report.categories.map((row) => ({
        category: row.category,
        qrank_coverage_pct: row.qrank_coverage_pct,
        control_kept_without_qrank: row.control.kept_without_qrank,
        candidate_kept_without_qrank: row.candidate.kept_without_qrank,
        control_qrank_missing_retention_pct: row.control.qrank_missing_retention_pct,
        candidate_qrank_missing_retention_pct: row.candidate.qrank_missing_retention_pct,
        promoted: row.churn.promoted,
        demoted: row.churn.demoted,
        kept_jaccard_pct: row.churn.kept_jaccard_pct,
      })),
      semantic_fingerprint: report.semantic_fingerprint,
      report: reportPath,
    }, null, 2));
  }

  if (!allSentinelsPass) process.exitCode = 1;
} finally {
  db.close();
}
