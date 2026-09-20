#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const root=process.cwd();
const args=process.argv.slice(2);
let phraseDbPath='data/local/rhymelab-phrases-v1.sqlite';
let sourceOut='data/work/markov-v1/rhymelab-phrase-lines.txt';
let plan=false;
let status=false;
const forwarded=[];

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--phrase-db')phraseDbPath=args[++i]||phraseDbPath;
  else if(arg==='--source-out')sourceOut=args[++i]||sourceOut;
  else if(arg==='--plan')plan=true;
  else if(arg==='--status')status=true;
  else forwarded.push(arg);
}

phraseDbPath=resolve(root,phraseDbPath);
sourceOut=resolve(root,sourceOut);

async function exists(path){try{await access(path);return true;}catch{return false;}}
function sha256(value){return createHash('sha256').update(value).digest('hex');}
function tableExists(db,name){
  return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name));
}
function readMeta(db){
  if(!tableExists(db,'meta'))return {};
  return Object.fromEntries(db.prepare('SELECT key,value FROM meta ORDER BY key').all().map((row)=>[String(row.key),String(row.value)]));
}
function inspectPhraseDb(){
  const db=new DatabaseSync(phraseDbPath,{readOnly:true});
  try{
    if(!tableExists(db,'phrase'))throw new Error('Phrase database has no phrase table');
    const meta=readMeta(db);
    const eligible=Number(db.prepare(
      'SELECT COUNT(*) AS n FROM phrase WHERE modern_eligible=1 AND token_count BETWEEN 2 AND 16'
    ).get()?.n||0);
    const all=Number(db.prepare('SELECT COUNT(*) AS n FROM phrase').get()?.n||0);
    return {
      meta,
      all,
      eligible,
      catalogFingerprint:meta.catalog_fingerprint||null,
      schema:meta.schema||null,
      policy:meta.policy||null,
    };
  }finally{db.close();}
}
function exportPhraseLines(){
  const db=new DatabaseSync(phraseDbPath,{readOnly:true});
  try{
    if(!tableExists(db,'phrase'))throw new Error('Phrase database has no phrase table');
    const hash=createHash('sha256');
    const chunks=[];
    let rows=0;
    for(const row of db.prepare(
      'SELECT phrase_id,canonical FROM phrase WHERE modern_eligible=1 AND token_count BETWEEN 2 AND 16 ORDER BY phrase_id'
    ).iterate()){
      const canonical=String(row.canonical||'').normalize('NFKC').replace(/[\r\n\t]+/gu,' ').replace(/\s+/gu,' ').trim();
      if(!canonical)continue;
      const line=`${row.phrase_id}\t${canonical}\n`;
      chunks.push(line);
      hash.update(line);
      rows+=1;
    }
    return {text:chunks.join(''),rows,fingerprint:hash.digest('hex')};
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
    '--sentences',`rhymelab_phrases=${sourceOut}`,
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

const phraseAvailable=await exists(phraseDbPath);
if(plan){
  let info=null;
  let error=null;
  if(phraseAvailable){
    try{info=inspectPhraseDb();}catch(caught){error=caught instanceof Error?caught.message:String(caught);}
  }
  console.log(JSON.stringify({
    schema:'rhymelab-markov-rhymelab-source-plan-v1',
    ready:Boolean(phraseAvailable&&info&&info.eligible>0&&!error),
    source:'rhymelab_phrase_catalog',
    phrase_database:phraseDbPath,
    phrase_database_available:phraseAvailable,
    phrase_database_schema:info?.schema||null,
    phrase_database_policy:info?.policy||null,
    phrase_catalog_fingerprint:info?.catalogFingerprint||null,
    phrases_total:info?.all||0,
    phrases_eligible:info?.eligible||0,
    exported_line_file:sourceOut,
    private_lyrics_used:false,
    error,
    build_command:'npm run markov:model:build',
    prerequisite_command:'npm run phrase:catalog:bootstrap',
  },null,2));
  process.exit(phraseAvailable&&info?.eligible>0&&!error?0:2);
}

if(status){
  if(!phraseAvailable){
    console.log(JSON.stringify({
      schema:'rhymelab-markov-rhymelab-source-status-v1',
      source:'rhymelab_phrase_catalog',
      phrase_database:phraseDbPath,
      phrase_database_available:false,
      markov_database:'data/local/rhymelab-markov-v1.sqlite',
      private_lyrics_used:false,
      build_command:'npm run markov:model:build',
      prerequisite_command:'npm run phrase:catalog:bootstrap',
    },null,2));
    process.exit(0);
  }
  runBuilder(['--status',...forwarded]);
}

if(!phraseAvailable){
  throw new Error(
    `RhymeLab Phrase/Mosaic database missing: ${phraseDbPath}\n`
    +'Build/restore it first with: npm run phrase:catalog:bootstrap\n'
    +'Then run: npm run markov:model:build'
  );
}

const info=inspectPhraseDb();
if(info.eligible<1)throw new Error('RhymeLab Phrase/Mosaic database contains no eligible multi-word phrases.');

const exported=exportPhraseLines();
const changed=await writeIfChanged(sourceOut,exported.text);
const sourceInfo=await stat(sourceOut);

console.error(JSON.stringify({
  source:'rhymelab_phrase_catalog',
  phrase_database:phraseDbPath,
  phrase_catalog_fingerprint:info.catalogFingerprint,
  exported_lines:exported.rows,
  source_fingerprint:exported.fingerprint,
  source_bytes:sourceInfo.size,
  source_changed:changed,
  private_lyrics_used:false,
},null,2));

const hasReset=forwarded.includes('--reset');
const hasMinTokenCount=forwarded.includes('--min-token-count');
const buildArgs=[
  ...(changed&&!hasReset?['--reset']:[]),
  ...(!hasMinTokenCount?['--min-token-count','1']:[]),
  ...forwarded,
];
runBuilder(buildArgs);
