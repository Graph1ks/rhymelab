#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { openWriterDb, DEFAULT_WRITER_DB_PATH } from '../src/experimental-writer-db.mjs';
import { findWriterRhymes } from '../src/writer-search.mjs';
import {
  ACCEPTED_ENGLISH_DB_FINGERPRINT,
  ACCEPTED_ENGLISH_DB_SCHEMA,
  ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
  ACCEPTED_ENGLISH_RUNTIME_FINGERPRINT,
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  ENGLISH_PRODUCT_MARKER_SCHEMA,
  ENGLISH_PRODUCT_RETRIEVAL_PROFILE,
  ENGLISH_PRODUCT_CHANNEL_LIMITS,
  ENGLISH_PRODUCT_MAX_CANDIDATES,
  ENGLISH_WRITER_DIVERSITY_WEIGHT,
  ENGLISH_WRITER_PRODUCT_POLICY,
  ENGLISH_WRITER_PRODUCT_RUNTIME,
  ENGLISH_WRITER_QUALITY_ID,
  openEnglishWriterDb,
} from '../src/english-writer-runtime.mjs';
import { ENGLISH_WRITER_RANKING_V2_POLICY } from './en-writer-ranking-v2-core.mjs';
import {
  searchUnifiedWriter,
  unifiedWriterCapabilities,
} from '../src/unified-writer-search.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
}

const germanDbPath=resolve(argValue('--de-db',DEFAULT_WRITER_DB_PATH));
const englishDbPath=resolve(argValue('--en-db',DEFAULT_ENGLISH_WRITER_DB_PATH));
const reportPath=resolve(argValue('--out','data/local/en-product-acceptance-v1-report.json'));
const markerPath=resolve(argValue('--marker',DEFAULT_ENGLISH_PRODUCT_MARKER_PATH));

const GERMAN_SENTINELS=Object.freeze([
  'Arbeitsweise',
  'Liebe',
  'Zeit',
  'Nacht',
  'Musik',
  'Freiheit',
  'Leben',
]);
const ENGLISH_SENTINELS=Object.freeze([
  'time',
  'nation',
  'record',
  'route',
  'cat',
  'love',
  'cough',
]);
const BOTH_SENTINELS=Object.freeze([
  'time',
  'Arbeitsweise',
  'Liebe',
  'record',
]);

