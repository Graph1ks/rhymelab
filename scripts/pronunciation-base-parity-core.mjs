import { createHash } from 'node:crypto';

export const GENERATED_BASE_PARITY_SCHEMA='rhymelab-generated-base-parity-v1';
export const GENERATED_BASE_PARITY_POLICY='canonical-schema-opt-in-generated-overlay-v1';

export const DE_WORD_SCOPES=new Set([
  'de_usage_source_minus_accepted',
  'de_wiktionary_headword_source_minus_accepted',
  'de_listed_form_source_minus_accepted',
  'phrase_unresolved_token',
]);
export const EN_WORD_SCOPES=new Set([
  'en_wiktionary_lexical_source_minus_accepted',
]);
export const PHRASE_SURFACE_SCOPES=new Set([
  'phrase_surface_unresolved',
]);
export const ENTITY_SCOPES=new Set([
  'entity_de_no_source_pronunciation',
  'entity_en_no_source_pronunciation',
]);

export function activeGeneratedRow(row){
  return row?.final_status==='resolved'
    && row?.final_method==='espeak_ng'
    && (row?.quality_tier==='A'||row?.quality_tier==='B');
}

export function deferredBucket(row){
  if(row?.final_status==='unresolved'||row?.quality_tier==='U')return 'U_unresolved';
  if(row?.final_method==='espeak_ng')return null;
  if(row?.quality_tier==='B')return 'client_B_source_backed';
  if(row?.quality_tier==='C')return 'client_C_rules';
  if(row?.quality_tier==='D')return 'client_D_grapheme';
  return 'other_non_espeak';
}

export function scopeClass(scopes){
  const set=new Set(scopes||[]);
  return {
    deWord:[...set].some((scope)=>DE_WORD_SCOPES.has(scope)),
    enWord:[...set].some((scope)=>EN_WORD_SCOPES.has(scope)),
    phraseSurface:[...set].some((scope)=>PHRASE_SURFACE_SCOPES.has(scope)),
    entity:[...set].some((scope)=>ENTITY_SCOPES.has(scope)),
  };
}

export function sqliteSchemaRows(db){
  return db.prepare(`
    SELECT type,name,tbl_name,sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type,name,tbl_name
  `).all().map((row)=>({
    type:String(row.type),
    name:String(row.name),
    tbl_name:String(row.tbl_name),
    sql:String(row.sql||'').replace(/\s+/gu,' ').trim(),
  }));
}

export function sqliteSchemaFingerprint(db){
  return createHash('sha256')
    .update(JSON.stringify(sqliteSchemaRows(db)))
    .digest('hex');
}

export function assertSameSqliteSchema(baseDb,augmentedDb,label='database'){
  const base=sqliteSchemaRows(baseDb);
  const augmented=sqliteSchemaRows(augmentedDb);
  const a=JSON.stringify(base);
  const b=JSON.stringify(augmented);
  if(a!==b){
    const baseNames=new Set(base.map((row)=>`${row.type}:${row.name}`));
    const augmentedNames=new Set(augmented.map((row)=>`${row.type}:${row.name}`));
    const missing=[...baseNames].filter((name)=>!augmentedNames.has(name));
    const extra=[...augmentedNames].filter((name)=>!baseNames.has(name));
    throw new Error(
      `${label} schema parity failed. Missing=${missing.join(',')||'none'} Extra=${extra.join(',')||'none'}`,
    );
  }
  return sqliteSchemaFingerprint(baseDb);
}
