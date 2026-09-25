import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDIO_DIAGNOSTICS_SCHEMA,
  collectStudioEnvironmentDiagnostics,
  diagnosticsFilename,
} from '../packages/platform-web/src/diagnostics.mjs';

function fakeWindow({
  width=1440,
  height=900,
  coarse=false,
  reduced=false,
}={}){
  return {
    innerWidth:width,
    innerHeight:height,
    devicePixelRatio:2,
    isSecureContext:true,
    indexedDB:{},
    localStorage:{},
    AudioContext:function AudioContext(){},
    visualViewport:{width,height,offsetTop:0},
    navigator:{
      maxTouchPoints:coarse?5:0,
      language:'de-DE',
      userAgent:'RhymeLab Test',
    },
    matchMedia(query){
      if(query.includes('pointer: coarse'))return {matches:coarse};
      if(query.includes('prefers-reduced-motion'))return {matches:reduced};
      return {matches:false};
    },
  };
}

test('Studio diagnostics reports browser/runtime acceptance capabilities',()=>{
  const report=collectStudioEnvironmentDiagnostics({
    windowObj:fakeWindow({coarse:true,reduced:true}),
    documentObj:{},
    documentStoreStatus:'ready',
    documentStoreAuthority:true,
    writerStatus:'ready',
    writerCapabilities:{languages:{de:{available:true}}},
    writerRuntimeTiming:{searchMs:12.4,averageLast100Ms:18.2,sampleCount:100},
    controlsBound:true,
  });

  assert.equal(report.schema,STUDIO_DIAGNOSTICS_SCHEMA);
  assert.equal(report.runtime.documentStoreAuthority,true);
  assert.equal(report.runtime.writerCurrentMs,12.4);
  assert.equal(report.runtime.writerAverageLast100Ms,18.2);
  assert.equal(report.input.coarsePointer,true);
  assert.equal(report.preferences.reducedMotion,true);
  assert.equal(report.summary.failing.length,0);
});

test('Studio diagnostics surfaces missing critical browser/runtime capabilities',()=>{
  const windowObj={
    innerWidth:390,
    innerHeight:700,
    navigator:{maxTouchPoints:1,language:'en-US',userAgent:'Test'},
    matchMedia:()=>({matches:false}),
  };
  const report=collectStudioEnvironmentDiagnostics({
    windowObj,
    documentStoreStatus:'unsupported',
    documentStoreAuthority:false,
    writerStatus:'error',
    writerCapabilities:null,
    controlsBound:false,
  });

  assert.ok(report.summary.failing.includes('controls'));
  assert.ok(report.summary.failing.includes('indexeddb'));
  assert.ok(report.summary.failing.includes('document-store'));
  assert.ok(report.summary.failing.includes('writer'));
  assert.ok(report.summary.failing.includes('audio'));
  assert.ok(report.summary.failing.includes('visual-viewport'));
});

test('diagnostics filename is timestamped and stable',()=>{
  assert.equal(
    diagnosticsFilename(new Date('2026-09-21T13:10:11Z')),
    'rhymelab-studio-diagnostics-2026-09-21T13-10-11.json',
  );
});
