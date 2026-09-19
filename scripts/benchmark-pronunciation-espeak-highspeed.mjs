#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import {
  inspectEspeakQueryPronunciation,
  inspectEspeakQueryPronunciationAsync,
} from './query-pronunciation-espeak-adapter.mjs';
import { mapConcurrent } from './pronunciation-espeak-parallel.mjs';
import { PRONUNCIATION_ADMISSION_POLICY } from './pronunciation-backfill-admission-core.mjs';
import { percentile } from './pronunciation-generator-benchmark-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}
function intArg(flag,fallback,{min=1,max=100000}={}){
  const value=Number.parseInt(String(argValue(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(value)?value:fallback));
}
function parseWorkers(value){
  const result=[...new Set(
    String(value||'1,2,4,8,16,32')
      .split(',')
      .map((part)=>Number.parseInt(part.trim(),10))
      .filter((n)=>Number.isInteger(n)&&n>=1&&n<=128),
  )].sort((a,b)=>a-b);
  if(!result.length)throw new Error('No valid --workers-list values.');
  return result;
}
function hashJson(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const workPath=resolve(argValue('--work','data/local/pronunciation-backfill-v2.sqlite'));
const outPath=resolve(argValue('--out','data/local/pronunciation-espeak-highspeed-v1.json'));
const command=argValue('--command',process.env.RHYMELAB_ESPEAK_COMMAND||null);
const cases=intArg('--cases',256,{min:32,max:5000});
const workerLevels=parseWorkers(argValue('--workers-list','1,2,4,8,16,32'));

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
    throw new Error('Admission gate must be complete with policy '+PRONUNCIATION_ADMISSION_POLICY+' before the high-speed test.');
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
  const sample=[
    ...query.all('de',perLanguage),
    ...query.all('en',perLanguage),
  ].slice(0,cases);
  if(sample.length<Math.min(cases,pendingTotal)){
    throw new Error('Unable to build requested admitted throughput sample. selected='+sample.length);
  }

  const preflight=inspectEspeakQueryPronunciation(sample[0].surface,sample[0].language,{command});
  if(preflight.status==='unavailable'){
    throw new Error('eSpeak-NG unavailable. Pass --command or RHYMELAB_ESPEAK_COMMAND.');
  }
  const resolvedCommand=preflight.engineCommand||command||null;
  console.log(
    '[highspeed] engine='+(preflight.engineVersion||preflight.engine||'eSpeak-NG')
    +' · command='+(resolvedCommand||'auto-detect')
    +' · sample='+sample.length
    +' · admitted_total='+admittedTotal.toLocaleString('en-US')
    +' · pending='+pendingTotal.toLocaleString('en-US')
  );

  const runs=[];
  for(const workers of workerLevels){
    const latencies=[];
    let accepted=0,rejected=0,unavailable=0,errors=0;
    const started=performance.now();
    const outcomes=await mapConcurrent(sample,workers,async(row)=>{
      const itemStarted=performance.now();
      try{
        const inspected=await inspectEspeakQueryPronunciationAsync(
          row.surface,row.language,{command:resolvedCommand},
        );
        return {status:inspected.status,elapsed:performance.now()-itemStarted};
      }catch(error){
        return {status:'error',elapsed:performance.now()-itemStarted,error:String(error?.message||error)};
      }
    });
    const elapsedMs=performance.now()-started;

    for(const outcome of outcomes){
      latencies.push(outcome.elapsed);
      if(outcome.status==='accepted')accepted+=1;
      else if(outcome.status==='rejected')rejected+=1;
      else if(outcome.status==='unavailable')unavailable+=1;
      else errors+=1;
    }
    const casesPerSecond=sample.length/Math.max(.001,elapsedMs/1000);
    const projectedHours=pendingTotal/casesPerSecond/3600;
    const run={
      workers,
      cases:sample.length,
      accepted,
      rejected,
      unavailable,
      errors,
      elapsed_ms:Number(elapsedMs.toFixed(3)),
      cases_per_second:Number(casesPerSecond.toFixed(3)),
      latency_ms:{
        p50:percentile(latencies,.5),
        p95:percentile(latencies,.95),
        max:percentile(latencies,1),
      },
      projected_pending_hours:Number(projectedHours.toFixed(3)),
    };
    runs.push(run);
    console.log(
      '[highspeed] workers='+workers
      +' · '+run.cases_per_second.toFixed(1)+'/s'
      +' · p50='+run.latency_ms.p50.toFixed(1)+'ms'
      +' · p95='+run.latency_ms.p95.toFixed(1)+'ms'
      +' · errors='+(errors+unavailable)
      +' · projected='+run.projected_pending_hours.toFixed(2)+'h'
    );
  }

  const baseline=runs[0]?.cases_per_second||1;
  for(const run of runs){
    run.speedup_vs_first=Number((run.cases_per_second/baseline).toFixed(3));
  }
  const fastest=[...runs].sort((a,b)=>b.cases_per_second-a.cases_per_second)[0]||null;
  const report={
    schema:'rhymelab-pronunciation-espeak-highspeed-v1',
    purpose:'Read-only throughput ladder for parallel eSpeak process workers on admitted real backfill rows.',
    work_database:workPath,
    admission_policy:PRONUNCIATION_ADMISSION_POLICY,
    admitted_total:admittedTotal,
    admitted_pending:pendingTotal,
    sample_cases:sample.length,
    sample_languages:Object.fromEntries(
      ['de','en'].map((language)=>[language,sample.filter((row)=>row.language===language).length]),
    ),
    engine:{
      command:resolvedCommand,
      version:preflight.engineVersion||null,
    },
    worker_levels:workerLevels,
    runs,
    fastest_workers:fastest?.workers||null,
    fastest_cases_per_second:fastest?.cases_per_second||0,
    fastest_projected_pending_hours:fastest?.projected_pending_hours||null,
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
    fastest_workers:report.fastest_workers,
    fastest_cases_per_second:report.fastest_cases_per_second,
    fastest_projected_pending_hours:report.fastest_projected_pending_hours,
    report:outPath,
    semantic_fingerprint:report.semantic_fingerprint,
  },null,2));
}finally{
  db.close();
}
