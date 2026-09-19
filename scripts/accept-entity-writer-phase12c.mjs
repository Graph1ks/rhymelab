#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  DEFAULT_WRITER_DB_PATH,
  openWriterDb,
} from '../src/experimental-writer-db.mjs';
import {
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  openEnglishWriterDb,
} from '../src/english-writer-runtime.mjs';
import {
  DEFAULT_ENTITY_DB_PATH,
  openEntityWriterDb,
} from '../src/entity-writer-runtime.mjs';
import {
  ENTITY_PHONETIC_BAND_WIDTH,
  ENTITY_WRITER_RANKING_POLICY,
} from '../src/entity-writer-ranking.mjs';
import {
  searchUnifiedWriter,
  unifiedWriterCapabilities,
} from '../src/unified-writer-search.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}

const germanDbPath=resolve(argValue('--de-db',DEFAULT_WRITER_DB_PATH));
const englishDbPath=resolve(argValue('--en-db',DEFAULT_ENGLISH_WRITER_DB_PATH));
const englishMarkerPath=resolve(
  argValue('--en-marker',DEFAULT_ENGLISH_PRODUCT_MARKER_PATH)
);
const entityDbPath=resolve(argValue('--entity-db',DEFAULT_ENTITY_DB_PATH));
const planPath=resolve(
  argValue('--plan','benchmarks/entity-writer-v1/plan.json')
);
const reportPath=resolve(
  argValue('--out','data/local/entity-writer-acceptance-v1-report.json')
);

const plan=JSON.parse(await readFile(planPath,'utf8'));
if(plan.schema!=='rhymelab-entity-writer-acceptance-plan-v1'){
  throw new Error(`Unexpected Entity Writer acceptance plan schema: ${plan.schema||'missing'}`);
}

const entityLimit=Math.max(1,Number(plan.sampling?.entity_limit||40));
const entityPoolLimit=Math.max(16,Number(plan.sampling?.entity_pool_limit||256));
const reviewDepth=Math.max(1,Number(plan.sampling?.review_depth||12));
const runs=Math.max(2,Number(argValue('--runs',plan.sampling?.runs||2)));
const gates=plan.gates||{};

function hashJson(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function round(value,digits=4){
  return Number.isFinite(Number(value))?Number(Number(value).toFixed(digits)):null;
}
function percentile(values,p){
  const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!xs.length) return null;
  const index=Math.min(xs.length-1,Math.max(0,Math.ceil(xs.length*p)-1));
  return round(xs[index],3);
}
function countDuplicateQids(rows){
  const seen=new Set();
  let duplicates=0;
  for(const row of rows){
    const qid=String(row.entityQid||'');
    if(!qid) continue;
    if(seen.has(qid)) duplicates+=1;
    else seen.add(qid);
  }
  return duplicates;
}
function maxRepeatedSurface(rows){
  const counts=new Map();
  for(const row of rows){
    const key=String(row.normalized||'');
    if(!key) continue;
    counts.set(key,Number(counts.get(key)||0)+1);
  }
  return counts.size?Math.max(...counts.values()):0;
}
function prominenceReorders(rows){
  let count=0;
  let maxGap=0;
  for(let i=0;i<rows.length-1;i+=1){
    const a=rows[i];
    const b=rows[i+1];
    if(
      Number(a.rhymeTier)===Number(b.rhymeTier)
      &&Number(a.rankingEvidence?.phoneticBand)===Number(b.rankingEvidence?.phoneticBand)
      &&Number(a.syllableDistance)===Number(b.syllableDistance)
      &&Number(a.score)<Number(b.score)
      &&Number(a.rankingEvidence?.prominencePercentile||0)
        >=Number(b.rankingEvidence?.prominencePercentile||0)
    ){
      count+=1;
      maxGap=Math.max(maxGap,Number(b.score)-Number(a.score));
    }
  }
  return {count,max_score_gap:round(maxGap,4)};
}
function compactResult(row){
  return {
    rank:Number(row.channelRank||0),
    qid:row.entityQid||null,
    surface:row.surface,
    normalized:row.normalized,
    language:row.language,
    primary_category:row.primaryCategory||null,
    type:row.type,
    primary_type:row.primaryType||null,
    relation_types:row.relationTypes||[],
    rhyme_tier:Number(row.rhymeTier??99),
    score:round(row.score),
    phonetic_band:Number(row.rankingEvidence?.phoneticBand??99),
    syllable_distance:Number(row.syllableDistance||0),
    category_percentile:round(
      row.selectedCategory?.percentile??row.popularityPercentile??0
    ),
    popularity_score:round(row.popularityScore),
    popularity_tier:row.popularityTier||null,
    pronunciation_source:row.pronunciationSource||null,
    generated:Boolean(row.pronunciationGenerated),
    review_state:row.pronunciationReviewState||null,
  };
}

