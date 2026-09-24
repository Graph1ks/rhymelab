import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {
  STUDIO_PARITY_MANIFEST,
  studioParitySummary,
} from '../src/studio/parity-manifest.mjs';
import {
  mergeStudioDeviceAcceptanceReports,
  parseStudioDeviceAcceptance,
  studioDeviceAcceptanceSummary,
} from '../src/studio/device-acceptance.mjs';

const args=new Set(process.argv.slice(2));
const codeOnly=args.has('--code-only');
const jsonOnly=args.has('--json');
const argValues=(name)=>{
  const argv=process.argv.slice(2),values=[];
  for(let index=0;index<argv.length;index++){
    if(argv[index]===name&&argv[index+1])values.push(argv[++index]);
  }
  return values;
};
const explicitDeviceReports=argValues('--device-report');
const envDeviceReports=String(process.env.RHYMELAB_STUDIO_DEVICE_ACCEPTANCE||'')
  .split(/[;,]/u).map((value)=>value.trim()).filter(Boolean);
const deviceReportPaths=(explicitDeviceReports.length?explicitDeviceReports:envDeviceReports.length?envDeviceReports:[
  'reports/studio-v2-device-acceptance.json',
]).map((value)=>resolve(value));

const checks=[];
const add=(id,ok,detail)=>checks.push({id,ok:Boolean(ok),detail:String(detail||'')});

function text(path){
  return readFileSync(resolve(path),'utf8');
}

function evidenceCheck(reference){
  const separator=reference.indexOf('::');
  if(separator<0)return {ok:false,detail:'invalid evidence reference'};
  const path=reference.slice(0,separator);
  const needle=reference.slice(separator+2);
  if(!existsSync(resolve(path)))return {ok:false,detail:path+' missing'};
  const source=text(path);
  return {
    ok:source.includes(needle),
    detail:path+' :: '+needle,
  };
}

const parity=studioParitySummary();
add(
  'parity.source-status',
  parity.sourceReady===parity.sourceTotal,
  parity.sourceReady+'/'+parity.sourceTotal+' source capabilities READY/ADAPTED',
);
add(
  'parity.manifest-size',
  parity.total>=70,
  parity.total+' mapped capabilities',
);

const brokenEvidence=[];
for(const item of STUDIO_PARITY_MANIFEST){
  if(item.acceptance==='device')continue;
  for(const reference of item.evidence||[]){
    const result=evidenceCheck(reference);
    if(!result.ok)brokenEvidence.push(item.id+' -> '+result.detail);
  }
}
add(
  'parity.source-evidence',
  brokenEvidence.length===0,
  brokenEvidence.length?brokenEvidence.join('; '):'all source evidence references resolved',
);

const parityDoc=text('docs/UI_REDESIGN_PARITY.md');
const tableBlockers=[...parityDoc.matchAll(/^\|[^\n]*\|\s*(TODO|MISSING|REFERENCE-ONLY|BLOCKED)\s*(?:·[^|]*)?\|\s*$/gimu)]
  .map((match)=>match[0].trim());
add(
  'parity.contract-table',
  tableBlockers.length===0,
  tableBlockers.length?tableBlockers.join('; '):'no unresolved table status',
);

const plan=text('docs/STUDIO_V2_MIGRATION_PLAN.md');
add(
  'migration.authority',
  /authoritative DocumentStore cutover\s+DONE/u.test(plan),
  'IndexedDB authoritative cutover',
);
add(
  'migration.perform',
  /full Perform parity\s+DONE/u.test(plan),
  'Perform parity',
);
add(
  'migration.analysis',
  /canonical analysis\s+DONE/u.test(plan),
  'canonical analysis',
);
add(
  'migration.localization',
  /persistent DE \/ EN UI localization\s+DONE/u.test(plan),
  'DE/EN UI localization',
);

