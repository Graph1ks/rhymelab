#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scoreEnglishRhymeAnalyses } from './english-rhyme-features.mjs';
import {
  ENGLISH_RUNTIME_RETRIEVAL_POLICY,
  analyzeStoredEnglishRuntimePronunciation,
  prepareEnglishRuntimeStatements,
  retrieveEnglishRuntimeCandidates,
} from './en-writer-runtime-core.mjs';
import {
  ENGLISH_DIVERSITY_WEIGHTS,
  ENGLISH_QUALITY_CANDIDATES,
  ENGLISH_RANKING_EVIDENCE_POLICY,
  diversifyRanked,
  guardViolations,
  pageMetrics,
  qualityComparator,
  qualityEvidence,
  relationTier,
} from './en-writer-ranking-evidence-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const dbPath=resolve(argValue('--db','data/local/rhymelab-en-v1.sqlite'));
const outPath=resolve(argValue('--out','data/local/en-acceptance-bundle-v1-report.json'));
const runtimeDir=resolve(argValue('--runtime-repeat-dir','data/local/en-runtime-repeatability-v1'));
const repeatRuns=Math.max(2,Math.min(5,Number.parseInt(argValue('--runs','3'),10)||3));
const channelLimit=Math.max(64,Math.min(512,Number.parseInt(argValue('--channel-limit','256'),10)||256));
const maxCandidates=Math.max(128,Math.min(1200,Number.parseInt(argValue('--max-candidates','800'),10)||800));
const expectedDbFingerprint='beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37';
const expectedPublishFingerprint='b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9';