function runSuite(){
  const writerDb=openWriterDb(germanDbPath);
  const englishDb=openEnglishWriterDb(englishDbPath,{
    requireProductAcceptance:true,
    markerPath:englishMarkerPath,
  });
  const entityDb=openEntityWriterDb(entityDbPath);

  try{
    const capabilities=unifiedWriterCapabilities({
      writerDb,
      englishDb,
      entityDb,
    });
    const queryReports=[];
    const timings=[];

    for(const language of ['de','en']){
      for(const surface of plan.queries?.[language]||[]){
        const started=performance.now();
        const result=searchUnifiedWriter(
          {writerDb,englishDb,entityDb},
          surface,
          {
            language,
            scope:'entities',
            type:'all',
            entityLimit,
            entityPoolLimit,
          },
        );
        const elapsed=performance.now()-started;
        timings.push(elapsed);
        const channel=result.channels?.entities?.byLanguage?.[language]||{};
        const rows=channel.results||[];
        const diagnostics=channel.rankingDiagnostics||{};
        const reorders=prominenceReorders(rows);
        queryReports.push({
          language,
          surface,
          status:result.status,
          query_resolved:result.resolvedLanguages?.includes(language)||false,
          result_count:rows.length,
          candidate_count:Number(channel.candidateCount||0),
          scored_candidate_count:Number(channel.scoredCandidateCount||0),
          category_batch_queries:Number(diagnostics.categoryBatchQueries||0),
          ranking_policy:channel.rankingPolicy||null,
          ranking_guard_violations:(diagnostics.guardViolations||[]).length,
          generated_rows:rows.filter((row)=>row.pronunciationGenerated).length,
          missing_provenance_rows:rows.filter((row)=>!row.pronunciationSource).length,
          duplicate_qids:countDuplicateQids(rows),
          max_repeated_surface:maxRepeatedSurface(rows),
          suppression_reason_counts:diagnostics.suppressionReasonCounts||{},
          prominence_reorders:reorders,
          elapsed_ms:round(elapsed,3),
          top:rows.slice(0,reviewDepth).map(compactResult),
        });
      }
    }

    const both=[];
    for(const surface of plan.both_probes||[]){
      const result=searchUnifiedWriter(
        {writerDb,englishDb,entityDb},
        surface,
        {
          language:'both',
          scope:'entities',
          type:'all',
          entityLimit,
          entityPoolLimit,
        },
      );
      both.push({
        surface,
        status:result.status,
        active_languages:result.activeLanguages,
        resolved_languages:result.resolvedLanguages,
        cross_channel_calibration:Boolean(result.ordering?.crossChannelCalibration),
        cross_language_calibration:Boolean(result.ordering?.crossLanguageCalibration),
        german_entities:
          result.channels?.entities?.byLanguage?.de?.results?.length||0,
        english_entities:
          result.channels?.entities?.byLanguage?.en?.results?.length||0,
        total_entities:result.channels?.entities?.results?.length||0,
      });
    }

    return {
      capabilities:{
        de_entity_available:Boolean(capabilities.languages?.de?.entityRhymes),
        en_entity_available:Boolean(capabilities.languages?.en?.entityRhymes),
        multilingual_entity_available:Boolean(capabilities.entities?.multilingualAvailable),
        de_entity_reason:capabilities.languages?.de?.entityReason||null,
        en_entity_reason:capabilities.languages?.en?.entityReason||null,
        de_pronunciations:Number(capabilities.entities?.languages?.de?.pronunciations||0),
        en_pronunciations:Number(capabilities.entities?.languages?.en?.pronunciations||0),
      },
      queries:queryReports,
      both,
      timing:{
        queries:timings.length,
        p50_ms:percentile(timings,0.5),
        p95_ms:percentile(timings,0.95),
        max_ms:timings.length?round(Math.max(...timings),3):null,
      },
    };
  }finally{
    entityDb.close();
    englishDb.close();
    writerDb.close();
  }
}

function semanticProjection(run){
  return {
    capabilities:run.capabilities,
    queries:run.queries.map(({elapsed_ms,...row})=>row),
    both:run.both,
  };
}

const reports=[];
for(let run=1;run<=runs;run+=1){
  const value=runSuite();
  reports.push({
    run,
    ...value,
    semantic_fingerprint:hashJson(semanticProjection(value)),
  });
}

const first=reports[0];
const repeatable=reports.every(
  (row)=>row.semantic_fingerprint===first.semantic_fingerprint
);
const queryRows=first.queries;
const byLanguage=(language)=>queryRows.filter((row)=>row.language===language);
const resolvedFraction=(language)=>{
  const rows=byLanguage(language);
  return rows.length
    ?rows.filter((row)=>row.query_resolved).length/rows.length
    :0;
};
const nonemptyFraction=(language)=>{
  const rows=byLanguage(language);
  return rows.length
    ?rows.filter((row)=>row.result_count>0).length/rows.length
    :0;
};

