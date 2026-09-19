#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const INVENTORY_SCHEMA='rhymelab-local-data-inventory-v1';
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

const root=resolve(argValue('--root','data'));
const output=resolve(argValue('--out','data/local/local-data-inventory-v1-report.json'));
const exactRowCounts=hasFlag('--row-counts');
const fullHashes=hasFlag('--hash');
const maxSampleLines=integerArg('--sample-lines',4,{min:1,max:50});
const maxTextBytes=integerArg('--sample-bytes',256*1024,{min:4096,max:4*1024*1024});
const progressEvery=integerArg('--progress-every',100,{min:1,max:100000});

function toPosix(path){ return path.split(sep).join('/'); }
function relPath(path){ return toPosix(relative(process.cwd(),path)); }
function now(){ return new Date().toISOString(); }
function humanBytes(bytes){
  const units=['B','KiB','MiB','GiB','TiB'];
  let value=Number(bytes)||0;
  let index=0;
  while(value>=1024&&index<units.length-1){value/=1024;index+=1;}
  return value.toFixed(index?2:0)+' '+units[index];
}
function extensionOf(path){
  const lower=path.toLowerCase();
  for(const suffix of ['.jsonl.gz','.ndjson.gz','.csv.gz','.tsv.gz','.json.gz','.tar.gz']){
    if(lower.endsWith(suffix)) return suffix;
  }
  return extname(lower)||'(none)';
}
function roleHint(path){
  const p=relPath(path).toLowerCase();
  if(p.startsWith('data/raw/')) return 'original_source_snapshot';
  if(p.startsWith('data/work/')&&/(downloads|raw|source)/.test(p)) return 'original_source_snapshot';
  if(p.startsWith('data/de/core/')) return 'prepublish_stage';
  if(p.startsWith('data/de/usage/')) return 'prepublish_stage';
  if(p.startsWith('data/de/publish')) return 'publish_stage';
  if(p.startsWith('data/local/')) return 'local_runtime_or_generated';
  if(/manifest|snapshot|source/.test(p)) return 'source_metadata_or_snapshot';
  return 'unclassified';
}
function isLikelyOriginalSource(file){
  const role=roleHint(file);
  return role==='original_source_snapshot'||role==='source_metadata_or_snapshot';
}
function sanitizeSqlName(name){ return '"'+String(name).replaceAll('"','""')+'"'; }
function safeJsonParse(text){
  try{return JSON.parse(text);}catch{return null;}
}
function shapeOf(value,depth=0){
  if(depth>=3) return Array.isArray(value)?'array':value===null?'null':typeof value;
  if(Array.isArray(value)){
    return {
      type:'array',
      length:value.length,
      item_shapes:[...new Set(value.slice(0,3).map((item)=>JSON.stringify(shapeOf(item,depth+1))))].map((x)=>JSON.parse(x)),
    };
  }
  if(value&&typeof value==='object'){
    const entries=Object.entries(value).slice(0,80);
    return {
      type:'object',
      keys:Object.keys(value).slice(0,120),
      fields:Object.fromEntries(entries.map(([key,item])=>[key,shapeOf(item,depth+1)])),
    };
  }
  return value===null?'null':typeof value;
}

