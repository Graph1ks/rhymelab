#!/usr/bin/env node
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { once } from 'node:events';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { inspectEspeakQueryPronunciation } from './query-pronunciation-espeak-adapter.mjs';
import { getPhonologyProfile } from './phonology-profiles.mjs';
import { normalizeGerman, optionsForListedForms } from './kaikki-resolver-lib.mjs';
import { lexicalEvidenceForHeadword, lexicalEvidenceForListedForms } from './en-publish-core.mjs';
import {
  normalizeEnglishSurface,
  readJson,
} from './en-writer-source-core.mjs';
import {
  resolveUnknownClientPronunciation,
  tokenizeClientPronunciationInput,
} from '../src/ui/query-pronunciation-client.mjs';
import {
  PRONUNCIATION_BACKFILL_POLICY,
  PRONUNCIATION_BACKFILL_SCHEMA,
  backfillSummary,
  classifyClientResolution,
  classifyEspeakResolution,
  createPronunciationBackfillStorage,
  hashJson,
  progressLine,
} from './pronunciation-backfill-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}
function hasFlag(flag){ return args.includes(flag); }
function integerArg(flag,fallback,{min=1,max=1_000_000}={}){
  const parsed=Number.parseInt(String(argValue(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(parsed)?parsed:fallback));
}

const deDbPath=resolve(argValue('--de-db','data/local/rhymelab-v5.sqlite'));
const deUsagePath=resolve(argValue('--de-usage','data/de/usage/de-usage.tsv'));
const deKaikkiPath=resolve(argValue('--de-kaikki','data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz'));
const enDbPath=resolve(argValue('--en-db','data/local/rhymelab-en-v1.sqlite'));
const enRegistryPath=resolve(argValue('--en-registry','sources/en/phase12b-sources-v1.json'));
const enRawDirArg=argValue('--en-raw-dir',null);
const phraseDbPath=resolve(argValue('--phrases','data/local/rhymelab-phrases-v1.sqlite'));
const entityDbPath=resolve(argValue('--entities','data/local/rhymelab-entities-v1.sqlite'));
const workPath=resolve(argValue('--work','data/local/pronunciation-backfill-v2.sqlite'));
const reportPath=resolve(argValue('--report','data/local/pronunciation-backfill-v2-report.json'));
const reviewPath=resolve(argValue('--review-tsv','data/local/pronunciation-backfill-v2-review.tsv'));
const allPath=resolve(argValue('--all-tsv','data/local/pronunciation-backfill-v2-all.tsv'));
const command=argValue('--command',process.env.RHYMELAB_ESPEAK_COMMAND||null);
const phase=String(argValue('--phase','all')).trim().toLowerCase();
const progressEvery=integerArg('--progress-every',1000,{min:1,max:1_000_000});
const commitEvery=integerArg('--commit-every',250,{min:1,max:10_000});
const retryErrors=hasFlag('--retry-errors');
const reset=hasFlag('--reset');
const exportAll=hasFlag('--export-all');

const requestedScopes=new Set(
  String(argValue('--scopes','de,en,phrases,entities'))
    .split(',')
    .map((value)=>value.trim().toLowerCase())
    .filter(Boolean),
);
for(const scope of requestedScopes){
  if(!['de','en','phrases','entities'].includes(scope)){
    throw new Error('Unknown --scopes value: '+scope);
  }
}
if(!['all','collect','espeak','client','report'].includes(phase)){
  throw new Error('Unknown --phase value: '+phase);
}

let stopRequested=false;
for(const signal of ['SIGINT','SIGTERM']){
  process.on(signal,()=>{
    if(stopRequested) return;
    stopRequested=true;
    console.error('\n[backfill] '+signal+' received; finishing the current transaction so the next run can resume.');
    process.exitCode=130;
  });
}

function now(){ return new Date().toISOString(); }
function safeJson(value){ return JSON.stringify(value??{}); }
function normalizedSurface(surface,language){
  return getPhonologyProfile(language).normalizeSurface(surface);
}
function metaObject(db){
  try{
    return Object.fromEntries(db.prepare('SELECT key,value FROM meta ORDER BY key').all().map((row)=>[row.key,row.value]));
  }catch{
    return {};
  }
}
async function fileState(path){
  const info=await stat(path);
  return {
    path,
    bytes:Number(info.size),
    mtime_ms:Math.trunc(Number(info.mtimeMs)),
  };
}
function openReadOnly(path){
  const db=new DatabaseSync(path,{readOnly:true});
  db.exec('PRAGMA query_only=ON;');
  return db;
}
function scalar(db,sql,...params){
  return Number(db.prepare(sql).get(...params)?.c||0);
}

const sourcePaths=[];
if(requestedScopes.has('de')) sourcePaths.push(['de_accepted',deDbPath]);
if(requestedScopes.has('en')) sourcePaths.push(['en_accepted',enDbPath]);
if(requestedScopes.has('phrases')) sourcePaths.push(['phrases_catalog',phraseDbPath]);
if(requestedScopes.has('entities')) sourcePaths.push(['entities_catalog',entityDbPath]);
for(const [scope,path] of sourcePaths){
  if(!existsSync(path)){
    throw new Error('Required '+scope+' database missing: '+path+'; narrow --scopes explicitly if this database should be excluded.');
  }
}

if(requestedScopes.has('de')){
  if(!existsSync(deUsagePath)){
    throw new Error('Required German usage-source inventory missing: '+deUsagePath+'. Pass --de-usage <path> to the actual merged usage TSV.');
  }
  if(!existsSync(deKaikkiPath)){
    throw new Error('Required original German Kaikki source missing: '+deKaikkiPath+'. Pass --de-kaikki <path> to the pinned raw snapshot used for the German build.');
  }
}

let enRegistry=null;
let enKaikkiSource=null;
let enRawDir=null;
let enKaikkiPath=null;
if(requestedScopes.has('en')){
  if(!existsSync(enRegistryPath)) throw new Error('English source registry missing: '+enRegistryPath);
  enRegistry=await readJson(enRegistryPath);
  enRawDir=resolve(enRawDirArg||enRegistry.local_raw_directory||'data/raw/en/phase12b-20260918');
  enKaikkiSource=Object.values(enRegistry.sources||{}).find((source)=>String(source.source_id||'').startsWith('enwiktionary-kaikki'));
  if(!enKaikkiSource) throw new Error('English source registry has no Kaikki/Wiktextract source.');
  enKaikkiPath=resolve(enRawDir,enKaikkiSource.local_filename);
  if(!existsSync(enKaikkiPath)){
    throw new Error('Required original English Kaikki source missing: '+enKaikkiPath+'. Run npm run en:sources:bootstrap or point --en-raw-dir at the pinned source directory.');
  }
}

if(reset){
  for(const path of [workPath,workPath+'-wal',workPath+'-shm',reportPath,reviewPath,allPath]){
    await rm(path,{force:true});
  }
}

await mkdir(dirname(workPath),{recursive:true});
await mkdir(dirname(reportPath),{recursive:true});
await mkdir(dirname(reviewPath),{recursive:true});

const sourceSnapshot={};
for(const [scope,path] of sourcePaths){
  const db=openReadOnly(path);
  try{
    sourceSnapshot[scope]={
      ...(await fileState(path)),
      meta:metaObject(db),
    };
  }finally{
    db.close();
  }
}
if(requestedScopes.has('de')){
  sourceSnapshot.de_source_usage=await fileState(deUsagePath);
  sourceSnapshot.de_source_raw=await fileState(deKaikkiPath);
}
if(requestedScopes.has('en')){
  sourceSnapshot.en_source_kaikki={
    ...(await fileState(enKaikkiPath)),
    registry:enRegistry.id||null,
    source_id:enKaikkiSource.source_id||null,
    snapshot:enKaikkiSource.snapshot||null,
  };
}
const sourceFingerprint=hashJson(sourceSnapshot);

const workDb=new DatabaseSync(workPath);
createPronunciationBackfillStorage(workDb);
const upsertMeta=workDb.prepare(
  'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
);
const existingSchema=workDb.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value||null;
const existingFingerprint=workDb.prepare("SELECT value FROM meta WHERE key='source_fingerprint'").get()?.value||null;
if(existingSchema&&existingSchema!==PRONUNCIATION_BACKFILL_SCHEMA){
  throw new Error('Unexpected backfill schema in '+workPath+': '+existingSchema);
}
if(existingFingerprint&&existingFingerprint!==sourceFingerprint){
  throw new Error(
    'Input database state changed since this workset was created. Refusing to mix revisions. '
    +'Run again with --reset to start a new backfill workset.'
  );
}
for(const [key,value] of Object.entries({
  schema:PRONUNCIATION_BACKFILL_SCHEMA,
  policy:PRONUNCIATION_BACKFILL_POLICY,
  source_fingerprint:sourceFingerprint,
  source_snapshot_json:safeJson(sourceSnapshot),
  created_at:workDb.prepare("SELECT value FROM meta WHERE key='created_at'").get()?.value||now(),
  updated_at:now(),
})){
  upsertMeta.run(key,String(value));
}

const insertItem=workDb.prepare([
  'INSERT INTO work_item(language,normalized,surface,token_count,updated_at)',
  'VALUES(?,?,?,?,?)',
  'ON CONFLICT(language,normalized) DO NOTHING',
].join(' '));
const getItem=workDb.prepare(
  'SELECT item_id FROM work_item WHERE language=? AND normalized=?'
);
const insertRef=workDb.prepare([
  'INSERT INTO source_ref(item_id,scope,source_db,source_table,source_key,surface,context_json)',
  'VALUES(?,?,?,?,?,?,?)',
  'ON CONFLICT(scope,source_key) DO NOTHING',
].join(' '));
const bumpRef=workDb.prepare(
  'UPDATE work_item SET source_ref_count=source_ref_count+1,updated_at=? WHERE item_id=?'
);
const upsertScan=workDb.prepare([
  'INSERT INTO scan_state(scope,status,last_key,scanned,source_refs,unique_items_added,updated_at)',
  'VALUES(?,?,?,?,?,?,?)',
  'ON CONFLICT(scope) DO UPDATE SET',
  'status=excluded.status,last_key=excluded.last_key,scanned=excluded.scanned,',
  'source_refs=excluded.source_refs,unique_items_added=excluded.unique_items_added,updated_at=excluded.updated_at',
].join(' '));

function addWorkReference({scope,sourceDb,sourceTable,sourceKey,surface,language,context={}}){
  const normalized=normalizedSurface(surface,language);
  if(!normalized) return {itemAdded:0,refAdded:0};
  const tokenCount=Math.max(1,tokenizeClientPronunciationInput(surface).length);
  const inserted=insertItem.run(language,normalized,String(surface),tokenCount,now());
  const item=getItem.get(language,normalized);
  if(!item) throw new Error('Unable to recover inserted pronunciation work item.');
  const ref=insertRef.run(
    Number(item.item_id),
    scope,
    sourceDb,
    sourceTable,
    String(sourceKey),
    String(surface),
    safeJson(context),
  );
  if(Number(ref.changes||0)>0) bumpRef.run(now(),Number(item.item_id));
  return {
    itemAdded:Number(inserted.changes||0)>0?1:0,
    refAdded:Number(ref.changes||0)>0?1:0,
  };
}

async function runScopeScan({
  scope,
  total,
  rows,
  map,
}){
  const saved=workDb.prepare('SELECT * FROM scan_state WHERE scope=?').get(scope)||null;
  if(saved?.status==='complete'){
    console.log('[collect:'+scope+'] already complete · refs='+Number(saved.source_refs||0).toLocaleString('en-US'));
    return;
  }
  let lastKey=saved?.last_key||null;
  let scanned=Number(saved?.scanned||0);
  let refs=Number(saved?.source_refs||0);
  let uniques=Number(saved?.unique_items_added||0);
  const startedAt=Date.now();
  console.log(
    '[collect:'+scope+'] start/resume · already='+scanned.toLocaleString('en-US')
    +' · estimated gaps='+Number(total||0).toLocaleString('en-US')
  );

  let batch=0;
  let transactionOpen=false;
  try{
    workDb.exec('BEGIN IMMEDIATE');
    transactionOpen=true;
    for(const row of rows(lastKey)){
      if(stopRequested) break;
      const mapped=map(row);
      const result=addWorkReference(mapped);
      scanned+=1;
      refs+=result.refAdded;
      uniques+=result.itemAdded;
      lastKey=String(mapped.checkpointKey);
      batch+=1;

      if(scanned%progressEvery===0){
        console.log(progressLine({
          phase:'collect:'+scope,
          done:scanned,
          total:Math.max(scanned,Number(total||0)),
          startedAt,
          accepted:refs,
          rejected:0,
          errors:0,
          extra:'unique_added='+uniques.toLocaleString('en-US'),
        }));
      }
      if(batch>=commitEvery){
        upsertScan.run(scope,'running',lastKey,scanned,refs,uniques,now());
        workDb.exec('COMMIT');
        transactionOpen=false;
        workDb.exec('BEGIN IMMEDIATE');
        transactionOpen=true;
        batch=0;
      }
    }
    upsertScan.run(scope,stopRequested?'running':'complete',lastKey,scanned,refs,uniques,now());
    workDb.exec('COMMIT');
    transactionOpen=false;
  }catch(error){
    if(transactionOpen) workDb.exec('ROLLBACK');
    throw error;
  }

  console.log(
    '[collect:'+scope+'] '+(stopRequested?'checkpointed':'complete')
    +' · scanned='+scanned.toLocaleString('en-US')
    +' · refs='+refs.toLocaleString('en-US')
    +' · unique_added='+uniques.toLocaleString('en-US')
  );
}


const DE_SOURCE_WORD_RE=/^\p{L}+(?:[-'’]\p{L}+)*$/u;

function parseTsvHeader(line){
  const names=String(line||'').replace(/^\uFEFF/u,'').split('\t');
  return Object.fromEntries(names.map((name,index)=>[name,index]));
}

async function collectGermanUsageSourceDiff(){
  const scope='de_usage_source_minus_accepted';
  const saved=workDb.prepare('SELECT * FROM scan_state WHERE scope=?').get(scope)||null;
  if(saved?.status==='complete'){
    console.log('[collect:'+scope+'] already complete · gaps='+Number(saved.source_refs||0).toLocaleString('en-US'));
    return;
  }

  const acceptedDb=openReadOnly(deDbPath);
  const accepted=acceptedDb.prepare([
    'SELECT 1 AS ok FROM hot',
    'WHERE normalized=? AND pronunciation_preferred=1 AND pronunciation_eligible=1',
    'LIMIT 1',
  ].join(' '));

  let lastRank=Number(saved?.last_key||0);
  let scanned=Number(saved?.scanned||0);
  let refs=Number(saved?.source_refs||0);
  let uniques=Number(saved?.unique_items_added||0);
  const startedAt=Date.now();
  let batch=0;
  let transactionOpen=false;

  console.log(
    '[collect:'+scope+'] merged German usage inventory -> accepted DE Writer diff'
    +' · source='+deUsagePath
    +' · resume_rank='+lastRank.toLocaleString('en-US')
  );

  const lines=createInterface({input:createReadStream(deUsagePath),crlfDelay:Infinity});
  let header=null;
  try{
    workDb.exec('BEGIN IMMEDIATE');
    transactionOpen=true;
    for await(const line of lines){
      if(stopRequested) break;
      if(!line) continue;
      if(!header){
        header=parseTsvHeader(line);
        for(const required of ['rank','form','normalized_form']){
          if(!(required in header)) throw new Error('German usage TSV missing column '+required+': '+deUsagePath);
        }
        continue;
      }
      const cells=line.split('\t');
      const rank=Number.parseInt(cells[header.rank]||'',10);
      if(!Number.isInteger(rank)||rank<=lastRank) continue;
      const surface=String(cells[header.form]||'').normalize('NFKC').trim();
      const normalized=String(cells[header.normalized_form]||normalizeGerman(surface));
      scanned+=1;
      lastRank=rank;
      batch+=1;

      if(surface&&DE_SOURCE_WORD_RE.test(surface)&&!accepted.get(normalized)){
        const result=addWorkReference({
          scope,
          sourceDb:deUsagePath,
          sourceTable:'merged_usage_tsv',
          sourceKey:String(rank),
          surface,
          language:'de',
          context:{
            reason:'usage_source_form_without_accepted_de_pronunciation',
            usage_rank:rank,
            combined_count:header.combined_count===undefined?null:Number(cells[header.combined_count]||0),
            source_count:header.source_count===undefined?null:Number(cells[header.source_count]||0),
          },
        });
        refs+=result.refAdded;
        uniques+=result.itemAdded;
      }

      if(scanned%progressEvery===0){
        const elapsed=Math.max(0.001,(Date.now()-startedAt)/1000);
        console.log(
          '[collect:'+scope+'] scanned='+scanned.toLocaleString('en-US')
          +' · rank='+lastRank.toLocaleString('en-US')
          +' · missing_refs='+refs.toLocaleString('en-US')
          +' · unique_added='+uniques.toLocaleString('en-US')
          +' · '+(scanned/elapsed).toFixed(1)+'/s'
        );
      }
      if(batch>=commitEvery){
        upsertScan.run(scope,'running',String(lastRank),scanned,refs,uniques,now());
        workDb.exec('COMMIT');
        transactionOpen=false;
        workDb.exec('BEGIN IMMEDIATE');
        transactionOpen=true;
        batch=0;
      }
    }

    upsertScan.run(scope,stopRequested?'running':'complete',String(lastRank),scanned,refs,uniques,now());
    workDb.exec('COMMIT');
    transactionOpen=false;
  }catch(error){
    if(transactionOpen) workDb.exec('ROLLBACK');
    throw error;
  }finally{
    lines.close();
    acceptedDb.close();
  }

  console.log(
    '[collect:'+scope+'] '+(stopRequested?'checkpointed':'complete')
    +' · scanned='+scanned.toLocaleString('en-US')
    +' · missing_refs='+refs.toLocaleString('en-US')
    +' · unique_added='+uniques.toLocaleString('en-US')
  );
}

async function collectGermanHeadwordSourceDiff(){
  const scope='de_wiktionary_headword_source_minus_accepted';
  const saved=workDb.prepare('SELECT * FROM scan_state WHERE scope=?').get(scope)||null;
  if(saved?.status==='complete'){
    console.log('[collect:'+scope+'] already complete · gaps='+Number(saved.source_refs||0).toLocaleString('en-US'));
    return;
  }

  const checkpoint=sequentialSourceCheckpoint(saved?.last_key,'germanEntries','headwordCandidates');
  let rawLine=checkpoint.rawLine;
  let germanEntries=checkpoint.entries;
  let headwordCandidates=checkpoint.candidates;
  let refs=Number(saved?.source_refs||0);
  let uniques=Number(saved?.unique_items_added||0);
  const startedAt=Date.now();

  const acceptedDb=openReadOnly(deDbPath);
  const accepted=acceptedDb.prepare([
    'SELECT 1 AS ok FROM hot',
    'WHERE normalized=? AND pronunciation_preferred=1 AND pronunciation_eligible=1',
    'LIMIT 1',
  ].join(' '));

  console.log(
    '[collect:'+scope+'] original German Kaikki headwords -> accepted DE Writer diff'
    +' · source='+deKaikkiPath
    +' · resume_raw_line='+rawLine.toLocaleString('en-US')
  );

  const source=createReadStream(deKaikkiPath);
  const input=deKaikkiPath.endsWith('.gz')?source.pipe(createGunzip()):source;
  const lines=createInterface({input,crlfDelay:Infinity});
  let currentRawLine=0;
  let batch=0;
  let transactionOpen=false;

  try{
    workDb.exec('BEGIN IMMEDIATE');
    transactionOpen=true;
    for await(const line of lines){
      currentRawLine+=1;
      if(currentRawLine<=rawLine) continue;
      if(stopRequested) break;
      if(!line) continue;

      let entry;
      try{entry=JSON.parse(line);}catch{continue;}
      rawLine=currentRawLine;
      if(entry?.lang_code!=='de'||!entry?.word) continue;
      germanEntries+=1;

      const surface=String(entry.word).normalize('NFKC').trim();
      if(!DE_SOURCE_WORD_RE.test(surface)||surface.length>80) continue;
      headwordCandidates+=1;
      const normalized=normalizeGerman(surface);
      if(!accepted.get(normalized)){
        const sourceIpaCount=(entry.sounds||[]).filter((sound)=>sound?.ipa).length;
        const result=addWorkReference({
          scope,
          sourceDb:deKaikkiPath,
          sourceTable:'wiktextract_headword',
          sourceKey:normalized,
          surface,
          language:'de',
          context:{
            reason:'wiktionary_headword_without_accepted_de_pronunciation',
            source_ipa_count:sourceIpaCount,
            pos:entry.pos||null,
          },
        });
        refs+=result.refAdded;
        uniques+=result.itemAdded;
      }

      batch+=1;
      if(germanEntries%progressEvery===0){
        const elapsed=Math.max(0.001,(Date.now()-startedAt)/1000);
        console.log(
          '[collect:'+scope+'] de_entries='+germanEntries.toLocaleString('en-US')
          +' · raw_line='+rawLine.toLocaleString('en-US')
          +' · candidates='+headwordCandidates.toLocaleString('en-US')
          +' · missing_refs='+refs.toLocaleString('en-US')
          +' · unique_added='+uniques.toLocaleString('en-US')
          +' · '+(germanEntries/elapsed).toFixed(1)+' DE entries/s'
        );
      }
      if(batch>=commitEvery){
        upsertScan.run(
          scope,'running',
          JSON.stringify({rawLine,germanEntries,headwordCandidates}),
          germanEntries,refs,uniques,now(),
        );
        workDb.exec('COMMIT');
        transactionOpen=false;
        workDb.exec('BEGIN IMMEDIATE');
        transactionOpen=true;
        batch=0;
      }
    }

    upsertScan.run(
      scope,stopRequested?'running':'complete',
      JSON.stringify({rawLine,germanEntries,headwordCandidates}),
      germanEntries,refs,uniques,now(),
    );
    workDb.exec('COMMIT');
    transactionOpen=false;
  }catch(error){
    if(transactionOpen) workDb.exec('ROLLBACK');
    throw error;
  }finally{
    lines.close();
    input.destroy();
    acceptedDb.close();
  }

  console.log(
    '[collect:'+scope+'] '+(stopRequested?'checkpointed':'complete')
    +' · de_entries='+germanEntries.toLocaleString('en-US')
    +' · headword_candidates='+headwordCandidates.toLocaleString('en-US')
    +' · missing_refs='+refs.toLocaleString('en-US')
    +' · unique_added='+uniques.toLocaleString('en-US')
  );
}

function sequentialSourceCheckpoint(value,entryKey='entries',candidateKey='candidates'){
  try{
    const parsed=JSON.parse(String(value||'{}'));
    return {
      rawLine:Number(parsed.rawLine||0),
      entries:Number(parsed[entryKey]||0),
      candidates:Number(parsed[candidateKey]||0),
    };
  }catch{
    return {rawLine:0,entries:0,candidates:0};
  }
}

async function collectGermanListedFormSourceDiff(){
  const scope='de_listed_form_source_minus_accepted';
  const saved=workDb.prepare('SELECT * FROM scan_state WHERE scope=?').get(scope)||null;
  if(saved?.status==='complete'){
    console.log('[collect:'+scope+'] already complete · gaps='+Number(saved.source_refs||0).toLocaleString('en-US'));
    return;
  }

  const checkpoint=sequentialSourceCheckpoint(saved?.last_key,'germanEntries','listedCandidates');
  let rawLine=checkpoint.rawLine;
  let germanEntries=checkpoint.entries;
  let listedCandidates=checkpoint.candidates;
  let refs=Number(saved?.source_refs||0);
  let uniques=Number(saved?.unique_items_added||0);
  const startedAt=Date.now();

  const acceptedDb=openReadOnly(deDbPath);
  const accepted=acceptedDb.prepare([
    'SELECT 1 AS ok FROM hot',
    'WHERE normalized=? AND pronunciation_preferred=1 AND pronunciation_eligible=1',
    'LIMIT 1',
  ].join(' '));

  console.log(
    '[collect:'+scope+'] original German Kaikki listed forms -> accepted DE Writer diff'
    +' · source='+deKaikkiPath
    +' · resume_raw_line='+rawLine.toLocaleString('en-US')
  );
  if(rawLine>0){
    console.log(
      '[collect:'+scope+'] gzip source is sequential: resume re-decompresses the prefix to raw line '
      +rawLine.toLocaleString('en-US')
      +' but does not redo committed gap rows or any pronunciation generation.'
    );
  }

  const source=createReadStream(deKaikkiPath);
  const input=deKaikkiPath.endsWith('.gz')?source.pipe(createGunzip()):source;
  const lines=createInterface({input,crlfDelay:Infinity});
  let currentRawLine=0;
  let batch=0;
  let transactionOpen=false;

  try{
    workDb.exec('BEGIN IMMEDIATE');
    transactionOpen=true;
    for await(const line of lines){
      currentRawLine+=1;
      if(currentRawLine<=rawLine) continue;
      if(stopRequested) break;
      if(!line) continue;
      let entry;
      try{entry=JSON.parse(line);}catch{continue;}
      if(entry?.lang_code!=='de') continue;

      germanEntries+=1;
      for(const listed of optionsForListedForms(entry)){
        const surface=String(listed?.candidateSurface||'').normalize('NFKC').trim();
        if(!surface) continue;
        const normalized=normalizedSurface(surface,'de');
        listedCandidates+=1;
        if(accepted.get(normalized)) continue;
        const option=listed?.option||{};
        const result=addWorkReference({
          scope,
          sourceDb:deKaikkiPath,
          sourceTable:'wiktextract_listed_form',
          sourceKey:normalized,
          surface,
          language:'de',
          context:{
            reason:'source_listed_form_not_in_accepted_de_writer',
            source_record_key:option.sourceRecordKey||null,
            candidate_ipa_count:Array.isArray(option.candidateIpas)?option.candidateIpas.length:0,
            form_features:Array.isArray(option.formFeatures)?option.formFeatures:[],
            lemma:option.lemma||null,
            pos:option.pos||null,
          },
        });
        refs+=result.refAdded;
        uniques+=result.itemAdded;
      }

      rawLine=currentRawLine;
      batch+=1;
      if(germanEntries%progressEvery===0){
        const elapsed=Math.max(0.001,(Date.now()-startedAt)/1000);
        console.log(
          '[collect:'+scope+'] german_entries='+germanEntries.toLocaleString('en-US')
          +' · raw_line='+rawLine.toLocaleString('en-US')
          +' · listed_candidates='+listedCandidates.toLocaleString('en-US')
          +' · missing_unique_refs='+refs.toLocaleString('en-US')
          +' · unique_added='+uniques.toLocaleString('en-US')
          +' · '+(germanEntries/elapsed).toFixed(1)+' German entries/s'
        );
      }
      if(batch>=commitEvery){
        upsertScan.run(
          scope,'running',
          JSON.stringify({rawLine,germanEntries,listedCandidates}),
          germanEntries,refs,uniques,now(),
        );
        workDb.exec('COMMIT');
        transactionOpen=false;
        workDb.exec('BEGIN IMMEDIATE');
        transactionOpen=true;
        batch=0;
      }
    }
    upsertScan.run(
      scope,stopRequested?'running':'complete',
      JSON.stringify({rawLine,germanEntries,listedCandidates}),
      germanEntries,refs,uniques,now(),
    );
    workDb.exec('COMMIT');
    transactionOpen=false;
  }catch(error){
    if(transactionOpen) workDb.exec('ROLLBACK');
    throw error;
  }finally{
    lines.close();
    input.destroy();
    acceptedDb.close();
  }

  console.log(
    '[collect:'+scope+'] '+(stopRequested?'checkpointed':'complete')
    +' · german_entries='+germanEntries.toLocaleString('en-US')
    +' · listed_candidates='+listedCandidates.toLocaleString('en-US')
    +' · missing_unique_refs='+refs.toLocaleString('en-US')
    +' · unique_added='+uniques.toLocaleString('en-US')
  );
}

function englishCheckpoint(value){
  try{
    const parsed=JSON.parse(String(value||'{}'));
    return {
      rawLine:Number(parsed.rawLine||0),
      englishEntries:Number(parsed.englishEntries||0),
      candidateSurfaces:Number(parsed.candidateSurfaces||0),
    };
  }catch{
    return {rawLine:0,englishEntries:0,candidateSurfaces:0};
  }
}

async function collectEnglishSourceDiff(){
  const scope='en_source_minus_accepted';
  const saved=workDb.prepare('SELECT * FROM scan_state WHERE scope=?').get(scope)||null;
  if(saved?.status==='complete'){
    console.log('[collect:'+scope+'] already complete · gaps='+Number(saved.source_refs||0).toLocaleString('en-US'));
    return;
  }

  const checkpoint=englishCheckpoint(saved?.last_key);
  let rawLine=checkpoint.rawLine;
  let englishEntries=checkpoint.englishEntries;
  let candidateSurfaces=checkpoint.candidateSurfaces;
  let refs=Number(saved?.source_refs||0);
  let uniques=Number(saved?.unique_items_added||0);
  const startedAt=Date.now();

  const acceptedDb=openReadOnly(enDbPath);
  const accepted=acceptedDb.prepare([
    'SELECT 1 AS ok',
    'FROM en_form f JOIN en_pronunciation p ON p.form_id=f.id',
    "WHERE f.normalized=? AND p.analysis_status='ok' AND p.locale_us=1",
    'LIMIT 1',
  ].join(' '));

  console.log(
    '[collect:'+scope+'] original Kaikki/Wiktextract -> accepted EN Writer diff'
    +' · source='+enKaikkiPath
    +' · resume_raw_line='+rawLine.toLocaleString('en-US')
  );
  if(rawLine>0){
    console.log(
      '[collect:'+scope+'] gzip source is sequential: resume re-decompresses the prefix to raw line '
      +rawLine.toLocaleString('en-US')
      +' but does not redo DB inserts or any eSpeak/client work.'
    );
  }

  const input=createReadStream(enKaikkiPath).pipe(createGunzip());
  const lines=createInterface({input,crlfDelay:Infinity});
  let currentRawLine=0;
  let batch=0;
  let transactionOpen=false;

  const maybeAdd=(surface,kind,sourceRecord)=>{
    const normalized=normalizeEnglishSurface(surface);
    if(!normalized||!isWriterCandidateSurface(normalized)) return;
    candidateSurfaces+=1;
    if(accepted.get(normalized)) return;
    const result=addWorkReference({
      scope,
      sourceDb:enKaikkiPath,
      sourceTable:'wiktextract',
      sourceKey:normalized,
      surface:String(surface),
      language:'en',
      context:{
        reason:'source_candidate_not_in_accepted_en_writer',
        evidence_kind:kind,
        source_record:sourceRecord,
      },
    });
    refs+=result.refAdded;
    uniques+=result.itemAdded;
  };

  try{
    workDb.exec('BEGIN IMMEDIATE');
    transactionOpen=true;
    for await(const line of lines){
      currentRawLine+=1;
      if(currentRawLine<=rawLine) continue;
      if(stopRequested) break;
      if(!line) continue;
      let entry;
      try{entry=JSON.parse(line);}catch{continue;}
      if(entry?.lang_code!=='en') continue;

      englishEntries+=1;
      const sourceRecord=String(entry.word||'')+'#'+englishEntries;
      maybeAdd(entry.word,'wiktionary_headword',sourceRecord);
      for(const form of entry.forms||[]){
        if(!form?.form) continue;
        maybeAdd(form.form,'wiktionary_listed_form',sourceRecord);
      }

      rawLine=currentRawLine;
      batch+=1;
      if(englishEntries%progressEvery===0){
        const elapsed=Math.max(0.001,(Date.now()-startedAt)/1000);
        console.log(
          '[collect:'+scope+'] english_entries='+englishEntries.toLocaleString('en-US')
          +' · raw_line='+rawLine.toLocaleString('en-US')
          +' · candidate_occurrences='+candidateSurfaces.toLocaleString('en-US')
          +' · missing_unique_refs='+refs.toLocaleString('en-US')
          +' · unique_added='+uniques.toLocaleString('en-US')
          +' · '+(englishEntries/elapsed).toFixed(1)+' English entries/s'
        );
      }
      if(batch>=commitEvery){
        upsertScan.run(
          scope,'running',
          JSON.stringify({rawLine,englishEntries,candidateSurfaces}),
          englishEntries,refs,uniques,now(),
        );
        workDb.exec('COMMIT');
        transactionOpen=false;
        workDb.exec('BEGIN IMMEDIATE');
        transactionOpen=true;
        batch=0;
      }
    }
    upsertScan.run(
      scope,stopRequested?'running':'complete',
      JSON.stringify({rawLine,englishEntries,candidateSurfaces}),
      englishEntries,refs,uniques,now(),
    );
    workDb.exec('COMMIT');
    transactionOpen=false;
  }catch(error){
    if(transactionOpen) workDb.exec('ROLLBACK');
    throw error;
  }finally{
    lines.close();
    input.destroy();
    acceptedDb.close();
  }

  console.log(
    '[collect:'+scope+'] '+(stopRequested?'checkpointed':'complete')
    +' · english_entries='+englishEntries.toLocaleString('en-US')
    +' · candidate_occurrences='+candidateSurfaces.toLocaleString('en-US')
    +' · missing_unique_refs='+refs.toLocaleString('en-US')
    +' · unique_added='+uniques.toLocaleString('en-US')
  );
}

async function collect(){
  console.log('\n=== PRONUNCIATION BACKFILL · COLLECT ===');
  console.log('workset: '+workPath);
  console.log('source fingerprint: '+sourceFingerprint);

  if(requestedScopes.has('de')&&!stopRequested){
    await collectGermanUsageSourceDiff();
    if(!stopRequested) await collectGermanHeadwordSourceDiff();
    if(!stopRequested) await collectGermanListedFormSourceDiff();
  }

  if(requestedScopes.has('en')&&!stopRequested){
    await collectEnglishSourceDiff();
  }

  if(requestedScopes.has('phrases')&&!stopRequested){
    const db=openReadOnly(phraseDbPath);
    try{
      const tokenTotal=scalar(db,[
        'SELECT COUNT(*) AS c FROM (',
        ' SELECT r.normalized FROM phrase_token_pronunciation_resolution r',
        " WHERE r.status<>'resolved_preferred'",
        ' GROUP BY r.normalized',
        ')',
      ].join(' '));
      await runScopeScan({
        scope:'phrase_unresolved_token',
        total:tokenTotal,
        rows:(lastKey)=>db.prepare([
          'SELECT r.normalized AS source_key,MIN(t.surface) AS surface,',
          'COUNT(*) AS token_occurrences,COUNT(DISTINCT r.phrase_id) AS phrase_count,',
          'SUM(CASE WHEN p.modern_eligible=1 THEN 1 ELSE 0 END) AS modern_phrase_occurrences',
          'FROM phrase_token_pronunciation_resolution r',
          'JOIN phrase_token t ON t.phrase_id=r.phrase_id AND t.token_index=r.token_index',
          'JOIN phrase p USING(phrase_id)',
          "WHERE r.status<>'resolved_preferred' AND r.normalized>?",
          'GROUP BY r.normalized',
          'ORDER BY r.normalized',
        ].join(' ')).iterate(String(lastKey||'')),
        map:(row)=>({
          scope:'phrase_unresolved_token',
          sourceDb:phraseDbPath,
          sourceTable:'phrase_token_pronunciation_resolution',
          sourceKey:row.source_key,
          checkpointKey:row.source_key,
          surface:row.surface||row.source_key,
          language:'de',
          context:{
            token_occurrences:Number(row.token_occurrences||0),
            phrase_count:Number(row.phrase_count||0),
            modern_phrase_occurrences:Number(row.modern_phrase_occurrences||0),
          },
        }),
      });

      if(!stopRequested){
        const phraseTotal=scalar(db,[
          'SELECT COUNT(*) AS c FROM phrase p',
          'WHERE NOT EXISTS (',
          ' SELECT 1 FROM phrase_pronunciation pp WHERE pp.phrase_id=p.phrase_id AND pp.eligible=1',
          ')',
        ].join(' '));
        await runScopeScan({
          scope:'phrase_surface_unresolved',
          total:phraseTotal,
          rows:(lastKey)=>db.prepare([
            'SELECT p.phrase_id AS source_key,p.canonical AS surface,p.normalized,p.token_count,p.modern_eligible',
            'FROM phrase p',
            'WHERE p.phrase_id>? AND NOT EXISTS (',
            ' SELECT 1 FROM phrase_pronunciation pp WHERE pp.phrase_id=p.phrase_id AND pp.eligible=1',
            ')',
            'ORDER BY p.phrase_id',
          ].join(' ')).iterate(Number(lastKey||0)),
          map:(row)=>({
            scope:'phrase_surface_unresolved',
            sourceDb:phraseDbPath,
            sourceTable:'phrase',
            sourceKey:row.source_key,
            checkpointKey:row.source_key,
            surface:row.surface||row.normalized,
            language:'de',
            context:{
              token_count:Number(row.token_count||0),
              modern_eligible:Boolean(row.modern_eligible),
            },
          }),
        });
      }
    }finally{ db.close(); }
  }

  if(requestedScopes.has('entities')&&!stopRequested){
    const db=openReadOnly(entityDbPath);
    const acceptedStates=['accepted','reviewed','accepted_source_composition','accepted_source_backed'];
    const placeholders=acceptedStates.map(()=>'?').join(',');
    try{
      for(const language of ['de','en']){
        if(stopRequested) break;
        const locale=language==='de'?'de-DE':'en-US';
        const missingWhere=[
          'n.searchable=1 AND n.language=? AND NOT EXISTS (',
          ' SELECT 1 FROM entity_pronunciation p',
          ' WHERE p.name_id=n.name_id AND p.locale=? AND p.generated=0',
          ' AND p.review_state IN ('+placeholders+')',
          ')',
        ].join(' ');
        const total=Number(db.prepare(
          'SELECT COUNT(*) AS c FROM entity_name n WHERE '+missingWhere
        ).get(language,locale,...acceptedStates)?.c||0);
        const scope='entity_'+language+'_no_source_pronunciation';
        await runScopeScan({
          scope,
          total,
          rows:(lastKey)=>db.prepare([
            'SELECT n.name_id AS source_key,n.surface,n.normalized,n.preferred,n.name_kind,',
            'e.qid,e.primary_category,e.popularity_tier,e.popularity_percentile,e.popularity_score',
            'FROM entity_name n JOIN entity e USING(entity_id)',
            'WHERE n.name_id>? AND '+missingWhere,
            'ORDER BY n.name_id',
          ].join(' ')).iterate(Number(lastKey||0),language,locale,...acceptedStates),
          map:(row)=>({
            scope,
            sourceDb:entityDbPath,
            sourceTable:'entity_name',
            sourceKey:row.source_key,
            checkpointKey:row.source_key,
            surface:row.surface||row.normalized,
            language,
            context:{
              qid:row.qid,
              preferred:Boolean(row.preferred),
              name_kind:row.name_kind,
              primary_category:row.primary_category,
              popularity_tier:row.popularity_tier,
              popularity_percentile:Number(row.popularity_percentile||0),
              popularity_score:Number(row.popularity_score||0),
            },
          }),
        });
      }
    }finally{ db.close(); }
  }

  upsertMeta.run('collection_complete',stopRequested?'0':'1');
  upsertMeta.run('updated_at',now());
  console.log('[collect] workset summary:',JSON.stringify(backfillSummary(workDb),null,2));
}

function rowAnalysisFields(analysis){
  return {
    syllableCount:Number(analysis?.syllableCount||0)||null,
    primaryStress:Number(analysis?.primaryStressSyllable||0)||null,
    stressPattern:analysis?.stressPattern||null,
    exactTailKey:analysis?.exactTailKey||null,
    vowelKey:analysis?.vowelKey||null,
    codaKey:analysis?.codaKey||null,
  };
}

const updateEspeakAccepted=workDb.prepare([
  "UPDATE work_item SET espeak_status='accepted',client_status='skipped',final_status='resolved',",
  'quality_tier=?,quality_reason=?,final_method=?,ipa=?,raw_ipa=?,syllable_count=?,primary_stress=?,',
  'stress_pattern=?,exact_tail_key=?,vowel_key=?,coda_key=?,source_backed=0,engine=?,engine_version=?,',
  'last_error=NULL,updated_at=? WHERE item_id=?',
].join(' '));
const updateEspeakRejected=workDb.prepare([
  "UPDATE work_item SET espeak_status='rejected',client_status=CASE WHEN client_status='skipped' THEN 'pending' ELSE client_status END,",
  "final_status='pending',quality_tier=NULL,quality_reason=NULL,final_method=NULL,ipa=NULL,raw_ipa=?,",
  'engine=?,engine_version=?,last_error=?,updated_at=? WHERE item_id=?',
].join(' '));
const updateEspeakError=workDb.prepare([
  "UPDATE work_item SET espeak_status='error',last_error=?,updated_at=? WHERE item_id=?",
].join(' '));
const insertAttempt=workDb.prepare([
  'INSERT INTO attempt(item_id,stage,status,reason,elapsed_ms,detail_json,created_at)',
  'VALUES(?,?,?,?,?,?,?)',
].join(' '));

async function runEspeak(){
  console.log('\n=== PRONUNCIATION BACKFILL · ESPEAK-NG ===');
  if(workDb.prepare("SELECT value FROM meta WHERE key='collection_complete'").get()?.value!=='1'){
    throw new Error('Collection is incomplete. Resume --phase collect or run the default all-phase command first.');
  }
  const condition=retryErrors
    ?"espeak_status IN ('pending','error')"
    :"espeak_status='pending'";
  const total=scalar(workDb,'SELECT COUNT(*) AS c FROM work_item WHERE '+condition);
  if(!total){
    console.log('[espeak] nothing pending.');
    return;
  }

  const first=workDb.prepare('SELECT surface,language FROM work_item WHERE '+condition+' ORDER BY item_id LIMIT 1').get();
  const preflight=inspectEspeakQueryPronunciation(first.surface,first.language,{command});
  if(preflight.status==='unavailable'){
    throw new Error(
      'eSpeak-NG is not available. Install it or pass --command <path>; '
      +'RHYMELAB_ESPEAK_COMMAND remains supported exactly like the earlier benchmark scripts.'
    );
  }
  console.log(
    '[espeak] engine='+(preflight.engineVersion||preflight.engine||'eSpeak-NG')
    +' · command='+(preflight.engineCommand||command||'auto-detect')
    +' · pending='+total.toLocaleString('en-US')
  );

  const batchQuery=workDb.prepare(
    'SELECT item_id,language,surface,normalized FROM work_item WHERE '+condition+' ORDER BY item_id LIMIT ?'
  );
  let done=0,accepted=0,rejected=0,errors=0;
  const startedAt=Date.now();

  while(!stopRequested){
    const rows=batchQuery.all(commitEvery);
    if(!rows.length) break;
    workDb.exec('BEGIN IMMEDIATE');
    try{
      for(const row of rows){
        if(stopRequested) break;
        const started=performance.now();
        let inspected;
        try{
          inspected=inspectEspeakQueryPronunciation(row.surface,row.language,{command});
          if(inspected.status==='unavailable'){
            throw new Error('espeak_process_unavailable');
          }
          const elapsed=performance.now()-started;
          if(inspected.status==='accepted'){
            const quality=classifyEspeakResolution(inspected);
            const a=rowAnalysisFields(inspected.analysis);
            updateEspeakAccepted.run(
              quality.qualityTier,quality.qualityReason,quality.method,
              inspected.ipa,inspected.rawIpa||null,a.syllableCount,a.primaryStress,a.stressPattern,
              a.exactTailKey,a.vowelKey,a.codaKey,inspected.engine||'espeak-ng',
              inspected.engineVersion||null,now(),Number(row.item_id),
            );
            insertAttempt.run(
              Number(row.item_id),'espeak','accepted',quality.qualityReason,elapsed,
              safeJson({normalization_changed:String(inspected.rawIpa||'')!==String(inspected.ipa||'')}),
              now(),
            );
            accepted+=1;
          }else{
            const reason=inspected.analyzerError||'analyzer_rejected_espeak_ipa';
            updateEspeakRejected.run(
              inspected.rawIpa||null,inspected.engine||'espeak-ng',inspected.engineVersion||null,
              reason,now(),Number(row.item_id),
            );
            insertAttempt.run(
              Number(row.item_id),'espeak','rejected',reason,elapsed,
              safeJson({normalized_ipa:inspected.ipa||null,attempts:inspected.attempts||[]}),
              now(),
            );
            rejected+=1;
          }
        }catch(error){
          const elapsed=performance.now()-started;
          const message=String(error?.message||error);
          if(message==='espeak_process_unavailable') throw error;
          updateEspeakError.run(message,now(),Number(row.item_id));
          insertAttempt.run(Number(row.item_id),'espeak','error',message,elapsed,'{}',now());
          errors+=1;
        }
        done+=1;
        if(done%progressEvery===0){
          console.log(progressLine({phase:'espeak',done,total,startedAt,accepted,rejected,errors}));
        }
      }
      workDb.exec('COMMIT');
    }catch(error){
      workDb.exec('ROLLBACK');
      throw error;
    }
  }
  upsertMeta.run('espeak_last_run_at',now());
  upsertMeta.run('updated_at',now());
  console.log(progressLine({phase:'espeak',done,total,startedAt,accepted,rejected,errors,extra:stopRequested?'checkpointed':'complete'}));
}

const updateClientAccepted=workDb.prepare([
  "UPDATE work_item SET client_status='accepted',final_status='resolved',quality_tier=?,quality_reason=?,",
  'final_method=?,ipa=?,raw_ipa=NULL,syllable_count=?,primary_stress=?,stress_pattern=?,exact_tail_key=?,',
  'vowel_key=?,coda_key=?,source_backed=?,engine=NULL,engine_version=NULL,last_error=NULL,updated_at=?',
  'WHERE item_id=?',
].join(' '));
const updateClientRejected=workDb.prepare([
  "UPDATE work_item SET client_status='rejected',final_status='unresolved',quality_tier='U',quality_reason=?,",
  "final_method='client_unresolved',last_error=?,updated_at=? WHERE item_id=?",
].join(' '));
const updateClientError=workDb.prepare([
  "UPDATE work_item SET client_status='error',last_error=?,updated_at=? WHERE item_id=?",
].join(' '));

function openClientReferenceLookup(){
  const deDb=existsSync(deDbPath)?openReadOnly(deDbPath):null;
  const enDb=existsSync(enDbPath)?openReadOnly(enDbPath):null;
  const deStatement=deDb?.prepare([
    'SELECT surface,normalized,ipa AS preferredIpa',
    'FROM hot',
    'WHERE normalized=? AND pronunciation_preferred=1 AND pronunciation_eligible=1 AND historical=0',
    'ORDER BY usage_rank IS NULL,usage_rank,pronunciation_rank,id',
    'LIMIT 1',
  ].join(' '))||null;
  const enStatement=enDb?.prepare([
    'SELECT f.surface,f.normalized,p.phonemes AS preferredIpa',
    'FROM en_form f JOIN en_pronunciation p ON p.form_id=f.id',
    'WHERE f.normalized=? AND f.default_eligible=1 AND p.default_profile_eligible=1',
    'ORDER BY p.id',
    'LIMIT 1',
  ].join(' '))||null;
  return {
    lookup(surface,language){
      const normalized=normalizedSurface(surface,language);
      if(language==='de') return deStatement?.get(normalized)||null;
      return enStatement?.get(normalized)||null;
    },
    close(){
      deDb?.close();
      enDb?.close();
    },
  };
}

async function runClientResolver(){
  console.log('\n=== PRONUNCIATION BACKFILL · CLIENT RESOLVER FALLBACK ===');
  const condition=retryErrors
    ?"espeak_status='rejected' AND client_status IN ('pending','error')"
    :"espeak_status='rejected' AND client_status='pending'";
  const total=scalar(workDb,'SELECT COUNT(*) AS c FROM work_item WHERE '+condition);
  if(!total){
    console.log('[client] nothing pending after eSpeak-NG.');
    return;
  }
  console.log('[client] pending='+total.toLocaleString('en-US')+' · policy=client-total-query-pronunciation-v2');

  const referenceLookup=openClientReferenceLookup();
  const batchQuery=workDb.prepare(
    'SELECT item_id,language,surface,normalized FROM work_item WHERE '+condition+' ORDER BY item_id LIMIT ?'
  );
  let done=0,accepted=0,rejected=0,errors=0;
  const startedAt=Date.now();

  try{
    while(!stopRequested){
    const rows=batchQuery.all(commitEvery);
    if(!rows.length) break;
    workDb.exec('BEGIN IMMEDIATE');
    try{
      for(const row of rows){
        if(stopRequested) break;
        const started=performance.now();
        try{
          const detail=await resolveUnknownClientPronunciation(row.surface,row.language,{
            lookupReference:(surface,language)=>referenceLookup.lookup(surface,language),
          });
          if(!detail?.ipa){
            const reason='client_resolver_empty';
            updateClientRejected.run(reason,reason,now(),Number(row.item_id));
            insertAttempt.run(Number(row.item_id),'client','rejected',reason,performance.now()-started,'{}',now());
            rejected+=1;
          }else{
            let analysis;
            try{
              analysis=getPhonologyProfile(row.language).analyzeIpa(detail.ipa);
            }catch(error){
              const reason='client_analyzer_rejected: '+String(error?.message||error);
              updateClientRejected.run('client_analyzer_rejected',reason,now(),Number(row.item_id));
              insertAttempt.run(
                Number(row.item_id),'client','rejected','client_analyzer_rejected',
                performance.now()-started,safeJson({ipa:detail.ipa,error:String(error?.message||error)}),now(),
              );
              rejected+=1;
              done+=1;
              if(done%progressEvery===0){
                console.log(progressLine({phase:'client',done,total,startedAt,accepted,rejected,errors}));
              }
              continue;
            }
            const quality=classifyClientResolution(detail);
            const a=rowAnalysisFields(analysis);
            updateClientAccepted.run(
              quality.qualityTier,quality.qualityReason,quality.method,detail.ipa,
              a.syllableCount,a.primaryStress,a.stressPattern,a.exactTailKey,a.vowelKey,a.codaKey,
              detail.sourceBacked?1:0,now(),Number(row.item_id),
            );
            insertAttempt.run(
              Number(row.item_id),'client','accepted',quality.qualityReason,performance.now()-started,
              safeJson({
                method:detail.method,
                source_backed:Boolean(detail.sourceBacked),
                token_count:Number(detail.tokenCount||detail.tokens?.length||1),
                generated_tokens:detail.generatedTokens||[],
                source_backed_tokens:detail.sourceBackedTokens||[],
              }),
              now(),
            );
            accepted+=1;
          }
        }catch(error){
          const message=String(error?.message||error);
          if(error instanceof RangeError){
            updateClientRejected.run('client_input_out_of_policy',message,now(),Number(row.item_id));
            insertAttempt.run(Number(row.item_id),'client','rejected','client_input_out_of_policy',performance.now()-started,safeJson({error:message}),now());
            rejected+=1;
          }else{
            updateClientError.run(message,now(),Number(row.item_id));
            insertAttempt.run(Number(row.item_id),'client','error',message,performance.now()-started,'{}',now());
            errors+=1;
          }
        }
        done+=1;
        if(done%progressEvery===0){
          console.log(progressLine({phase:'client',done,total,startedAt,accepted,rejected,errors}));
        }
      }
      workDb.exec('COMMIT');
    }catch(error){
      workDb.exec('ROLLBACK');
      throw error;
    }
    }
  }finally{
    referenceLookup.close();
  }
  upsertMeta.run('client_last_run_at',now());
  upsertMeta.run('updated_at',now());
  console.log(progressLine({phase:'client',done,total,startedAt,accepted,rejected,errors,extra:stopRequested?'checkpointed':'complete'}));
}

function tsvCell(value){
  return String(value??'').replace(/[\t\r\n]/gu,' ');
}
async function writeTsv(path,whereClause){
  const header=[
    'item_id','language','surface','normalized','source_ref_count','espeak_status','client_status',
    'final_status','quality_tier','quality_reason','final_method','ipa','syllable_count','primary_stress',
    'stress_pattern','last_error',
  ];
  const stream=createWriteStream(path,{encoding:'utf8'});
  const write=async(line)=>{
    if(!stream.write(line+'\n')) await once(stream,'drain');
  };
  try{
    await write(header.join('\t'));
    const rows=workDb.prepare([
      'SELECT item_id,language,surface,normalized,source_ref_count,espeak_status,client_status,final_status,',
      'quality_tier,quality_reason,final_method,ipa,syllable_count,primary_stress,stress_pattern,last_error',
      'FROM work_item',
      whereClause?'WHERE '+whereClause:'',
      'ORDER BY language,normalized,item_id',
    ].join(' ')).iterate();
    for(const row of rows){
      await write(header.map((key)=>tsvCell(row[key])).join('\t'));
    }
  }finally{
    stream.end();
    await once(stream,'finish');
  }
}

async function report(){
  console.log('\n=== PRONUNCIATION BACKFILL · REPORT ===');
  const summary=backfillSummary(workDb);
  const scanStates=workDb.prepare(
    'SELECT scope,status,last_key,scanned,source_refs,unique_items_added,updated_at FROM scan_state ORDER BY scope'
  ).all();
  const attempts=Object.fromEntries(
    workDb.prepare([
      'SELECT stage||\':\'||status AS key,COUNT(*) AS c',
      'FROM attempt GROUP BY stage,status ORDER BY stage,status',
    ].join(' ')).all().map((row)=>[row.key,Number(row.c)]),
  );
  const report={
    schema:'rhymelab-pronunciation-backfill-report-v1',
    status:summary.pending===0?'resolved_or_review_ready':'in_progress',
    policy:PRONUNCIATION_BACKFILL_POLICY,
    work_database:workPath,
    source_fingerprint:sourceFingerprint,
    source_snapshot:sourceSnapshot,
    summary,
    scan_states:scanStates,
    attempt_counts:attempts,
    quality_contract:{
      A:'eSpeak-NG output accepted directly by the accepted language analyzer without IPA normalization change.',
      B:'Analyzer-compatible generated output requiring eSpeak normalization, or fully source-backed client composition.',
      C:'Accepted deterministic client rule output / token-chain output.',
      D:'Accepted client grapheme fallback, alone or mixed with rule output.',
      U:'Still unresolved after the requested generator chain.',
    },
    promotion_boundary:{
      staging_only:true,
      canonical_databases_mutated:false,
      automatic_runtime_promotion:false,
      review_required_for_generated_rows:true,
    },
  };
  report.semantic_fingerprint=hashJson(report);
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
  await writeTsv(reviewPath,"quality_tier IN ('C','D','U') OR final_status='unresolved'");
  if(exportAll) await writeTsv(allPath,'');
  console.log(JSON.stringify({
    status:report.status,
    ...summary,
    report:reportPath,
    review_tsv:reviewPath,
    all_tsv:exportAll?allPath:null,
    semantic_fingerprint:report.semantic_fingerprint,
  },null,2));
}

try{
  if(phase==='all'||phase==='collect') await collect();
  if(!stopRequested&&(phase==='all'||phase==='espeak')) await runEspeak();
  if(!stopRequested&&(phase==='all'||phase==='client')) await runClientResolver();
  if(phase==='all'||phase==='collect'||phase==='espeak'||phase==='client'||phase==='report') await report();
}finally{
  workDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  workDb.close();
}
