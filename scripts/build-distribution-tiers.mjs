import {existsSync,statSync} from 'node:fs';
import {mkdir,rename,rm,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

import {
  DISTRIBUTION_BUILD_POLICY,
  DISTRIBUTION_COPY_STAGES,
  DISTRIBUTION_EDITIONS,
  DISTRIBUTION_RANK_POLICY,
  assertDistributionSourceReady,
  copyDistributionStage,
  createRankTables,
  createTargetSchema,
  distributionIntegrityReport,
  distributionMetaFingerprint,
  distributionSelectionSummary,
  dropDistributionBuildStorage,
  editionContract,
  normalizeEditionAvailability,
  populateDistributionSelection,
  rankPlan,
  readMeta,
  sourceSchema,
  writeDistributionManifest,
} from './distribution-materializer-core.mjs';
import {verifyDistributionNestingFiles} from './distribution-nesting-core.mjs';

function argValue(name,fallback=null){
  const index=process.argv.indexOf(name);
  if(index<0)return fallback;
  const value=process.argv[index+1];
  if(value==null||value.startsWith('--'))throw new Error(name+' requires a value');
  return value;
}
function has(name){return process.argv.includes(name);}
function now(){return new Date().toISOString();}
function fileSize(path){return existsSync(path)?statSync(path).size:0;}
function ensureEdition(value){
  if(value==='all')return Object.keys(DISTRIBUTION_EDITIONS);
  editionContract(value);
  return [value];
}
function putMeta(db,key,value){
  db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key,String(value));
}
function attachSource(db,source){
  db.prepare('ATTACH DATABASE ? AS src').run(source);
}
function detachSource(db){
  try{db.exec('DETACH DATABASE src;');}catch{}
}
function outputPath(baseDir,edition){
  return resolve(baseDir,`rhymelab-serving-v1-${edition}.sqlite`);
}
function workPath(baseDir,edition){
  return resolve(baseDir,`rhymelab-serving-v1-${edition}.building.sqlite`);
}
function reportPath(baseDir,edition){
  return resolve(baseDir,`rhymelab-serving-v1-${edition}-report.json`);
}

const mode=has('--plan')?'plan':has('--status')?'status':'build';
const sourcePath=resolve(argValue(
  '--db',
  process.env.RHYMELAB_SERVING_V1_DB||'data/local/rhymelab-serving-v1.sqlite',
));
const baseDir=resolve(argValue('--output-dir','data/local/distribution'));
const requested=String(argValue('--edition','all')).toLowerCase();
const editions=ensureEdition(requested);
const replace=has('--replace');
const reset=has('--reset');
const skipVacuum=has('--skip-vacuum');

if(!existsSync(sourcePath))throw new Error('Serving-v1 Master missing: '+sourcePath);
await mkdir(baseDir,{recursive:true});

function sourceContext(){
  const db=new DatabaseSync(sourcePath,{readOnly:true});
  try{
    const meta=readMeta(db);
    assertDistributionSourceReady(meta);
    return {
      meta,
      fingerprint:distributionMetaFingerprint(meta),
      size_bytes:fileSize(sourcePath),
    };
  }finally{db.close();}
}

async function buildPlan(ctx){
  const planDbPath=resolve(baseDir,'.distribution-plan-v1.sqlite');
  await rm(planDbPath,{force:true});
  const db=new DatabaseSync(planDbPath);
  const report={
    schema:'rhymelab-distribution-plan-v1',
    generated_at:now(),
    source:{
      path:sourcePath,
      size_bytes:ctx.size_bytes,
      fingerprint:ctx.fingerprint,
      runtime_semantic_fingerprint:ctx.meta.runtime_semantic_fingerprint,
      product_semantic_fingerprint:ctx.meta.product_adapter_semantic_fingerprint,
    },
    rank_policy:DISTRIBUTION_RANK_POLICY,
    build_policy:DISTRIBUTION_BUILD_POLICY,
    tiers:null,
    closure:{},
  };
  try{
    db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE;');
    attachSource(db,sourcePath);
    createRankTables(db,{alias:'src',replace:true});
    report.tiers=rankPlan(db);
    for(const edition of Object.keys(DISTRIBUTION_EDITIONS)){
      report.closure[edition]=populateDistributionSelection(db,{edition,alias:'src'});
    }
  }finally{
    detachSource(db);
    db.close();
    await rm(planDbPath,{force:true});
  }
  const path=resolve(baseDir,'distribution-plan-v1.json');
  await writeFile(path,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({...report,report:path},null,2));
}

