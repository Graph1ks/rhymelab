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
