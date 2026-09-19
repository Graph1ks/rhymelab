#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_AI_CONFIDENCE_THRESHOLDS,
  classifyEntityAiSurface,
} from './entity-ai-pronunciation-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const dbPath=resolve(argValue('--db','data/local/entity-ai-pronunciation-v1.sqlite'));
const outPath=resolve(argValue('--out','data/local/entity-ai-pronunciation-audit-v1.json'));
const expected=Number.parseInt(argValue('--expect','704989'),10)||704989;

if(!existsSync(dbPath)) throw new Error(`AI staging database not found: ${dbPath}`);
const db=new DatabaseSync(dbPath,{readOnly:true});
db.exec('PRAGMA query_only=ON;');

function scalar(sql,...params){
  return Number(Object.values(db.prepare(sql).get(...params)||{v:0})[0]||0);
}
function rows(sql,...params){return db.prepare(sql).all(...params);}
function pct(n,d){return d?Math.round(n*10000/d)/100:0;}
function hashRows(statement){
  const hash=createHash('sha256');
  for(const row of statement.iterate()) hash.update(JSON.stringify(row)).update('\n');
  return hash.digest('hex');
}
function newPopulation(){
  return {rows:0,confident:0,ambiguous:0,unknown:0,alternate:0,confidence_sum:0};
}
function addPopulation(map,key,row){
  const name=String(key||'unknown');
  const current=map.get(name)||newPopulation();
  current.rows+=1;
  if(row.decision==='C') current.confident+=1;
  else if(row.decision==='A') current.ambiguous+=1;
  else if(row.decision==='U') current.unknown+=1;
  if(row.alternate_arpabet) current.alternate+=1;
  current.confidence_sum+=Number(row.confidence||0);
  map.set(name,current);
}
function finalizePopulation(map,total,{numericKey=false}={}){
  return [...map.entries()]
    .map(([key,value])=>({
      ...(numericKey?{threshold:Number(key)}:{population:key}),
      rows:value.rows,
      pct:pct(value.rows,total),
      confident:value.confident,
      ambiguous:value.ambiguous,
      unknown:value.unknown,
      alternate:value.alternate,
      mean_confidence:value.rows
        ?Number((value.confidence_sum/value.rows).toFixed(2))
        :0,
    }))
    .sort((a,b)=>
      numericKey
        ?b.threshold-a.threshold
        :b.rows-a.rows||String(a.population).localeCompare(String(b.population),'en')
    );
}

