#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createGunzip, gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import {
  normalizeGerman,
  optionsForHeadword,
  optionsForListedForms,
} from './kaikki-resolver-lib.mjs';
import {
  lexicalEvidenceForHeadword,
  lexicalEvidenceForListedForms,
  finalizeEsdbEvidence,
  mergeEsdbEvidence,
} from './en-publish-core.mjs';
import {
  decodeMsgpack,
  normalizeEnglishSurface,
  parseEsdbLine,
  parseWordfreqCBpack,
  readJson,
} from './en-writer-source-core.mjs';
import { PronunciationIpaAnalyzerPool } from './pronunciation-ipa-analyzer-pool.mjs';
import {
  PRONUNCIATION_SECONDARY_DEFERRED_POLICY,
  PRONUNCIATION_SECONDARY_POLICY,
  PRONUNCIATION_SECONDARY_SCHEMA,
  compactKaikkiSourceRecord,
  createPronunciationSecondaryStorage,
  deferredGeneratedBucket,
  lexicalAggregate,
  phoneticParityFields,
  stableKaikkiRecordKey,
} from './pronunciation-secondary-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}
function hasFlag(flag){return args.includes(flag)}
function intArg(flag,fallback,{min=1,max=1_000_000}={}){
  const parsed=Number.parseInt(String(argValue(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(parsed)?parsed:fallback));
}

const phase=String(argValue('--phase','all')).trim().toLowerCase();
if(!['all','base','phonetics','de-source','en-source','finalize','report'].includes(phase)){
  throw new Error('Unknown --phase: '+phase);
}
const workPath=resolve(argValue('--work','data/local/pronunciation-backfill-v2.sqlite'));
const outPath=resolve(argValue('--out','data/local/pronunciation-secondary-v1.sqlite'));
const reportPath=resolve(argValue('--report','data/local/pronunciation-secondary-v1-report.json'));
const deferredPath=resolve(argValue('--deferred-tsv','data/local/pronunciation-backfill-v2-deferred.tsv'));
const deUsagePath=resolve(argValue('--de-usage','data/de/usage/de-usage.tsv'));
const deKaikkiPath=resolve(argValue('--de-kaikki','data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz'));
const enRegistryPath=resolve(argValue('--en-registry','sources/en/phase12b-sources-v1.json'));
const enRawDirArg=argValue('--en-raw-dir',null);
const analyzerWorkers=intArg('--analyzer-workers',4,{min:1,max:16});
const batchSize=intArg('--batch-size',1024,{min:64,max:10000});
const reset=hasFlag('--reset');

if(!existsSync(workPath))throw new Error('Backfill work database missing: '+workPath);
await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(reportPath),{recursive:true});
await mkdir(dirname(deferredPath),{recursive:true});
if(reset)await rm(outPath,{force:true});

const workDb=new DatabaseSync(workPath,{readOnly:true});
workDb.exec('PRAGMA query_only=ON;');
const outDb=new DatabaseSync(outPath);
createPronunciationSecondaryStorage(outDb);
outDb.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;');

const metaGet=outDb.prepare('SELECT value FROM meta WHERE key=?');
const metaPut=outDb.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const workMeta=(key)=>workDb.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
const sourceFingerprint=workMeta('source_fingerprint');
if(!sourceFingerprint)throw new Error('Backfill source fingerprint is missing.');
const existingFingerprint=metaGet.get('source_fingerprint')?.value||null;
if(existingFingerprint&&existingFingerprint!==sourceFingerprint){
  throw new Error('Secondary catalog source fingerprint mismatch. Re-run with --reset.');
}
for(const [key,value] of Object.entries({
  schema:PRONUNCIATION_SECONDARY_SCHEMA,
  policy:PRONUNCIATION_SECONDARY_POLICY,
  deferred_policy:PRONUNCIATION_SECONDARY_DEFERRED_POLICY,
  source_fingerprint:sourceFingerprint,
  source_work_database:workPath,
  default_search_eligible:'0',
  user_opt_in_required:'1',
  active_generator:'espeak_ng',
  active_quality_tiers:'A,B',
}))metaPut.run(key,String(value));

