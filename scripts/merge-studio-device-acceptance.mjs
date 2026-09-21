import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

import {
  mergeStudioDeviceAcceptanceReports,
  parseStudioDeviceAcceptance,
  studioDeviceAcceptanceSummary,
} from '../src/studio/device-acceptance.mjs';

const argv=process.argv.slice(2);
let output='reports/studio-v2-device-acceptance.json';
const inputs=[];

for(let index=0;index<argv.length;index++){
  const value=argv[index];
  if(value==='--out'){
    const next=argv[++index];
    if(!next)throw new Error('--out requires a file path');
    output=next;
    continue;
  }
  if(value==='--device-report'){
    const next=argv[++index];
    if(!next)throw new Error('--device-report requires a file path');
    inputs.push(next);
    continue;
  }
  if(value.startsWith('--'))throw new Error('Unknown option: '+value);
  inputs.push(value);
}

if(!inputs.length){
  console.error('Usage: node scripts/merge-studio-device-acceptance.mjs <report.json> [report2.json ...] [--out reports/studio-v2-device-acceptance.json]');
  process.exitCode=1;
}else{
  const reports=inputs.map((path)=>{
    const absolute=resolve(path);
    return parseStudioDeviceAcceptance(readFileSync(absolute,'utf8'));
  });
  const merged=mergeStudioDeviceAcceptanceReports(reports);
  const summary=studioDeviceAcceptanceSummary(merged);
  const target=resolve(output);
  mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,JSON.stringify(merged,null,2)+'\n');

  console.log('Studio device acceptance merged');
  console.log('reports:',reports.length);
  console.log('output:',target);
  console.log('passed:',summary.passed+'/'+summary.total);
  console.log('ready:',summary.ready?'yes':'no');
  if(summary.pending.length)console.log('pending:',summary.pending.join(', '));
}
