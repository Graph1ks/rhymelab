import {existsSync,statSync} from 'node:fs';
import {mkdir,rename,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

import {
  DISTRIBUTION_BUILD_POLICY,
  DISTRIBUTION_COPY_STAGES,
  DISTRIBUTION_EDITIONS,
  DISTRIBUTION_RANK_POLICY,
  assertDistributionSourceReady,
  attachReadOnlyDatabase,
  copyDistributionStage,
  createRankTable,
  createRankTables,
  createTargetSchema,
  distributionIntegrityReport,
  distributionMetaFingerprint,
  dropDistributionBuildStorage,
  editionContract,
  normalizeEditionAvailability,
  populateDistributionSelection,
  rankPlan,
  readMeta,
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
function formatBytes(bytes){
  const n=Number(bytes||0);
  if(n<1024)return n+' B';
  if(n<1024**2)return (n/1024).toFixed(1)+' KiB';
  if(n<1024**3)return (n/1024**2).toFixed(1)+' MiB';
  return (n/1024**3).toFixed(2)+' GiB';
}
function formatDuration(ms){
  const total=Math.max(0,Math.floor(Number(ms||0)/1000));
  const h=Math.floor(total/3600);
  const m=Math.floor((total%3600)/60);
  const s=total%60;
  return h?String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')
    :String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
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
  return attachReadOnlyDatabase(db,source,{alias:'src'});
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
function planDbPath(baseDir){
  return resolve(baseDir,'.distribution-plan-v1.sqlite');
}
function planReportPath(baseDir){
  return resolve(baseDir,'distribution-plan-v1.json');
}
function stageLine({
  scope,
  current=null,
  total=null,
  label,
  status='RUN',
  started=null,
  path=null,
  extra=null,
}){
  const progress=current&&total?` [${current}/${total} ${Math.floor(current/total*100)}%]`:'';
  const elapsed=started?` · elapsed ${formatDuration(Date.now()-started)}`:'';
  const size=path&&existsSync(path)?` · file ${formatBytes(fileSize(path))}`:'';
  const suffix=extra?` · ${extra}`:'';
  console.log(`[distribution] ${scope}${progress} ${status} · ${label}${elapsed}${size}${suffix}`);
}
function selectionProgress(scope,started,path,event){
  const label=event.step||event.status||'selection';
  const data={...event};
  const current=Number.isFinite(Number(event.current))?Number(event.current):null;
  const total=Number.isFinite(Number(event.total))?Number(event.total):null;
  delete data.phase;
  delete data.edition;
  delete data.step;
  delete data.status;
  delete data.summary;
  delete data.current;
  delete data.total;
  stageLine({
    scope,current,total,label:'selection/'+label,
    status:String(event.status||'RUN').replaceAll('_','-').toUpperCase(),
    started,path,
    extra:Object.keys(data).length?JSON.stringify(data):null,
  });
}
function rankProgress(scope,started,path,event){
  const data={...event};
  delete data.phase;
  delete data.status;
  stageLine({
    scope,label:`rank/${event.layer}`,status:String(event.status||'RUN').toUpperCase(),
    started,path,
    extra:event.rows!=null?`${event.rows.toLocaleString('en-US')} rows`:null,
  });
}
function copyProgress(scope,started,path,event){
  stageLine({
    scope,
    current:event.index,
    total:event.total,
    label:`${event.stage}/${event.table}`,
    status:event.status==='skip_existing'?'RESUME-SKIP':String(event.status||'RUN').toUpperCase(),
    started,path,
    extra:event.rows!=null?`${Number(event.rows).toLocaleString('en-US')} rows`:null,
  });
}
function integrityProgress(scope,started,path,phase,event){
  const extras=[];
  if(event.rows!=null)extras.push(Number(event.rows).toLocaleString('en-US')+' rows');
  if(event.violations!=null)extras.push(Number(event.violations).toLocaleString('en-US')+' violations');
  if(event.result!=null)extras.push('result='+String(event.result));
  if(event.ok!=null)extras.push('ok='+String(event.ok));
  if(event.duration_ms!=null)extras.push('step '+formatDuration(Number(event.duration_ms)));
  if(event.reason!=null)extras.push(String(event.reason));
  stageLine({
    scope,
    label:phase+'/'+String(event.step||'integrity'),
    status:String(event.status||'RUN').replaceAll('_','-').toUpperCase(),
    started,path,
    extra:extras.length?extras.join(' · '):null,
  });
}
function databaseSpaceStats(db){
  const pageSize=Number(db.prepare('PRAGMA page_size').get()?.page_size||0);
  const pageCount=Number(db.prepare('PRAGMA page_count').get()?.page_count||0);
  const freeCount=Number(db.prepare('PRAGMA freelist_count').get()?.freelist_count||0);
  return {
    page_size:pageSize,
    page_count:pageCount,
    free_pages:freeCount,
    allocated_bytes:pageSize*pageCount,
    reclaimable_bytes:pageSize*freeCount,
    live_bytes:pageSize*Math.max(0,pageCount-freeCount),
  };
}
function createPlanState(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS distribution_plan_meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS distribution_plan_stage(
      stage TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      completed_at TEXT,
      detail_json TEXT
    );
  `);
}
function planMeta(db,key){
  return db.prepare('SELECT value FROM distribution_plan_meta WHERE key=?').get(key)?.value??null;
}
function putPlanMeta(db,key,value){
  db.prepare(`
    INSERT INTO distribution_plan_meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key,String(value));
}
function planStage(db,stage){
  return db.prepare('SELECT * FROM distribution_plan_stage WHERE stage=?').get(stage)||null;
}
function completePlanStage(db,stage,detail=null){
  db.prepare(`
    INSERT INTO distribution_plan_stage(stage,status,completed_at,detail_json)
    VALUES(?,'complete',datetime('now'),?)
    ON CONFLICT(stage) DO UPDATE SET
      status='complete',completed_at=excluded.completed_at,detail_json=excluded.detail_json
  `).run(stage,detail==null?null:JSON.stringify(detail));
}
function buildStage(db,stage){
  try{return db.prepare('SELECT * FROM distribution_build_stage WHERE stage=?').get(stage)||null;}
  catch{return null;}
}
function completeBuildStage(db,stage,detail=null){
  db.prepare(`
    INSERT INTO distribution_build_stage(stage,status,completed_at,detail_json)
    VALUES(?,'complete',datetime('now'),?)
    ON CONFLICT(stage) DO UPDATE SET
      status='complete',completed_at=excluded.completed_at,detail_json=excluded.detail_json
  `).run(stage,detail==null?null:JSON.stringify(detail));
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
  const path=planDbPath(baseDir);
  const reportPath=planReportPath(baseDir);
  if(reset){
    await rm(path,{force:true});
    await rm(path+'-wal',{force:true});
    await rm(path+'-shm',{force:true});
    await rm(reportPath,{force:true});
  }
  const resumed=existsSync(path);
  const started=Date.now();
  stageLine({
    scope:'PLAN',label:resumed?'checkpoint found; inspecting resume state':'new resumable plan',
    status:resumed?'RESUME':'START',started,path,
    extra:'checkpoint '+path,
  });

  const db=new DatabaseSync(path);
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
  const planStages=[
    'rank_core','rank_generated','selection_lite','selection_standard','selection_full','report',
  ];

  try{
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=FILE;');
    createPlanState(db);
    const stored=planMeta(db,'source_fingerprint');
    if(stored&&stored!==ctx.fingerprint){
      throw new Error(
        'Distribution plan source changed. Re-run with --reset. stored='+stored
        +' current='+ctx.fingerprint
      );
    }
    putPlanMeta(db,'source_fingerprint',ctx.fingerprint);
    putPlanMeta(db,'source_path',sourcePath);
    attachSource(db,sourcePath);

    for(const [i,layer] of ['core','generated'].entries()){
      const stage='rank_'+layer;
      if(planStage(db,stage)?.status==='complete'){
        stageLine({
          scope:'PLAN',current:i+1,total:planStages.length,label:stage,status:'RESUME-SKIP',
          started,path,extra:'checkpoint complete',
        });
      }else{
        stageLine({
          scope:'PLAN',current:i+1,total:planStages.length,label:stage,status:'START',
          started,path,extra:'safe resume point is after this stage',
        });
        createRankTable(db,{
          alias:'src',layer,replace:true,
          onProgress:(event)=>rankProgress('PLAN',started,path,event),
        });
        const rows=Number(db.prepare(
          'SELECT COUNT(*) c FROM '+(layer==='core'?'_dist_core_rank':'_dist_generated_rank')
        ).get()?.c||0);
        completePlanStage(db,stage,{rows});
        stageLine({
          scope:'PLAN',current:i+1,total:planStages.length,label:stage,status:'DONE',
          started,path,extra:rows.toLocaleString('en-US')+' rows checkpointed',
        });
      }
    }

    report.tiers=rankPlan(db);
    const editionNames=Object.keys(DISTRIBUTION_EDITIONS);
    for(let i=0;i<editionNames.length;i+=1){
      const edition=editionNames[i];
      const stage='selection_'+edition;
      const stageIndex=i+3;
      const checkpoint=planStage(db,stage);
      if(checkpoint?.status==='complete'&&checkpoint.detail_json){
        report.closure[edition]=JSON.parse(checkpoint.detail_json);
        stageLine({
          scope:'PLAN',current:stageIndex,total:planStages.length,label:stage,status:'RESUME-SKIP',
          started,path,extra:'selection summary restored from checkpoint',
        });
        continue;
      }
      stageLine({
        scope:'PLAN',current:stageIndex,total:planStages.length,label:stage,status:'START',
        started,path,extra:'restarts only this edition if interrupted',
      });
      const summary=populateDistributionSelection(db,{
        edition,alias:'src',
        onProgress:(event)=>selectionProgress('PLAN/'+edition.toUpperCase(),started,path,event),
      });
      report.closure[edition]=summary;
      completePlanStage(db,stage,summary);
      stageLine({
        scope:'PLAN',current:stageIndex,total:planStages.length,label:stage,status:'DONE',
        started,path,
        extra:`budget ${summary.budget.entries.toLocaleString('en-US')}/${summary.budget.target.toLocaleString('en-US')} · words ${summary.budget.words.toLocaleString('en-US')} · phrases ${summary.budget.phrases.toLocaleString('en-US')} · entities ${summary.budget.entities.toLocaleString('en-US')}`,
      });
    }

    await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
    completePlanStage(db,'report',{path:reportPath});
    stageLine({
      scope:'PLAN',current:6,total:6,label:'report',status:'DONE',started,path,
      extra:'report '+reportPath,
    });
  }finally{
    detachSource(db);
    db.close();
  }

  console.log('');
  console.log('[distribution] PLAN COMPLETE · '+formatDuration(Date.now()-started));
  console.log('[distribution] checkpoint kept: '+path);
  console.log('[distribution] report: '+reportPath);
  console.log('[distribution] rerun same command = resume/instant checkpoint reuse; --reset = intentional restart');
}

function statusReport(ctx){
  const planPath=planDbPath(baseDir);
  const plan={
    path:planPath,
    exists:existsSync(planPath),
    size_bytes:fileSize(planPath),
    size_human:formatBytes(fileSize(planPath)),
    report:planReportPath(baseDir),
    report_exists:existsSync(planReportPath(baseDir)),
    stages:[],
  };
  if(plan.exists){
    const db=new DatabaseSync(planPath,{readOnly:true});
    try{
      try{plan.stages=db.prepare(
        'SELECT stage,status,completed_at,detail_json FROM distribution_plan_stage ORDER BY rowid'
      ).all();}catch{}
      try{plan.source_fingerprint=planMeta(db,'source_fingerprint');}catch{}
    }finally{db.close();}
  }

  const rows={};
  for(const edition of Object.keys(DISTRIBUTION_EDITIONS)){
    const output=outputPath(baseDir,edition);
    const work=workPath(baseDir,edition);
    rows[edition]={
      output,
      output_exists:existsSync(output),
      output_size_bytes:fileSize(output),
      output_size_human:formatBytes(fileSize(output)),
      work,
      work_exists:existsSync(work),
      work_size_bytes:fileSize(work),
      work_size_human:formatBytes(fileSize(work)),
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
            'SELECT * FROM distribution_build_stage ORDER BY rowid'
          ).all();}catch{}
        }
      }finally{db.close();}
    }
  }

  console.log('[distribution] STATUS');
  console.log('  Master: '+sourcePath+' · '+formatBytes(ctx.size_bytes));
  console.log('  Plan:   '+(plan.exists?'RESUMABLE '+plan.size_human:'not started'));
  for(const row of plan.stages){
    console.log('    '+(row.status==='complete'?'✓':'…')+' '+row.stage+' '+(row.completed_at||''));
  }
  for(const [edition,row] of Object.entries(rows)){
    const state=row.output_exists?'COMPLETE':row.work_exists?'RESUMABLE':'not started';
    const size=row.output_exists?row.output_size_human:row.work_size_human;
    console.log('  '+edition.padEnd(8)+' '+state.padEnd(10)+' '+size);
    for(const stage of row.stages||[]){
      console.log('    '+(stage.status==='complete'?'✓':'…')+' '+stage.stage+' '+(stage.completed_at||''));
    }
  }
  console.log('');
  console.log(JSON.stringify({
    schema:'rhymelab-distribution-status-v2',
    source:{path:sourcePath,fingerprint:ctx.fingerprint,size_bytes:ctx.size_bytes},
    plan,
    editions:rows,
  },null,2));
}

