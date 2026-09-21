import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

import {STUDIO_PARITY_MANIFEST,studioParitySummary} from '../src/studio/parity-manifest.mjs';

test('Studio cutover code gate resolves all source evidence',()=>{
  const summary=studioParitySummary();
  assert.equal(summary.sourceReady,summary.sourceTotal);
  assert.ok(summary.total>=70);
  assert.equal(summary.deviceTotal,7);
  for(const item of STUDIO_PARITY_MANIFEST){
    if(item.acceptance==='device')continue;
    for(const reference of item.evidence){
      const index=reference.indexOf('::');
      assert.ok(index>0,'invalid evidence reference for '+item.id);
      const path=reference.slice(0,index);
      const needle=reference.slice(index+2);
      assert.equal(existsSync(path),true,'missing evidence file '+path);
      const source=readFileSync(path,'utf8');
      assert.equal(source.includes(needle),true,item.id+' missing evidence '+reference);
    }
  }
});

test('Studio default-route preview stays reversible',()=>{
  const server=readFileSync('src/server.mjs','utf8');
  assert.match(server,/studioDefaultRoute/u);
  assert.match(server,/--studio-default/u);
  assert.match(server,/RHYMELAB_STUDIO_DEFAULT/u);
  assert.match(server,/studioDefaultRoute\?studioHtml:writerHtml/u);
  assert.match(server,/'\/search': \{ type: 'text\/html; charset=utf-8', body: writerHtml \}/u);
  assert.match(server,/'\/legacy': \{ type: 'text\/html; charset=utf-8', body: writerHtml \}/u);
  assert.match(server,/'\/pad-legacy': \{ type: 'text\/html; charset=utf-8', body: padHtml \}/u);
});

test('package exposes Studio cutover preview and release gates',()=>{
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  assert.equal(pkg.scripts['dev:studio-default'],'node src/server.mjs --studio-default');
  assert.match(pkg.scripts['studio:v2:cutover:code'],/--code-only/u);
  assert.equal(pkg.scripts['studio:v2:cutover:check'],'node --no-warnings scripts/check-studio-v2-cutover.mjs');
  assert.equal(pkg.scripts['studio:v2:cutover:json'],'node --no-warnings scripts/check-studio-v2-cutover.mjs --json');
  assert.match(pkg.scripts['studio:v2:accepted-preview'],/studio:v2:cutover:check/u);
  assert.match(pkg.scripts['studio:v2:accepted-preview'],/--studio-default/u);
});
