#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  cmudictCoverageForSurface,
  normalizeCmudictToken,
  parseCmudictLexicon,
} from './entity-pronunciation-coverage-core.mjs';

const args = process.argv.slice(2);
let entityDbPath = 'data/local/rhymelab-entities-v1.sqlite';
let cmudictPath = 'data/raw/entity/pronunciation/cmudict-entity-pronunciation-v1.dict';
let sourceReportPath = 'data/local/entity-pronunciation-source-report.json';
let reportPath = 'data/local/entity-pronunciation-coverage-report.json';
let priorityLimit = 20;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--entities') entityDbPath = args[++i] || entityDbPath;
  else if (arg === '--cmudict') cmudictPath = args[++i] || cmudictPath;
  else if (arg === '--source-report') sourceReportPath = args[++i] || sourceReportPath;
  else if (arg === '--report') reportPath = args[++i] || reportPath;
  else if (arg === '--priority-limit') priorityLimit = Number(args[++i] || priorityLimit);
}

entityDbPath = resolve(entityDbPath);
cmudictPath = resolve(cmudictPath);
sourceReportPath = resolve(sourceReportPath);
reportPath = resolve(reportPath);
await mkdir(dirname(reportPath), { recursive: true });

const ELIGIBLE = "p.locale='de-DE' AND p.review_state IN ('accepted','reviewed','accepted_source_composition')";

function pct(numerator, denominator) {
  return denominator ? Math.round(numerator * 10000 / denominator) / 100 : 0;
}

function count(db, sql, ...params) {
  return Number(db.prepare(sql).get(...params)?.c || 0);
}

function rowsWithPct(rows, totalKey, readyKey) {
  return rows.map((row) => ({
    ...row,
    [totalKey]: Number(row[totalKey] || 0),
    [readyKey]: Number(row[readyKey] || 0),
    coverage_pct: pct(Number(row[readyKey] || 0), Number(row[totalKey] || 0)),
  }));
}

const [cmudictRaw, sourceReportRaw] = await Promise.all([
  readFile(cmudictPath, 'utf8'),
  readFile(sourceReportPath, 'utf8'),
]);
const cmudict = parseCmudictLexicon(cmudictRaw);
const sourceReport = JSON.parse(sourceReportRaw);

const db = new DatabaseSync(entityDbPath, { readOnly: true });
db.exec('PRAGMA query_only=ON;');

