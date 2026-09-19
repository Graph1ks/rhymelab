#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { inspectEspeakQueryPronunciation } from './query-pronunciation-espeak-adapter.mjs';
import { mapEspeakBatchWorkers } from './pronunciation-espeak-batch.mjs';
import { PronunciationIpaAnalyzerPool } from './pronunciation-ipa-analyzer-pool.mjs';
import { PRONUNCIATION_ADMISSION_POLICY } from './pronunciation-backfill-admission-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}
function intArg(flag,fallback,{min=1,max=100000}={}){
  const value=Number.parseInt(String(argValue(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(value)?value:fallback));
}
function parseBatchSizes(value){
  const result=[...new Set(
    String(value||'64,128,256,512')
      .split(',')
      .map((part)=>Number.parseInt(part.trim(),10))
      .filter((n)=>Number.isInteger(n)&&n>=16&&n<=5000),
  )].sort((a,b)=>a-b);
  if(!result.length)throw new Error('No valid --batch-sizes values.');
  return result;
}
function hashJson(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function inc(object,key){ object[key]=(object[key]||0)+1; }

const workPath=resolve(argValue('--work','data/local/pronunciation-backfill-v2.sqlite'));
const outPath=resolve(argValue('--out','data/local/pronunciation-espeak-highspeed-v2.json'));
const command=argValue('--command',process.env.RHYMELAB_ESPEAK_COMMAND||null);
const cases=intArg('--cases',2048,{min:128,max:20000});
const workers=intArg('--workers',4,{min:1,max:32});
const analyzerWorkers=intArg('--analyzer-workers',4,{min:0,max:16});
const batchSizes=parseBatchSizes(argValue('--batch-sizes','64,128,256,512'));

if(!existsSync(workPath))throw new Error('Backfill work database missing: '+workPath);
await mkdir(dirname(outPath),{recursive:true});

const db=new DatabaseSync(workPath,{readOnly:true});
db.exec('PRAGMA query_only=ON;');

try{
  const workSchema=db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value||null;
  const admissionComplete=db.prepare("SELECT value FROM meta WHERE key='admission_complete'").get()?.value||'0';
  const admissionPolicy=db.prepare("SELECT value FROM meta WHERE key='admission_policy'").get()?.value||null;
  if(workSchema!=='rhymelab-pronunciation-backfill-v2'){
    throw new Error('Unexpected work schema: '+String(workSchema||'missing'));
  }
  if(admissionComplete!=='1'||admissionPolicy!==PRONUNCIATION_ADMISSION_POLICY){
    throw new Error('Admission gate must be complete before the high-speed batch test.');
  }

  const admittedTotal=Number(db.prepare(
    "SELECT COUNT(*) AS c FROM admission WHERE decision='admit'"
  ).get()?.c||0);
  const pendingTotal=Number(db.prepare([
    'SELECT COUNT(*) AS c FROM work_item w JOIN admission a USING(item_id)',
    "WHERE a.decision='admit' AND w.espeak_status='pending'",
  ].join(' ')).get()?.c||0);
  if(!pendingTotal)throw new Error('No admitted pending eSpeak rows remain.');

  const perLanguage=Math.ceil(cases/2);
  const query=db.prepare([
    'SELECT w.item_id,w.language,w.surface,w.normalized,a.shape',
    'FROM work_item w JOIN admission a USING(item_id)',
    "WHERE a.decision='admit' AND w.espeak_status='pending' AND w.language=?",
    'ORDER BY w.item_id LIMIT ?',
  ].join(' '));
  const sampleByLanguage={
    de:query.all('de',perLanguage),
    en:query.all('en',perLanguage),
  };
  const sample=[...sampleByLanguage.de,...sampleByLanguage.en].slice(0,cases);
  sampleByLanguage.de=sample.filter((row)=>row.language==='de');
  sampleByLanguage.en=sample.filter((row)=>row.language==='en');
  if(sample.length<Math.min(cases,pendingTotal)){
    throw new Error('Unable to build requested admitted throughput sample. selected='+sample.length);
  }

  const preflight=inspectEspeakQueryPronunciation(sample[0].surface,sample[0].language,{command});
  if(preflight.status==='unavailable'){
    throw new Error('eSpeak-NG unavailable. Pass --command or RHYMELAB_ESPEAK_COMMAND.');
  }
  const resolvedCommand=preflight.engineCommand||command||null;
  console.log(
    '[highspeed-v2] engine='+(preflight.engineVersion||preflight.engine||'eSpeak-NG')
    +' · command='+(resolvedCommand||'auto-detect')
    +' · sample='+sample.length
    +' · workers='+workers
    +' · analyzer_workers='+analyzerWorkers
    +' · admitted_total='+admittedTotal.toLocaleString('en-US')
    +' · pending='+pendingTotal.toLocaleString('en-US')
  );

  const analyzerPool=analyzerWorkers>0
    ?new PronunciationIpaAnalyzerPool({workers:analyzerWorkers})
    :null;
  if(analyzerPool){
    await Promise.all(Array.from({length:analyzerWorkers},()=>analyzerPool.analyze({
      surface:sample[0].surface,
      language:sample[0].language,
      rawIpa:preflight.rawIpa,
      engineCommand:resolvedCommand,
      engineVersion:preflight.engineVersion||null,
    })));
  }
  const runs=[];
  try{
  for(const batchSize of batchSizes){
    const statsBefore=analyzerPool?.stats()||null;
    const started=performance.now();
    const outcomes=[];
    for(const language of ['de','en']){
      const rows=sampleByLanguage[language];
      if(!rows.length)continue;
      outcomes.push(...await mapEspeakBatchWorkers(rows,language,{
        command:resolvedCommand,
        engineVersion:preflight.engineVersion||null,
        workers,
        batchSize,
        analyzerPool,
      }));
    }
    const elapsedMs=performance.now()-started;

    let accepted=0,rejected=0,errors=0;
    const modes={};
    for(const outcome of outcomes){
      inc(modes,outcome.mode||'unknown');
      if(outcome.error)errors+=1;
      else if(outcome.inspected?.status==='accepted')accepted+=1;
      else if(outcome.inspected?.status==='rejected')rejected+=1;
      else errors+=1;
    }
    const casesPerSecond=sample.length/Math.max(.001,elapsedMs/1000);
    const stable=errors===0;
    const statsAfter=analyzerPool?.stats()||null;
    const analyzerDelta=statsAfter&&statsBefore?{
      submitted:statsAfter.submitted-statsBefore.submitted,
      completed:statsAfter.completed-statsBefore.completed,
      failed:statsAfter.failed-statsBefore.failed,
      worker_restarts:statsAfter.worker_restarts-statsBefore.worker_restarts,
      analyzer_elapsed_ms:Number((statsAfter.analyzer_elapsed_ms-statsBefore.analyzer_elapsed_ms).toFixed(3)),
      queue_elapsed_ms:Number((statsAfter.queue_elapsed_ms-statsBefore.queue_elapsed_ms).toFixed(3)),
    }:null;
    const run={
      workers,
      analyzer_workers:analyzerWorkers,
      analyzer_mode:analyzerPool?'worker_threads':'main_thread',
      analyzer:analyzerDelta,
      batch_size:batchSize,
      cases:sample.length,
      accepted,
      rejected,
      errors,
      stable,
      process_modes:modes,
      elapsed_ms:Number(elapsedMs.toFixed(3)),
      cases_per_second:Number(casesPerSecond.toFixed(3)),
      projected_pending_hours:Number((pendingTotal/casesPerSecond/3600).toFixed(3)),
    };
    runs.push(run);
    console.log(
      '[highspeed-v2] workers='+workers
      +' · batch='+batchSize
      +' · '+run.cases_per_second.toFixed(1)+'/s'
      +' · analyzer='+(analyzerPool?analyzerWorkers+'w':'main')
      +' · errors='+errors
      +' · projected='+run.projected_pending_hours.toFixed(2)+'h'
      +' · modes='+JSON.stringify(modes)
    );
  }

  }finally{
    await analyzerPool?.close();
  }

  const stableRuns=runs.filter((run)=>run.stable);
  const fastest=[...(stableRuns.length?stableRuns:runs)]
    .sort((a,b)=>b.cases_per_second-a.cases_per_second)[0]||null;
  const report={
    schema:'rhymelab-pronunciation-espeak-highspeed-v2',
    purpose:'Read-only four-worker eSpeak batch-size ladder on admitted real backfill rows.',
    work_database:workPath,
    admission_policy:PRONUNCIATION_ADMISSION_POLICY,
    admitted_total:admittedTotal,
    admitted_pending:pendingTotal,
    sample_cases:sample.length,
    sample_languages:Object.fromEntries(
      ['de','en'].map((language)=>[language,sampleByLanguage[language].length]),
    ),
    engine:{
      command:resolvedCommand,
      version:preflight.engineVersion||null,
    },
    workers,
    analyzer_workers:analyzerWorkers,
    analyzer_mode:analyzerPool?'worker_threads':'main_thread',
    batch_sizes:batchSizes,
    runs,
    fastest_stable_batch_size:fastest?.stable?fastest.batch_size:null,
    fastest_stable_cases_per_second:fastest?.stable?fastest.cases_per_second:0,
    fastest_stable_projected_pending_hours:fastest?.stable?fastest.projected_pending_hours:null,
    safeguards:{
      work_database_mutated:false,
      canonical_databases_mutated:false,
      benchmark_only:true,
    },
  };
  report.semantic_fingerprint=hashJson(report);
  await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({
    schema:report.schema,
    workers:report.workers,
    analyzer_workers:report.analyzer_workers,
    analyzer_mode:report.analyzer_mode,
    fastest_stable_batch_size:report.fastest_stable_batch_size,
    fastest_stable_cases_per_second:report.fastest_stable_cases_per_second,
    fastest_stable_projected_pending_hours:report.fastest_stable_projected_pending_hours,
    report:outPath,
    semantic_fingerprint:report.semantic_fingerprint,
  },null,2));
}finally{
  db.close();
}
