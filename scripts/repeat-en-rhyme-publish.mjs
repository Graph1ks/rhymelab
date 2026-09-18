#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const publishDir=resolve(process.argv[2]||'data/local/en-publish-v1');
const manifestPath=resolve(publishDir,'manifest.json');
const reportPath=resolve('data/local/en-publish-repeatability-v1-report.json');

const before=JSON.parse(await readFile(manifestPath,'utf8'));
const beforeFingerprint=String(before.semantic_fingerprint||'');
if(!beforeFingerprint) throw new Error('Existing English publish manifest is missing semantic_fingerprint.');

function run(command,args){
  const result=spawnSync(process.execPath,args,{stdio:'inherit'});
  if(result.status!==0) process.exit(result.status??1);
}

run(process.execPath,['scripts/build-en-rhyme-publish.mjs','--out',publishDir]);
run(process.execPath,['scripts/verify-en-rhyme-publish.mjs',publishDir]);

const after=JSON.parse(await readFile(manifestPath,'utf8'));
const afterFingerprint=String(after.semantic_fingerprint||'');
const equal=beforeFingerprint===afterFingerprint;
const report={
  schema:'rhymelab-en-publish-repeatability-v1',
  status:equal?'ok':'failed',
  first_fingerprint:beforeFingerprint,
  second_fingerprint:afterFingerprint,
  fingerprints_equal:equal,
  published_surfaces_before:before.counts?.published_surfaces??null,
  published_surfaces_after:after.counts?.published_surfaces??null,
  default_eligible_before:before.counts?.default_eligible_surfaces??null,
  default_eligible_after:after.counts?.default_eligible_surfaces??null,
  publish_directory:publishDir,
};
await mkdir(dirname(reportPath),{recursive:true});
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log('\nPHASE 12B4 ENGLISH PUBLISH REPEATABILITY');
console.log(JSON.stringify({...report,report:reportPath},null,2));
if(!equal) process.exitCode=1;
