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
  MARKOV_SOURCE_WINDOW_MAX,
  MARKOV_SOURCE_WINDOW_MIN,
  START_TOKEN,
  createMarkovStorage,
  lexicalNorms,
  modelStats,
  preferredSurfaceFor,
  readMeta,
  semanticFingerprint,
  sequenceFromSentence,
  sequenceHash,
  shapeKeyForTokens,
  stateKey,
  tokenShape,
  writeMeta,
} from '../src/markov-model-core.mjs';

const root=process.cwd();
const args=process.argv.slice(2);
let manifestPath='';
let phraseWork='';
let workPath='data/work/markov-v2/rhymelab-markov-v2.build.sqlite';
let outPath='data/local/rhymelab-markov-v2.sqlite';
let reportPath='data/local/markov-model-v2-report.json';
let language='de';
let maxStates=600_000;
let topK=24;
let minTokenCount=3;
let minimumSequenceTokens=3;
let batchSentences=5_000;
let maxSentencesPerCorpus=0;
let plan=false;
let status=false;
let reset=false;
const sentenceArgs=[];
const sourceArgs=[];
const sourceTotalArgs=[];

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--manifest')manifestPath=args[++i]||manifestPath;
  else if(arg==='--phrase-work')phraseWork=args[++i]||phraseWork;
  else if(arg==='--work')workPath=args[++i]||workPath;
  else if(arg==='--out')outPath=args[++i]||outPath;
  else if(arg==='--report')reportPath=args[++i]||reportPath;
  else if(arg==='--language'){
    const value=String(args[++i]||'de').toLocaleLowerCase('en-US');
    if(!['de','en'].includes(value))throw new Error('Unsupported --language '+value+'; expected de or en.');
    language=value;
  }
  else if(arg==='--max-states')maxStates=Math.max(1_000,Number(args[++i])||maxStates);
  else if(arg==='--top-k')topK=Math.max(4,Math.min(96,Number(args[++i])||topK));
  else if(arg==='--min-token-count')minTokenCount=Math.max(1,Number(args[++i])||minTokenCount);
  else if(arg==='--min-sequence-tokens')minimumSequenceTokens=Math.max(2,Math.min(12,Number(args[++i])||minimumSequenceTokens));
  else if(arg==='--batch-sentences')batchSentences=Math.max(100,Number(args[++i])||batchSentences);
  else if(arg==='--max-sentences-per-corpus')maxSentencesPerCorpus=Math.max(0,Number(args[++i])||0);
  else if(arg==='--sentences')sentenceArgs.push(args[++i]||'');
  else if(arg==='--source')sourceArgs.push(args[++i]||'');
  else if(arg==='--source-total')sourceTotalArgs.push(args[++i]||'');
  else if(arg==='--plan')plan=true;
  else if(arg==='--status')status=true;
  else if(arg==='--reset')reset=true;
  else throw new Error(`Unknown argument: ${arg}`);
}

manifestPath=manifestPath?resolve(root,manifestPath):'';
phraseWork=phraseWork?resolve(root,phraseWork):'';
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
const SOURCE_KINDS=new Set(['phrase','sentence','lyric']);

function normalizeSourceKind(value,fallback='sentence'){
  const kind=String(value||fallback).trim().toLocaleLowerCase('en-US');
  if(!SOURCE_KINDS.has(kind)){
    throw new Error(`Unsupported Markov source kind: ${kind}. Expected phrase, sentence, or lyric.`);
  }
  return kind;
}

function normalizeSourceWeight(value,fallback=1){
  const parsed=Number.parseInt(String(value??fallback),10);
  if(!Number.isFinite(parsed)||parsed<1||parsed>16){
    throw new Error(`Invalid Markov source weight: ${value}. Expected integer 1..16.`);
  }
  return parsed;
}

function parseSentenceArg(value){
  const at=value.indexOf('=');
  if(at<=0||at===value.length-1)throw new Error(`Invalid --sentences ${value}; expected code=/path/file`);
  return {
    code:value.slice(0,at),
    path:resolve(root,value.slice(at+1)),
    manifest:null,
    kind:'sentence',
    weight:1,
  };
}

