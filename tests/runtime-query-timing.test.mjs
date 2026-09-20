import test from 'node:test';
import assert from 'node:assert/strict';
import { createRollingQueryTiming } from '../src/runtime-query-timing.mjs';

test('rolling query timing keeps a bounded O(1)-style last-N average contract',()=>{
  const timing=createRollingQueryTiming(3);
  assert.deepEqual(timing.snapshot(),{
    schema:'rhymelab-runtime-query-timing-v1',
    searchMs:null,
    averageLast100Ms:null,
    sampleCount:0,
    windowSize:3,
  });

  assert.equal(timing.record(10).averageLast100Ms,10);
  assert.equal(timing.record(20).averageLast100Ms,15);
  const third=timing.record(30);
  assert.equal(third.averageLast100Ms,20);
  assert.equal(third.sampleCount,3);

  const fourth=timing.record(40.44);
  assert.equal(fourth.searchMs,40.4);
  assert.equal(fourth.averageLast100Ms,30.1);
  assert.equal(fourth.sampleCount,3);
  assert.equal(fourth.windowSize,3);
});

test('rolling query timing rejects invalid samples',()=>{
  const timing=createRollingQueryTiming();
  assert.throws(()=>timing.record(-1),/finite non-negative/);
  assert.throws(()=>timing.record(Number.NaN),/finite non-negative/);
});
