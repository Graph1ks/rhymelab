#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { openWriterDb, DEFAULT_WRITER_DB_PATH } from '../src/experimental-writer-db.mjs';
import {
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  openEnglishWriterDb,
} from '../src/english-writer-runtime.mjs';
import {
  DEFAULT_ENTITY_DB_PATH,
  openEntityWriterDb,
} from '../src/entity-writer-runtime.mjs';
import { openPhraseBrowserDb } from '../src/phrase-browser-store.mjs';
import {
  DEFAULT_GENERATED_ENGLISH_DB_PATH,
  DEFAULT_GENERATED_ENTITY_DB_PATH,
  DEFAULT_GENERATED_OPTIN_MARKER_PATH,
  DEFAULT_GENERATED_OPTIN_REPORT_PATH,
  GENERATED_OPTIN_MARKER_SCHEMA,
  GENERATED_OPTIN_RUNTIME_POLICY,
  DEFAULT_GENERATED_PHRASE_DB_PATH,
  DEFAULT_GENERATED_WRITER_DB_PATH,
  openGeneratedOptinRuntime,
  selectGeneratedOptinDatabases,
} from '../src/generated-optin-runtime.mjs';
import {
  searchUnifiedWriter,
  unifiedWriterCapabilities,
} from '../src/unified-writer-search.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}
function numArg(flag,fallback,min=1,max=60000){
  const value=Number(argValue(flag,fallback));
  return Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
}

const writerPath=resolve(argValue('--writer',DEFAULT_WRITER_DB_PATH));
const englishPath=resolve(argValue('--english',DEFAULT_ENGLISH_WRITER_DB_PATH));
const phrasePath=resolve(argValue('--phrases','data/local/rhymelab-phrases-v1.sqlite'));
const entityPath=resolve(argValue('--entities',DEFAULT_ENTITY_DB_PATH));
const reportPath=resolve(argValue('--parity-report',DEFAULT_GENERATED_OPTIN_REPORT_PATH));
const markerOutPath=resolve(argValue('--marker',DEFAULT_GENERATED_OPTIN_MARKER_PATH));
const generatedWriterPath=resolve(argValue('--generated-writer',DEFAULT_GENERATED_WRITER_DB_PATH));
const generatedEnglishPath=resolve(argValue('--generated-english',DEFAULT_GENERATED_ENGLISH_DB_PATH));
const generatedPhrasePath=resolve(argValue('--generated-phrases',DEFAULT_GENERATED_PHRASE_DB_PATH));
const generatedEntityPath=resolve(argValue('--generated-entities',DEFAULT_GENERATED_ENTITY_DB_PATH));
const markerPath=resolve(argValue('--english-marker',DEFAULT_ENGLISH_PRODUCT_MARKER_PATH));
const outPath=resolve(argValue('--out','data/local/generated-optin-runtime-acceptance-v1-report.json'));
const maxQueryMs=numArg('--max-query-ms',5000,250,60000);

const sha=(value)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const count=(db,sql,...params)=>Number(db.prepare(sql).get(...params)?.c||0);

let writerDb=null;
let englishDb=null;
let phraseDb=null;
let entityDb=null;
let generatedRuntime=null;

function closeQuietly(db){try{db?.close()}catch{}}

function searchProjection(result){
  return {
    schema:result?.schema||null,
    policy:result?.policy||null,
    status:result?.status||null,
    languageBasis:result?.languageBasis||null,
    resultLanguageBasis:result?.resultLanguageBasis||null,
    scope:result?.scope||null,
    query:result?.query||null,
    queries:result?.queries||null,
    channels:result?.channels||null,
    results:result?.results||[],
  };
}

function findGeneratedOnlyGerman(canonical,generated){
  const rows=generated.prepare(`
    SELECT surface,normalized FROM hot
    WHERE pronunciation_flags LIKE '%secondary_opt_in%'
    ORDER BY id LIMIT 2000
  `).all();
  const exists=canonical.prepare('SELECT 1 AS ok FROM hot WHERE normalized=? LIMIT 1');
  return rows.find((row)=>!exists.get(row.normalized))||null;
}

function findGeneratedOnlyEnglish(canonical,generated){
  const rows=generated.prepare(`
    SELECT f.surface,f.normalized
    FROM en_pronunciation p
    JOIN en_form f ON f.id=p.form_id
    WHERE p.source='espeak_ng_generated_secondary'
    ORDER BY p.id LIMIT 2000
  `).all();
  const exists=canonical.prepare('SELECT 1 AS ok FROM en_form WHERE normalized=? LIMIT 1');
  return rows.find((row)=>!exists.get(row.normalized))||null;
}

function findGeneratedOnlyPhrasePronunciation(canonical,generated){
  const rows=generated.prepare(`
    SELECT phrase_pronunciation_id,phrase_id
    FROM phrase_pronunciation
    ORDER BY phrase_pronunciation_id
  `).iterate();
  const exists=canonical.prepare(
    'SELECT 1 AS ok FROM phrase_pronunciation WHERE phrase_pronunciation_id=? LIMIT 1'
  );
  let checked=0;
  for(const row of rows){
    checked+=1;
    if(!exists.get(row.phrase_pronunciation_id))return row;
    if(checked>=20000)break;
  }
  return null;
}

