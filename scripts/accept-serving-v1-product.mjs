#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {DatabaseSync} from 'node:sqlite';
import {DEFAULT_WRITER_DB_PATH,openWriterDb} from '../src/experimental-writer-db.mjs';
import {openPhraseBrowserDb} from '../src/phrase-browser-store.mjs';
import {
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  openEnglishWriterDb,
} from '../src/english-writer-runtime.mjs';
import {DEFAULT_ENTITY_DB_PATH,openEntityWriterDb} from '../src/entity-writer-runtime.mjs';
import {
  DEFAULT_GENERATED_OPTIN_MARKER_PATH,
  DEFAULT_GENERATED_OPTIN_REPORT_PATH,
  DEFAULT_GENERATED_WRITER_DB_PATH,
  DEFAULT_GENERATED_ENGLISH_DB_PATH,
  DEFAULT_GENERATED_PHRASE_DB_PATH,
  DEFAULT_GENERATED_ENTITY_DB_PATH,
  openGeneratedOptinRuntime,
} from '../src/generated-optin-runtime.mjs';
import {searchUnifiedWriter} from '../src/unified-writer-search.mjs';
import {
  DEFAULT_SERVING_V1_PRODUCT_DB_PATH,
  openServingV1ProductRuntime,
  servingV1ProductRuntimeState,
} from '../src/serving-v1-product-runtime.mjs';

export const SERVING_V1_PRODUCT_ACCEPTANCE_SCHEMA='rhymelab-serving-v1-product-acceptance-v1';
export const SERVING_V1_PRODUCT_ACCEPTANCE_POLICY='default-all-strict-parity-core-absorption-aware-v2';
export const SERVING_V1_PRODUCT_ACCEPTANCE_REVISION='core-all-generated-query-matrix-v3-product-v2-identity-v3';

