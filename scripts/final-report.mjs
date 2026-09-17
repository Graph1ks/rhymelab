#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reportPath = resolve('reports/rhymelab-report.json');
function run(command,args){return spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});}
function parseJsonOutput(result,label){if(result.status!==0){const message=String(result.stderr||result.stdout||`${label} failed`).trim();throw new Error(`${label} failed with exit ${result.status??'unknown'}: ${message.slice(-4000)}`);}const raw=String(result.stdout||'').trim(),start=raw.indexOf('{'),end=raw.lastIndexOf('}');if(start<0||end<start)throw new Error(`${label} did not return JSON`);return JSON.parse(raw.slice(start,end+1));}

const base=run(process.execPath,['--no-warnings','scripts/report.mjs']);
if(base.status!==0){process.stdout.write(base.stdout||'');process.stderr.write(base.stderr||'');process.exit(base.status??1);}
const report=JSON.parse(await readFile(reportPath,'utf8'));
try{const result=run(process.execPath,['--no-warnings','scripts/rhyme-type-audit.mjs']);report.rhyme_type_audit=parseJsonOutput(result,'rhyme relation audit');if(!report.rhyme_type_audit.ok&&report.status==='ok')report.status='attention';}catch(error){report.rhyme_type_audit={ok:false,error:error instanceof Error?error.message:String(error)};if(report.status==='ok')report.status='attention';}
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
const gates=report.gates||{},passed=Object.values(gates).filter(Boolean).length,total=Object.keys(gates).length;
console.log(`RhymeLab report: ${String(report.status||'unknown').toUpperCase()}`);if(total)console.log(`QA gates: ${passed}/${total}`);if(report.pronunciation_audit)console.log(`Pronunciation audit: ${report.pronunciation_audit.ok?'OK':'ATTENTION'}`);if(report.modern_lexicon_audit)console.log(`Modern lexicon audit: ${report.modern_lexicon_audit.ok?'OK':'ATTENTION'}`);console.log(`Rhyme relation audit: ${report.rhyme_type_audit?.ok?'OK':'ATTENTION'}`);console.log(`Saved: ${reportPath}`);console.log('Upload this file here: reports\\rhymelab-report.json');