function scalar(db,sql,...params){return Number(db.prepare(sql).get(...params)?.c||0)}
function json(value){return JSON.stringify(value??[])}
function parseJson(value,fallback=[]){try{return JSON.parse(String(value??''))}catch{return fallback}}
function sha(value){return createHash('sha256').update(String(value)).digest('hex')}
function parseTsvHeader(line){
  const names=String(line||'').replace(/^\uFEFF/u,'').split('\t');
  return Object.fromEntries(names.map((name,index)=>[name,index]));
}

async function materializeBase(){
  if(metaGet.get('base_complete')?.value==='1')return;
  const admittedPending=Number(workDb.prepare([
    'SELECT COUNT(*) AS c FROM work_item w JOIN admission a USING(item_id)',
    "WHERE a.decision='admit' AND w.final_status='pending'",
  ].join(' ')).get()?.c||0);
  if(admittedPending){
    throw new Error('Admitted generator work is still pending: '+admittedPending+'. Finish backfill first.');
  }

  const activeInsert=outDb.prepare(`
    INSERT OR IGNORE INTO secondary_form(
      item_id,language,surface,normalized,quality_tier,quality_reason,final_method,source_ref_count
    ) VALUES(?,?,?,?,?,?,?,?)
  `);
  const deferredInsert=outDb.prepare(`
    INSERT OR REPLACE INTO deferred_generated_result(
      item_id,language,surface,normalized,final_status,quality_tier,final_method,client_status,bucket,last_error,note
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `);

  outDb.exec('BEGIN IMMEDIATE');
  try{
    for(const row of workDb.prepare(`
      SELECT w.* FROM work_item w
      JOIN admission a USING(item_id)
      WHERE a.decision='admit'
      ORDER BY w.item_id
    `).iterate()){
      if(row.final_status==='resolved'&&row.final_method==='espeak_ng'&&(row.quality_tier==='A'||row.quality_tier==='B')){
        activeInsert.run(
          Number(row.item_id),row.language,row.surface,row.normalized,row.quality_tier,
          row.quality_reason||'espeak_generated',row.final_method,Number(row.source_ref_count||0),
        );
      }else{
        const bucket=deferredGeneratedBucket(row);
        if(bucket){
          deferredInsert.run(
            Number(row.item_id),row.language,row.surface,row.normalized,row.final_status,
            row.quality_tier||null,row.final_method||null,row.client_status||null,bucket,row.last_error||null,
            'Deferred by owner policy on 2026-09-20; not part of opt-in secondary runtime materialization.',
          );
        }
      }
    }
    outDb.exec('COMMIT');
  }catch(error){
    outDb.exec('ROLLBACK');
    throw error;
  }

  const refInsert=outDb.prepare(`
    INSERT OR IGNORE INTO secondary_source_ref(
      source_ref_id,item_id,scope,source_db,source_table,source_key,source_surface,context_json
    ) VALUES(?,?,?,?,?,?,?,?)
  `);
  outDb.exec('BEGIN IMMEDIATE');
  try{
    const active=outDb.prepare('SELECT 1 AS ok FROM secondary_form WHERE item_id=?');
    for(const row of workDb.prepare('SELECT * FROM source_ref ORDER BY source_ref_id').iterate()){
      if(!active.get(Number(row.item_id)))continue;
      refInsert.run(
        Number(row.source_ref_id),Number(row.item_id),row.scope,row.source_db,row.source_table,
        row.source_key,row.surface,row.context_json,
      );
    }
    outDb.exec('COMMIT');
  }catch(error){
    outDb.exec('ROLLBACK');
    throw error;
  }

  metaPut.run('base_complete','1');
  console.log('[secondary:base] active='+scalar(outDb,'SELECT COUNT(*) AS c FROM secondary_form').toLocaleString('en-US')
    +' deferred='+scalar(outDb,'SELECT COUNT(*) AS c FROM deferred_generated_result').toLocaleString('en-US'));
}