const args=process.argv.slice(2);
const value=(flag,fallback=null)=>{
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
};
const has=(flag)=>args.includes(flag);
const intArg=(flag,fallback,min,max)=>{
  const n=Number.parseInt(String(value(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(n)?n:fallback));
};
const mode=has('--plan')?'plan':has('--status')?'status':'run';
const reset=has('--reset');
const samplePerLanguage=intArg('--sample-per-language',6,2,30);
const generatedSamples=intArg('--generated-samples',4,1,20);
const repeats=intArg('--repeats',1,1,5);
const targetP50=Number(value('--target-p50-ms','100'));
const targetP95=Number(value('--target-p95-ms','250'));
const targetMax=Number(value('--target-max-ms','1500'));

const servingPath=resolve(value('--serving',DEFAULT_SERVING_V1_PRODUCT_DB_PATH));
const writerPath=resolve(value('--writer',DEFAULT_WRITER_DB_PATH));
const englishPath=resolve(value('--english',DEFAULT_ENGLISH_WRITER_DB_PATH));
const phrasePath=resolve(value('--phrases','data/local/rhymelab-phrases-v1.sqlite'));
const entityPath=resolve(value('--entities',DEFAULT_ENTITY_DB_PATH));
const englishMarkerPath=resolve(value('--english-marker',DEFAULT_ENGLISH_PRODUCT_MARKER_PATH));
const generatedReportPath=resolve(value('--generated-report',DEFAULT_GENERATED_OPTIN_REPORT_PATH));
const generatedMarkerPath=resolve(value('--generated-marker',DEFAULT_GENERATED_OPTIN_MARKER_PATH));
const generatedWriterPath=resolve(value('--generated-writer',DEFAULT_GENERATED_WRITER_DB_PATH));
const generatedEnglishPath=resolve(value('--generated-english',DEFAULT_GENERATED_ENGLISH_DB_PATH));
const generatedPhrasePath=resolve(value('--generated-phrases',DEFAULT_GENERATED_PHRASE_DB_PATH));
const generatedEntityPath=resolve(value('--generated-entities',DEFAULT_GENERATED_ENTITY_DB_PATH));
const workPath=resolve(value('--work','data/local/rhymelab-serving-v1-product-acceptance-work.sqlite'));
const reportPath=resolve(value('--report','data/local/rhymelab-serving-v1-product-acceptance-report.json'));

let stopRequested=false;
for(const signal of ['SIGINT','SIGTERM']){
  process.on(signal,()=>{
    stopRequested=true;
    process.exitCode=130;
    console.error('\n[serving-accept] '+signal+' received; current case will finish, then pause.');
  });
}

const now=()=>new Date().toISOString();
const hash=(v)=>createHash('sha256').update(String(v)).digest('hex');
const round=(n,d=3)=>Number(Number(n||0).toFixed(d));
const close=(db)=>{try{db?.close();}catch{}};

function percentile(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1));
  return round(sorted[index]);
}
function timingSummary(values){
  const clean=values.map(Number).filter(Number.isFinite);
  if(!clean.length)return {samples:0,average_ms:null,p50_ms:null,p95_ms:null,max_ms:null,min_ms:null};
  return {
    samples:clean.length,
    average_ms:round(clean.reduce((a,b)=>a+b,0)/clean.length),
    p50_ms:percentile(clean,0.50),
    p95_ms:percentile(clean,0.95),
    max_ms:round(Math.max(...clean)),
    min_ms:round(Math.min(...clean)),
  };
}
function normalizeScalar(value){
  if(typeof value==='number')return Number.isFinite(value)?round(value,6):null;
  return value??null;
}
function pick(row,fields){
  const out={};
  for(const field of fields){
    if(row?.[field]!==undefined)out[field]=normalizeScalar(row[field]);
  }
  return out;
}
function normalizeCategories(rows){
  if(!Array.isArray(rows))return [];
  return rows.map((row)=>pick(row,['category','score','rank','percentile','tier','retained']));
}
function normalizeResult(row){
  const out=pick(row,[
    'resultKind','language','resultId','normalized','surface','word','ipa',
    'type','primaryType','score','syllableCount','syllableDistance',
    'usageRank','usageScore','lemma','partOfSpeech',
    'phraseId','windowId','qid','primaryCategory','selectedCategory',
    'popularityScore','popularityPercentile','popularityTier',
    'writerUtility','writerCommonness','commonnessScore','historical',
  ]);
  if(Array.isArray(row?.relationTypes))out.relationTypes=[...row.relationTypes];
  if(Array.isArray(row?.categories))out.categories=normalizeCategories(row.categories);
  if(row?.components)out.components=pick(row.components,['vowel','coda','stress','syllable','onset','consonance']);
  return out;
}
function normalizeQuery(query){
  if(!query)return null;
  return pick(query,[
    'kind','language','surface','normalized','preferredIpa','ipa','syllableCount',
    'stressPattern','primaryStressSyllable','phraseId','tokenCount','resolvable',
  ]);
}
function normalizeChannel(channel){
  return {
    available:Boolean(channel?.available),
    reason:channel?.reason??null,
    results:(channel?.results||[]).map(normalizeResult),
  };
}
function semanticResponse(result){
  return {
    status:result?.status??null,
    languageBasis:result?.languageBasis??null,
    resultLanguageBasis:result?.resultLanguageBasis??null,
    scope:result?.scope??null,
    query:normalizeQuery(result?.query),
    queries:{
      de:normalizeQuery(result?.queries?.de),
      en:normalizeQuery(result?.queries?.en),
    },
    channels:{
      words:normalizeChannel(result?.channels?.words),
      phrases:normalizeChannel(result?.channels?.phrases),
      entities:normalizeChannel(result?.channels?.entities),
    },
  };
}
function resultIsGenerated(row){
  return row?.generatedPronunciation===true;
}
function modePolicyCheck(result,runtimeMode){
  if(runtimeMode==='all') return {ok:true,violations:[]};
  const violations=[];
  for(const [channelName,channel] of Object.entries(result?.channels||{})){
    for(const row of channel?.results||[]){
      const generated=resultIsGenerated(row);
      if(runtimeMode==='core'&&generated){
        violations.push({
          channel:channelName,
          resultId:row.resultId||row.normalized||row.surface||null,
          reason:'generated_result_leaked_into_core',
        });
      }
      if(runtimeMode==='generated'&&!generated){
        violations.push({
          channel:channelName,
          resultId:row.resultId||row.normalized||row.surface||null,
          reason:'non_generated_result_leaked_into_generated_only',
        });
      }
      if(violations.length>=20)break;
    }
    if(violations.length>=20)break;
  }
  return {ok:violations.length===0,violations};
}

