#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { scoreEnglishRhymeAnalyses } from './english-rhyme-features.mjs';
import {
  analyzeStoredEnglishRuntimePronunciation,
  prepareEnglishRuntimeStatements,
  retrieveEnglishRuntimeCandidates,
} from './en-writer-runtime-core.mjs';
import {
  ENGLISH_DIVERSITY_WEIGHTS,
  ENGLISH_QUALITY_CANDIDATES,
  ENGLISH_WRITER_RANKING_V2_POLICY,
  diversifyRanked,
  guardViolations,
  pageMetrics,
  qualityEvidence,
  rankQualityRows,
  relationTier,
} from './en-writer-ranking-v2-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}
const dbPath=resolve(argValue('--db','data/local/rhymelab-en-v1.sqlite'));
const outPath=resolve(argValue('--out','data/local/en-writer-acceptance-v1-report.json'));
const runtimeReportPath=resolve(argValue('--runtime-report','data/local/en-writer-acceptance-runtime-check.json'));
const debugReportArg=argValue('--debug-report',null);
const debugReportPath=debugReportArg?resolve(debugReportArg):null;
const expectedDbFingerprint='beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37';
const expectedPublishFingerprint='b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9';
const expectedRuntimeFingerprint='dc4de5383325ee3b0d03ca6d77b8282bb0986e19c8e12567c2022a8aa3f29fcf';
const channelLimit=320;
const maxCandidates=1000;

const QUALITY_GATES=Object.freeze({
  max_mean_phonetic_drop:0.0025,
  min_mean_commonness_uplift:0.02,
  max_unranked_delta:0,
  max_guard_violations:0,
});
const DIVERSITY_GATES=Object.freeze({
  require_near_duplicate_improvement:true,
  require_repeated_lemma_improvement:true,
  max_mean_phonetic_drop:0.0025,
  max_mean_commonness_drop:0.04,
  max_guard_violations:0,
  selection:'maximize_min_diversity_reduction_within_hard_quality_constraints',
});

const LYRICIST_QUERIES=Object.freeze([
  'time','nation','record','route','cat','love','cough',
  'dream','night','fire','heart','pain','rain','mind','soul','light',
  'alone','change','broken','world','life','death','free','freedom',
  'music','rhythm','flow','rhyme','cold','gold','blue','truth','move',
  'home','road','fight','lost','found','stay','away','forever','remember',
  'desire','emotion','story','city','beautiful','energy',
]);
const MODERNITY_SENTINELS=Object.freeze([
  'vibe','flex','drip','ghosted','stan','rizz','slay','cap','lit','meme',
]);

function round(value,digits=6){
  return Number.isFinite(value)?Number(value.toFixed(digits)):null;
}
function mean(values){
  const xs=values.filter(Number.isFinite);
  return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
}
function hashJson(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function ratioReduction(before,after){
  if(before<=0) return after<=0?1:0;
  return (before-after)/before;
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
    usage_known:Boolean(row.evidence.usage_known),
    usage_uncertainty_penalty:round(row.evidence.usage_uncertainty_penalty),
    lexical_overlap:round(row.evidence.lexical_overlap),
    utility:round(row.evidence.utility),
    quality_band:row.quality_band,
    quality_band_anchor:row.quality_band_anchor,
    wordfreq_rank:row.wordfreq_rank??null,
    wordfreq_zipf:row.wordfreq_zipf??null,
    channels:row.channels,
    source:row.source,
    max_redundancy:row.max_redundancy??null,
    diversified_score:row.diversified_score??null,
  };
}

const runtimeChild=spawnSync(process.execPath,[
  'scripts/diagnose-en-retrieval-runtime.mjs',
  '--db',dbPath,
  '--report',runtimeReportPath,
  '--expected-db-fingerprint',expectedDbFingerprint,
  '--expected-publish-fingerprint',expectedPublishFingerprint,
],{stdio:'inherit'});
if(runtimeChild.status!==0) process.exit(runtimeChild.status??1);
const runtimeCheck=JSON.parse(await readFile(runtimeReportPath,'utf8'));
if(runtimeCheck.semantic_fingerprint!==expectedRuntimeFingerprint){
  throw new Error(
    `Runtime diagnostic fingerprint changed: ${runtimeCheck.semantic_fingerprint} != ${expectedRuntimeFingerprint}`
  );
}

