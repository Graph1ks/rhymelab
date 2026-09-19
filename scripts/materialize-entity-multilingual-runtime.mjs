#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  openEnglishWriterDb,
} from '../src/english-writer-runtime.mjs';
import {
  ENTITY_EN_PHONETIC_RUNTIME,
  ENTITY_EN_RUNTIME_ANALYZER,
  ENTITY_RUNTIME_REVIEW_STATES,
  analyzeEntityPronunciation,
  entityPronunciationRuntimeEligibleForLanguage,
  entityRetrievalAnchors,
} from './entity-pronunciation-core.mjs';
import {
  ENTITY_EN_SOURCE_RUNTIME_POLICY,
  prepareEnglishEntityRuntimeStatements,
  resolveEnglishEntitySourceRuntime,
} from './entity-english-runtime-core.mjs';

const ACCEPTED_DE_RUNTIME_FINGERPRINT=
  '38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3';
const BUILD_REVISION='entity-phonetic-runtime-en-v1-source-backed-v1';
const CHECKPOINT_EVERY=10000;
const PROGRESS_EVERY=5000;

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const entityDbPath=resolve(argValue('--entities','data/local/rhymelab-entities-v1.sqlite'));
const englishDbPath=resolve(argValue('--en-db',DEFAULT_ENGLISH_WRITER_DB_PATH));
const markerPath=resolve(argValue('--en-marker',DEFAULT_ENGLISH_PRODUCT_MARKER_PATH));
const sourceIndexPath=resolve(
  argValue('--source-index','data/work/entity/entity-pronunciation-source-expansion-v1.sqlite')
);
const reportPath=resolve(
  argValue('--report','data/local/entity-multilingual-runtime-v1-report.json')
);

for(const path of [entityDbPath,englishDbPath,sourceIndexPath]){
  if(!existsSync(path)) throw new Error(`Required local file missing: ${path}`);
}
await mkdir(dirname(reportPath),{recursive:true});

function metaValue(db,key){
  return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
}
function upsertMeta(db,key,value){
  db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key,String(value));
}
function progressLine(phase,current,total,startedAt,details=[]){
  const elapsed=Math.max(1,Date.now()-startedAt);
  const rate=current/(elapsed/1000);
  const percent=total?current*100/total:100;
  const eta=rate>0&&current<total?Math.round((total-current)/rate):0;
  console.error(
    `[${phase}] ${current.toLocaleString()} / ${total.toLocaleString()} (${percent.toFixed(1)}%)`
    +` · ${Math.round(rate).toLocaleString()}/s`
    +(eta?` · ETA ~${Math.ceil(eta/60)}m`:'')
    +(details.length?` · ${details.join(' · ')}`:'')
  );
}
async function yieldToSignals(){
  await new Promise((done)=>setImmediate(done));
}

async function englishRuntimeFingerprint(db){
  const hash=createHash('sha256');
  const reviewStates=ENTITY_RUNTIME_REVIEW_STATES.map(()=>'?').join(',');
  const feeds=[
    db.prepare(`
      SELECT n.entity_id,n.name_id,n.surface,n.language,
        p.pronunciation_id,p.locale,p.pronunciation_role,p.ipa,p.preferred,
        p.source_kind,p.source_record,p.generated,p.model_id,p.confidence,p.review_state
      FROM entity_pronunciation p
      JOIN entity_name n USING(name_id)
      WHERE n.language='en'
        AND p.locale='en-US'
        AND p.review_state IN (${reviewStates})
      ORDER BY n.entity_id,n.name_id,p.pronunciation_id
    `),
    db.prepare(`
      SELECT a.pronunciation_id,a.analyzer_id,a.phonemes,a.syllables,a.syllable_count,
        a.primary_stress,a.secondary_stress,a.stress_pattern,a.vowel_sequence,
        a.consonant_sequence,a.rhyme_tail,a.rhyme_signature
      FROM entity_phonetic_analysis a
      JOIN entity_pronunciation p USING(pronunciation_id)
      JOIN entity_name n USING(name_id)
      WHERE a.analyzer_id=?
        AND n.language='en'
        AND p.locale='en-US'
        AND p.review_state IN (${reviewStates})
      ORDER BY a.pronunciation_id
    `),
    db.prepare(`
      SELECT a.analyzer_id,a.channel,a.anchor_key,a.pronunciation_id
      FROM entity_rhyme_anchor a
      JOIN entity_pronunciation p USING(pronunciation_id)
      JOIN entity_name n USING(name_id)
      WHERE a.analyzer_id=?
        AND n.language='en'
        AND p.locale='en-US'
        AND p.review_state IN (${reviewStates})
      ORDER BY a.channel,a.anchor_key,a.pronunciation_id
    `),
  ];
  const argsList=[
    ENTITY_RUNTIME_REVIEW_STATES,
    [ENTITY_EN_RUNTIME_ANALYZER,...ENTITY_RUNTIME_REVIEW_STATES],
    [ENTITY_EN_RUNTIME_ANALYZER,...ENTITY_RUNTIME_REVIEW_STATES],
  ];
  for(let i=0;i<feeds.length;i+=1){
    hash.update('[');
    let first=true;
    for(const row of feeds[i].iterate(...argsList[i])){
      if(!first) hash.update(',');
      hash.update(JSON.stringify(row));
      first=false;
    }
    hash.update(']');
    await yieldToSignals();
  }
  return hash.digest('hex');
}