const checks=[
  {
    id:'multilingual_entity_runtime_available',
    pass:first.capabilities.de_entity_available
      &&first.capabilities.en_entity_available
      &&first.capabilities.multilingual_entity_available,
  },
  {
    id:'all_query_languages_resolve',
    pass:['de','en'].every((language)=>
      resolvedFraction(language)>=Number(gates.minimum_resolved_query_fraction??1)
    ),
  },
  {
    id:'german_entity_result_coverage',
    pass:nonemptyFraction('de')>=Number(gates.minimum_nonempty_entity_fraction_de??0),
  },
  {
    id:'english_entity_result_coverage',
    pass:nonemptyFraction('en')>=Number(gates.minimum_nonempty_entity_fraction_en??0),
  },
  {
    id:'ranking_policy_exact',
    pass:queryRows
      .filter((row)=>row.query_resolved)
      .every((row)=>row.ranking_policy===ENTITY_WRITER_RANKING_POLICY),
  },
  {
    id:'phonetic_ranking_guard_clean',
    pass:queryRows.reduce((sum,row)=>sum+row.ranking_guard_violations,0)
      <=Number(gates.ranking_guard_violations_max??0),
  },
  {
    id:'source_backed_results_only',
    pass:queryRows.reduce((sum,row)=>sum+row.generated_rows,0)
      <=Number(gates.generated_runtime_rows_max??0),
  },
  {
    id:'result_provenance_complete',
    pass:queryRows.every((row)=>row.missing_provenance_rows===0),
  },
  {
    id:'entity_qid_deduplication',
    pass:queryRows.every((row)=>
      row.duplicate_qids<=Number(gates.duplicate_qids_per_page_max??0)
    ),
  },
  {
    id:'surface_diversity_cap',
    pass:queryRows.every((row)=>
      row.max_repeated_surface<=Number(gates.repeated_surface_per_page_max??2)
    ),
  },
  {
    id:'category_metadata_batched',
    pass:queryRows.every((row)=>{
      const expectedMax=row.candidate_count
        ?Math.ceil(row.candidate_count/400)
        :0;
      return row.category_batch_queries<=expectedMax;
    }),
  },
  {
    id:'both_mode_has_no_numeric_cross_language_calibration',
    pass:first.both.every((row)=>
      row.cross_channel_calibration===false
      &&row.cross_language_calibration===false
    ),
  },
  {
    id:'repeatable_across_independent_opens',
    pass:repeatable,
  },
];

const failedChecks=checks.filter((row)=>!row.pass).map((row)=>row.id);
const status=failedChecks.length?'failed':'ok';
const report={
  schema:'rhymelab-entity-writer-acceptance-v1',
  status,
  built_at:new Date().toISOString(),
  plan:planPath,
  databases:{
    german:germanDbPath,
    english:englishDbPath,
    english_marker:englishMarkerPath,
    entity:entityDbPath,
  },
  ranking:{
    policy:ENTITY_WRITER_RANKING_POLICY,
    phonetic_band_width:ENTITY_PHONETIC_BAND_WIDTH,
    interpretation:
      'prominence may reorder only inside the same rhyme tier, phonetic band and syllable distance; materially worse phonetic bands cannot be promoted by popularity',
  },
  coverage:{
    de:{
      resolved_fraction:round(resolvedFraction('de'),4),
      nonempty_entity_fraction:round(nonemptyFraction('de'),4),
    },
    en:{
      resolved_fraction:round(resolvedFraction('en'),4),
      nonempty_entity_fraction:round(nonemptyFraction('en'),4),
    },
  },
  checks,
  failed_checks:failedChecks,
  repeatability:{
    repeatable,
    fingerprints:reports.map((row)=>({
      run:row.run,
      semantic_fingerprint:row.semantic_fingerprint,
    })),
  },
  timing:reports.map((row)=>({run:row.run,...row.timing})),
  first_run:first,
  semantic_quality_review:{
    required:true,
    source:'owner_review_of_representative_top_results',
    note:'This suite does not invent human relevance gold. The top result pages are persisted for review before Phase 12C product acceptance is frozen.',
  },
  safeguards:{
    read_only_acceptance:true,
    local_only:true,
    no_network_inference:true,
    no_ai_staging_required:true,
    generated_entity_runtime_allowed:false,
    cross_language_score_calibration:false,
  },
};
report.semantic_fingerprint=hashJson({
  ...report,
  built_at:undefined,
  semantic_fingerprint:undefined,
  timing:undefined,
});

await mkdir(dirname(reportPath),{recursive:true});
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');

console.log('\nPHASE 12C ENTITY WRITER ACCEPTANCE');
console.log(JSON.stringify({
  status,
  failed_checks:failedChecks,
  coverage:report.coverage,
  ranking_policy:ENTITY_WRITER_RANKING_POLICY,
  phonetic_band_width:ENTITY_PHONETIC_BAND_WIDTH,
  repeatable,
  timing:first.timing,
  semantic_fingerprint:report.semantic_fingerprint,
  report:reportPath,
},null,2));

if(status!=='ok') process.exitCode=1;
