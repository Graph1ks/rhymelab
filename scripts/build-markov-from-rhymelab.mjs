#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {
  DEFAULT_SERVING_V1_PRODUCT_DB_PATH,
  servingV1ProductRuntimeState,
} from '../src/serving-v1-product-runtime.mjs';

const root=process.cwd();
const args=process.argv.slice(2);
let servingDbPath=DEFAULT_SERVING_V1_PRODUCT_DB_PATH;
let sourceOut='data/work/markov-v2/rhymelab-serving-phrase-lines.txt';
let plan=false;
let status=false;
const forwarded=[];

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--serving-db')servingDbPath=args[++i]||servingDbPath;
  else if(arg==='--source-out')sourceOut=args[++i]||sourceOut;
  else if(arg==='--phrase-db'){
    throw new Error('--phrase-db is archived for the old split runtime. Markov now uses --serving-db / rhymelab-serving-v1.sqlite.');
  }
  else if(arg==='--plan')plan=true;
  else if(arg==='--status')status=true;
  else forwarded.push(arg);
}

servingDbPath=resolve(root,servingDbPath);
sourceOut=resolve(root,sourceOut);

async function exists(path){try{await access(path);return true;}catch{return false;}}

function openServingDb(){
  const db=new DatabaseSync(servingDbPath,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    const state=servingV1ProductRuntimeState(db);
    if(!state.available)throw new Error(`Serving-v1 product database is not runtime-ready: ${state.reason}`);
    return {db,state};
  }catch(error){
    db.close();
    throw error;
  }
}

const PHRASE_SELECT=`
  SELECT
    rp.source_phrase_id AS phrase_id,
    MIN(rp.source_surface) AS canonical,
    MAX(pf.token_count) AS token_count
  FROM runtime_phrase rp
  JOIN runtime_phrase_profile pf USING(runtime_phrase_id)
  WHERE (rp.canonical_available=1 OR rp.generated_available=1)
  GROUP BY rp.source_phrase_id
  HAVING MAX(rp.modern_eligible)=1
     AND MAX(pf.token_count) BETWEEN 2 AND 16
  ORDER BY rp.source_phrase_id
`;

function inspectServingDb(){
  const {db,state}=openServingDb();
  try{
    const eligible=Number(db.prepare(`SELECT COUNT(*) AS n FROM (${PHRASE_SELECT})`).get()?.n||0);
    const runtimePhraseRows=Number(db.prepare('SELECT COUNT(*) AS n FROM runtime_phrase').get()?.n||0);
    return {
      state,
      eligible,
      runtimePhraseRows,
    };
  }finally{db.close();}
}

function exportPhraseLines(){
  const {db,state}=openServingDb();
  try{
    const hash=createHash('sha256');
    const chunks=[];
    let rows=0;
    for(const row of db.prepare(PHRASE_SELECT).iterate()){
      const canonical=String(row.canonical||'')
        .normalize('NFKC')
        .replace(/[\r\n\t]+/gu,' ')
        .replace(/\s+/gu,' ')
        .trim();
      if(!canonical)continue;
      const line=`${row.phrase_id}\t${canonical}\n`;
      chunks.push(line);
      hash.update(line);
      rows+=1;
    }
    return {
      text:chunks.join(''),
      rows,
      fingerprint:hash.digest('hex'),
      state,
    };
  }finally{db.close();}
}

async function writeIfChanged(path,text){
  let previous=null;
  try{previous=await readFile(path,'utf8');}catch{}
  if(previous===text)return false;
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,text,'utf8');
  return true;
}

function runBuilder(extraArgs){
  const result=spawnSync(process.execPath,[
    'scripts/build-markov-model.mjs',
    '--sentences',`serving_v1_phrases=${sourceOut}`,
    ...extraArgs,
  ],{
    cwd:root,
    encoding:'utf8',
    stdio:['ignore','pipe','pipe'],
  });
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  process.exit(result.status??1);
}

const servingAvailable=await exists(servingDbPath);

if(plan){
  let info=null;
  let error=null;
  if(servingAvailable){
    try{info=inspectServingDb();}catch(caught){error=caught instanceof Error?caught.message:String(caught);}
  }
  console.log(JSON.stringify({
    schema:'rhymelab-markov-serving-v1-source-plan-v2',
    ready:Boolean(servingAvailable&&info&&info.eligible>0&&!error),
    source:'rhymelab_serving_v1_runtime_phrase',
    source_database_role:'canonical_default',
    serving_database:servingDbPath,
    serving_database_available:servingAvailable,
    serving_runtime_state:info?.state||null,
    runtime_phrase_rows:info?.runtimePhraseRows||0,
    phrases_eligible:info?.eligible||0,
    exported_line_file:sourceOut,
    private_lyrics_used:false,
    archived_split_phrase_database_used:false,
    error,
    build_command:'npm run markov:model:build',
    prerequisite_status_command:'npm run serving:v1:product:status',
    prerequisite_build_command:'npm run serving:v1:product:build',
  },null,2));
  process.exit(servingAvailable&&info?.eligible>0&&!error?0:2);
}

if(status){
  if(!servingAvailable){
    console.log(JSON.stringify({
      schema:'rhymelab-markov-serving-v1-source-status-v2',
      source:'rhymelab_serving_v1_runtime_phrase',
      source_database_role:'canonical_default',
      serving_database:servingDbPath,
      serving_database_available:false,
      markov_database:'data/local/rhymelab-markov-v2.sqlite',
      private_lyrics_used:false,
      archived_split_phrase_database_used:false,
      build_command:'npm run markov:model:build',
      prerequisite_status_command:'npm run serving:v1:product:status',
    },null,2));
    process.exit(0);
  }
  runBuilder(['--status',...forwarded]);
}

if(!servingAvailable){
  throw new Error(
    `Canonical Serving-v1 database missing: ${servingDbPath}\n`
    +'Check it with: npm run serving:v1:product:status\n'
    +'If it truly is not built, run: npm run serving:v1:product:build\n'
    +'Then run: npm run markov:model:build'
  );
}

const info=inspectServingDb();
if(info.eligible<1){
  throw new Error('Canonical Serving-v1 database contains no eligible Phrase/Mosaic runtime rows.');
}

const exported=exportPhraseLines();
const changed=await writeIfChanged(sourceOut,exported.text);
const sourceInfo=await stat(sourceOut);

console.error(JSON.stringify({
  source:'rhymelab_serving_v1_runtime_phrase',
  source_database_role:'canonical_default',
  serving_database:servingDbPath,
  serving_runtime_semantic_fingerprint:exported.state.runtimeSemanticFingerprint,
  serving_product_semantic_fingerprint:exported.state.productSemanticFingerprint,
  exported_lines:exported.rows,
  source_fingerprint:exported.fingerprint,
  source_bytes:sourceInfo.size,
  source_changed:changed,
  private_lyrics_used:false,
  archived_split_phrase_database_used:false,
},null,2));

const hasReset=forwarded.includes('--reset');
const hasMinTokenCount=forwarded.includes('--min-token-count');
const hasMinSequenceTokens=forwarded.includes('--min-sequence-tokens');
const buildArgs=[
  ...(changed&&!hasReset?['--reset']:[]),
  ...(!hasMinTokenCount?['--min-token-count','1']:[]),
  ...(!hasMinSequenceTokens?['--min-sequence-tokens','2']:[]),
  ...forwarded,
];
runBuilder(buildArgs);