function firstDiff(a,b,path='
  if(Object.is(a,b))return out;
  if(typeof a!==typeof b||a===null||b===null){
    out.push({path,legacy:a??null,serving:b??null});return out;
  }
  if(Array.isArray(a)||Array.isArray(b)){
    if(!Array.isArray(a)||!Array.isArray(b)){out.push({path,legacy:a,serving:b});return out;}
    if(a.length!==b.length)out.push({path:path+'.length',legacy:a.length,serving:b.length});
    const limit=Math.min(a.length,b.length);
    for(let i=0;i<limit&&out.length<20;i++)firstDiff(a[i],b[i],path+'['+i+']',out);
    return out;
  }
  if(typeof a==='object'){
    const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
    for(const key of keys){
      if(out.length>=20)break;
      if(!Object.hasOwn(a,key)||!Object.hasOwn(b,key)){
        out.push({path:path+'.'+key,legacy:a[key]??null,serving:b[key]??null});
      }else firstDiff(a[key],b[key],path+'.'+key,out);
    }
    return out;
  }
  out.push({path,legacy:a,serving:b});
  return out;
}

function openLegacy(){
  const writerDb=openWriterDb(writerPath);
  let englishDb=null,phraseDb=null,entityDb=null,generated=null;
  try{
    englishDb=openEnglishWriterDb(englishPath,{requireProductAcceptance:true,markerPath:englishMarkerPath});
    phraseDb=openPhraseBrowserDb(phrasePath);
    entityDb=openEntityWriterDb(entityPath);
    generated=openGeneratedOptinRuntime({
      reportPath:generatedReportPath,
      acceptanceMarkerPath:generatedMarkerPath,
      requireRuntimeAcceptance:true,
      writerPath:generatedWriterPath,
      englishPath:generatedEnglishPath,
      phrasePath:generatedPhrasePath,
      entityPath:generatedEntityPath,
      englishMarkerPath,
    });
    if(!generated.available)throw new Error('Generated accepted runtime unavailable: '+generated.reason);
    return {
      core:{writerDb,englishDb,phraseDb,entityDb,generatedOverlay:false},
      all:generated.databases,
      generated,
      close(){
        close(writerDb);close(englishDb);close(phraseDb);close(entityDb);
        generated?.close();
      },
    };
  }catch(error){
    close(writerDb);close(englishDb);close(phraseDb);close(entityDb);generated?.close?.();
    throw error;
  }
}