function statusReport(ctx){
  const rows={};
  for(const edition of Object.keys(DISTRIBUTION_EDITIONS)){
    const output=outputPath(baseDir,edition);
    const work=workPath(baseDir,edition);
    rows[edition]={
      output,
      output_exists:existsSync(output),
      output_size_bytes:fileSize(output),
      work,
      work_exists:existsSync(work),
      work_size_bytes:fileSize(work),
      report:reportPath(baseDir,edition),
      report_exists:existsSync(reportPath(baseDir,edition)),
    };
    const candidate=existsSync(work)?work:existsSync(output)?output:null;
    if(candidate){
      const db=new DatabaseSync(candidate,{readOnly:true});
      try{
        rows[edition].meta=Object.fromEntries(
          db.prepare(`
            SELECT key,value FROM meta
            WHERE key LIKE 'distribution_%'
            ORDER BY key
          `).all().map((row)=>[row.key,row.value]),
        );
        if(existsSync(work)){
          try{rows[edition].stages=db.prepare(
            'SELECT * FROM distribution_build_stage ORDER BY stage'
          ).all();}catch{}
        }
      }finally{db.close();}
    }
  }
  console.log(JSON.stringify({
    schema:'rhymelab-distribution-status-v1',
    source:{path:sourcePath,fingerprint:ctx.fingerprint,size_bytes:ctx.size_bytes},
    editions:rows,
  },null,2));
}

