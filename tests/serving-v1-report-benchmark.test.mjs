import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SERVING_V1_REPORT_CASES,
  caseTiming,
  groupTiming,
  measurementOrder,
  renderServingV1BenchmarkMarkdown,
  timingSummary,
} from '../scripts/serving-v1-report-benchmark-core.mjs';

test('Serving report timing summary exposes report-grade percentiles',()=>{
  assert.deepEqual(timingSummary([10,20,30,40,50]),{
    samples:5,
    min_ms:10,
    p25_ms:20,
    p50_ms:30,
    p75_ms:40,
    p95_ms:50,
    p99_ms:50,
    max_ms:50,
    average_ms:30,
    stddev_ms:14.142,
  });
});

test('Serving report measurement order is deterministic but round-sensitive',()=>{
  const first=measurementOrder(SERVING_V1_REPORT_CASES,1);
  const again=measurementOrder(SERVING_V1_REPORT_CASES,1);
  const second=measurementOrder(SERVING_V1_REPORT_CASES,2);
  assert.deepEqual(first,again);
  assert.equal(first.length,SERVING_V1_REPORT_CASES.length);
  assert.notDeepEqual(first,second);
  assert.deepEqual(
    new Set(first.map((row)=>row.language+'\u001f'+row.input)),
    new Set(SERVING_V1_REPORT_CASES.map((row)=>row.language+'\u001f'+row.input)),
  );
});

test('Serving report groups language and per-case timing',()=>{
  const rows=[
    {language:'de',input:'Zeit',total_ms:10},
    {language:'de',input:'Zeit',total_ms:20},
    {language:'en',input:'time',total_ms:30},
    {language:'en',input:'time',total_ms:40},
  ];
  const byLanguage=groupTiming(rows,(row)=>row.language);
  assert.equal(byLanguage.de.p50_ms,10);
  assert.equal(byLanguage.en.p50_ms,30);
  const byCase=caseTiming(rows);
  assert.equal(byCase.length,2);
  assert.equal(byCase[0].input,'time');
  assert.equal(byCase[0].p50_ms,30);
});

test('Serving report markdown contains methodology, gates and environment',()=>{
  const summary=timingSummary([50,100,150,200]);
  const report={
    completed_at:'2026-09-20T18:00:00.000Z',
    execution:'persistent-worker-threads-v1-steady-state',
    dataset_mode:'all',
    case_count:20,
    warmup_rounds:1,
    repeats:7,
    timing:summary,
    targets_ms:{p50:100,p95:250,max:1500},
    gates:{p50_target:true,p95_target:true,max_target:true},
    status:'accepted',
    by_language:{de:summary,en:summary,both:summary},
    by_case:[{language:'de',input:'Zeit',...summary}],
    stages:{words_de:summary},
    database:{
      path:'data/local/rhymelab-serving-v1.sqlite',
      bytes:1024,
      product_semantic_fingerprint:'product-fingerprint',
      runtime_semantic_fingerprint:'runtime-fingerprint',
    },
    environment:{
      node:'v22.0.0',platform:'win32',arch:'x64',
      cpu_model:'Fixture CPU',logical_cpus:8,total_memory_bytes:1024,
    },
  };
  const markdown=renderServingV1BenchmarkMarkdown(report);
  assert.match(markdown,/Warmup rounds: 1 \(discarded\)/u);
  assert.match(markdown,/persistent-worker-threads-v1-steady-state/u);
  assert.match(markdown,/\| p50 \| 100\.0 ms \| ≤ 100\.0 ms \| PASS \|/u);
  assert.match(markdown,/Fixture CPU/u);
});
