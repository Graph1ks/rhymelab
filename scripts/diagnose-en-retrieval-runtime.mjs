#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ENGLISH_WRITER_DB_SCHEMA } from './en-writer-db-core.mjs';
import { scoreEnglishRhymeAnalyses } from './english-rhyme-features.mjs';
import {
  ENGLISH_RUNTIME_RETRIEVAL_POLICY,
  analyzeStoredEnglishRuntimePronunciation,
  compareStoredEnglishAnalysis,
  englishRuntimeQueryPlans,
  prepareEnglishRuntimeStatements,
  retrieveEnglishRuntimeCandidates,
} from './en-writer-runtime-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const dbPath=resolve(argValue('--db','data/local/rhymelab-en-v1.sqlite'));
const reportPath=resolve(argValue('--report','data/local/en-retrieval-runtime-v1-report.json'));
const expectedDbFingerprint=argValue(
  '--expected-db-fingerprint',
  'beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37'
);
const expectedPublishFingerprint=argValue(
  '--expected-publish-fingerprint',
  'b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9'
);

const db=new DatabaseSync(dbPath,{readOnly:true});
const meta=(key)=>db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
const checks=[];
function check(id,passed,details={}){
  checks.push({id,passed:Boolean(passed),...details});
}

function stableFingerprint(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

try{
  check('schema',meta('schema')===ENGLISH_WRITER_DB_SCHEMA,{actual:meta('schema'),expected:ENGLISH_WRITER_DB_SCHEMA});
  check('db_semantic_fingerprint',meta('semantic_fingerprint')===expectedDbFingerprint,{
    actual:meta('semantic_fingerprint'),expected:expectedDbFingerprint,
  });
  check('source_publish_fingerprint',meta('publish_fingerprint')===expectedPublishFingerprint,{
    actual:meta('publish_fingerprint'),expected:expectedPublishFingerprint,
  });
  check('product_en_disabled',meta('product_en_enabled')==='false',{actual:meta('product_en_enabled')});
  check('broad_g2p_disabled',meta('broad_g2p')==='false',{actual:meta('broad_g2p')});

  const plans=englishRuntimeQueryPlans(db);
  const requiredIndexes={
    exact:'idx_en_pron_exact',
    multi:'idx_en_pron_multi',
    vowel:'idx_en_pron_vowel',
    family_coda:'idx_en_pron_family_coda',
    coda:'idx_en_pron_coda',
  };
  for(const [kind,indexName] of Object.entries(requiredIndexes)){
    check(
      `runtime_plan_${kind}`,
      (plans[kind]||[]).some((line)=>line.includes(indexName)),
      {index:indexName,plan:plans[kind]||[]}
    );
  }

  const reanalysisRows=db.prepare(`
    SELECT
      p.*,f.surface,f.normalized,f.default_eligible AS form_default_eligible
    FROM en_pronunciation p
    JOIN en_form f ON f.id=p.form_id
    WHERE p.default_profile_eligible=1
    ORDER BY p.id
    LIMIT 200
  `).all();
  let reanalysisMismatches=0;
  const reanalysisMismatchExamples=[];
  for(const row of reanalysisRows){
    const compared=compareStoredEnglishAnalysis(row);
    if(compared.mismatches.length){
      reanalysisMismatches+=1;
      if(reanalysisMismatchExamples.length<10){
        reanalysisMismatchExamples.push({
          pronunciation_id:row.id,
          surface:row.surface,
          source:row.source,
          mismatches:compared.mismatches,
        });
      }
    }
  }
  check('stored_analysis_reanalysis_200',reanalysisRows.length===200&&reanalysisMismatches===0,{
    samples:reanalysisRows.length,
    mismatches:reanalysisMismatches,
    examples:reanalysisMismatchExamples,
  });

  const statements=prepareEnglishRuntimeStatements(db);
  const sentinelSurfaces=['time','nation','record','route','cat','love','cough'];
  const sentinelResults=[];
  let leakage=0;
  let boundViolations=0;
  let repeatabilityMismatches=0;

  for(const surface of sentinelSurfaces){
    const first=retrieveEnglishRuntimeCandidates(db,surface,{statements});
    const second=retrieveEnglishRuntimeCandidates(db,surface,{statements});
    const firstIds=first.candidates.map((row)=>row.pronunciation_id);
    const secondIds=second.candidates.map((row)=>row.pronunciation_id);
    if(JSON.stringify(firstIds)!==JSON.stringify(secondIds)) repeatabilityMismatches+=1;
    if(first.candidates.length>first.max_candidates) boundViolations+=1;
    for(const row of first.candidates){
      if(
        Number(row.form_default_eligible)!==1
        ||Number(row.default_profile_eligible)!==1
        ||Number(row.locale_us)!==1
        ||row.analysis_status!=='ok'
      ) leakage+=1;
    }
    sentinelResults.push({
      surface,
      status:first.status,
      query_pronunciations:first.pronunciations.length,
      candidates:first.candidates.length,
      channel_counts:first.channel_counts,
      first_candidate_ids:firstIds.slice(0,20),
    });
  }
  check('sentinel_queries_resolve',sentinelResults.every((row)=>row.status==='ok'),{sentinels:sentinelResults});
  check('bounded_candidate_sets',boundViolations===0,{violations:boundViolations});
  check('default_profile_no_leakage',leakage===0,{violations:leakage});
  check('same_open_repeatability',repeatabilityMismatches===0,{mismatches:repeatabilityMismatches});

  function pairCheck(id,leftSurface,rightSurface,requiredChannel,expectedType){
    const left=retrieveEnglishRuntimeCandidates(db,leftSurface,{statements});
    const target=left.candidates.filter((row)=>row.normalized===rightSurface);
    const hasChannel=target.some((row)=>row.channels.includes(requiredChannel));
    let best=null;
    for(const queryPron of left.pronunciations){
      const queryAnalysis=analyzeStoredEnglishRuntimePronunciation(queryPron);
      for(const candidate of target){
        const candidateAnalysis=analyzeStoredEnglishRuntimePronunciation(candidate);
        const score=scoreEnglishRhymeAnalyses(queryAnalysis,candidateAnalysis);
        if(!best||score.overall>best.score.overall){
          best={query_pronunciation_id:queryPron.pronunciation_id,candidate_pronunciation_id:candidate.pronunciation_id,score};
        }
      }
    }
    const passed=left.status==='ok'&&target.length>0&&hasChannel&&best?.score?.type===expectedType;
    check(id,passed,{
      left:leftSurface,
      right:rightSurface,
      target_pronunciations:target.length,
      required_channel:requiredChannel,
      channels:[...new Set(target.flatMap((row)=>row.channels))],
      expected_type:expectedType,
      actual_type:best?.score?.type??null,
      overall:best?Number(best.score.overall.toFixed(6)):null,
    });
  }

  pairCheck('perfect_time_rhyme_runtime','time','rhyme','exact','perfect');
  pairCheck('multisyllabic_nation_station_runtime','nation','station','multi','multisyllabic_perfect');

  const record=retrieveEnglishRuntimeCandidates(db,'record',{statements});
  const route=retrieveEnglishRuntimeCandidates(db,'route',{statements});
  check('stress_variant_record',record.pronunciations.length>=2,{
    query_pronunciations:record.pronunciations.map((row)=>({
      pronunciation_id:row.pronunciation_id,
      raw:row.raw,
      stress:row.stress,
      exact_key:row.exact_key,
    })),
  });
  check('alternate_pronunciation_route',route.pronunciations.length>=2,{
    query_pronunciations:route.pronunciations.map((row)=>({
      pronunciation_id:row.pronunciation_id,
      raw:row.raw,
      exact_key:row.exact_key,
    })),
  });

  const derivedRows=db.prepare(`
    SELECT
      p.*,f.surface,f.normalized,f.default_eligible AS form_default_eligible
    FROM en_pronunciation p
    JOIN en_form f ON f.id=p.form_id
    WHERE p.default_profile_eligible=1
      AND f.default_eligible=1
      AND p.source='derived_inflection'
    ORDER BY f.normalized,p.id
    LIMIT 20
  `).all();
  let derivedReanalysisMismatches=0;
  for(const row of derivedRows){
    if(compareStoredEnglishAnalysis(row).mismatches.length) derivedReanalysisMismatches+=1;
  }
  const derivedSurfaces=[...new Set(derivedRows.map((row)=>row.normalized))].slice(0,5);
  const derivedQueries=derivedSurfaces.map((surface)=>{
    const result=retrieveEnglishRuntimeCandidates(db,surface,{statements});
    return {surface,status:result.status,query_pronunciations:result.pronunciations.length,candidates:result.candidates.length};
  });
  check('derived_inflection_runtime_samples',derivedRows.length===20&&derivedReanalysisMismatches===0&&derivedQueries.every((row)=>row.status==='ok'),{
    pronunciation_samples:derivedRows.length,
    reanalysis_mismatches:derivedReanalysisMismatches,
    queries:derivedQueries,
  });

  const failed=checks.filter((item)=>!item.passed);
  const evidence={
    schema:'rhymelab-en-retrieval-runtime-diagnostic-v1',
    status:failed.length?'failed':'ok',
    candidate_only:true,
    database_schema:meta('schema'),
    db_semantic_fingerprint:meta('semantic_fingerprint'),
    source_publish_fingerprint:meta('publish_fingerprint'),
    retrieval_policy:ENGLISH_RUNTIME_RETRIEVAL_POLICY,
    runtime_query_plans:plans,
    sentinel_results:sentinelResults,
    checks,
    failed_checks:failed,
    safeguards:{
      read_only:true,
      product_en_enabled:false,
      runtime_api_rewired:false,
      broad_g2p:false,
      german_database_mutated:false,
      final_writer_ranking_applied:false,
    },
  };
  const report={...evidence,semantic_fingerprint:stableFingerprint(evidence)};
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');

  console.log('PHASE 12B8 ENGLISH RETRIEVAL RUNTIME DIAGNOSTIC');
  console.log(JSON.stringify({
    status:report.status,
    checks:checks.length,
    failures:failed.length,
    db_semantic_fingerprint:report.db_semantic_fingerprint,
    semantic_fingerprint:report.semantic_fingerprint,
    report:reportPath,
  },null,2));
  if(failed.length) process.exitCode=1;
}finally{
  db.close();
}
