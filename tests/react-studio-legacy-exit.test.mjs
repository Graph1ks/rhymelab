import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const server=readFileSync('src/server.mjs','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));

test('R10 Legacy Exit leaves React as the only shipping browser product surface',()=>{
  assert.match(server,/'\/': \{ type: 'text\/html; charset=utf-8', body: reactStudioHtml \}/u);
  assert.match(server,/'\/studio': \{ type: 'text\/html; charset=utf-8', body: reactStudioHtml \}/u);
  assert.match(server,/defaultRoute:'react-studio'/u);

  for(const marker of [
    "'/studio-legacy'",
    "'/search'",
    "'/legacy'",
    "'/pad'",
    "'/pad-legacy'",
    '--legacy-studio-default',
    '--search-default',
    'RHYMELAB_LEGACY_STUDIO_DEFAULT',
    'RHYMELAB_SEARCH_DEFAULT',
    'materializeRhymePadV14',
  ]){
    assert.equal(server.includes(marker),false,marker);
  }
});

test('R10 Legacy Exit removes historical browser source trees and rollback workflow',()=>{
  for(const path of [
    'src/studio',
    'src/ui',
    'src/pad',
    'src/rhymepad-v14.mjs',
    '.github/workflows/studio-v2.yml',
    'scripts/check-studio-v2-cutover.mjs',
    'scripts/merge-studio-device-acceptance.mjs',
    'scripts/check-react-studio-r7.mjs',
    'apps/studio-react/src/features/system/SystemAcceptancePanel.tsx',
  ]){
    assert.equal(existsSync(path),false,path);
  }
});

test('migration/data compatibility authority survives the browser Legacy Exit',()=>{
  for(const path of [
    'packages/shared-core/src/document/document-model.mjs',
    'packages/shared-core/src/document/backup-portability.mjs',
    'packages/platform-web/src/document-store.mjs',
    'packages/platform-web/src/document-adapter.mjs',
    'packages/platform-web/src/query-pronunciation-cache.mjs',
  ]){
    assert.equal(existsSync(path),true,path);
  }
});

test('package scripts expose current React verification without historical rollback commands',()=>{
  assert.equal(pkg.scripts['studio:react:r10:gate'],'node scripts/check-react-studio-r10.mjs');
  for(const script of [
    'dev:search-default',
    'dev:legacy-studio-default',
    'studio:v2:cutover:code',
    'studio:v2:cutover:check',
    'studio:v2:cutover:json',
    'studio:v2:accepted-preview',
    'studio:v2:acceptance:merge',
    'studio:v2:verify',
    'studio:v2:release:verify',
    'studio:v2:release:preview',
    'studio:v2:live',
    'studio:react:r7:gate',
    'studio:react:r7:cutover',
    'studio:react:r7:preview',
  ]){
    assert.equal(Object.hasOwn(pkg.scripts,script),false,script);
  }
});

test('R10 automated browser acceptance remains a permanent regression gate',()=>{
  const workflow=readFileSync('.github/workflows/react-studio.yml','utf8');
  const acceptance=readFileSync('apps/studio-react/browser-acceptance/r10-browser-acceptance.pw.ts','utf8');
  assert.match(workflow,/R10 automated browser acceptance/u);
  assert.match(workflow,/check-react-studio-r10\.mjs/u);
  for(const id of [
    'editor.ime','perform.metronome','mobile.navigation','mobile.swap',
    'mobile.keyboard','mobile.touch','mobile.no-hover',
  ]){
    assert.equal(acceptance.includes(id),true,id);
  }
});