try{
  writerDb=openWriterDb(writerPath);
  englishDb=openEnglishWriterDb(englishPath,{
    requireProductAcceptance:true,
    markerPath,
  });
  phraseDb=openPhraseBrowserDb(phrasePath);
  entityDb=openEntityWriterDb(entityPath);

  const canonical={
    writerDb,
    englishDb,
    phraseDb,
    entityDb,
    generatedOverlay:false,
  };
  generatedRuntime=openGeneratedOptinRuntime({
    reportPath,
    acceptanceMarkerPath:markerOutPath,
    requireRuntimeAcceptance:false,
    writerPath:generatedWriterPath,
    englishPath:generatedEnglishPath,
    phrasePath:generatedPhrasePath,
    entityPath:generatedEntityPath,
    englishMarkerPath:markerPath,
  });
  if(!generatedRuntime.available){
    throw new Error(
      'Generated opt-in runtime is unavailable: '+generatedRuntime.reason+
      (generatedRuntime.error?' · '+generatedRuntime.error:'')
    );
  }

  const offSelection=selectGeneratedOptinDatabases(canonical,generatedRuntime,false);
  const onSelection=selectGeneratedOptinDatabases(canonical,generatedRuntime,true);
  const generated=onSelection.databases;

  const markerCounts={
    de:{
      canonical:count(writerDb,"SELECT COUNT(*) AS c FROM hot WHERE pronunciation_flags LIKE '%secondary_opt_in%'"),
      generated:count(generated.writerDb,"SELECT COUNT(*) AS c FROM hot WHERE pronunciation_flags LIKE '%secondary_opt_in%'"),
    },
    en:{
      canonical:count(englishDb,"SELECT COUNT(*) AS c FROM en_pronunciation WHERE source='espeak_ng_generated_secondary'"),
      generated:count(generated.englishDb,"SELECT COUNT(*) AS c FROM en_pronunciation WHERE source='espeak_ng_generated_secondary'"),
    },
    phrases:{
      canonical:count(phraseDb,"SELECT COUNT(DISTINCT phrase_pronunciation_id) AS c FROM phrase_pronunciation_token WHERE LOWER(COALESCE(pronunciation_source,'')) LIKE '%espeak%'"),
      generated:count(generated.phraseDb,"SELECT COUNT(DISTINCT phrase_pronunciation_id) AS c FROM phrase_pronunciation_token WHERE LOWER(COALESCE(pronunciation_source,'')) LIKE '%espeak%'"),
    },
    entities:{
      canonical:count(entityDb,"SELECT COUNT(*) AS c FROM entity_pronunciation WHERE source_kind='espeak_ng_generated_secondary'"),
      generated:count(generated.entityDb,"SELECT COUNT(*) AS c FROM entity_pronunciation WHERE source_kind='espeak_ng_generated_secondary'"),
    },
  };

  const tableCounts={
    de:{
      canonical:count(writerDb,'SELECT COUNT(*) AS c FROM hot'),
      generated:count(generated.writerDb,'SELECT COUNT(*) AS c FROM hot'),
    },
    en:{
      canonical:count(englishDb,'SELECT COUNT(*) AS c FROM en_pronunciation'),
      generated:count(generated.englishDb,'SELECT COUNT(*) AS c FROM en_pronunciation'),
    },
    phrases:{
      canonical:count(phraseDb,'SELECT COUNT(*) AS c FROM phrase_pronunciation'),
      generated:count(generated.phraseDb,'SELECT COUNT(*) AS c FROM phrase_pronunciation'),
    },
    entities:{
      canonical:count(entityDb,'SELECT COUNT(*) AS c FROM entity_pronunciation'),
      generated:count(generated.entityDb,'SELECT COUNT(*) AS c FROM entity_pronunciation'),
    },
  };

  const generatedOnlyProbes={
    de:findGeneratedOnlyGerman(writerDb,generated.writerDb),
    en:findGeneratedOnlyEnglish(englishDb,generated.englishDb),
    phrase:findGeneratedOnlyPhrasePronunciation(phraseDb,generated.phraseDb),
    entity:generated.entityDb.prepare(`
      SELECT p.pronunciation_id,p.name_id,n.surface,n.language
      FROM entity_pronunciation p
      JOIN entity_name n USING(name_id)
      WHERE p.source_kind='espeak_ng_generated_secondary'
      ORDER BY p.pronunciation_id LIMIT 1
    `).get()||null,
  };

  const cases=[
    {
      id:'de_words_liebe',
      input:'Liebe',
      options:{language:'de',resultLanguage:'de',scope:'words',wordLimit:80,wordPoolLimit:300},
    },
    {
      id:'en_words_time',
      input:'time',
      options:{language:'en',resultLanguage:'en',scope:'words',wordLimit:80},
    },
    {
      id:'de_phrases_freiheit',
      input:'Freiheit',
      options:{language:'de',resultLanguage:'de',scope:'phrases',phraseLimit:80,phrasePoolLimit:256},
    },
    {
      id:'de_entities_musik',
      input:'Musik',
      options:{language:'de',resultLanguage:'de',scope:'entities',entityLimit:80,entityPoolLimit:256},
    },
  ];

  const queryCases=[];
  for(const testCase of cases){
    const directCanonical=searchUnifiedWriter(canonical,testCase.input,testCase.options);
    const routedOff=searchUnifiedWriter(offSelection.databases,testCase.input,testCase.options);
    const canonicalFingerprint=sha(searchProjection(directCanonical));
    const routedOffFingerprint=sha(searchProjection(routedOff));

    const started=performance.now();
    const routedOn=searchUnifiedWriter(onSelection.databases,testCase.input,testCase.options);
    const elapsedMs=performance.now()-started;

    queryCases.push({
      id:testCase.id,
      canonical_status:directCanonical.status,
      generated_status:routedOn.status,
      canonical_fingerprint:canonicalFingerprint,
      routed_off_fingerprint:routedOffFingerprint,
      off_fingerprint_equal:canonicalFingerprint===routedOffFingerprint,
      generated_result_count:Number(routedOn.results?.length||0),
      generated_query_ms:Number(elapsedMs.toFixed(3)),
      latency_pass:elapsedMs<=maxQueryMs,
    });
  }

  const capabilities={
    canonical:unifiedWriterCapabilities(canonical),
    generated:unifiedWriterCapabilities(generated),
  };

  const gates={
    parity_report_accepted:generatedRuntime.available===true,
    default_off_routes_canonical:
      offSelection.available===true
      &&offSelection.mode==='canonical'
      &&offSelection.databases===canonical,
    opt_in_routes_generated:
      onSelection.available===true
      &&onSelection.mode==='generated_optin'
      &&onSelection.databases===generatedRuntime.databases,
    canonical_has_no_backfill_overlay_markers:
      Object.values(markerCounts).every((row)=>row.canonical===0),
    generated_has_overlay_markers_all_domains:
      Object.values(markerCounts).every((row)=>row.generated>0),
    generated_counts_expand_all_domains:
      Object.values(tableCounts).every((row)=>row.generated>row.canonical),
    generated_only_probe_de:Boolean(generatedOnlyProbes.de),
    generated_only_probe_en:Boolean(generatedOnlyProbes.en),
    generated_only_probe_phrase:Boolean(generatedOnlyProbes.phrase),
    generated_only_probe_entity:Boolean(generatedOnlyProbes.entity),
    canonical_off_fingerprints_unchanged:
      queryCases.every((row)=>row.off_fingerprint_equal),
    generated_queries_within_latency_bound:
      queryCases.every((row)=>row.latency_pass),
    generated_de_words_available:
      capabilities.generated.languages?.de?.wordWriter===true,
    generated_en_words_available:
      capabilities.generated.languages?.en?.wordWriter===true,
    generated_de_phrases_available:
      capabilities.generated.languages?.de?.phraseMosaic===true,
    generated_de_entities_available:
      capabilities.generated.languages?.de?.entityRhymes===true,
    generated_en_entities_available:
      capabilities.generated.languages?.en?.entityRhymes===true,
  };

  const failed=Object.entries(gates).filter(([,pass])=>pass!==true).map(([name])=>name);
  const report={
    schema:'rhymelab-generated-optin-runtime-acceptance-v1',
    policy:'explicit-checkbox-generated-overlay-v1',
    status:failed.length?'failed':'accepted',
    max_query_ms:maxQueryMs,
    parity_report:reportPath,
    parity_report_fingerprint:generatedRuntime.reportFingerprint,
    routes:{
      default:'canonical',
      opt_in:'generated_optin',
    },
    marker_counts:markerCounts,
    table_counts:tableCounts,
    generated_only_probes:generatedOnlyProbes,
    capabilities,
    query_cases:queryCases,
    gates,
    failed_gates:failed,
  };
  report.semantic_fingerprint=sha(report);
  await mkdir(dirname(outPath),{recursive:true});
  await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');
  if(!failed.length){
    const marker={
      schema:GENERATED_OPTIN_MARKER_SCHEMA,
      status:'accepted',
      policy:GENERATED_OPTIN_RUNTIME_POLICY,
      parity_report_fingerprint:generatedRuntime.reportFingerprint,
      acceptance_report_fingerprint:report.semantic_fingerprint,
      acceptance_report:outPath,
    };
    await mkdir(dirname(markerOutPath),{recursive:true});
    await writeFile(markerOutPath,JSON.stringify(marker,null,2)+'\n','utf8');
    report.enablement_marker=markerOutPath;
  }
  console.log(JSON.stringify({...report,report:outPath},null,2));
  if(failed.length){
    throw new Error('Generated opt-in runtime acceptance failed: '+failed.join(', '));
  }
}finally{
  try{generatedRuntime?.close()}catch{}
  closeQuietly(writerDb);
  closeQuietly(englishDb);
  closeQuietly(phraseDb);
  closeQuietly(entityDb);
}