function hashJson(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function mean(values){
  const xs=values.filter((v)=>Number.isFinite(v));
  return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
}
function round(value,digits=6){
  return Number.isFinite(value)?Number(value.toFixed(digits)):null;
}
function compactCandidate(row){
  return {
    surface:row.surface,
    normalized:row.normalized,
    tier:row.tier,
    type:row.score.type,
    relation_types:row.score.relationTypes||[],
    phonetic:round(row.evidence.phonetic),
    syllable:round(row.evidence.syllable),
    commonness:round(row.evidence.commonness),
    lexical_overlap:round(row.evidence.lexical_overlap),
    utility:round(row.evidence.utility),
    wordfreq_rank:row.wordfreq_rank??null,
    wordfreq_zipf:row.wordfreq_zipf??null,
    channels:row.channels,
    source:row.source,
    max_redundancy:row.max_redundancy??null,
    diversified_score:row.diversified_score??null,
  };
}
function delta(after,before){
  return Number.isFinite(after)&&Number.isFinite(before)?round(after-before):null;
}

await mkdir(runtimeDir,{recursive:true});
const repeatReports=[];
for(let run=1;run<=repeatRuns;run+=1){
  const reportPath=join(runtimeDir,`run-${run}.json`);
  const child=spawnSync(process.execPath,[
    'scripts/diagnose-en-retrieval-runtime.mjs',
    '--db',dbPath,
    '--report',reportPath,
    '--expected-db-fingerprint',expectedDbFingerprint,
    '--expected-publish-fingerprint',expectedPublishFingerprint,
  ],{stdio:'inherit'});
  if(child.status!==0) process.exit(child.status??1);
  const report=JSON.parse(await readFile(reportPath,'utf8'));
  repeatReports.push({
    run,
    status:report.status,
    semantic_fingerprint:report.semantic_fingerprint,
    db_semantic_fingerprint:report.db_semantic_fingerprint,
    source_publish_fingerprint:report.source_publish_fingerprint,
    failed_checks:report.failed_checks?.length||0,
  });
}
const runtimeBaseline=repeatReports[0];
const runtimeRepeatability={
  runs:repeatRuns,
  passed:repeatReports.every((row)=>
    row.status==='ok'
    &&row.failed_checks===0
    &&row.semantic_fingerprint===runtimeBaseline.semantic_fingerprint
    &&row.db_semantic_fingerprint===expectedDbFingerprint
    &&row.source_publish_fingerprint===expectedPublishFingerprint
  ),
  baseline_semantic_fingerprint:runtimeBaseline.semantic_fingerprint,
  reports:repeatReports,
};

const db=new DatabaseSync(dbPath,{readOnly:true});
try{
  db.exec('PRAGMA query_only=ON;');
  const meta=(key)=>db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
  if(meta('semantic_fingerprint')!==expectedDbFingerprint){
    throw new Error(`Unexpected English DB fingerprint: ${meta('semantic_fingerprint')}`);
  }
  if(meta('publish_fingerprint')!==expectedPublishFingerprint){
    throw new Error(`Unexpected English publish fingerprint: ${meta('publish_fingerprint')}`);
  }

  const statements=prepareEnglishRuntimeStatements(db);
  const explicit=['time','nation','record','route','cat','love','cough'];
  const queryRows=[];
  const seen=new Set();

  function addQuery(surface,source,stratum=null){
    const normalized=String(surface||'').trim().toLocaleLowerCase('en-US');
    if(!normalized||seen.has(normalized)) return;
    const exists=db.prepare(`
      SELECT f.surface,f.normalized,f.wordfreq_rank,f.wordfreq_zipf
      FROM en_form f
      WHERE f.normalized=? AND f.default_eligible=1
        AND EXISTS(
          SELECT 1 FROM en_pronunciation p
          WHERE p.form_id=f.id AND p.default_profile_eligible=1
        )
    `).get(normalized);
    if(!exists) return;
    seen.add(normalized);
    queryRows.push({...exists,selection_source:source,stratum});
  }

  for(const surface of explicit) addQuery(surface,'sentinel');

  const strata=[
    {id:'rank_1_1000',where:'f.wordfreq_rank BETWEEN 1 AND 1000'},
    {id:'rank_1001_10000',where:'f.wordfreq_rank BETWEEN 1001 AND 10000'},
    {id:'rank_10001_50000',where:'f.wordfreq_rank BETWEEN 10001 AND 50000'},
    {id:'rank_50001_150000',where:'f.wordfreq_rank BETWEEN 50001 AND 150000'},
    {id:'rank_150001_plus',where:'f.wordfreq_rank > 150000'},
    {id:'unranked',where:'f.wordfreq_rank IS NULL'},
  ];
  for(const stratum of strata){
    const rows=db.prepare(`
      SELECT f.surface,f.normalized,f.wordfreq_rank,f.wordfreq_zipf
      FROM en_form f
      WHERE f.default_eligible=1
        AND ${stratum.where}
        AND length(f.normalized) BETWEEN 3 AND 18
        AND f.normalized NOT GLOB '*[^a-z]*'
        AND EXISTS(
          SELECT 1 FROM en_pronunciation p
          WHERE p.form_id=f.id AND p.default_profile_eligible=1
        )
      ORDER BY
        CASE WHEN f.wordfreq_rank IS NULL THEN 1 ELSE 0 END,
        f.wordfreq_rank,
        f.normalized
      LIMIT 5
    `).all();
    for(const row of rows) addQuery(row.normalized,'stratified',stratum.id);
  }

  const analysisCache=new Map();
  function analysisFor(row){
    if(!analysisCache.has(row.pronunciation_id)){
      analysisCache.set(row.pronunciation_id,analyzeStoredEnglishRuntimePronunciation(row));
    }
    return analysisCache.get(row.pronunciation_id);
  }

  const queryReports=[];
  for(const queryRow of queryRows){
    const runtime=retrieveEnglishRuntimeCandidates(db,queryRow.normalized,{
      statements,channelLimit,maxCandidates,
    });
    if(runtime.status!=='ok'){
      queryReports.push({...queryRow,status:runtime.status});
      continue;
    }

    const byNormalized=new Map();
    for(const candidate of runtime.candidates){
      let best=null;
      for(const queryPronunciation of runtime.pronunciations){
        const score=scoreEnglishRhymeAnalyses(
          analysisFor(queryPronunciation),
          analysisFor(candidate),
        );
        const tier=relationTier(score);
        if(!best||tier<best.tier||(tier===best.tier&&score.overall>best.score.overall)){
          best={...candidate,score,tier};
        }
      }
      if(!best) continue;
      const current=byNormalized.get(best.normalized);
      if(!current||best.tier<current.tier||(best.tier===current.tier&&best.score.overall>current.score.overall)){
        byNormalized.set(best.normalized,best);
      }
    }
    const raw=[...byNormalized.values()].filter((row)=>row.tier<99);

    const configs={};
    for(const config of ENGLISH_QUALITY_CANDIDATES){
      const rows=raw.map((row)=>({
        ...row,
        evidence:qualityEvidence(row,queryRow.normalized,config),
      })).sort(qualityComparator(config));

      const qualityMetrics=pageMetrics(rows,20);
      const violations=guardViolations(rows,{nearTieBand:config.near_tie_band,limit:20});
      const diversity={};
      for(const weight of ENGLISH_DIVERSITY_WEIGHTS){
        const diversified=diversifyRanked(rows,{
          weight,
          limit:20,
          nearTieBand:config.near_tie_band||0.03,
        });
        const metrics=pageMetrics(diversified,20);
        diversity[String(weight)]={
          weight,
          metrics,
          delta_vs_quality:{
            mean_phonetic:delta(metrics.mean_phonetic,qualityMetrics.mean_phonetic),
            mean_commonness:delta(metrics.mean_commonness,qualityMetrics.mean_commonness),
            near_duplicate_rows:metrics.near_duplicate_rows-qualityMetrics.near_duplicate_rows,
            repeated_lemma_rows:metrics.repeated_lemma_rows-qualityMetrics.repeated_lemma_rows,
          },
          top20:diversified.map(compactCandidate),
        };
      }
      configs[config.id]={
        config,
        quality_metrics:qualityMetrics,
        guard_violations:violations,
        top20:rows.slice(0,20).map(compactCandidate),
        diversity,
      };
    }

    queryReports.push({
      ...queryRow,
      status:'ok',
      query_pronunciations:runtime.pronunciations.length,
      retrieved_pronunciations:runtime.candidates.length,
      collapsed_candidates:raw.length,
      channel_counts:runtime.channel_counts,
      configs,
    });
  }

  const okQueries=queryReports.filter((row)=>row.status==='ok');
  const aggregateConfigs={};
  for(const config of ENGLISH_QUALITY_CANDIDATES){
    const rows=okQueries.map((q)=>q.configs[config.id]);
    const phoneticControl=okQueries.map((q)=>q.configs.phonetic_control);
    const aggregate={
      queries:rows.length,
      guard_violations:rows.reduce((sum,row)=>sum+row.guard_violations.length,0),
      mean_top20_phonetic:round(mean(rows.map((row)=>row.quality_metrics.mean_phonetic))),
      mean_top20_commonness:round(mean(rows.map((row)=>row.quality_metrics.mean_commonness))),
      total_near_duplicate_rows:rows.reduce((sum,row)=>sum+row.quality_metrics.near_duplicate_rows,0),
      total_repeated_lemma_rows:rows.reduce((sum,row)=>sum+row.quality_metrics.repeated_lemma_rows,0),
      total_high_query_overlap_rows:rows.reduce((sum,row)=>sum+row.quality_metrics.high_query_overlap_rows,0),
      total_unranked_rows:rows.reduce((sum,row)=>sum+row.quality_metrics.unranked_rows,0),
      delta_vs_phonetic_control:{
        mean_top20_phonetic:delta(
          mean(rows.map((row)=>row.quality_metrics.mean_phonetic)),
          mean(phoneticControl.map((row)=>row.quality_metrics.mean_phonetic))
        ),
        mean_top20_commonness:delta(
          mean(rows.map((row)=>row.quality_metrics.mean_commonness)),
          mean(phoneticControl.map((row)=>row.quality_metrics.mean_commonness))
        ),
      },
      diversity:{},
    };
    for(const weight of ENGLISH_DIVERSITY_WEIGHTS){
      const ds=rows.map((row)=>row.diversity[String(weight)]);
      aggregate.diversity[String(weight)]={
        weight,
        mean_top20_phonetic:round(mean(ds.map((row)=>row.metrics.mean_phonetic))),
        mean_top20_commonness:round(mean(ds.map((row)=>row.metrics.mean_commonness))),
        total_near_duplicate_rows:ds.reduce((sum,row)=>sum+row.metrics.near_duplicate_rows,0),
        total_repeated_lemma_rows:ds.reduce((sum,row)=>sum+row.metrics.repeated_lemma_rows,0),
        mean_max_redundancy:round(mean(ds.map((row)=>row.metrics.mean_max_redundancy))),
        delta_vs_quality:{
          mean_phonetic:round(mean(ds.map((row)=>row.delta_vs_quality.mean_phonetic))),
          mean_commonness:round(mean(ds.map((row)=>row.delta_vs_quality.mean_commonness))),
          near_duplicate_rows:ds.reduce((sum,row)=>sum+row.delta_vs_quality.near_duplicate_rows,0),
          repeated_lemma_rows:ds.reduce((sum,row)=>sum+row.delta_vs_quality.repeated_lemma_rows,0),
        },
      };
    }
    aggregateConfigs[config.id]=aggregate;
  }

  const evidence={
    schema:'rhymelab-en-acceptance-bundle-v1',
    status:runtimeRepeatability.passed?'evidence_ready':'failed_runtime_repeatability',
    candidate_only:true,
    db_semantic_fingerprint:expectedDbFingerprint,
    source_publish_fingerprint:expectedPublishFingerprint,
    runtime_retrieval_policy:ENGLISH_RUNTIME_RETRIEVAL_POLICY,
    ranking_evidence_policy:ENGLISH_RANKING_EVIDENCE_POLICY,
    runtime_repeatability:runtimeRepeatability,
    query_sampling:{
      explicit,
      strata:strata.map(({id})=>id),
      selected_queries:queryRows,
      selected_count:queryRows.length,
    },
    retrieval_options:{channel_limit:channelLimit,max_candidates:maxCandidates},
    quality_candidates:ENGLISH_QUALITY_CANDIDATES,
    diversity_weights:ENGLISH_DIVERSITY_WEIGHTS,
    aggregate:aggregateConfigs,
    queries:queryReports,
    safeguards:{
      read_only:true,
      product_en_enabled:false,
      runtime_api_rewired:false,
      german_database_mutated:false,
      broad_g2p:false,
      ranking_promoted:false,
      diversity_promoted:false,
      evidence_only:true,
    },
    interpretation_contract:{
      human_gold_available:false,
      automatic_winner_selection:false,
      purpose:'collect enough deterministic runtime/commonness/quality/diversity evidence in one owner run to choose the next benchmarked candidate without repeated local data passes',
    },
  };
  const report={...evidence,semantic_fingerprint:hashJson(evidence)};
  await mkdir(dirname(outPath),{recursive:true});
  await writeFile(outPath,JSON.stringify(report,null,2)+'\n');

  console.log('\nPHASE 12B9 ENGLISH ACCEPTANCE BUNDLE');
  console.log(JSON.stringify({
    status:report.status,
    runtime_repeatability:runtimeRepeatability.passed,
    runtime_fingerprint:runtimeRepeatability.baseline_semantic_fingerprint,
    queries:queryRows.length,
    aggregate:report.aggregate,
    semantic_fingerprint:report.semantic_fingerprint,
    report:outPath,
  },null,2));
  if(!runtimeRepeatability.passed) process.exitCode=1;
}finally{
  db.close();
}
