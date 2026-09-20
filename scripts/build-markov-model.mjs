#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import readline from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import {
  END_TOKEN,
  MARKOV_MODEL_ORDER,
  MARKOV_MODEL_POLICY,
  MARKOV_MODEL_SCHEMA,
  START_TOKEN,
  createMarkovStorage,
  modelStats,
  preferredSurfaceFor,
  readMeta,
  semanticFingerprint,
  sequenceFromSentence,
  stateKey,
  tokenShape,
  writeMeta,
} from '../src/markov-model-core.mjs';

const root=process.cwd();
const args=process.argv.slice(2);
let manifestPath='sources/leipzig/de10k-v1-frozen.json';
let phraseWork='data/work/de-phrase-catalog-v1/extracted';
let workPath='data/work/markov-v1/rhymelab-markov-v1.build.sqlite';
let outPath='data/local/rhymelab-markov-v1.sqlite';
let reportPath='data/local/markov-model-v1-report.json';
let maxStates=300_000;
let topK=24;
let minTokenCount=3;
let batchSentences=5_000;
let maxSentencesPerCorpus=0;
let plan=false;
let status=false;
let reset=false;
const sentenceArgs=[];

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--manifest')manifestPath=args[++i]||manifestPath;
  else if(arg==='--phrase-work')phraseWork=args[++i]||phraseWork;
  else if(arg==='--work')workPath=args[++i]||workPath;
  else if(arg==='--out')outPath=args[++i]||outPath;
  else if(arg==='--report')reportPath=args[++i]||reportPath;
  else if(arg==='--max-states')maxStates=Math.max(1_000,Number(args[++i])||maxStates);
  else if(arg==='--top-k')topK=Math.max(4,Math.min(96,Number(args[++i])||topK));
  else if(arg==='--min-token-count')minTokenCount=Math.max(1,Number(args[++i])||minTokenCount);
  else if(arg==='--batch-sentences')batchSentences=Math.max(100,Number(args[++i])||batchSentences);
  else if(arg==='--max-sentences-per-corpus')maxSentencesPerCorpus=Math.max(0,Number(args[++i])||0);
  else if(arg==='--sentences')sentenceArgs.push(args[++i]||'');
  else if(arg==='--plan')plan=true;
  else if(arg==='--status')status=true;
  else if(arg==='--reset')reset=true;
  else throw new Error(`Unknown argument: ${arg}`);
}

manifestPath=resolve(root,manifestPath);
phraseWork=resolve(root,phraseWork);
workPath=resolve(root,workPath);
outPath=resolve(root,outPath);
reportPath=resolve(root,reportPath);

