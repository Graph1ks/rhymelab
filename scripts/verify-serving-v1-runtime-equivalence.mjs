#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SERVING_V1_RUNTIME_SCHEMA } from './serving-v1-runtime-core.mjs';

const args=process.argv.slice(2);
const value=(flag,fallback=null)=>{
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
};
const sampleSize=Math.max(1,Math.min(500,Number.parseInt(String(value('--sample','50')),10)||50));
const servingPath=resolve(value('--serving','data/local/rhymelab-serving-v1.sqlite'));
const reportPath=resolve(value('--report','data/local/rhymelab-serving-v1-runtime-equivalence-report.json'));

if(!existsSync(servingPath))throw new Error('Serving-v1 DB missing: '+servingPath);
const serving=new DatabaseSync(servingPath,{readOnly:true});
serving.exec('PRAGMA query_only=ON;');

const meta=Object.fromEntries(serving.prepare('SELECT key,value FROM meta').all().map((row)=>[row.key,row.value]));
if(meta.runtime_schema!==SERVING_V1_RUNTIME_SCHEMA||meta.runtime_status!=='complete'){
  serving.close();
  throw new Error('Serving-v1 runtime materialization is not complete.');
}
let sourceSnapshot;
try{sourceSnapshot=JSON.parse(meta.source_snapshot_json||'null');}catch{sourceSnapshot=null;}
if(!sourceSnapshot?.inputs){
  serving.close();
  throw new Error('Serving-v1 source snapshot is unavailable.');
}
const paths=Object.fromEntries(Object.entries(sourceSnapshot.inputs).map(([key,row])=>[key,resolve(row.path)]));

function sourceDb(path){
  const db=new DatabaseSync(path,{readOnly:true});
  db.exec('PRAGMA query_only=ON;');
  return db;
}

const targetFor=serving.prepare(`
  SELECT t.target_id,p.canonical_available,p.generated_available
  FROM surface s
  JOIN pronunciation p USING(surface_id)
  JOIN runtime_target t
    ON t.target_kind='pronunciation' AND t.pronunciation_id=p.pronunciation_id
  WHERE s.language=? AND s.normalized=? AND p.identity_key=?
`);

const actualFor=serving.prepare(`
  SELECT m.target_id
  FROM runtime_key k
  JOIN runtime_key_member m USING(key_id)
  JOIN runtime_target t ON t.target_id=m.target_id
  WHERE k.language=? AND k.channel=? AND k.key_value=?
    AND (
      ?='all'
      OR (?='core' AND t.canonical_available=1)
      OR (?='generated' AND t.canonical_available=0 AND t.generated_available=1)
    )
  ORDER BY m.target_id
`);

const sorted=(values)=>[...new Set(values.map(Number))].sort((a,b)=>a-b);
const same=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
function actual(language,channel,key,mode){
  return actualFor.all(language,channel,key,mode,mode,mode).map((row)=>Number(row.target_id));
}
function mapTarget(language,normalized,identity,mode){
  const row=targetFor.get(language,normalized,identity);
  if(!row)return null;
  if(mode==='core'&&!Number(row.canonical_available))return null;
  if(mode==='generated'&&(Number(row.canonical_available)||!Number(row.generated_available)))return null;
  return Number(row.target_id);
}

const cases=[];
function addCase(domain,layer,language,channel,key,expected){
  const mode=layer==='core'?'core':'generated';
  const expectedIds=sorted(expected.filter((id)=>id!=null));
  const actualIds=sorted(actual(language,channel,key,mode));
  cases.push({
    domain,layer,language,channel,key,
    expected_count:expectedIds.length,
    actual_count:actualIds.length,
    equal:same(expectedIds,actualIds),
    expected_target_ids:expectedIds,
    actual_target_ids:actualIds,
  });
}

function deCases(path,layer){
  const db=sourceDb(path);
  try{
    const generated=layer==='generated';
    const marker=generated?" AND h.pronunciation_flags LIKE '%secondary_opt_in%'":'';
    const keys=generated
      ?serving.prepare(`
        SELECT k.key_value AS anchor_key
        FROM runtime_key k
        JOIN runtime_key_member m USING(key_id)
        JOIN runtime_target t ON t.target_id=m.target_id
        WHERE k.language='de'
          AND k.channel='writer_right_edge'
          AND t.canonical_available=0
          AND t.generated_available=1
        GROUP BY k.key_value
        HAVING COUNT(*)>0
        ORDER BY k.key_value
        LIMIT ?
      `).all(sampleSize)
      :db.prepare(`
        SELECT anchor_key
        FROM writer_anchor
        GROUP BY anchor_key
        ORDER BY anchor_key
        LIMIT ?
      `).all(sampleSize);
    const rows=db.prepare(`
      SELECT h.normalized,h.phonemes,h.ipa,h.stress
      FROM writer_anchor a
      JOIN hot h ON h.id=a.pronunciation_id
      WHERE a.anchor_key=? AND h.pronunciation_eligible=1 ${marker}
      ORDER BY h.id
    `);
    for(const {anchor_key:key} of keys){
      const expected=rows.all(key).map((row)=>mapTarget(
        'de',row.normalized,
        (String(row.phonemes||'')||String(row.ipa||''))+'|stress:'+String(row.stress||''),
        layer,
      ));
      addCase('de_word',layer,'de','writer_right_edge',String(key),expected);
    }
  }finally{db.close();}
}

