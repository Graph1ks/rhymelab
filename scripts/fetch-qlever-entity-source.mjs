#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import {
  DEFAULT_QLEVER_ENDPOINT,
  QLEVER_ENTITY_SOURCE_POLICY,
  QLEVER_ENTITY_SOURCE_SCHEMA,
  buildQLeverEntityQueries,
} from './qlever-entity-source-core.mjs';

const args=process.argv.slice(2);
let taxonomyPath='sources/entity/wikidata-entity-taxonomy-v1.json';
let endpoint=DEFAULT_QLEVER_ENDPOINT;
let retrievalLabel=new Date().toISOString().slice(0,10).replaceAll('-','');
let outDir='';
let reportPath='data/local/entity-qlever-source-v1-report.json';
let maxAttempts=6;
let paceMs=2000;

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--taxonomy') taxonomyPath=args[++i]||taxonomyPath;
  else if(arg==='--endpoint') endpoint=args[++i]||endpoint;
  else if(arg==='--retrieval-label') retrievalLabel=args[++i]||retrievalLabel;
  else if(arg==='--out-dir') outDir=args[++i]||outDir;
  else if(arg==='--report') reportPath=args[++i]||reportPath;
  else if(arg==='--max-attempts') maxAttempts=Number.parseInt(args[++i]||'',10)||maxAttempts;
  else if(arg==='--pace-ms') paceMs=Number.parseInt(args[++i]||'',10)||paceMs;
}
if(!outDir) outDir=`data/raw/entity/qlever-${retrievalLabel}`;

taxonomyPath=resolve(taxonomyPath);
outDir=resolve(outDir);
reportPath=resolve(reportPath);
await mkdir(outDir,{recursive:true});
await mkdir(dirname(reportPath),{recursive:true});

const taxonomyBytes=await readFile(taxonomyPath);
const taxonomy=JSON.parse(taxonomyBytes.toString('utf8'));
if(taxonomy.schema!=='rhymelab-wikidata-entity-taxonomy-v1'){
  throw new Error(`Unexpected taxonomy schema: ${taxonomy.schema}`);
}
const taxonomySha256=createHash('sha256').update(taxonomyBytes).digest('hex');
const queries=buildQLeverEntityQueries(taxonomy);
const sleep=(ms)=>new Promise((resolvePromise)=>setTimeout(resolvePromise,ms));

async function sha256File(path){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function retryDelayMs(response,attempt){
  const retry=response.headers.get('retry-after');
  if(retry){
    const seconds=Number.parseInt(retry,10);
    if(Number.isFinite(seconds)) return Math.max(1000,seconds*1000);
    const date=Date.parse(retry);
    if(Number.isFinite(date)) return Math.max(1000,date-Date.now());
  }
  return Math.min(120000,15000*attempt);
}

async function openQueryResponse(query,id){
  const url=new URL(endpoint);
  url.searchParams.set('query',query);
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    const response=await fetch(url,{
      headers:{
        Accept:'text/tab-separated-values',
        'User-Agent':'Graph1ks-RhymeLab-QLever-Entity-Source/1.0',
      },
      redirect:'follow',
    });
    if(response.ok) return {response,attempt,url:String(url)};
    if(response.status===429 && attempt<maxAttempts){
      const delay=retryDelayMs(response,attempt);
      console.error(`[qlever] ${id} rate-limited; retry ${attempt}/${maxAttempts} in ${Math.round(delay/1000)}s`);
      await response.body?.cancel();
      await sleep(delay);
      continue;
    }
    const body=(await response.text()).slice(0,2000);
    throw new Error(`QLever ${id} failed HTTP ${response.status}: ${body}`);
  }
  throw new Error(`QLever ${id} exhausted retries`);
}

async function exportQuery(spec,index){
  if(index>0 && paceMs>0) await sleep(paceMs);
  const finalPath=resolve(outDir,spec.filename);
  const partPath=`${finalPath}.part`;
  await rm(partPath,{force:true});
  const querySha256=createHash('sha256').update(spec.query).digest('hex');
  const startedAt=Date.now();
  const {response,attempt,url}=await openQueryResponse(spec.query,spec.id);
  const rawHash=createHash('sha256');
  let rawBytes=0;
  let lineBreaks=0;
  const gzip=createGzip({level:6});
  const output=createWriteStream(partPath,{flags:'wx'});
  const pipeDone=pipeline(gzip,output);

  try{
    for await(const value of response.body){
      const chunk=Buffer.from(value);
      rawHash.update(chunk);
      rawBytes+=chunk.length;
      for(let offset=0;(offset=chunk.indexOf(10,offset))!==-1;offset+=1) lineBreaks+=1;
      if(!gzip.write(chunk)) await once(gzip,'drain');
    }
    gzip.end();
    await pipeDone;
    await rename(partPath,finalPath);
  }catch(error){
    gzip.destroy();
    await rm(partPath,{force:true});
    throw error;
  }

  const fileStat=await stat(finalPath);
  const result={
    id:spec.id,
    filename:spec.filename,
    path:finalPath,
    endpoint,
    request_url:url,
    columns:spec.columns,
    query:spec.query,
    query_sha256:querySha256,
    response_content_type:response.headers.get('content-type'),
    response_content_encoding:response.headers.get('content-encoding'),
    http_attempts:attempt,
    rows:Math.max(0,lineBreaks-1),
    raw_bytes:rawBytes,
    raw_sha256:rawHash.digest('hex'),
    gzip_bytes:fileStat.size,
    gzip_sha256:await sha256File(finalPath),
    elapsed_ms:Date.now()-startedAt,
  };
  console.error(
    `[qlever] ${spec.id}: rows=${result.rows.toLocaleString('en-US')} `
    + `raw=${(result.raw_bytes/1024/1024).toFixed(1)}MiB `
    + `gzip=${(result.gzip_bytes/1024/1024).toFixed(1)}MiB `
    + `elapsed=${(result.elapsed_ms/1000).toFixed(1)}s`,
  );
  return result;
}

const startedAt=new Date().toISOString();
const exports=[];
for(let i=0;i<queries.length;i+=1) exports.push(await exportQuery(queries[i],i));
const finishedAt=new Date().toISOString();

const report={
  schema:QLEVER_ENTITY_SOURCE_SCHEMA,
  policy:QLEVER_ENTITY_SOURCE_POLICY,
  status:'ok',
  built_at:finishedAt,
  retrieval_started_at:startedAt,
  retrieval_finished_at:finishedAt,
  retrieval_label:retrievalLabel,
  endpoint,
  taxonomy:taxonomyPath,
  taxonomy_schema:taxonomy.schema,
  taxonomy_policy:taxonomy.policy,
  taxonomy_sha256:taxonomySha256,
  out_dir:outDir,
  exports,
  total_rows:exports.reduce((sum,row)=>sum+row.rows,0),
  total_raw_bytes:exports.reduce((sum,row)=>sum+row.raw_bytes,0),
  total_gzip_bytes:exports.reduce((sum,row)=>sum+row.gzip_bytes,0),
  freshness_semantics:'retrieval_timestamp_is_not_a_dated_wikidata_snapshot; local exported artifacts are pinned by query and SHA-256',
  runtime_network_dependency:false,
};
await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`,'utf8');
console.log(JSON.stringify(report,null,2));
