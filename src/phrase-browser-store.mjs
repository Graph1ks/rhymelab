import { DatabaseSync } from 'node:sqlite';

const MAX_LIMIT=250;
function clampLimit(value,fallback=50){const n=Number.parseInt(value??'',10);return Number.isInteger(n)?Math.max(1,Math.min(n,MAX_LIMIT)):fallback;}
function normalize(value){return String(value??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('de-DE');}
function like(value){return String(value).replace(/[\\%_]/gu,(c)=>'\\'+c);}
function tableExists(db,name){return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));}
function jsonArray(value){try{const x=JSON.parse(value||'[]');return Array.isArray(x)?x:[];}catch{return[];}}
function jsonObject(value){try{const x=JSON.parse(value||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch{return{};}}
function rowPhrase(row){if(!row)return null;return{phraseId:row.phrase_id,canonical:row.canonical,normalized:row.normalized,tokenCount:Number(row.token_count),phraseTypes:jsonArray(row.phrase_types_json),historicalState:row.historical_state,modernEligible:Boolean(row.modern_eligible),leipzigCorpusCount:Number(row.leipzig_corpus_count||0),leipzigOccurrences:Number(row.leipzig_occurrences||0),leipzigPerMillion:Number(row.leipzig_per_million||0),registerSources:Number(row.register_sources||0),registerOccurrences:Number(row.register_occurrences||0),ruegOccurrences:Number(row.rueg_occurrences||0),pronunciationReady:Boolean(row.pronunciation_ready),ipa:row.phrase_ipa||null,syllableCount:row.phrase_syllable_count==null?null:Number(row.phrase_syllable_count),stressPattern:row.phrase_stress_pattern||null};}

export function openPhraseBrowserDb(path){const db=new DatabaseSync(path,{readOnly:true});const schema=db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;if(schema!=='rhymelab-phrase-catalog-v1'){db.close();throw new Error('Unexpected phrase database schema: '+String(schema||'missing'));}return db;}

export function getPhraseBrowserStats(db){
 const basic=db.prepare("SELECT COUNT(*) phrases,SUM(modern_eligible) modern_eligible,SUM(historical_state='historical_only') historical_only FROM phrase").get();
 const usage=db.prepare('SELECT COUNT(DISTINCT phrase_id) matched_phrases,COUNT(*) rows FROM phrase_usage_evidence').get();
 const sources=db.prepare('SELECT source_id,name,role,license_id FROM phrase_source ORDER BY source_id').all();
 const register=tableExists(db,'phrase_register_evidence')?db.prepare('SELECT COUNT(DISTINCT phrase_id) matched_phrases,COUNT(*) rows,SUM(occurrence_count) occurrences FROM phrase_register_evidence').get():null;
 const rueg=tableExists(db,'register_unit')?db.prepare("SELECT COUNT(*) units,SUM(dipl_token_count) dipl_tokens,SUM(norm_token_count) norm_tokens FROM register_unit").get():null;
 const pronunciation=tableExists(db,'phrase_pronunciation')?db.prepare("SELECT COUNT(DISTINCT phrase_id) ready_phrases,AVG(syllable_count) mean_syllables FROM phrase_pronunciation WHERE eligible=1").get():null;
 const tokenPronunciation=tableExists(db,'phrase_token_pronunciation_resolution')?db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='resolved_preferred' THEN 1 ELSE 0 END) resolved FROM phrase_token_pronunciation_resolution").get():null;
 return{schema:'rhymelab-phrase-browser-stats-v1',phrases:Number(basic.phrases),modernEligible:Number(basic.modern_eligible),historicalOnly:Number(basic.historical_only),leipzig:{matchedPhrases:Number(usage.matched_phrases),rows:Number(usage.rows)},register:register?{matchedPhrases:Number(register.matched_phrases),rows:Number(register.rows),occurrences:Number(register.occurrences||0)}:null,rueg:rueg?{units:Number(rueg.units),diplTokens:Number(rueg.dipl_tokens||0),normTokens:Number(rueg.norm_tokens||0)}:null,pronunciation:pronunciation?{readyPhrases:Number(pronunciation.ready_phrases||0),meanSyllables:Number(pronunciation.mean_syllables||0),resolvedTokens:Number(tokenPronunciation?.resolved||0),totalTokens:Number(tokenPronunciation?.total||0)}:null,sources};
}

export function searchPhrases(db,{q='',type='all',historical=false,evidence='all',limit=50}={}){
 const query=normalize(q),params=[];const where=[];
 if(query){where.push("p.normalized LIKE ? ESCAPE '\\'");params.push('%'+like(query)+'%');}
 if(!historical)where.push('p.modern_eligible=1');
 const allowedTypes=new Set(['phrase','idiom','proverb','figurative_expression','multiword_lexeme']);
 if(allowedTypes.has(type)){where.push('p.phrase_types_json LIKE ?');params.push('%"'+type+'"%');}
 const hasRegister=tableExists(db,'phrase_register_evidence'),hasRueg=tableExists(db,'phrase_register_occurrence'),hasPron=tableExists(db,'phrase_pronunciation');
 if(evidence==='leipzig')where.push('COALESCE(u.corpus_count,0)>0');
 else if(evidence==='register'&&hasRegister)where.push('COALESCE(r.register_sources,0)>0');
 else if(evidence==='rueg'&&hasRueg)where.push('COALESCE(ro.rueg_occurrences,0)>0');
 else if(evidence==='pronunciation'&&hasPron)where.push('pp.phrase_id IS NOT NULL');
 else if((evidence==='register'&&!hasRegister)||(evidence==='rueg'&&!hasRueg)||(evidence==='pronunciation'&&!hasPron))return[];
 const registerCte=hasRegister?", r AS (SELECT phrase_id,COUNT(DISTINCT snapshot_id) register_sources,SUM(occurrence_count) register_occurrences FROM phrase_register_evidence GROUP BY phrase_id)":'';
 const ruegCte=hasRueg?", ro AS (SELECT phrase_id,SUM(occurrence_count) rueg_occurrences FROM phrase_register_occurrence GROUP BY phrase_id)":'';
 const registerJoin=hasRegister?'LEFT JOIN r ON r.phrase_id=p.phrase_id':'';
 const ruegJoin=hasRueg?'LEFT JOIN ro ON ro.phrase_id=p.phrase_id':'';
 const pronJoin=hasPron?"LEFT JOIN phrase_pronunciation pp ON pp.phrase_id=p.phrase_id AND pp.variant_rank=1 AND pp.eligible=1":'';
 const registerCols=hasRegister?'COALESCE(r.register_sources,0) register_sources,COALESCE(r.register_occurrences,0) register_occurrences':'0 register_sources,0 register_occurrences';
 const ruegCol=hasRueg?'COALESCE(ro.rueg_occurrences,0) rueg_occurrences':'0 rueg_occurrences';
 const pronCols=hasPron?'CASE WHEN pp.phrase_id IS NULL THEN 0 ELSE 1 END pronunciation_ready,pp.ipa phrase_ipa,pp.syllable_count phrase_syllable_count,pp.stress_pattern phrase_stress_pattern':'0 pronunciation_ready,NULL phrase_ipa,NULL phrase_syllable_count,NULL phrase_stress_pattern';
 const sql=`WITH u AS (SELECT phrase_id,COUNT(DISTINCT snapshot_id) corpus_count,SUM(occurrence_count) occurrences,SUM(per_million_tokens)/3.0 per_million FROM phrase_usage_evidence GROUP BY phrase_id)${registerCte}${ruegCte} SELECT p.*,COALESCE(u.corpus_count,0) leipzig_corpus_count,COALESCE(u.occurrences,0) leipzig_occurrences,COALESCE(u.per_million,0) leipzig_per_million,${registerCols},${ruegCol},${pronCols} FROM phrase p LEFT JOIN u ON u.phrase_id=p.phrase_id ${registerJoin} ${ruegJoin} ${pronJoin} ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ${query?'CASE WHEN p.normalized=? THEN 0 WHEN p.normalized LIKE ? ESCAPE \'\\\' THEN 1 ELSE 2 END,':''} COALESCE(u.corpus_count,0) DESC,COALESCE(u.per_million,0) DESC,p.token_count DESC,p.normalized LIMIT ?`;
 if(query){params.push(query,like(query)+'%');}params.push(clampLimit(limit));
 return db.prepare(sql).all(...params).map(rowPhrase);
}

export function getPhraseDetail(db,id){
 const key=String(id??'').trim();if(!key)return null;
 const base=db.prepare('SELECT * FROM phrase WHERE phrase_id=? OR normalized=? LIMIT 1').get(key,normalize(key));if(!base)return null;
 const detail=rowPhrase({...base,leipzig_corpus_count:0,leipzig_occurrences:0,leipzig_per_million:0,register_sources:0,register_occurrences:0,rueg_occurrences:0,pronunciation_ready:0});
 detail.tokens=db.prepare('SELECT token_index,surface,normalized,lexical_state,lexical_form_id FROM phrase_token WHERE phrase_id=? ORDER BY token_index').all(base.phrase_id);
 detail.attestations=db.prepare('SELECT a.source_record_id,a.source_pos,a.phrase_types_json,a.style_tags_json,a.raw_tags_json,a.categories_json,a.historical_state,a.evidence_json,s.snapshot_label,s.evidence_year,s.genre,src.source_id,src.name,src.license_id FROM phrase_attestation a JOIN phrase_snapshot s ON s.snapshot_id=a.snapshot_id JOIN phrase_source src ON src.source_id=s.source_id WHERE a.phrase_id=? ORDER BY src.source_id,s.snapshot_label,a.source_record_id').all(base.phrase_id).map(r=>({...r,phrase_types:jsonArray(r.phrase_types_json),style_tags:jsonArray(r.style_tags_json),raw_tags:jsonArray(r.raw_tags_json),categories:jsonArray(r.categories_json),evidence:jsonObject(r.evidence_json)}));
 detail.leipzig=db.prepare('SELECT u.*,s.snapshot_label,s.evidence_year,s.genre FROM phrase_usage_evidence u JOIN phrase_snapshot s ON s.snapshot_id=u.snapshot_id WHERE u.phrase_id=? ORDER BY s.snapshot_label').all(base.phrase_id).map(r=>({...r,evidence:jsonObject(r.evidence_json)}));
 detail.register=tableExists(db,'phrase_register_evidence')?db.prepare('SELECT r.*,s.snapshot_label,s.source_id,s.evidence_year,s.genre FROM phrase_register_evidence r JOIN phrase_snapshot s ON s.snapshot_id=r.snapshot_id WHERE r.phrase_id=? ORDER BY s.source_id,s.snapshot_label,r.policy').all(base.phrase_id).map(r=>({...r,register_tags:jsonArray(r.register_tags_json),evidence:jsonObject(r.evidence_json)})):[];
 detail.ruegExamples=tableExists(db,'phrase_register_occurrence')?db.prepare('SELECT o.layer,o.occurrence_count,u.dipl_text,u.norm_text,u.languages_json,d.subcorpus,d.source_record_id,d.formality,d.mode,d.age_group,d.speaker_age,d.speaker_bilingual,d.elicitation_language,d.elicitation_country,d.elicitation_date FROM phrase_register_occurrence o JOIN register_unit u ON u.unit_id=o.unit_id JOIN register_document d ON d.document_id=u.document_id WHERE o.phrase_id=? ORDER BY d.subcorpus,d.source_record_id,u.unit_index,o.layer LIMIT 100').all(base.phrase_id).map(r=>({...r,languages:jsonArray(r.languages_json)})):[];
 detail.pronunciation=null;
 detail.pronunciationResolutions=[];
 if(tableExists(db,'phrase_pronunciation')){const p=db.prepare('SELECT * FROM phrase_pronunciation WHERE phrase_id=? AND variant_rank=1 LIMIT 1').get(base.phrase_id);if(p){detail.pronunciation={...p,primaryStressSyllables:jsonArray(p.primary_stress_syllables_json),secondaryStressSyllables:jsonArray(p.secondary_stress_syllables_json),wordBoundaryPhonemePositions:jsonArray(p.word_boundary_phoneme_positions_json),wordBoundarySyllablePositions:jsonArray(p.word_boundary_syllable_positions_json),tokens:db.prepare('SELECT * FROM phrase_pronunciation_token WHERE phrase_pronunciation_id=? ORDER BY token_index').all(p.phrase_pronunciation_id)};detail.pronunciationReady=true;detail.ipa=p.ipa;detail.syllableCount=Number(p.syllable_count);detail.stressPattern=p.stress_pattern;}}
 if(tableExists(db,'phrase_token_pronunciation_resolution'))detail.pronunciationResolutions=db.prepare('SELECT token_index,normalized,status,writer_form_id,writer_pronunciation_id,writer_surface,ipa,writer_historical,usage_rank,available_pronunciations,normalized_form_candidates,pronunciation_source,pronunciation_flags_json FROM phrase_token_pronunciation_resolution WHERE phrase_id=? ORDER BY token_index').all(base.phrase_id).map(r=>({...r,pronunciation_flags:jsonArray(r.pronunciation_flags_json)}));
 return detail;
}

export function searchRegisterUnits(db,{q='',layer='both',subcorpus='all',formality='all',mode='all',age='all',limit=50}={}){
 if(!tableExists(db,'register_unit'))return[];const params=[],where=["d.source_id='rueg-dakoda'"];const query=String(q??'').trim();
 if(query){if(layer==='dipl'){where.push('u.dipl_text LIKE ?');params.push('%'+query+'%');}else if(layer==='norm'){where.push('u.norm_text LIKE ?');params.push('%'+query+'%');}else{where.push('(u.dipl_text LIKE ? OR u.norm_text LIKE ?)');params.push('%'+query+'%','%'+query+'%');}}
 for(const [value,column] of [[subcorpus,'d.subcorpus'],[formality,'d.formality'],[mode,'d.mode'],[age,'d.age_group']])if(value&&value!=='all'){where.push(column+'=?');params.push(value);}
 params.push(clampLimit(limit));
 return db.prepare(`SELECT u.unit_id,u.unit_index,u.unit_type,u.dipl_text,u.norm_text,u.languages_json,u.dipl_token_count,u.norm_token_count,d.subcorpus,d.source_record_id,d.speaker_id,d.formality,d.mode,d.age_group,d.speaker_age,d.speaker_bilingual,d.elicitation_language,d.elicitation_country,d.elicitation_date FROM register_unit u JOIN register_document d ON d.document_id=u.document_id WHERE ${where.join(' AND ')} ORDER BY d.subcorpus,d.source_record_id,u.unit_index LIMIT ?`).all(...params).map(r=>({...r,languages:jsonArray(r.languages_json)}));
}

export function getRegisterFacets(db){if(!tableExists(db,'register_document'))return{subcorpus:[],formality:[],mode:[],age:[]};const values=(column)=>db.prepare(`SELECT ${column} value,COUNT(*) count FROM register_document WHERE ${column} IS NOT NULL AND ${column}<>'' GROUP BY ${column} ORDER BY count DESC,value`).all();return{subcorpus:values('subcorpus'),formality:values('formality'),mode:values('mode'),age:values('age_group')};}
