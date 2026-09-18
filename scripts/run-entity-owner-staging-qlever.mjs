#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const args=process.argv.slice(2);
let bootstrapReportPath='data/local/entity-source-bootstrap-v1-report.json';
let qleverSourceReportPath='data/local/entity-qlever-source-v1-report.json';
let retrievalLabel=new Date().toISOString().slice(0,10).replaceAll('-','');
let endpoint='https://qlever.dev/api/wikidata';
let skipFetch=false;

for(let i=0;i<args.length;i+=1){
  const arg=args[i];
  if(arg==='--bootstrap-report') bootstrapReportPath=args[++i]||bootstrapReportPath;
  else if(arg==='--qlever-source-report') qleverSourceReportPath=args[++i]||qleverSourceReportPath;
  else if(arg==='--retrieval-label') retrievalLabel=args[++i]||retrievalLabel;
  else if(arg==='--endpoint') endpoint=args[++i]||endpoint;
  else if(arg==='--skip-fetch') skipFetch=true;
}
bootstrapReportPath=resolve(bootstrapReportPath);
qleverSourceReportPath=resolve(qleverSourceReportPath);

const bootstrap=JSON.parse(await readFile(bootstrapReportPath,'utf8'));
if(bootstrap.schema!=='rhymelab-entity-source-bootstrap-report-v1'||bootstrap.status!=='ok'){
  throw new Error('Entity source bootstrap report is missing or not accepted.');
}
if(!bootstrap.qrank?.local_sha256||!bootstrap.qrank?.path){
  throw new Error('Pinned local QRank source is missing from the bootstrap report.');
}

async function runNode(script,scriptArgs=[]){
  await new Promise((resolvePromise,reject)=>{
    const child=spawn(process.execPath,['--no-warnings',script,...scriptArgs],{
      stdio:'inherit',
      windowsHide:false,
    });
    child.once('error',reject);
    child.once('exit',(code,signal)=>{
      if(code===0) resolvePromise();
      else reject(new Error(`${script} failed: exit=${code} signal=${signal||''}`));
    });
  });
}

if(!skipFetch){
  await runNode('scripts/fetch-qlever-entity-source.mjs',[
    '--retrieval-label',retrievalLabel,
    '--endpoint',endpoint,
    '--report',qleverSourceReportPath,
  ]);
}

await runNode('scripts/stage-qlever-entities.mjs',[
  '--source-report',qleverSourceReportPath,
]);

await runNode('scripts/stage-qrank.mjs',[
  '--input',bootstrap.qrank.path,
  '--snapshot',bootstrap.qrank.snapshot_label,
  '--source-url',bootstrap.qrank.url,
  '--input-sha256',bootstrap.qrank.local_sha256,
]);

await runNode('scripts/diagnose-entity-cut.mjs',[]);