const EN_CHANNELS=[
  ['exact_tail','exact_key'],
  ['multisyllable','multisyllable_key'],
  ['vowel','vowel_key'],
  ['coda','coda_key'],
];
function enCases(path,layer){
  const db=sourceDb(path);
  try{
    const generated=layer==='generated';
    const marker=generated?" AND p.source='espeak_ng_generated_secondary'":'';
    for(const [channel,column] of EN_CHANNELS){
      const keys=db.prepare(`
        SELECT p.${column} key_value
        FROM en_pronunciation p JOIN en_form f ON f.id=p.form_id
        WHERE p.analysis_status='ok'
          AND p.default_profile_eligible=1
          AND f.default_eligible=1
          AND p.${column} IS NOT NULL
          AND p.${column}<>''
          ${marker}
        GROUP BY p.${column}
        ORDER BY p.${column}
        LIMIT ?
      `).all(sampleSize);
      const rows=db.prepare(`
        SELECT f.normalized,p.phonemes,p.raw,p.stress
        FROM en_pronunciation p JOIN en_form f ON f.id=p.form_id
        WHERE p.${column}=?
          AND p.analysis_status='ok'
          AND p.default_profile_eligible=1
          AND f.default_eligible=1
          ${marker}
        ORDER BY p.id
      `);
      for(const {key_value:key} of keys){
        const expected=rows.all(key).map((row)=>mapTarget(
          'en',row.normalized,
          (String(row.phonemes||'')||String(row.raw||''))+'|stress:'+String(row.stress||''),
          layer,
        ));
        addCase('en_word',layer,'en',channel,String(key),expected);
      }
    }
  }finally{db.close();}
}

function entityCases(path,layer){
  const db=sourceDb(path);
  try{
    const generated=layer==='generated';
    const marker=generated?" AND ep.source_kind='espeak_ng_generated_secondary'":'';
    const sampled=db.prepare(`
      SELECT DISTINCT en.language,a.channel,a.anchor_key
      FROM entity_rhyme_anchor a
      JOIN entity_pronunciation ep ON ep.pronunciation_id=a.pronunciation_id
      JOIN entity_name en ON en.name_id=ep.name_id
      WHERE en.searchable=1
        AND en.language IN ('de','en')
        AND ep.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
        AND (
          (en.language='de' AND ep.locale='de-DE' AND a.analyzer_id='de-ipa-v2')
          OR (en.language='en' AND ep.locale='en-US' AND a.analyzer_id='en-pron-v1-candidate')
        )
        ${marker}
      ORDER BY en.language,a.channel,a.anchor_key
      LIMIT ?
    `).all(sampleSize);

    const rows=db.prepare(`
      SELECT
        ep.pronunciation_id,en.language,en.normalized,ep.ipa,
        COALESCE(NULLIF(MIN(epa.phonemes),''),ep.ipa) phonemes,
        COALESCE(MIN(epa.stress_pattern),'') stress
      FROM entity_rhyme_anchor a
      JOIN entity_pronunciation ep ON ep.pronunciation_id=a.pronunciation_id
      JOIN entity_name en ON en.name_id=ep.name_id
      LEFT JOIN entity_phonetic_analysis epa ON epa.pronunciation_id=ep.pronunciation_id
      WHERE en.language=?
        AND a.channel=?
        AND a.anchor_key=?
        AND en.searchable=1
        AND ep.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
        AND (
          (en.language='de' AND ep.locale='de-DE' AND a.analyzer_id='de-ipa-v2')
          OR (en.language='en' AND ep.locale='en-US' AND a.analyzer_id='en-pron-v1-candidate')
        )
        ${marker}
      GROUP BY ep.pronunciation_id
      ORDER BY ep.pronunciation_id
    `);

    for(const sampledKey of sampled){
      const channel=sampledKey.channel==='exact_tail'?'entity_exact_tail'
        :sampledKey.channel==='vowel_sequence'?'entity_vowel_sequence'
        :sampledKey.channel==='vowel_family'?'entity_vowel_family'
        :sampledKey.channel==='final_nucleus_coda'?'entity_final_nucleus_coda'
        :sampledKey.channel==='final_nucleus'?'entity_final_nucleus'
        :String(sampledKey.channel).startsWith('writer_')?'entity_writer_right_edge'
        :'entity_'+sampledKey.channel;
      const expected=rows.all(
        sampledKey.language,
        sampledKey.channel,
        sampledKey.anchor_key,
      ).map((row)=>mapTarget(
        row.language,
        row.normalized,
        String(row.phonemes||row.ipa||'')+'|stress:'+String(row.stress||''),
        layer,
      ));
      addCase(
        'entity',
        layer,
        sampledKey.language,
        channel,
        String(sampledKey.anchor_key),
        expected,
      );
    }
  }finally{db.close();}
}

