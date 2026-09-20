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
    const keys=db.prepare(`
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
    const sourceRows=db.prepare(`
      SELECT
        ep.pronunciation_id,en.language,en.normalized,ep.ipa,
        COALESCE(NULLIF(MIN(epa.phonemes),''),ep.ipa) phonemes,
        COALESCE(MIN(epa.stress_pattern),'') stress
      FROM entity_pronunciation ep
      JOIN entity_name en ON en.name_id=ep.name_id
      LEFT JOIN entity_phonetic_analysis epa ON epa.pronunciation_id=ep.pronunciation_id
      WHERE en.searchable=1
        AND en.language IN ('de','en')
        AND ep.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
        AND ((en.language='de' AND ep.locale='de-DE') OR (en.language='en' AND ep.locale='en-US'))
        ${marker}
      GROUP BY ep.pronunciation_id
    `).all();
    const byId=new Map(sourceRows.map((row)=>[Number(row.pronunciation_id),row]));
    const sampled=db.prepare(`
      SELECT a.channel,a.anchor_key,a.pronunciation_id
      FROM entity_rhyme_anchor a
      ORDER BY a.channel,a.anchor_key,a.pronunciation_id
    `).all();
    const grouped=new Map();
    for(const row of sampled){
      const source=byId.get(Number(row.pronunciation_id));
      if(!source)continue;
      const analyzer=source.language==='en'?'en-pron-v1-candidate':'de-ipa-v2';
      const actualAnchor=db.prepare(`
        SELECT 1 FROM entity_rhyme_anchor
        WHERE analyzer_id=? AND channel=? AND anchor_key=? AND pronunciation_id=?
      `).get(analyzer,row.channel,row.anchor_key,row.pronunciation_id);
      if(!actualAnchor)continue;
      const channel=row.channel==='exact_tail'?'entity_exact_tail'
        :row.channel==='vowel_sequence'?'entity_vowel_sequence'
        :row.channel==='vowel_family'?'entity_vowel_family'
        :row.channel==='final_nucleus_coda'?'entity_final_nucleus_coda'
        :row.channel==='final_nucleus'?'entity_final_nucleus'
        :String(row.channel).startsWith('writer_')?'entity_writer_right_edge'
        :'entity_'+row.channel;
      const signature=[source.language,channel,row.anchor_key].join('\u001f');
      if(!grouped.has(signature))grouped.set(signature,{language:source.language,channel,key:row.anchor_key,ids:[]});
      grouped.get(signature).ids.push(mapTarget(
        source.language,source.normalized,
        String(source.phonemes||source.ipa||'')+'|stress:'+String(source.stress||''),
        layer,
      ));
    }
    for(const entry of [...grouped.values()]
      .sort((a,b)=>(a.language+'|'+a.channel+'|'+a.key).localeCompare(b.language+'|'+b.channel+'|'+b.key))
      .slice(0,sampleSize)){
      addCase('entity',layer,entry.language,entry.channel,String(entry.key),entry.ids);
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
  const report={
    schema:'rhymelab-serving-v1-runtime-retrieval-equivalence-v1',
    status:failed.length?'failed':'accepted',
    runtime_semantic_fingerprint:meta.runtime_semantic_fingerprint||null,
    sample_size_per_channel:sampleSize,
    cases,
    totals:{
      cases:cases.length,
      passed:cases.length-failed.length,
      failed:failed.length,
    },
    failed_cases:failed,
    scope:'retrieval-key membership equivalence only; ranking/response equivalence remains deferred until the Serving runtime adapter exists',
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
  if(failed.length)process.exitCode=1;
}finally{
  serving.close();
}