async function buildEdition(ctx,edition){
  const contract=editionContract(edition);
  const output=outputPath(baseDir,edition);
  const work=workPath(baseDir,edition);
  const reportFile=reportPath(baseDir,edition);
  const backup=output+'.previous.sqlite';

  if(reset){
    await rm(work,{force:true});
    await rm(work+'-wal',{force:true});
    await rm(work+'-shm',{force:true});
  }
  if(existsSync(output)&&!replace){
    throw new Error(output+' already exists. Use --replace only intentionally.');
  }

  const newWork=!existsSync(work);
  const db=new DatabaseSync(work);
  let schema;
  let selection;
  let sourceIndexes;
  const started=Date.now();

  try{
    db.exec('PRAGMA foreign_keys=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=FILE;');
    attachSource(db,sourcePath);
    const sourceMeta=readMeta(db,{alias:'src'});
    assertDistributionSourceReady(sourceMeta);

    schema=createTargetSchema(db,{alias:'src'});
    sourceIndexes=schema.indexes;
    const storedFingerprint=db.prepare(
      "SELECT value FROM meta WHERE key='distribution_source_fingerprint'"
    ).get()?.value||null;
    if(storedFingerprint&&storedFingerprint!==ctx.fingerprint){
      throw new Error(
        'Distribution work source changed. Use --reset. stored='+storedFingerprint
        +' current='+ctx.fingerprint
      );
    }
    putMeta(db,'distribution_source_fingerprint',ctx.fingerprint);
    putMeta(db,'distribution_build_policy',DISTRIBUTION_BUILD_POLICY);
    putMeta(db,'distribution_rank_policy',DISTRIBUTION_RANK_POLICY);
    putMeta(db,'distribution_edition',edition);
    putMeta(db,'distribution_status','building');

    console.log('[distribution] '+edition+' · rank/selection');
    createRankTables(db,{alias:'src',replace:true});
    selection=populateDistributionSelection(db,{edition,alias:'src'});
    putMeta(db,'distribution_selection_json',JSON.stringify(selection));

    for(const stage of DISTRIBUTION_COPY_STAGES){
      const completed=db.prepare(
        'SELECT status FROM distribution_build_stage WHERE stage=?'
      ).get(stage.name)?.status;
      if(completed==='complete'){
        console.log('[distribution] '+edition+' ✓ '+stage.name+' resumed');
        continue;
      }
      console.log('[distribution] '+edition+' → '+stage.name);
      copyDistributionStage(db,stage,{alias:'src'});
      console.log('[distribution] '+edition+' ✓ '+stage.name);
    }

    normalizeEditionAvailability(db,edition);
    writeDistributionManifest(db,{edition,sourceMeta,selection});

    // Explicit indexes are created only after bulk copy. Autoindexes from
    // UNIQUE/PRIMARY KEY constraints already exist with the table schema.
    console.log('[distribution] '+edition+' → indexes');
    for(const row of sourceIndexes){
      db.exec(String(row.sql));
    }

    db.exec('ANALYZE; PRAGMA optimize;');
    let integrity=distributionIntegrityReport(db,edition);
    if(!integrity.ok){
      throw new Error(
        'Distribution integrity failed for '+edition+': '+JSON.stringify(integrity),
      );
    }

    putMeta(db,'distribution_status','complete');
    putMeta(db,'distribution_completed_at',now());
    putMeta(db,'distribution_features_json',JSON.stringify(contract.features));

    dropDistributionBuildStorage(db);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    detachSource(db);

    if(!skipVacuum){
      console.log('[distribution] '+edition+' → VACUUM');
      db.exec('VACUUM;');
      db.exec('ANALYZE; PRAGMA optimize;');
    }

    integrity=distributionIntegrityReport(db,edition);
    if(!integrity.ok){
      throw new Error(
        'Post-VACUUM distribution integrity failed for '+edition+': '
        +JSON.stringify(integrity),
      );
    }

    const report={
      schema:'rhymelab-distribution-build-report-v1',
      status:'ok',
      edition,
      features:contract.features,
      rank_policy:DISTRIBUTION_RANK_POLICY,
      build_policy:DISTRIBUTION_BUILD_POLICY,
      source:{
        path:sourcePath,
        size_bytes:ctx.size_bytes,
        fingerprint:ctx.fingerprint,
        runtime_semantic_fingerprint:ctx.meta.runtime_semantic_fingerprint,
        product_semantic_fingerprint:ctx.meta.product_adapter_semantic_fingerprint,
      },
      selection,
      integrity,
      output,
      output_size_bytes:fileSize(work),
      duration_ms:Date.now()-started,
      vacuumed:!skipVacuum,
    };
    await writeFile(reportFile,JSON.stringify(report,null,2)+'\n','utf8');
  }finally{
    detachSource(db);
    db.close();
  }

  if(existsSync(output)){
    if(!replace)throw new Error('Output appeared during build: '+output);
    await rm(backup,{force:true});
    await rename(output,backup);
  }
  await rename(work,output);

  const verify=new DatabaseSync(output,{readOnly:true});
  try{
    const meta=readMeta(verify);
    if(meta.distribution_status!=='complete'||meta.distribution_edition!==edition){
      throw new Error('Promoted distribution metadata verification failed for '+edition);
    }
    const integrity=distributionIntegrityReport(verify,edition);
    if(!integrity.ok)throw new Error(
      'Promoted distribution integrity failed for '+edition+': '+JSON.stringify(integrity),
    );
  }finally{verify.close();}

  console.log(JSON.stringify({
    schema:'rhymelab-distribution-build-result-v1',
    status:'ok',
    edition,
    output,
    size_bytes:fileSize(output),
    report:reportFile,
    selection,
  },null,2));
}

const ctx=sourceContext();

if(mode==='plan'){
  await buildPlan(ctx);
}else if(mode==='status'){
  statusReport(ctx);
}else{
  for(const edition of editions)await buildEdition(ctx,edition);
  if(requested==='all'){
    const nesting=verifyDistributionNestingFiles({
      litePath:outputPath(baseDir,'lite'),
      standardPath:outputPath(baseDir,'standard'),
      fullPath:outputPath(baseDir,'full'),
    });
    const nestingReport=resolve(baseDir,'distribution-nesting-report-v1.json');
    await writeFile(nestingReport,JSON.stringify(nesting,null,2)+'\n','utf8');
    console.log(JSON.stringify({...nesting,report:nestingReport},null,2));
  }
}