function parseSourceArg(value){
  const at=value.indexOf('=');
  if(at<=0||at===value.length-1){
    throw new Error(`Invalid --source ${value}; expected kind:code[:weight]=/path/file`);
  }
  const descriptor=value.slice(0,at);
  const path=value.slice(at+1);
  const parts=descriptor.split(':');
  if(parts.length<2||parts.length>3||!parts[1]){
    throw new Error(`Invalid --source descriptor: ${descriptor}; expected kind:code[:weight]`);
  }
  return {
    kind:normalizeSourceKind(parts[0]),
    code:parts[1],
    weight:normalizeSourceWeight(parts[2]||1),
    path:resolve(root,path),
    manifest:null,
  };
}
function parseSourceTotalArg(value){
  const at=String(value).lastIndexOf('=');
  if(at<=0||at===String(value).length-1)throw new Error(`Invalid --source-total ${value}; expected code=count`);
  const code=String(value).slice(0,at);
  const count=Number(String(value).slice(at+1));
  if(!Number.isFinite(count)||count<0)throw new Error(`Invalid source total for ${code}: ${value}`);
  return [code,Math.trunc(count)];
}
const sourceTotals=new Map(sourceTotalArgs.filter(Boolean).map(parseSourceTotalArg));

function lineReader(path){return readline.createInterface({input:createReadStream(path),crlfDelay:Infinity});}
function sentenceFromLine(line){const tab=line.indexOf('\t');return tab>=0?line.slice(tab+1):line;}

