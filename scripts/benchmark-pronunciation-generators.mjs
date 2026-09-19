#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { inspectEspeakQueryPronunciation } from './query-pronunciation-espeak-adapter.mjs';
import { getPhonologyProfile } from './phonology-profiles.mjs';
import { resolveUnknownClientPronunciation } from '../src/ui/query-pronunciation-client.mjs';
import {
  QUERY_PRONUNCIATION_GOLD_SAMPLE_SCHEMA,
  evaluateAgainstReferences,
} from './query-pronunciation-gold-core.mjs';
import {
  createAgreementStats,
  createGoldStats,
  addAgreement,
  addGold,
  compareAnalyses,
  finalizeAgreement,
  finalizeGold,
  pct,
  percentile,
} from './pronunciation-generator-benchmark-core.mjs';
import { BACKFILL_AUDIT_SAMPLE_SCHEMA } from './pronunciation-backfill-audit-core.mjs';

const args=process.argv.slice(2);
function argValue(flag,fallback=null){
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
}
function intArg(flag,fallback,min=1,max=10000){
  const value=Number.parseInt(String(argValue(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(value)?value:fallback));
}

const missingSamplePath=resolve(argValue('--missing-sample','data/local/pronunciation-backfill-v2-audit-sample-1000.json'));
const goldSamplePath=resolve(argValue('--gold-sample','data/local/query-pronunciation-gold-sample-v1.json'));
const deDbPath=resolve(argValue('--de-db','data/local/rhymelab-v5.sqlite'));
const enDbPath=resolve(argValue('--en-db','data/local/rhymelab-en-v1.sqlite'));
const outPath=resolve(argValue('--out','data/local/pronunciation-generator-benchmark-1000-v1.json'));
const tsvPath=resolve(argValue('--tsv','data/local/pronunciation-generator-benchmark-1000-v1.tsv'));
const command=argValue('--command',process.env.RHYMELAB_ESPEAK_COMMAND||null);
const progressEvery=intArg('--progress-every',25,1,1000);

for(const path of [missingSamplePath,goldSamplePath,deDbPath,enDbPath]){
  if(!existsSync(path))throw new Error('Required benchmark input missing: '+path);
}
await mkdir(dirname(outPath),{recursive:true});
await mkdir(dirname(tsvPath),{recursive:true});

const missingSample=JSON.parse(await readFile(missingSamplePath,'utf8'));
const goldSample=JSON.parse(await readFile(goldSamplePath,'utf8'));
if(missingSample.schema!==BACKFILL_AUDIT_SAMPLE_SCHEMA){
  throw new Error('Unexpected missing-sample schema: '+String(missingSample.schema||'missing'));
}
if(goldSample.schema!==QUERY_PRONUNCIATION_GOLD_SAMPLE_SCHEMA){
  throw new Error('Unexpected gold-sample schema: '+String(goldSample.schema||'missing'));
}

function normalize(surface,language){
  return getPhonologyProfile(language).normalizeSurface(surface);
}
function openDb(path){
  const db=new DatabaseSync(path,{readOnly:true});
  db.exec('PRAGMA query_only=ON;');
  return db;
}
const deDb=openDb(deDbPath);
const enDb=openDb(enDbPath);
const deLookup=deDb.prepare([
  'SELECT surface,normalized,ipa AS preferredIpa FROM hot',
  'WHERE normalized=? AND pronunciation_preferred=1 AND pronunciation_eligible=1 AND historical=0',
  'ORDER BY usage_rank IS NULL,usage_rank,pronunciation_rank,id LIMIT 1',
].join(' '));
const enLookup=enDb.prepare([
  'SELECT f.surface,f.normalized,p.phonemes AS preferredIpa',
  'FROM en_form f JOIN en_pronunciation p ON p.form_id=f.id',
  'WHERE f.normalized=? AND f.default_eligible=1 AND p.default_profile_eligible=1',
  'ORDER BY p.id LIMIT 1',
].join(' '));

function lookupReference(surface,language,blockedNormalized=null){
  const key=normalize(surface,language);
  if(blockedNormalized&&key===blockedNormalized)return null;
  return language==='de'?deLookup.get(key)||null:enLookup.get(key)||null;
}

function analyzeClient(detail,language){
  if(!detail?.ipa)return null;
  return getPhonologyProfile(language).analyzeIpa(detail.ipa);
}

function referenceAnalysis(reference,language){
  const profile=getPhonologyProfile(language);
  if(language==='de')return profile.analyzeIpa(reference.pronunciation);
  return profile.analyzePronunciation(reference.pronunciation,{
    notation:reference.notation,
    locale:'en-US',
    source:reference.source||'pronunciation_generator_gold',
  });
}

async function runPair(row,{blockExact=false}={}){
  const esStarted=performance.now();
  const es=inspectEspeakQueryPronunciation(row.surface,row.language,{command});
  const esElapsed=performance.now()-esStarted;
  if(es.status==='unavailable'){
    throw new Error('eSpeak-NG unavailable. Install it or pass --command / RHYMELAB_ESPEAK_COMMAND.');
  }

  const blocked=blockExact?normalize(row.surface,row.language):null;
  const clStarted=performance.now();
  let client=null;
  let clientAnalysis=null;
  let clientError=null;
  try{
    client=await resolveUnknownClientPronunciation(row.surface,row.language,{
      lookupReference:(surface,language)=>lookupReference(surface,language,blocked),
    });
    clientAnalysis=analyzeClient(client,row.language);
  }catch(error){
    clientError=String(error?.message||error);
  }
  const clElapsed=performance.now()-clStarted;

  const esAccepted=es.status==='accepted';
  const clientAccepted=Boolean(clientAnalysis);
  const comparison=esAccepted&&clientAccepted
    ?compareAnalyses(es.analysis,clientAnalysis,getPhonologyProfile(row.language).scoreAnalyses)
    :null;

  return {
    espeak:{
      accepted:esAccepted,
      status:es.status,
      ipa:es.ipa||null,
      raw_ipa:es.rawIpa||null,
      normalization_changed:esAccepted&&String(es.rawIpa||'')!==String(es.ipa||''),
      analysis:esAccepted?es.analysis:null,
      error:es.analyzerError||null,
      elapsed_ms:Number(esElapsed.toFixed(3)),
      version:es.engineVersion||null,
    },
    client:{
      accepted:clientAccepted,
      status:clientAccepted?'accepted':'rejected',
      ipa:client?.ipa||null,
      method:client?.method||null,
      source_backed:Boolean(client?.sourceBacked),
      generated_tokens:client?.generatedTokens||[],
      analysis:clientAnalysis,
      error:clientError,
      elapsed_ms:Number(clElapsed.toFixed(3)),
    },
    comparison,
  };
}

function compactAnalysis(analysis){
  if(!analysis)return null;
  return {
    syllable_count:Number(analysis.syllableCount||0),
    primary_stress:Number(analysis.primaryStressSyllable||0)||null,
    stress_pattern:analysis.stressPattern||null,
    exact_tail_key:analysis.exactTailKey||null,
    vowel_key:analysis.vowelKey||null,
    coda_key:analysis.codaKey||null,
    canonical_phonemes:analysis.canonicalPhonemes||null,
  };
}

function compactPair(pair){
  return {
    espeak:{...pair.espeak,analysis:compactAnalysis(pair.espeak.analysis)},
    client:{...pair.client,analysis:compactAnalysis(pair.client.analysis)},
    comparison:pair.comparison,
  };
}

function inc(object,key){object[key]=(object[key]||0)+1;}
function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function tsv(value){return String(value??'').replace(/[\t\r\n]/gu,' ');}

const missingStats=createAgreementStats();
const missingByScope={};
const missingOutcomes=[];
const esLat=[];
const clLat=[];
const clientMethods={};
const started=Date.now();

try{
  console.log('\n=== GENERATOR BENCHMARK · 1000 MISSING CASES ===');
  let done=0;
  for(const row of missingSample.cases||[]){
    const pair=await runPair(row);
    const scope=row.sampled_scope||'unknown';
    missingByScope[scope]??=createAgreementStats();
    addAgreement(missingStats,{
      espeakAccepted:pair.espeak.accepted,
      clientAccepted:pair.client.accepted,
      comparison:pair.comparison,
    });
    addAgreement(missingByScope[scope],{
      espeakAccepted:pair.espeak.accepted,
      clientAccepted:pair.client.accepted,
      comparison:pair.comparison,
    });
    esLat.push(pair.espeak.elapsed_ms);
    clLat.push(pair.client.elapsed_ms);
    inc(clientMethods,pair.client.method||'unresolved');
    missingOutcomes.push({...row,...compactPair(pair)});
    done+=1;
    if(done%progressEvery===0||done===missingSample.cases.length){
      const elapsed=Math.max(.001,(Date.now()-started)/1000);
      console.log(
        '[benchmark:missing] '+done+'/'+missingSample.cases.length
        +' · '+(done/elapsed).toFixed(1)+' cases/s'
        +' · espeak='+(missingStats.espeak_accepted)+' accepted'
        +' · client='+(missingStats.client_accepted)+' accepted'
      );
    }
  }

  const goldStats={espeak:createGoldStats(),client:createGoldStats()};
  const goldOutcomes=[];
  const goldPair={espeak_higher_rhyme_score:0,client_higher_rhyme_score:0,tied_rhyme_score:0,both_evaluated:0};
  console.log('\n=== GENERATOR CALIBRATION · SOURCE-BACKED CONTROLS ===');
  let goldDone=0;
  for(const row of goldSample.cases||[]){
    const pair=await runPair(row,{blockExact:true});
    const references=[];
    for(const reference of row.references||[]){
      try{references.push(referenceAnalysis(reference,row.language));}catch{}
    }
    let esBest=null;
    let clBest=null;
    if(pair.espeak.accepted&&references.length){
      esBest=evaluateAgainstReferences(pair.espeak.analysis,references,getPhonologyProfile(row.language).scoreAnalyses);
    }
    if(pair.client.accepted&&references.length){
      clBest=evaluateAgainstReferences(pair.client.analysis,references,getPhonologyProfile(row.language).scoreAnalyses);
    }
    addGold(goldStats.espeak,esBest);
    addGold(goldStats.client,clBest);
    if(esBest&&clBest){
      goldPair.both_evaluated+=1;
      const a=Number(esBest.score?.overall||0);
      const b=Number(clBest.score?.overall||0);
      if(a>b)goldPair.espeak_higher_rhyme_score+=1;
      else if(b>a)goldPair.client_higher_rhyme_score+=1;
      else goldPair.tied_rhyme_score+=1;
    }
    goldOutcomes.push({
      case_id:row.case_id,
      language:row.language,
      surface:row.surface,
      syllable_bucket:row.syllable_bucket,
      ...compactPair(pair),
      gold:{
        reference_count:references.length,
        espeak:esBest?{
          exact_phones:esBest.exactPhones,exact_tail:esBest.exactTail,syllable_count:esBest.syllable,
          stress_pattern:esBest.stress,primary_stress:esBest.primaryStress,
          rhyme_score:Number(Number(esBest.score?.overall||0).toFixed(6)),
        }:null,
        client:clBest?{
          exact_phones:clBest.exactPhones,exact_tail:clBest.exactTail,syllable_count:clBest.syllable,
          stress_pattern:clBest.stress,primary_stress:clBest.primaryStress,
          rhyme_score:Number(Number(clBest.score?.overall||0).toFixed(6)),
        }:null,
      },
    });
    goldDone+=1;
    if(goldDone%progressEvery===0||goldDone===goldSample.cases.length){
      console.log('[benchmark:gold] '+goldDone+'/'+goldSample.cases.length);
    }
  }

  const report={
    schema:'rhymelab-pronunciation-generator-benchmark-v1',
    purpose:'Compare eSpeak-NG and client-total-query-pronunciation-v2 on the same unresolved sample, plus independent source-backed calibration controls.',
    missing_sample:{
      schema:missingSample.schema,
      fingerprint:missingSample.semantic_fingerprint||null,
      cases:missingSample.cases.length,
      sampling_policy:missingSample.policy,
    },
    gold_sample:{
      schema:goldSample.schema,
      fingerprint:goldSample.semantic_fingerprint||null,
      cases:goldSample.cases.length,
      exact_lookup_withheld_from_client:true,
    },
    unresolved_comparison:{
      metrics:finalizeAgreement(missingStats),
      by_scope:Object.fromEntries(Object.entries(missingByScope).map(([scope,stats])=>[scope,finalizeAgreement(stats)])),
      client_methods:clientMethods,
      interpretation:'Agreement/coverage on unresolved rows is structural evidence, not lexical correctness because these rows have no direct gold.',
    },
    gold_calibration:{
      espeak:finalizeGold(goldStats.espeak),
      client:finalizeGold(goldStats.client),
      pairwise_rhyme_score:goldPair,
      interpretation:'Held-out source-backed controls estimate generator quality. The client exact-surface lookup is blocked; component lookup remains available.',
    },
    latency_ms:{
      espeak:{p50:percentile(esLat,.5),p95:percentile(esLat,.95),max:percentile(esLat,1)},
      client:{p50:percentile(clLat,.5),p95:percentile(clLat,.95),max:percentile(clLat,1)},
    },
    safeguards:{
      work_database_mutated:false,
      canonical_databases_mutated:false,
      generated_rows_promoted:false,
      benchmark_only:true,
    },
    missing_outcomes:missingOutcomes,
    gold_outcomes:goldOutcomes,
  };
  report.semantic_fingerprint=hash(report);
  await writeFile(outPath,JSON.stringify(report,null,2)+'\n','utf8');

  const header=[
    'case_id','sampled_scope','language','surface','shape',
    'espeak_accepted','espeak_ipa','espeak_syllables','espeak_tail','espeak_ms',
    'client_accepted','client_method','client_source_backed','client_ipa','client_syllables','client_tail','client_ms',
    'exact_phones','exact_tail','syllable_count','stress_pattern','primary_stress','mutual_rhyme_score',
  ];
  await writeFile(tsvPath,[
    header.join('\t'),
    ...missingOutcomes.map((row)=>header.map((key)=>{
      const map={
        espeak_accepted:row.espeak.accepted,espeak_ipa:row.espeak.ipa,
        espeak_syllables:row.espeak.analysis?.syllable_count,espeak_tail:row.espeak.analysis?.exact_tail_key,espeak_ms:row.espeak.elapsed_ms,
        client_accepted:row.client.accepted,client_method:row.client.method,client_source_backed:row.client.source_backed,
        client_ipa:row.client.ipa,client_syllables:row.client.analysis?.syllable_count,client_tail:row.client.analysis?.exact_tail_key,client_ms:row.client.elapsed_ms,
        exact_phones:row.comparison?.exact_phones,exact_tail:row.comparison?.exact_tail,syllable_count:row.comparison?.syllable_count,
        stress_pattern:row.comparison?.stress_pattern,primary_stress:row.comparison?.primary_stress,mutual_rhyme_score:row.comparison?.rhyme_score,
      };
      return tsv(key in map?map[key]:row[key]);
    }).join('\t')),
  ].join('\n')+'\n','utf8');

  console.log(JSON.stringify({
    schema:report.schema,
    unresolved:report.unresolved_comparison,
    gold_calibration:report.gold_calibration,
    latency_ms:report.latency_ms,
    report:outPath,
    tsv:tsvPath,
    semantic_fingerprint:report.semantic_fingerprint,
  },null,2));
}finally{
  enDb.close();
  deDb.close();
}
