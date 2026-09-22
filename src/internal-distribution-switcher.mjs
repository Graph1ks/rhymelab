import {existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';

export const INTERNAL_DISTRIBUTION_DB_IDS=Object.freeze([
  'master','lite','standard','full',
]);

export function internalDistributionSwitcherEnabled({
  argv=process.argv.slice(2),
  env=process.env,
}={}){
  return argv.includes('--internal-db-switcher')
    ||String(env.RHYMELAB_INTERNAL_DB_SWITCHER||'').trim()==='1';
}

export function normalizeInternalDistributionDbId(value,{fallback='master'}={}){
  const id=String(value||'').trim().toLowerCase();
  return INTERNAL_DISTRIBUTION_DB_IDS.includes(id)?id:fallback;
}

export function internalDistributionDbPaths({
  masterPath,
  env=process.env,
}={}){
  if(!masterPath)throw new Error('masterPath is required');
  return Object.freeze({
    master:resolve(masterPath),
    lite:resolve(
      env.RHYMELAB_DISTRIBUTION_LITE_DB
      ||'data/local/distribution/rhymelab-serving-v1-lite.sqlite'
    ),
    standard:resolve(
      env.RHYMELAB_DISTRIBUTION_STANDARD_DB
      ||'data/local/distribution/rhymelab-serving-v1-standard.sqlite'
    ),
    full:resolve(
      env.RHYMELAB_DISTRIBUTION_FULL_DB
      ||'data/local/distribution/rhymelab-serving-v1-full.sqlite'
    ),
  });
}

export function fileSnapshot(path){
  try{
    const stat=statSync(path,{bigint:true});
    return {
      exists:true,
      sizeBytes:Number(stat.size),
      mtimeMs:Number(stat.mtimeMs),
    };
  }catch{
    return {exists:false,sizeBytes:0,mtimeMs:null};
  }
}

function metaRows(db){
  try{
    return Object.fromEntries(
      db.prepare(`
        SELECT key,value
        FROM meta
        WHERE key LIKE 'distribution_%'
           OR key IN(
             'schema',
             'runtime_revision',
             'runtime_semantic_fingerprint',
             'product_adapter_revision',
             'product_adapter_semantic_fingerprint'
           )
        ORDER BY key
      `).all().map((row)=>[String(row.key),String(row.value)]),
    );
  }catch{
    return {};
  }
}

function pragmaNumber(db,name){
  try{return Number(db.prepare('PRAGMA '+name).get()?.[name]||0)}
  catch{return 0}
}

export function internalDistributionRuntimeSummary({
  id,
  path,
  runtime=null,
  state=null,
  error=null,
  timing=null,
}={}){
  const file=fileSnapshot(path);
  if(!runtime){
    return {
      id,
      path,
      available:false,
      error:error||(!file.exists?'file_missing':'runtime_unavailable'),
      file,
      capabilities:null,
      state:null,
      sqlite:null,
      meta:null,
      queryTiming:timing||null,
    };
  }

  const db=runtime.coreDb;
  const pageSize=pragmaNumber(db,'page_size');
  const pageCount=pragmaNumber(db,'page_count');
  const freePages=pragmaNumber(db,'freelist_count');
  let schemaCounts={tables:0,indexes:0};
  try{
    const rows=db.prepare(`
      SELECT type,COUNT(*) AS c
      FROM sqlite_schema
      WHERE type IN('table','index')
        AND name NOT LIKE 'sqlite_%'
      GROUP BY type
    `).all();
    for(const row of rows){
      if(row.type==='table')schemaCounts.tables=Number(row.c||0);
      if(row.type==='index')schemaCounts.indexes=Number(row.c||0);
    }
  }catch{}

  return {
    id,
    path,
    available:true,
    error:null,
    file,
    capabilities:runtime.capabilities,
    state,
    sqlite:{
      pageSize,
      pageCount,
      freePages,
      allocatedBytes:pageSize*pageCount,
      freeBytes:pageSize*freePages,
      tables:schemaCounts.tables,
      indexes:schemaCounts.indexes,
    },
    meta:metaRows(db),
    queryTiming:timing||null,
  };
}

export function requestedInternalDistributionDbId(url,{enabled=false}={}){
  if(!enabled)return null;
  const raw=url?.searchParams?.get?.('runtime_db');
  if(raw==null||raw==='')return null;
  return normalizeInternalDistributionDbId(raw,{fallback:'master'});
}

export function availableInternalRuntimeEntry(entries,id){
  const entry=entries?.get?.(id);
  return entry?.runtime?entry:null;
}

export function internalRuntimeProcessMetrics({
  performanceObj=globalThis.performance,
  processObj=process,
}={}){
  let elu=null;
  try{
    const value=performanceObj?.eventLoopUtilization?.();
    if(value)elu={
      idle:Number(value.idle||0),
      active:Number(value.active||0),
      utilization:Number(value.utilization||0),
    };
  }catch{}
  let memory={};
  let resource={};
  try{memory=processObj.memoryUsage()}catch{}
  try{resource=processObj.resourceUsage()}catch{}
  return {
    uptimeSeconds:Number(processObj.uptime?.()||0),
    node:String(processObj.version||''),
    platform:String(processObj.platform||''),
    arch:String(processObj.arch||''),
    memory:{
      rss:Number(memory.rss||0),
      heapTotal:Number(memory.heapTotal||0),
      heapUsed:Number(memory.heapUsed||0),
      external:Number(memory.external||0),
      arrayBuffers:Number(memory.arrayBuffers||0),
    },
    resource:{
      userCpuTime:Number(resource.userCPUTime||0),
      systemCpuTime:Number(resource.systemCPUTime||0),
      maxRss:Number(resource.maxRSS||0),
      fsRead:Number(resource.fsRead||0),
      fsWrite:Number(resource.fsWrite||0),
      voluntaryContextSwitches:Number(resource.voluntaryContextSwitches||0),
      involuntaryContextSwitches:Number(resource.involuntaryContextSwitches||0),
    },
    eventLoop:elu,
  };
}

export function internalDistributionPathAvailability(paths){
  return Object.fromEntries(
    INTERNAL_DISTRIBUTION_DB_IDS.map((id)=>[id,existsSync(paths[id])]),
  );
}