function phraseCases(path,layer){
  const db=sourceDb(path);
  try{
    const generated=layer==='generated';
    const marker=generated
      ?" AND EXISTS(SELECT 1 FROM phrase_pronunciation_token ppt WHERE ppt.phrase_pronunciation_id=w.phrase_pronunciation_id AND ppt.pronunciation_source='eSpeak-NG Backfill V2')"
      :'';
    const keys=db.prepare(`
      SELECT a.exact_tail_key key_value
      FROM phrase_mosaic_retrieval_anchor a
      JOIN phrase_mosaic_window w USING(window_id)
      WHERE 1=1 ${marker}
      GROUP BY a.exact_tail_key
      ORDER BY a.exact_tail_key
      LIMIT ?
    `).all(sampleSize);
    const rows=db.prepare(`
      SELECT w.window_id
      FROM phrase_mosaic_retrieval_anchor a
      JOIN phrase_mosaic_window w USING(window_id)
      WHERE a.exact_tail_key=? ${marker}
      ORDER BY w.window_id
    `);
    const lookupTarget=serving.prepare('SELECT target_id FROM runtime_target WHERE runtime_window_id=?');
    for(const {key_value:key} of keys){
      const expected=rows.all(key).map((row)=>{
        const runtimeWindowId=layer+':'+row.window_id;
        return lookupTarget.get(runtimeWindowId)?.target_id??null;
      });
      addCase('phrase',layer,'de','phrase_exact_tail',String(key),expected);
    }
  }finally{db.close();}
}

try{
  deCases(paths.deCore,'core');
  deCases(paths.deGenerated,'generated');
  enCases(paths.enCore,'core');
  enCases(paths.enGenerated,'generated');
  entityCases(paths.entityCore,'core');
  entityCases(paths.entityGenerated,'generated');
  phraseCases(paths.phraseCore,'core');
  phraseCases(paths.phraseGenerated,'generated');

  const failed=cases.filter((row)=>!row.equal);
  const generatedDeCases=cases.filter(
    (row)=>row.domain==='de_word'
      &&row.layer==='generated'
      &&row.channel==='writer_right_edge'
  );
  const generatedDeNonEmpty=generatedDeCases.filter(
    (row)=>row.expected_count>0&&row.actual_count>0
  ).length;
  const coverageFailures=[];
  if(generatedDeCases.length<sampleSize){
    coverageFailures.push({
      gate:'de_generated_writer_right_edge_sample_size',
      expected:sampleSize,
      actual:generatedDeCases.length,
    });
  }
  if(generatedDeNonEmpty!==generatedDeCases.length){
    coverageFailures.push({
      gate:'de_generated_writer_right_edge_non_empty',
      expected:generatedDeCases.length,
      actual:generatedDeNonEmpty,
    });
  }
  const report={
    schema:'rhymelab-serving-v1-runtime-retrieval-equivalence-v2',
    status:(failed.length||coverageFailures.length)?'failed':'accepted',
    runtime_semantic_fingerprint:meta.runtime_semantic_fingerprint||null,
    sample_size_per_channel:sampleSize,
    cases,
    totals:{
      cases:cases.length,
      passed:cases.length-failed.length,
      failed:failed.length,
      coverage_failed:coverageFailures.length,
      de_generated_writer_right_edge_non_empty:generatedDeNonEmpty,
    },
    failed_cases:failed,
    coverage_failures:coverageFailures,
    scope:'retrieval-key membership equivalence only; generated DE sampling is guaranteed non-empty; ranking/response equivalence remains deferred until the Serving runtime adapter exists',
  };
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({
    schema:report.schema,
    status:report.status,
    cases:report.totals.cases,
    passed:report.totals.passed,
    failed:report.totals.failed,
    report:reportPath,
  },null,2));
  if(failed.length||coverageFailures.length)process.exitCode=1;
}finally{
  serving.close();
}