async function buildEdition(ctx,edition){
  const contract=editionContract(edition);
  const output=outputPath(baseDir,edition);
  const work=workPath(baseDir,edition);
  const reportFile=reportPath(baseDir,edition);
  const backup=output+'.previous.sqlite';
  const started=Date.now();

  if(reset){
    await rm(work,{force:true});
    await rm(work+'-wal',{force:true});
    await rm(work+'-shm',{force:true});
  }
  if(existsSync(output)&&!replace){
    throw new Error(output+' already exists. Use --replace only intentionally.');
  }

  const resumed=existsSync(work);
  stageLine({
    scope:edition.toUpperCase(),
    label:resumed?'work database found; resuming':'new build',
    status:resumed?'RESUME':'START',
    started,path:work,
    extra:'work '+work,
  });

  const db=new DatabaseSync(work);
  let schema;
  let selection;
  let sourceIndexes;

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

    const existingStatus=db.prepare(
      "SELECT value FROM meta WHERE key='distribution_status'"
    ).get()?.value||null;

    if(existingStatus!=='ready_to_finalize'){
      putMeta(db,'distribution_status','building');

      const selectionCheckpoint=buildStage(db,'selection');
      if(selectionCheckpoint?.status==='complete'){
        const raw=db.prepare(
          "SELECT value FROM meta WHERE key='distribution_selection_json'"
        ).get()?.value;
        if(!raw)throw new Error('Selection checkpoint exists without distribution_selection_json.');
        selection=JSON.parse(raw);
        stageLine({
          scope:edition.toUpperCase(),current:1,total:8,label:'rank + selection',
          status:'RESUME-SKIP',started,path:work,
          extra:`words ${selection.budget.words.toLocaleString('en-US')} · phrases ${selection.budget.phrases.toLocaleString('en-US')} · entities ${selection.budget.entities.toLocaleString('en-US')}`,
        });
      }else{
        stageLine({
          scope:edition.toUpperCase(),current:1,total:8,label:'rank + selection',
          status:'START',started,path:work,extra:'checkpoint after selection',
        });
        createRankTables(db,{
          alias:'src',replace:true,
          onProgress:(event)=>rankProgress(edition.toUpperCase(),started,work,event),
        });
        selection=populateDistributionSelection(db,{
          edition,alias:'src',
          onProgress:(event)=>selectionProgress(edition.toUpperCase(),started,work,event),
        });
        putMeta(db,'distribution_selection_json',JSON.stringify(selection));
        completeBuildStage(db,'selection',selection);
        stageLine({
          scope:edition.toUpperCase(),current:1,total:8,label:'rank + selection',
          status:'DONE',started,path:work,
          extra:`words ${selection.budget.words.toLocaleString('en-US')} · phrases ${selection.budget.phrases.toLocaleString('en-US')} · entities ${selection.budget.entities.toLocaleString('en-US')}`,
        });
      }

      for(let i=0;i<DISTRIBUTION_COPY_STAGES.length;i+=1){
        const stage=DISTRIBUTION_COPY_STAGES[i];
        const checkpoint=buildStage(db,stage.name);
        if(checkpoint?.status==='complete'){
          stageLine({
            scope:edition.toUpperCase(),current:i+2,total:8,label:'copy/'+stage.name,
            status:'RESUME-SKIP',started,path:work,extra:'checkpoint complete',
          });
          continue;
        }
        stageLine({
          scope:edition.toUpperCase(),current:i+2,total:8,label:'copy/'+stage.name,
          status:'START',started,path:work,extra:'transactional; interrupted stage rolls back cleanly',
        });
        copyDistributionStage(db,stage,{
          alias:'src',
          onProgress:(event)=>copyProgress(edition.toUpperCase(),started,work,event),
        });
        stageLine({
          scope:edition.toUpperCase(),current:i+2,total:8,label:'copy/'+stage.name,
          status:'DONE',started,path:work,
        });
      }

      normalizeEditionAvailability(db,edition);
      writeDistributionManifest(db,{edition,sourceMeta,selection});

      if(buildStage(db,'indexes')?.status==='complete'){
        stageLine({
          scope:edition.toUpperCase(),current:6,total:8,label:'indexes',
          status:'RESUME-SKIP',started,path:work,
        });
      }else{
        stageLine({
          scope:edition.toUpperCase(),current:6,total:8,label:'indexes',
          status:'START',started,path:work,extra:sourceIndexes.length+' indexes',
        });
        for(let i=0;i<sourceIndexes.length;i+=1){
          const row=sourceIndexes[i];
          stageLine({
            scope:edition.toUpperCase(),current:i+1,total:sourceIndexes.length,
            label:'index/'+row.name,status:'RUN',started,path:work,
          });
          db.exec(String(row.sql));
        }
        completeBuildStage(db,'indexes',{count:sourceIndexes.length});
        stageLine({
          scope:edition.toUpperCase(),current:6,total:8,label:'indexes',
          status:'DONE',started,path:work,
        });
      }

      stageLine({
        scope:edition.toUpperCase(),current:7,total:8,label:'planner optimize + integrity',
        status:'START',started,path:work,
        extra:'bounded PRAGMA optimize; no full ANALYZE',
      });

      const optimizeStarted=Date.now();
      stageLine({
        scope:edition.toUpperCase(),label:'materialize/pragma_optimize',
        status:'START',started,path:work,
      });
      const optimizeRows=db.prepare('PRAGMA main.optimize').all();
      stageLine({
        scope:edition.toUpperCase(),label:'materialize/pragma_optimize',
        status:'DONE',started,path:work,
        extra:`${optimizeRows.length} actions · step ${formatDuration(Date.now()-optimizeStarted)}`,
      });

      let integrity=distributionIntegrityReport(db,edition,{
        deep:false,
        onProgress:(event)=>integrityProgress(
          edition.toUpperCase(),started,work,'materialize/integrity',event
        ),
      });
      if(!integrity.ok){
        throw new Error(
          'Distribution integrity failed for '+edition+': '+JSON.stringify(integrity),
        );
      }
      putMeta(db,'distribution_features_json',JSON.stringify(contract.features));
      putMeta(db,'distribution_status','ready_to_finalize');
      putMeta(db,'distribution_materialized_at',now());
      completeBuildStage(db,'materialized',{integrity});
      stageLine({
        scope:edition.toUpperCase(),current:7,total:8,label:'planner optimize + integrity',
        status:'DONE',started,path:work,extra:'safe finalization resume point written',
      });

      // From here onward the target data is complete. Staging/rank tables can be
      // dropped without destroying resumability because meta says ready_to_finalize.
      dropDistributionBuildStorage(db);
    }else{
      const raw=db.prepare(
        "SELECT value FROM meta WHERE key='distribution_selection_json'"
      ).get()?.value;
      selection=raw?JSON.parse(raw):null;
      stageLine({
        scope:edition.toUpperCase(),current:7,total:8,label:'materialized payload',
        status:'RESUME-SKIP',started,path:work,
        extra:'ready_to_finalize checkpoint found; ranking/copy/index work will not repeat',
      });
    }

    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    detachSource(db);

    stageLine({
      scope:edition.toUpperCase(),current:8,total:8,
      label:skipVacuum?'final integrity':'VACUUM + final integrity',
      status:'START',started,path:work,
      extra:skipVacuum?'VACUUM explicitly skipped':'restartable finalization stage',
    });

    if(!skipVacuum){
      const beforeVacuum=databaseSpaceStats(db);
      stageLine({
        scope:edition.toUpperCase(),label:'finalize/vacuum',
        status:'START',started,path:work,
        extra:`allocated ${formatBytes(beforeVacuum.allocated_bytes)} · reclaimable ${formatBytes(beforeVacuum.reclaimable_bytes)} · live floor ${formatBytes(beforeVacuum.live_bytes)} · SQLite exposes no percentage callback`,
      });
      const vacuumStarted=Date.now();
      db.exec('VACUUM;');
      const afterVacuum=databaseSpaceStats(db);
      stageLine({
        scope:edition.toUpperCase(),label:'finalize/vacuum',
        status:'DONE',started,path:work,
        extra:`step ${formatDuration(Date.now()-vacuumStarted)} · allocated ${formatBytes(afterVacuum.allocated_bytes)}`,
      });

      const finalOptimizeStarted=Date.now();
      stageLine({
        scope:edition.toUpperCase(),label:'finalize/pragma_optimize',
        status:'START',started,path:work,
      });
      const finalOptimizeRows=db.prepare('PRAGMA main.optimize').all();
      stageLine({
        scope:edition.toUpperCase(),label:'finalize/pragma_optimize',
        status:'DONE',started,path:work,
        extra:`${finalOptimizeRows.length} actions · step ${formatDuration(Date.now()-finalOptimizeStarted)}`,
      });
    }

    const integrity=distributionIntegrityReport(db,edition,{
      onProgress:(event)=>integrityProgress(
        edition.toUpperCase(),started,work,'finalize/integrity',event
      ),
    });
    if(!integrity.ok){
      throw new Error(
        'Post-finalization distribution integrity failed for '+edition+': '
        +JSON.stringify(integrity),
      );
    }
    putMeta(db,'distribution_status','complete');
    putMeta(db,'distribution_completed_at',now());

    const report={
      schema:'rhymelab-distribution-build-report-v2',
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
      resumable:true,
    };
    await writeFile(reportFile,JSON.stringify(report,null,2)+'\n','utf8');
    stageLine({
      scope:edition.toUpperCase(),current:8,total:8,label:'finalization',
      status:'DONE',started,path:work,extra:'report '+reportFile,
    });
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
    stageLine({
      scope:edition.toUpperCase(),label:'promoted/integrity',
      status:'START',started,path:output,
    });
    const integrity=distributionIntegrityReport(verify,edition,{
      onProgress:(event)=>integrityProgress(
        edition.toUpperCase(),started,output,'promoted/integrity',event
      ),
    });
    if(!integrity.ok)throw new Error(
      'Promoted distribution integrity failed for '+edition+': '+JSON.stringify(integrity),
    );
    stageLine({
      scope:edition.toUpperCase(),label:'promoted/integrity',
      status:'DONE',started,path:output,
    });
  }finally{verify.close();}

  console.log('');
  console.log('[distribution] '+edition.toUpperCase()+' COMPLETE · '+formatDuration(Date.now()-started)
    +' · '+formatBytes(fileSize(output)));
  console.log('[distribution] output: '+output);
  console.log('[distribution] report: '+reportFile);
}

const ctx=sourceContext();

console.log('[distribution] Master: '+sourcePath+' · '+formatBytes(ctx.size_bytes));
console.log('[distribution] Mode: '+mode+(mode==='build'?' · edition '+requested:''));
console.log('[distribution] Resumability: ON · rerun the same command after interruption; use --reset only for intentional restart');
console.log('');

if(mode==='plan'){
  await buildPlan(ctx);
}else if(mode==='status'){
  statusReport(ctx);
}else{
  for(const edition of editions)await buildEdition(ctx,edition);
  if(requested==='all'){
    stageLine({scope:'ALL',label:'hard nesting verification',status:'START'});
    const nesting=verifyDistributionNestingFiles({
      litePath:outputPath(baseDir,'lite'),
      standardPath:outputPath(baseDir,'standard'),
      fullPath:outputPath(baseDir,'full'),
    });
    const nestingReport=resolve(baseDir,'distribution-nesting-report-v1.json');
    await writeFile(nestingReport,JSON.stringify(nesting,null,2)+'\n','utf8');
    stageLine({
      scope:'ALL',label:'hard nesting verification',status:'DONE',
      extra:'LITE ⊂ STANDARD ⊂ FULL · '+nestingReport,
    });
  }
}
