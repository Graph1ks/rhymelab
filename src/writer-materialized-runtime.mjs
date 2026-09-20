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
  'runtime_status',
  'product_adapter_status',
  'product_adapter_schema',
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
  const servingV1 =
    meta.schema === 'rhymelab-serving-v1'
    && meta.runtime_status === 'complete'
    && meta.product_adapter_status === 'complete';
  const servingTablesPresent = servingV1
    && tableExists(db,'runtime_key')
    && tableExists(db,'runtime_key_member')
    && tableExists(db,'runtime_surface_morphology');
  const tablesPresent = servingTablesPresent || (
    tableExists(db, 'writer_anchor')
    && tableExists(db, 'form_analysis')
    && tableExists(db, 'writer_morphology_evidence')
  );
  const legacyActive = meta.schema === WRITER_V5_DB_SCHEMA
    && meta.writer_anchor_storage === WRITER_ANCHOR_STORAGE
    && meta.writer_anchor_candidate_basis === WRITER_ANCHOR_CANDIDATE_BASIS
    && meta.writer_morphology_policy === WRITER_MORPHOLOGY_POLICY
    && meta.writer_morphology_storage === WRITER_MORPHOLOGY_STORAGE
    && tablesPresent;
  const active = Boolean(legacyActive || servingTablesPresent);
  const state = {
    active,
    servingV1:Boolean(servingTablesPresent),
    runtimeId: servingTablesPresent ? 'serving-v1-materialized-writer' : (active ? WRITER_V5_RUNTIME_ID : null),
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

function servingConnectionMode(db){
  try{return String(db.prepare('SELECT mode FROM temp.serving_runtime_connection').get()?.mode||'all');}
  catch{return 'all';}
}

function compareBoundedCandidate(a,b){
  return Number(a.usage_rank==null)-Number(b.usage_rank==null)
    ||Number(a.usage_rank??Number.MAX_SAFE_INTEGER)-Number(b.usage_rank??Number.MAX_SAFE_INTEGER)
    ||Number(a.source_order||0)-Number(b.source_order||0)
    ||Number(a.pronunciation_id||0)-Number(b.pronunciation_id||0);
}

function mergeBoundedRows(left,right,limit){
  const out=[];
  let i=0,j=0;
  while(out.length<limit&&(i<left.length||j<right.length)){
    if(j>=right.length||(i<left.length&&compareBoundedCandidate(left[i],right[j])<=0))out.push(left[i++]);
    else out.push(right[j++]);
  }
  return out;
}

function hydrateWriterRows(db,ids){
  const byId=new Map();
  for(const batch of chunks(ids,300)){
    if(!batch.length)continue;
    const marks=batch.map(()=>'?').join(',');
    const rows=db.prepare(`SELECT * FROM hot WHERE id IN (${marks})`).all(...batch);
    for(const row of rows)byId.set(Number(row.id),row);
  }
  return ids.map((id)=>byId.get(Number(id))).filter(Boolean);
}

function lookupBoundedServingWriterRows(db,anchorKey,options={}){
  const queryNormalized=String(options.queryNormalized||'');
  const querySyllables=Number(options.querySyllables||0);
  const includeVariants=options.includeVariants===true;
  const includeHistorical=options.includeHistorical===true;
  const generatedOnly=options.generatedOnly===true;
  const limit=Math.max(1,Math.min(800,Number(options.limit||800)));
  const mode=servingConnectionMode(db);
  const preferredColumn=mode==='core'?'core_preferred':'all_preferred';
  const where=[
    'key_value=?',
    'normalized<>?',
    mode==='core'?'canonical_available=1':'(canonical_available=1 OR generated_available=1)',
    includeVariants?'1=1':`${preferredColumn}=1`,
    includeHistorical?'1=1':'historical=0',
    generatedOnly?'generated_only=1':'1=1',
    'syllable_count=?',
  ].join(' AND ');
  const stmt=db.prepare(`
    SELECT pronunciation_id,usage_rank,source_order
    FROM runtime_de_writer_candidate
    WHERE ${where}
    ORDER BY usage_rank IS NULL,usage_rank,source_order,pronunciation_id
    LIMIT ?
  `);
  const exact=querySyllables>0
    ?stmt.all(String(anchorKey),queryNormalized,querySyllables,limit)
    :[];
  const remaining=Math.max(0,limit-exact.length);
  if(!remaining)return hydrateWriterRows(db,exact.map((row)=>Number(row.pronunciation_id)));
  const low=querySyllables>1
    ?stmt.all(String(anchorKey),queryNormalized,querySyllables-1,remaining)
    :[];
  const high=querySyllables>=0
    ?stmt.all(String(anchorKey),queryNormalized,querySyllables+1,remaining)
    :[];
  const near=mergeBoundedRows(low,high,remaining);
  return hydrateWriterRows(
    db,[...exact,...near].map((row)=>Number(row.pronunciation_id))
  );
}

export function lookupMaterializedWriterAnchorRows(db, anchorKey, options = {}) {
  const state = materializedWriterRuntimeState(db);
  if (!state.active) throw new Error('Materialized writer runtime is not active for this database');
  if(!state.servingV1) return lookupWriterAnchorRows(db, anchorKey, options);

  if(tableExists(db,'runtime_de_writer_candidate')){
    return lookupBoundedServingWriterRows(db,anchorKey,options);
  }

  const queryNormalized=String(options.queryNormalized||'');
  const querySyllables=Number(options.querySyllables||0);
  const includeVariants=options.includeVariants===true;
  const includeHistorical=options.includeHistorical===true;
  const generatedOnly=options.generatedOnly===true;
  const limit=Math.max(1,Math.min(800,Number(options.limit||800)));
  const preferred=includeVariants?'':' AND h.pronunciation_preferred=1';
  const historical=includeHistorical?'':' AND h.historical=0';
  const generated=generatedOnly?" AND h.pronunciation_flags LIKE '%secondary_opt_in%'":'';
  return db.prepare(`
    SELECT h.*
    FROM runtime_key k
    JOIN runtime_key_member km USING(key_id)
    JOIN runtime_target t ON t.target_id=km.target_id
    JOIN hot h ON h.id=t.pronunciation_id
    WHERE k.language='de'
      AND k.channel='writer_right_edge'
      AND k.key_value=?
      AND h.normalized<>?
      AND ABS(h.syllable_count-?)<=1
      ${preferred}${historical}${generated}
    ORDER BY ABS(h.syllable_count-?),h.usage_rank IS NULL,h.usage_rank,h.id
    LIMIT ?
  `).all(String(anchorKey),queryNormalized,querySyllables,querySyllables,limit);
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

  if(state.servingV1){
    const normalized=[...new Set((rows||[]).map((row)=>normalizeSurface(
      row?.normalized||row?.surface||row?.word
    )).filter(Boolean))];
    for(const batch of chunks(normalized)){
      if(!batch.length)continue;
      const marks=batch.map(()=>'?').join(',');
      const found=db.prepare(`
        SELECT
          s.normalized,s.lemma,s.part_of_speech,
          m.status,m.family_key,m.construction_rule,m.analysis_count,
          m.stored_positive_count,m.supported_family_count
        FROM surface s
        JOIN runtime_surface_morphology m USING(surface_id)
        WHERE s.language='de' AND s.normalized IN (${marks})
      `).all(...batch);
      for(const row of found){
        const resolved=row.status==='attested_right_head_candidate'&&row.family_key;
        result.set(row.normalized,{
          policy:WRITER_MORPHOLOGY_POLICY,
          status:row.status||'unresolved',
          consensusStatus:resolved?'resolved_converged':(row.status||'unresolved'),
          inferred:false,
          familyKey:resolved?row.family_key:null,
          constructionRule:resolved?(row.construction_rule||null):null,
          split:null,
          source:'materialized_multi_analysis_right_head_evidence',
          wholeLemma:row.lemma||null,
          wholePartOfSpeech:row.part_of_speech||null,
          analysisCount:Number(row.analysis_count||0),
          storedPositiveCount:Number(row.stored_positive_count||0),
          supportedFamilies:resolved?[{familyKey:row.family_key,analysisKeys:[]}]:[],
        });
      }
    }
    for(const normalizedValue of normalized){
      if(!result.has(normalizedValue)){
        result.set(normalizedValue,{
          policy:WRITER_MORPHOLOGY_POLICY,status:'unresolved',consensusStatus:'unresolved',
          inferred:false,familyKey:null,constructionRule:null,split:null,
          source:'materialized_multi_analysis_right_head_evidence',
          wholeLemma:null,wholePartOfSpeech:null,analysisCount:0,storedPositiveCount:0,
          supportedFamilies:[],
        });
      }
    }
    return result;
  }

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