function unique(values){
  return [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))];
}
function buildQueries(legacy,serving){
  const deFixed=['Arbeitsweise','Liebe','Freiheit','Musik','Zeit'];
  const enFixed=['time','love','rhyme','music','freedom'];

  const deCore=legacy.core.writerDb.prepare(`
    SELECT surface
    FROM hot
    WHERE pronunciation_preferred=1 AND pronunciation_eligible=1 AND historical=0
    GROUP BY normalized
    ORDER BY usage_rank IS NULL,usage_rank,normalized
    LIMIT ?
  `).all(samplePerLanguage).map(r=>r.surface);
  const enCore=legacy.core.englishDb.prepare(`
    SELECT f.surface
    FROM en_form f
    WHERE f.default_eligible=1
      AND EXISTS(
        SELECT 1 FROM en_pronunciation p
        WHERE p.form_id=f.id AND p.default_profile_eligible=1
      )
    ORDER BY f.wordfreq_rank IS NULL,f.wordfreq_rank,f.normalized
    LIMIT ?
  `).all(samplePerLanguage).map(r=>r.surface);

  const deGenerated=serving.allDb.prepare(`
    SELECT h.surface
    FROM hot h
    WHERE h.pronunciation_flags LIKE '%secondary_opt_in%'
    GROUP BY h.normalized
    ORDER BY h.normalized
    LIMIT ?
  `).all(generatedSamples).map(r=>r.surface);
  const enGenerated=serving.allDb.prepare(`
    SELECT f.surface
    FROM en_form f
    JOIN en_pronunciation p ON p.form_id=f.id
    WHERE p.source='espeak_ng_generated_secondary'
    GROUP BY f.normalized
    ORDER BY f.normalized
    LIMIT ?
  `).all(generatedSamples).map(r=>r.surface);

  const phraseSamples=legacy.core.phraseDb.prepare(`
    SELECT p.canonical
    FROM phrase p
    WHERE p.modern_eligible=1
      AND EXISTS(
        SELECT 1 FROM phrase_pronunciation pp
        WHERE pp.phrase_id=p.phrase_id AND pp.eligible=1 AND pp.variant_rank=1
      )
    ORDER BY p.phrase_id
    LIMIT 4
  `).all().map(r=>r.canonical);

  const specs=[];
  const add=(input,languageBasis,resultLanguageBasis='')=>{
    const clean=String(input||'').trim();
    if(!clean)return;
    const basis=languageBasis;
    const result=resultLanguageBasis||basis;
    const id=hash(JSON.stringify([clean,basis,result])).slice(0,16);
    if(specs.some(row=>row.id===id))return;
    specs.push({id,input:clean,languageBasis:basis,resultLanguageBasis:result});
  };
  for(const q of unique([...deFixed,...deCore,...deGenerated,...phraseSamples]))add(q,'de','de');
  for(const q of unique([...enFixed,...enCore,...enGenerated]))add(q,'en','en');
  for(const q of ['Liebe','time'])add(q,'both','both');
  return specs.sort((a,b)=>a.id.localeCompare(b.id));
}

function caseMatrix(queries){
  const modes=['core','all','generated'];
  const cases=[];
  for(const query of queries){
    for(const runtimeMode of modes){
      cases.push({
        caseId:hash(JSON.stringify([query,runtimeMode])).slice(0,24),
        ...query,
        runtimeMode,
        options:{
          languageBasis:query.languageBasis,
          resultLanguageBasis:query.resultLanguageBasis,
          scope:'all',
          type:'all',
          generatedOnly:runtimeMode==='generated',
        },
      });
    }
  }
  return cases.sort((a,b)=>a.caseId.localeCompare(b.caseId));
}

function dbMetaFingerprint(db){
  const rows=db.prepare('SELECT key,value FROM meta ORDER BY key').all();
  return hash(JSON.stringify(rows));
}