async function resolveSources(){
  let manifest={id:'explicit-local-v2',corpora:[]};
  if(manifestPath)manifest=JSON.parse(await readFile(manifestPath,'utf8'));

  const explicit=[
    ...sourceArgs.filter(Boolean).map(parseSourceArg),
    ...sentenceArgs.filter(Boolean).map(parseSentenceArg),
  ];
  if(explicit.length)return {manifest,sources:explicit};

  if(!manifestPath)return {manifest,sources:[]};
  if(!phraseWork)throw new Error('--phrase-work is required when --manifest is used without explicit --source/--sentences.');
  const sources=(manifest.corpora||[]).map((corpus)=>({
    code:corpus.code,
    path:join(phraseWork,String(corpus.file||`${corpus.code}_sentences.txt`)),
    manifest:corpus,
    kind:normalizeSourceKind(corpus.kind||'sentence'),
    weight:normalizeSourceWeight(corpus.weight||1),
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
    try{
      let checkpoints=[];
      try{
        checkpoints=db.prepare(
          'SELECT * FROM build_checkpoint ORDER BY phase,source_index',
        ).all();
      }catch{}
      return {
        path,
        meta:readMeta(db),
        stats:modelStats(db),
        checkpoints,
      };
    }finally{
      db.close();
    }
  }catch(error){
    return {path,error:error instanceof Error?error.message:String(error)};
  }
}

const {manifest,sources}=await resolveSources();
const sourceRows=(await sourceStatus(sources)).map((row)=>({
  ...row,
  expectedSentences:sourceTotals.get(row.code)??Number(row.manifest?.sentences||0)||null,
}));
if(plan){
  console.log(JSON.stringify({
    schema:'rhymelab-markov-build-plan-v1',
    policy:MARKOV_MODEL_POLICY,
    order:MARKOV_MODEL_ORDER,
    manifest:manifest.id,
    sources:sourceRows.map(({code,path,available,bytes,manifest,kind,weight,expectedSentences})=>({
      code,path,kind,weight,available,bytes,human_bytes:human(bytes),
      expected_sentences:expectedSentences,
      genre:manifest?.genre??null,
      year:manifest?.year??null,
    })),
    config:{maxStates,topK,minTokenCount,minimumSequenceTokens,batchSentences,maxSentencesPerCorpus},
    work:workPath,out:outPath,report:reportPath,
    ready:sourceRows.length>0&&sourceRows.every((row)=>row.available),
    missing_hint:sourceRows.length
      ?'Fix missing explicit source paths before building.'
      :'No implicit corpus is selected. Pass --source kind:code[:weight]=/path/file, --sentences code=/path/file, or --manifest ... --phrase-work ... . Owner-private lyrics are calibration-only.',
  },null,2));
  process.exit(sourceRows.length>0&&sourceRows.every((row)=>row.available)?0:2);
}
if(status){
  console.log(JSON.stringify({
    schema:'rhymelab-markov-build-status-v1',
    work:await exists(workPath)?openStatus(workPath):{path:workPath,missing:true},
    output:await exists(outPath)?openStatus(outPath):{path:outPath,missing:true},
    sources:sourceRows.map(({code,path,kind,weight,available,bytes,expectedSentences})=>({
      code,path,kind,weight,available,bytes,expected_sentences:expectedSentences,
    })),
  },null,2));
  process.exit(0);
}
if(!sourceRows.length){
  throw new Error('No Markov training source configured. Pass --source kind:code[:weight]=/path/file, --sentences code=/path/file, or --manifest ... --phrase-work ... . Owner-private lyrics are calibration-only.');
}
if(!sourceRows.every((row)=>row.available)){
  const missing=sourceRows.filter((row)=>!row.available).map((row)=>row.path);
  throw new Error(`Missing explicit Markov source files:\n${missing.join('\n')}`);
}

await mkdir(dirname(workPath),{recursive:true});
await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(reportPath),{recursive:true});
if(reset)await rm(workPath,{force:true});

const config={
  schema:MARKOV_MODEL_SCHEMA,
  policy:MARKOV_MODEL_POLICY,
  order:MARKOV_MODEL_ORDER,
  language,
  source_manifest:manifest.id,
  sources:sourceRows.map((row)=>({
    code:row.code,
    kind:row.kind,
    weight:row.weight,
    path:row.path,
    bytes:row.bytes,
    mtimeMs:row.mtimeMs,
    parent_sha256:row.manifest?.sha256??null,
  })),
  max_states:maxStates,
  top_k:topK,
  min_token_count:minTokenCount,
  minimum_sequence_tokens:minimumSequenceTokens,
  source_window_min:MARKOV_SOURCE_WINDOW_MIN,
  source_window_max:MARKOV_SOURCE_WINDOW_MAX,
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
  language,
  order:MARKOV_MODEL_ORDER,
  source_manifest:manifest.id,
  max_states:maxStates,
  top_k:topK,
  min_token_count:minTokenCount,
  minimum_sequence_tokens:minimumSequenceTokens,
  source_window_min:MARKOV_SOURCE_WINDOW_MIN,
  source_window_max:MARKOV_SOURCE_WINDOW_MAX,
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
  INSERT INTO state_count(context_len,state_key,count,retained) VALUES(?,?,?,0)
  ON CONFLICT(context_len,state_key) DO UPDATE SET count=count+excluded.count
`);
const sourceSequenceUpsert=db.prepare(`
  INSERT INTO source_sequence_hash(source_kind,hash,token_count,count) VALUES(?,?,?,?)
  ON CONFLICT(source_kind,hash) DO UPDATE SET count=count+excluded.count
`);
const sourceWindowUpsert=db.prepare(`
  INSERT INTO source_window_hash(source_kind,hash,window_size,count) VALUES(?,?,?,?)
  ON CONFLICT(source_kind,hash) DO UPDATE SET count=count+excluded.count
`);
const shapeUpsert=db.prepare(`
  INSERT INTO shape_pattern(token_count,shape_key,count) VALUES(?,?,?)
  ON CONFLICT(token_count,shape_key) DO UPDATE SET count=count+excluded.count
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

function flushPass1(
  tokenCounts,
  stateCounts,
  sourceSequences,
  sourceWindows,
  shapeCounts,
  sourceIndex,
  sourceCode,
  lineNumber,
  accepted,
){
  db.exec('BEGIN');
  try{
    for(const [norm,row] of tokenCounts)tokenUpsert.run(norm,row.count,row.title,row.upper,norm);
    for(const [key,count] of stateCounts){
      const sep=key.indexOf('\u0002');
      stateUpsert.run(Number(key.slice(0,sep)),key.slice(sep+1),count);
    }
    for(const [key,row] of sourceSequences){
      const sep=key.indexOf('\u0002');
      sourceSequenceUpsert.run(key.slice(0,sep),key.slice(sep+1),row.tokenCount,row.count);
    }
    for(const [key,row] of sourceWindows){
      const sep=key.indexOf('\u0002');
      sourceWindowUpsert.run(key.slice(0,sep),key.slice(sep+1),row.windowSize,row.count);
    }
    for(const [key,count] of shapeCounts){
      const sep=key.indexOf('\u0002');
      shapeUpsert.run(Number(key.slice(0,sep)),key.slice(sep+1),count);
    }
    checkpointUpsert.run('scan',sourceIndex,sourceCode,lineNumber,accepted,new Date().toISOString());
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  tokenCounts.clear();
  stateCounts.clear();
  sourceSequences.clear();
  sourceWindows.clear();
  shapeCounts.clear();
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
    const sourceSequences=new Map();
    const sourceWindows=new Map();
    const shapeCounts=new Map();
    console.log(`  ${source.code}: resume line ${resumeLine.toLocaleString('en-US')}`);
    for await(const line of lineReader(source.path)){
      lineNumber+=1;
      if(lineNumber<=resumeLine)continue;
      if(maxSentencesPerCorpus&&accepted>=maxSentencesPerCorpus)break;
      const sequence=sequenceFromSentence(sentenceFromLine(line),{language,minimumTokens:minimumSequenceTokens});
      if(!sequence.length)continue;
      accepted+=1;batchAccepted+=1;
      const sourceWeight=normalizeSourceWeight(source.weight||1);
      for(const row of sequence.slice(MARKOV_MODEL_ORDER,-1)){
        const current=tokenCounts.get(row.norm)||{count:0,title:0,upper:0};
        current.count+=sourceWeight;
        const shape=tokenShape(row.surface);
        if(shape==='title')current.title+=sourceWeight;
        else if(shape==='upper')current.upper+=sourceWeight;
        tokenCounts.set(row.norm,current);
      }
      const norms=sequence.map((row)=>row.norm);
      for(let contextLen=2;contextLen<=MARKOV_MODEL_ORDER;contextLen+=1){
        for(let i=0;i+contextLen<=norms.length;i+=1){
          const state=stateKey(norms.slice(i,i+contextLen));
          const key=`${contextLen}\u0002${state}`;
          stateCounts.set(key,(stateCounts.get(key)||0)+sourceWeight);
        }
      }

      const lexical=lexicalNorms(sequence);
      if(lexical.length){
        const fullHash=sequenceHash(lexical);
        const sourceHashKey=`${source.kind}\u0002${fullHash}`;
        const sourceRow=sourceSequences.get(sourceHashKey)||{tokenCount:lexical.length,count:0};
        sourceRow.count+=1;
        sourceSequences.set(sourceHashKey,sourceRow);
        for(let size=MARKOV_SOURCE_WINDOW_MIN;size<=Math.min(MARKOV_SOURCE_WINDOW_MAX,lexical.length);size+=1){
          for(let start=0;start+size<=lexical.length;start+=1){
            const hash=sequenceHash(lexical.slice(start,start+size));
            const windowHashKey=`${source.kind}\u0002${hash}`;
            const windowRow=sourceWindows.get(windowHashKey)||{windowSize:size,count:0};
            windowRow.count+=1;
            sourceWindows.set(windowHashKey,windowRow);
          }
        }
        // Phrase/Mosaic rows are fragment evidence. They are useful for local
        // transitions and anti-copy checks, but must never be learned as if
        // they were complete grammatical lyric lines.
        if(source.kind!=='phrase'){
          const shape=shapeKeyForTokens(lexical,language);
          if(shape){
            const shapeId=`${lexical.length}\u0002${shape}`;
            shapeCounts.set(shapeId,(shapeCounts.get(shapeId)||0)+sourceWeight);
          }
        }
      }

      if(batchAccepted>=batchSentences){
        flushPass1(tokenCounts,stateCounts,sourceSequences,sourceWindows,shapeCounts,sourceIndex,source.code,lineNumber,accepted);
        batchAccepted=0;
        console.log(`    ${accepted.toLocaleString('en-US')} accepted · line ${lineNumber.toLocaleString('en-US')}`);
      }
    }
    if(tokenCounts.size||stateCounts.size||sourceSequences.size||sourceWindows.size||shapeCounts.size||lineNumber>resumeLine){
      flushPass1(tokenCounts,stateCounts,sourceSequences,sourceWindows,shapeCounts,sourceIndex,source.code,lineNumber,accepted);
    }
  }
}

function finalizeCensus(){
  const already=readMeta(db).census_finalized==='1';
  if(already)return;
  console.log(`Markov build phase 2/3: prune vocabulary + retain frequent order-2..${MARKOV_MODEL_ORDER} states`);
  db.exec('BEGIN');
  try{
    db.prepare('DELETE FROM token WHERE count < ?').run(minTokenCount);
    tokenUpsert.run(START_TOKEN,1,0,0,START_TOKEN);
    tokenUpsert.run(END_TOKEN,1,0,0,END_TOKEN);
    db.prepare('UPDATE state_count SET retained=0').run();
    const orders=Math.max(1,MARKOV_MODEL_ORDER-1);
    const quota=Math.max(1,Math.floor(maxStates/orders));
    const retainByOrder=db.prepare(`
      UPDATE state_count SET retained=1
      WHERE context_len=?
        AND state_key IN (
          SELECT state_key FROM state_count
          WHERE context_len=?
          ORDER BY count DESC,state_key
          LIMIT ?
        )
    `);
    for(let contextLen=2;contextLen<=MARKOV_MODEL_ORDER;contextLen+=1){
      retainByOrder.run(contextLen,contextLen,quota);
    }
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
  const retained=new Set(
    db.prepare('SELECT context_len,state_key FROM state_count WHERE retained=1').all()
      .map((row)=>`${Number(row.context_len)}\u0002${String(row.state_key)}`),
  );
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
      const sequence=sequenceFromSentence(sentenceFromLine(line),{language,minimumTokens:minimumSequenceTokens});
      if(!sequence.length)continue;
      accepted+=1;batchAccepted+=1;
      const sourceWeight=normalizeSourceWeight(source.weight||1);
      const norms=sequence.map((row)=>vocab.has(row.norm)||row.norm===START_TOKEN||row.norm===END_TOKEN?row.norm:null);
      for(let i=1;i<norms.length;i+=1){
        const next=norms[i];
        if(!valid(next))continue;
        for(let contextLen=1;contextLen<=Math.min(MARKOV_MODEL_ORDER,i);contextLen+=1){
          const context=norms.slice(i-contextLen,i);
          if(!context.every(valid))continue;
          const state=stateKey(context);
          if(contextLen>1&&!retained.has(`${contextLen}\u0002${state}`))continue;
          const key=`forward\u0002${contextLen}\u0002${state}\u0002${next}`;
          counts.set(key,(counts.get(key)||0)+sourceWeight);
        }
      }
      for(let i=norms.length-2;i>=0;i-=1){
        const previous=norms[i];
        if(!valid(previous))continue;
        const remaining=norms.length-i-1;
        for(let contextLen=1;contextLen<=Math.min(MARKOV_MODEL_ORDER,remaining);contextLen+=1){
          const context=norms.slice(i+1,i+1+contextLen);
          if(!context.every(valid))continue;
          const state=stateKey(context);
          if(contextLen>1&&!retained.has(`${contextLen}\u0002${state}`))continue;
          const key=`reverse\u0002${contextLen}\u0002${state}\u0002${previous}`;
          counts.set(key,(counts.get(key)||0)+sourceWeight);
        }
      }
      if(batchAccepted>=batchSentences){
        flushTransitions(counts,sourceIndex,source.code,lineNumber,accepted);
        batchAccepted=0;
        console.log(`    ${accepted.toLocaleString('en-US')} accepted · line ${lineNumber.toLocaleString('en-US')}`);
      }
    }
    if(counts.size||lineNumber>resumeLine)flushTransitions(counts,sourceIndex,source.code,lineNumber,accepted);
  }
  writeMeta(db,{transitions_complete:'1'});
}

function pruneTransitions(){
  if(readMeta(db).transitions_pruned==='1')return;
  console.log(`Prune transitions to top ${topK} per state/direction/order…`);
  db.exec('BEGIN');
  try{
    db.prepare(`
      DELETE FROM transition
      WHERE (direction,context_len,state_key,next_token) IN (
        SELECT direction,context_len,state_key,next_token
        FROM (
          SELECT direction,context_len,state_key,next_token,
            ROW_NUMBER() OVER (
              PARTITION BY direction,context_len,state_key
              ORDER BY count DESC,next_token
            ) AS rn
          FROM transition
        )
        WHERE rn>?
      )
    `).run(topK);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  writeMeta(db,{transitions_pruned:'1'});
}

async function promote(){
  const scanRows=db.prepare("SELECT accepted_sentences FROM build_checkpoint WHERE phase='scan'").all();
  const acceptedSentences=scanRows.reduce((sum,row)=>sum+Number(row.accepted_sentences||0),0);
  const declaredSourceSentences=sourceRows.reduce((sum,row)=>sum+Number(row.manifest?.sentences||0),0);
  const sourceSentences=declaredSourceSentences||acceptedSentences;
  const retainedStates=Number(db.prepare('SELECT COUNT(*) AS n FROM state_count WHERE retained=1').get()?.n||0);
  const sourceProfile=sourceRows.map((source,sourceIndex)=>{
    const scan=db.prepare(
      "SELECT accepted_sentences FROM build_checkpoint WHERE phase='scan' AND source_index=?"
    ).get(sourceIndex);
    return {
      code:source.code,
      kind:source.kind,
      weight:source.weight,
      accepted_sentences:Number(scan?.accepted_sentences||0),
    };
  });
  writeMeta(db,{
    source_sentences:sourceSentences,
    accepted_sentences:acceptedSentences,
    retained_states:retainedStates,
    source_profile_json:JSON.stringify(sourceProfile),
  });
  db.exec('ANALYZE; PRAGMA optimize;');
  const fingerprint=semanticFingerprint(db);
  const builtAt=new Date().toISOString();
  writeMeta(db,{semantic_fingerprint:fingerprint,built_at:builtAt,build_status:'complete'});
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const statsBefore=modelStats(db);
  db.close();

  const temp=`${outPath}.tmp`;
  const previous=`${outPath}.previous`;
  await rm(temp,{force:true});
  await copyFile(workPath,temp);
  const finalDb=new DatabaseSync(temp);
  try{
    finalDb.exec('PRAGMA journal_mode=DELETE; DROP TABLE IF EXISTS build_checkpoint; DROP TABLE IF EXISTS state_count; VACUUM; ANALYZE; PRAGMA optimize;');
    const meta=readMeta(finalDb);
    if(meta.schema!==MARKOV_MODEL_SCHEMA||meta.policy!==MARKOV_MODEL_POLICY)throw new Error('Promoted Markov model metadata mismatch');
    const stats=modelStats(finalDb);
    if(stats.transitions<1||stats.forwardTransitions<1||stats.reverseTransitions<1)throw new Error('Promoted Markov model has incomplete transition tables');
  }finally{finalDb.close();}
  await rm(previous,{force:true});
  if(await exists(outPath))await rename(outPath,previous);
  try{await rename(temp,outPath);}catch(error){if(await exists(previous))await rename(previous,outPath);throw error;}
  await rm(previous,{force:true});
  const outBytes=(await stat(outPath)).size;
  const report={
    schema:'rhymelab-markov-model-build-report-v2',
    status:'ok',
    built_at:builtAt,
    model_schema:MARKOV_MODEL_SCHEMA,
    policy:MARKOV_MODEL_POLICY,
    language,
    order:MARKOV_MODEL_ORDER,
    source_manifest:manifest.id,
    config,
    config_fingerprint:configFingerprint,
    sources:sourceRows.map((row)=>({
      code:row.code,
      kind:row.kind,
      weight:row.weight,
      path:row.path,
      bytes:row.bytes,
      genre:row.manifest?.genre??null,
      year:row.manifest?.year??null,
      parent_archive_sha256:row.manifest?.sha256??null,
    })),
    accepted_sentences:acceptedSentences,
    semantic_fingerprint:fingerprint,
    database:outPath,
    database_bytes:outBytes,
    work_database:workPath,
    stats:statsBefore,
  };
  await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`,'utf8');
  console.log(JSON.stringify({...report,database_human_bytes:human(outBytes)},null,2));
}

try{
  await runPass1();
  finalizeCensus();
  await runPass2();
  pruneTransitions();
  await promote();
}catch(error){
  try{db.close();}catch{}
  throw error;
}
