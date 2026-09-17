#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { rightHeadSplitCandidates } from '../src/writer-morphology.mjs';
import { WRITER_LEXICAL_DB_SCHEMA } from './writer-lexical-storage-v5-core.mjs';
import {
  WRITER_ANCHOR_POLICY,
  createWriterAnchorStorage,
  insertWriterCandidateSuffixRows,
  prepareWriterAnchorInsert,
  writerAnchorLookupPlan,
} from './writer-anchor-materialization-v5-core.mjs';
import {
  WRITER_MORPHOLOGY_POLICY,
  createWriterMorphologyEvidenceStorage,
  deriveWriterMorphologyForForm,
  insertWriterMorphologyEvidence,
  prepareWriterMorphologyEvidenceInsert,
} from './writer-morphology-materialization-v5-core.mjs';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] || fallback) : fallback;
}

const dbPath = resolve(argValue('--db', 'data/local/rhymelab-v5.sqlite'));
const reportPath = resolve(argValue('--report', 'data/local/writer-materialization-v5-report.json'));
const batchSize = Math.max(50, Math.min(5000, Number.parseInt(argValue('--batch-size', '1000'), 10) || 1000));
const lookupBatchSize = 300;
const mib = (bytes) => Number((Number(bytes || 0) / 1024 / 1024).toFixed(2));

try {
  await access(dbPath);
} catch {
  throw new Error(`Writer materialization database does not exist: ${dbPath}. Build the experimental v5 DB first with: node scripts/build-local-db.mjs --publish data/de/publish-v3`);
}

function logicalDbBytes(db) {
  const pageCount = Number(db.prepare('PRAGMA page_count').get()?.page_count || 0);
  const pageSize = Number(db.prepare('PRAGMA page_size').get()?.page_size || 0);
  return pageCount * pageSize;
}

function chunks(values, size = lookupBatchSize) {
  const out = [];
  for (let start = 0; start < values.length; start += size) out.push(values.slice(start, start + size));
  return out;
}

function queryByIds(db, ids, selectSqlPrefix) {
  const rows = [];
  for (const batch of chunks(ids)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(',');
    rows.push(...db.prepare(`${selectSqlPrefix} (${placeholders})`).all(...batch));
  }
  return rows;
}

function loadAnalysesByFormId(db, formIds) {
  const byForm = new Map();
  const rows = queryByIds(db, formIds, `
    SELECT form_id,analysis_key,lemma,normalized_lemma,pos,homograph_no,confidence,gender,
           is_proper,is_obsolete,historical_only,style_tags,form_features,match_kinds,
           source_record_keys,candidate_ipas
    FROM form_analysis
    WHERE form_id IN
  `);
  for (const row of rows) {
    if (!byForm.has(Number(row.form_id))) byForm.set(Number(row.form_id), []);
    byForm.get(Number(row.form_id)).push({
      analysisKey: row.analysis_key,
      lemma: row.lemma,
      normalizedLemma: row.normalized_lemma,
      pos: row.pos,
      homographNo: Number(row.homograph_no),
      confidence: Number(row.confidence),
      gender: row.gender,
      isProper: Boolean(row.is_proper),
      isObsolete: Boolean(row.is_obsolete),
      historicalOnly: Boolean(row.historical_only),
      styleTags: JSON.parse(row.style_tags || '[]'),
      formFeatures: JSON.parse(row.form_features || '[]'),
      matchKinds: JSON.parse(row.match_kinds || '[]'),
      sourceRecordKeys: JSON.parse(row.source_record_keys || '[]'),
      candidateIpas: JSON.parse(row.candidate_ipas || '[]'),
    });
  }
  for (const analyses of byForm.values()) {
    analyses.sort((a, b) => b.confidence - a.confidence
      || a.analysisKey.localeCompare(b.analysisKey, 'de'));
  }
  return byForm;
}