function openWork(path,fingerprint,cases){
  const db=new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS case_result(
      case_id TEXT PRIMARY KEY,
      case_json TEXT NOT NULL,
      reference_equal INTEGER NOT NULL,
      policy_ok INTEGER NOT NULL,
      gate_ok INTEGER NOT NULL,
      semantic_diff_json TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      legacy_hash TEXT NOT NULL,
      serving_hash TEXT NOT NULL,
      legacy_ms_json TEXT NOT NULL,
      serving_ms_json TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );
  `);
  const existing=db.prepare("SELECT value FROM meta WHERE key='acceptance_fingerprint'").get()?.value||null;
  if(existing&&existing!==fingerprint){
    db.close();
    throw new Error('Acceptance inputs/case matrix changed. Use --reset to discard only acceptance work.');
  }
  const put=db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);
  put.run('schema',SERVING_V1_PRODUCT_ACCEPTANCE_SCHEMA);
  put.run('policy',SERVING_V1_PRODUCT_ACCEPTANCE_POLICY);
  put.run('revision',SERVING_V1_PRODUCT_ACCEPTANCE_REVISION);
  put.run('acceptance_fingerprint',fingerprint);
  put.run('case_count',String(cases.length));
  put.run('updated_at',now());
  return db;
}

function runtimeForCase(caseSpec,legacy,serving){
  if(caseSpec.runtimeMode==='core'){
    return {legacy:legacy.core,serving:serving.coreDatabases};
  }
  return {legacy:legacy.all,serving:serving.allDatabases};
}

function runSearch(databases,caseSpec){
  return searchUnifiedWriter(databases,caseSpec.input,caseSpec.options);
}
function measured(databases,caseSpec){
  const times=[];
  let result=null;
  for(let i=0;i<repeats;i++){
    const start=performance.now();
    result=runSearch(databases,caseSpec);
    times.push(performance.now()-start);
  }
  return {result,times};
}
function groupTiming(rows,keyFn,field){
  const groups=new Map();
  for(const row of rows){
    const key=keyFn(row);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(...JSON.parse(row[field]||'[]').map(Number));
  }
  return Object.fromEntries([...groups.entries()].map(([key,values])=>[key,timingSummary(values)]));
}

async function main(){
  if(reset){
    for(const p of [workPath,workPath+'-wal',workPath+'-shm'])await rm(p,{force:true});
    console.log('[serving-accept] reset acceptance checkpoints only.');
  }
  if(!existsSync(servingPath))throw new Error('Serving product DB missing: '+servingPath);
  const legacy=openLegacy();
  const serving=openServingV1ProductRuntime(servingPath);
  let work=null;
  try{
    const state=servingV1ProductRuntimeState(serving.allDb);
    if(!state.available)throw new Error(state.reason);

    const queries=buildQueries(legacy,serving);
    const cases=caseMatrix(queries);
    const fingerprint=hash(JSON.stringify({
      revision:SERVING_V1_PRODUCT_ACCEPTANCE_REVISION,
      serving_product_fingerprint:state.productSemanticFingerprint,
      canonical:{
        writer:dbMetaFingerprint(legacy.core.writerDb),
        english:dbMetaFingerprint(legacy.core.englishDb),
        phrases:dbMetaFingerprint(legacy.core.phraseDb),
        entities:dbMetaFingerprint(legacy.core.entityDb),
      },
      generated_report_fingerprint:legacy.generated.reportFingerprint,
      cases,
      repeats,
      targets:{targetP50,targetP95,targetMax},
    }));

    if(mode==='plan'){
      console.log(JSON.stringify({
        schema:'rhymelab-serving-v1-product-acceptance-plan',
        revision:SERVING_V1_PRODUCT_ACCEPTANCE_REVISION,
        acceptance_fingerprint:fingerprint,
        queries:queries.length,
        cases:cases.length,
        repeats,
        modes:['core','all','generated'],
        future_default_mode:'all',
        latency_targets_ms:{p50:targetP50,p95:targetP95,max:targetMax},
        work:workPath,report:reportPath,
        safety:{read_only:true,resumable:true,current_runtime_rewired:false},
      },null,2));
      return;
    }

    work=openWork(workPath,fingerprint,cases);
    if(mode==='status'){
      const completed=Number(work.prepare('SELECT COUNT(*) c FROM case_result').get()?.c||0);
      const failed=Number(work.prepare('SELECT COUNT(*) c FROM case_result WHERE gate_ok=0').get()?.c||0);
      console.log(JSON.stringify({
        schema:'rhymelab-serving-v1-product-acceptance-status',
        cases:cases.length,completed,remaining:cases.length-completed,gate_failures:failed,
        work:workPath,
      },null,2));
      return;
    }

    const already=new Set(work.prepare('SELECT case_id FROM case_result').all().map(r=>r.case_id));
    const insert=work.prepare(`
      INSERT OR REPLACE INTO case_result(
        case_id,case_json,reference_equal,policy_ok,gate_ok,
        semantic_diff_json,policy_json,legacy_hash,serving_hash,
        legacy_ms_json,serving_ms_json,completed_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const started=performance.now();
    let completed=already.size;
    console.log('[serving-accept] '+completed+'/'+cases.length+' cases resumed · repeats='+repeats);

    for(const caseSpec of cases){
      if(already.has(caseSpec.caseId))continue;
      const runtimes=runtimeForCase(caseSpec,legacy,serving);
      const legacyRun=measured(runtimes.legacy,caseSpec);
      const servingRun=measured(runtimes.serving,caseSpec);
      const legacySemantic=semanticResponse(legacyRun.result);
      const servingSemantic=semanticResponse(servingRun.result);
      const legacyJson=JSON.stringify(legacySemantic);
      const servingJson=JSON.stringify(servingSemantic);
      const referenceEqual=legacyJson===servingJson;
      const policy=modePolicyCheck(servingRun.result,caseSpec.runtimeMode);
      const strictReferenceRequired=caseSpec.runtimeMode==='all';
      const gateOk=policy.ok&&(!strictReferenceRequired||referenceEqual);
      const diffs=referenceEqual?[]:firstDiff(legacySemantic,servingSemantic);
      work.exec('BEGIN IMMEDIATE;');
      try{
        insert.run(
          caseSpec.caseId,JSON.stringify(caseSpec),
          referenceEqual?1:0,policy.ok?1:0,gateOk?1:0,
          JSON.stringify(diffs),JSON.stringify(policy),
          hash(legacyJson),hash(servingJson),
          JSON.stringify(legacyRun.times),JSON.stringify(servingRun.times),now()
        );
        work.prepare(`
          INSERT INTO meta(key,value) VALUES('updated_at',?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value
        `).run(now());
        work.exec('COMMIT;');
      }catch(error){try{work.exec('ROLLBACK;')}catch{};throw error;}

      completed++;
      const elapsed=performance.now()-started;
      const rate=(completed-already.size)/(elapsed/1000);
      const eta=rate>0?(cases.length-completed)/rate*1000:NaN;
      console.log(
        '[serving-accept] '+completed+'/'+cases.length+' '
        +(100*completed/cases.length).toFixed(1)+'% · '
        +caseSpec.runtimeMode+' · '+caseSpec.languageBasis+' · '+caseSpec.input+
        ' · legacy '+round(legacyRun.times.at(-1))+'ms · serving '+round(servingRun.times.at(-1))+'ms · '
        +(gateOk
          ?(referenceEqual?'equal':'policy-ok / legacy-layer-diff')
          :'FAIL')+
        ' · ETA '+(Number.isFinite(eta)?round(eta/1000)+'s':'—')
      );
      if(!referenceEqual&&diffs.length){
        console.log('[serving-accept]   first reference diff '+JSON.stringify(diffs[0]));
      }
      if(!policy.ok&&policy.violations.length){
        console.log('[serving-accept]   first policy violation '+JSON.stringify(policy.violations[0]));
      }
      if(stopRequested)break;
    }

    if(stopRequested){
      console.error('[serving-accept] paused safely; rerun the same command to resume.');
      return;
    }

    const rows=work.prepare('SELECT * FROM case_result ORDER BY case_id').all();
    if(rows.length!==cases.length)throw new Error('Acceptance case coverage incomplete.');
    const failed=rows.filter(row=>!Number(row.gate_ok));
    const strictAllFailures=rows.filter(row=>{
      const spec=JSON.parse(row.case_json);
      return spec.runtimeMode==='all'&&!Number(row.reference_equal);
    });
    const policyFailures=rows.filter(row=>!Number(row.policy_ok));
    const informationalLayerDiffs=rows.filter(row=>{
      const spec=JSON.parse(row.case_json);
      return spec.runtimeMode!=='all'&&!Number(row.reference_equal)&&Number(row.policy_ok);
    });
    const legacyTimes=rows.flatMap(row=>JSON.parse(row.legacy_ms_json||'[]').map(Number));
    const servingTimes=rows.flatMap(row=>JSON.parse(row.serving_ms_json||'[]').map(Number));
    const legacyTiming=timingSummary(legacyTimes);
    const servingTiming=timingSummary(servingTimes);
    const semanticOk=strictAllFailures.length===0&&policyFailures.length===0;
    const latencyGates={
      p50_target:Number(servingTiming.p50_ms)<=targetP50,
      p95_target:Number(servingTiming.p95_ms)<=targetP95,
      max_target:Number(servingTiming.max_ms)<=targetMax,
    };
    const latencyOk=Object.values(latencyGates).every(Boolean);
    const status=semanticOk?(latencyOk?'accepted':'needs_optimization'):'failed';
    const report={
      schema:SERVING_V1_PRODUCT_ACCEPTANCE_SCHEMA,
      status,
      policy:SERVING_V1_PRODUCT_ACCEPTANCE_POLICY,
      revision:SERVING_V1_PRODUCT_ACCEPTANCE_REVISION,
      completed_at:now(),
      acceptance_fingerprint:fingerprint,
      serving_product_semantic_fingerprint:state.productSemanticFingerprint,
      generated_reference_report_fingerprint:legacy.generated.reportFingerprint,
      future_default_mode:'all',
      mode_contract:{
        all:'Core plus genuine Generated-only pronunciations; future product default',
        core:'Core only; Generated explicitly disabled',
        generated:'genuine Generated-only candidates; Core-equivalent Generated source rows are intentionally absorbed',
      },
      cases:{
        total:rows.length,
        gate_passed:rows.length-failed.length,
        gate_failed:failed.length,
        strict_all_failures:strictAllFailures.length,
        policy_failures:policyFailures.length,
        intentional_legacy_layer_diffs:informationalLayerDiffs.length,
        by_mode:Object.fromEntries(['core','all','generated'].map(runtimeMode=>[
          runtimeMode,
          rows.filter(row=>JSON.parse(row.case_json).runtimeMode===runtimeMode).length,
        ])),
      },
      semantic_gate:{
        ok:semanticOk,
        contract:'all mode strict legacy parity; core/generated modes enforce Serving layer policy and treat Core-absorption layer reassignment as intentional',
        strict_all_failures:strictAllFailures.slice(0,50).map(row=>({
          case:JSON.parse(row.case_json),
          diffs:JSON.parse(row.semantic_diff_json||'[]'),
        })),
        policy_failures:policyFailures.slice(0,50).map(row=>({
          case:JSON.parse(row.case_json),
          policy:JSON.parse(row.policy_json||'{}'),
        })),
        intentional_legacy_layer_diffs:informationalLayerDiffs.slice(0,20).map(row=>({
          case:JSON.parse(row.case_json),
          first_diff:JSON.parse(row.semantic_diff_json||'[]')[0]||null,
        })),
      },
      latency:{
        targets_ms:{p50:targetP50,p95:targetP95,max:targetMax},
        legacy:legacyTiming,
        serving:servingTiming,
        improvement_average_percent:legacyTiming.average_ms
          ?round(100*(legacyTiming.average_ms-servingTiming.average_ms)/legacyTiming.average_ms,2):null,
        serving_by_mode:groupTiming(rows,row=>JSON.parse(row.case_json).runtimeMode,'serving_ms_json'),
        serving_by_language_basis:groupTiming(rows,row=>JSON.parse(row.case_json).languageBasis,'serving_ms_json'),
        legacy_by_mode:groupTiming(rows,row=>JSON.parse(row.case_json).runtimeMode,'legacy_ms_json'),
        gates:latencyGates,
        ok:latencyOk,
      },
      switch_gate:{
        semantic_equivalence:semanticOk,
        latency_targets:latencyOk,
        ready_for_product_runtime_switch:semanticOk&&latencyOk,
      },
      safety:{
        current_runtime_rewired:false,
        source_databases_mutated:false,
        serving_database_mutated:false,
        acceptance_resumable:true,
      },
    };
    await mkdir(dirname(reportPath),{recursive:true});
    await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
    console.log(JSON.stringify({
      schema:report.schema,status:report.status,
      cases:report.cases,
      legacy:report.latency.legacy,
      serving:report.latency.serving,
      latency_gates:report.latency.gates,
      ready_for_product_runtime_switch:report.switch_gate.ready_for_product_runtime_switch,
      report:reportPath,
    },null,2));
    if(!semanticOk)process.exitCode=1;
    else if(!latencyOk)process.exitCode=2;
  }finally{
    try{work?.close();}catch{}
    serving.close();
    legacy.close();
  }
}

await main();
