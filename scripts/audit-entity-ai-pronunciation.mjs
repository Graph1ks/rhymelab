#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
    categories,
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