function loadAttestedEvidence(db, normalizedForms) {
  const firstByNormalized = new Map();
  const unique = [...new Set(normalizedForms)].sort((a, b) => a.localeCompare(b, 'de'));
  for (const batch of chunks(unique)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT publish_order,normalized,surface,usage_rank
      FROM hot
      WHERE normalized IN (${placeholders})
        AND pronunciation_preferred=1
        AND historical=0
      ORDER BY normalized, usage_rank IS NULL, usage_rank, id
    `).all(...batch);
    for (const row of rows) {
      if (!firstByNormalized.has(row.normalized)) firstByNormalized.set(row.normalized, row);
    }
  }

  const analysesByForm = loadAnalysesByFormId(
    db,
    [...new Set([...firstByNormalized.values()].map((row) => Number(row.publish_order)))],
  );
  const attested = new Map();
  for (const [normalized, row] of firstByNormalized) {
    attested.set(normalized, {
      surface: row.surface,
      usageRank: row.usage_rank,
      analyses: analysesByForm.get(Number(row.publish_order)) || [],
    });
  }
  return attested;
}

function materializeAnchors(db) {
  createWriterAnchorStorage(db);
  db.prepare('DELETE FROM writer_anchor WHERE anchor_policy=?').run(WRITER_ANCHOR_POLICY);
  const insert = prepareWriterAnchorInsert(db);
  let afterId = 0;
  let pronunciations = 0;
  let anchorRows = 0;
  let batches = 0;

  while (true) {
    const rows = db.prepare(`
      SELECT id,ipa
      FROM hot
      WHERE id>?
      ORDER BY id
      LIMIT ?
    `).all(afterId, batchSize);
    if (!rows.length) break;
    db.exec('BEGIN');
    try {
      for (const row of rows) {
        anchorRows += insertWriterCandidateSuffixRows(db, Number(row.id), row.ipa, insert);
        pronunciations += 1;
        afterId = Number(row.id);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    batches += 1;
    console.log(
      `[writer-v5 anchors] batches=${batches} pronunciations=${pronunciations.toLocaleString('de-DE')} rows=${anchorRows.toLocaleString('de-DE')}`,
    );
  }
  return { pronunciations, anchorRows, batches };
}

function materializeMorphology(db) {
  createWriterMorphologyEvidenceStorage(db);
  db.prepare('DELETE FROM writer_morphology_evidence WHERE morphology_policy=?')
    .run(WRITER_MORPHOLOGY_POLICY);
  const insert = prepareWriterMorphologyEvidenceInsert(db);
  let afterFormId = 0;
  let formsSeen = 0;
  let formsWithAnalyses = 0;
  let evidenceRows = 0;
  let batches = 0;

  while (true) {
    const forms = db.prepare(`
      SELECT publish_order AS form_id,normalized,surface
      FROM hot
      WHERE publish_order>?
        AND pronunciation_preferred=1
      GROUP BY publish_order,normalized,surface
      ORDER BY publish_order
      LIMIT ?
    `).all(afterFormId, batchSize);
    if (!forms.length) break;
    afterFormId = Number(forms.at(-1).form_id);
    formsSeen += forms.length;

    const analysesByForm = loadAnalysesByFormId(db, forms.map((row) => Number(row.form_id)));
    const lookupForms = new Set();
    for (const form of forms) {
      for (const candidate of rightHeadSplitCandidates(form.normalized)) {
        lookupForms.add(candidate.right);
        for (const left of candidate.leftVariants) lookupForms.add(left.normalized);
      }
    }
    const attested = loadAttestedEvidence(db, [...lookupForms]);

    db.exec('BEGIN');
    try {
      for (const form of forms) {
        const formId = Number(form.form_id);
        const analyses = analysesByForm.get(formId) || [];
        if (!analyses.length) continue;
        formsWithAnalyses += 1;
        const derived = deriveWriterMorphologyForForm(form, analyses, attested);
        evidenceRows += insertWriterMorphologyEvidence(db, formId, derived.evidence, insert);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    batches += 1;
    console.log(
      `[writer-v5 morphology] batches=${batches} forms=${formsSeen.toLocaleString('de-DE')} formsWithAnalyses=${formsWithAnalyses.toLocaleString('de-DE')} evidenceRows=${evidenceRows.toLocaleString('de-DE')}`,
    );
  }

  const resolvedRows = Number(db.prepare(`
    SELECT COUNT(*) AS c
    FROM writer_morphology_evidence
    WHERE morphology_policy=? AND family_key IS NOT NULL
  `).get(WRITER_MORPHOLOGY_POLICY)?.c || 0);
  const unresolvedRows = evidenceRows - resolvedRows;
  const ambiguousForms = Number(db.prepare(`
    SELECT COUNT(*) AS c FROM (
      SELECT form_id
      FROM writer_morphology_evidence
      WHERE morphology_policy=? AND family_key IS NOT NULL
      GROUP BY form_id
      HAVING COUNT(DISTINCT family_key)>1
    )
  `).get(WRITER_MORPHOLOGY_POLICY)?.c || 0);

  return {
    batches,
    formsSeen,
    formsWithAnalyses,
    evidenceRows,
    resolvedRows,
    unresolvedRows,
    ambiguousForms,
  };
}

const db = new DatabaseSync(dbPath);
try {
  const schema = db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  if (schema !== WRITER_LEXICAL_DB_SCHEMA) {
    throw new Error(`Writer materialization requires ${WRITER_LEXICAL_DB_SCHEMA}; found ${schema || 'missing'}`);
  }

  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  const logicalBytesBefore = logicalDbBytes(db);
  console.log(`[writer-v5] starting materialization; logical SQLite size=${mib(logicalBytesBefore)} MiB`);

  const anchors = materializeAnchors(db);
  const morphology = materializeMorphology(db);

  const sampleAnchor = db.prepare(`
    SELECT anchor_key
    FROM writer_anchor
    WHERE anchor_policy=?
    ORDER BY nuclei DESC, anchor_key
    LIMIT 1
  `).get(WRITER_ANCHOR_POLICY)?.anchor_key || null;
  const lookupPlan = sampleAnchor
    ? writerAnchorLookupPlan(db, sampleAnchor).map((row) => String(row.detail || ''))
    : [];
  const usesAnchorIndex = lookupPlan.some((detail) => detail.includes('idx_writer_anchor_lookup'));

  const meta = db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)');
  meta.run('writer_anchor_policy', WRITER_ANCHOR_POLICY);
  meta.run('writer_anchor_rows', String(anchors.anchorRows));
  meta.run('writer_morphology_policy', WRITER_MORPHOLOGY_POLICY);
  meta.run('writer_morphology_evidence_rows', String(morphology.evidenceRows));

  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const logicalBytesAfter = logicalDbBytes(db);
  const logicalBytesDelta = logicalBytesAfter - logicalBytesBefore;

  const report = {
    schema: 'rhymelab-writer-materialization-v5-report-v1',
    generated_at: new Date().toISOString(),
    database_schema: schema,
    anchor_policy: WRITER_ANCHOR_POLICY,
    morphology_policy: WRITER_MORPHOLOGY_POLICY,
    storage: {
      logical_bytes_before: logicalBytesBefore,
      logical_mib_before: mib(logicalBytesBefore),
      logical_bytes_after: logicalBytesAfter,
      logical_mib_after: mib(logicalBytesAfter),
      logical_bytes_delta: logicalBytesDelta,
      logical_mib_delta: mib(logicalBytesDelta),
    },
    anchors: {
      pronunciations_processed: anchors.pronunciations,
      batches: anchors.batches,
      rows: anchors.anchorRows,
      lookup_index: 'idx_writer_anchor_lookup',
      sample_query_plan: lookupPlan,
      sample_query_plan_uses_lookup_index: usesAnchorIndex,
    },
    morphology,
    accepted_runtime_rewired: false,
    writer_runtime_rewired: false,
    note: 'Materialization only. Runtime switching requires separate candidate-equivalence and owner benchmark gates.',
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));
} finally {
  db.close();
}