async function sha256File(path){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function readPrefix(path,limit=maxTextBytes){
  const stream=createReadStream(path,{start:0,end:Math.max(0,limit-1)});
  const chunks=[];
  let total=0;
  for await(const chunk of stream){
    chunks.push(chunk);
    total+=chunk.length;
    if(total>=limit) break;
  }
  return Buffer.concat(chunks).subarray(0,limit);
}

async function readGzipPrefix(path,limit=maxTextBytes){
  const source=createReadStream(path);
  const gunzip=createGunzip();
  const input=source.pipe(gunzip);
  const chunks=[];
  let total=0;
  try{
    for await(const chunk of input){
      const remaining=Math.max(0,limit-total);
      if(!remaining) break;
      chunks.push(Buffer.from(chunk).subarray(0,remaining));
      total+=Math.min(chunk.length,remaining);
      if(total>=limit) break;
    }
  }finally{
    input.destroy();
    gunzip.destroy();
    source.destroy();
  }
  return Buffer.concat(chunks,total);
}

function inspectDelimitedLines(lines,delimiter){
  const header=String(lines[0]||'').split(delimiter);
  return {
    kind:delimiter==='\t'?'tsv':'csv',
    header,
    column_count:header.length,
    sampled_rows:Math.max(0,lines.length-1),
    sample_row_widths:lines.slice(1).map((line)=>line.split(delimiter).length),
  };
}

function inspectJsonLines(lines){
  const parsed=[];
  for(const line of lines){
    const value=safeJsonParse(line);
    if(value!==null) parsed.push(value);
  }
  if(!parsed.length) return null;
  return {
    kind:'jsonl',
    sampled_records:parsed.length,
    record_shapes:parsed.slice(0,3).map((value)=>shapeOf(value)),
  };
}

async function inspectTextLike(path,extension){
  let lines=[];
  let compressed=false;
  if(extension.endsWith('.gz')){
    compressed=true;
    const prefix=(await readGzipPrefix(path)).toString('utf8');
    lines=prefix.split(/\r?\n/u).filter((line)=>line.length).slice(0,maxSampleLines);
  }else{
    const prefix=(await readPrefix(path)).toString('utf8');
    lines=prefix.split(/\r?\n/u).filter((line)=>line.length).slice(0,maxSampleLines);
  }
  const jsonl=inspectJsonLines(lines);
  if(jsonl) return {...jsonl,compressed};
  const first=lines[0]||'';
  if(first.includes('\t')) return {...inspectDelimitedLines(lines,'\t'),compressed};
  if(first.includes(',')) return {...inspectDelimitedLines(lines,','),compressed};
  return {
    kind:'text',
    compressed,
    sampled_lines:lines.length,
    first_line_length:first.length,
  };
}

function sqliteMeta(db){
  try{
    const exists=db.prepare("SELECT 1 AS ok FROM sqlite_schema WHERE type='table' AND name='meta'").get();
    if(!exists) return null;
    const columns=db.prepare("PRAGMA table_info('meta')").all().map((row)=>String(row.name));
    if(!columns.includes('key')||!columns.includes('value')) return {columns};
    const rows=db.prepare('SELECT key,value FROM meta ORDER BY key LIMIT 200').all();
    const safeValuePattern=/(?:^|_)(schema|policy|version|fingerprint|runtime|profile|status|id)(?:$|_)/iu;
    return {
      columns,
      keys:rows.map((row)=>String(row.key)),
      values:Object.fromEntries(
        rows
          .filter((row)=>safeValuePattern.test(String(row.key)))
          .map((row)=>[String(row.key),String(row.value).slice(0,500)]),
      ),
      truncated:rows.length>=200,
    };
  }catch(error){
    return {error:String(error?.message||error)};
  }
}

function sqliteApproxRows(db,table){
  try{
    const hasStats=db.prepare("SELECT 1 AS ok FROM sqlite_schema WHERE type='table' AND name='sqlite_stat1'").get();
    if(!hasStats) return null;
    const row=db.prepare('SELECT stat FROM sqlite_stat1 WHERE tbl=? ORDER BY idx IS NULL DESC LIMIT 1').get(table);
    if(!row?.stat) return null;
    const first=Number.parseInt(String(row.stat).split(/\s+/u)[0],10);
    return Number.isFinite(first)?first:null;
  }catch{return null;}
}

function inspectSqlite(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    const pageCount=Number(db.prepare('PRAGMA page_count').get()?.page_count||0);
    const pageSize=Number(db.prepare('PRAGMA page_size').get()?.page_size||0);
    const userVersion=Number(db.prepare('PRAGMA user_version').get()?.user_version||0);
    const applicationId=Number(db.prepare('PRAGMA application_id').get()?.application_id||0);
    const tableRows=db.prepare([
      "SELECT name,sql FROM sqlite_schema",
      "WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      'ORDER BY name',
    ].join(' ')).all();
    const tables=tableRows.map((table)=>{
      const columns=db.prepare('PRAGMA table_info('+sanitizeSqlName(table.name)+')').all().map((row)=>({
        cid:Number(row.cid),
        name:String(row.name),
        type:String(row.type||''),
        not_null:Boolean(row.notnull),
        default_value:row.dflt_value??null,
        primary_key_position:Number(row.pk||0),
      }));
      const indexes=db.prepare('PRAGMA index_list('+sanitizeSqlName(table.name)+')').all().map((row)=>({
        name:String(row.name),
        unique:Boolean(row.unique),
        origin:String(row.origin||''),
        partial:Boolean(row.partial),
        columns:db.prepare('PRAGMA index_info('+sanitizeSqlName(row.name)+')').all().map((part)=>String(part.name)),
      }));
      let exactRows=null;
      let rowCountError=null;
      if(exactRowCounts){
        try{
          exactRows=Number(db.prepare('SELECT COUNT(*) AS c FROM '+sanitizeSqlName(table.name)).get()?.c||0);
        }catch(error){
          rowCountError=String(error?.message||error);
        }
      }
      return {
        name:String(table.name),
        columns,
        indexes,
        approximate_rows:sqliteApproxRows(db,table.name),
        exact_rows:exactRows,
        row_count_error:rowCountError,
      };
    });
    return {
      kind:'sqlite',
      user_version:userVersion,
      application_id:applicationId,
      page_count:pageCount,
      page_size:pageSize,
      logical_bytes:pageCount*pageSize,
      meta:sqliteMeta(db),
      tables,
    };
  }finally{
    db.close();
  }
}

