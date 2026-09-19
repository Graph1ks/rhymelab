#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_EN_PHONETIC_RUNTIME,
  ENTITY_EN_RUNTIME_ANALYZER,
} from './entity-pronunciation-core.mjs';

const ACCEPTED_DE_RUNTIME_FINGERPRINT=
  '38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const dbPath=resolve(argValue('--entities','data/local/rhymelab-entities-v1.sqlite'));
const reportPath=resolve(
  argValue('--report','data/local/entity-multilingual-runtime-v1-report.json')
);
const outArg=argValue('--out',null);
const outPath=outArg?resolve(outArg):null;
if(!existsSync(dbPath)) throw new Error(`Entity database missing: ${dbPath}`);
if(!existsSync(reportPath)) throw new Error(`Multilingual runtime report missing: ${reportPath}`);

const report=JSON.parse(await readFile(reportPath,'utf8'));
const db=new DatabaseSync(dbPath,{readOnly:true});
db.exec('PRAGMA query_only=ON;');

function meta(key){
  return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
}
function scalar(sql,...params){
  return Number(Object.values(db.prepare(sql).get(...params)||{c:0})[0]||0);
}

try{
  const missingEnglishAnalysisCount=scalar(`
    SELECT COUNT(*) AS c
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    LEFT JOIN entity_phonetic_analysis a
      ON a.pronunciation_id=p.pronunciation_id
     AND a.analyzer_id=?
    WHERE n.language='en'
      AND p.locale='en-US'
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
      AND a.pronunciation_id IS NULL
  `,ENTITY_EN_RUNTIME_ANALYZER);
  const missingEnglishAnalysisSamples=db.prepare(`
    SELECT p.pronunciation_id,p.name_id,n.surface,p.ipa,p.source_kind,p.generated,p.review_state
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    LEFT JOIN entity_phonetic_analysis a
      ON a.pronunciation_id=p.pronunciation_id
     AND a.analyzer_id=?
    WHERE n.language='en'
      AND p.locale='en-US'
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
      AND a.pronunciation_id IS NULL
    ORDER BY p.pronunciation_id
    LIMIT 25
  `).all(ENTITY_EN_RUNTIME_ANALYZER);

  const checks=[
    {
      id:'report_ok',
      pass:report.schema==='rhymelab-entity-multilingual-runtime-v1'
        &&report.status==='ok',
    },
    {
      id:'de_runtime_fingerprint_preserved',
      pass:meta('entity_phonetic_runtime_fingerprint')===ACCEPTED_DE_RUNTIME_FINGERPRINT,
    },
    {
      id:'english_runtime_id',
      pass:meta('entity_phonetic_runtime_en')===ENTITY_EN_PHONETIC_RUNTIME,
    },
    {
      id:'english_analyzer_id',
      pass:meta('entity_phonetic_analyzer_en')===ENTITY_EN_RUNTIME_ANALYZER,
    },
    {
      id:'english_analysis_count_nonzero',
      pass:Number(meta('entity_phonetic_analyses_en')||0)>0,
    },
    {
      id:'english_anchor_count_nonzero',
      pass:Number(meta('entity_rhyme_anchors_en')||0)>0,
    },
    {
      id:'english_generated_runtime_rows_zero',
      pass:scalar(`
        SELECT COUNT(*) AS c
        FROM entity_pronunciation p
        JOIN entity_name n USING(name_id)
        WHERE n.language='en'
          AND p.locale='en-US'
          AND p.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
          AND p.generated<>0
      `)===0,
    },
    {
      id:'english_runtime_rows_have_analysis',
      pass:missingEnglishAnalysisCount===0,
    },
  ];
  const failed=checks.filter((row)=>!row.pass);
  const summary={
    schema:'rhymelab-entity-multilingual-runtime-verification-v1',
    status:failed.length?'failed':'ok',
    checks,
    failed_checks:failed.map((row)=>row.id),
    de_runtime_fingerprint:meta('entity_phonetic_runtime_fingerprint'),
    en_runtime_fingerprint:meta('entity_phonetic_runtime_fingerprint_en'),
    en_names_ready:Number(meta('entity_en_names_ready')||0),
    en_analyses:Number(meta('entity_phonetic_analyses_en')||0),
    en_anchors:Number(meta('entity_rhyme_anchors_en')||0),
    en_runtime_rows_missing_analysis:missingEnglishAnalysisCount,
    en_runtime_rows_missing_analysis_samples:missingEnglishAnalysisSamples,
  };
  if(outPath){
    await mkdir(dirname(outPath),{recursive:true});
    await writeFile(outPath,JSON.stringify(summary,null,2)+'\n','utf8');
  }
  console.log(JSON.stringify({...summary,report:outPath},null,2));
  if(failed.length) process.exitCode=1;
}finally{
  db.close();
}