try{
  const schema=db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value||null;
  if(schema!=='rhymelab-entity-ai-pronunciation-v1'){
    throw new Error(`Unexpected AI staging schema: ${schema||'missing'}`);
  }

  const imported=scalar('SELECT COUNT(*) AS c FROM ai_pronunciation');
  const batches=scalar('SELECT COUNT(*) AS c FROM ai_batch');
  const completeBatches=scalar("SELECT COUNT(*) AS c FROM ai_batch WHERE status='complete'");
  const partialBatches=batches-completeBatches;
  const maxId=scalar('SELECT COALESCE(MAX(ai_id),0) AS c FROM ai_pronunciation');
  const minId=scalar('SELECT COALESCE(MIN(ai_id),0) AS c FROM ai_pronunciation');
  const distinctIds=scalar('SELECT COUNT(DISTINCT ai_id) AS c FROM ai_pronunciation');
  const valid=scalar("SELECT COUNT(*) AS c FROM ai_pronunciation WHERE validation_status='valid'");
  const confident=scalar("SELECT COUNT(*) AS c FROM ai_pronunciation WHERE decision='C'");
  const ambiguous=scalar("SELECT COUNT(*) AS c FROM ai_pronunciation WHERE decision='A'");
  const unknown=scalar("SELECT COUNT(*) AS c FROM ai_pronunciation WHERE decision='U'");
  const alternate=scalar("SELECT COUNT(*) AS c FROM ai_pronunciation WHERE alternate_arpabet IS NOT NULL AND alternate_arpabet<>''");
  const promoted=scalar('SELECT COUNT(*) AS c FROM ai_pronunciation WHERE runtime_promoted=1');

  const confidenceBuckets=rows(`
    SELECT
      CASE
        WHEN confidence>=95 THEN '95-99'
        WHEN confidence>=80 THEN '80-94'
        WHEN confidence>=50 THEN '50-79'
        ELSE '0-49'
      END AS bucket,
      COUNT(*) AS rows,
      SUM(decision='C') AS confident,
      SUM(decision='A') AS ambiguous,
      SUM(decision='U') AS unknown
    FROM ai_pronunciation
    GROUP BY bucket
    ORDER BY MIN(confidence) DESC
  `).map((row)=>({
    bucket:row.bucket,
    rows:Number(row.rows),
    pct:pct(Number(row.rows),imported),
    confident:Number(row.confident||0),
    ambiguous:Number(row.ambiguous||0),
    unknown:Number(row.unknown||0),
  }));

  const categories=rows(`
    SELECT category,COUNT(*) AS rows,
      SUM(decision='C') AS confident,
      SUM(decision='A') AS ambiguous,
      SUM(decision='U') AS unknown,
      AVG(confidence) AS mean_confidence
    FROM ai_pronunciation
    GROUP BY category
    ORDER BY rows DESC,category
  `).map((row)=>({
    category:row.category||null,
    rows:Number(row.rows),
    confident:Number(row.confident||0),
    ambiguous:Number(row.ambiguous||0),
    unknown:Number(row.unknown||0),
    mean_confidence:Number(Number(row.mean_confidence||0).toFixed(2)),
  }));

  const thresholdPopulations=new Map(
    ENTITY_AI_CONFIDENCE_THRESHOLDS.map((threshold)=>[String(threshold),newPopulation()])
  );
  const orthographyPopulations=new Map();
  const unresolvedReasonPopulations=new Map();
  const popularityTierPopulations=new Map();
  const problemPopulations=new Map();

  const diagnosticRows=db.prepare(
    'SELECT surface,confidence,decision,alternate_arpabet,popularity_tier,unresolved_reason '+
    'FROM ai_pronunciation ORDER BY ai_id'
  );
  for(const row of diagnosticRows.iterate()){
    for(const threshold of ENTITY_AI_CONFIDENCE_THRESHOLDS){
      if(Number(row.confidence)>=threshold){
        addPopulation(thresholdPopulations,String(threshold),row);
      }
    }
    const tags=classifyEntityAiSurface(row.surface);
    for(const tag of tags) addPopulation(orthographyPopulations,tag,row);
    addPopulation(
      unresolvedReasonPopulations,
      row.unresolved_reason||'unresolved_reason_missing',
      row,
    );
    addPopulation(
      popularityTierPopulations,
      row.popularity_tier||'popularity_tier_missing',
      row,
    );

    if(row.decision==='U') addPopulation(problemPopulations,'decision_unknown',row);
    if(row.decision==='A') addPopulation(problemPopulations,'decision_ambiguous',row);
    if(Number(row.confidence)<50) addPopulation(problemPopulations,'confidence_below_50',row);
    if(row.alternate_arpabet) addPopulation(problemPopulations,'alternate_present',row);
    for(const tag of [
      'multiword',
      'non_ascii',
      'contains_non_latin_letter',
      'contains_digit',
      'contains_other_punctuation_or_symbol',
      'length_25_plus',
    ]){
      if(tags.includes(tag)) addPopulation(problemPopulations,tag,row);
    }
  }

  const confidenceThresholds=finalizePopulation(
    thresholdPopulations,
    imported,
    {numericKey:true},
  ).map((row)=>({...row,retained_pct:row.pct}));
  const orthography=finalizePopulation(orthographyPopulations,imported);
  const unresolvedReasons=finalizePopulation(unresolvedReasonPopulations,imported);
  const popularityTiers=finalizePopulation(popularityTierPopulations,imported);
  const problemPopulationsFinal=finalizePopulation(problemPopulations,imported);
  const batchRows=rows(`
    SELECT batch_id,input_filename,status,input_rows,completed_rows,first_id,last_input_id,
      last_completed_id,next_unprocessed_id,confident_count,ambiguous_count,unknown_count,
      results_sha256,imported_at
    FROM ai_batch
    ORDER BY first_id
  `).map((row)=>({
    ...row,
    batch_id:Number(row.batch_id),
    input_rows:Number(row.input_rows),
    completed_rows:Number(row.completed_rows),
    first_id:Number(row.first_id),
    last_input_id:Number(row.last_input_id),
    last_completed_id:row.last_completed_id==null?null:Number(row.last_completed_id),
    next_unprocessed_id:row.next_unprocessed_id==null?null:Number(row.next_unprocessed_id),
    confident_count:Number(row.confident_count),
    ambiguous_count:Number(row.ambiguous_count),
    unknown_count:Number(row.unknown_count),
  }));

  const fingerprint=hashRows(db.prepare(`
    SELECT ai_id,name_id,entity_id,qid,arpabet,confidence,decision,alternate_arpabet,
      ipa,phonemes,syllable_count,stress,primary_stress,rhyme_tail,exact_key,
      validation_status,runtime_promoted
    FROM ai_pronunciation
    ORDER BY ai_id
  `));

  const report={
    schema:'rhymelab-entity-ai-pronunciation-audit-v1',
    status:'evidence_staging',
    staging_database:dbPath,
    expected_population:expected,
    imported_rows:imported,
    imported_pct:pct(imported,expected),
    remaining_rows:Math.max(0,expected-imported),
    batches,
    complete_batches:completeBatches,
    partial_batches:partialBatches,
    id_range:{min:minId||null,max:maxId||null,distinct:distinctIds},
    validation:{valid,invalid:imported-valid},
    decisions:{confident,ambiguous,unknown,alternate},
    confidence_buckets:confidenceBuckets,
    confidence_thresholds:{
      purpose:'staging_selectivity_only_not_runtime_quality_or_promotion_threshold',
      preselected_threshold:null,
      thresholds:confidenceThresholds,
    },
    categories,
    orthography_populations:orthography,
    unresolved_reason_populations:unresolvedReasons,
    popularity_tier_populations:popularityTiers,
    problem_populations:problemPopulationsFinal,
    batch_status:batchRows,
    semantic_fingerprint:fingerprint,
    safeguards:{
      runtime_promoted_rows:promoted,
      runtime_promotion_allowed:false,
      source_backed_runtime_mutated:false,
    },
  };
  await mkdir(dirname(outPath),{recursive:true});
  await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({...report,report:outPath},null,2));
}finally{
  db.close();
}
