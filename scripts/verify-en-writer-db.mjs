#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  ENGLISH_WRITER_DB_SCHEMA,
  ENGLISH_WRITER_RETRIEVAL_POLICY,
  englishRetrievalQueryPlans,
  fingerprintEnglishWriterDb,
} from './en-writer-db-core.mjs';

const dbPath=resolve(process.argv[2]||'data/local/rhymelab-en-v1.sqlite');
const reportPath=resolve(process.argv[3]||'data/local/en-writer-db-v1-report.json');
const report=JSON.parse(await readFile(reportPath,'utf8'));
const verificationReportPath=resolve(process.argv[4]||'data/local/en-writer-db-verification-v1-report.json');
const db=new DatabaseSync(dbPath,{readOnly:true});

const scalar=(sql,...args)=>Number(Object.values(db.prepare(sql).get(...args))[0]);
const meta=(key)=>db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
const ids=(sql,...args)=>db.prepare(sql).all(...args).map((row)=>Number(row.id));

function sameIds(a,b){
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}

try{
  if(meta('schema')!==ENGLISH_WRITER_DB_SCHEMA) throw new Error(`Unexpected English DB schema: ${meta('schema')}`);
  if(meta('retrieval_policy')!==ENGLISH_WRITER_RETRIEVAL_POLICY) throw new Error(`Unexpected English retrieval policy: ${meta('retrieval_policy')}`);
  if(meta('publish_fingerprint')!==report.source_publish_fingerprint) throw new Error('English DB publish fingerprint differs from build report.');

  const forms=scalar('SELECT COUNT(*) FROM en_form');
  const defaultEligible=scalar('SELECT COUNT(*) FROM en_form WHERE default_eligible=1');
  const pronunciations=scalar('SELECT COUNT(*) FROM en_pronunciation');
  const analyzed=scalar("SELECT COUNT(*) FROM en_pronunciation WHERE analysis_status='ok'");
  const unresolved=pronunciations-analyzed;
  const defaultProfile=scalar('SELECT COUNT(*) FROM en_pronunciation WHERE default_profile_eligible=1');

  const expected={
    forms:report.forms,
    defaultEligible:report.default_eligible_forms,
    pronunciations:report.pronunciations,
    analyzed:report.analyzed_pronunciations,
    unresolved:report.unresolved_pronunciations,
    defaultProfile:report.default_profile_pronunciations,
  };
  const actual={forms,defaultEligible,pronunciations,analyzed,unresolved,defaultProfile};
  for(const key of Object.keys(expected)){
    if(actual[key]!==expected[key]) throw new Error(`English DB count mismatch for ${key}: ${actual[key]} != ${expected[key]}`);
  }

  const duplicateNormalized=scalar(`
    SELECT COUNT(*) FROM (
      SELECT normalized FROM en_form GROUP BY normalized HAVING COUNT(*)>1
    )
  `);
  if(duplicateNormalized!==0) throw new Error(`English DB contains ${duplicateNormalized} duplicate normalized forms.`);

  const defaultWithoutPron=scalar(`
    SELECT COUNT(*) FROM en_form f
    WHERE f.default_eligible=1
      AND NOT EXISTS (
        SELECT 1 FROM en_pronunciation p
        WHERE p.form_id=f.id AND p.default_profile_eligible=1
      )
  `);
  if(defaultWithoutPron!==0) throw new Error(`Default-eligible forms without en-US indexed pronunciation: ${defaultWithoutPron}`);

  const invalidDefaultPron=scalar(`
    SELECT COUNT(*) FROM en_pronunciation p
    JOIN en_form f ON f.id=p.form_id
    WHERE p.default_profile_eligible=1
      AND (
        p.analysis_status!='ok'
        OR p.locale_us!=1
        OR f.default_eligible!=1
        OR p.exact_key IS NULL
      )
  `);
  if(invalidDefaultPron!==0) throw new Error(`Invalid default-profile pronunciation rows: ${invalidDefaultPron}`);

  const plans=englishRetrievalQueryPlans(db);
  const requiredIndexes={
    exact:'idx_en_pron_exact',
    multi:'idx_en_pron_multi',
    vowel:'idx_en_pron_vowel',
    family_coda:'idx_en_pron_family_coda',
    coda:'idx_en_pron_coda',
  };
  for(const [kind,indexName] of Object.entries(requiredIndexes)){
    if(!(plans[kind]||[]).some((line)=>line.includes(indexName))){
      throw new Error(`English retrieval plan for ${kind} does not use ${indexName}`);
    }
  }

  const channels=[
    {
      kind:'exact',
      sample:"SELECT DISTINCT exact_key AS a FROM en_pronunciation WHERE default_profile_eligible=1 AND exact_key IS NOT NULL ORDER BY a LIMIT 20",
      multiSample:"SELECT exact_key AS a,COUNT(*) AS result_count FROM en_pronunciation WHERE default_profile_eligible=1 AND exact_key IS NOT NULL GROUP BY exact_key HAVING COUNT(*)>1 ORDER BY result_count DESC,a LIMIT 20",
      indexed:'SELECT id FROM en_pronunciation WHERE exact_key=? AND default_profile_eligible=1 ORDER BY id',
      scan:'SELECT id FROM en_pronunciation NOT INDEXED WHERE exact_key=? AND default_profile_eligible=1 ORDER BY id',
      args:(row)=>[row.a],
    },
    {
      kind:'multi',
      sample:"SELECT DISTINCT multisyllable_key AS a FROM en_pronunciation WHERE default_profile_eligible=1 AND multisyllable_key IS NOT NULL ORDER BY a LIMIT 20",
      multiSample:"SELECT multisyllable_key AS a,COUNT(*) AS result_count FROM en_pronunciation WHERE default_profile_eligible=1 AND multisyllable_key IS NOT NULL GROUP BY multisyllable_key HAVING COUNT(*)>1 ORDER BY result_count DESC,a LIMIT 20",
      indexed:'SELECT id FROM en_pronunciation WHERE multisyllable_key=? AND default_profile_eligible=1 ORDER BY id',
      scan:'SELECT id FROM en_pronunciation NOT INDEXED WHERE multisyllable_key=? AND default_profile_eligible=1 ORDER BY id',
      args:(row)=>[row.a],
    },
    {
      kind:'vowel',
      sample:"SELECT DISTINCT vowel_key AS a FROM en_pronunciation WHERE default_profile_eligible=1 AND vowel_key IS NOT NULL ORDER BY a LIMIT 20",
      multiSample:"SELECT vowel_key AS a,COUNT(*) AS result_count FROM en_pronunciation WHERE default_profile_eligible=1 AND vowel_key IS NOT NULL GROUP BY vowel_key HAVING COUNT(*)>1 ORDER BY result_count DESC,a LIMIT 20",
      indexed:'SELECT id FROM en_pronunciation WHERE vowel_key=? AND default_profile_eligible=1 ORDER BY id',
      scan:'SELECT id FROM en_pronunciation NOT INDEXED WHERE vowel_key=? AND default_profile_eligible=1 ORDER BY id',
      args:(row)=>[row.a],
    },
    {
      kind:'family_coda',
      sample:"SELECT DISTINCT vowel_family AS a,coda_class AS b FROM en_pronunciation WHERE default_profile_eligible=1 AND vowel_family IS NOT NULL AND coda_class IS NOT NULL ORDER BY a,b LIMIT 20",
      multiSample:"SELECT vowel_family AS a,coda_class AS b,COUNT(*) AS result_count FROM en_pronunciation WHERE default_profile_eligible=1 AND vowel_family IS NOT NULL AND coda_class IS NOT NULL GROUP BY vowel_family,coda_class HAVING COUNT(*)>1 ORDER BY result_count DESC,a,b LIMIT 20",
      indexed:'SELECT id FROM en_pronunciation WHERE vowel_family=? AND coda_class=? AND default_profile_eligible=1 ORDER BY id',
      scan:'SELECT id FROM en_pronunciation NOT INDEXED WHERE vowel_family=? AND coda_class=? AND default_profile_eligible=1 ORDER BY id',
      args:(row)=>[row.a,row.b],
    },
    {
      kind:'coda',
      sample:"SELECT DISTINCT coda_key AS a FROM en_pronunciation WHERE default_profile_eligible=1 AND coda_key IS NOT NULL ORDER BY a LIMIT 20",
      multiSample:"SELECT coda_key AS a,COUNT(*) AS result_count FROM en_pronunciation WHERE default_profile_eligible=1 AND coda_key IS NOT NULL GROUP BY coda_key HAVING COUNT(*)>1 ORDER BY result_count DESC,a LIMIT 20",
      indexed:'SELECT id FROM en_pronunciation WHERE coda_key=? AND default_profile_eligible=1 ORDER BY id',
      scan:'SELECT id FROM en_pronunciation NOT INDEXED WHERE coda_key=? AND default_profile_eligible=1 ORDER BY id',
      args:(row)=>[row.a],
    },
  ];

  const equivalence=[];
  for(const channel of channels){
    let mismatches=0;
    let multiResultMismatches=0;
    const samples=db.prepare(channel.sample).all();
    for(const sample of samples){
      const args=channel.args(sample);
      if(!sameIds(ids(channel.indexed,...args),ids(channel.scan,...args))) mismatches+=1;
    }

    const multiResultSamples=db.prepare(channel.multiSample).all();
    if(multiResultSamples.length===0){
      throw new Error(`English retrieval equivalence has no multi-result samples for ${channel.kind}`);
    }
    for(const sample of multiResultSamples){
      const args=channel.args(sample);
      const indexedIds=ids(channel.indexed,...args);
      const scanIds=ids(channel.scan,...args);
      if(indexedIds.length<2||scanIds.length<2){
        throw new Error(`Expected multi-result retrieval sample for ${channel.kind} but got fewer than two rows.`);
      }
      if(!sameIds(indexedIds,scanIds)) multiResultMismatches+=1;
    }

    equivalence.push({
      kind:channel.kind,
      samples:samples.length,
      mismatches,
      multi_result_samples:multiResultSamples.length,
      max_multi_result_size:Math.max(...multiResultSamples.map((row)=>Number(row.result_count)||0)),
      multi_result_mismatches:multiResultMismatches,
    });
    if(mismatches||multiResultMismatches){
      throw new Error(
        `Indexed retrieval equivalence failed for ${channel.kind}: single/general=${mismatches}, multi-result=${multiResultMismatches}`
      );
    }
  }

  const semanticFingerprint=fingerprintEnglishWriterDb(db);
  if(semanticFingerprint!==report.semantic_fingerprint) throw new Error('English Writer DB semantic fingerprint mismatch.');
  if(meta('semantic_fingerprint')!==semanticFingerprint) throw new Error('English Writer DB metadata fingerprint mismatch.');

  const foreignKeyViolations=db.prepare('PRAGMA foreign_key_check').all();
  if(foreignKeyViolations.length) throw new Error(`English Writer DB foreign-key violations: ${foreignKeyViolations.length}`);

  const verificationReport={
    schema:'rhymelab-en-writer-db-verification-v1',
    status:'ok',
    database_schema:ENGLISH_WRITER_DB_SCHEMA,
    retrieval_policy:ENGLISH_WRITER_RETRIEVAL_POLICY,
    database:dbPath,
    build_report:reportPath,
    source_publish_fingerprint:report.source_publish_fingerprint,
    forms,
    default_eligible_forms:defaultEligible,
    pronunciations,
    analyzed_pronunciations:analyzed,
    unresolved_pronunciations:unresolved,
    default_profile_pronunciations:defaultProfile,
    retrieval_query_plans:plans,
    retrieval_equivalence:equivalence,
    semantic_fingerprint:semanticFingerprint,
    foreign_key_violations:foreignKeyViolations.length,
  };
  await mkdir(dirname(verificationReportPath),{recursive:true});
  await writeFile(verificationReportPath,JSON.stringify(verificationReport,null,2)+'\n');

  console.log('PHASE 12B5 ENGLISH WRITER DB VERIFY PASS');
  console.log(JSON.stringify({...verificationReport,verification_report:verificationReportPath},null,2));
}finally{
  db.close();
}
