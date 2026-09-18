import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_CUT_HYBRID_CANDIDATE_POLICY,
  ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY,
  ENTITY_CUT_HYBRID_WEIGHTS,
  evaluateRankedEntityCutRows,
  rankHybridEntityCutRows,
  rankHybridV2EntityCutRows,
  summarizeEvaluatedEntityCutRows,
} from './entity-cut-hybrid-core.mjs';

export const EXPECTED_OWNER_HYBRID_V1_FINGERPRINT =
  'e770c1cfc655764e9e0f26e033c53fba0f1e1af4e2ca3b7ac82adf4eabde1e04';

const args = process.argv.slice(2);
let entityStagePath = 'data/work/entity/wikidata-cultural-stage-v1.sqlite';
let taxonomyPath = 'sources/entity/wikidata-entity-taxonomy-v1.json';
let v1ReportPath = 'data/local/entity-cut-hybrid-v1-candidate-report.json';
let reportPath = 'data/local/entity-cut-hybrid-v2-candidate-report.json';
let printJson = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--entities') entityStagePath = args[++i] || entityStagePath;
  else if (arg === '--taxonomy') taxonomyPath = args[++i] || taxonomyPath;
  else if (arg === '--v1-report') v1ReportPath = args[++i] || v1ReportPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--print-json') printJson = true;
}

