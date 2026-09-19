import { createHash } from 'node:crypto';

export const PRONUNCIATION_BACKFILL_SCHEMA='rhymelab-pronunciation-backfill-v2';
export const PRONUNCIATION_BACKFILL_POLICY='source-diff-espeak-then-client-resolver-staging-v2';

export function hashJson(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function createPronunciationBackfillStorage(db){
  db.exec([
    'PRAGMA foreign_keys=ON;',
    'PRAGMA journal_mode=WAL;',
    'PRAGMA synchronous=NORMAL;',
    'CREATE TABLE IF NOT EXISTS meta(',
    '  key TEXT PRIMARY KEY,',
    '  value TEXT NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS scan_state(',
    '  scope TEXT PRIMARY KEY,',
    '  status TEXT NOT NULL,',
    '  last_key TEXT,',
    '  scanned INTEGER NOT NULL DEFAULT 0,',
    '  source_refs INTEGER NOT NULL DEFAULT 0,',
    '  unique_items_added INTEGER NOT NULL DEFAULT 0,',
    '  updated_at TEXT NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS work_item(',
    '  item_id INTEGER PRIMARY KEY,',
    '  language TEXT NOT NULL CHECK(language IN (\'de\',\'en\')),',
    '  normalized TEXT NOT NULL,',
    '  surface TEXT NOT NULL,',
    '  token_count INTEGER NOT NULL DEFAULT 1,',
    '  source_ref_count INTEGER NOT NULL DEFAULT 0,',
    '  espeak_status TEXT NOT NULL DEFAULT \'pending\',',
    '  client_status TEXT NOT NULL DEFAULT \'pending\',',
    '  final_status TEXT NOT NULL DEFAULT \'pending\',',
    '  quality_tier TEXT,',
    '  quality_reason TEXT,',
    '  final_method TEXT,',
    '  ipa TEXT,',
    '  raw_ipa TEXT,',
    '  syllable_count INTEGER,',
    '  primary_stress INTEGER,',
    '  stress_pattern TEXT,',
    '  exact_tail_key TEXT,',
    '  vowel_key TEXT,',
    '  coda_key TEXT,',
    '  source_backed INTEGER NOT NULL DEFAULT 0 CHECK(source_backed IN (0,1)),',
    '  engine TEXT,',
    '  engine_version TEXT,',
    '  last_error TEXT,',
    '  updated_at TEXT NOT NULL,',
    '  UNIQUE(language,normalized)',
    ');',
    'CREATE TABLE IF NOT EXISTS source_ref(',
    '  source_ref_id INTEGER PRIMARY KEY,',
    '  item_id INTEGER NOT NULL REFERENCES work_item(item_id) ON DELETE CASCADE,',
    '  scope TEXT NOT NULL,',
    '  source_db TEXT NOT NULL,',
    '  source_table TEXT NOT NULL,',
    '  source_key TEXT NOT NULL,',
    '  surface TEXT NOT NULL,',
    '  context_json TEXT NOT NULL DEFAULT \'{}\',',
    '  UNIQUE(scope,source_key)',
    ');',
    'CREATE TABLE IF NOT EXISTS attempt(',
    '  attempt_id INTEGER PRIMARY KEY,',
    '  item_id INTEGER NOT NULL REFERENCES work_item(item_id) ON DELETE CASCADE,',
    '  stage TEXT NOT NULL,',
    '  status TEXT NOT NULL,',
    '  reason TEXT,',
    '  elapsed_ms REAL,',
    '  detail_json TEXT NOT NULL DEFAULT \'{}\',',
    '  created_at TEXT NOT NULL',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_backfill_work_espeak ON work_item(espeak_status,item_id);',
    'CREATE INDEX IF NOT EXISTS idx_backfill_work_client ON work_item(client_status,espeak_status,item_id);',
    'CREATE INDEX IF NOT EXISTS idx_backfill_work_final ON work_item(final_status,quality_tier,item_id);',
    'CREATE INDEX IF NOT EXISTS idx_backfill_source_item ON source_ref(item_id,scope);',
    'CREATE INDEX IF NOT EXISTS idx_backfill_attempt_item ON attempt(item_id,stage,attempt_id);',
  ].join('\n'));
}

export function classifyEspeakResolution(inspected){
  if(inspected?.status!=='accepted') return null;
  const changed=String(inspected.rawIpa||'')!==String(inspected.ipa||'');
  return {
    qualityTier:changed?'B':'A',
    qualityReason:changed
      ?'espeak_analyzer_accepted_after_normalization'
      :'espeak_analyzer_accepted_direct',
    method:'espeak_ng',
  };
}

export function classifyClientResolution(detail){
  if(!detail?.ipa) return null;
  const methods=Array.isArray(detail.tokens)&&detail.tokens.length
    ?detail.tokens.map((row)=>row.method)
    :[detail.method];
  const fallbackCount=methods.filter((method)=>method==='client_grapheme_fallback').length;
  const sourceCompoundCount=methods.filter((method)=>method==='client_source_reference_compound').length;
  const ruleCount=methods.filter((method)=>method==='client_rules').length;
  if(detail.sourceBacked===true||sourceCompoundCount===methods.length){
    return {
      qualityTier:'B',
      qualityReason:'client_source_backed_composition',
      method:detail.method||'client_source_reference_compound',
    };
  }
  if(fallbackCount===0){
    return {
      qualityTier:'C',
      qualityReason:methods.length>1?'client_rule_token_chain':'client_rules',
      method:detail.method||'client_rules',
    };
  }
  return {
    qualityTier:'D',
    qualityReason:fallbackCount===methods.length
      ?'client_grapheme_fallback'
      :'client_mixed_rules_and_grapheme_fallback',
    method:detail.method||'client_token_chain',
  };
}

export function formatDuration(seconds){
  if(!Number.isFinite(seconds)||seconds<0) return '—';
  if(seconds<60) return seconds.toFixed(0)+'s';
  const minutes=Math.floor(seconds/60);
  const secs=Math.floor(seconds%60);
  if(minutes<60) return minutes+'m '+secs+'s';
  const hours=Math.floor(minutes/60);
  return hours+'h '+String(minutes%60).padStart(2,'0')+'m';
}

export function progressLine({
  phase,
  done,
  total,
  startedAt,
  accepted=0,
  rejected=0,
  errors=0,
  extra='',
}){
  const elapsed=Math.max(0.001,(Date.now()-startedAt)/1000);
  const rate=done/elapsed;
  const remaining=Math.max(0,total-done);
  const eta=rate>0?remaining/rate:Infinity;
  const pct=total?done*100/total:100;
  return [
    '['+phase+']',
    done.toLocaleString('en-US')+'/'+total.toLocaleString('en-US'),
    '('+pct.toFixed(2)+'%)',
    rate.toFixed(1)+'/s',
    'ETA '+formatDuration(eta),
    'accepted='+accepted.toLocaleString('en-US'),
    'rejected='+rejected.toLocaleString('en-US'),
    'errors='+errors.toLocaleString('en-US'),
    extra,
  ].filter(Boolean).join(' · ');
}

export function backfillSummary(db){
  const scalar=(sql,...params)=>Number(db.prepare(sql).get(...params)?.c||0);
  const quality=Object.fromEntries(
    db.prepare([
      'SELECT COALESCE(quality_tier,\'pending\') AS tier,COUNT(*) AS c',
      'FROM work_item',
      'GROUP BY COALESCE(quality_tier,\'pending\')',
      'ORDER BY tier',
    ].join(' ')).all().map((row)=>[row.tier,Number(row.c)]),
  );
  const scopes=Object.fromEntries(
    db.prepare([
      'SELECT scope,COUNT(*) AS c',
      'FROM source_ref',
      'GROUP BY scope',
      'ORDER BY scope',
    ].join(' ')).all().map((row)=>[row.scope,Number(row.c)]),
  );
  return {
    unique_items:scalar('SELECT COUNT(*) AS c FROM work_item'),
    source_refs:scalar('SELECT COUNT(*) AS c FROM source_ref'),
    espeak_accepted:scalar("SELECT COUNT(*) AS c FROM work_item WHERE espeak_status='accepted'"),
    espeak_rejected:scalar("SELECT COUNT(*) AS c FROM work_item WHERE espeak_status='rejected'"),
    client_accepted:scalar("SELECT COUNT(*) AS c FROM work_item WHERE client_status='accepted'"),
    unresolved:scalar("SELECT COUNT(*) AS c FROM work_item WHERE final_status='unresolved'"),
    pending:scalar("SELECT COUNT(*) AS c FROM work_item WHERE final_status='pending'"),
    quality,
    scopes,
  };
}
