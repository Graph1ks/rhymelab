import test from 'node:test';
import assert from 'node:assert/strict';

import {
  autoMapPerformanceBar,
  clearPerformanceBar,
  ensurePerformanceSong,
  getPerformanceCue,
  movePerformanceCue,
  performanceBarMetrics,
  performanceNeedsReview,
  performanceStepDurationMs,
  setPerformanceConfig,
  setPerformanceCue,
} from '../src/studio/performance-session.mjs';

test('performance session migrates legacy index cues to stable Bar IDs',()=>{
  const song={
    id:'song',
    lines:['one two','three four'],
    barIds:['bar-a','bar-b'],
    barRevisions:[2,0],
    steps:{'0-0':'hit','0-4':'accent','1-2':'breath'},
  };
  ensurePerformanceSong(song);
  assert.deepEqual(getPerformanceCue(song,'bar-a',0),{type:'hit',length:1});
  assert.deepEqual(getPerformanceCue(song,'bar-a',4),{type:'accent',length:1});
  assert.deepEqual(getPerformanceCue(song,'bar-b',2),{type:'breath',length:1});
  assert.deepEqual(song.steps,{});
  assert.equal(performanceNeedsReview(song,'bar-a'),false);
});

test('performance cues stay on stable Bar IDs and flag text revision drift for review',()=>{
  const song={
    id:'song',
    lines:['alpha'],
    barIds:['stable-bar'],
    barRevisions:[3],
  };
  setPerformanceCue(song,'stable-bar',2,'pause',{length:3});
  assert.deepEqual(getPerformanceCue(song,'stable-bar',2),{type:'pause',length:3});
  assert.equal(performanceNeedsReview(song,'stable-bar'),false);

  song.barRevisions[0]=4;
  assert.equal(performanceNeedsReview(song,'stable-bar'),true);

  setPerformanceCue(song,'stable-bar',4,'accent');
  assert.equal(performanceNeedsReview(song,'stable-bar'),false);

  assert.equal(movePerformanceCue(song,'stable-bar',4,6),true);
  assert.equal(getPerformanceCue(song,'stable-bar',4),null);
  assert.deepEqual(getPerformanceCue(song,'stable-bar',6),{type:'accent',length:1});
});

test('performance config covers 8/16 grid, straight/triplet and half/double time',()=>{
  const song={id:'song',lines:['alpha'],barIds:['bar'],barRevisions:[0]};
  setPerformanceConfig(song,{bpm:100,grid:8,feel:'triplet',tempoScale:2,pauseLength:4});
  assert.deepEqual(song.performance,{
    bpm:100,
    grid:8,
    feel:'triplet',
    tempoScale:2,
    pauseLength:4,
  });
  assert.equal(performanceStepDurationMs(song,0),200);
  assert.equal(performanceStepDurationMs(song,1),100);

  setPerformanceConfig(song,{grid:16,feel:'straight',tempoScale:.5});
  assert.equal(performanceStepDurationMs(song,0),300);
});

test('auto-map and clear operate per stable Bar ID',()=>{
  const song={
    id:'song',
    lines:['one two three four','other'],
    barIds:['bar-a','bar-b'],
    barRevisions:[0,0],
  };
  const placed=autoMapPerformanceBar(song,'bar-a',4);
  assert.equal(placed.length,4);
  assert.equal(performanceBarMetrics(song,'bar-a').cues,4);
  assert.equal(performanceBarMetrics(song,'bar-b').cues,0);
  assert.equal(clearPerformanceBar(song,'bar-a'),4);
  assert.equal(performanceBarMetrics(song,'bar-a').cues,0);
});