try {
  const schema = db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  if (schema !== 'rhymelab-entity-catalog-v1') {
    throw new Error(`Unexpected entity database schema: ${schema || 'missing'}`);
  }

  const runtimeFingerprint = db.prepare(
    "SELECT value FROM meta WHERE key='entity_phonetic_runtime_fingerprint'",
  ).get()?.value || null;

  const namesTotal = count(db, `
    SELECT COUNT(*) AS c FROM entity_name
    WHERE searchable=1 AND language='de'
  `);
  const preferredNames = count(db, `
    SELECT COUNT(*) AS c FROM entity_name
    WHERE searchable=1 AND language='de' AND preferred=1
  `);
  const aliasNames = namesTotal - preferredNames;
  const readyNames = count(db, `
    SELECT COUNT(*) AS c
    FROM entity_name n
    WHERE n.searchable=1 AND n.language='de'
      AND EXISTS (
        SELECT 1 FROM entity_pronunciation p
        WHERE p.name_id=n.name_id AND ${ELIGIBLE}
      )
  `);
  const readyPreferredNames = count(db, `
    SELECT COUNT(*) AS c
    FROM entity_name n
    WHERE n.searchable=1 AND n.language='de' AND n.preferred=1
      AND EXISTS (
        SELECT 1 FROM entity_pronunciation p
        WHERE p.name_id=n.name_id AND ${ELIGIBLE}
      )
  `);
  const entityTotal = count(db, 'SELECT COUNT(*) AS c FROM entity');
  const entitiesAnyReady = count(db, `
    SELECT COUNT(*) AS c
    FROM entity e
    WHERE EXISTS (
      SELECT 1
      FROM entity_name n
      JOIN entity_pronunciation p USING(name_id)
      WHERE n.entity_id=e.entity_id
        AND n.searchable=1 AND n.language='de'
        AND ${ELIGIBLE}
    )
  `);
  const entitiesPreferredReady = count(db, `
    SELECT COUNT(*) AS c
    FROM entity e
    WHERE EXISTS (
      SELECT 1
      FROM entity_name n
      JOIN entity_pronunciation p USING(name_id)
      WHERE n.entity_id=e.entity_id
        AND n.searchable=1 AND n.language='de' AND n.preferred=1
        AND ${ELIGIBLE}
    )
  `);

  const byNameKind = db.prepare(`
    SELECT
      n.name_kind,
      n.preferred,
      COUNT(*) AS names,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM entity_pronunciation p
        WHERE p.name_id=n.name_id AND ${ELIGIBLE}
      ) THEN 1 ELSE 0 END) AS runtime_ready
    FROM entity_name n
    WHERE n.searchable=1 AND n.language='de'
    GROUP BY n.name_kind,n.preferred
    ORDER BY n.preferred DESC,n.name_kind
  `).all().map((row) => ({
    name_kind: row.name_kind,
    preferred: Number(row.preferred),
    names: Number(row.names),
    runtime_ready: Number(row.runtime_ready || 0),
    coverage_pct: pct(Number(row.runtime_ready || 0), Number(row.names)),
  }));

  const categoryRows = db.prepare(`
    SELECT
      c.category,
      c.category_tier,
      COUNT(*) AS entity_memberships,
      SUM(CASE WHEN EXISTS (
        SELECT 1
        FROM entity_name n
        JOIN entity_pronunciation p USING(name_id)
        WHERE n.entity_id=c.entity_id
          AND n.searchable=1 AND n.language='de'
          AND ${ELIGIBLE}
      ) THEN 1 ELSE 0 END) AS any_name_ready,
      SUM(CASE WHEN EXISTS (
        SELECT 1
        FROM entity_name n
        JOIN entity_pronunciation p USING(name_id)
        WHERE n.entity_id=c.entity_id
          AND n.searchable=1 AND n.language='de' AND n.preferred=1
          AND ${ELIGIBLE}
      ) THEN 1 ELSE 0 END) AS preferred_name_ready
    FROM entity_category c
    GROUP BY c.category,c.category_tier
    ORDER BY c.category,
      CASE c.category_tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END
  `).all().map((row) => ({
    category: row.category,
    tier: row.category_tier,
    entity_memberships: Number(row.entity_memberships),
    any_name_ready: Number(row.any_name_ready || 0),
    any_name_ready_pct: pct(Number(row.any_name_ready || 0), Number(row.entity_memberships)),
    preferred_name_ready: Number(row.preferred_name_ready || 0),
    preferred_name_ready_pct: pct(
      Number(row.preferred_name_ready || 0),
      Number(row.entity_memberships),
    ),
  }));

  const categorySummary = db.prepare(`
    SELECT
      c.category,
      COUNT(*) AS entity_memberships,
      SUM(CASE WHEN EXISTS (
        SELECT 1
        FROM entity_name n
        JOIN entity_pronunciation p USING(name_id)
        WHERE n.entity_id=c.entity_id
          AND n.searchable=1 AND n.language='de'
          AND ${ELIGIBLE}
      ) THEN 1 ELSE 0 END) AS any_name_ready,
      SUM(CASE WHEN EXISTS (
        SELECT 1
        FROM entity_name n
        JOIN entity_pronunciation p USING(name_id)
        WHERE n.entity_id=c.entity_id
          AND n.searchable=1 AND n.language='de' AND n.preferred=1
          AND ${ELIGIBLE}
      ) THEN 1 ELSE 0 END) AS preferred_name_ready
    FROM entity_category c
    GROUP BY c.category
    ORDER BY c.category
  `).all().map((row) => ({
    category: row.category,
    entity_memberships: Number(row.entity_memberships),
    any_name_ready: Number(row.any_name_ready || 0),
    any_name_ready_pct: pct(Number(row.any_name_ready || 0), Number(row.entity_memberships)),
    preferred_name_ready: Number(row.preferred_name_ready || 0),
    preferred_name_ready_pct: pct(
      Number(row.preferred_name_ready || 0),
      Number(row.entity_memberships),
    ),
  }));

  const p898Rows = count(db, `
    SELECT COUNT(*) AS c
    FROM entity_pronunciation
    WHERE source_kind='wikidata_p898'
      AND review_state='source_attested_unprofiled'
  `);
  const p898Names = count(db, `
    SELECT COUNT(DISTINCT name_id) AS c
    FROM entity_pronunciation
    WHERE source_kind='wikidata_p898'
      AND review_state='source_attested_unprofiled'
  `);
  const p898PreferredNames = count(db, `
    SELECT COUNT(DISTINCT p.name_id) AS c
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    WHERE p.source_kind='wikidata_p898'
      AND p.review_state='source_attested_unprofiled'
      AND n.preferred=1
  `);
  const p898UnresolvedDeNames = count(db, `
    SELECT COUNT(DISTINCT p.name_id) AS c
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    WHERE p.source_kind='wikidata_p898'
      AND p.review_state='source_attested_unprofiled'
      AND n.language='de'
      AND n.searchable=1
      AND NOT EXISTS (
        SELECT 1 FROM entity_pronunciation runtime
        WHERE runtime.name_id=n.name_id AND ${ELIGIBLE.replaceAll('p.', 'runtime.')}
      )
  `);
  const p898UnresolvedDePreferredNames = count(db, `
    SELECT COUNT(DISTINCT p.name_id) AS c
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    WHERE p.source_kind='wikidata_p898'
      AND p.review_state='source_attested_unprofiled'
      AND n.language='de'
      AND n.searchable=1
      AND n.preferred=1
      AND NOT EXISTS (
        SELECT 1 FROM entity_pronunciation runtime
        WHERE runtime.name_id=n.name_id AND ${ELIGIBLE.replaceAll('p.', 'runtime.')}
      )
  `);
  const p898ByLocale = db.prepare(`
    SELECT COALESCE(locale,'unprofiled') AS locale,COUNT(*) AS rows,
      COUNT(DISTINCT name_id) AS names
    FROM entity_pronunciation
    WHERE source_kind='wikidata_p898'
      AND review_state='source_attested_unprofiled'
    GROUP BY COALESCE(locale,'unprofiled')
    ORDER BY locale
  `).all().map((row) => ({
    locale: row.locale,
    rows: Number(row.rows || 0),
    names: Number(row.names || 0),
  }));
  const p898ByCategoryTier = db.prepare(`
    SELECT c.category,c.category_tier AS tier,
      COUNT(DISTINCT p.name_id) AS preferred_names_with_evidence
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    JOIN entity_category c USING(entity_id)
    WHERE p.source_kind='wikidata_p898'
      AND p.review_state='source_attested_unprofiled'
      AND n.preferred=1
    GROUP BY c.category,c.category_tier
    ORDER BY c.category,
      CASE c.category_tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END
  `).all().map((row) => ({
    category: row.category,
    tier: row.tier,
    preferred_names_with_evidence: Number(row.preferred_names_with_evidence || 0),
  }));

  console.error(
    `[entity-pronunciation:coverage] probing ${(namesTotal - readyNames).toLocaleString()} unresolved DE names against pinned CMUdict`,
  );

  const unresolvedStatement = db.prepare(`
    SELECT
      n.name_id,n.entity_id,n.surface,n.preferred,n.name_kind,
      e.qid,e.primary_category,e.popularity_tier,e.popularity_score
    FROM entity_name n
    JOIN entity e USING(entity_id)
    WHERE n.searchable=1 AND n.language='de'
      AND NOT EXISTS (
        SELECT 1 FROM entity_pronunciation p
        WHERE p.name_id=n.name_id AND ${ELIGIBLE}
      )
    ORDER BY n.name_id
  `);

  let unresolvedProcessed = 0;
  let cmuFull = 0;
  let cmuPartial = 0;
  let cmuNone = 0;
  let cmuFullPreferred = 0;
  let cmuPartialPreferred = 0;
  const cmuFullEntities = new Set();
  const cmuFullPreferredEntities = new Set();
  const missingTokens = new Map();

  for (const row of unresolvedStatement.iterate()) {
    const coverage = cmudictCoverageForSurface(row.surface, cmudict.entries);
    unresolvedProcessed += 1;
    if (coverage.status === 'full') {
      cmuFull += 1;
      cmuFullEntities.add(Number(row.entity_id));
      if (Number(row.preferred)) {
        cmuFullPreferred += 1;
        cmuFullPreferredEntities.add(Number(row.entity_id));
      }
    } else if (coverage.status === 'partial') {
      cmuPartial += 1;
      if (Number(row.preferred)) cmuPartialPreferred += 1;
    } else {
      cmuNone += 1;
    }

    for (const token of coverage.unmatchedTokens) {
      const key = normalizeCmudictToken(token);
      missingTokens.set(key, (missingTokens.get(key) || 0) + 1);
    }

    if (unresolvedProcessed % 100000 === 0) {
      console.error(
        `[entity-pronunciation:coverage] ${unresolvedProcessed.toLocaleString()} unresolved names probed`
        + ` · CMU full ${cmuFull.toLocaleString()} · partial ${cmuPartial.toLocaleString()}`,
      );
    }
  }

  const priorityStatement = db.prepare(`
    SELECT
      c.category,c.category_rank,c.category_tier,
      e.qid,e.primary_category,e.popularity_tier,e.popularity_score,
      n.surface,n.name_kind,n.preferred
    FROM entity_category c
    JOIN entity e USING(entity_id)
    JOIN entity_name n USING(entity_id)
    WHERE c.category=?
      AND n.searchable=1 AND n.language='de' AND n.preferred=1
      AND NOT EXISTS (
        SELECT 1 FROM entity_pronunciation p
        WHERE p.name_id=n.name_id AND ${ELIGIBLE}
      )
    ORDER BY c.category_rank ASC,e.qid ASC,n.name_id ASC
    LIMIT ?
  `);
  const priorityUnresolved = [];
  for (const { category } of db.prepare(
    'SELECT DISTINCT category FROM entity_category ORDER BY category',
  ).all()) {
    for (const row of priorityStatement.all(category, priorityLimit)) {
      priorityUnresolved.push({
        category: row.category,
        category_rank: Number(row.category_rank),
        category_tier: row.category_tier,
        qid: row.qid,
        surface: row.surface,
        primary_category: row.primary_category,
        popularity_tier: row.popularity_tier,
        popularity_score: Number(row.popularity_score || 0),
        cmudict_probe_status: cmudictCoverageForSurface(row.surface, cmudict.entries).status,
        wikidata_p898_source_evidence: Boolean(db.prepare(`
          SELECT 1 AS yes
          FROM entity_pronunciation p
          JOIN entity_name n USING(name_id)
          JOIN entity e USING(entity_id)
          WHERE e.qid=?
            AND n.surface=?
            AND p.source_kind='wikidata_p898'
            AND p.review_state='source_attested_unprofiled'
          LIMIT 1
        `).get(row.qid, row.surface)),
      });
    }
  }

  const cmudictCategoryCandidateMap = new Map();
  for (const row of db.prepare(
    'SELECT entity_id,category,category_tier FROM entity_category ORDER BY category,category_tier',
  ).iterate()) {
    const key = row.category + '\u001f' + row.category_tier;
    const bucket = cmudictCategoryCandidateMap.get(key) || {
      category: row.category,
      tier: row.category_tier,
      full_match_entity_candidates: 0,
      preferred_full_match_entity_candidates: 0,
    };
    if (cmuFullEntities.has(Number(row.entity_id))) bucket.full_match_entity_candidates += 1;
    if (cmuFullPreferredEntities.has(Number(row.entity_id))) {
      bucket.preferred_full_match_entity_candidates += 1;
    }
    cmudictCategoryCandidateMap.set(key, bucket);
  }
  const cmudictCandidatesByCategoryTier = [...cmudictCategoryCandidateMap.values()]
    .filter((row) => row.full_match_entity_candidates || row.preferred_full_match_entity_candidates)
    .sort((a, b) =>
      a.category.localeCompare(b.category, 'en')
      || ['A','B','C'].indexOf(a.tier) - ['A','B','C'].indexOf(b.tier)
    );

  const topMissingTokens = [...missingTokens.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'))
    .slice(0, 200)
    .map(([token, countValue]) => ({ token, count: countValue }));

  const reportBase = {
    schema: 'rhymelab-entity-pronunciation-coverage-report-v1',
    status: 'ok',
    entity_database: entityDbPath,
    database_bytes: (await stat(entityDbPath)).size,
    runtime_fingerprint: runtimeFingerprint,
    overall: {
      entities: entityTotal,
      de_names: namesTotal,
      de_preferred_names: preferredNames,
      de_alias_names: aliasNames,
      runtime_ready_names: readyNames,
      runtime_ready_name_pct: pct(readyNames, namesTotal),
      runtime_ready_preferred_names: readyPreferredNames,
      runtime_ready_preferred_name_pct: pct(readyPreferredNames, preferredNames),
      entities_with_any_runtime_name: entitiesAnyReady,
      entities_with_any_runtime_name_pct: pct(entitiesAnyReady, entityTotal),
      entities_with_preferred_runtime_name: entitiesPreferredReady,
      entities_with_preferred_runtime_name_pct: pct(entitiesPreferredReady, entityTotal),
    },
    coverage_by_name_kind: byNameKind,
    coverage_by_category: categorySummary,
    coverage_by_category_tier: categoryRows,
    wikidata_p898_source_evidence: {
      interpretation: 'source_attested_unprofiled_not_runtime_eligible',
      pronunciation_rows: p898Rows,
      distinct_names: p898Names,
      preferred_names: p898PreferredNames,
      unresolved_de_names_with_evidence: p898UnresolvedDeNames,
      unresolved_de_preferred_names_with_evidence: p898UnresolvedDePreferredNames,
      by_locale: p898ByLocale,
      preferred_names_by_category_tier: p898ByCategoryTier,
      runtime_eligible_rows: 0,
      warning: 'Generic Wikidata P898 language evidence is preserved as source evidence and is not silently promoted to de-DE/en-US runtime pronunciation.',
    },
    source_probe: {
      source_id: sourceReport.source_id,
      source_commit: sourceReport.source_commit,
      source_git_blob_sha1: sourceReport.source_git_blob_sha1,
      source_license: sourceReport.source_license,
      interpretation: 'coverage_probe_only_not_de_runtime_eligible',
      cmudict_unique_tokens: cmudict.uniqueTokens,
      cmudict_pronunciations: cmudict.pronunciations,
      unresolved_names_probed: unresolvedProcessed,
      unresolved_full_token_match: cmuFull,
      unresolved_full_token_match_pct: pct(cmuFull, unresolvedProcessed),
      unresolved_partial_token_match: cmuPartial,
      unresolved_partial_token_match_pct: pct(cmuPartial, unresolvedProcessed),
      unresolved_no_token_match: cmuNone,
      unresolved_no_token_match_pct: pct(cmuNone, unresolvedProcessed),
      unresolved_preferred_full_token_match: cmuFullPreferred,
      unresolved_preferred_partial_token_match: cmuPartialPreferred,
      distinct_entities_with_full_token_match_candidate: cmuFullEntities.size,
      distinct_entities_with_preferred_full_token_match_candidate: cmuFullPreferredEntities.size,
      candidates_by_category_tier: cmudictCandidatesByCategoryTier,
      projected_name_coverage_if_all_full_matches_became_eligible: pct(
        readyNames + cmuFull,
        namesTotal,
      ),
      projected_preferred_name_coverage_if_all_full_matches_became_eligible: pct(
        readyPreferredNames + cmuFullPreferred,
        preferredNames,
      ),
      warning: 'CMUdict is en-US pronunciation evidence. These matches are not automatically valid de-DE pronunciations and are not inserted into the German runtime.',
    },
    priority_unresolved_preferred_names: priorityUnresolved,
    top_tokens_still_missing_after_cmudict_probe: topMissingTokens,
  };

  const fingerprint = createHash('sha256')
    .update(JSON.stringify(reportBase))
    .digest('hex');
  const report = {
    ...reportBase,
    semantic_fingerprint: fingerprint,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.error('');
  console.error('[entity-pronunciation:coverage] summary');
  console.error(
    `  runtime-ready DE names        ${readyNames.toLocaleString()} / ${namesTotal.toLocaleString()} (${pct(readyNames, namesTotal)}%)`,
  );
  console.error(
    `  preferred DE names ready      ${readyPreferredNames.toLocaleString()} / ${preferredNames.toLocaleString()} (${pct(readyPreferredNames, preferredNames)}%)`,
  );
  console.error(
    `  entities with any ready name  ${entitiesAnyReady.toLocaleString()} / ${entityTotal.toLocaleString()} (${pct(entitiesAnyReady, entityTotal)}%)`,
  );
  console.error(
    `  Wikidata P898 source evidence ${p898Rows.toLocaleString()} rows / ${p898Names.toLocaleString()} names`,
  );
  console.error(
    `  CMUdict full-match candidates ${cmuFull.toLocaleString()} unresolved names`,
  );
  console.error(
    `  projected name coverage       ${report.source_probe.projected_name_coverage_if_all_full_matches_became_eligible}% (probe ceiling, not runtime acceptance)`,
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
