#!/usr/bin/env node
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {openServingV1ProductRuntime} from '../src/serving-v1-product-runtime.mjs';
import {searchUnifiedWriter} from '../src/unified-writer-search.mjs';

const args=process.argv.slice(2);
const value=(flag,fallback=null)=>{
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
};
const intArg=(flag,fallback,min,max)=>{
  const n=Number.parseInt(String(value(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(n)?n:fallback));
};
const numberArg=(flag,fallback)=>{
  const n=Number(value(flag,fallback));
  return Number.isFinite(n)?n:fallback;
};

const servingPath=resolve(value('--serving','data/local/rhymelab-serving-v1.sqlite'));
const reportPath=resolve(value('--report','data/local/rhymelab-serving-v1-hotpath-benchmark.json'));
const repeats=intArg('--repeats',1,1,5);
const targetP50=numberArg('--target-p50-ms',100);
const targetP95=numberArg('--target-p95-ms',250);
const targetMax=numberArg('--target-max-ms',1500);

const CASES=Object.freeze([
  ['de','Arbeitsweise'],['de','Liebe'],['de','Freiheit'],['de','Musik'],['de','Zeit'],
  ['de','der'],['de','den'],['de','die'],['de','und'],['de','von'],['de','in'],
  ['en','time'],['en','love'],['en','rhyme'],['en','music'],['en','freedom'],['en','A'],['en','in'],
  ['both','Liebe'],['both','time'],
].map(([language,input])=>({language,input})));

function percentile(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1))];
}
function summary(values){
  const clean=values.map(Number).filter(Number.isFinite);
  if(!clean.length)return {samples:0,p50_ms:null,p95_ms:null,max_ms:null,average_ms:null};
  return {
    samples:clean.length,
    p50_ms:Number(percentile(clean,0.50).toFixed(3)),
    p95_ms:Number(percentile(clean,0.95).toFixed(3)),
    max_ms:Number(Math.max(...clean).toFixed(3)),
    average_ms:Number((clean.reduce((a,b)=>a+b,0)/clean.length).toFixed(3)),
  };
}

const runtime=openServingV1ProductRuntime(servingPath);
try{
  const rows=[];
  for(const spec of CASES){
    for(let repeat=0;repeat<repeats;repeat++){
      const options={
        language:spec.language,
        resultLanguage:spec.language,
        scope:'all',
        type:'all',
        wordLimit:250,
        wordPoolLimit:800,
        entityLimit:100,
        entityPoolLimit:192,
        profileStages:true,
      };
      const started=performance.now();
      const result=searchUnifiedWriter(runtime.allDatabases,spec.input,options);
      const elapsed=performance.now()-started;
      rows.push({
        input:spec.input,
        language:spec.language,
        repeat:repeat+1,
        total_ms:Number(elapsed.toFixed(3)),
        stages_ms:result?.performanceProfile?.stages_ms||{},
        counts:result?.counts||null,
        status:result?.status||null,
      });
      console.log(
        '[serving-hotpath] '+spec.language+' · '+spec.input+' · '+
        elapsed.toFixed(1)+'ms · '+JSON.stringify(result?.performanceProfile?.stages_ms||{})
      );
    }
  }

  const timing=summary(rows.map((row)=>row.total_ms));
  const stageNames=[...new Set(rows.flatMap((row)=>Object.keys(row.stages_ms||{})))].sort();
  const stages=Object.fromEntries(stageNames.map((name)=>[
    name,
    summary(rows.map((row)=>Number(row.stages_ms?.[name])).filter(Number.isFinite)),
  ]));
  const gates={
    p50_target:Number(timing.p50_ms)<=targetP50,
    p95_target:Number(timing.p95_ms)<=targetP95,
    max_target:Number(timing.max_ms)<=targetMax,
  };
  const report={
    schema:'rhymelab-serving-v1-hotpath-benchmark-v1',
    status:Object.values(gates).every(Boolean)?'accepted':'needs_optimization',
    serving:servingPath,
    repeats,
    targets_ms:{p50:targetP50,p95:targetP95,max:targetMax},
    timing,
    stages,
    gates,
    rows,
  };
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({
    schema:report.schema,status:report.status,timing:report.timing,gates:report.gates,report:reportPath,
  },null,2));
  if(report.status!=='accepted')process.exitCode=2;
}finally{
  runtime.close();
}
