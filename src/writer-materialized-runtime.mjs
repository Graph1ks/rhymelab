import {
  WRITER_ANCHOR_CANDIDATE_BASIS,
  WRITER_ANCHOR_STORAGE,
  lookupWriterAnchorRows,
} from '../scripts/writer-anchor-materialization-v5-core.mjs';
import { WRITER_MORPHOLOGY_STORAGE } from '../scripts/writer-morphology-materialization-v5-core.mjs';
import { WRITER_MORPHOLOGY_POLICY } from './writer-morphology.mjs';

export const WRITER_V5_DB_SCHEMA = 'rhymelab-local-db-v5';
export const WRITER_V5_RUNTIME_ID = 'materialized-writer-v5-v1';

const META_KEYS = [
  'schema',
  'writer_anchor_policy',
  'writer_anchor_storage',
  'writer_anchor_candidate_basis',
  'writer_morphology_policy',
  'writer_morphology_storage',
];
const LOOKUP_BATCH_SIZE = 300;
const STATE_CACHE = new WeakMap();

function normalizeSurface(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE');
}

function chunks(values, size = LOOKUP_BATCH_SIZE) {
  const out = [];
  for (let start = 0; start < values.length; start += size) out.push(values.slice(start, start + size));
  return out;
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name));
}

export function materializedWriterRuntimeState(db, options = {}) {
  const refresh = options.refresh === true;
  if (!refresh && STATE_CACHE.has(db)) return STATE_CACHE.get(db);

  const meta = Object.fromEntries(
    db.prepare(`SELECT key,value FROM meta WHERE key IN (${META_KEYS.map(() => '?').join(',')})`)
      .all(...META_KEYS)
      .map((row) => [row.key, row.value]),
  );
  const tablesPresent = tableExists(db, 'writer_anchor')
    && tableExists(db, 'form_analysis')
    && tableExists(db, 'writer_morphology_evidence');
  const active = meta.schema === WRITER_V5_DB_SCHEMA
    && meta.writer_anchor_storage === WRITER_ANCHOR_STORAGE
    && meta.writer_anchor_candidate_basis === WRITER_ANCHOR_CANDIDATE_BASIS
    && meta.writer_morphology_policy === WRITER_MORPHOLOGY_POLICY
    && meta.writer_morphology_storage === WRITER_MORPHOLOGY_STORAGE
    && tablesPresent;
  const state = {
    active,
    runtimeId: active ? WRITER_V5_RUNTIME_ID : null,
    databaseSchema: meta.schema || null,
    anchorPolicy: meta.writer_anchor_policy || null,
    anchorStorage: meta.writer_anchor_storage || null,
    anchorCandidateBasis: meta.writer_anchor_candidate_basis || null,
    morphologyPolicy: meta.writer_morphology_policy || null,
    morphologyStorage: meta.writer_morphology_storage || null,
    tablesPresent,
  };
  STATE_CACHE.set(db, state);
  return state;
}

export function lookupMaterializedWriterAnchorRows(db, anchorKey, options = {}) {
  const state = materializedWriterRuntimeState(db);
  if (!state.active) throw new Error('Materialized writer runtime is not active for this database');
  return lookupWriterAnchorRows(db, anchorKey, options);
}

function firstFormsByNormalized(db, normalizedForms) {
  const byNormalized = new Map();
  const unique = [...new Set(normalizedForms.map(normalizeSurface).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'de'));
  for (const batch of chunks(unique)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT publish_order AS form_id, normalized, surface, lemma, pos, usage_rank, historical
      FROM hot
      WHERE normalized IN (${placeholders})
        AND pronunciation_preferred=1
      ORDER BY normalized, historical, usage_rank IS NULL, usage_rank, id
    `).all(...batch);
    for (const row of rows) {
      if (!byNormalized.has(row.normalized)) byNormalized.set(row.normalized, row);
    }
  }
  return byNormalized;
}

function analysesByFormId(db, formIds) {
  const byForm = new Map();
  const unique = [...new Set(formIds.map(Number).filter((value) => Number.isInteger(value) && value > 0))];
  for (const batch of chunks(unique)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT form_id, analysis_key, normalized_lemma, pos
      FROM form_analysis
      WHERE form_id IN (${placeholders})
      ORDER BY form_id, analysis_key
    `).all(...batch);
    for (const row of rows) {
      const formId = Number(row.form_id);
      if (!byForm.has(formId)) byForm.set(formId, []);
      byForm.get(formId).push(row);
    }
  }
  return byForm;
}

