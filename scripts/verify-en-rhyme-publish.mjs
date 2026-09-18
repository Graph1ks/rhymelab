#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const dir=resolve(process.argv[2]||'data/local/en-publish-v1');
const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
if(manifest.schema!=='rhymelab-en-publish-v1') throw new Error(`Unexpected English publish schema: ${manifest.schema}`);
if(manifest.safeguards?.g2p_used!==false) throw new Error('English publish manifest must keep G2P disabled.');
if(manifest.safeguards?.english_runtime_materialized!==false) throw new Error('12B4 must not claim runtime materialization.');

const hash=createHash('sha256');
let rows=0;
let defaultEligible=0;
let previousNormalized=null;
for(const file of manifest.files||[]){
  const path=join(dir,file.file);
  const data=await readFile(path,'utf8');
  const info=await stat(path);
  if(info.size!==file.bytes) throw new Error(`Byte-size mismatch: ${file.file}`);
  const actualSha=createHash('sha256').update(data).digest('hex');
  if(actualSha!==file.sha256) throw new Error(`SHA-256 mismatch: ${file.file}`);
  hash.update(data);
  const lines=data.split(/\r?\n/u).filter(Boolean);
  if(lines.length!==file.items) throw new Error(`Row-count mismatch: ${file.file}`);
  for(const line of lines){
    const row=JSON.parse(line);
    rows+=1;
    if(!Array.isArray(row.pronunciations)||row.pronunciations.length===0) throw new Error(`Pronunciation-free publish row: ${row.normalized}`);
    if(previousNormalized!==null&&previousNormalized.localeCompare(row.normalized,'en')>0) {
      throw new Error(`English publish order is not deterministic lexical order: ${previousNormalized} > ${row.normalized}`);
    }
    previousNormalized=row.normalized;
    for(const pronunciation of row.pronunciations){
      if(!['wiktionary','cmudict'].includes(pronunciation.source)) throw new Error(`Unsupported pronunciation source: ${pronunciation.source}`);
      if(pronunciation.source==='cmudict'&&!pronunciation.locales.includes('en-US')) throw new Error(`CMUdict pronunciation without en-US locale: ${row.normalized}`);
    }
    if(row.eligibility?.default_eligible){
      defaultEligible+=1;
      if(row.eligibility.historical_only) throw new Error(`Historical-only default row: ${row.normalized}`);
      if(row.eligibility.proper_name_only) throw new Error(`Proper-name-only default row: ${row.normalized}`);
      if(row.esdb?.invalid) throw new Error(`ESDB-invalid default row: ${row.normalized}`);
      const ready=row.pronunciations.some((p)=>p.analysis_status==='ok'&&p.locales.includes('en-US'));
      if(!ready) throw new Error(`Default row lacks analyzed en-US pronunciation: ${row.normalized}`);
    }
  }
}
if(rows!==manifest.counts?.published_surfaces) throw new Error(`Manifest published surface count mismatch: ${rows}`);
if(defaultEligible!==manifest.counts?.default_eligible_surfaces) throw new Error(`Manifest default eligible count mismatch: ${defaultEligible}`);
const fingerprint=hash.digest('hex');
if(fingerprint!==manifest.semantic_fingerprint) throw new Error('English publish semantic fingerprint mismatch.');

console.log('PHASE 12B4 ENGLISH PUBLISH VERIFY PASS');
console.log(JSON.stringify({
  schema:manifest.schema,
  published_surfaces:rows,
  default_eligible_surfaces:defaultEligible,
  semantic_fingerprint:fingerprint,
  directory:dir,
},null,2));
