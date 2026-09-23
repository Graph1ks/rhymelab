import test from 'node:test';
import assert from 'node:assert/strict';

import {
  benchmarkDistribution,
  compareWriterQuality,
  runInternalDbBenchmark,
  summarizeInternalDbBenchmark,
  writerResultQuality,
} from '../src/studio/internal-db-benchmark.mjs';

function row(id,word=id,kind='word'){
  return {id,word,kind,lang:'de',raw:{resultKind:kind,resultId:id,word,language:'de'}};
}

test('benchmark distribution reports deterministic min p50 p95 max and mean',()=>{
  const stats=benchmarkDistribution([10,20,30,40,50]);
  assert.equal(stats.n,5);
  assert.equal(stats.min,10);
  assert.equal(stats.p50,30);
  assert.equal(stats.p95,48);
  assert.equal(stats.max,50);
  assert.equal(stats.mean,30);
});

test('Writer quality fingerprint is order-sensitive and top overlap is explicit',()=>{
  const full=writerResultQuality([row('a'),row('b'),row('c')]);
  const same=writerResultQuality([row('a'),row('b'),row('c')]);
  const reordered=writerResultQuality([row('b'),row('a'),row('c')]);
  const cut=writerResultQuality([row('a'),row('b')]);

  assert.equal(full.fingerprint,same.fingerprint);
  assert.notEqual(full.fingerprint,reordered.fingerprint);
  assert.deepEqual(full.kinds,{word:3,phrase:0,entity:0,other:0});

  const comparison=compareWriterQuality(full,cut);
  assert.equal(comparison.sameFingerprint,false);
  assert.equal(comparison.exactOrderedPrefix,2);
  assert.equal(comparison.topOverlapCount,2);
  assert.equal(comparison.resultCountDelta,-1);
});

test('controlled benchmark excludes warmups, aggregates timings and detects nondeterministic editions',async()=>{
  const calls=[];
  let liteMeasured=0;
  const search=async(options)=>{
    calls.push({...options});
    const runtimeDb=options.runtimeDb;
    const isLite=runtimeDb==='lite';
    const rows=isLite
      ?(++liteMeasured===2?[row('a'),row('b')]:[row('a'),row('c')])
      :[row('a'),row('b'),row('c')];
    return {
      rows,
      runtimeTiming:{searchMs:isLite?10:30},
      serverTransport:{serializeMs:isLite?1:3,responseBytes:isLite?1000:3000},
      clientTiming:{totalMs:isLite?15:40,parseMs:1,mapMs:.5,responseBytes:isLite?1000:3000},
      effectiveRequest:{q:options.query,runtime_db:runtimeDb},
      runtimeExecution:'direct-internal-db-lab',
      raw:{performanceProfile:{total_ms:isLite?9:29}},
    };
  };

  const report=await runInternalDbBenchmark({
    search,
    databases:['full','lite'],
    cases:[{id:'q',query:'Arbeitsweise',queryBasis:'de',resultLanguage:'de'}],
    baseOptions:{generated:false},
    warmups:1,
    runs:2,
  });

  assert.equal(calls.length,6);
  assert.equal(report.samples.filter((sample)=>sample.warmup).length,2);
  assert.equal(report.summary.databases.full.measuredRuns,2);
  assert.equal(report.summary.databases.full.serverSearchMs.p50,30);
  assert.equal(report.summary.databases.lite.serverSearchMs.p50,10);
  assert.equal(report.summary.databases.full.deterministic,true);
  assert.equal(report.summary.databases.lite.deterministic,false);
  assert.equal(report.summary.databases.lite.nondeterministicCases,1);
  assert.equal(report.summary.databases.full.qualityVsFull.meanTopJaccard,1);
});

test('summary compares each edition against Full for the same case only',()=>{
  const fullQuality=writerResultQuality([row('a'),row('b'),row('c')]);
  const liteQuality=writerResultQuality([row('a'),row('b')]);
  const samples=[
    {database:'full',caseId:'x',run:1,warmup:false,ok:true,resultCount:3,quality:fullQuality,timings:{serverSearchMs:30},bytes:{}},
    {database:'lite',caseId:'x',run:1,warmup:false,ok:true,resultCount:2,quality:liteQuality,timings:{serverSearchMs:10},bytes:{}},
  ];
  const summary=summarizeInternalDbBenchmark(samples,[{id:'x'}],['full','lite']);
  assert.equal(summary.databases.full.qualityVsFull.meanTopJaccard,1);
  assert.equal(summary.databases.lite.qualityVsFull.meanTopJaccard,2/3);
});
