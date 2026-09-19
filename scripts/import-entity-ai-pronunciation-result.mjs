#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  mkdtemp, readFile, rm, mkdir, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import {
  ENTITY_AI_PRONUNCIATION_SCHEMA,
  ENTITY_AI_RESULT_COLUMNS,
  analyzeEntityAiArpabet,
  parseTsv,
  validateEntityAiArtifactManifest,
  validateEntityAiResultRow,
} from './entity-ai-pronunciation-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}
function hasFlag(flag){return args.includes(flag);}

const artifactArg=argValue('--artifact',args.find((value)=>!value.startsWith('--'))||null);
if(!artifactArg) throw new Error('Usage: node scripts/import-entity-ai-pronunciation-result.mjs --artifact <results.zip|directory>');
const artifactPath=resolve(artifactArg);
const mappingPath=resolve(
  argValue('--map','data/local/entity-ai-pronunciation-queue-v1/AI_ID_MAP_LOCAL_ONLY.tsv')
);
const stagingPath=resolve(
  argValue('--out','data/local/entity-ai-pronunciation-v1.sqlite')
);
const reportPath=resolve(
  argValue('--report','data/local/entity-ai-pronunciation-import-latest.json')
);
const allowPartial=hasFlag('--allow-partial');
const replace=hasFlag('--replace');

if(!existsSync(artifactPath)) throw new Error(`Result artifact not found: ${artifactPath}`);
if(!existsSync(mappingPath)) throw new Error(`AI ID map not found: ${mappingPath}`);

