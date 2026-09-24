#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  mergeStudioDeviceAcceptanceReports,
  parseStudioDeviceAcceptance,
  studioDeviceAcceptanceSummary,
} from '../src/studio/device-acceptance.mjs';

const argv=process.argv.slice(2);
const args=new Set(argv);
const codeOnly=args.has('--code-only');
const jsonOnly=args.has('--json');

function values(name){
  const output=[];
  for(let index=0;index<argv.length;index+=1){
    if(argv[index]===name&&argv[index+1])output.push(argv[++index]);
  }
  return output;
}

const coverage=JSON.parse(readFileSync(resolve('apps/studio-react/parity-coverage.json'),'utf8'));
const rows=[
  ...(coverage.legacy_capabilities||[]),
  ...(coverage.additional_current_capabilities||[]),
];
const checks=[];
const add=(id,ok,detail)=>checks.push({id,ok:Boolean(ok),detail:String(detail||'')});
const text=(path)=>readFileSync(resolve(path),'utf8');

const sourcePending=rows.filter((row)=>!['ported','verified'].includes(row.status));
add(
  'parity.source-ported',
  sourcePending.length===0,
  sourcePending.length
    ?sourcePending.map((row)=>row.id+'='+row.status).join(', ')
    :rows.length+'/'+rows.length+' rows ported or verified',
);

const duplicateIds=rows
  .map((row)=>row.id)
  .filter((id,index,ids)=>ids.indexOf(id)!==index);
add('parity.unique-ids',duplicateIds.length===0,duplicateIds.join(', ')||'all IDs unique');

const requiredFiles=[
  'apps/studio-react/src/features/system/model.ts',
  'apps/studio-react/src/features/system/SystemAcceptancePanel.tsx',
  'apps/studio-react/src/features/system/r7-system.test.ts',
  'src/react-studio-preview.mjs',
  'tests/react-studio-preview.test.mjs',
];
const missingFiles=requiredFiles.filter((path)=>!existsSync(resolve(path)));
add(
  'r7.required-files',
  missingFiles.length===0,
  missingFiles.join(', ')||requiredFiles.length+' R7 files present',
);

const shell=text('apps/studio-react/src/shell/Shell.tsx');
const search=text('apps/studio-react/src/features/search/SearchControls.tsx');
const searchExperience=text('apps/studio-react/src/features/search/SearchExperience.tsx');
const resultList=text('apps/studio-react/src/features/search/ResultsList.tsx');
const settings=text('apps/studio-react/src/shell/SettingsPanel.tsx');
const shellCss=text('apps/studio-react/src/shell/Shell.module.css');
const server=text('src/server.mjs');
const preview=text('src/react-studio-preview.mjs');

const startupMarkers=[
  'data-rhymelab-control="shell.navigation"',
  'data-rhymelab-control="shell.language"',
  'data-rhymelab-app-shell="true"',
];
const missingShell=startupMarkers.filter((needle)=>!shell.includes(needle));
add(
  'startup.shell-controls',
  missingShell.length===0,
  missingShell.join(', ')||'shell startup control markers present',
);
add(
  'startup.search-controls',
  search.includes('data-rhymelab-control="search.languages"')
    &&search.includes('data-rhymelab-control="search.scope"')
    &&searchExperience.includes('data-rhymelab-control="search.layout"'),
  'language + scope + layout control families',
);
add(
  'search.keyboard-actions',
  resultList.includes('resultKeyboardAction(')
    &&resultList.includes('onKeyDown={handleKeyDown}'),
  'registered ResultsList key handler uses tested R7 action model',
);
add(
  'settings.owner-workspace',
  settings.includes('<StyleDesigner />')
    &&settings.includes('<DataSafetyPanel />')
    &&!settings.includes('<SystemAcceptancePanel />')
    &&!settings.includes('setCommandPaletteOpen')
    &&!settings.includes('setUiLanguage'),
  'Settings owns Style Designer + data safety without duplicate Commands/Language/diagnostics UI',
);
add(
  'shell.single-top-navigation',
  shell.includes('className={styles.topNavigation}')
    &&shell.includes('data-rhymelab-control="shell.navigation"')
    &&!shell.includes('<Sidebar')
    &&!shell.includes('<MobileNavigation')
    &&/\.appShell\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/su.test(shellCss)
    &&/\.topbar\s*\{[^}]*grid-template-columns:/su.test(shellCss),
  'single persistent Topbar owns desktop/mobile navigation; sidebar and bottom nav are retired',
);
add(
  'route.reversible-r8-cutover',
  server.includes('reactStudioPreviewMode(')
    &&server.includes("'/studio': { type: 'text/html; charset=utf-8', body: reactStudioHtml }")
    &&server.includes("legacyStudio:'/studio-legacy'")
    &&server.includes("reactStudioAlias:'/studio-react'")
    &&preview.includes("'--legacy-studio-default'"),
  'React is the normal Studio route with explicit Studio V2 rollback and /studio-react alias',
);

