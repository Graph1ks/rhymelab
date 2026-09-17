#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
let dbPath = 'data/local/rhymelab-phrases-v1.sqlite';
let outPath = 'data/local/phrase-catalog-v1-diagnostics.json';
let topLimit = 50;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--db') dbPath = args[++i] || dbPath;
  else if (arg === '--out') outPath = args[++i] || outPath;
  else if (arg === '--top') {
    const parsed = Number.parseInt(args[++i] || '', 10);
    if (Number.isInteger(parsed) && parsed > 0) topLimit = Math.min(parsed, 250);
  }
}

dbPath = resolve(dbPath);
outPath = resolve(outPath);
await mkdir(dirname(outPath), { recursive: true });

function tableExists(db, table) {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
  ).get(table));
}

function numberRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  }
  return out;
}

function rows(db, sql, ...params) {
  return db.prepare(sql).all(...params).map(numberRow);
}

function row(db, sql, ...params) {
  return numberRow(db.prepare(sql).get(...params) || {});
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function countJsonArrayValues(db, table, column) {
  const counts = new Map();
  for (const item of db.prepare('SELECT ' + column + ' AS value FROM ' + table).iterate()) {
    for (const value of parseJsonArray(item.value)) {
      const key = String(value);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'de'));
}

const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  const meta = Object.fromEntries(
    db.prepare('SELECT key,value FROM meta ORDER BY key').all()
      .map((item) => [item.key, item.value]),
  );

  const basic = row(db, `
    SELECT
      COUNT(*) AS phrases,
      SUM(CASE WHEN modern_eligible=1 THEN 1 ELSE 0 END) AS modern_eligible,
      SUM(CASE WHEN historical_state='historical_only' THEN 1 ELSE 0 END) AS historical_only,
      SUM(CASE WHEN historical_state='mixed' THEN 1 ELSE 0 END) AS mixed_historical,
      AVG(token_count) AS mean_tokens,
      MAX(token_count) AS max_tokens
    FROM phrase
  `);

  const historyDistribution = rows(db, `
    SELECT historical_state,COUNT(*) AS count
    FROM phrase
    GROUP BY historical_state
    ORDER BY count DESC,historical_state
  `);

  const tokenDistribution = rows(db, `
    SELECT token_count,COUNT(*) AS count
    FROM phrase
    GROUP BY token_count
    ORDER BY token_count
  `);

  const phraseTypes = countJsonArrayValues(db, 'phrase', 'phrase_types_json');
  const styleTags = countJsonArrayValues(db, 'phrase_attestation', 'style_tags_json');
  const sourcePos = rows(db, `
    SELECT source_pos,COUNT(*) AS count
    FROM phrase_attestation
    GROUP BY source_pos
    ORDER BY count DESC,source_pos
    LIMIT 100
  `);

  const totalLeipzigSnapshots = Number(row(db, `
    SELECT COUNT(DISTINCT snapshot_id) AS count
    FROM phrase_snapshot
    WHERE source_id='leipzig-corpora'
  `).count || 0);

  const leipzigMatched = Number(row(db, `
    SELECT COUNT(DISTINCT phrase_id) AS count
    FROM phrase_usage_evidence
  `).count || 0);

  const leipzigCoverageDistribution = rows(db, `
    WITH coverage AS (
      SELECT phrase_id,COUNT(DISTINCT snapshot_id) AS corpus_count
      FROM phrase_usage_evidence
      GROUP BY phrase_id
    )
    SELECT corpus_count,COUNT(*) AS phrase_count
    FROM coverage
    GROUP BY corpus_count
    ORDER BY corpus_count
  `);

  const modernEligible = Number(basic.modern_eligible || 0);
  const leipzig = {
    snapshots: totalLeipzigSnapshots,
    matchedPhrases: leipzigMatched,
    modernEligiblePhrases: modernEligible,
    modernEligibleCoveragePct: modernEligible > 0
      ? Number((leipzigMatched * 100 / modernEligible).toFixed(2))
      : 0,
    unmatchedModernEligible: Math.max(0, modernEligible - leipzigMatched),
    coverageDistribution: leipzigCoverageDistribution,
    topAggregate: totalLeipzigSnapshots > 0 ? rows(db, `
      SELECT
        p.phrase_id,p.canonical,p.normalized,p.token_count,p.phrase_types_json,
        COUNT(DISTINCT u.snapshot_id) AS corpus_count,
        SUM(u.occurrence_count) AS occurrences,
        SUM(u.sentence_count) AS sentence_hits,
        SUM(u.per_million_tokens)/? AS equal_weight_per_million_tokens,
        SUM(u.per_million_sentences)/? AS equal_weight_per_million_sentences
      FROM phrase_usage_evidence u
      JOIN phrase p ON p.phrase_id=u.phrase_id
      GROUP BY p.phrase_id
      ORDER BY
        corpus_count DESC,
        equal_weight_per_million_tokens DESC,
        occurrences DESC,
        p.normalized
      LIMIT ?
    `, totalLeipzigSnapshots, totalLeipzigSnapshots, topLimit) : [],
    byCorpus: [],
  };

  const leipzigSnapshots = rows(db, `
    SELECT snapshot_id,snapshot_label,evidence_year,genre,country
    FROM phrase_snapshot
    WHERE source_id='leipzig-corpora'
    ORDER BY snapshot_label
  `);
  for (const snapshot of leipzigSnapshots) {
    leipzig.byCorpus.push({
      ...snapshot,
      evidenceRows: Number(row(db, `
        SELECT COUNT(*) AS count
        FROM phrase_usage_evidence
        WHERE snapshot_id=?
      `, snapshot.snapshot_id).count || 0),
      top: rows(db, `
        SELECT
          p.phrase_id,p.canonical,p.normalized,p.token_count,p.phrase_types_json,
          u.occurrence_count,u.sentence_count,
          u.per_million_tokens,u.per_million_sentences
        FROM phrase_usage_evidence u
        JOIN phrase p ON p.phrase_id=u.phrase_id
        WHERE u.snapshot_id=?
        ORDER BY u.per_million_tokens DESC,u.occurrence_count DESC,p.normalized
        LIMIT ?
      `, snapshot.snapshot_id, topLimit),
    });
  }

  const anomalies = {
    longPhrases: rows(db, `
      SELECT phrase_id,canonical,normalized,token_count,phrase_types_json,historical_state
      FROM phrase
      WHERE token_count>=10
      ORDER BY token_count DESC,LENGTH(canonical) DESC,normalized
      LIMIT ?
    `, topLimit),
    digitBearing: rows(db, `
      SELECT phrase_id,canonical,normalized,token_count,phrase_types_json,historical_state
      FROM phrase
      WHERE canonical GLOB '*[0-9]*'
      ORDER BY token_count DESC,normalized
      LIMIT ?
    `, topLimit),
    punctuationHeavy: rows(db, `
      SELECT phrase_id,canonical,normalized,token_count,phrase_types_json,historical_state
      FROM phrase
      WHERE
        (LENGTH(canonical) - LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          canonical,',',''),'.',''),':',''),';',''),'!',''))) >= 3
      ORDER BY token_count DESC,normalized
      LIMIT ?
    `, topLimit),
    phrasesWithSingleCharacterTokens: rows(db, `
      SELECT DISTINCT p.phrase_id,p.canonical,p.normalized,p.token_count,p.phrase_types_json
      FROM phrase p
      JOIN phrase_token t ON t.phrase_id=p.phrase_id
      WHERE LENGTH(t.normalized)=1
      ORDER BY p.token_count DESC,p.normalized
      LIMIT ?
    `, topLimit),
  };

  let registerEvidence = {
    present: false,
    rows: 0,
    matchedPhrases: 0,
    snapshots: [],
    top: [],
  };

  if (tableExists(db, 'phrase_register_evidence')) {
    const registerStats = row(db, `
      SELECT
        COUNT(*) AS rows,
        COUNT(DISTINCT phrase_id) AS matched_phrases,
        COUNT(DISTINCT snapshot_id) AS snapshot_count,
        COALESCE(SUM(occurrence_count),0) AS occurrences
      FROM phrase_register_evidence
    `);
    registerEvidence = {
      present: true,
      rows: registerStats.rows,
      matchedPhrases: registerStats.matched_phrases,
      snapshotCount: registerStats.snapshot_count,
      occurrences: registerStats.occurrences,
      snapshots: rows(db, `
        SELECT
          s.snapshot_id,s.snapshot_label,s.source_id,s.evidence_year,s.genre,s.country,
          COUNT(r.phrase_id) AS evidence_rows,
          COUNT(DISTINCT r.phrase_id) AS matched_phrases,
          COALESCE(SUM(r.occurrence_count),0) AS occurrences
        FROM phrase_snapshot s
        JOIN phrase_register_evidence r ON r.snapshot_id=s.snapshot_id
        GROUP BY s.snapshot_id
        ORDER BY s.snapshot_label
      `),
      top: rows(db, `
        SELECT
          p.phrase_id,p.canonical,p.normalized,p.token_count,p.phrase_types_json,
          COUNT(DISTINCT r.snapshot_id) AS snapshot_count,
          SUM(r.occurrence_count) AS occurrences,
          SUM(r.unit_count) AS unit_hits,
          AVG(r.per_million_tokens) AS mean_per_million_tokens,
          GROUP_CONCAT(DISTINCT s.snapshot_label) AS snapshots
        FROM phrase_register_evidence r
        JOIN phrase p ON p.phrase_id=r.phrase_id
        JOIN phrase_snapshot s ON s.snapshot_id=r.snapshot_id
        GROUP BY p.phrase_id
        ORDER BY snapshot_count DESC,occurrences DESC,mean_per_million_tokens DESC,p.normalized
        LIMIT ?
      `, topLimit),
    };
  }

  const report = {
    schema: 'rhymelab-phrase-catalog-diagnostics-v1',
    generated_at: new Date().toISOString(),
    database: dbPath,
    catalog_schema: meta.schema || null,
    catalog_policy: meta.policy || null,
    catalog_fingerprint: meta.catalog_fingerprint || null,
    basic,
    historyDistribution,
    tokenDistribution,
    phraseTypes,
    styleTags,
    sourcePos,
    leipzig,
    registerEvidence,
    anomalies,
    notes: [
      'Leipzig equal-weight aggregate divides summed per-million evidence by the full configured Leipzig snapshot count, so missing corpora contribute zero rather than disappearing from the mean.',
      'Cologne/register evidence, when present, is a register-attestation signal and is not treated as representative general German commonness.',
      'Anomaly samples are diagnostics only; they are not automatic exclusion decisions.',
    ],
  };

  await writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    schema: report.schema,
    database: report.database,
    catalog_fingerprint: report.catalog_fingerprint,
    phrases: basic.phrases,
    modern_eligible: basic.modern_eligible,
    leipzig_matched_phrases: leipzig.matchedPhrases,
    leipzig_coverage_pct: leipzig.modernEligibleCoveragePct,
    leipzig_coverage_distribution: leipzig.coverageDistribution,
    register_evidence_present: registerEvidence.present,
    register_matched_phrases: registerEvidence.matchedPhrases,
    report: outPath,
  }, null, 2));
} finally {
  db.close();
}