const html=text('src/studio/index.html');
const app=text('src/studio/app.js');
const server=text('src/server.mjs');
const ids=new Set([...html.matchAll(/\bid=["']([^"']+)["']/gu)].map((match)=>match[1]));
const bindStart=app.indexOf('function bind(){');
const bindEnd=app.indexOf('// Version 2:',bindStart);
const bindBlock=bindStart>=0&&bindEnd>bindStart?app.slice(bindStart,bindEnd):'';
const requiredIds=[...bindBlock.matchAll(/bindClick\('([^']+)'[^\n]*\);/gu)]
  .filter((match)=>!match[0].includes('optional:true'))
  .map((match)=>match[1]);
const missingIds=requiredIds.filter((id)=>!ids.has(id));
add(
  'startup.required-controls',
  missingIds.length===0,
  missingIds.length?'missing: '+missingIds.join(', '):requiredIds.length+' required controls present',
);

const requiredRoutes=[
  '/studio/app.js',
  '/studio/search-state.mjs',
  '/studio/document-store.mjs',
  '/studio/performance-session.mjs',
  '/studio/analysis-adapter.mjs',
  '/studio/backup-portability.mjs',
  '/studio/diagnostics.mjs',
  '/studio/i18n.mjs',
  '/studio/dom-acceptance.mjs',
  '/studio/command-palette.mjs',
  '/studio/edit-history.mjs',
  '/studio/parity-manifest.mjs',
  '/studio/device-acceptance.mjs',
];
const missingRoutes=requiredRoutes.filter((route)=>!server.includes("'"+route+"'"));
add(
  'server.studio-modules',
  missingRoutes.length===0,
  missingRoutes.length?'missing: '+missingRoutes.join(', '):requiredRoutes.length+' module routes present',
);
add(
  'server.reversible-cutover',
  server.includes("'/studio': { type: 'text/html; charset=utf-8', body: reactStudioHtml }")
    &&server.includes("'/studio-legacy': { type: 'text/html; charset=utf-8', body: studioHtml }")
    &&server.includes("'/legacy'")
    &&server.includes("'/pad-legacy'"),
  'React default Studio route + preserved Studio V2/Search/RhymePad rollback aliases',
);

const requiredTests=[
  'tests/studio-v2-source.test.mjs',
  'tests/studio-cutover-gate.test.mjs',
  'tests/studio-parity-manifest.test.mjs',
  'tests/studio-device-acceptance.test.mjs',
  'tests/studio-dom-acceptance.test.mjs',
  'tests/studio-i18n.test.mjs',
  'tests/studio-command-palette.test.mjs',
  'tests/studio-backup-portability.test.mjs',
  'tests/studio-diagnostics.test.mjs',
  'tests/studio-edit-history.test.mjs',
  'tests/studio-performance-session.test.mjs',
  'tests/studio-document-adapter.test.mjs',
  'tests/studio-document-model.test.mjs',
  'tests/studio-document-store.test.mjs',
];
const missingTests=requiredTests.filter((path)=>!existsSync(resolve(path)));
add(
  'tests.required-files',
  missingTests.length===0,
  missingTests.length?'missing: '+missingTests.join(', '):requiredTests.length+' regression suites present',
);

let device=null;
if(!codeOnly){
  const missing=deviceReportPaths.filter((path)=>!existsSync(path));
  if(missing.length){
    add(
      'device.acceptance-report',
      false,
      'missing '+missing.join(', ')+'; export/import the seven-gate JSON from Studio Settings and pass one or more --device-report <file>',
    );
  }else{
    try{
      const parsed=deviceReportPaths.map((path)=>
        parseStudioDeviceAcceptance(readFileSync(path,'utf8'))
      );
      const merged=mergeStudioDeviceAcceptanceReports(parsed);
      device=studioDeviceAcceptanceSummary(merged);
      const pendingDetail=device.pending.map((id)=>{
        const row=merged.results?.[id];
        return id+(row?.eligibility&&row.eligibility!=='environment eligible'?' ['+row.eligibility+']':'');
      });
      add(
        'device.acceptance-report',
        device.ready,
        device.ready
          ?device.passed+'/'+device.total+' real-device gates passed across '+parsed.length+' report'+(parsed.length===1?'':'s')
          :'pending: '+pendingDetail.join(', '),
      );
    }catch(error){
      add('device.acceptance-report',false,error instanceof Error?error.message:String(error));
    }
  }
}

const failed=checks.filter((check)=>!check.ok);
const report={
  schema:'rhymelab-studio-cutover-check-v1',
  mode:codeOnly?'code-only':'full',
  ready:failed.length===0,
  parity,
  device,
  checks,
  failed:failed.map((check)=>check.id),
};

if(jsonOnly)process.stdout.write(JSON.stringify(report,null,2)+'\n');
else{
  console.log('RhymeLab Studio 02 cutover gate');
  console.log('mode:',report.mode);
  for(const check of checks){
    console.log(check.ok?'PASS':'FAIL',check.id,'—',check.detail);
  }
  console.log('');
  console.log(report.ready?'READY':'NOT READY',failed.length?'('+failed.length+' failed gate'+(failed.length===1?'':'s')+')':'');
}

if(!report.ready)process.exitCode=1;
