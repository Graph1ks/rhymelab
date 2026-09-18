#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  ENGLISH_WRITER_DB_SCHEMA,
  ENGLISH_WRITER_RETRIEVAL_POLICY,
  createEnglishWriterDbStorage,
  englishRetrievalQueryPlans,
  fingerprintEnglishWriterDb,
  insertEnglishPublishRow,
  prepareEnglishWriterDbInserts,
} from './en-writer-db-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const publishDir=resolve(argValue('--publish','data/local/en-publish-v1'));
const dbPath=resolve(argValue('--out','data/local/rhymelab-en-v1.sqlite'));
const reportPath=resolve(argValue('--report','data/local/en-writer-db-v1-report.json'));
const repeatabilityPath=resolve(argValue('--repeatability','data/local/en-publish-repeatability-v1-report.json'));

const manifest=JSON.parse(await readFile(join(publishDir,'manifest.json'),'utf8'));
if(manifest.schema!=='rhymelab-en-publish-v1') throw new Error(`Unexpected English publish schema: ${manifest.schema}`);
const repeatability=JSON.parse(await readFile(repeatabilityPath,'utf8'));
if(repeatability.schema!=='rhymelab-en-publish-repeatability-v1'||repeatability.status!=='ok'||repeatability.fingerprints_equal!==true){
  throw new Error('12B5 requires a passing English publish repeatability report. Run: npm run en:publish:repeatability');
}
if(repeatability.second_fingerprint!==manifest.semantic_fingerprint){
  throw new Error('English publish repeatability fingerprint does not match current publish manifest.');
}

await mkdir(dirname(dbPath),{recursive:true});
await rm(dbPath,{force:true});
const db=new DatabaseSync(dbPath);
const scalar=(sql)=>Number(Object.values(db.prepare(sql).get())[0]);
const mib=(bytes)=>Number((Number(bytes||0)/1024/1024).toFixed(2));

let forms=0;
let defaultEligibleForms=0;
let pronunciations=0;
let analyzedPronunciations=0;
let defaultProfilePronunciations=0;

try{
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-100000;');
  createEnglishWriterDbStorage(db);
  const insert=prepareEnglishWriterDbInserts(db);

  for(let index=0;index<(manifest.files||[]).length;index+=1){
    const info=manifest.files[index];
    const text=await readFile(join(publishDir,info.file),'utf8');
    const lines=text.split(/\r?\n/u).filter(Boolean);
    if(lines.length!==info.items) throw new Error(`English publish shard count mismatch: ${info.file}`);
    db.exec('BEGIN');
    try{
      for(const line of lines){
        const row=JSON.parse(line);
        const counts=insertEnglishPublishRow(insert,row);
        forms+=1;
        defaultEligibleForms+=row.eligibility?.default_eligible?1:0;
        pronunciations+=counts.pronunciations;
        analyzedPronunciations+=counts.indexed;
        defaultProfilePronunciations+=counts.defaultProfile;
      }
      db.exec('COMMIT');
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
    if((index+1)%25===0||index+1===manifest.files.length){
      console.log(
        `12B5: loaded ${forms.toLocaleString('en-US')} forms / ${pronunciations.toLocaleString('en-US')} pronunciations (${index+1}/${manifest.files.length} shards)`
      );
    }
  }

  const expected=manifest.counts||{};
  if(forms!==expected.published_surfaces) throw new Error(`Form mismatch: ${forms} != ${expected.published_surfaces}`);
  if(defaultEligibleForms!==expected.default_eligible_surfaces) throw new Error(`Default form mismatch: ${defaultEligibleForms} != ${expected.default_eligible_surfaces}`);
  if(pronunciations!==expected.pronunciation_variants) throw new Error(`Pronunciation mismatch: ${pronunciations} != ${expected.pronunciation_variants}`);
  if(analyzedPronunciations!==expected.analyzed_pronunciation_variants) throw new Error(`Analyzed pronunciation mismatch: ${analyzedPronunciations} != ${expected.analyzed_pronunciation_variants}`);

  db.exec('ANALYZE; PRAGMA optimize;');
  const plans=englishRetrievalQueryPlans(db);
  const requiredIndexes={
    exact:'idx_en_pron_exact',
    vowel:'idx_en_pron_vowel',
    family_coda:'idx_en_pron_family_coda',
    coda:'idx_en_pron_coda',
  };
  for(const [kind,indexName] of Object.entries(requiredIndexes)){
    const detail=plans[kind]||[];
    if(!detail.some((line)=>line.includes(indexName))) throw new Error(`English retrieval query plan for ${kind} does not use ${indexName}: ${detail.join(' | ')}`);
  }

  const meta=db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  const metadata={
    schema:ENGLISH_WRITER_DB_SCHEMA,
    language:'en',
    default_locale:'en-US',
    retrieval_policy:ENGLISH_WRITER_RETRIEVAL_POLICY,
    publish_schema:manifest.schema,
    publish_fingerprint:manifest.semantic_fingerprint,
    publish_repeatability_schema:repeatability.schema,
    forms,
    default_eligible_forms:defaultEligibleForms,
    pronunciations,
    analyzed_pronunciations:analyzedPronunciations,
    default_profile_pronunciations:defaultProfilePronunciations,
    broad_g2p:false,
    product_en_enabled:false,
  };
  for(const [key,value] of Object.entries(metadata)) meta.run(key,String(value));

  const semanticFingerprint=fingerprintEnglishWriterDb(db);
  meta.run('semantic_fingerprint',semanticFingerprint);

  db.exec('VACUUM;');
  const databaseBytes=(await stat(dbPath)).size;
  const report={
    schema:'rhymelab-en-writer-db-v1-build-report',
    status:'ok',
    database_schema:ENGLISH_WRITER_DB_SCHEMA,
    retrieval_policy:ENGLISH_WRITER_RETRIEVAL_POLICY,
    database:dbPath,
    source_publish_directory:publishDir,
    source_publish_fingerprint:manifest.semantic_fingerprint,
    source_publish_repeatability_fingerprint:repeatability.second_fingerprint,
    forms,
    default_eligible_forms:defaultEligibleForms,
    pronunciations,
    analyzed_pronunciations:analyzedPronunciations,
    unresolved_pronunciations:pronunciations-analyzedPronunciations,
    default_profile_pronunciations:defaultProfilePronunciations,
    database_bytes:databaseBytes,
    database_mib:mib(databaseBytes),
    semantic_fingerprint:semanticFingerprint,
    retrieval_query_plans:plans,
    safeguards:{
      product_en_enabled:false,
      german_database_mutated:false,
      broad_g2p:false,
      runtime_api_rewired:false,
    },
  };
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log('\nPHASE 12B5 ENGLISH WRITER DB MATERIALIZATION COMPLETE');
  console.log(JSON.stringify({...report,report:reportPath},null,2));
}finally{
  db.close();
}
