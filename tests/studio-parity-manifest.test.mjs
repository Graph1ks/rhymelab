import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {
  STUDIO_PARITY_MANIFEST,
  studioParityGroups,
  studioParitySummary,
} from '../src/studio/parity-manifest.mjs';

test('Studio parity manifest has unique mapped capabilities and explicit device gates',()=>{
  const ids=STUDIO_PARITY_MANIFEST.map((row)=>row.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(ids.length>=70,'manifest must stay exhaustive enough to cover all major legacy workflows');

  for(const row of STUDIO_PARITY_MANIFEST){
    assert.ok(row.group,row.id);
    assert.ok(row.label,row.id);
    assert.ok(row.legacy,row.id);
    assert.ok(row.studio,row.id);
    assert.ok(['ready','adapted'].includes(row.status),row.id);
    assert.ok(['source','device'].includes(row.acceptance),row.id);
    assert.ok(Array.isArray(row.evidence)&&row.evidence.length>0,row.id);
  }

  const summary=studioParitySummary();
  assert.equal(summary.total,STUDIO_PARITY_MANIFEST.length);
  assert.equal(summary.mapped,summary.total);
  assert.equal(summary.sourceReady,summary.sourceTotal);
  assert.deepEqual(summary.devicePending.sort(),[
    'editor.ime',
    'mobile.keyboard',
    'mobile.navigation',
    'mobile.no-hover',
    'mobile.swap',
    'mobile.touch',
    'perform.metronome',
  ]);
  assert.equal(studioParityGroups().length,8);
});

test('every parity-manifest evidence token exists in the claimed source file',async()=>{
  const cache=new Map();
  for(const row of STUDIO_PARITY_MANIFEST){
    for(const evidence of row.evidence){
      const separator=evidence.indexOf('::');
      assert.ok(separator>0,'invalid evidence format for '+row.id+': '+evidence);
      const path=evidence.slice(0,separator);
      const token=evidence.slice(separator+2);
      if(!cache.has(path))cache.set(path,await readFile(path,'utf8'));
      assert.ok(
        cache.get(path).includes(token),
        row.id+' evidence missing: '+path+' :: '+token,
      );
    }
  }
});

test('parity groups cover Writer Editor Library Analysis Perform Appearance Mobile and System',()=>{
  assert.deepEqual(
    studioParityGroups().map((group)=>group.name),
    [
      'Search / Writer',
      'Writing / Editor',
      'Library',
      'Analysis',
      'Perform',
      'Appearance / UX',
      'Mobile',
      'System / Recovery',
    ],
  );
});
