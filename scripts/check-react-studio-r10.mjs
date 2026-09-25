#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const text=(path)=>readFileSync(resolve(path),'utf8');
const coverage=JSON.parse(text('apps/studio-react/parity-coverage.json'));
const rows=[...(coverage.legacy_capabilities||[]),...(coverage.additional_current_capabilities||[])];
const checks=[];
const add=(id,ok,detail)=>checks.push({id,ok:Boolean(ok),detail:String(detail||'')});

const retiredPaths=[
  'src/studio',
  'src/ui',
  'src/pad',
  'src/rhymepad-v14.mjs',
  '.github/workflows/studio-v2.yml',
  'scripts/check-studio-v2-cutover.mjs',
  'scripts/merge-studio-device-acceptance.mjs',
  'scripts/check-react-studio-r7.mjs',
  'apps/studio-react/src/features/system/SystemAcceptancePanel.tsx',
  'tests/custom-select.test.mjs',
  'tests/local-ui-source.test.mjs',
  'tests/ui-control-interaction.test.mjs',
];
const stillPresent=retiredPaths.filter((path)=>existsSync(resolve(path)));
add('legacy.files-retired',stillPresent.length===0,stillPresent.join(', ')||'historical browser surfaces and migration-only gates removed');

const requiredPaths=[
  'packages/shared-core/src/document/document-model.mjs',
  'packages/shared-core/src/document/backup-portability.mjs',
  'packages/platform-web/src/document-store.mjs',
  'packages/platform-web/src/document-adapter.mjs',
  'packages/platform-web/src/query-pronunciation-cache.mjs',
  'apps/studio-react/browser-acceptance/r10-browser-acceptance.pw.ts',
  'apps/studio-react/browser-acceptance/playwright.config.ts',
];
const missingRequired=requiredPaths.filter((path)=>!existsSync(resolve(path)));
add('compatibility.current-authority-preserved',missingRequired.length===0,missingRequired.join(', ')||'migration/data/browser authority retained');

const server=text('src/server.mjs');
const forbiddenServer=[
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
];
const serverLegacy=forbiddenServer.filter((needle)=>server.includes(needle));
add('legacy.routes-retired',serverLegacy.length===0,serverLegacy.join(', ')||'rollback routes and flags absent');
add(
  'routing.react-authority',
  server.includes("'/': { type: 'text/html; charset=utf-8', body: reactStudioHtml }")
    &&server.includes("'/studio': { type: 'text/html; charset=utf-8', body: reactStudioHtml }")
    &&server.includes("defaultRoute:'react-studio'"),
  'React owns / and /studio',
);

const pkg=JSON.parse(text('package.json'));
const forbiddenScripts=[
  'dev:search-default','dev:legacy-studio-default',
  'studio:v2:cutover:code','studio:v2:cutover:check','studio:v2:cutover:json',
  'studio:v2:accepted-preview','studio:v2:acceptance:merge','studio:v2:verify',
  'studio:v2:release:verify','studio:v2:release:preview','studio:v2:live',
  'studio:react:r7:gate','studio:react:r7:cutover','studio:react:r7:preview',
];
const oldScripts=forbiddenScripts.filter((name)=>Object.hasOwn(pkg.scripts||{},name));
add('legacy.scripts-retired',oldScripts.length===0,oldScripts.join(', ')||'rollback/cutover commands absent');

const preview=text('src/react-studio-preview.mjs');
add(
  'legacy.rollback-switch-retired',
  !preview.includes('legacy-studio-default')
    &&!preview.includes('RHYMELAB_LEGACY_STUDIO_DEFAULT')
    &&!preview.includes('reactStudioPreviewMode'),
  'React asset loader has no rollback/default-mode switch',
);

const browser=text('apps/studio-react/browser-acceptance/r10-browser-acceptance.pw.ts');
const gates=[
  'editor.ime','perform.metronome','mobile.navigation','mobile.swap',
  'mobile.keyboard','mobile.touch','mobile.no-hover',
];
const missingGates=gates.filter((id)=>!browser.includes(id));
add('acceptance.browser-gates',missingGates.length===0,missingGates.join(', ')||'all seven R10 behavior gates remain automated');

const retiredPrefixes=[
  'src/studio/','src/ui/','src/pad/','src/rhymepad-v14.mjs',
  'apps/studio-react/src/legacy/',
  'apps/studio-react/src/features/system/SystemAcceptancePanel.tsx',
  'scripts/check-studio-v2-cutover.mjs',
  'scripts/check-react-studio-r7.mjs',
  'scripts/merge-studio-device-acceptance.mjs',
  '.github/workflows/studio-v2.yml',
];
const staleEvidence=rows.flatMap((row)=>
  (row.evidence||[])
    .filter((entry)=>retiredPrefixes.some((prefix)=>String(entry).startsWith(prefix)))
    .map((entry)=>`${row.id} -> ${entry}`)
);
add('parity.no-retired-evidence',staleEvidence.length===0,staleEvidence.join(', ')||'parity evidence points only at retained authority');

const notPorted=rows.filter((row)=>!['ported','verified'].includes(row.status)).map((row)=>row.id);
add('parity.ported',notPorted.length===0,notPorted.join(', ')||`${rows.length}/${rows.length} rows ported or verified`);

const failed=checks.filter((check)=>!check.ok);
console.log('RhymeLab R10 Legacy Exit gate');
for(const check of checks)console.log(check.ok?'PASS':'FAIL',check.id,'—',check.detail);
if(failed.length){
  console.error('');
  console.error('LEGACY EXIT NOT READY:',failed.map((check)=>check.id).join(', '));
  process.exit(1);
}
console.log('');
console.log('READY — destructive browser Legacy Exit invariants hold.');
