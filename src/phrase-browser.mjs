import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

export const DEFAULT_PHRASE_DB_PATH = 'data/local/rhymelab-phrases-v1.sqlite';

function tableExists(db,name){return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));}
function normalizeQuery(value){return String(value??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('de-DE');}
function int(value,fallback,min,max){const n=Number.parseInt(value??'',10);return Number.isInteger(n)?Math.max(min,Math.min(max,n)):fallback;}
function parseJson(value,fallback=[]){try{return JSON.parse(value??'');}catch{return fallback;}}
function escapeLike(value){return String(value).replace(/[\\%_]/gu,(c)=>'\\'+c);}
function mapPhrase(row){return {...row,phraseTypes:parseJson(row.phrase_types_json,[]),phrase_types_json:undefined};}

export function openPhraseBrowser(path=DEFAULT_PHRASE_DB_PATH){
 const absolute=resolve(path);const db=new DatabaseSync(absolute,{readOnly:true});
 const schema=db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
 if(schema!=='rhymelab-phrase-catalog-v1'){db.close();throw new Error(`Unexpected phrase database schema: ${schema||'missing'}`);}
 return createPhraseBrowser(db,{ownsDatabase:true,path:absolute});
}

export function createPhraseBrowser(db,{ownsDatabase=false,path=null}={}){
 const hasRegister=tableExists(db,'phrase_register_evidence');
 const hasUnits=tableExists(db,'phrase_register_unit');
 const hasUnitMatch=tableExists(db,'phrase_register_unit_match');
 function stats(){
  const one=(sql)=>Number(Object.values(db.prepare(sql).get())[0]||0);
  return {
   schema:'rhymelab-phrase-browser-stats-v1',database:path,
   phrases:one('SELECT COUNT(*) c FROM phrase'),modernEligible:one('SELECT COUNT(*) c FROM phrase WHERE modern_eligible=1'),
   historicalOnly:one("SELECT COUNT(*) c FROM phrase WHERE historical_state='historical_only'"),
   leipzigMatched:one('SELECT COUNT(DISTINCT phrase_id) c FROM phrase_usage_evidence'),
   leipzigEvidenceRows:one('SELECT COUNT(*) c FROM phrase_usage_evidence'),
   registerEvidenceRows:hasRegister?one('SELECT COUNT(*) c FROM phrase_register_evidence'):0,
   registerMatchedPhrases:hasRegister?one('SELECT COUNT(DISTINCT phrase_id) c FROM phrase_register_evidence'):0,
   registerUnits:hasUnits?one('SELECT COUNT(*) c FROM phrase_register_unit'):0,
   registerUnitMatches:hasUnitMatch?one('SELECT COUNT(*) c FROM phrase_register_unit_match'):0,
   ruegUnits:hasUnits?one("SELECT COUNT(*) c FROM phrase_register_unit WHERE subcorpus LIKE 'RUEG-%'"):0,
  };
 }
 function searchPhrases(options={}){
  const q=normalizeQuery(options.q),limit=int(options.limit,50,1,100),offset=int(options.offset,0,0,1_000_000);
  const type=String(options.type||'all'),evidence=String(options.evidence||'all'),register=String(options.register||'all'),historical=String(options.historical||'current');
  const where=[],params=[];
  if(historical!=='all')where.push('p.modern_eligible=1');
  if(q){const like='%'+escapeLike(q)+'%';where.push("p.normalized LIKE ? ESCAPE '\\'");params.push(like);}
  if(type!=='all'){where.push("instr(p.phrase_types_json, ?) > 0");params.push('"'+type+'"');}
  if(evidence==='any')where.push('EXISTS (SELECT 1 FROM phrase_usage_evidence eu WHERE eu.phrase_id=p.phrase_id)');
  else if(evidence==='none')where.push('NOT EXISTS (SELECT 1 FROM phrase_usage_evidence eu WHERE eu.phrase_id=p.phrase_id)');
  else if(['1','2','3'].includes(evidence)){const n=Number(evidence);where.push(`(SELECT COUNT(DISTINCT eu.snapshot_id) FROM phrase_usage_evidence eu WHERE eu.phrase_id=p.phrase_id) ${n===3?'>=':'='} ?`);params.push(n);}
  else if(evidence==='2plus'){where.push('(SELECT COUNT(DISTINCT eu.snapshot_id) FROM phrase_usage_evidence eu WHERE eu.phrase_id=p.phrase_id)>=2');}
  if(hasRegister&&register==='any')where.push('EXISTS (SELECT 1 FROM phrase_register_evidence re WHERE re.phrase_id=p.phrase_id)');
  else if(hasRegister&&register==='none')where.push('NOT EXISTS (SELECT 1 FROM phrase_register_evidence re WHERE re.phrase_id=p.phrase_id)');
  else if(!hasRegister&&register==='any')where.push('0');
  const clause=where.length?'WHERE '+where.join(' AND '):'';
  const registerSelect=hasRegister?`(SELECT COUNT(*) FROM phrase_register_evidence re WHERE re.phrase_id=p.phrase_id) AS register_evidence_rows,(SELECT COALESCE(SUM(re.occurrence_count),0) FROM phrase_register_evidence re WHERE re.phrase_id=p.phrase_id) AS register_occurrences`:'0 AS register_evidence_rows,0 AS register_occurrences';
  const rows=db.prepare(`SELECT p.phrase_id,p.canonical,p.normalized,p.token_count,p.phrase_types_json,p.historical_state,p.modern_eligible,
   (SELECT COUNT(DISTINCT u.snapshot_id) FROM phrase_usage_evidence u WHERE u.phrase_id=p.phrase_id) AS leipzig_corpora,
   (SELECT COALESCE(SUM(u.occurrence_count),0) FROM phrase_usage_evidence u WHERE u.phrase_id=p.phrase_id) AS leipzig_occurrences,
   ${registerSelect}
   FROM phrase p ${clause}
   ORDER BY ${q?'CASE WHEN p.normalized=? THEN 0 WHEN p.normalized LIKE ? ESCAPE \'\\\' THEN 1 ELSE 2 END,':''} leipzig_corpora DESC,register_evidence_rows DESC,leipzig_occurrences DESC,p.token_count DESC,p.normalized,p.phrase_id LIMIT ? OFFSET ?`);
  const orderParams=q?[q,escapeLike(q)+'%']:[];
  const result=rows.all(...params,...orderParams,limit,offset).map(mapPhrase);
  const total=Number(db.prepare(`SELECT COUNT(*) c FROM phrase p ${clause}`).get(...params).c);
  return {schema:'rhymelab-phrase-search-v1',query:q,filters:{type,evidence,register,historical},total,limit,offset,results:result};
 }
 function getPhrase(id){
  const raw=db.prepare('SELECT * FROM phrase WHERE phrase_id=?').get(id);if(!raw)return null;const phrase=mapPhrase(raw);
  phrase.tokens=db.prepare('SELECT token_index,surface,normalized,char_start,char_end,lexical_state,lexical_form_id FROM phrase_token WHERE phrase_id=? ORDER BY token_index').all(id);
  phrase.attestations=db.prepare(`SELECT a.attestation_id,a.source_record_id,a.source_pos,a.phrase_types_json,a.style_tags_json,a.raw_tags_json,a.categories_json,a.historical_state,a.evidence_json,
   s.snapshot_id,s.snapshot_label,s.evidence_year,s.genre,s.country,src.source_id,src.name AS source_name,src.role AS source_role,src.license_id
   FROM phrase_attestation a JOIN phrase_snapshot s ON s.snapshot_id=a.snapshot_id JOIN phrase_source src ON src.source_id=s.source_id WHERE a.phrase_id=? ORDER BY src.source_id,s.snapshot_label,a.source_record_id`).all(id).map((row)=>({...row,phraseTypes:parseJson(row.phrase_types_json,[]),styleTags:parseJson(row.style_tags_json,[]),rawTags:parseJson(row.raw_tags_json,[]),categories:parseJson(row.categories_json,[]),evidence:parseJson(row.evidence_json,{})}));
  phrase.usage=db.prepare(`SELECT u.policy,u.occurrence_count,u.sentence_count,u.corpus_token_count,u.corpus_sentence_count,u.per_million_tokens,u.per_million_sentences,u.evidence_json,s.snapshot_id,s.snapshot_label,s.evidence_year,s.genre,s.country
   FROM phrase_usage_evidence u JOIN phrase_snapshot s ON s.snapshot_id=u.snapshot_id WHERE u.phrase_id=? ORDER BY u.per_million_tokens DESC,s.snapshot_label`).all(id).map((row)=>({...row,evidence:parseJson(row.evidence_json,{})}));
  phrase.registerEvidence=hasRegister?db.prepare(`SELECT r.policy,r.register_tags_json,r.occurrence_count,r.unit_count,r.corpus_token_count,r.corpus_unit_count,r.per_million_tokens,r.per_million_units,r.evidence_json,s.snapshot_id,s.snapshot_label,s.source_id,s.evidence_year,s.genre,s.country
   FROM phrase_register_evidence r JOIN phrase_snapshot s ON s.snapshot_id=r.snapshot_id WHERE r.phrase_id=? ORDER BY r.occurrence_count DESC,s.snapshot_label,r.policy`).all(id).map((row)=>({...row,registerTags:parseJson(row.register_tags_json,[]),evidence:parseJson(row.evidence_json,{})})):[];
  phrase.registerSamples=hasUnitMatch&&hasUnits?db.prepare(`SELECT m.policy,m.occurrence_count,u.unit_id,u.subcorpus,u.source_record_id,u.unit_index,u.mode,u.formality,u.age_group,u.speaker_profile,u.dipl_text,u.norm_text,u.language_values_json,u.german_token_ratio
   FROM phrase_register_unit_match m JOIN phrase_register_unit u ON u.unit_id=m.unit_id WHERE m.phrase_id=? ORDER BY m.occurrence_count DESC,u.subcorpus,u.source_record_id,u.unit_index,m.policy LIMIT 30`).all(id).map((row)=>({...row,languageValues:parseJson(row.language_values_json,[])})):[];
  return phrase;
 }
 function searchRegisterUnits(options={}){
  const q=normalizeQuery(options.q),layer=String(options.layer||'both'),subcorpus=String(options.subcorpus||'all'),mode=String(options.mode||'all'),formality=String(options.formality||'all'),limit=int(options.limit,50,1,100),offset=int(options.offset,0,0,1_000_000);
  if(!hasUnits)return {schema:'rhymelab-register-unit-search-v1',available:false,total:0,limit,offset,results:[]};
  const where=[],params=[];
  if(q){const like='%'+escapeLike(q)+'%';if(layer==='dipl')where.push("u.dipl_text LIKE ? ESCAPE '\\'");else if(layer==='norm')where.push("u.norm_text LIKE ? ESCAPE '\\'");else where.push("(u.dipl_text LIKE ? ESCAPE '\\' OR u.norm_text LIKE ? ESCAPE '\\')");params.push(like);if(layer==='both')params.push(like);}
  if(subcorpus!=='all'){where.push('u.subcorpus=?');params.push(subcorpus);}
  if(mode!=='all'){where.push('u.mode=?');params.push(mode);}
  if(formality!=='all'){where.push('u.formality=?');params.push(formality);}
  const clause=where.length?'WHERE '+where.join(' AND '):'';
  const total=Number(db.prepare(`SELECT COUNT(*) c FROM phrase_register_unit u ${clause}`).get(...params).c);
  const results=db.prepare(`SELECT u.unit_id,u.snapshot_id,u.source_record_id,u.subcorpus,u.unit_index,u.mode,u.formality,u.age_group,u.speaker_profile,u.dipl_text,u.norm_text,u.language_values_json,u.german_token_ratio,
   ${hasUnitMatch?'(SELECT COUNT(DISTINCT m.phrase_id) FROM phrase_register_unit_match m WHERE m.unit_id=u.unit_id)':'0'} AS matched_phrases
   FROM phrase_register_unit u ${clause} ORDER BY u.subcorpus,u.source_record_id,u.unit_index LIMIT ? OFFSET ?`).all(...params,limit,offset).map((row)=>({...row,languageValues:parseJson(row.language_values_json,[])}));
  return {schema:'rhymelab-register-unit-search-v1',available:true,query:q,filters:{layer,subcorpus,mode,formality},total,limit,offset,results};
 }
 return {stats,searchPhrases,getPhrase,searchRegisterUnits,close(){if(ownsDatabase)db.close();}};
}
