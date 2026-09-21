import test from 'node:test';
import assert from 'node:assert/strict';

import {
  autoMapPerformanceBar,
  clearPerformanceBar,
  ensurePerformanceSong,
  getPerformanceCue,
  movePerformanceCue,
  performanceBarDurationMs,
  performanceBarMetrics,
  performanceFlowFingerprint,
  performanceNeedsReview,
  performancePocketMetrics,
  performancePreviousBarPlacements,
  performanceStepDurationMs,
  performanceSyllablesPerSecond,
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


test('Perform metrics expose bar time, pocket, breath load, fingerprint and previous placements',()=>{
  const song={
    id:'song',
    lines:['alpha beta','gamma delta'],
    barIds:['bar-a','bar-b'],
    barRevisions:[0,0],
  };
  setPerformanceConfig(song,{bpm:120,grid:16,feel:'straight',tempoScale:1});
  setPerformanceCue(song,'bar-a',0,'accent');
  setPerformanceCue(song,'bar-a',4,'hit');
  setPerformanceCue(song,'bar-a',6,'breath');
  setPerformanceCue(song,'bar-b',0,'accent');
  setPerformanceCue(song,'bar-b',5,'pause',{length:2});
  setPerformanceCue(song,'bar-b',6,'hit');

  assert.equal(performanceBarDurationMs(song),2000);
  assert.equal(performanceSyllablesPerSecond(song,8),4);
  assert.match(performanceFlowFingerprint(song,'bar-b'),/^▲/u);

  const pocket=performancePocketMetrics(song,'bar-b');
  assert.equal(pocket.onBeat,1);
  assert.equal(pocket.offBeat,2);
  assert.equal(pocket.pauseUnits,2);
  assert.equal(pocket.breathLoad,2);

  const previous=performancePreviousBarPlacements(song,'bar-b');
  assert.equal(previous.previousBarId,'bar-a');
  assert.deepEqual(previous.sharedSteps,[0,6]);
  assert.equal(previous.sharedCount,2);
});