function sha256Buffer(value){
  return createHash('sha256').update(value).digest('hex');
}
function clean(value){
  return String(value??'').replace(/[\t\r\n]+/gu,' ').trim();
}
function extractZip(zipPath,destination){
  let result=spawnSync('tar',['-xf',zipPath,'-C',destination],{stdio:'pipe'});
  if(result.status===0) return;
  if(process.platform==='win32'){
    result=spawnSync(
      'powershell.exe',
      ['-NoProfile','-Command',`Expand-Archive -LiteralPath '${zipPath.replaceAll("'","''")}' -DestinationPath '${destination.replaceAll("'","''")}' -Force`],
      {stdio:'pipe'},
    );
    if(result.status===0) return;
  }
  throw new Error(
    `Could not extract ZIP. tar: ${String(result.stderr||'').trim()||'failed'}`
  );
}
function ensureStorage(db){
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_batch(
      batch_id INTEGER PRIMARY KEY,
      input_filename TEXT NOT NULL UNIQUE,
      artifact_filename TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('complete','partial')),
      input_rows INTEGER NOT NULL,
      completed_rows INTEGER NOT NULL,
      first_id INTEGER NOT NULL,
      last_input_id INTEGER NOT NULL,
      last_completed_id INTEGER,
      next_unprocessed_id INTEGER,
      confident_count INTEGER NOT NULL,
      ambiguous_count INTEGER NOT NULL,
      unknown_count INTEGER NOT NULL,
      results_sha256 TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_pronunciation(
      ai_id INTEGER PRIMARY KEY,
      batch_id INTEGER NOT NULL REFERENCES ai_batch(batch_id) ON DELETE CASCADE,
      name_id INTEGER NOT NULL,
      entity_id INTEGER NOT NULL,
      qid TEXT NOT NULL,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      context TEXT,
      category TEXT,
      popularity_tier TEXT,
      popularity_percentile REAL,
      unresolved_reason TEXT,
      arpabet TEXT,
      confidence INTEGER NOT NULL CHECK(confidence BETWEEN 0 AND 99),
      decision TEXT NOT NULL CHECK(decision IN ('C','A','U')),
      alternate_arpabet TEXT,
      ipa TEXT,
      phonemes TEXT,
      syllable_count INTEGER,
      stress TEXT,
      primary_stress INTEGER,
      rhyme_tail TEXT,
      exact_key TEXT,
      alternate_ipa TEXT,
      alternate_analysis_json TEXT,
      validation_status TEXT NOT NULL,
      runtime_promoted INTEGER NOT NULL DEFAULT 0 CHECK(runtime_promoted IN (0,1))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_pron_batch
      ON ai_pronunciation(batch_id,ai_id);
    CREATE INDEX IF NOT EXISTS idx_ai_pron_name
      ON ai_pronunciation(name_id,validation_status);
    CREATE INDEX IF NOT EXISTS idx_ai_pron_category
      ON ai_pronunciation(category,decision,confidence);
  `);
  const meta=db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);
  meta.run('schema',ENTITY_AI_PRONUNCIATION_SCHEMA);
  meta.run('runtime_promoted','false');
  meta.run('purpose','offline_external_model_reference_evidence_staging');
}

function loadMap(text){
  const parsed=parseTsv(text);
  const expected=[
    'id','name_id','entity_id','qid','surface','normalized','preferred','name_kind',
    'context','category','popularity_tier','popularity_percentile','reason',
  ];
  if(parsed.header.join('\t')!==expected.join('\t')){
    throw new Error('Unexpected AI ID map header');
  }
  const map=new Map();
  for(const {line,values} of parsed.rows){
    if(values.length!==expected.length) throw new Error(`Map line ${line} has ${values.length} columns`);
    const [
      id,nameId,entityId,qid,surface,normalized,preferred,nameKind,
      context,category,popularityTier,popularityPercentile,reason,
    ]=values;
    const key=Number(id);
    if(!Number.isInteger(key)||key<1) throw new Error(`Invalid map id at line ${line}`);
    if(map.has(key)) throw new Error(`Duplicate map id ${key}`);
    map.set(key,{
      ai_id:key,
      name_id:Number(nameId),
      entity_id:Number(entityId),
      qid,
      surface,
      normalized,
      preferred:Number(preferred||0),
      name_kind:nameKind,
      context,
      category,
      popularity_tier:popularityTier,
      popularity_percentile:Number(popularityPercentile||0),
      unresolved_reason:reason,
    });
  }
  return map;
}

let workDir=artifactPath;
let temp=null;
if(artifactPath.toLocaleLowerCase('en-US').endsWith('.zip')){
  temp=await mkdtemp(join(tmpdir(),'rhymelab-ai-import-'));
  extractZip(artifactPath,temp);
  workDir=temp;
}
const resultsPath=join(workDir,'results.tsv');
const manifestPath=join(workDir,'manifest.json');
if(!existsSync(resultsPath)||!existsSync(manifestPath)){
  if(temp) await rm(temp,{recursive:true,force:true});
  throw new Error('Result artifact must contain results.tsv and manifest.json at its root');
}

try{
  const [resultsBuffer,manifestRaw,mapRaw]=await Promise.all([
    readFile(resultsPath),
    readFile(manifestPath,'utf8'),
    readFile(mappingPath,'utf8'),
  ]);
  const resultsSha=sha256Buffer(resultsBuffer);
  const manifest=JSON.parse(manifestRaw);
  const status=String(manifest.status||'');
  if(!['complete','partial'].includes(status)) throw new Error('Manifest status must be complete or partial');
  if(status==='partial'&&!allowPartial){
    throw new Error('Partial artifact rejected. Re-run with --allow-partial only for intentional checkpoint staging.');
  }

  const parsed=parseTsv(resultsBuffer.toString('utf8'));
  if(parsed.header.join('\t')!==ENTITY_AI_RESULT_COLUMNS.join('\t')){
    throw new Error(`Unexpected result header: ${parsed.header.join(' | ')}`);
  }
  const idMap=loadMap(mapRaw);
  const seen=new Set();
  const prepared=[];
  const errors=[];
  const counts={C:0,A:0,U:0};

  for(const {line,values} of parsed.rows){
    const checked=validateEntityAiResultRow(values);
    if(!checked.valid){
      errors.push({line,error:checked.error});
      continue;
    }
    const row=checked.row;
    if(seen.has(row.id)){
      errors.push({line,id:row.id,error:'duplicate_id'});
      continue;
    }
    seen.add(row.id);
    const mapping=idMap.get(row.id);
    if(!mapping){
      errors.push({line,id:row.id,error:'id_not_in_local_map'});
      continue;
    }

    let primary=null;
    let alternate=null;
    if(row.flag!=='U'){
      try{primary=analyzeEntityAiArpabet(row.arp);}
      catch(error){
        errors.push({line,id:row.id,error:`analysis_failed:${error.message}`});
        continue;
      }
      if(row.alt){
        try{alternate=analyzeEntityAiArpabet(row.alt);}
        catch(error){
          errors.push({line,id:row.id,error:`alternate_analysis_failed:${error.message}`});
          continue;
        }
      }
    }
    counts[row.flag]+=1;
    prepared.push({row,mapping,primary,alternate});
  }


  if(errors.length){
    throw new Error(
      `Result validation failed with ${errors.length} error(s): `
      +errors.slice(0,10).map((row)=>`${row.id??'line '+row.line}:${row.error}`).join(', ')
    );
  }
  if(prepared.length!==parsed.rows.length){
    throw new Error('Prepared row count differs from result row count');
  }
  const contractCheck=validateEntityAiArtifactManifest(manifest,{
    resultsSha,
    resultIds:prepared.map((item)=>item.row.id),
    decisionCounts:counts,
  });
  if(!contractCheck.valid){
    throw new Error(
      'Manifest/result contract validation failed: '+contractCheck.errors.join(', ')
    );
  }
  const artifactContract=contractCheck.normalized;
  const inputRows=artifactContract.input_rows;
  const completedRows=artifactContract.completed_rows;
  const firstId=artifactContract.first_input_id;
  const lastInputId=artifactContract.last_input_id;
  const lastCompletedId=artifactContract.last_completed_id;
  const nextUnprocessedId=artifactContract.next_unprocessed_id;
  if(Number.isFinite(completedRows)&&completedRows!==prepared.length){
    throw new Error(`Manifest completed_rows ${completedRows} != results rows ${prepared.length}`);
  }
  if(status==='complete'&&Number.isFinite(inputRows)&&inputRows!==prepared.length){
    throw new Error(`Complete manifest input_rows ${inputRows} != results rows ${prepared.length}`);
  }
  if(prepared.length&&prepared[0].row.id!==firstId){
    throw new Error(`First ID mismatch: manifest ${firstId}, results ${prepared[0].row.id}`);
  }
  if(status==='complete'&&prepared.length&&prepared.at(-1).row.id!==lastInputId){
    throw new Error(`Last ID mismatch: manifest ${lastInputId}, results ${prepared.at(-1).row.id}`);
  }

  await mkdir(dirname(stagingPath),{recursive:true});
  await mkdir(dirname(reportPath),{recursive:true});
  const db=new DatabaseSync(stagingPath);
  try{
    importAttempt: {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
    ensureStorage(db);

    const inputFilename=artifactContract.input_filename;

    const existing=db.prepare('SELECT * FROM ai_batch WHERE input_filename=?').get(inputFilename);
    if(existing&&!replace){
      if(existing.results_sha256===resultsSha){
        console.log(JSON.stringify({
          status:'already_imported',
          input_filename:inputFilename,
          results_sha256:resultsSha,
          batch_id:Number(existing.batch_id),
        },null,2));
        process.exitCode=0;
        break importAttempt;
      }else{
        throw new Error(`Batch ${inputFilename} already imported with a different SHA. Use --replace to replace it.`);
      }
    }
    if(existing&&replace){
      db.prepare('DELETE FROM ai_batch WHERE batch_id=?').run(existing.batch_id);
    }

    const insertBatch=db.prepare(`
      INSERT INTO ai_batch(
        input_filename,artifact_filename,status,input_rows,completed_rows,
        first_id,last_input_id,last_completed_id,next_unprocessed_id,
        confident_count,ambiguous_count,unknown_count,results_sha256,
        manifest_json,imported_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const insertRow=db.prepare(`
      INSERT INTO ai_pronunciation(
        ai_id,batch_id,name_id,entity_id,qid,surface,normalized,context,category,
        popularity_tier,popularity_percentile,unresolved_reason,
        arpabet,confidence,decision,alternate_arpabet,
        ipa,phonemes,syllable_count,stress,primary_stress,rhyme_tail,exact_key,
        alternate_ipa,alternate_analysis_json,validation_status,runtime_promoted
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
    `);

    db.exec('BEGIN IMMEDIATE');
    try{
      const batch=insertBatch.run(
        inputFilename,
        basename(artifactPath),
        status,
        inputRows,
        prepared.length,
        firstId,
        lastInputId,
        lastCompletedId,
        nextUnprocessedId,
        counts.C,
        counts.A,
        counts.U,
        resultsSha,
        JSON.stringify(manifest),
        new Date().toISOString(),
      );
      const batchId=Number(batch.lastInsertRowid);

      for(const item of prepared){
        const {row,mapping,primary,alternate}=item;
        insertRow.run(
          row.id,
          batchId,
          mapping.name_id,
          mapping.entity_id,
          mapping.qid,
          mapping.surface,
          mapping.normalized,
          mapping.context||null,
          mapping.category||null,
          mapping.popularity_tier||null,
          mapping.popularity_percentile,
          mapping.unresolved_reason||null,
          row.arp||null,
          row.q,
          row.flag,
          row.alt||null,
          primary?.ipa||null,
          primary?.phonemes||null,
          primary?.syllable_count??null,
          primary?.stress||null,
          primary?.primary_stress??null,
          primary?.rhyme_tail||null,
          primary?.exact_key||null,
          alternate?.ipa||null,
          alternate?JSON.stringify({
            phonemes:alternate.phonemes,
            syllable_count:alternate.syllable_count,
            stress:alternate.stress,
            primary_stress:alternate.primary_stress,
            rhyme_tail:alternate.rhyme_tail,
            exact_key:alternate.exact_key,
          }):null,
          'valid',
        );
      }
      db.exec('COMMIT');

      const report={
        schema:'rhymelab-entity-ai-pronunciation-import-v1',
        status:'ok',
        staging_database:stagingPath,
        runtime_promoted:false,
        input_filename:inputFilename,
        artifact:artifactPath,
        batch_id:batchId,
        batch_status:status,
        rows:prepared.length,
        first_id:firstId,
        last_completed_id:lastCompletedId,
        next_unprocessed_id:nextUnprocessedId,
        counts:{
          confident:counts.C,
          ambiguous:counts.A,
          unknown:counts.U,
        },
        results_sha256:resultsSha,
        safeguards:{
          local_id_map_required:true,
          generated_pronunciation_runtime_mutated:false,
          source_backed_entity_runtime_mutated:false,
          pronunciation_lookup_performed:false,
        },
      };
      await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
      console.log(JSON.stringify({...report,report:reportPath},null,2));
    }catch(error){
      try{db.exec('ROLLBACK');}catch{}
      throw error;
    }
    }
  }finally{
    db.close();
  }
}finally{
  if(temp) await rm(temp,{recursive:true,force:true});
}
