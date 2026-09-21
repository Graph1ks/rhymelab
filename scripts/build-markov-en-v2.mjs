#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const root=process.cwd();
const args=process.argv.slice(2);
let sentenceManifest='data/local/markov-sources/en/manifest.json';
let workPath='data/work/markov-v2/en/rhymelab-markov-en-v2.build.sqlite';
let outPath='data/local/rhymelab-markov-en-v2.sqlite';
let reportPath='data/local/markov-model-en-v2-report.json';
let plan=false;
let status=false;
const forwarded=[];

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--sentence-manifest')sentenceManifest=args[++i]||sentenceManifest;
  else if(arg==='--work')workPath=args[++i]||workPath;
  else if(arg==='--out')outPath=args[++i]||outPath;
  else if(arg==='--report')reportPath=args[++i]||reportPath;
  else if(arg==='--plan')plan=true;
  else if(arg==='--status')status=true;
  else forwarded.push(arg);
}

sentenceManifest=resolve(root,sentenceManifest);
workPath=resolve(root,workPath);
outPath=resolve(root,outPath);
reportPath=resolve(root,reportPath);

async function exists(path){try{await access(path);return true;}catch{return false;}}

async function sourceRows(){
  if(!await exists(sentenceManifest))return [];
  const parsed=JSON.parse(await readFile(sentenceManifest,'utf8'));
  if(parsed?.schema!=='rhymelab-markov-source-manifest-v1'||parsed?.language!=='en'){
    throw new Error('Unsupported English Markov source manifest: '+String(parsed?.schema||'missing')+' / '+String(parsed?.language||'missing'));
  }
  const rows=[];
  for(const source of parsed.sources||[]){
    const kind=['sentence','lyric'].includes(source.kind)?source.kind:null;
    if(!kind||!source.code||!source.staged_path)continue;
    const path=resolve(root,String(source.staged_path));
    if(!await exists(path))throw new Error('Staged English Markov source missing: '+path);
    rows.push({
      code:String(source.code),
      kind,
      weight:Math.max(1,Math.min(16,Number(source.weight)||1)),
      path,
      accepted:Number(source.accepted||0),
      staged_sha256:String(source.staged_sha256||''),
      license:String(source.license||''),
      year:source.year??null,
    });
  }
  return rows;
}

function sourceCliArgs(rows){
  return rows.flatMap((row)=>[
    '--source',
    row.kind+':'+row.code+':'+row.weight+'='+row.path,
  ]);
}

function runBuilder(rows,extraArgs=[]){
  const result=spawnSync(process.execPath,[
    'scripts/build-markov-model.mjs',
    '--language','en',
    '--work',workPath,
    '--out',outPath,
    '--report',reportPath,
    ...sourceCliArgs(rows),
    ...extraArgs,
  ],{
    cwd:root,
    stdio:['ignore','inherit','inherit'],
  });
  return result.status??1;
}

const rows=await sourceRows();

if(plan){
  console.log(JSON.stringify({
    schema:'rhymelab-markov-en-source-plan-v1',
    ready:rows.length>0,
    language:'en',
    sentence_manifest:sentenceManifest,
    work_database:workPath,
    output_database:outPath,
    report:reportPath,
    sources:rows,
    accepted_rows:rows.reduce((sum,row)=>sum+row.accepted,0),
    acquire_command:'npm run markov:sources:acquire:en',
    build_command:'npm run markov:model:build:en',
  },null,2));
  process.exit(rows.length?0:2);
}

if(status){
  if(!rows.length){
    console.log(JSON.stringify({
      schema:'rhymelab-markov-en-source-status-v1',
      available:false,
      language:'en',
      sentence_manifest:sentenceManifest,
      output_database:outPath,
      acquire_command:'npm run markov:sources:acquire:en',
      build_command:'npm run markov:model:build:en',
    },null,2));
    process.exit(0);
  }
  process.exit(runBuilder(rows,['--status',...forwarded]));
}

if(!rows.length){
  throw new Error(
    'No staged English Markov sources found.\n'
    +'Run: npm run markov:sources:acquire:en\n'
    +'Then run: npm run markov:model:build:en'
  );
}

const mixFingerprint=createHash('sha256')
  .update(rows.map((row)=>[
    row.code,row.kind,row.weight,row.staged_sha256,row.accepted,
  ].join(':')).join('\n'))
  .digest('hex');
const fingerprintPath=resolve(root,'data/work/markov-v2/en/source-mix-fingerprint.txt');
let previous='';
try{previous=(await readFile(fingerprintPath,'utf8')).trim();}catch{}
const changed=previous!==mixFingerprint;

const hasReset=forwarded.includes('--reset');
const hasMinTokenCount=forwarded.includes('--min-token-count');
const hasMinSequenceTokens=forwarded.includes('--min-sequence-tokens');
const buildArgs=[
  ...(changed&&!hasReset?['--reset']:[]),
  ...(!hasMinTokenCount?['--min-token-count','1']:[]),
  ...(!hasMinSequenceTokens?['--min-sequence-tokens','2']:[]),
  ...forwarded,
];

console.error(JSON.stringify({
  language:'en',
  source_mix_fingerprint:mixFingerprint,
  source_changed:changed,
  sources:rows.map((row)=>({
    code:row.code,
    kind:row.kind,
    weight:row.weight,
    accepted:row.accepted,
    license:row.license,
    year:row.year,
    staged_sha256:row.staged_sha256,
  })),
},null,2));

await mkdir(dirname(fingerprintPath),{recursive:true});
const buildStatus=runBuilder(rows,buildArgs);
if(buildStatus===0)await writeFile(fingerprintPath,mixFingerprint+'\n','utf8');
process.exit(buildStatus);
