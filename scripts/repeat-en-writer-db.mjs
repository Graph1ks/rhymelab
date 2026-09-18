#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const publishDir=resolve(argValue('--publish','data/local/en-publish-v1'));
const dbPath=resolve(argValue('--out','data/local/rhymelab-en-v1.sqlite'));
const buildReportPath=resolve(argValue('--report','data/local/en-writer-db-v1-report.json'));
const publishRepeatabilityPath=resolve(argValue('--publish-repeatability','data/local/en-publish-repeatability-v1-report.json'));
const repeatabilityReportPath=resolve(argValue('--repeat-report','data/local/en-writer-db-repeatability-v1-report.json'));

function run(script,scriptArgs){
  const result=spawnSync(process.execPath,[script,...scriptArgs],{stdio:'inherit'});
  if(result.status!==0) process.exit(result.status??1);
}

function snapshot(report){
  return {
    semantic_fingerprint:String(report.semantic_fingerprint||''),
    source_publish_fingerprint:String(report.source_publish_fingerprint||''),
    forms:Number(report.forms||0),
    default_eligible_forms:Number(report.default_eligible_forms||0),
    pronunciations:Number(report.pronunciations||0),
    analyzed_pronunciations:Number(report.analyzed_pronunciations||0),
    unresolved_pronunciations:Number(report.unresolved_pronunciations||0),
    default_profile_pronunciations:Number(report.default_profile_pronunciations||0),
    database_bytes:Number(report.database_bytes||0),
  };
}

function sameSnapshot(a,b){
  return Object.keys(a).every((key)=>a[key]===b[key]);
}

const buildArgs=[
  '--publish',publishDir,
  '--out',dbPath,
  '--report',buildReportPath,
  '--repeatability',publishRepeatabilityPath,
];

run('scripts/build-en-writer-db.mjs',buildArgs);
run('scripts/verify-en-writer-db.mjs',[dbPath,buildReportPath]);
const first=snapshot(JSON.parse(await readFile(buildReportPath,'utf8')));
if(!first.semantic_fingerprint) throw new Error('First English DB build report is missing semantic_fingerprint.');

run('scripts/build-en-writer-db.mjs',buildArgs);
run('scripts/verify-en-writer-db.mjs',[dbPath,buildReportPath]);
const second=snapshot(JSON.parse(await readFile(buildReportPath,'utf8')));
if(!second.semantic_fingerprint) throw new Error('Second English DB build report is missing semantic_fingerprint.');

const equal=sameSnapshot(first,second);
const report={
  schema:'rhymelab-en-writer-db-repeatability-v1',
  status:equal?'ok':'failed',
  fingerprints_equal:first.semantic_fingerprint===second.semantic_fingerprint,
  snapshots_equal:equal,
  first,
  second,
  database:dbPath,
  build_report:buildReportPath,
  source_publish_repeatability:publishRepeatabilityPath,
};
await mkdir(dirname(repeatabilityReportPath),{recursive:true});
await writeFile(repeatabilityReportPath,JSON.stringify(report,null,2)+'\n');

console.log('\nPHASE 12B5 ENGLISH WRITER DB REPEATABILITY');
console.log(JSON.stringify({...report,report:repeatabilityReportPath},null,2));
if(!equal) process.exitCode=1;