function positiveEvidenceByFormId(db, formIds) {
  const byForm = new Map();
  const unique = [...new Set(formIds.map(Number).filter((value) => Number.isInteger(value) && value > 0))];
  for (const batch of chunks(unique)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT form_id, analysis_key, family_key, construction_rule, split_index,
             left_normalized, right_normalized, right_head_analysis_key
      FROM writer_morphology_evidence
      WHERE form_id IN (${placeholders})
      ORDER BY form_id, analysis_key
    `).all(...batch);
    for (const row of rows) {
      const formId = Number(row.form_id);
      if (!byForm.has(formId)) byForm.set(formId, []);
      byForm.get(formId).push(row);
    }
  }
  return byForm;
}

function materializedMorphologyEvidence(row, form, analyses, positiveRows) {
  const supported = new Map();
  for (const evidence of positiveRows) {
    const familyKey = String(evidence.family_key || '').trim();
    if (!familyKey) continue;
    if (!supported.has(familyKey)) supported.set(familyKey, []);
    supported.get(familyKey).push(evidence);
  }
  const supportedFamilies = [...supported.entries()]
    .map(([familyKey, rows]) => ({
      familyKey,
      analysisKeys: rows.map((entry) => String(entry.analysis_key)).sort((a, b) => a.localeCompare(b, 'de')),
    }))
    .sort((a, b) => a.familyKey.localeCompare(b.familyKey, 'de'));
  const wholeLemma = normalizeSurface(row?.lemma || form?.lemma) || null;
  const wholePartOfSpeech = String(row?.partOfSpeech || row?.pos || form?.pos || '').trim() || null;
  const base = {
    policy: WRITER_MORPHOLOGY_POLICY,
    inferred: false,
    source: 'materialized_multi_analysis_right_head_evidence',
    wholeLemma,
    wholePartOfSpeech,
    analysisCount: analyses.length,
    storedPositiveCount: positiveRows.length,
    supportedFamilies,
  };

  if (supportedFamilies.length === 0) {
    return {
      ...base,
      status: 'unresolved',
      consensusStatus: 'unresolved',
      familyKey: null,
      constructionRule: null,
      split: null,
    };
  }
  if (supportedFamilies.length > 1) {
    return {
      ...base,
      status: 'ambiguous_conflict',
      consensusStatus: 'ambiguous_conflict',
      familyKey: null,
      constructionRule: null,
      split: null,
    };
  }

  const familyKey = supportedFamilies[0].familyKey;
  const supportRows = [...(supported.get(familyKey) || [])]
    .sort((a, b) => String(a.analysis_key).localeCompare(String(b.analysis_key), 'de'));
  const first = supportRows[0] || null;
  const ruleKeys = [...new Set(supportRows.map((entry) => entry.construction_rule ?? null))];
  const constructionRule = ruleKeys.length === 1 ? ruleKeys[0] : null;
  return {
    ...base,
    status: 'attested_right_head_candidate',
    consensusStatus: 'resolved_converged',
    familyKey,
    constructionRule,
    split: first && first.split_index != null ? {
      index: Number(first.split_index),
      leftRaw: first.left_normalized || null,
      right: first.right_normalized || null,
    } : null,
    rightHead: first ? {
      normalized: first.right_normalized || null,
      analysisKey: first.right_head_analysis_key || null,
    } : null,
  };
}

export function resolveMaterializedWriterMorphologyBatch(db, rows, language = 'de') {
  const result = new Map();
  if (language !== 'de') return result;
  const state = materializedWriterRuntimeState(db);
  if (!state.active) throw new Error('Materialized writer runtime is not active for this database');

  const uniqueRows = [];
  const seen = new Set();
  for (const row of rows || []) {
    const normalized = normalizeSurface(row?.normalized || row?.surface || row?.word);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    uniqueRows.push({ ...row, normalized });
  }
  const forms = firstFormsByNormalized(db, uniqueRows.map((row) => row.normalized));
  const formIds = [...forms.values()].map((row) => Number(row.form_id));
  const analyses = analysesByFormId(db, formIds);
  const positives = positiveEvidenceByFormId(db, formIds);

  for (const row of uniqueRows) {
    const form = forms.get(row.normalized) || null;
    if (!form) {
      result.set(row.normalized, {
        policy: WRITER_MORPHOLOGY_POLICY,
        status: 'unresolved',
        consensusStatus: 'unresolved',
        inferred: false,
        familyKey: null,
        constructionRule: null,
        split: null,
        source: 'materialized_multi_analysis_right_head_evidence',
        wholeLemma: normalizeSurface(row?.lemma) || null,
        wholePartOfSpeech: String(row?.partOfSpeech || row?.pos || '').trim() || null,
        analysisCount: 0,
        storedPositiveCount: 0,
        supportedFamilies: [],
      });
      continue;
    }
    const formId = Number(form.form_id);
    result.set(
      row.normalized,
      materializedMorphologyEvidence(
        row,
        form,
        analyses.get(formId) || [],
        positives.get(formId) || [],
      ),
    );
  }
  return result;
}
