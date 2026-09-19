import test from 'node:test';
import assert from 'node:assert/strict';
import { PronunciationIpaAnalyzerPool } from '../scripts/pronunciation-ipa-analyzer-pool.mjs';

test('persistent IPA analyzer pool parallelizes accepted analysis and reports metrics',async()=>{
  const pool=new PronunciationIpaAnalyzerPool({workers:4});
  try{
    const tasks=Array.from({length:16},(_,index)=>pool.analyze({
      surface:'Hallo '+index,
      language:'de',
      rawIpa:'ˈhaːloː',
      engineCommand:'mock-espeak',
      engineVersion:'mock',
    }));
    const results=await Promise.all(tasks);
    assert.equal(results.length,16);
    assert.ok(results.every((row)=>row.inspection?.status==='accepted'));
    assert.ok(results.every((row)=>row.inspection?.analysis?.syllableCount>=1));
    const stats=pool.stats();
    assert.equal(stats.workers,4);
    assert.equal(stats.submitted,16);
    assert.equal(stats.completed,16);
    assert.equal(stats.failed,0);
    assert.equal(stats.worker_restarts,0);
    assert.equal(stats.queued,0);
    assert.equal(stats.active,0);
  }finally{
    await pool.close();
  }
});

test('closed IPA analyzer pool rejects new work',async()=>{
  const pool=new PronunciationIpaAnalyzerPool({workers:2});
  await pool.close();
  await assert.rejects(
    ()=>pool.analyze({
      surface:'Hallo',
      language:'de',
      rawIpa:'ˈhaːloː',
    }),
    /closed/u,
  );
});
