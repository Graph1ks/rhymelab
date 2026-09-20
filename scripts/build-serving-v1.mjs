#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_GENERATED_ENGLISH_DB_PATH,
  DEFAULT_GENERATED_ENTITY_DB_PATH,
  DEFAULT_GENERATED_OPTIN_MARKER_PATH,
  DEFAULT_GENERATED_OPTIN_REPORT_PATH,
  DEFAULT_GENERATED_PHRASE_DB_PATH,
  DEFAULT_GENERATED_WRITER_DB_PATH,
  readGeneratedOptinAcceptanceMarker,
  readGeneratedOptinReport,
} from '../src/generated-optin-runtime.mjs';
import {
  SERVING_V1_BUILD_POLICY,
  SERVING_V1_BUILD_REVISION,
  SERVING_V1_POLICY,
  SERVING_V1_SCHEMA,
  createServingV1Storage,
  normalizeServingV1Availability,
  servingV1InvariantReport,
  servingV1StageDefinitions,
  servingV1Summary,
} from './serving-v1-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}
function hasFlag(flag){ return args.includes(flag); }
function integerArg(flag,fallback,{min=1,max=10_000_000}={}){
  const parsed=Number.parseInt(String(argValue(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(parsed)?parsed:fallback));
}

const mode=hasFlag('--plan')?'plan':hasFlag('--status')?'status':'build';
const batchSize=integerArg('--batch-size',100_000,{min:1_000,max:1_000_000});
const progressEvery=integerArg('--progress-every',1,{min:1,max:10_000});
const reset=hasFlag('--reset');
const replace=hasFlag('--replace');
const pauseAfterStage=argValue('--pause-after-stage',null);

const paths={
  deCore:resolve(argValue('--de-core','data/local/rhymelab-v5.sqlite')),
  enCore:resolve(argValue('--en-core','data/local/rhymelab-en-v1.sqlite')),
  phraseCore:resolve(argValue('--phrase-core','data/local/rhymelab-phrases-v1.sqlite')),
  entityCore:resolve(argValue('--entity-core','data/local/rhymelab-entities-v1.sqlite')),
  deGenerated:resolve(argValue('--de-generated',DEFAULT_GENERATED_WRITER_DB_PATH)),
  enGenerated:resolve(argValue('--en-generated',DEFAULT_GENERATED_ENGLISH_DB_PATH)),
  phraseGenerated:resolve(argValue('--phrase-generated',DEFAULT_GENERATED_PHRASE_DB_PATH)),
  entityGenerated:resolve(argValue('--entity-generated',DEFAULT_GENERATED_ENTITY_DB_PATH)),
};
const generatedReportPath=resolve(argValue('--generated-report',DEFAULT_GENERATED_OPTIN_REPORT_PATH));
const generatedMarkerPath=resolve(argValue('--generated-marker',DEFAULT_GENERATED_OPTIN_MARKER_PATH));
const outputPath=resolve(argValue('--out','data/local/rhymelab-serving-v1.sqlite'));
const workPath=resolve(argValue('--work','data/local/rhymelab-serving-v1.building.sqlite'));
const reportPath=resolve(argValue('--report','data/local/rhymelab-serving-v1-report.json'));
const previousPath=resolve(argValue('--previous',outputPath+'.previous.sqlite'));

let stopRequested=false;
let manualPauseRequested=false;
for(const signal of ['SIGINT','SIGTERM']){
  process.on(signal,()=>{
    if(stopRequested)return;
    stopRequested=true;
    process.exitCode=130;
    console.error(`\n[serving-v1] ${signal} received; the current batch will finish, then the build will stop safely.`);
  });
}

const now=()=>new Date().toISOString();
const hash=(value)=>createHash('sha256').update(String(value)).digest('hex');
const safeJson=(value)=>JSON.stringify(value??{});
const quoteSql=(value)=>`'${String(value).replaceAll("'","''")}'`;
const scalar=(db,sql)=>Number(db.prepare(sql).get()?.c||0);

function formatCount(value){
  return Number(value||0).toLocaleString('en-US');
}
function formatDuration(ms){
  if(!Number.isFinite(ms)||ms<0)return '—';
  if(ms<1000)return `${Math.round(ms)}ms`;
  const seconds=Math.round(ms/1000);
  if(seconds<60)return `${seconds}s`;
  const minutes=Math.floor(seconds/60);
  const rest=seconds%60;
  if(minutes<60)return `${minutes}m ${String(rest).padStart(2,'0')}s`;
  const hours=Math.floor(minutes/60);
  return `${hours}h ${String(minutes%60).padStart(2,'0')}m`;
}
async function fileState(path){
  const info=await stat(path);
  return {path,bytes:Number(info.size),mtime_ms:Math.trunc(Number(info.mtimeMs))};
}
function databaseMeta(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    try{
      return Object.fromEntries(
        db.prepare('SELECT key,value FROM meta ORDER BY key').all().map((row)=>[row.key,row.value])
      );
    }catch{
      return {};
    }
  }finally{
    db.close();
  }
}
async function sourceSnapshot(generatedReport,marker){
  const entries={};
  for(const [key,path] of Object.entries(paths)){
    entries[key]={
      ...(await fileState(path)),
      meta:databaseMeta(path),
    };
  }
  return {
    inputs:entries,
    generated_acceptance:{
      parity_report_fingerprint:generatedReport.semanticFingerprint,
      acceptance_report_fingerprint:String(marker.marker?.acceptance_report_fingerprint||''),
      marker_status:marker.marker?.status||null,
    },
  };
}
function attach(db,path){
  db.exec(`ATTACH DATABASE ${quoteSql(path)} AS src;`);
}
function detach(db){
  db.exec('DETACH DATABASE src;');
}
function openWork(path){
  const db=new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA temp_store=MEMORY;
    PRAGMA cache_size=-262144;
    PRAGMA mmap_size=1073741824;
    PRAGMA busy_timeout=5000;
  `);
  createServingV1Storage(db);
  return db;
}
function upsertMeta(db,key,value){
  db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key,String(value));
}
function stageRow(db,name){
  return db.prepare('SELECT * FROM build_stage WHERE stage=?').get(name)||null;
}
function printStatus(db,label){
  const meta=Object.fromEntries(db.prepare('SELECT key,value FROM meta ORDER BY key').all().map((row)=>[row.key,row.value]));
  const stages=db.prepare('SELECT * FROM build_stage ORDER BY stage').all().map((row)=>({
    stage:row.stage,
    status:row.status,
    processed_rows:Number(row.processed_rows||0),
    source_rows:Number(row.source_rows||0),
    last_source_id:Number(row.last_source_id||0),
    max_source_id:Number(row.max_source_id||0),
    error:row.error||null,
  }));
  console.log(JSON.stringify({
    schema:'rhymelab-serving-v1-status',
    label,
    meta,
    stages,
    summary:servingV1Summary(db),
    invariants:servingV1InvariantReport(db),
  },null,2));
}
function checkSqlite(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    const rows=db.prepare('PRAGMA quick_check').all();
    return rows.length===1&&String(rows[0]?.quick_check||'').toLocaleLowerCase('en-US')==='ok';
  }finally{
    db.close();
  }
}

for(const [label,path] of Object.entries(paths)){
  if(!existsSync(path))throw new Error(`Required ${label} database missing: ${path}`);
}
if(!existsSync(generatedReportPath))throw new Error('Generated Base-Parity report missing: '+generatedReportPath);
if(!existsSync(generatedMarkerPath))throw new Error('Generated runtime acceptance marker missing: '+generatedMarkerPath);

const generatedReport=readGeneratedOptinReport(generatedReportPath,{
  writerPath:paths.deGenerated,
  englishPath:paths.enGenerated,
  phrasePath:paths.phraseGenerated,
  entityPath:paths.entityGenerated,
});
if(!generatedReport.accepted){
  throw new Error('Generated Base-Parity contract rejected: '+generatedReport.reason);
}
const generatedMarker=readGeneratedOptinAcceptanceMarker(
  generatedMarkerPath,
  generatedReport.semanticFingerprint,
);
if(!generatedMarker.accepted){
  throw new Error('Generated runtime acceptance marker rejected: '+generatedMarker.reason);
}

const snapshot=await sourceSnapshot(generatedReport,generatedMarker);
const sourceFingerprint=hash(safeJson(snapshot));
const stages=servingV1StageDefinitions(paths);

async function inspectPlan(){
  const probe=new DatabaseSync(':memory:');
  const rows=[];
  try{
    for(const stage of stages){
      attach(probe,stage.path);
      try{
        rows.push({
          stage:stage.name,
          label:stage.label,
          layer:stage.layer,
          domain:stage.domain,
          source_rows:Number(probe.prepare(stage.totalSql).get()?.c||0),
          max_source_id:Number(probe.prepare(stage.maxSql).get()?.m||0),
          source:stage.path,
        });
      }finally{
        detach(probe);
      }
    }
  }finally{
    probe.close();
  }
  return rows;
}

if(mode==='plan'){
  const plan=await inspectPlan();
  console.log(JSON.stringify({
    schema:'rhymelab-serving-v1-plan',
    policy:SERVING_V1_POLICY,
    build_policy:SERVING_V1_BUILD_POLICY,
    build_revision:SERVING_V1_BUILD_REVISION,
    source_fingerprint:sourceFingerprint,
    batch_size:batchSize,
    output:outputPath,
    work:workPath,
    report:reportPath,
    stages:plan,
    total_source_rows:plan.reduce((sum,row)=>sum+row.source_rows,0),
    safety:{
      canonical_databases_mutated:false,
      generated_requires_accepted_runtime_marker:true,
      core_never_displaced_by_generated:true,
      resume_default:true,
      atomic_final_promotion:true,
    },
  },null,2));
  process.exit(0);
}

if(mode==='status'){
  const candidate=existsSync(workPath)?workPath:existsSync(outputPath)?outputPath:null;
  if(!candidate)throw new Error('No Serving v1 work/output database exists yet.');
  const db=new DatabaseSync(candidate,{readOnly:true});
  try{printStatus(db,candidate===workPath?'building':'promoted');}
  finally{db.close();}
  process.exit(0);
}

if(reset){
  for(const path of [workPath,workPath+'-wal',workPath+'-shm']){
    await rm(path,{force:true});
  }
  console.log('[serving-v1] reset incomplete work database; promoted output was left untouched.');
}
if(existsSync(outputPath)&&!replace){
  throw new Error(
    'Promoted Serving v1 output already exists: '+outputPath+
    '. Refusing to replace it implicitly. Use --replace for a new atomic promotion.'
  );
}

await mkdir(dirname(workPath),{recursive:true});
await mkdir(dirname(outputPath),{recursive:true});
await mkdir(dirname(reportPath),{recursive:true});

const db=openWork(workPath);
let promoted=false;
let finalReport=null;
try{
  const existingSchema=db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value||null;
  const existingFingerprint=db.prepare("SELECT value FROM meta WHERE key='source_fingerprint'").get()?.value||null;
  const existingBuildRevision=db.prepare("SELECT value FROM meta WHERE key='build_revision'").get()?.value||null;
  if(existingSchema&&existingSchema!==SERVING_V1_SCHEMA){
    throw new Error('Unexpected Serving work schema: '+existingSchema);
  }
  if(existingBuildRevision&&existingBuildRevision!==SERVING_V1_BUILD_REVISION){
    throw new Error(
      'Serving build logic changed since this work database was created. '+
      'Refusing to mix build revisions. Run with --reset to discard only the incomplete work database.'
    );
  }
  if(existingFingerprint&&existingFingerprint!==sourceFingerprint){
    throw new Error(
      'Serving input fingerprint changed since this work database was created. '+
      'Refusing to mix revisions. Run again with --reset to discard only the incomplete work database.'
    );
  }

  const createdAt=db.prepare("SELECT value FROM meta WHERE key='created_at'").get()?.value||now();
  for(const [key,value] of Object.entries({
    schema:SERVING_V1_SCHEMA,
    policy:SERVING_V1_POLICY,
    build_policy:SERVING_V1_BUILD_POLICY,
    build_revision:SERVING_V1_BUILD_REVISION,
    status:'building',
    created_at:createdAt,
    updated_at:now(),
    source_fingerprint:sourceFingerprint,
    source_snapshot_json:safeJson(snapshot),
    generated_parity_report_fingerprint:generatedReport.semanticFingerprint,
    generated_acceptance_report_fingerprint:String(generatedMarker.marker?.acceptance_report_fingerprint||''),
  })) upsertMeta(db,key,value);

  const plan=await inspectPlan();
  const totalSourceRows=plan.reduce((sum,row)=>sum+row.source_rows,0);
  console.log(
    '[serving-v1] source rows='+formatCount(totalSourceRows)+
    ' · batch='+formatCount(batchSize)+
    ' · resume='+(existingFingerprint?'yes':'new')
  );

  const buildStarted=performance.now();
  let completedBefore=0;
  for(const stage of stages){
    const planRow=plan.find((row)=>row.stage===stage.name);
    const sourceRows=Number(planRow?.source_rows||0);
    const maxSourceId=Number(planRow?.max_source_id||0);
    let state=stageRow(db,stage.name);

    if(state?.status==='complete'){
      completedBefore+=sourceRows;
      console.log(
        `[serving-v1] ✓ ${stage.label} already complete · ${formatCount(sourceRows)} source rows`
      );
      continue;
    }

    if(!state){
      db.prepare(`
        INSERT INTO build_stage(
          stage,status,source_rows,max_source_id,last_source_id,processed_rows,
          started_at,updated_at,completed_at,error
        ) VALUES(?,?,?,?,0,0,?,?,NULL,NULL)
      `).run(stage.name,'running',sourceRows,maxSourceId,now(),now());
      state=stageRow(db,stage.name);
    }else{
      db.prepare(`
        UPDATE build_stage
        SET status='running',source_rows=?,max_source_id=?,updated_at=?,error=NULL
        WHERE stage=?
      `).run(sourceRows,maxSourceId,now(),stage.name);
      state=stageRow(db,stage.name);
    }

    let last=Number(state.last_source_id||0);
    let processed=Number(state.processed_rows||0);
    const stageStarted=performance.now();
    const processedAtStart=processed;
    let batchNumber=0;

    console.log(
      `[serving-v1] → ${stage.label} · ${formatCount(processed)}/${formatCount(sourceRows)} resumed`
    );
    attach(db,stage.path);
    try{
      while(last<maxSourceId){
        const upper=Math.min(maxSourceId,last+batchSize);
        const rangeRows=Number(db.prepare(stage.rangeCountSql(last,upper)).get()?.c||0);
        const batchStarted=performance.now();

        db.exec('BEGIN IMMEDIATE;');
        try{
          if(rangeRows>0){
            for(const sql of stage.statements(last,upper))db.exec(sql);
          }
          processed+=rangeRows;
          db.prepare(`
            UPDATE build_stage
            SET last_source_id=?,processed_rows=?,updated_at=?,error=NULL
            WHERE stage=?
          `).run(upper,processed,now(),stage.name);
          upsertMeta(db,'updated_at',now());
          db.exec('COMMIT;');
        }catch(error){
          try{db.exec('ROLLBACK;')}catch{}
          db.prepare(`
            UPDATE build_stage SET status='error',updated_at=?,error=? WHERE stage=?
          `).run(now(),String(error?.stack||error),stage.name);
          throw error;
        }

        last=upper;
        batchNumber+=1;
        if(batchNumber%progressEvery===0||last>=maxSourceId){
          const elapsed=performance.now()-stageStarted;
          const advanced=Math.max(0,processed-processedAtStart);
          const rowsPerSecond=elapsed>0?advanced/(elapsed/1000):0;
          const remaining=Math.max(0,sourceRows-processed);
          const eta=rowsPerSecond>0?(remaining/rowsPerSecond)*1000:NaN;
          const pct=sourceRows>0?Math.min(100,(processed/sourceRows)*100):100;
          console.log(
            `[serving-v1]   ${stage.name} ${pct.toFixed(1)}% · `+
            `${formatCount(processed)}/${formatCount(sourceRows)} · `+
            `${formatCount(Math.round(rowsPerSecond))} rows/s · `+
            `batch ${formatDuration(performance.now()-batchStarted)} · ETA ${formatDuration(eta)}`
          );
        }

        if(stopRequested){
          db.prepare(`
            UPDATE build_stage SET status='paused',updated_at=?,error=NULL WHERE stage=?
          `).run(now(),stage.name);
          console.error('[serving-v1] paused safely after committed batch; rerun the same command to resume.');
          break;
        }
      }
    }finally{
      detach(db);
    }

    if(stopRequested)break;

    db.prepare(`
      UPDATE build_stage
      SET status='complete',last_source_id=?,processed_rows=?,updated_at=?,completed_at=?,error=NULL
      WHERE stage=?
    `).run(maxSourceId,processed,now(),now(),stage.name);
    completedBefore+=sourceRows;

    const current=servingV1Summary(db);
    console.log(
      `[serving-v1] ✓ ${stage.label} · ${formatCount(processed)} source rows · `+
      `${formatCount(current.surfaces)} surfaces · ${formatCount(current.pronunciations)} pronunciations · `+
      `${formatDuration(performance.now()-stageStarted)}`
    );

    if(pauseAfterStage===stage.name){
      manualPauseRequested=true;
      upsertMeta(db,'status','paused');
      upsertMeta(db,'updated_at',now());
      console.log('[serving-v1] manual checkpoint pause after '+stage.name+'; rerun the same build command to resume.');
      break;
    }
  }

  if(stopRequested){
    upsertMeta(db,'status','paused');
    upsertMeta(db,'updated_at',now());
    process.exitCode=130;
  }else if(manualPauseRequested){
    // Intentional owner/dev checkpoint. Work DB stays in place and all completed stages are reusable.
  }else{
    console.log('[serving-v1] finalizing indexes/statistics…');
    normalizeServingV1Availability(db);
    db.exec('ANALYZE; PRAGMA optimize;');
    const integrity=db.prepare('PRAGMA quick_check').all();
    if(integrity.length!==1||String(integrity[0]?.quick_check||'').toLocaleLowerCase('en-US')!=='ok'){
      throw new Error('Serving v1 quick_check failed: '+JSON.stringify(integrity));
    }

    const summary=servingV1Summary(db);
    const invariants=servingV1InvariantReport(db);
    if(!invariants.ok){
      throw new Error('Serving v1 invariant failure: '+JSON.stringify(invariants));
    }
    const inputPronunciationRows=plan.reduce((sum,row)=>sum+row.source_rows,0);
    const completedAt=now();
    const semanticPayload={
      schema:SERVING_V1_SCHEMA,
      policy:SERVING_V1_POLICY,
      source_fingerprint:sourceFingerprint,
      summary,
      invariants,
    };
    const semanticFingerprint=hash(safeJson(semanticPayload));

    for(const [key,value] of Object.entries({
      status:'complete',
      updated_at:completedAt,
      completed_at:completedAt,
      semantic_fingerprint:semanticFingerprint,
      summary_json:safeJson(summary),
      invariants_json:safeJson(invariants),
    })) upsertMeta(db,key,value);

    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

    finalReport={
      schema:'rhymelab-serving-v1-build-report',
      status:'ok',
      policy:SERVING_V1_POLICY,
      build_policy:SERVING_V1_BUILD_POLICY,
      build_revision:SERVING_V1_BUILD_REVISION,
      created_at:createdAt,
      completed_at:completedAt,
      source_fingerprint:sourceFingerprint,
      semantic_fingerprint:semanticFingerprint,
      generated_acceptance:{
        parity_report_fingerprint:generatedReport.semanticFingerprint,
        acceptance_report_fingerprint:String(generatedMarker.marker?.acceptance_report_fingerprint||''),
      },
      output:outputPath,
      work:workPath,
      batch_size:batchSize,
      duration_ms:Number((performance.now()-buildStarted).toFixed(1)),
      input_pronunciation_rows:inputPronunciationRows,
      deduplicated_pronunciation_rows:Math.max(0,inputPronunciationRows-summary.pronunciations),
      dedupe_ratio:inputPronunciationRows>0
        ?Number((1-summary.pronunciations/inputPronunciationRows).toFixed(6))
        :0,
      stages:db.prepare('SELECT * FROM build_stage ORDER BY stage').all(),
      summary,
      invariants,
      safety:{
        core_never_displaced_by_generated:invariants.core_never_displaced_by_generated,
        canonical_databases_mutated:false,
        current_runtime_rewired:false,
        promotion_atomic:true,
        source_of_truth_databases_preserved:true,
      },
    };
  }
}finally{
  db.close();
}

if(stopRequested){
  console.error('[serving-v1] work database retained at: '+workPath);
  process.exit(130);
}
if(manualPauseRequested){
  console.log('[serving-v1] work database retained at: '+workPath);
  process.exit(0);
}

if(!finalReport)throw new Error('Serving v1 build finished without a final report.');

const reportTmp=reportPath+'.tmp';
await writeFile(reportTmp,JSON.stringify(finalReport,null,2)+'\n','utf8');

if(existsSync(outputPath)){
  if(!replace)throw new Error('Output appeared during build; refusing implicit replacement: '+outputPath);
  await rm(previousPath,{force:true});
  await rename(outputPath,previousPath);
  try{
    await rename(workPath,outputPath);
  }catch(error){
    await rename(previousPath,outputPath);
    throw error;
  }
}else{
  await rename(workPath,outputPath);
}

if(!checkSqlite(outputPath)){
  if(existsSync(previousPath)){
    await rm(outputPath,{force:true});
    await rename(previousPath,outputPath);
  }
  throw new Error('Promoted Serving v1 database failed quick_check; previous output restored when available.');
}

await rename(reportTmp,reportPath);
promoted=true;

console.log(JSON.stringify({
  schema:finalReport.schema,
  status:finalReport.status,
  semantic_fingerprint:finalReport.semantic_fingerprint,
  source_fingerprint:finalReport.source_fingerprint,
  input_pronunciation_rows:finalReport.input_pronunciation_rows,
  deduplicated_pronunciation_rows:finalReport.deduplicated_pronunciation_rows,
  dedupe_ratio:finalReport.dedupe_ratio,
  surfaces:finalReport.summary.surfaces,
  pronunciations:finalReport.summary.pronunciations,
  pronunciation_layer_overlap:finalReport.summary.pronunciationLayerOverlap,
  generated_only_pronunciations:finalReport.summary.generatedOnlyPronunciations,
  multi_role_surfaces:finalReport.summary.multiRoleSurfaces,
  same_name_multiple_entities:finalReport.summary.sameNameMultipleEntities,
  multi_pronunciation_surfaces:finalReport.summary.multiPronunciationSurfaces,
  core_never_displaced_by_generated:finalReport.invariants.core_never_displaced_by_generated,
  output:outputPath,
  previous:existsSync(previousPath)?previousPath:null,
  report:reportPath,
  promoted,
},null,2));