const entityDb=new DatabaseSync(entityDbPath);
const englishDb=openEnglishWriterDb(englishDbPath,{
  requireProductAcceptance:true,
  markerPath,
});
const sourceDb=new DatabaseSync(sourceIndexPath,{readOnly:true});
sourceDb.exec('PRAGMA query_only=ON;');

try{
  entityDb.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  const schema=metaValue(entityDb,'schema');
  if(schema!=='rhymelab-entity-catalog-v1'){
    throw new Error(`Unexpected Entity schema: ${schema||'missing'}`);
  }
  const deFingerprint=metaValue(entityDb,'entity_phonetic_runtime_fingerprint');
  if(deFingerprint!==ACCEPTED_DE_RUNTIME_FINGERPRINT){
    throw new Error(
      `Frozen DE Entity runtime fingerprint mismatch: expected ${ACCEPTED_DE_RUNTIME_FINGERPRINT}, got ${deFingerprint||'missing'}`
    );
  }

  const statements=prepareEnglishEntityRuntimeStatements(englishDb,sourceDb);
  const names=entityDb.prepare(`
    SELECT n.name_id,n.entity_id,n.surface,n.normalized,n.name_kind,n.preferred,
      e.qid,e.primary_category,e.popularity_percentile,e.popularity_score
    FROM entity_name n
    JOIN entity e USING(entity_id)
    WHERE n.searchable=1 AND n.language='en'
    ORDER BY n.name_id
  `).all();

  const existing=entityDb.prepare(`
    SELECT pronunciation_id
    FROM entity_pronunciation
    WHERE name_id=?
      AND locale='en-US'
      AND review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
    ORDER BY preferred DESC,pronunciation_id
    LIMIT 1
  `);
  const preferredExists=entityDb.prepare(`
    SELECT 1 AS yes
    FROM entity_pronunciation
    WHERE name_id=?
      AND locale='en-US'
      AND preferred=1
      AND review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
    LIMIT 1
  `);
  const insertPronunciation=entityDb.prepare(`
    INSERT INTO entity_pronunciation(
      name_id,locale,pronunciation_role,ipa,preferred,source_kind,source_record,
      generated,model_id,confidence,review_state
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `);
  const existingRuntimeRows=entityDb.prepare(`
    SELECT p.pronunciation_id,p.name_id,p.ipa,p.generated,p.source_kind,p.review_state,n.surface
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    WHERE n.language='en'
      AND p.locale='en-US'
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
    ORDER BY p.pronunciation_id
  `).all();
  const quarantineRuntimeRow=entityDb.prepare(`
    UPDATE entity_pronunciation
    SET review_state=?
    WHERE pronunciation_id=?
  `);
  const deleteRuntimeAnchors=entityDb.prepare(`
    DELETE FROM entity_rhyme_anchor
    WHERE pronunciation_id=? AND analyzer_id=?
  `);
  const deleteRuntimeAnalysis=entityDb.prepare(`
    DELETE FROM entity_phonetic_analysis
    WHERE pronunciation_id=? AND analyzer_id=?
  `);

  let quarantinedExisting=0;
  const quarantineSamples=[];
  entityDb.exec('BEGIN');
  try{
    for(const row of existingRuntimeRows){
      let reason=null;
      if(Number(row.generated||0)!==0){
        reason='generated_runtime_row';
      }else{
        try{
          analyzeEntityPronunciation(row.ipa,'en');
        }catch{
          reason='unanalysable_runtime_ipa';
        }
      }
      if(!reason) continue;
      deleteRuntimeAnchors.run(row.pronunciation_id,ENTITY_EN_RUNTIME_ANALYZER);
      deleteRuntimeAnalysis.run(row.pronunciation_id,ENTITY_EN_RUNTIME_ANALYZER);
      quarantineRuntimeRow.run(
        reason==='generated_runtime_row'?'rejected_runtime_policy':'rejected_runtime_analysis',
        row.pronunciation_id,
      );
      quarantinedExisting+=1;
      if(quarantineSamples.length<25){
        quarantineSamples.push({
          pronunciation_id:Number(row.pronunciation_id),
          name_id:Number(row.name_id),
          surface:row.surface,
          source_kind:row.source_kind,
          reason,
        });
      }
    }
    entityDb.exec('COMMIT');
  }catch(error){
    try{entityDb.exec('ROLLBACK');}catch{}
    throw error;
  }

  let inserted=0;
  let existingCount=0;
  let unresolved=0;
  let runtimeAnalysisRejected=0;
  const runtimeAnalysisRejectedSamples=[];
  const statusCounts=new Map();
  const unresolvedUnits=new Map();
  const startedAt=Date.now();

  entityDb.exec('BEGIN');
  try{
    for(let index=0;index<names.length;index+=1){
      const name=names[index];
      if(existing.get(name.name_id)){
        existingCount+=1;
      }else{
        const resolved=resolveEnglishEntitySourceRuntime(name.surface,statements);
        statusCounts.set(resolved.status,(statusCounts.get(resolved.status)||0)+1);
        if(!resolved.pronunciation){
          unresolved+=1;
          for(const unit of resolved.unresolved_units||[]){
            unresolvedUnits.set(unit,(unresolvedUnits.get(unit)||0)+1);
          }
        }else{
          const p=resolved.pronunciation;
          let runtimeAnalysisError=null;
          try{
            analyzeEntityPronunciation(p.ipa,'en');
          }catch(error){
            runtimeAnalysisError=error;
          }
          if(runtimeAnalysisError){
            unresolved+=1;
            runtimeAnalysisRejected+=1;
            statusCounts.set(
              'unresolved_runtime_analysis',
              (statusCounts.get('unresolved_runtime_analysis')||0)+1,
            );
            if(runtimeAnalysisRejectedSamples.length<25){
              runtimeAnalysisRejectedSamples.push({
                name_id:Number(name.name_id),
                entity_id:Number(name.entity_id),
                qid:name.qid,
                surface:name.surface,
                source_kind:p.source_kind,
                resolution_status:resolved.status,
                ipa:p.ipa,
                error:String(runtimeAnalysisError?.message||runtimeAnalysisError),
              });
            }
          }else{
            insertPronunciation.run(
              name.name_id,
              'en-US',
              'en-US',
              p.ipa,
              preferredExists.get(name.name_id)?0:1,
              p.source_kind,
              JSON.stringify({
                ...p.source_record,
                resolution_status:resolved.status,
              }),
              0,
              null,
              1,
              p.review_state,
            );
            inserted+=1;
          }
        }
      }

      const processed=index+1;
      if(processed%PROGRESS_EVERY===0||processed===names.length){
        progressLine('entity-en:names',processed,names.length,startedAt,[
          `existing ${existingCount.toLocaleString()}`,
          `inserted ${inserted.toLocaleString()}`,
          `unresolved ${unresolved.toLocaleString()}`,
        ]);
      }
      if(processed%CHECKPOINT_EVERY===0&&processed<names.length){
        upsertMeta(entityDb,'entity_en_runtime_build_state','names_in_progress');
        upsertMeta(entityDb,'entity_en_runtime_name_checkpoint',processed);
        entityDb.exec('COMMIT');
        await yieldToSignals();
        entityDb.exec('BEGIN');
      }
    }
    upsertMeta(entityDb,'entity_en_runtime_build_state','names_complete');
    upsertMeta(entityDb,'entity_en_runtime_name_checkpoint',names.length);
    entityDb.exec('COMMIT');
  }catch(error){
    try{entityDb.exec('ROLLBACK');}catch{}
    throw error;
  }

  const revision=metaValue(entityDb,'entity_en_phonetic_build_revision');
  if(revision!==BUILD_REVISION){
    entityDb.exec('BEGIN');
    try{
      entityDb.prepare('DELETE FROM entity_rhyme_anchor WHERE analyzer_id=?')
        .run(ENTITY_EN_RUNTIME_ANALYZER);
      entityDb.prepare('DELETE FROM entity_phonetic_analysis WHERE analyzer_id=?')
        .run(ENTITY_EN_RUNTIME_ANALYZER);
      upsertMeta(entityDb,'entity_en_phonetic_build_revision',BUILD_REVISION);
      upsertMeta(entityDb,'entity_en_phonetic_analysis_checkpoint',0);
      entityDb.exec('COMMIT');
    }catch(error){
      try{entityDb.exec('ROLLBACK');}catch{}
      throw error;
    }
  }

  const eligible=entityDb.prepare(`
    SELECT p.pronunciation_id,p.name_id,p.locale,p.review_state,p.ipa
    FROM entity_pronunciation p
    JOIN entity_name n USING(name_id)
    WHERE n.language='en'
      AND p.locale='en-US'
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
    ORDER BY p.pronunciation_id
  `).all();

  const hasAnalysis=entityDb.prepare(`
    SELECT 1 AS yes
    FROM entity_phonetic_analysis
    WHERE pronunciation_id=? AND analyzer_id=?
    LIMIT 1
  `);
  const insertAnalysis=entityDb.prepare(`
    INSERT INTO entity_phonetic_analysis(
      pronunciation_id,analyzer_id,phonemes,syllables,syllable_count,
      primary_stress,secondary_stress,stress_pattern,vowel_sequence,
      consonant_sequence,rhyme_tail,rhyme_signature
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertAnchor=entityDb.prepare(`
    INSERT OR IGNORE INTO entity_rhyme_anchor(
      analyzer_id,channel,anchor_key,pronunciation_id
    ) VALUES(?,?,?,?)
  `);

  let analyses=0;
  let resumed=0;
  let rejected=0;
  let anchorsAdded=0;
  const analysisStarted=Date.now();

  entityDb.exec('BEGIN');
  try{
    for(let index=0;index<eligible.length;index+=1){
      const pronunciation=eligible[index];
      if(!entityPronunciationRuntimeEligibleForLanguage(pronunciation,'en')){
        throw new Error(`Unexpected ineligible en-US pronunciation ${pronunciation.pronunciation_id}`);
      }
      if(hasAnalysis.get(pronunciation.pronunciation_id,ENTITY_EN_RUNTIME_ANALYZER)){
        analyses+=1;
        resumed+=1;
      }else{
        try{
          const analyzed=analyzeEntityPronunciation(pronunciation.ipa,'en');
          const row=analyzed.row;
          insertAnalysis.run(
            pronunciation.pronunciation_id,
            ENTITY_EN_RUNTIME_ANALYZER,
            row.phonemes,
            row.syllables,
            row.syllableCount,
            row.primaryStress,
            row.secondaryStress,
            row.stressPattern,
            row.vowelSequence,
            row.consonantSequence,
            row.rhymeTail,
            row.rhymeSignature,
          );
          analyses+=1;
          for(const anchor of entityRetrievalAnchors(analyzed.analysis,'en')){
            anchorsAdded+=Number(insertAnchor.run(
              ENTITY_EN_RUNTIME_ANALYZER,
              anchor.channel,
              anchor.key,
              pronunciation.pronunciation_id,
            ).changes||0);
          }
        }catch(error){
          rejected+=1;
          throw new Error(
            `English runtime analysis failed for pronunciation ${pronunciation.pronunciation_id}: ${error?.message||error}`
          );
        }
      }

      const processed=index+1;
      if(processed%PROGRESS_EVERY===0||processed===eligible.length){
        progressLine('entity-en:phonetics',processed,eligible.length,analysisStarted,[
          `analyses ${analyses.toLocaleString()}`,
          `resumed ${resumed.toLocaleString()}`,
          `rejected ${rejected.toLocaleString()}`,
          `new anchors ${anchorsAdded.toLocaleString()}`,
        ]);
      }
      if(processed%CHECKPOINT_EVERY===0&&processed<eligible.length){
        upsertMeta(entityDb,'entity_en_runtime_build_state','analysis_in_progress');
        upsertMeta(entityDb,'entity_en_phonetic_analysis_checkpoint',processed);
        entityDb.exec('COMMIT');
        await yieldToSignals();
        entityDb.exec('BEGIN');
      }
    }
    upsertMeta(entityDb,'entity_en_phonetic_analysis_checkpoint',eligible.length);
    entityDb.exec('COMMIT');
  }catch(error){
    try{entityDb.exec('ROLLBACK');}catch{}
    throw error;
  }

  const totalAnalyses=Number(entityDb.prepare(`
    SELECT COUNT(*) AS c
    FROM entity_phonetic_analysis a
    JOIN entity_pronunciation p USING(pronunciation_id)
    JOIN entity_name n USING(name_id)
    WHERE a.analyzer_id=?
      AND n.language='en'
      AND p.locale='en-US'
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
  `).get(ENTITY_EN_RUNTIME_ANALYZER).c||0);
  const totalAnchors=Number(entityDb.prepare(`
    SELECT COUNT(*) AS c
    FROM entity_rhyme_anchor a
    JOIN entity_pronunciation p USING(pronunciation_id)
    JOIN entity_name n USING(name_id)
    WHERE a.analyzer_id=?
      AND n.language='en'
      AND p.locale='en-US'
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
  `).get(ENTITY_EN_RUNTIME_ANALYZER).c||0);
  const readyNames=Number(entityDb.prepare(`
    SELECT COUNT(DISTINCT n.name_id) AS c
    FROM entity_name n
    JOIN entity_pronunciation p USING(name_id)
    JOIN entity_phonetic_analysis a USING(pronunciation_id)
    WHERE n.language='en'
      AND n.searchable=1
      AND p.locale='en-US'
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
      AND a.analyzer_id=?
  `).get(ENTITY_EN_RUNTIME_ANALYZER).c||0);

  upsertMeta(entityDb,'entity_en_pronunciation_policy',ENTITY_EN_SOURCE_RUNTIME_POLICY);
  upsertMeta(entityDb,'entity_phonetic_runtime_en',ENTITY_EN_PHONETIC_RUNTIME);
  upsertMeta(entityDb,'entity_phonetic_analyzer_en',ENTITY_EN_RUNTIME_ANALYZER);
  upsertMeta(entityDb,'entity_phonetic_analyses_en',totalAnalyses);
  upsertMeta(entityDb,'entity_rhyme_anchors_en',totalAnchors);
  upsertMeta(entityDb,'entity_en_names_considered',names.length);
  upsertMeta(entityDb,'entity_en_names_ready',readyNames);
  upsertMeta(entityDb,'entity_en_runtime_build_state','fingerprint_in_progress');

  const fingerprint=await englishRuntimeFingerprint(entityDb);
  upsertMeta(entityDb,'entity_phonetic_runtime_fingerprint_en',fingerprint);
  upsertMeta(entityDb,'entity_en_runtime_build_state','complete');
  entityDb.exec('ANALYZE; PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE);');

  const topUnresolved=[...unresolvedUnits.entries()]
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'en'))
    .slice(0,100)
    .map(([unit,count])=>({unit,count}));

  const report={
    schema:'rhymelab-entity-multilingual-runtime-v1',
    status:'ok',
    policy:ENTITY_EN_SOURCE_RUNTIME_POLICY,
    entity_database:entityDbPath,
    english_database:englishDbPath,
    source_index:sourceIndexPath,
    database_bytes:(await stat(entityDbPath)).size,
    frozen_de_runtime_fingerprint:deFingerprint,
    frozen_de_runtime_preserved:
      metaValue(entityDb,'entity_phonetic_runtime_fingerprint')===ACCEPTED_DE_RUNTIME_FINGERPRINT,
    english:{
      runtime:ENTITY_EN_PHONETIC_RUNTIME,
      analyzer:ENTITY_EN_RUNTIME_ANALYZER,
      names_considered:names.length,
      names_ready:readyNames,
      inserted_this_run:inserted,
      existing_before_run:existingCount,
      quarantined_existing_runtime_rows:quarantinedExisting,
      quarantine_samples:quarantineSamples,
      unresolved_names:Math.max(0,names.length-readyNames),
      runtime_analysis_rejected:runtimeAnalysisRejected,
      runtime_analysis_rejected_samples:runtimeAnalysisRejectedSamples,
      phonetic_analyses:totalAnalyses,
      analyses_resumed:resumed,
      rejected_analyses:rejected,
      rhyme_anchors:totalAnchors,
      anchors_added_this_run:anchorsAdded,
      semantic_fingerprint:fingerprint,
      resolution_status_counts:Object.fromEntries(
        [...statusCounts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'en'))
      ),
      top_unresolved_units:topUnresolved,
    },
    safeguards:{
      source_backed_only:true,
      generated_g2p_used:false,
      llm_annotation_used:false,
      ai_staging_runtime_promoted:false,
      runtime_network_dependency:false,
      german_runtime_rows_rebuilt:false,
    },
  };
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({...report,report:reportPath},null,2));
}finally{
  sourceDb.close();
  englishDb.close();
  entityDb.close();
}