entityStagePath = resolve(entityStagePath);
taxonomyPath = resolve(taxonomyPath);
v1ReportPath = resolve(v1ReportPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

const taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8'));
const v1Report = JSON.parse(await readFile(v1ReportPath, 'utf8'));
if (v1Report.semantic_fingerprint !== EXPECTED_OWNER_HYBRID_V1_FINGERPRINT) {
  throw new Error(
    `Hybrid v1 owner fingerprint mismatch: expected ${EXPECTED_OWNER_HYBRID_V1_FINGERPRINT}, got ${v1Report.semantic_fingerprint || 'missing'}`,
  );
}
if (v1Report.candidate_policy !== ENTITY_CUT_HYBRID_CANDIDATE_POLICY) {
  throw new Error(
    `Hybrid v1 policy mismatch: expected ${ENTITY_CUT_HYBRID_CANDIDATE_POLICY}, got ${v1Report.candidate_policy || 'missing'}`,
  );
}

const protectedQids = new Set((taxonomy.protected_sentinels || []).map((row) => row.qid));
const targetRange = [500000, 1200000];
const preferredRange = [600000, 900000];

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function compareQid(a, b) {
  return a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0;
}

function summaryComparable(summary) {
  return {
    candidates: summary.candidates,
    qrank_coverage: summary.qrank_coverage,
    qrank_coverage_pct: summary.qrank_coverage_pct,
    qrank_missing: summary.qrank_missing,
    kept: summary.kept,
    kept_with_qrank: summary.kept_with_qrank,
    kept_without_qrank: summary.kept_without_qrank,
    qrank_missing_retention_pct: summary.qrank_missing_retention_pct,
  };
}

function sameSummary(a, b) {
  return JSON.stringify(summaryComparable(a)) === JSON.stringify(summaryComparable(b));
}

function boundaryScore(rows, floor) {
  const floorRows = rows.filter((row) => row.percentile >= Number(floor));
  return floorRows.length ? floorRows.at(-1).candidate_score_ppm : null;
}

function bestMissing(rows) {
  const row = rows.find((entry) => entry.qrank == null);
  return row
    ? { rank: row.rank, score_ppm: row.candidate_score_ppm, qid: row.qid }
    : null;
}

function maxMissingScore(rows) {
  let max = null;
  for (const row of rows) {
    if (row.qrank != null) continue;
    if (max == null || row.candidate_score_ppm > max) max = row.candidate_score_ppm;
  }
  return max;
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

  const v1Distinct = new Set();
  const v2Distinct = new Set();
  const categoryReports = [];
  const sentinelReports = [];
  let totalV1Kept = 0;
  let totalV2Kept = 0;
  let totalPromoted = 0;
  let totalDemoted = 0;
  let v1AnchorMatches = true;

  const sampleRow = (v2Row, v1Row) => ({
    qid: v2Row.qid,
    name: preferredNameStatement.get(v2Row.qid)?.surface || null,
    qrank: v2Row.qrank == null ? null : Number(v2Row.qrank),
    wikipedia_sitelinks: Number(v2Row.wikipedia_sitelink_count || 0),
    has_dewiki: Number(v2Row.has_dewiki || 0),
    has_enwiki: Number(v2Row.has_enwiki || 0),
    external_ids: Number(v2Row.external_id_count || 0),
    statements: Number(v2Row.statement_count || 0),
    v1_rank: v1Row.rank,
    v2_rank: v2Row.rank,
    v2_rank_delta: v2Row.rank - v1Row.rank,
    v1_score_ppm: v1Row.candidate_score_ppm,
    v2_score_ppm: v2Row.candidate_score_ppm,
    v2_raw_score_ppm: v2Row.candidate_raw_score_ppm,
    v2_available_evidence_score_ppm: v2Row.candidate_available_evidence_score_ppm,
    v2_available_weight_pct: v2Row.candidate_available_weight_pct,
    v2_missing_evidence_adjustment: v2Row.candidate_missing_evidence_adjustment,
    components_ppm: v2Row.candidate_components_ppm,
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
    const v1 = evaluateRankedEntityCutRows(
      rankHybridEntityCutRows(rows),
      floor,
      protectedQids,
    );
    const v2 = evaluateRankedEntityCutRows(
      rankHybridV2EntityCutRows(rows),
      floor,
      protectedQids,
    );
    const v1ByQid = new Map(v1.map((row) => [row.qid, row]));
    const v2ByQid = new Map(v2.map((row) => [row.qid, row]));

    for (const row of v1) if (row.keep) v1Distinct.add(row.qid);
    for (const row of v2) if (row.keep) v2Distinct.add(row.qid);

    const v1Summary = summarizeEvaluatedEntityCutRows(v1);
    const v2Summary = summarizeEvaluatedEntityCutRows(v2);
    const anchoredCategory = v1Report.categories.find((row) => row.category === category);
    const categoryAnchorMatches = Boolean(
      anchoredCategory && sameSummary(v1Summary, anchoredCategory.candidate),
    );
    if (!categoryAnchorMatches) v1AnchorMatches = false;

    const promotedRows = v2.filter((row) => row.keep && !v1ByQid.get(row.qid).keep);
    const demotedRows = v1.filter((row) => row.keep && !v2ByQid.get(row.qid).keep);
    const promotedCount = promotedRows.length;
    const demotedCount = demotedRows.length;
    const keptIntersection = v1Summary.kept - demotedCount;

    const promoted = promotedRows
      .map((row) => sampleRow(row, v1ByQid.get(row.qid)))
      .sort((a, b) => a.v2_rank_delta - b.v2_rank_delta || compareQid(a, b))
      .slice(0, 8);
    const demoted = demotedRows
      .map((row) => sampleRow(v2ByQid.get(row.qid), row))
      .sort((a, b) => b.v2_rank_delta - a.v2_rank_delta || compareQid(a, b))
      .slice(0, 8);

    totalV1Kept += v1Summary.kept;
    totalV2Kept += v2Summary.kept;
    totalPromoted += promotedCount;
    totalDemoted += demotedCount;

    categoryReports.push({
      category,
      retention_percentile_floor: floor,
      qrank_coverage_pct: v1Summary.qrank_coverage_pct,
      v1_anchor_matches_owner_report: categoryAnchorMatches,
      v1: v1Summary,
      v2: v2Summary,
      score_boundary: {
        v1_cut_score_ppm: boundaryScore(v1, floor),
        v2_cut_score_ppm: boundaryScore(v2, floor),
        v1_max_missing_score_ppm: maxMissingScore(v1),
        v2_max_missing_score_ppm: maxMissingScore(v2),
        v1_best_missing: bestMissing(v1),
        v2_best_missing: bestMissing(v2),
      },
      churn: {
        kept_intersection: keptIntersection,
        promoted: promotedCount,
        demoted: demotedCount,
        kept_jaccard_pct: v1Summary.kept + v2Summary.kept - keptIntersection
          ? Math.round(
            keptIntersection * 10000
            / (v1Summary.kept + v2Summary.kept - keptIntersection),
          ) / 100
          : 100,
      },
      samples: { promoted, demoted },
    });

    for (const sentinel of (taxonomy.protected_sentinels || [])
      .filter((entry) => entry.required_category === category)) {
      const v1Row = v1ByQid.get(sentinel.qid);
      const v2Row = v2ByQid.get(sentinel.qid);
      const pass = Boolean(
        v2Row?.keep
        && (!sentinel.expected_tier || v2Row?.tier === sentinel.expected_tier)
      );
      sentinelReports.push({
        qid: sentinel.qid,
        name: sentinel.name,
        required_category: sentinel.required_category,
        expected_tier: sentinel.expected_tier || null,
        v1_rank: v1Row?.rank ?? null,
        v1_percentile: v1Row?.percentile ?? null,
        v1_tier: v1Row?.tier ?? null,
        v1_score_ppm: v1Row?.candidate_score_ppm ?? null,
        v2_rank: v2Row?.rank ?? null,
        v2_percentile: v2Row?.percentile ?? null,
        v2_tier: v2Row?.tier ?? null,
        v2_score_ppm: v2Row?.candidate_score_ppm ?? null,
        v2_keep: Boolean(v2Row?.keep),
        pass,
      });
    }
  }

  if (v1Distinct.size !== Number(v1Report.candidate_distinct_retained_entities)) {
    v1AnchorMatches = false;
  }

  const allSentinelsPass = sentinelReports.every((row) => row.pass);
  const hardGateCategoriesV1 = categoryReports
    .filter((row) => row.v1.qrank_missing > 0 && row.v1.kept_without_qrank === 0)
    .map((row) => row.category);
  const hardGateCategoriesV2 = categoryReports
    .filter((row) => row.v2.qrank_missing > 0 && row.v2.kept_without_qrank === 0)
    .map((row) => row.category);

  const fingerprintPayload = {
    v1_owner_fingerprint: EXPECTED_OWNER_HYBRID_V1_FINGERPRINT,
    v1_policy: ENTITY_CUT_HYBRID_CANDIDATE_POLICY,
    v2_policy: ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY,
    weights: ENTITY_CUT_HYBRID_WEIGHTS,
    v1_anchor_matches: v1AnchorMatches,
    v1_distinct_retained_entities: v1Distinct.size,
    v2_distinct_retained_entities: v2Distinct.size,
    total_v1_kept_category_memberships: totalV1Kept,
    total_v2_kept_category_memberships: totalV2Kept,
    total_promoted_memberships: totalPromoted,
    total_demoted_memberships: totalDemoted,
    hard_gate_categories_v1: hardGateCategoriesV1,
    hard_gate_categories_v2: hardGateCategoriesV2,
    sentinels: sentinelReports,
    categories: categoryReports,
  };

  const status = v1AnchorMatches && allSentinelsPass ? 'ok' : 'gate_failure';
  const report = {
    schema: 'rhymelab-entity-cut-hybrid-v2-ab-v1',
    status,
    v1_owner_fingerprint: EXPECTED_OWNER_HYBRID_V1_FINGERPRINT,
    v1_owner_report: v1ReportPath,
    v1_anchor_matches_owner_report: v1AnchorMatches,
    v1_policy: ENTITY_CUT_HYBRID_CANDIDATE_POLICY,
    v2_policy: ENTITY_CUT_HYBRID_V2_CANDIDATE_POLICY,
    weights_pct: ENTITY_CUT_HYBRID_WEIGHTS,
    v2_missing_qrank_rule:
      'geometric_mean_of_zero_fill_score_and_available_evidence_normalized_score',
    v2_missing_qrank_score_ceiling_ppm: 670820,
    entity_stage: entityStagePath,
    taxonomy: taxonomyPath,
    database_bytes: (await stat(entityStagePath)).size,
    all_sentinels_pass: allSentinelsPass,
    sentinels: sentinelReports,
    total_v1_kept_category_memberships: totalV1Kept,
    total_v2_kept_category_memberships: totalV2Kept,
    v1_distinct_retained_entities: v1Distinct.size,
    v2_distinct_retained_entities: v2Distinct.size,
    v2_distinct_delta_vs_v1: v2Distinct.size - v1Distinct.size,
    v2_target_range: targetRange,
    v2_in_target_range: v2Distinct.size >= targetRange[0] && v2Distinct.size <= targetRange[1],
    v2_preferred_range: preferredRange,
    v2_in_preferred_range:
      v2Distinct.size >= preferredRange[0] && v2Distinct.size <= preferredRange[1],
    total_promoted_memberships: totalPromoted,
    total_demoted_memberships: totalDemoted,
    membership_churn_pct: totalV1Kept
      ? Math.round((totalPromoted + totalDemoted) * 10000 / (2 * totalV1Kept)) / 100
      : 0,
    hard_gate_categories_v1: hardGateCategoriesV1,
    hard_gate_categories_v2: hardGateCategoriesV2,
    categories: categoryReports,
    semantic_fingerprint: sha256Json(fingerprintPayload),
    note:
      'Candidate-only v1/v2 A/B diagnostic. V2 changes only missing-QRank score normalization; category floors, sources, stage data, v1 policy and runtime remain unchanged.',
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (printJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify({
      status: report.status,
      v1_anchor_matches_owner_report: report.v1_anchor_matches_owner_report,
      all_sentinels_pass: report.all_sentinels_pass,
      v1_distinct_retained_entities: report.v1_distinct_retained_entities,
      v2_distinct_retained_entities: report.v2_distinct_retained_entities,
      v2_distinct_delta_vs_v1: report.v2_distinct_delta_vs_v1,
      v2_in_target_range: report.v2_in_target_range,
      v2_in_preferred_range: report.v2_in_preferred_range,
      total_promoted_memberships: report.total_promoted_memberships,
      total_demoted_memberships: report.total_demoted_memberships,
      membership_churn_pct: report.membership_churn_pct,
      hard_gate_categories_v1: report.hard_gate_categories_v1,
      hard_gate_categories_v2: report.hard_gate_categories_v2,
      sentinels: report.sentinels,
      category_ab_summary: report.categories.map((row) => ({
        category: row.category,
        qrank_coverage_pct: row.qrank_coverage_pct,
        v1_kept_without_qrank: row.v1.kept_without_qrank,
        v2_kept_without_qrank: row.v2.kept_without_qrank,
        v1_qrank_missing_retention_pct: row.v1.qrank_missing_retention_pct,
        v2_qrank_missing_retention_pct: row.v2.qrank_missing_retention_pct,
        v1_cut_score_ppm: row.score_boundary.v1_cut_score_ppm,
        v2_cut_score_ppm: row.score_boundary.v2_cut_score_ppm,
        v2_best_missing_rank: row.score_boundary.v2_best_missing?.rank ?? null,
        promoted: row.churn.promoted,
        demoted: row.churn.demoted,
        kept_jaccard_pct: row.churn.kept_jaccard_pct,
      })),
      semantic_fingerprint: report.semantic_fingerprint,
      report: reportPath,
    }, null, 2));
  }

  if (status !== 'ok') process.exitCode = 1;
} finally {
  db.close();
}
