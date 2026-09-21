import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_DEVICE_ACCEPTANCE_SCHEMA,
  STUDIO_DEVICE_GATES,
  createStudioDeviceAcceptance,
  parseStudioDeviceAcceptance,
  studioDeviceAcceptanceFilename,
  studioDeviceAcceptanceSummary,
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

test('device acceptance becomes ready only when every real-device gate is explicitly passed',()=>{
  const results=Object.fromEntries(STUDIO_DEVICE_GATES.map((gate)=>[gate.id,{passed:true,note:'ok'}]));
  const report=createStudioDeviceAcceptance({results,testedAt:456});
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