async function materializePhonetics(){
  if(metaGet.get('phonetics_complete')?.value==='1')return;
  const selectMissing=outDb.prepare(`
    SELECT f.item_id,f.language,f.surface,w.raw_ipa,w.ipa
    FROM secondary_form f
    JOIN source_work.work_item w ON w.item_id=f.item_id
    LEFT JOIN secondary_pronunciation p ON p.item_id=f.item_id
    WHERE p.item_id IS NULL
    ORDER BY f.item_id
    LIMIT ?
  `);
  try{outDb.exec("ATTACH DATABASE '"+workPath.replaceAll("'","''")+"' AS source_work")}catch(error){
    if(!String(error?.message||error).includes('already in use'))throw error;
  }

  const insert=outDb.prepare(`
    INSERT OR REPLACE INTO secondary_pronunciation(
      item_id,raw_ipa,ipa,phonemes,syllable_count,stress,primary_stress,rhyme_tail,final_tail,
      vowels,consonants,exact_key,multisyllable_key,vowel_key,vowel_family,coda_key,coda_class,
      rhyme_syllables,rhotic
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const pool=new PronunciationIpaAnalyzerPool({workers:analyzerWorkers});
  let completed=scalar(outDb,'SELECT COUNT(*) AS c FROM secondary_pronunciation');
  const total=scalar(outDb,'SELECT COUNT(*) AS c FROM secondary_form');
  try{
    while(true){
      const rows=selectMissing.all(batchSize);
      if(!rows.length)break;
      const analyzed=await Promise.all(rows.map((row)=>pool.analyze({
        surface:row.surface,
        language:row.language,
        rawIpa:row.ipa,
        engineCommand:null,
        engineVersion:null,
      })));
      outDb.exec('BEGIN IMMEDIATE');
      try{
        for(let index=0;index<rows.length;index+=1){
          const row=rows[index];
          const inspection=analyzed[index].inspection;
          if(inspection?.status!=='accepted'){
            throw new Error('Stored generated IPA no longer passes analyzer for item '+row.item_id+': '+String(inspection?.analyzerError||'unknown'));
          }
          const f=phoneticParityFields(inspection.analysis,row.language);
          insert.run(
            Number(row.item_id),row.raw_ipa||null,f.ipa,f.phonemes,f.syllable_count,f.stress,
            f.primary_stress,f.rhyme_tail,f.final_tail,f.vowels,f.consonants,f.exact_key,
            f.multisyllable_key,f.vowel_key,f.vowel_family,f.coda_key,f.coda_class,
            f.rhyme_syllables,f.rhotic,
          );
        }
        outDb.exec('COMMIT');
      }catch(error){
        outDb.exec('ROLLBACK');
        throw error;
      }
      completed+=rows.length;
      console.log('[secondary:phonetics] '+completed.toLocaleString('en-US')+'/'+total.toLocaleString('en-US'));
    }
  }finally{
    await pool.close();
  }
  metaPut.run('phonetics_complete','1');
}

const insertSourceRecord=outDb.prepare(`
  INSERT OR IGNORE INTO secondary_source_record(
    source_record_key,language,headword,pos,etymology_number,etymology_text,tags_json,senses_json
  ) VALUES(?,?,?,?,?,?,?,?)
`);
const insertFormSourceRecord=outDb.prepare(`
  INSERT OR IGNORE INTO secondary_form_source_record(item_id,source_record_key,match_kind)
  VALUES(?,?,?)
`);
const insertLexical=outDb.prepare(`
  INSERT OR IGNORE INTO secondary_lexical_analysis(
    item_id,analysis_key,source_record_key,lemma,normalized_lemma,pos,homograph_no,confidence,
    gender,is_proper,is_obsolete,historical_only,style_tags,form_features,match_kinds,
    relation_kinds,evidence_kind
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
const targetByLangNorm=outDb.prepare('SELECT item_id FROM secondary_form WHERE language=? AND normalized=?');

function storeSourceRecord(compact){
  insertSourceRecord.run(
    compact.source_record_key,compact.language,compact.headword,compact.pos,
    compact.etymology_number,compact.etymology_text,compact.tags_json,compact.senses_json,
  );
}
function storeDeOption(itemId,option,recordKey){
  insertFormSourceRecord.run(itemId,recordKey,option.matchKind||'wiktionary');
  insertLexical.run(
    itemId,option.resolutionKey,recordKey,option.lemma,option.normalizedLemma,option.pos,
    Number(option.homographNo||1),Number(option.confidence||0),option.gender||null,
    option.isProper?1:0,option.isObsolete?1:0,option.historicalOnly?1:0,
    json(option.styleTags),json(option.formFeatures),json(option.matchKinds||[option.matchKind]),
    '[]','dewiktionary',
  );
}
function storeEnEvidence(itemId,evidence,recordKey){
  const lemmas=Array.isArray(evidence.lemma_candidates)?evidence.lemma_candidates:[];
  const lemma=lemmas[0]||evidence.normalized;
  const analysisKey=sha(JSON.stringify([
    evidence.normalized,evidence.pos,lemma,evidence.evidence_kind,recordKey,
  ])).slice(0,24);
  const history=evidence.history||{};
  insertFormSourceRecord.run(itemId,recordKey,evidence.evidence_kind||'wiktionary');
  insertLexical.run(
    itemId,analysisKey,recordKey,lemma,normalizeEnglishSurface(lemma),evidence.pos||'unknown',
    null,null,null,evidence.proper_name?1:0,
    history.obsolete||history.archaic?1:0,history.historical_only?1:0,
    json(evidence.tags), '[]','[]',json(evidence.relation_kinds),evidence.evidence_kind||'wiktionary',
  );
}

async function enrichGermanUsage(){
  if(metaGet.get('de_usage_complete')?.value==='1')return;
  const update=outDb.prepare(`
    UPDATE secondary_form
    SET usage_rank=?,usage_score=?,usage_count=?,usage_source_count=?
    WHERE language='de' AND normalized=?
  `);
  const input=createInterface({input:createReadStream(deUsagePath),crlfDelay:Infinity});
  let header=null,matched=0,rows=0;
  outDb.exec('BEGIN IMMEDIATE');
  try{
    for await(const line of input){
      if(!line)continue;
      if(!header){header=parseTsvHeader(line);continue}
      rows+=1;
      const cells=line.split('\t');
      const surface=String(cells[header.form]||'').trim();
      const normalized=String(cells[header.normalized_form]||normalizeGerman(surface));
      const rank=Number.parseInt(cells[header.rank]||'',10);
      if(!Number.isInteger(rank))continue;
      const result=update.run(
        rank,
        header.usage_score===undefined?null:Number(cells[header.usage_score]||0),
        header.combined_count===undefined?null:Number(cells[header.combined_count]||0),
        header.source_count===undefined?null:Number(cells[header.source_count]||0),
        normalized,
      );
      matched+=Number(result.changes||0);
      if(rows%100000===0){
        outDb.exec('COMMIT');outDb.exec('BEGIN IMMEDIATE');
        console.log('[secondary:de-usage] rows='+rows.toLocaleString('en-US')+' matched='+matched.toLocaleString('en-US'));
      }
    }
    outDb.exec('COMMIT');
  }catch(error){outDb.exec('ROLLBACK');throw error}
  metaPut.run('de_usage_complete','1');
}

async function enrichGermanKaikki(){
  if(metaGet.get('de_kaikki_complete')?.value==='1')return;
  const source=createReadStream(deKaikkiPath);
  const stream=deKaikkiPath.endsWith('.gz')?source.pipe(createGunzip()):source;
  const lines=createInterface({input:stream,crlfDelay:Infinity});
  let raw=0,matched=0;
  outDb.exec('BEGIN IMMEDIATE');
  try{
    for await(const line of lines){
      raw+=1;
      if(!line)continue;
      let entry;try{entry=JSON.parse(line)}catch{continue}
      if(entry?.lang_code!=='de'||!entry?.word)continue;

      const headOptions=optionsForHeadword(entry);
      const listedOptions=optionsForListedForms(entry);
      const recordKey=headOptions[0]?.sourceRecordKey
        ||listedOptions[0]?.option?.sourceRecordKey
        ||stableKaikkiRecordKey(entry,'de');
      let sourceStored=false;
      const ensureSource=()=>{
        if(sourceStored)return;
        storeSourceRecord(compactKaikkiSourceRecord(entry,'de',recordKey));
        sourceStored=true;
      };

      const headTarget=targetByLangNorm.get('de',normalizeGerman(entry.word));
      if(headTarget){
        ensureSource();
        if(headOptions.length){
          for(const option of headOptions)storeDeOption(Number(headTarget.item_id),option,recordKey);
        }else{
          insertFormSourceRecord.run(Number(headTarget.item_id),recordKey,'wiktionary_headword');
        }
        matched+=1;
      }
      for(const listed of listedOptions){
        const target=targetByLangNorm.get('de',listed.candidateNormalized);
        if(!target)continue;
        ensureSource();
        storeDeOption(Number(target.item_id),listed.option,recordKey);
        matched+=1;
      }

      if(raw%25000===0){
        outDb.exec('COMMIT');outDb.exec('BEGIN IMMEDIATE');
        console.log('[secondary:de-kaikki] raw='+raw.toLocaleString('en-US')+' matched='+matched.toLocaleString('en-US'));
      }
    }
    outDb.exec('COMMIT');
  }catch(error){outDb.exec('ROLLBACK');throw error}
  finally{lines.close();stream.destroy()}
  metaPut.run('de_kaikki_complete','1');
}

async function enrichEnglishKaikki(kaikkiPath){
  if(metaGet.get('en_kaikki_complete')?.value==='1')return;
  const input=createReadStream(kaikkiPath).pipe(createGunzip());
  const lines=createInterface({input,crlfDelay:Infinity});
  let raw=0,matched=0;
  outDb.exec('BEGIN IMMEDIATE');
  try{
    for await(const line of lines){
      raw+=1;
      if(!line)continue;
      let entry;try{entry=JSON.parse(line)}catch{continue}
      if(entry?.lang_code!=='en'||!entry?.word)continue;
      const head=lexicalEvidenceForHeadword(entry);
      const listed=lexicalEvidenceForListedForms(entry);
      const recordKey=stableKaikkiRecordKey(entry,'en');
      let sourceStored=false;
      const ensureSource=()=>{
        if(sourceStored)return;
        storeSourceRecord(compactKaikkiSourceRecord(entry,'en',recordKey));
        sourceStored=true;
      };
      for(const evidence of [head,...listed]){
        if(!evidence?.normalized)continue;
        const target=targetByLangNorm.get('en',evidence.normalized);
        if(!target)continue;
        ensureSource();
        storeEnEvidence(Number(target.item_id),evidence,recordKey);
        matched+=1;
      }
      if(raw%100000===0){
        outDb.exec('COMMIT');outDb.exec('BEGIN IMMEDIATE');
        console.log('[secondary:en-kaikki] raw='+raw.toLocaleString('en-US')+' matched='+matched.toLocaleString('en-US'));
      }
    }
    outDb.exec('COMMIT');
  }catch(error){outDb.exec('ROLLBACK');throw error}
  finally{lines.close();input.destroy()}
  metaPut.run('en_kaikki_complete','1');
}

async function enrichEnglishUsageAndEsdb(registry,rawDir){
  if(metaGet.get('en_aux_complete')?.value==='1')return;
  const sources=Object.values(registry.sources||[]);
  const sourceByPrefix=(prefix)=>sources.find((source)=>String(source.source_id||'').startsWith(prefix));
  const esdbSource=sourceByPrefix('esdb-scowl');
  const wordfreqSource=sourceByPrefix('wordfreq-en');
  if(!esdbSource||!wordfreqSource)throw new Error('English registry missing ESDB or wordfreq source.');

  const esdbPath=resolve(rawDir,esdbSource.local_filename);
  const wordfreqPath=resolve(rawDir,wordfreqSource.local_filename);
  const esdbTarget=new Map();
  const esdbLines=createInterface({input:createReadStream(esdbPath),crlfDelay:Infinity});
  for await(const line of esdbLines){
    const parsed=parseEsdbLine(line);
    if(!parsed)continue;
    for(const normalized of parsed.forms||[]){
      const target=targetByLangNorm.get('en',normalized);
      if(!target)continue;
      esdbTarget.set(normalized,mergeEsdbEvidence(esdbTarget.get(normalized),parsed));
    }
  }
  const updateEsdb=outDb.prepare("UPDATE secondary_form SET esdb_json=? WHERE language='en' AND normalized=?");
  outDb.exec('BEGIN IMMEDIATE');
  try{
    for(const [normalized,evidence] of esdbTarget){
      updateEsdb.run(JSON.stringify(finalizeEsdbEvidence(evidence)),normalized);
    }
    outDb.exec('COMMIT');
  }catch(error){outDb.exec('ROLLBACK');throw error}

  const decoded=decodeMsgpack(gunzipSync(await readFile(wordfreqPath)));
  const rows=parseWordfreqCBpack(decoded);
  const updateUsage=outDb.prepare("UPDATE secondary_form SET wordfreq_rank=?,wordfreq_zipf=? WHERE language='en' AND normalized=?");
  let rank=0;
  outDb.exec('BEGIN IMMEDIATE');
  try{
    for(const item of rows){
      const normalized=normalizeEnglishSurface(item.word);
      if(!normalized)continue;
      rank+=1;
      updateUsage.run(rank,Number(item.zipf),normalized);
    }
    outDb.exec('COMMIT');
  }catch(error){outDb.exec('ROLLBACK');throw error}
  metaPut.run('en_aux_complete','1');
}

async function enrichGerman(){
  await enrichGermanUsage();
  await enrichGermanKaikki();
}
async function enrichEnglish(){
  const registry=await readJson(enRegistryPath);
  const rawDir=resolve(enRawDirArg||registry.local_raw_directory||'data/raw/en/phase12b-20260918');
  const kaikkiSource=Object.values(registry.sources||[]).find((source)=>String(source.source_id||'').startsWith('enwiktionary-kaikki'));
  if(!kaikkiSource)throw new Error('English registry missing Kaikki source.');
  await enrichEnglishKaikki(resolve(rawDir,kaikkiSource.local_filename));
  await enrichEnglishUsageAndEsdb(registry,rawDir);
}

async function finalizeMetadata(){
  if(metaGet.get('finalize_complete')?.value==='1')return;
  const analyses=outDb.prepare(`
    SELECT analysis_key,lemma,pos,gender,confidence,historical_only,style_tags
    FROM secondary_lexical_analysis WHERE item_id=?
  `);
  const update=outDb.prepare(`
    UPDATE secondary_form SET
      preferred_lemma=?,preferred_pos=?,preferred_gender=?,historical_only=?,lexical_tags=?,metadata_status=?
    WHERE item_id=?
  `);
  const scopeKinds=outDb.prepare('SELECT scope FROM secondary_source_ref WHERE item_id=? ORDER BY scope');
  let done=0;
  outDb.exec('BEGIN IMMEDIATE');
  try{
    for(const row of outDb.prepare('SELECT item_id,language,usage_rank,wordfreq_rank FROM secondary_form ORDER BY item_id').iterate()){
      const lexical=analyses.all(Number(row.item_id));
      const aggregate=lexicalAggregate(lexical);
      const scopes=scopeKinds.all(Number(row.item_id)).map((item)=>String(item.scope));
      const hasCatalogContext=scopes.some((scope)=>scope.startsWith('entity_')||scope.startsWith('phrase_'));
      const status=lexical.length
        ?'source_lexical_enriched'
        :(row.usage_rank!=null||row.wordfreq_rank!=null)
          ?'usage_enriched'
          :hasCatalogContext?'catalog_context_only':'source_context_only';
      update.run(
        aggregate.preferred_lemma,aggregate.preferred_pos,aggregate.preferred_gender,
        aggregate.historical_only,aggregate.lexical_tags,status,Number(row.item_id),
      );
      done+=1;
      if(done%100000===0){
        outDb.exec('COMMIT');outDb.exec('BEGIN IMMEDIATE');
        console.log('[secondary:finalize] '+done.toLocaleString('en-US'));
      }
    }
    outDb.exec('COMMIT');
  }catch(error){outDb.exec('ROLLBACK');throw error}
  outDb.exec('ANALYZE; PRAGMA optimize;');
  metaPut.run('finalize_complete','1');
}

async function writeDeferredTsv(){
  const cells=(values)=>values.map((value)=>String(value??'').replaceAll('\t',' ').replaceAll('\r',' ').replaceAll('\n',' ')).join('\t');
  const lines=[cells(['item_id','language','surface','normalized','bucket','quality_tier','final_method','client_status','last_error','note'])];
  for(const row of outDb.prepare('SELECT * FROM deferred_generated_result ORDER BY item_id').iterate()){
    lines.push(cells([
      row.item_id,row.language,row.surface,row.normalized,row.bucket,row.quality_tier,row.final_method,
      row.client_status,row.last_error,row.note,
    ]));
  }
  await writeFile(deferredPath,lines.join('\n')+'\n','utf8');
}

async function report(){
  await writeDeferredTsv();
  const objectCounts=(sql)=>Object.fromEntries(outDb.prepare(sql).all().map((row)=>[String(row.k),Number(row.c)]));
  const report={
    schema:'rhymelab-pronunciation-secondary-v1-report',
    policy:PRONUNCIATION_SECONDARY_POLICY,
    source_fingerprint:sourceFingerprint,
    database:outPath,
    active:{
      total:scalar(outDb,'SELECT COUNT(*) AS c FROM secondary_form'),
      by_language:objectCounts('SELECT language AS k,COUNT(*) AS c FROM secondary_form GROUP BY language ORDER BY language'),
      by_quality:objectCounts('SELECT quality_tier AS k,COUNT(*) AS c FROM secondary_form GROUP BY quality_tier ORDER BY quality_tier'),
      default_search_eligible:scalar(outDb,'SELECT COUNT(*) AS c FROM secondary_form WHERE default_search_eligible=1'),
      user_opt_in_eligible:scalar(outDb,'SELECT COUNT(*) AS c FROM secondary_form WHERE user_opt_in_eligible=1'),
      phonetic_parity_rows:scalar(outDb,'SELECT COUNT(*) AS c FROM secondary_pronunciation'),
      lexical_analysis_rows:scalar(outDb,'SELECT COUNT(*) AS c FROM secondary_lexical_analysis'),
      source_record_rows:scalar(outDb,'SELECT COUNT(*) AS c FROM secondary_source_record'),
      etymology_rows:scalar(outDb,"SELECT COUNT(*) AS c FROM secondary_source_record WHERE etymology_text IS NOT NULL AND TRIM(etymology_text)<>''"),
      metadata_status:objectCounts('SELECT metadata_status AS k,COUNT(*) AS c FROM secondary_form GROUP BY metadata_status ORDER BY metadata_status'),
    },
    deferred:{
      total:scalar(outDb,'SELECT COUNT(*) AS c FROM deferred_generated_result'),
      by_bucket:objectCounts('SELECT bucket AS k,COUNT(*) AS c FROM deferred_generated_result GROUP BY bucket ORDER BY bucket'),
      tsv:deferredPath,
      owner_policy:'Do not review or promote these rows now. They remain preserved for a later explicit review phase.',
    },
    search_contract:{
      class:'second_class',
      default_search_included:false,
      user_checkbox_required:true,
      automatic_promotion:false,
    },
    parity_contract:{
      phonetic:[
        'ipa','phonemes','syllable_count','stress','primary_stress','rhyme_tail','final_tail',
        'exact_key','multisyllable_key','vowel_key','vowel_family','coda_key','coda_class','rhyme_syllables',
      ],
      lexical:[
        'lemma/POS/gender where source-backed','historical/style tags','form features/relations',
        'DE usage rank/count/source count','EN wordfreq + ESDB evidence',
      ],
      preserved_source_metadata:[
        'Kaikki etymology_text','compact senses/glosses','source tags','source-record links',
        'existing phrase/entity source context JSON',
      ],
      note:'Etymology and full senses are preserved as source metadata. They are not part of the current canonical hot-search schema and do not affect rhyme ranking unless a later product policy explicitly opts them in.',
    },
  };
  report.semantic_fingerprint=sha(JSON.stringify(report));
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({...report,report:reportPath},null,2));
}

try{
  if(phase==='all'||phase==='base')await materializeBase();
  if(phase==='all'||phase==='phonetics')await materializePhonetics();
  if(phase==='all'||phase==='de-source')await enrichGerman();
  if(phase==='all'||phase==='en-source')await enrichEnglish();
  if(phase==='all'||phase==='finalize')await finalizeMetadata();
  if(phase==='all'||phase==='report')await report();
}finally{
  try{outDb.exec('DETACH DATABASE source_work')}catch{}
  outDb.close();
  workDb.close();
}