const db=new DatabaseSync(dbPath,{readOnly:true});
try{
  db.exec('PRAGMA query_only=ON;');
  const meta=(key)=>db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
  if(meta('semantic_fingerprint')!==expectedDbFingerprint){
    throw new Error(`Unexpected English DB fingerprint: ${meta('semantic_fingerprint')}`);
  }
  if(meta('publish_fingerprint')!==expectedPublishFingerprint){
    throw new Error(`Unexpected publish fingerprint: ${meta('publish_fingerprint')}`);
  }

  const statements=prepareEnglishRuntimeStatements(db);
  const selected=[];
  const seen=new Set();

  const lookup=db.prepare(`
    SELECT f.surface,f.normalized,f.wordfreq_rank,f.wordfreq_zipf
    FROM en_form f
    WHERE f.normalized=? AND f.default_eligible=1
      AND EXISTS(
        SELECT 1 FROM en_pronunciation p
        WHERE p.form_id=f.id AND p.default_profile_eligible=1
      )
  `);
  function addQuery(surface,selectionSource,stratum=null){
    const normalized=String(surface||'').trim().toLocaleLowerCase('en-US');
    if(!normalized||seen.has(normalized)) return false;
    const row=lookup.get(normalized);
    if(!row) return false;
    seen.add(normalized);
    selected.push({...row,selection_source:selectionSource,stratum});
    return true;
  }

  for(const word of LYRICIST_QUERIES) addQuery(word,'lyricist_sentinel');

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
      ORDER BY ((f.id * 1103515245 + 12345) % 2147483647),f.id
      LIMIT 8
    `).all();
    for(const row of rows) addQuery(row.normalized,'deterministic_stratified',stratum.id);
  }

  const modernity=MODERNITY_SENTINELS.map((word)=>{
    const row=lookup.get(word);
    return row
      ?{surface:word,status:'available',wordfreq_rank:row.wordfreq_rank,wordfreq_zipf:row.wordfreq_zipf}
      :{surface:word,status:'not_default_available',wordfreq_rank:null,wordfreq_zipf:null};
  });

  const analysisCache=new Map();
  function analysisFor(row){
    if(!analysisCache.has(row.pronunciation_id)){
      analysisCache.set(row.pronunciation_id,analyzeStoredEnglishRuntimePronunciation(row));
    }
    return analysisCache.get(row.pronunciation_id);
  }

  const queryReports=[];
  for(const queryRow of selected){
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
      if(!best||best.tier>=99) continue;
      const current=byNormalized.get(best.normalized);
      if(!current||best.tier<current.tier||(best.tier===current.tier&&best.score.overall>current.score.overall)){
        byNormalized.set(best.normalized,best);
      }
    }
    const raw=[...byNormalized.values()];
    const configs={};

    for(const config of ENGLISH_QUALITY_CANDIDATES){
      const withEvidence=raw.map((row)=>({
        ...row,
        evidence:qualityEvidence(row,queryRow.normalized,config),
      }));
      const ranked=rankQualityRows(withEvidence,config);
      const qMetrics=pageMetrics(ranked,20);
      const qViolations=guardViolations(ranked,{nearTieBand:config.near_tie_band,limit:20});
      const diversity={};
      for(const weight of ENGLISH_DIVERSITY_WEIGHTS){
        const diversified=diversifyRanked(ranked,{weight,limit:20});
        diversity[String(weight)]={
          weight,
          metrics:pageMetrics(diversified,20),
          guard_violations:guardViolations(diversified,{
            nearTieBand:config.near_tie_band,
            limit:20,
          }),
          top20:diversified.map(compactCandidate),
        };
      }
      configs[config.id]={
        config,
        quality_metrics:qMetrics,
        guard_violations:qViolations,
        top20:ranked.slice(0,20).map(compactCandidate),
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
  const aggregate={};
  for(const config of ENGLISH_QUALITY_CANDIDATES){
    const blocks=okQueries.map((row)=>row.configs[config.id]);
    aggregate[config.id]={
      config,
      queries:blocks.length,
      guard_violations:blocks.reduce((sum,row)=>sum+row.guard_violations.length,0),
      mean_top20_phonetic:round(mean(blocks.map((row)=>row.quality_metrics.mean_phonetic))),
      mean_top20_commonness:round(mean(blocks.map((row)=>row.quality_metrics.mean_commonness))),
      total_near_duplicate_rows:blocks.reduce((sum,row)=>sum+row.quality_metrics.near_duplicate_rows,0),
      total_repeated_lemma_rows:blocks.reduce((sum,row)=>sum+row.quality_metrics.repeated_lemma_rows,0),
      total_high_query_overlap_rows:blocks.reduce((sum,row)=>sum+row.quality_metrics.high_query_overlap_rows,0),
      total_unranked_rows:blocks.reduce((sum,row)=>sum+row.quality_metrics.unranked_rows,0),
      diversity:{},
    };
    for(const weight of ENGLISH_DIVERSITY_WEIGHTS){
      const ds=blocks.map((row)=>row.diversity[String(weight)]);
      aggregate[config.id].diversity[String(weight)]={
        weight,
        guard_violations:ds.reduce((sum,row)=>sum+row.guard_violations.length,0),
        mean_top20_phonetic:round(mean(ds.map((row)=>row.metrics.mean_phonetic))),
        mean_top20_commonness:round(mean(ds.map((row)=>row.metrics.mean_commonness))),
        total_near_duplicate_rows:ds.reduce((sum,row)=>sum+row.metrics.near_duplicate_rows,0),
        total_repeated_lemma_rows:ds.reduce((sum,row)=>sum+row.metrics.repeated_lemma_rows,0),
        total_unranked_rows:ds.reduce((sum,row)=>sum+row.metrics.unranked_rows,0),
        mean_max_redundancy:round(mean(ds.map((row)=>row.metrics.mean_max_redundancy))),
      };
    }
  }

  const control=aggregate.phonetic_control;
  const qualityEvaluations=[];
  let selectedQuality=null;
  for(const config of ENGLISH_QUALITY_CANDIDATES.filter((row)=>row.id!=='phonetic_control')){
    const candidate=aggregate[config.id];
    const metrics={
      mean_phonetic_drop:round(control.mean_top20_phonetic-candidate.mean_top20_phonetic),
      mean_commonness_uplift:round(candidate.mean_top20_commonness-control.mean_top20_commonness),
      unranked_delta:candidate.total_unranked_rows-control.total_unranked_rows,
      guard_violations:candidate.guard_violations,
    };
    const gates={
      phonetic:metrics.mean_phonetic_drop<=QUALITY_GATES.max_mean_phonetic_drop,
      commonness:metrics.mean_commonness_uplift>=QUALITY_GATES.min_mean_commonness_uplift,
      unranked:metrics.unranked_delta<=QUALITY_GATES.max_unranked_delta,
      guard:metrics.guard_violations<=QUALITY_GATES.max_guard_violations,
    };
    const passed=Object.values(gates).every(Boolean);
    qualityEvaluations.push({id:config.id,metrics,gates,passed});
    if(!selectedQuality&&passed) selectedQuality=config.id;
  }

  let selectedDiversity=null;
  const diversityEvaluations=[];
  if(selectedQuality){
    const base=aggregate[selectedQuality].diversity['0'];
    for(const weight of ENGLISH_DIVERSITY_WEIGHTS.filter((value)=>value>0)){
      const candidate=aggregate[selectedQuality].diversity[String(weight)];
      const metrics={
        near_duplicate_reduction:round(ratioReduction(
          base.total_near_duplicate_rows,
          candidate.total_near_duplicate_rows
        )),
        repeated_lemma_reduction:round(ratioReduction(
          base.total_repeated_lemma_rows,
          candidate.total_repeated_lemma_rows
        )),
        mean_phonetic_drop:round(base.mean_top20_phonetic-candidate.mean_top20_phonetic),
        mean_commonness_drop:round(base.mean_top20_commonness-candidate.mean_top20_commonness),
        guard_violations:candidate.guard_violations,
      };
      const gates={
        near_duplicates:metrics.near_duplicate_reduction>0,
        repeated_lemma:metrics.repeated_lemma_reduction>0,
        phonetic:metrics.mean_phonetic_drop<=DIVERSITY_GATES.max_mean_phonetic_drop,
        commonness:metrics.mean_commonness_drop<=DIVERSITY_GATES.max_mean_commonness_drop,
        guard:metrics.guard_violations<=DIVERSITY_GATES.max_guard_violations,
      };
      const passed=Object.values(gates).every(Boolean);
      diversityEvaluations.push({
        weight,
        metrics,
        gates,
        diversity_gain:round(Math.min(
          metrics.near_duplicate_reduction,
          metrics.repeated_lemma_reduction
        )),
        passed,
      });
    }
    const safeDiversity=diversityEvaluations
      .filter((row)=>row.passed)
      .sort((a,b)=>b.diversity_gain-a.diversity_gain||a.weight-b.weight);
    selectedDiversity=safeDiversity[0]?.weight??null;
  }

  const accepted=Boolean(
    runtimeCheck.status==='ok'
    &&runtimeCheck.failed_checks?.length===0
    &&selectedQuality
    &&selectedDiversity!==null
    &&okQueries.length===selected.length
  );

  const evidence={
    schema:'rhymelab-en-writer-acceptance-v1',
    status:accepted?'candidate_accepted_for_product_integration':'needs_iteration',
    candidate_only:true,
    db_semantic_fingerprint:expectedDbFingerprint,
    source_publish_fingerprint:expectedPublishFingerprint,
    runtime_diagnostic_fingerprint:runtimeCheck.semantic_fingerprint,
    ranking_evidence_policy:ENGLISH_WRITER_RANKING_V2_POLICY,
    retrieval_options:{channel_limit:channelLimit,max_candidates:maxCandidates},
    query_sampling:{
      lyricist_requested:LYRICIST_QUERIES.length,
      selected_count:selected.length,
      selected_queries:selected,
      deterministic_strata:strata.map((row)=>row.id),
      modernity_sentinels:modernity,
    },
    quality_gates:QUALITY_GATES,
    diversity_gates:DIVERSITY_GATES,
    aggregate,
    selection:{
      quality_evaluations:qualityEvaluations,
      selected_quality:selectedQuality,
      diversity_evaluations:diversityEvaluations,
      selected_diversity_weight:selectedDiversity,
      policy:selectedQuality&&selectedDiversity!==null
        ?{
          id:'en-writer-guarded-quality-diversity-v1-candidate',
          quality_candidate:selectedQuality,
          diversity_weight:selectedDiversity,
        }
        :null,
    },
    query_summaries:queryReports.map((row)=>({
      surface:row.surface,
      normalized:row.normalized,
      selection_source:row.selection_source,
      stratum:row.stratum,
      status:row.status,
      query_pronunciations:row.query_pronunciations??null,
      retrieved_pronunciations:row.retrieved_pronunciations??null,
      collapsed_candidates:row.collapsed_candidates??null,
      channel_counts:row.channel_counts??null,
    })),
    representative_queries:selectedQuality&&selectedDiversity!==null
      ?queryReports
        .filter((row)=>['time','nation','record','route','love','cough'].includes(row.normalized))
        .map((row)=>({
          normalized:row.normalized,
          quality_top10:row.configs?.[selectedQuality]?.top20?.slice(0,10)??[],
          diversified_top10:row.configs?.[selectedQuality]?.diversity?.[String(selectedDiversity)]?.top20?.slice(0,10)??[],
        }))
      :[],
    report_profile:'compact-v1',
    debug_report_written:Boolean(debugReportPath),
    safeguards:{
      read_only:true,
      product_en_enabled:false,
      runtime_api_rewired:false,
      german_database_mutated:false,
      broad_g2p:false,
      raw_query_spelling_overlap_used_for_ranking:false,
      ranking_promoted:false,
      diversity_promoted:false,
    },
    next_gate:accepted
      ?'Implement selected English Writer policy in the product runtime and run one integrated EN/DE+EN product smoke + repeatability acceptance bundle.'
      :'Inspect failed structural gates and adjust only the failing ranking/diversity dimension.',
  };
  const report={...evidence,semantic_fingerprint:hashJson(evidence)};
  await mkdir(dirname(outPath),{recursive:true});
  await writeFile(outPath,JSON.stringify(report,null,2)+'\n');
  if(debugReportPath){
    const debugReport={
      ...report,
      report_profile:'debug-v1',
      queries:queryReports,
    };
    await mkdir(dirname(debugReportPath),{recursive:true});
    await writeFile(debugReportPath,JSON.stringify(debugReport)+'\n');
  }

  console.log('\nPHASE 12B10 ENGLISH WRITER ACCEPTANCE');
  console.log(JSON.stringify({
    status:report.status,
    runtime_fingerprint:report.runtime_diagnostic_fingerprint,
    selected_queries:selected.length,
    quality_evaluations:qualityEvaluations,
    selected_quality:selectedQuality,
    diversity_evaluations:diversityEvaluations,
    selected_diversity_weight:selectedDiversity,
    semantic_fingerprint:report.semantic_fingerprint,
    report:outPath,
    debug_report:debugReportPath,
  },null,2));
  if(!accepted) process.exitCode=1;
}finally{
  db.close();
}