async function exists(path){try{await access(path);return true;}catch{return false;}}
function sha(value){return createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');}
function human(bytes){
  const units=['B','KiB','MiB','GiB'];let n=Number(bytes)||0;let i=0;
  while(n>=1024&&i<units.length-1){n/=1024;i+=1;}
  return `${n.toFixed(i?1:0)} ${units[i]}`;
}
function parseSentenceArg(value){
  const at=value.indexOf('=');
  if(at<=0||at===value.length-1)throw new Error(`Invalid --sentences ${value}; expected code=/path/file`);
  return {code:value.slice(0,at),path:resolve(root,value.slice(at+1)),manifest:null};
}
function lineReader(path){return readline.createInterface({input:createReadStream(path),crlfDelay:Infinity});}
function sentenceFromLine(line){const tab=line.indexOf('\t');return tab>=0?line.slice(tab+1):line;}

async function resolveSources(){
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(sentenceArgs.filter(Boolean).length){
    return {manifest,sources:sentenceArgs.filter(Boolean).map(parseSentenceArg)};
  }
  const sources=(manifest.corpora||[]).map((corpus)=>({
    code:corpus.code,
    path:join(phraseWork,`${corpus.code}_sentences.txt`),
    manifest:corpus,
  }));
  return {manifest,sources};
}

async function sourceStatus(sources){
  const rows=[];
  for(const source of sources){
    try{
      const info=await stat(source.path);
      rows.push({...source,available:true,bytes:info.size,mtimeMs:Math.trunc(info.mtimeMs)});
    }catch{
      rows.push({...source,available:false,bytes:0,mtimeMs:0});
    }
  }
  return rows;
}

function openStatus(path){
  try{
    const db=new DatabaseSync(path,{readOnly:true});
    try{return {path,meta:readMeta(db),stats:modelStats(db),checkpoints:db.prepare('SELECT * FROM build_checkpoint ORDER BY phase,source_index').all()};}
    finally{db.close();}
  }catch(error){return {path,error:error instanceof Error?error.message:String(error)};}
}

const {manifest,sources}=await resolveSources();
const sourceRows=await sourceStatus(sources);
if(plan){
  console.log(JSON.stringify({
    schema:'rhymelab-markov-build-plan-v1',
    policy:MARKOV_MODEL_POLICY,
    order:MARKOV_MODEL_ORDER,
    manifest:manifest.id,
    sources:sourceRows.map(({code,path,available,bytes,manifest})=>({code,path,available,bytes,human_bytes:human(bytes),expected_sentences:manifest?.sentences??null,genre:manifest?.genre??null,year:manifest?.year??null})),
    config:{maxStates,topK,minTokenCount,batchSentences,maxSentencesPerCorpus},
    work:workPath,out:outPath,report:reportPath,
    ready:sourceRows.every((row)=>row.available),
    missing_hint:'Run npm run phrase:catalog:bootstrap first if the Leipzig extracted sentence files are missing.',
  },null,2));
  process.exit(sourceRows.every((row)=>row.available)?0:2);
}
if(status){
  console.log(JSON.stringify({
    schema:'rhymelab-markov-build-status-v1',
    work:await exists(workPath)?openStatus(workPath):{path:workPath,missing:true},
    output:await exists(outPath)?openStatus(outPath):{path:outPath,missing:true},
    sources:sourceRows.map(({code,path,available,bytes})=>({code,path,available,bytes})),
  },null,2));
  process.exit(0);
}
if(!sourceRows.every((row)=>row.available)){
  const missing=sourceRows.filter((row)=>!row.available).map((row)=>row.path);
  throw new Error(`Missing Leipzig sentence files:\n${missing.join('\n')}\nRun: npm run phrase:catalog:bootstrap`);
}

await mkdir(dirname(workPath),{recursive:true});
await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(reportPath),{recursive:true});
if(reset)await rm(workPath,{force:true});