function hashJson(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function compactResult(row){
  return {
    language:row.language||null,
    normalized:row.normalized,
    type:row.type,
    primaryType:row.primaryType??null,
    relationTypes:row.relationTypes||[],
    score:Number(row.score||0),
    rhymeTier:Number(row.rhymeTier??99),
    syllableDistance:Number(row.syllableDistance||0),
    usageRank:row.usageRank??null,
    channelRank:Number(row.channelRank||row.writerRank||0),
  };
}

function compactTop(rows,limit=12){
  return (rows||[]).slice(0,limit).map(compactResult);
}

function sameRows(a,b){
  return JSON.stringify((a||[]).map(compactResult))
    ===JSON.stringify((b||[]).map(compactResult));
}

function containsTarget(result,normalized,type){
  return Boolean(result?.results?.some((row)=>
    row.normalized===normalized
    &&(type?row.type===type:true)
  ));
}

function runSuite(){
  const writerDb=openWriterDb(germanDbPath);
  const englishDb=openEnglishWriterDb(englishDbPath,{
    requireProductAcceptance:false,
  });
  try{
    const capabilities=unifiedWriterCapabilities({writerDb,englishDb});
    const germanInvariance=[];
    for(const query of GERMAN_SENTINELS){
      const direct=findWriterRhymes(writerDb,query,{
        limit:60,
        poolLimit:800,
        includeVariants:false,
        includeHistorical:false,
        type:'all',
        ensureTypeCoverage:false,
      });
      const unified=searchUnifiedWriter(
        {writerDb,englishDb},
        query,
        {
          language:'de',
          scope:'words',
          wordLimit:60,
          wordPoolLimit:800,
          includeVariants:false,
          includeHistorical:false,
          type:'all',
        },
      );
      const unifiedRows=unified.channels.words?.byLanguage?.de?.results||[];
      germanInvariance.push({
        query,
        direct_found:Boolean(direct),
        unified_status:unified.status,
        direct_count:direct?.results?.length||0,
        unified_count:unifiedRows.length,
        equal:Boolean(direct&&sameRows(direct.results,unifiedRows)),
        direct_top10:compactTop(direct?.results,10),
        unified_top10:compactTop(unifiedRows,10),
      });
    }

    const english=[];
    for(const query of ENGLISH_SENTINELS){
      const result=searchUnifiedWriter(
        {writerDb,englishDb},
        query,
        {
          language:'en',
          scope:'words',
          wordLimit:80,
          type:'all',
        },
      );
      english.push({
        query,
        status:result.status,
        resolvedLanguages:result.resolvedLanguages,
        result_count:result.results.length,
        query_pronunciations:result.query?.pronunciations?.length||0,
        ranking_policy:result.channels.words?.byLanguage?.en?.rankingPolicy||null,
        quality_candidate:result.channels.words?.byLanguage?.en?.qualityCandidate||null,
        diversity_weight:result.channels.words?.byLanguage?.en?.diversityWeight??null,
        retrieval_profile:result.channels.words?.byLanguage?.en?.writerRetrieval?.profile||null,
        retrieval_channel_limits:result.channels.words?.byLanguage?.en?.writerRetrieval?.channelLimits||null,
        retrieval_max_candidates:result.channels.words?.byLanguage?.en?.writerRetrieval?.maxCandidates??null,
        language_leakage:result.results.filter((row)=>row.language!=='en').length,
        top12:compactTop(result.results,12),
        targets:{
          rhyme_perfect:query==='time'?containsTarget(result,'rhyme','perfect'):null,
          station_multisyllabic:query==='nation'
            ?containsTarget(result,'station','multisyllabic_perfect')
            :null,
        },
      });
    }

    const both=[];
    for(const query of BOTH_SENTINELS){
      const result=searchUnifiedWriter(
        {writerDb,englishDb},
        query,
        {
          language:'both',
          scope:'words',
          wordLimit:50,
          wordPoolLimit:800,
          type:'all',
        },
      );
      both.push({
        query,
        status:result.status,
        requestedLanguages:result.requestedLanguages,
        activeLanguages:result.activeLanguages,
        resolvedLanguages:result.resolvedLanguages,
        german_words:result.counts?.germanWords||0,
        english_words:result.counts?.englishWords||0,
        total_words:result.counts?.words||0,
        count_consistent:
          Number(result.counts?.words||0)
          ===Number(result.counts?.germanWords||0)+Number(result.counts?.englishWords||0),
        languages:[...new Set(result.results.map((row)=>row.language))].sort(),
        top12:compactTop(result.results,12),
      });
    }

    const englishPhraseProbe=searchUnifiedWriter(
      {writerDb,englishDb},
      'time',
      {language:'en',scope:'phrases'},
    );
    const unknownProbe=searchUnifiedWriter(
      {writerDb,englishDb},
      'zzzznotaword',
      {language:'en',scope:'words'},
    );

    return {
      capabilities:{
        de_available:Boolean(capabilities.languages.de.available),
        en_available:Boolean(capabilities.languages.en.available),
        en_word_writer:Boolean(capabilities.languages.en.wordWriter),
        en_phrase_mosaic:Boolean(capabilities.languages.en.phraseMosaic),
        en_policy:capabilities.languages.en.policy||null,
        en_quality_candidate:capabilities.languages.en.qualityCandidate||null,
        en_diversity_weight:capabilities.languages.en.diversityWeight??null,
        en_database_fingerprint:capabilities.languages.en.databaseFingerprint||null,
        en_publish_fingerprint:capabilities.languages.en.publishFingerprint||null,
      },
      german_invariance:germanInvariance,
      english,
      both,
      english_phrase_probe:{
        status:englishPhraseProbe.status,
        available:englishPhraseProbe.channels.phrases.available,
        reason:englishPhraseProbe.channels.phrases.reason,
        result_count:englishPhraseProbe.results.length,
      },
      unknown_english_probe:{
        status:unknownProbe.status,
        result_count:unknownProbe.results.length,
      },
    };
  }finally{
    writerDb.close();
    englishDb.close();
  }
}

await mkdir(dirname(reportPath),{recursive:true});
await mkdir(dirname(markerPath),{recursive:true});
await rm(markerPath,{force:true});

const first=runSuite();
const second=runSuite();
const firstFingerprint=hashJson(first);
const secondFingerprint=hashJson(second);

const checks=[
  {
    id:'capabilities_de_en_word_writer',
    pass:first.capabilities.de_available
      &&first.capabilities.en_available
      &&first.capabilities.en_word_writer,
  },
  {
    id:'english_policy_exact',
    pass:first.capabilities.en_policy===ENGLISH_WRITER_PRODUCT_POLICY
      &&first.capabilities.en_quality_candidate===ENGLISH_WRITER_QUALITY_ID
      &&Number(first.capabilities.en_diversity_weight)===ENGLISH_WRITER_DIVERSITY_WEIGHT,
  },
  {
    id:'english_product_retrieval_profile_exact',
    pass:first.english.every((row)=>
      row.retrieval_profile===ENGLISH_PRODUCT_RETRIEVAL_PROFILE
      &&Number(row.retrieval_channel_limits?.exact)===ENGLISH_PRODUCT_CHANNEL_LIMITS.exact
      &&Number(row.retrieval_channel_limits?.multi)===ENGLISH_PRODUCT_CHANNEL_LIMITS.multi
      &&Number(row.retrieval_channel_limits?.vowel)===ENGLISH_PRODUCT_CHANNEL_LIMITS.vowel
      &&Number(row.retrieval_channel_limits?.family_coda)===ENGLISH_PRODUCT_CHANNEL_LIMITS.family_coda
      &&Number(row.retrieval_channel_limits?.coda)===ENGLISH_PRODUCT_CHANNEL_LIMITS.coda
      &&Number(row.retrieval_max_candidates)===ENGLISH_PRODUCT_MAX_CANDIDATES
    ),
  },
  {
    id:'english_database_fingerprint_exact',
    pass:first.capabilities.en_database_fingerprint===ACCEPTED_ENGLISH_DB_FINGERPRINT
      &&first.capabilities.en_publish_fingerprint===ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
  },
  {
    id:'german_frozen_writer_invariance',
    pass:first.german_invariance.every((row)=>row.direct_found&&row.equal),
  },
  {
    id:'english_sentinels_resolve_without_language_leakage',
    pass:first.english.every((row)=>
      row.status==='ok'
      &&row.resolvedLanguages.includes('en')
      &&row.result_count>0
      &&row.language_leakage===0
    ),
  },
  {
    id:'english_perfect_time_rhyme',
    pass:first.english.find((row)=>row.query==='time')?.targets?.rhyme_perfect===true,
  },
  {
    id:'english_multisyllabic_nation_station',
    pass:first.english.find((row)=>row.query==='nation')?.targets?.station_multisyllabic===true,
  },
  {
    id:'english_record_stress_variants_preserved',
    pass:Number(first.english.find((row)=>row.query==='record')?.query_pronunciations||0)>=2,
  },
  {
    id:'english_route_alternates_preserved',
    pass:Number(first.english.find((row)=>row.query==='route')?.query_pronunciations||0)>=2,
  },
  {
    id:'both_mode_full_capability_and_count_consistency',
    pass:first.both.every((row)=>
      row.status==='ok'
      &&row.activeLanguages.includes('de')
      &&row.activeLanguages.includes('en')
      &&row.count_consistent
    ),
  },
  {
    id:'english_phrase_channel_remains_explicitly_unavailable',
    pass:first.english_phrase_probe.status==='ok'
      &&first.english_phrase_probe.available===false
      &&first.english_phrase_probe.reason==='english_phrase_mosaic_not_implemented'
      &&first.english_phrase_probe.result_count===0,
  },
  {
    id:'unknown_english_query_does_not_fake_pronunciation',
    pass:first.unknown_english_probe.status==='query_not_found'
      &&first.unknown_english_probe.result_count===0,
  },
  {
    id:'independent_open_repeatability',
    pass:firstFingerprint===secondFingerprint,
  },
];
const failedChecks=checks.filter((row)=>!row.pass);
const status=failedChecks.length?'failed':'ok';

const evidence={
  schema:'rhymelab-en-product-acceptance-v1',
  status,
  database_schema:ACCEPTED_ENGLISH_DB_SCHEMA,
  db_semantic_fingerprint:ACCEPTED_ENGLISH_DB_FINGERPRINT,
  source_publish_fingerprint:ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
  runtime_diagnostic_fingerprint:ACCEPTED_ENGLISH_RUNTIME_FINGERPRINT,
  ranking_evidence_policy:ENGLISH_WRITER_RANKING_V2_POLICY,
  product_runtime:ENGLISH_WRITER_PRODUCT_RUNTIME,
  product_policy:ENGLISH_WRITER_PRODUCT_POLICY,
  product_retrieval_profile:ENGLISH_PRODUCT_RETRIEVAL_PROFILE,
  product_channel_limits:ENGLISH_PRODUCT_CHANNEL_LIMITS,
  product_max_candidates:ENGLISH_PRODUCT_MAX_CANDIDATES,
  quality_candidate:ENGLISH_WRITER_QUALITY_ID,
  diversity_weight:ENGLISH_WRITER_DIVERSITY_WEIGHT,
  german_database:germanDbPath,
  english_database:englishDbPath,
  suite_repeatability:{
    first_fingerprint:firstFingerprint,
    second_fingerprint:secondFingerprint,
    fingerprints_equal:firstFingerprint===secondFingerprint,
  },
  checks,
  failed_checks:failedChecks.map((row)=>row.id),
  first_run:first,
  safeguards:{
    local_only:true,
    read_only_databases:true,
    german_database_mutated:false,
    english_database_mutated:false,
    broad_g2p:false,
    english_phrase_mosaic_enabled:false,
    english_entity_channel_enabled:false,
    cross_language_score_calibration:false,
    marker_written_only_on_pass:true,
    compact_report:true,
  },
};
const semanticFingerprint=hashJson(evidence);
const report={
  ...evidence,
  semantic_fingerprint:semanticFingerprint,
  acceptance_marker:status==='ok'?markerPath:null,
};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');

if(status==='ok'){
  const marker={
    schema:ENGLISH_PRODUCT_MARKER_SCHEMA,
    status:'accepted',
    database_schema:ACCEPTED_ENGLISH_DB_SCHEMA,
    db_semantic_fingerprint:ACCEPTED_ENGLISH_DB_FINGERPRINT,
    source_publish_fingerprint:ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
    runtime_diagnostic_fingerprint:ACCEPTED_ENGLISH_RUNTIME_FINGERPRINT,
    ranking_evidence_policy:ENGLISH_WRITER_RANKING_V2_POLICY,
    product_runtime:ENGLISH_WRITER_PRODUCT_RUNTIME,
    product_policy:ENGLISH_WRITER_PRODUCT_POLICY,
    product_retrieval_profile:ENGLISH_PRODUCT_RETRIEVAL_PROFILE,
    quality_candidate:ENGLISH_WRITER_QUALITY_ID,
    diversity_weight:ENGLISH_WRITER_DIVERSITY_WEIGHT,
    acceptance_report_fingerprint:semanticFingerprint,
    acceptance_report:reportPath,
    generated_at:new Date().toISOString(),
  };
  await writeFile(markerPath,JSON.stringify(marker,null,2)+'\n');
}

console.log('\nPHASE 12B11 ENGLISH PRODUCT INTEGRATION ACCEPTANCE');
console.log(JSON.stringify({
  status,
  failed_checks:failedChecks.map((row)=>row.id),
  first_suite_fingerprint:firstFingerprint,
  second_suite_fingerprint:secondFingerprint,
  semantic_fingerprint:semanticFingerprint,
  report:reportPath,
  marker:status==='ok'?markerPath:null,
},null,2));

if(status!=='ok') process.exitCode=1;