const verified=rows.filter((row)=>row.status==='verified');
const allVerified=verified.length===rows.length;
add(
  'parity.verified-status',
  codeOnly||allVerified,
  allVerified
    ?rows.length+'/'+rows.length+' rows verified'
    :verified.length+'/'+rows.length+' rows verified; physical/browser promotion still blocked',
);

let device=null;
if(!codeOnly){
  const explicit=values('--device-report');
  const fromEnv=String(process.env.RHYMELAB_REACT_STUDIO_DEVICE_ACCEPTANCE||'')
    .split(/[;,]/u).map((value)=>value.trim()).filter(Boolean);
  const paths=(explicit.length?explicit:fromEnv.length?fromEnv:[
    'reports/react-studio-device-acceptance.json',
  ]).map((path)=>resolve(path));
  const missing=paths.filter((path)=>!existsSync(path));
  if(missing.length){
    add(
      'device.seven-gate-report',
      false,
      'missing '+missing.join(', ')+'; provide the external/manual R7 device report with --device-report <file>',
    );
  }else{
    try{
      const reports=paths.map((path)=>parseStudioDeviceAcceptance(readFileSync(path,'utf8')));
      const merged=mergeStudioDeviceAcceptanceReports(reports);
      device=studioDeviceAcceptanceSummary(merged);
      add(
        'device.seven-gate-report',
        device.ready,
        device.ready
          ?device.passed+'/'+device.total+' physical gates passed'
          :'pending: '+device.pending.join(', '),
      );
    }catch(error){
      add('device.seven-gate-report',false,error instanceof Error?error.message:String(error));
    }
  }
}

const failed=checks.filter((check)=>!check.ok);
const report={
  schema:'rhymelab-react-studio-r7-gate-v1',
  mode:codeOnly?'code-only':'cutover',
  sourceReady:sourcePending.length===0&&checks
    .filter((check)=>!check.id.startsWith('device.')&&check.id!=='parity.verified-status')
    .every((check)=>check.ok),
  allVerified,
  device,
  ready:failed.length===0,
  parity:{
    total:rows.length,
    ported:rows.filter((row)=>row.status==='ported').length,
    inProgress:rows.filter((row)=>row.status==='in_progress').length,
    pending:rows.filter((row)=>row.status==='pending').length,
    verified:verified.length,
  },
  checks,
  failed:failed.map((check)=>check.id),
};

if(jsonOnly){
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}else{
  console.log('RhymeLab React Studio R7 gate');
  console.log('mode:',report.mode);
  for(const check of checks){
    console.log(check.ok?'PASS':'FAIL',check.id,'—',check.detail);
  }
  console.log('');
  console.log(report.ready?'READY':'NOT READY',failed.length?'('+failed.length+' failed)':'');
}
if(!report.ready)process.exitCode=codeOnly?1:2;
