import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_DEVICE_ACCEPTANCE_SCHEMA,
  STUDIO_DEVICE_GATES,
  createStudioDeviceAcceptance,
  mergeStudioDeviceAcceptanceReports,
  parseStudioDeviceAcceptance,
  studioDeviceAcceptanceFilename,
  studioDeviceAcceptanceSummary,
  studioDeviceGateEnvironmentStatus,
} from '../src/studio/device-acceptance.mjs';

test('device acceptance starts with all seven gates pending',()=>{
  const report=createStudioDeviceAcceptance({
    environment:{platform:'Test',viewportWidth:390,viewportHeight:844,maxTouchPoints:5},
    testedAt:123,
  });
  assert.equal(report.schema,STUDIO_DEVICE_ACCEPTANCE_SCHEMA);
  assert.equal(STUDIO_DEVICE_GATES.length,7);
  const summary=studioDeviceAcceptanceSummary(report);
  assert.equal(summary.total,7);
  assert.equal(summary.passed,0);
  assert.equal(summary.ready,false);
});

test('device acceptance becomes ready only when every real-device gate is explicitly passed on an eligible environment',()=>{
  const environment={
    platform:'Mobile Test',
    viewportWidth:390,
    viewportHeight:844,
    maxTouchPoints:5,
    coarsePointer:true,
    audioSupported:true,
    visualViewportSupported:true,
  };
  const results=Object.fromEntries(STUDIO_DEVICE_GATES.map((gate)=>[
    gate.id,
    {passed:true,note:'ok',environment},
  ]));
  const report=createStudioDeviceAcceptance({environment,results,testedAt:456});
  const summary=studioDeviceAcceptanceSummary(report);
  assert.equal(summary.passed,7);
  assert.equal(summary.ready,true);
  assert.deepEqual(summary.pending,[]);
});

test('device acceptance parser normalizes report payloads',()=>{
  const gate=STUDIO_DEVICE_GATES[0];
  const parsed=parseStudioDeviceAcceptance(JSON.stringify({
    schema:STUDIO_DEVICE_ACCEPTANCE_SCHEMA,
    version:1,
    testedAt:999,
    environment:{platform:'Windows',viewportWidth:1440},
    results:{[gate.id]:true},
  }));
  assert.equal(parsed.results[gate.id].passed,true);
  assert.equal(parsed.environment.platform,'Windows');
  assert.equal(parsed.testedAt,999);
});

test('device acceptance rejects unknown schema and versions',()=>{
  assert.throws(()=>parseStudioDeviceAcceptance({schema:'other'}),/Unbekanntes/u);
  assert.throws(()=>parseStudioDeviceAcceptance({
    schema:STUDIO_DEVICE_ACCEPTANCE_SCHEMA,
    version:2,
  }),/Nicht unterstützte/u);
});

test('device acceptance filename is stable',()=>{
  assert.equal(
    studioDeviceAcceptanceFilename(new Date('2026-09-21T16:40:00Z')),
    'rhymelab-studio-device-acceptance-2026-09-21T16-40-00.json',
  );
});


test('device acceptance merges complementary evidence across eligible devices',()=>{
  const desktop=STUDIO_DEVICE_GATES.filter((gate)=>!gate.id.startsWith('mobile.'));
  const mobile=STUDIO_DEVICE_GATES.filter((gate)=>gate.id.startsWith('mobile.'));
  const a=createStudioDeviceAcceptance({
    environment:{
      platform:'Windows',
      viewportWidth:1440,
      viewportHeight:900,
      maxTouchPoints:0,
      audioSupported:true,
      visualViewportSupported:true,
    },
    testedAt:100,
    results:Object.fromEntries(desktop.map((gate)=>[gate.id,{passed:true,testedAt:100}])),
  });
  const b=createStudioDeviceAcceptance({
    environment:{
      platform:'Android',
      viewportWidth:390,
      viewportHeight:844,
      maxTouchPoints:5,
      coarsePointer:true,
      audioSupported:true,
      visualViewportSupported:true,
    },
    testedAt:200,
    results:Object.fromEntries(mobile.map((gate)=>[gate.id,{passed:true,testedAt:200}])),
  });
  const merged=mergeStudioDeviceAcceptanceReports([a,b]);
  const summary=studioDeviceAcceptanceSummary(merged);
  assert.equal(summary.ready,true);
  assert.equal(summary.passed,7);
  assert.equal(merged.results[desktop[0].id].environment.platform,'Windows');
  assert.equal(merged.results[mobile[0].id].environment.platform,'Android');
});


test('device acceptance rejects a mobile pass recorded on a desktop-only environment',()=>{
  const environment={
    platform:'Desktop',
    viewportWidth:1440,
    viewportHeight:900,
    maxTouchPoints:0,
    coarsePointer:false,
  };
  const report=createStudioDeviceAcceptance({
    environment,
    results:{'mobile.touch':{passed:true,environment}},
  });
  assert.equal(report.results['mobile.touch'].passed,false);
  assert.match(report.results['mobile.touch'].eligibility,/viewport <= 800 CSS px/u);
  assert.equal(studioDeviceAcceptanceSummary(report).ready,false);
});

test('device gate eligibility explains current hardware requirements',()=>{
  const desktop=studioDeviceGateEnvironmentStatus('mobile.keyboard',{
    viewportWidth:1440,
    viewportHeight:900,
    maxTouchPoints:0,
    visualViewportSupported:true,
  });
  assert.equal(desktop.eligible,false);
  assert.ok(desktop.failures.includes('viewport <= 800 CSS px'));
  assert.ok(desktop.failures.includes('touch/coarse pointer'));

  const mobile=studioDeviceGateEnvironmentStatus('mobile.keyboard',{
    viewportWidth:390,
    viewportHeight:844,
    maxTouchPoints:5,
    visualViewportSupported:true,
  });
  assert.equal(mobile.eligible,true);
});
