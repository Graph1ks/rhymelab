#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {stat} from 'node:fs/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {cpus,platform,release,totalmem} from 'node:os';
import {dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';

import {
  openServingV1ProductRuntime,
  servingV1ProductRuntimeState,
} from '../src/serving-v1-product-runtime.mjs';
import {createServingV1ParallelWriterRuntime} from '../src/unified-writer-parallel.mjs';
import {
  SERVING_V1_REPORT_CASES,
  caseTiming,
  groupTiming,
  measurementOrder,
  renderServingV1BenchmarkMarkdown,
  stageTiming,
  timingSummary,
} from './serving-v1-report-benchmark-core.mjs';

const args=process.argv.slice(2);
const value=(flag,fallback=null)=>{
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
};
const has=(flag)=>args.includes(flag);
const intArg=(flag,fallback,min,max)=>{
  const parsed=Number.parseInt(String(value(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(parsed)?parsed:fallback));
};
const numberArg=(flag,fallback)=>{
  const parsed=Number(value(flag,fallback));
  return Number.isFinite(parsed)?parsed:fallback;
};
const round=(number,digits=3)=>Number(Number(number).toFixed(digits));

const servingPath=resolve(value('--serving','data/local/distribution/rhymelab-serving-v1-standard.sqlite'));
const jsonPath=resolve(value(
  '--json',
  'data/local/benchmark/rhymelab-serving-v1-report-benchmark.json',
));
const markdownPath=resolve(value(
  '--markdown',
  'data/local/benchmark/rhymelab-serving-v1-report-benchmark.md',
));
const repeats=intArg('--repeats',7,3,50);
const warmupRounds=intArg('--warmup-rounds',1,0,10);
const targetP50=numberArg('--target-p50-ms',100);
const targetP95=numberArg('--target-p95-ms',250);
const targetMax=numberArg('--target-max-ms',1500);
const generatedOverlay=!has('--core');
const datasetMode=generatedOverlay?'all':'core';

const searchOptions=(spec)=>({
  language:spec.language,
  resultLanguage:spec.language,
  scope:'all',
  type:'all',
  wordLimit:250,
  wordPoolLimit:800,
  entityLimit:100,
  entityPoolLimit:192,
  profileStages:true,
});

function semanticFingerprint(result){
  if(!result)return null;
  return createHash('sha256')
    .update(JSON.stringify(result,(key,current)=>
      key==='performanceProfile'||key==='runtimeTiming'?undefined:current
    ))
    .digest('hex');
}

function resultCount(result){
  return {
    words:Number(result?.counts?.words||0),
    phrases:Number(result?.counts?.phrases||0),
    entities:Number(result?.counts?.entities||0),
    total:Number(result?.counts?.total||0),
  };
}

function caseKey(row){
  return `${row.language}\u001f${row.input}`;
}

function benchmarkIntegrity(rows){
  const byCase=new Map();
  for(const row of rows){
    const key=caseKey(row);
    if(!byCase.has(key))byCase.set(key,[]);
    byCase.get(key).push(row);
  }
  const inconsistent=[];
  const badStatus=[];
  for(const values of byCase.values()){
    const fingerprints=[...new Set(values.map((row)=>row.result_fingerprint))];
    if(fingerprints.length!==1){
      inconsistent.push({
        language:values[0].language,
        input:values[0].input,
        fingerprints,
      });
    }
    for(const row of values){
      if(row.status!=='ok'){
        badStatus.push({
          language:row.language,
          input:row.input,
          repeat:row.repeat,
          status:row.status,
        });
      }
    }
  }
  return {
    ok:inconsistent.length===0&&badStatus.length===0,
    deterministic_case_results:inconsistent.length===0,
    all_search_statuses_ok:badStatus.length===0,
    inconsistent_cases:inconsistent,
    bad_status_rows:badStatus,
  };
}

const metadataRuntime=openServingV1ProductRuntime(servingPath);
let databaseState;
try{
  databaseState=servingV1ProductRuntimeState(metadataRuntime.allDb);
  if(!databaseState.available){
    throw new Error(
      'Serving-v1 Product runtime unavailable: '+String(databaseState.reason||'unknown')
    );
  }
}finally{
  metadataRuntime.close();
}

const databaseFile=await stat(servingPath);
const cpuList=cpus();
const environment={
  node:process.version,
  platform:platform(),
  platform_release:release(),
  arch:process.arch,
  cpu_model:cpuList[0]?.model||null,
  logical_cpus:cpuList.length,
  total_memory_bytes:Number(totalmem()),
};

const parallel=createServingV1ParallelWriterRuntime(servingPath);
const workerStart=performance.now();
try{
  await parallel.ready();
  const workerReadyMs=performance.now()-workerStart;

  const warmupStarted=performance.now();
  let warmupSamples=0;
  for(let roundIndex=0;roundIndex<warmupRounds;roundIndex+=1){
    for(const spec of measurementOrder(SERVING_V1_REPORT_CASES,-1-roundIndex)){
      await parallel.search(
        spec.input,
        {...searchOptions(spec),profileStages:false},
        {generatedOverlay},
      );
      warmupSamples+=1;
    }
  }
  const warmupMs=performance.now()-warmupStarted;

  const rows=[];
  const benchmarkStarted=performance.now();
  for(let repeat=1;repeat<=repeats;repeat+=1){
    const ordered=measurementOrder(SERVING_V1_REPORT_CASES,repeat);
    console.log(
      `[serving-report] measured round ${repeat}/${repeats} · ${ordered.length} cases`
    );
    for(const spec of ordered){
      const started=performance.now();
      const result=await parallel.search(
        spec.input,
        searchOptions(spec),
        {generatedOverlay},
      );
      const elapsed=performance.now()-started;
      const row={
        input:spec.input,
        language:spec.language,
        repeat,
        total_ms:round(elapsed),
        status:result?.status||null,
        result_fingerprint:semanticFingerprint(result),
        counts:resultCount(result),
        stages_ms:result?.performanceProfile?.stages_ms||{},
        performance_counters:result?.performanceProfile?.counters||{},
      };
      rows.push(row);
      console.log(
        `[serving-report] ${spec.language} · ${spec.input} · ${elapsed.toFixed(1)}ms`
      );
    }
  }
  const measuredWallMs=performance.now()-benchmarkStarted;

  const timing=timingSummary(rows.map((row)=>row.total_ms));
  const gates={
    p50_target:Number(timing.p50_ms)<=targetP50,
    p95_target:Number(timing.p95_ms)<=targetP95,
    max_target:Number(timing.max_ms)<=targetMax,
  };
  const integrity=benchmarkIntegrity(rows);
  const latencyOk=Object.values(gates).every(Boolean);
  const report={
    schema:'rhymelab-serving-v1-performance-report-v1',
    status:!integrity.ok
      ?'invalid'
      :latencyOk?'accepted':'needs_optimization',
    completed_at:new Date().toISOString(),
    execution:'persistent-worker-threads-v1-steady-state',
    dataset_mode:datasetMode,
    case_count:SERVING_V1_REPORT_CASES.length,
    repeats,
    warmup_rounds:warmupRounds,
    targets_ms:{p50:targetP50,p95:targetP95,max:targetMax},
    startup:{
      worker_ready_ms:round(workerReadyMs),
      warmup_samples:warmupSamples,
      warmup_ms:round(warmupMs),
      measured_wall_ms:round(measuredWallMs),
    },
    timing,
    by_language:groupTiming(rows,(row)=>row.language),
    by_case:caseTiming(rows),
    stages:stageTiming(rows),
    gates,
    integrity,
    database:{
      path:servingPath,
      bytes:Number(databaseFile.size),
      mtime_ms:Math.trunc(Number(databaseFile.mtimeMs)),
      runtime_semantic_fingerprint:databaseState.runtimeSemanticFingerprint||null,
      product_semantic_fingerprint:databaseState.productSemanticFingerprint||null,
      product_revision:databaseState.productRevision||null,
      identity_revision:databaseState.identityRevision||null,
    },
    workers:parallel.health(),
    environment,
    methodology:{
      workload:'20 fixed representative DE/EN/both unified Writer queries',
      query_order:'deterministic per-round permutation',
      warmup:'worker startup and configured warmup rounds excluded from measured samples',
      measured_path:'Serving-v1 persistent parallel unified search',
      includes_http:false,
      includes_json_serialization:false,
      includes_browser_rendering:false,
      profile_stages:true,
      options:{
        scope:'all',
        type:'all',
        word_limit:250,
        word_pool_limit:800,
        entity_limit:100,
        entity_pool_limit:192,
      },
    },
    rows,
  };
  const markdown=renderServingV1BenchmarkMarkdown(report);

  await mkdir(dirname(jsonPath),{recursive:true});
  await mkdir(dirname(markdownPath),{recursive:true});
  await writeFile(jsonPath,JSON.stringify(report,null,2)+'\n','utf8');
  await writeFile(markdownPath,markdown,'utf8');

  console.log('');
  console.log('[serving-report] complete');
  console.log(JSON.stringify({
    status:report.status,
    timing:report.timing,
    gates:report.gates,
    integrity:report.integrity.ok,
    json:jsonPath,
    markdown:markdownPath,
  },null,2));

  // A missed performance target is report data, not a benchmark execution error.
  // Integrity failure means the measurement is not trustworthy.
  if(!integrity.ok)process.exitCode=3;
}finally{
  try{await parallel.close();}catch{}
}