const config={
  schema:MARKOV_MODEL_SCHEMA,
  policy:MARKOV_MODEL_POLICY,
  order:MARKOV_MODEL_ORDER,
  language:'de',
  source_manifest:manifest.id,
  sources:sourceRows.map((row)=>({code:row.code,path:row.path,bytes:row.bytes,mtimeMs:row.mtimeMs,parent_sha256:row.manifest?.sha256??null})),
  max_states:maxStates,
  top_k:topK,
  min_token_count:minTokenCount,
  max_sentences_per_corpus:maxSentencesPerCorpus,
};
const configFingerprint=sha(config);
const existed=await exists(workPath);
const db=new DatabaseSync(workPath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-262144;');
createMarkovStorage(db);
const existingMeta=readMeta(db);
if(existed&&existingMeta.build_config_fingerprint&&existingMeta.build_config_fingerprint!==configFingerprint){
  db.close();
  throw new Error('Existing Markov work DB was built with different inputs/options. Re-run with --reset.');
}
writeMeta(db,{
  schema:MARKOV_MODEL_SCHEMA,
  policy:MARKOV_MODEL_POLICY,
  language:'de',
  order:MARKOV_MODEL_ORDER,
  source_manifest:manifest.id,
  max_states:maxStates,
  top_k:topK,
  min_token_count:minTokenCount,
  build_config_fingerprint:configFingerprint,
  build_started_at:existingMeta.build_started_at||new Date().toISOString(),
});

const tokenUpsert=db.prepare(`
  INSERT INTO token(norm,count,title_count,upper_count,preferred_surface)
  VALUES(?,?,?,?,?)
  ON CONFLICT(norm) DO UPDATE SET
    count=count+excluded.count,
    title_count=title_count+excluded.title_count,
    upper_count=upper_count+excluded.upper_count
`);
const stateUpsert=db.prepare(`
  INSERT INTO state_count(state_key,count,retained) VALUES(?,?,0)
  ON CONFLICT(state_key) DO UPDATE SET count=count+excluded.count
`);
const transitionUpsert=db.prepare(`
  INSERT INTO transition(direction,context_len,state_key,next_token,count)
  VALUES(?,?,?,?,?)
  ON CONFLICT(direction,context_len,state_key,next_token) DO UPDATE SET count=count+excluded.count
`);
const checkpointUpsert=db.prepare(`
  INSERT INTO build_checkpoint(phase,source_index,source_code,line_number,accepted_sentences,updated_at)
  VALUES(?,?,?,?,?,?)
  ON CONFLICT(phase,source_index) DO UPDATE SET
    source_code=excluded.source_code,
    line_number=excluded.line_number,
    accepted_sentences=excluded.accepted_sentences,
    updated_at=excluded.updated_at
`);
const checkpointGet=db.prepare('SELECT * FROM build_checkpoint WHERE phase=? AND source_index=?');

function flushPass1(tokenCounts,stateCounts,sourceIndex,sourceCode,lineNumber,accepted){
  db.exec('BEGIN');
  try{
    for(const [norm,row] of tokenCounts)tokenUpsert.run(norm,row.count,row.title,row.upper,norm);
    for(const [key,count] of stateCounts)stateUpsert.run(key,count);
    checkpointUpsert.run('scan',sourceIndex,sourceCode,lineNumber,accepted,new Date().toISOString());
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  tokenCounts.clear();stateCounts.clear();
}

async function runPass1(){
  console.log('Markov build phase 1/3: vocabulary + state census');
  for(let sourceIndex=0;sourceIndex<sourceRows.length;sourceIndex+=1){
    const source=sourceRows[sourceIndex];
    const checkpoint=checkpointGet.get('scan',sourceIndex);
    let resumeLine=Number(checkpoint?.line_number||0);
    let accepted=Number(checkpoint?.accepted_sentences||0);
    let lineNumber=0;
    let batchAccepted=0;
    const tokenCounts=new Map();
    const stateCounts=new Map();
    console.log(`  ${source.code}: resume line ${resumeLine.toLocaleString('en-US')}`);
    for await(const line of lineReader(source.path)){
      lineNumber+=1;
      if(lineNumber<=resumeLine)continue;
      if(maxSentencesPerCorpus&&accepted>=maxSentencesPerCorpus)break;
      const sequence=sequenceFromSentence(sentenceFromLine(line),{language:'de'});
      if(!sequence.length)continue;
      accepted+=1;batchAccepted+=1;
      for(const row of sequence.slice(2,-1)){
        const current=tokenCounts.get(row.norm)||{count:0,title:0,upper:0};
        current.count+=1;
        const shape=tokenShape(row.surface);
        if(shape==='title')current.title+=1;
        else if(shape==='upper')current.upper+=1;
        tokenCounts.set(row.norm,current);
      }
      const norms=sequence.map((row)=>row.norm);
      for(let i=0;i<norms.length-1;i+=1){
        const key=stateKey([norms[i],norms[i+1]]);
        stateCounts.set(key,(stateCounts.get(key)||0)+1);
      }
      if(batchAccepted>=batchSentences){
        flushPass1(tokenCounts,stateCounts,sourceIndex,source.code,lineNumber,accepted);
        batchAccepted=0;
        console.log(`    ${accepted.toLocaleString('en-US')} accepted · line ${lineNumber.toLocaleString('en-US')}`);
      }
    }
    if(tokenCounts.size||stateCounts.size||lineNumber>resumeLine)flushPass1(tokenCounts,stateCounts,sourceIndex,source.code,lineNumber,accepted);
  }
}

function finalizeCensus(){
  const already=readMeta(db).census_finalized==='1';
  if(already)return;
  console.log('Markov build phase 2/3: prune vocabulary + retain frequent order-2 states');
  db.exec('BEGIN');
  try{
    db.prepare('DELETE FROM token WHERE count < ?').run(minTokenCount);
    tokenUpsert.run(START_TOKEN,1,0,0,START_TOKEN);
    tokenUpsert.run(END_TOKEN,1,0,0,END_TOKEN);
    db.prepare('UPDATE state_count SET retained=0').run();
    db.prepare(`
      UPDATE state_count SET retained=1
      WHERE state_key IN (
        SELECT state_key FROM state_count ORDER BY count DESC,state_key LIMIT ?
      )
    `).run(maxStates);
    db.prepare("UPDATE state_count SET retained=1 WHERE state_key LIKE ? OR state_key LIKE ?")
      .run(`${START_TOKEN}%`,`%${END_TOKEN}`);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  const updateSurface=db.prepare('UPDATE token SET preferred_surface=? WHERE norm=?');
  db.exec('BEGIN');
  try{
    for(const row of db.prepare('SELECT norm,count,title_count,upper_count FROM token').iterate()){
      updateSurface.run(preferredSurfaceFor(row),row.norm);
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  writeMeta(db,{census_finalized:'1'});
}

function flushTransitions(counts,sourceIndex,sourceCode,lineNumber,accepted){
  db.exec('BEGIN');
  try{
    for(const [key,count] of counts){
      const [direction,len,state,next]=key.split('\u0002');
      transitionUpsert.run(direction,Number(len),state,next,count);
    }
    checkpointUpsert.run('transitions',sourceIndex,sourceCode,lineNumber,accepted,new Date().toISOString());
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  counts.clear();
}

async function runPass2(){
  if(readMeta(db).transitions_complete==='1')return;
  console.log('Markov build phase 3/3: forward + reverse transitions');
  const vocab=new Set(db.prepare('SELECT norm FROM token').all().map((row)=>String(row.norm)));
  const retained=new Set(db.prepare('SELECT state_key FROM state_count WHERE retained=1').all().map((row)=>String(row.state_key)));
  const valid=(token)=>token===START_TOKEN||token===END_TOKEN||vocab.has(token);
  for(let sourceIndex=0;sourceIndex<sourceRows.length;sourceIndex+=1){
    const source=sourceRows[sourceIndex];
    const checkpoint=checkpointGet.get('transitions',sourceIndex);
    const resumeLine=Number(checkpoint?.line_number||0);
    let accepted=Number(checkpoint?.accepted_sentences||0);
    let lineNumber=0;
    let batchAccepted=0;
    const counts=new Map();
    console.log(`  ${source.code}: resume line ${resumeLine.toLocaleString('en-US')}`);
    for await(const line of lineReader(source.path)){
      lineNumber+=1;
      if(lineNumber<=resumeLine)continue;
      if(maxSentencesPerCorpus&&accepted>=maxSentencesPerCorpus)break;
      const sequence=sequenceFromSentence(sentenceFromLine(line),{language:'de'});
      if(!sequence.length)continue;
      accepted+=1;batchAccepted+=1;
      const norms=sequence.map((row)=>vocab.has(row.norm)||row.norm===START_TOKEN||row.norm===END_TOKEN?row.norm:null);
      for(let i=2;i<norms.length;i+=1){
        const next=norms[i],prev=norms[i-1],prev2=norms[i-2];
        if(valid(prev)&&valid(next)){
          const s1=prev;
          const k1=`forward\u00021\u0002${s1}\u0002${next}`;
          counts.set(k1,(counts.get(k1)||0)+1);
        }
        if(valid(prev2)&&valid(prev)&&valid(next)){
          const s2=stateKey([prev2,prev]);
          if(retained.has(s2)){
            const k2=`forward\u00022\u0002${s2}\u0002${next}`;
            counts.set(k2,(counts.get(k2)||0)+1);
          }
        }
      }
      for(let i=norms.length-3;i>=1;i-=1){
        const previous=norms[i],next1=norms[i+1],next2=norms[i+2];
        if(valid(previous)&&valid(next1)){
          const k1=`reverse\u00021\u0002${next1}\u0002${previous}`;
          counts.set(k1,(counts.get(k1)||0)+1);
        }
        if(valid(previous)&&valid(next1)&&valid(next2)){
          const s2=stateKey([next1,next2]);
          if(retained.has(s2)){
            const k2=`reverse\u00022\u0002${s2}\u0002${previous}`;
            counts.set(k2,(counts.get(k2)||0)+1);
          }