async function inspectJson(path,size){
  if(size>16*1024*1024){
    const prefix=(await readPrefix(path)).toString('utf8').trimStart();
    return {
      kind:'json',
      parsed:false,
      reason:'file_larger_than_16_mib',
      prefix_kind:prefix.startsWith('[')?'array':prefix.startsWith('{')?'object':'unknown',
    };
  }
  const parsed=safeJsonParse(await readFile(path,'utf8'));
  if(parsed===null) return {kind:'json',parsed:false,reason:'parse_failed'};
  return {kind:'json',parsed:true,shape:shapeOf(parsed)};
}

async function inspectFile(path,info){
  const extension=extensionOf(path);
  const base={
    path:relPath(path),
    bytes:Number(info.size),
    human_bytes:humanBytes(info.size),
    extension,
    modified_at:new Date(info.mtimeMs).toISOString(),
    role_hint:roleHint(path),
  };
  if(fullHashes) base.sha256=await sha256File(path);

  try{
    if(['.sqlite','.sqlite3','.db'].includes(extension)){
      return {...base,inspection:inspectSqlite(path),inspection_error:null};
    }
    if(extension==='.json'){
      return {...base,inspection:await inspectJson(path,info.size),inspection_error:null};
    }
    if(['.jsonl','.ndjson','.tsv','.csv','.txt','.jsonl.gz','.ndjson.gz','.tsv.gz','.csv.gz','.json.gz','.gz'].includes(extension)){
      return {...base,inspection:await inspectTextLike(path,extension),inspection_error:null};
    }
    return {...base,inspection:{kind:'binary_or_uninspected'},inspection_error:null};
  }catch(error){
    return {...base,inspection:null,inspection_error:String(error?.stack||error?.message||error)};
  }
}

async function walk(dir,out){
  const entries=await readdir(dir,{withFileTypes:true});
  entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  for(const entry of entries){
    const path=resolve(dir,entry.name);
    if(path===output) continue;
    if(entry.isSymbolicLink()){
      console.log('[data-inventory] skip symlink '+relPath(path));
      continue;
    }
    if(entry.isDirectory()){
      await walk(path,out);
      continue;
    }
    if(entry.isFile()) out.push({path});
  }
}

const startedAt=Date.now();
const paths=[];
await walk(root,paths);

const files=[];
let totalBytes=0;
for(let index=0;index<paths.length;index+=1){
  const item=paths[index];
  const info=await stat(item.path);
  const inspected=await inspectFile(item.path,info);
  files.push(inspected);
  totalBytes+=Number(info.size);
  if((index+1)%progressEvery===0||index+1===paths.length){
    const elapsed=Math.max(0.001,(Date.now()-startedAt)/1000);
    console.log(
      '[data-inventory] '+(index+1).toLocaleString('en-US')+'/'+paths.length.toLocaleString('en-US')
      +' files · '+humanBytes(totalBytes)
      +' · '+((index+1)/elapsed).toFixed(1)+' files/s'
    );
  }
}

const byExtension={};
const byRole={};
let sqliteFiles=0;
let inspectionErrors=0;
for(const file of files){
  byExtension[file.extension]=(byExtension[file.extension]||0)+1;
  byRole[file.role_hint]=(byRole[file.role_hint]||0)+1;
  if(file.inspection?.kind==='sqlite') sqliteFiles+=1;
  if(file.inspection_error) inspectionErrors+=1;
}

const likelyOriginalSources=files
  .filter((file)=>isLikelyOriginalSource(resolve(file.path)))
  .map((file)=>({
    path:file.path,
    bytes:file.bytes,
    human_bytes:file.human_bytes,
    extension:file.extension,
    role_hint:file.role_hint,
    inspection_kind:file.inspection?.kind||null,
  }));

const report={
  schema:INVENTORY_SCHEMA,
  generated_at:now(),
  scan_root:relPath(root),
  options:{
    exact_row_counts:exactRowCounts,
    full_sha256:fullHashes,
    sample_lines:maxSampleLines,
    sample_bytes:maxTextBytes,
  },
  summary:{
    files:files.length,
    total_bytes:totalBytes,
    human_total_bytes:humanBytes(totalBytes),
    sqlite_files:sqliteFiles,
    inspection_errors:inspectionErrors,
    by_extension:Object.fromEntries(Object.entries(byExtension).sort(([a],[b])=>a.localeCompare(b))),
    by_role:Object.fromEntries(Object.entries(byRole).sort(([a],[b])=>a.localeCompare(b))),
    likely_original_source_files:likelyOriginalSources.length,
  },
  likely_original_sources:likelyOriginalSources,
  files,
};

await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');

console.log('\nLOCAL DATA INVENTORY READY');
console.log(JSON.stringify({
  report:relPath(output),
  files:report.summary.files,
  total:report.summary.human_total_bytes,
  sqlite_files:report.summary.sqlite_files,
  likely_original_source_files:report.summary.likely_original_source_files,
  inspection_errors:report.summary.inspection_errors,
  elapsed_seconds:Number(((Date.now()-startedAt)/1000).toFixed(2)),
},null,2));
