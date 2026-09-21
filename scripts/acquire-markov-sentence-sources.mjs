#!/usr/bin/env node
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {
  MARKOV_SOURCE_STAGE_SCHEMA,
  extractTarMember,
  parseLeipzigSentenceFile,
  parseTatoebaDetailedFile,
  sha256Buffer,
  sourceStageRows,
} from './markov-source-acquisition-core.mjs';

const require=createRequire(import.meta.url);
const Bunzip=require('seek-bzip');

const root=process.cwd();
const args=process.argv.slice(2);
let registryPath='sources/markov-sentence-sources-v1.json';
let outDir='data/local/markov-sources';
let rawDir='data/raw/markov-sources';
let sourceFilter='all';
let refresh=false;
let plan=false;
let status=false;
let maxPerSource=Infinity;

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--registry')registryPath=args[++i]||registryPath;
  else if(arg==='--out-dir')outDir=args[++i]||outDir;
  else if(arg==='--raw-dir')rawDir=args[++i]||rawDir;
  else if(arg==='--source')sourceFilter=args[++i]||sourceFilter;
  else if(arg==='--max-per-source')maxPerSource=Math.max(1,Number(args[++i])||Infinity);
  else if(arg==='--refresh')refresh=true;
  else if(arg==='--plan')plan=true;
  else if(arg==='--status')status=true;
  else throw new Error('Unknown argument: '+arg);
}

registryPath=resolve(root,registryPath);
outDir=resolve(root,outDir);
rawDir=resolve(root,rawDir);

async function exists(path){
  try{await access(path);return true;}catch{return false;}
}

async function readRegistry(){
  const parsed=JSON.parse(await readFile(registryPath,'utf8'));
  if(parsed?.schema!=='rhymelab-markov-source-registry-v1'){
    throw new Error('Unsupported source registry schema: '+String(parsed?.schema||'missing'));
  }
  return parsed;
}

function selectedSources(registry){
  const enabled=(registry.sources||[]).filter((row)=>row?.enabled!==false);
  if(sourceFilter==='all')return enabled;
  const wanted=new Set(String(sourceFilter).split(',').map((value)=>value.trim()).filter(Boolean));
  const picked=enabled.filter((row)=>wanted.has(row.code));
  const missing=[...wanted].filter((code)=>!picked.some((row)=>row.code===code));
  if(missing.length)throw new Error('Unknown enabled source(s): '+missing.join(', '));
  return picked;
}

function archiveExtension(source){
  if(source.format==='leipzig-tar-gz')return '.tar.gz';
  if(source.format==='tatoeba-detailed-bz2')return '.tsv.bz2';
  return '.bin';
}

async function download(source,target){
  const response=await fetch(source.url,{
    headers:{
      'user-agent':'RhymeLab/0.11 Markov source acquisition (+https://github.com/Graph1ks/rhymelab)',
      'accept':'*/*',
    },
    redirect:'follow',
  });
  if(!response.ok)throw new Error('Download failed '+response.status+' '+response.statusText+' for '+source.url);
  const buffer=Buffer.from(await response.arrayBuffer());
  if(!buffer.length)throw new Error('Downloaded empty archive for '+source.code);
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,buffer);
  return buffer;
}

async function loadArchive(source){
  const archive=join(rawDir,source.code+archiveExtension(source));
  let buffer=null;
  if(!refresh&&await exists(archive)){
    buffer=await readFile(archive);
  }else{
    console.error('[markov-sources] download '+source.code+' ← '+source.url);
    buffer=await download(source,archive);
  }
  return {archive,buffer,sha256:sha256Buffer(buffer),bytes:buffer.length};
}

function parseSource(source,archiveBuffer){
  if(source.format==='leipzig-tar-gz'){
    const tar=gunzipSync(archiveBuffer);
    const member=extractTarMember(tar,(name)=>name.endsWith(source.member_suffix));
    if(!member)throw new Error('Leipzig sentence member missing: '+source.member_suffix);
    return parseLeipzigSentenceFile(member.data.toString('utf8'));
  }
  if(source.format==='tatoeba-detailed-bz2'){
    const decoded=Bunzip.decode(archiveBuffer);
    return parseTatoebaDetailedFile(decoded.toString('utf8'),{language:'deu'});
  }
  throw new Error('Unsupported source format: '+source.format);
}

function manifestPath(){
  return join(outDir,'manifest.json');
}

async function currentStatus(sources){
  let manifest=null;
  try{manifest=JSON.parse(await readFile(manifestPath(),'utf8'));}catch{}
  return {
    schema:'rhymelab-markov-source-acquisition-status-v1',
    registry:registryPath,
    out_dir:outDir,
    raw_dir:rawDir,
    manifest_available:Boolean(manifest),
    manifest_schema:manifest?.schema||null,
    staged_sources:(manifest?.sources||[]).map((row)=>({
      code:row.code,
      accepted:row.accepted,
      staged_path:row.staged_path,
      staged_available:false,
      sha256:row.staged_sha256,
      kind:row.kind,
      weight:row.weight,
    })),
    configured_sources:sources.map((row)=>({
      code:row.code,
      kind:row.kind,
      weight:row.weight,
      format:row.format,
      url:row.url,
      license:row.license,
      year:row.year??null,
    })),
  };
}

const registry=await readRegistry();
const sources=selectedSources(registry);

if(plan){
  console.log(JSON.stringify({
    schema:'rhymelab-markov-source-acquisition-plan-v1',
    registry:registryPath,
    out_dir:outDir,
    raw_dir:rawDir,
    sources:sources.map((row)=>({
      code:row.code,
      kind:row.kind,
      weight:row.weight,
      format:row.format,
      url:row.url,
      license:row.license,
      license_url:row.license_url,
      genre:row.genre,
      year:row.year??null,
      expected_rows:row.expected_rows??null,
    })),
    commands:{
      acquire:'npm run markov:sources:acquire',
      status:'npm run markov:sources:status',
      build_model:'npm run markov:model:build',
    },
  },null,2));
  process.exit(0);
}

if(status){
  const payload=await currentStatus(sources);
  for(const row of payload.staged_sources){
    row.staged_available=await exists(resolve(root,row.staged_path));
  }
  console.log(JSON.stringify(payload,null,2));
  process.exit(0);
}

await mkdir(outDir,{recursive:true});
await mkdir(rawDir,{recursive:true});

const seen=new Set();
const staged=[];
const attribution=[];
for(const source of sources){
  const archive=await loadArchive(source);
  const parsed=parseSource(source,archive.buffer);
  const stage=sourceStageRows(parsed,{
    seen,
    sourceCode:source.code,
    maxRows:maxPerSource,
  });

  const stagedPath=join(outDir,source.code+'.txt');
  const stagedText=stage.rows.map((row)=>row.sentence).join('\n')+(stage.rows.length?'\n':'');
  await writeFile(stagedPath,stagedText,'utf8');

  const detailPath=join(outDir,source.code+'.meta.json');
  const detail={
    schema:MARKOV_SOURCE_STAGE_SCHEMA,
    code:source.code,
    kind:source.kind,
    weight:source.weight,
    language:'de',
    format:source.format,
    genre:source.genre,
    year:source.year??null,
    source_url:source.source_url,
    download_url:source.url,
    license:source.license,
    license_url:source.license_url,
    attribution_url:source.attribution_url||source.source_url,
    raw_archive:archive.archive,
    raw_bytes:archive.bytes,
    raw_sha256:archive.sha256,
    parsed_rows:parsed.length,
    scanned:stage.stats.scanned,
    accepted:stage.stats.accepted,
    duplicates:stage.stats.duplicates,
    rejected:stage.stats.rejected,
    staged_path:stagedPath,
    staged_sha256:sha256Buffer(Buffer.from(stagedText,'utf8')),
    acquired_at:new Date().toISOString(),
  };
  await writeFile(detailPath,JSON.stringify(detail,null,2)+'\n','utf8');
  staged.push(detail);
  attribution.push(
    source.code+': '+source.source_url+' — '+source.license+
    (source.license_url?' ('+source.license_url+')':'')
  );
  console.error(
    '[markov-sources] '+source.code+
    ' parsed='+parsed.length.toLocaleString()+
    ' accepted='+stage.stats.accepted.toLocaleString()+
    ' duplicates='+stage.stats.duplicates.toLocaleString()
  );
}

const manifest={
  schema:'rhymelab-markov-source-manifest-v1',
  language:'de',
  generated_at:new Date().toISOString(),
  registry:registryPath,
  global_unique_sentences:seen.size,
  sources:staged.map((row)=>({
    code:row.code,
    kind:row.kind,
    weight:row.weight,
    genre:row.genre,
    year:row.year,
    license:row.license,
    license_url:row.license_url,
    source_url:row.source_url,
    accepted:row.accepted,
    staged_path:row.staged_path,
    staged_sha256:row.staged_sha256,
    raw_sha256:row.raw_sha256,
  })),
};
await writeFile(manifestPath(),JSON.stringify(manifest,null,2)+'\n','utf8');
await writeFile(
  join(outDir,'ATTRIBUTION.txt'),
  'RhymeLab local Markov sentence-source attribution\n\n'+attribution.join('\n')+'\n',
  'utf8',
);

console.log(JSON.stringify({
  status:'ok',
  manifest:manifestPath(),
  unique_sentences:seen.size,
  sources:manifest.sources,
},null,2));
