import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { findRhymes, getStats, getWord, openRhymeDb, searchWords } from './local-engine.mjs';
import { DEFAULT_WRITER_DB_PATH, openWriterDb } from './experimental-writer-db.mjs';
import {
  DEFAULT_MARKOV_EN_MODEL_DB_PATH,
  DEFAULT_MARKOV_MODEL_DB_PATH,
  markovModelHealth,
  openMarkovModel,
 } from './markov-model-runtime.mjs';
import {generateLyricCandidatesV2} from './lyric-decoder-v2.mjs';
import { WRITER_RUNTIME_ID, selectRhymeRuntimeDatabases } from './runtime-db-routing.mjs';
import { findWriterRhymes } from './writer-search.mjs';
import { loadBenchmarkState, saveBenchmarkReview } from './benchmark-store.mjs';
import { getPhraseBrowserStats, getPhraseDetail, openPhraseBrowserDb, searchPhrases } from './phrase-browser-store.mjs';
import { searchUnifiedWriter, unifiedWriterCapabilities } from './unified-writer-search.mjs';
import { materializeRhymePadV14 } from './rhymepad-v14.mjs';
import { createRollingQueryTiming } from './runtime-query-timing.mjs';
import { DEFAULT_ENTITY_DB_PATH, openEntityWriterDb } from './entity-writer-runtime.mjs';
import {
  DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  DEFAULT_ENGLISH_WRITER_DB_PATH,
  getEnglishWord,
  openEnglishWriterDb,
  readEnglishProductAcceptanceMarker,
} from './english-writer-runtime.mjs';
import {
  DEFAULT_GENERATED_ENGLISH_DB_PATH,
  DEFAULT_GENERATED_ENTITY_DB_PATH,
  DEFAULT_GENERATED_OPTIN_MARKER_PATH,
  DEFAULT_GENERATED_OPTIN_REPORT_PATH,
  DEFAULT_GENERATED_PHRASE_DB_PATH,
  DEFAULT_GENERATED_WRITER_DB_PATH,
  generatedOptinDatasetStats,
  openGeneratedOptinRuntime,
  selectGeneratedOptinDatabases,
} from './generated-optin-runtime.mjs';
import {
  DEFAULT_SERVING_V1_PRODUCT_DB_PATH,
  SERVING_V1_PRODUCT_RUNTIME,
  openServingV1ProductRuntime,
  servingV1ProductRuntimeState,
} from './serving-v1-product-runtime.mjs';
import {
  isServingV1,
  resolveServerRuntimeMode,
} from './server-runtime-mode.mjs';
import {createServingV1ParallelWriterRuntime} from './unified-writer-parallel.mjs';
import {
  generatedDataExplicitlyRequired,
  generatedDataRequested,
  generatedOnlyRequested,
} from './generated-runtime-request-policy.mjs';

const host = process.env.RHYMELAB_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.RHYMELAB_PORT || '3030', 10);
const serverRuntimeMode=resolveServerRuntimeMode({
  argv:process.argv.slice(2),
  env:process.env,
});
const servingV1Active=isServingV1(serverRuntimeMode);
const servingV1DbPath=resolve(
  process.env.RHYMELAB_SERVING_V1_DB||DEFAULT_SERVING_V1_PRODUCT_DB_PATH,
);
const legacyDbPath = resolve(process.env.RHYMELAB_LEGACY_DB || process.env.RHYMELAB_DB || 'data/local/rhymelab.sqlite');
const writerDbPath = resolve(process.env.RHYMELAB_WRITER_DB || DEFAULT_WRITER_DB_PATH);
const phraseDbPath = resolve(process.env.RHYMELAB_PHRASE_DB || 'data/local/rhymelab-phrases-v1.sqlite');
const markovModelPath = resolve(process.env.RHYMELAB_MARKOV_DB || DEFAULT_MARKOV_MODEL_DB_PATH);
const markovEnglishModelPath = resolve(
  process.env.RHYMELAB_MARKOV_EN_DB || DEFAULT_MARKOV_EN_MODEL_DB_PATH,
);
const entityDbPath = resolve(process.env.RHYMELAB_ENTITY_DB || DEFAULT_ENTITY_DB_PATH);
const englishDbPath = resolve(process.env.RHYMELAB_ENGLISH_DB || DEFAULT_ENGLISH_WRITER_DB_PATH);
const englishMarkerPath = resolve(
  process.env.RHYMELAB_ENGLISH_ACCEPTANCE_MARKER || DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
);
const generatedOptinReportPath=resolve(
  process.env.RHYMELAB_GENERATED_OPTIN_REPORT || DEFAULT_GENERATED_OPTIN_REPORT_PATH,
);
const generatedOptinMarkerPath=resolve(
  process.env.RHYMELAB_GENERATED_OPTIN_MARKER || DEFAULT_GENERATED_OPTIN_MARKER_PATH,
);
const generatedWriterDbPath=resolve(
  process.env.RHYMELAB_GENERATED_WRITER_DB || DEFAULT_GENERATED_WRITER_DB_PATH,
);
const generatedEnglishDbPath=resolve(
  process.env.RHYMELAB_GENERATED_ENGLISH_DB || DEFAULT_GENERATED_ENGLISH_DB_PATH,
);
const generatedPhraseDbPath=resolve(
  process.env.RHYMELAB_GENERATED_PHRASE_DB || DEFAULT_GENERATED_PHRASE_DB_PATH,
);
const generatedEntityDbPath=resolve(
  process.env.RHYMELAB_GENERATED_ENTITY_DB || DEFAULT_GENERATED_ENTITY_DB_PATH,
);
const uiDir = resolve('src/ui');
const padUiDir = resolve('src/pad');
const studioUiDir = resolve('src/studio');
const benchmarkUiDir = resolve('src/benchmark-ui');
const queryPronunciationTestDir = resolve('src/query-pronunciation-test');
const markovTestDir = resolve('src/markov-test');
const writerQueryTiming=createRollingQueryTiming(100);

let writerDb=null;
let writerDbError=null;
if(!servingV1Active){
  try {
    writerDb = openWriterDb(writerDbPath);
  } catch (error) {
    writerDbError=error instanceof Error?error.message:String(error);
    console.error(`Cannot open promoted Writer v5 database at ${writerDbPath}`);
    console.error('Build it with: npm run writer:v5:rebuild');
    console.error(writerDbError);
    process.exit(1);
  }
}

let legacyDb = null;
let legacyDbError = null;
if(!servingV1Active){
  try {
    legacyDb = openRhymeDb(legacyDbPath);
  } catch (error) {
    legacyDbError = error instanceof Error ? error.message : String(error);
    console.warn(`Archived legacy/control DB unavailable at ${legacyDbPath}`);
    console.warn('Legacy archive runtime remains usable without ranking=legacy comparisons.');
  }
}

let phraseDb = null;
let phraseDbError = null;
if(!servingV1Active){
  try {
    phraseDb = openPhraseBrowserDb(phraseDbPath);
  } catch (error) {
    phraseDbError = error instanceof Error ? error.message : String(error);
    console.warn(`Phrase/Mosaic DB unavailable at ${phraseDbPath}`);
    console.warn('Normal Writer runtime remains available; only the Phrase/Mosaic channel is unavailable.');
  }
}

let englishDb = null;
let englishDbError = null;
const englishMarker = readEnglishProductAcceptanceMarker(englishMarkerPath);
if(!servingV1Active){
  if (englishMarker.accepted) {
    try {
      englishDb = openEnglishWriterDb(englishDbPath, {
        requireProductAcceptance: true,
        markerPath: englishMarkerPath,
      });
    } catch (error) {
      englishDbError = error instanceof Error ? error.message : String(error);
      console.warn(`English Writer DB unavailable at ${englishDbPath}`);
      console.warn(englishDbError);
    }
  } else {
    englishDbError = englishMarker.reason;
  }
}

let entityDb = null;
let entityDbError = null;
if(!servingV1Active){
  try {
    entityDb = openEntityWriterDb(entityDbPath);
  } catch (error) {
    entityDbError = error instanceof Error ? error.message : String(error);
    console.warn(`Entity DB unavailable at ${entityDbPath}`);
    console.warn('Normal Writer runtime remains available; only the Entity rhyme channel is unavailable.');
  }
}

let servingV1Runtime=null;
let servingV1State=null;
if(servingV1Active){
  try{
    servingV1Runtime=openServingV1ProductRuntime(servingV1DbPath);
    servingV1State=servingV1ProductRuntimeState(servingV1Runtime.coreDb);
  }catch(error){
    console.error(`Cannot open Serving-v1 Product database at ${servingV1DbPath}`);
    console.error('Build it with: npm run serving:v1:product:build');
    console.error(error instanceof Error?error.message:String(error));
    process.exit(1);
  }
}

let parallelWriterRuntime=null;
if(servingV1Active){
  try{
    parallelWriterRuntime=createServingV1ParallelWriterRuntime(servingV1DbPath);
    await parallelWriterRuntime.ready();
  }catch(error){
    try{await parallelWriterRuntime?.close();}catch{}
    console.error('Cannot initialize persistent Serving-v1 Writer workers.');
    console.error(error instanceof Error?error.message:String(error));
    process.exit(1);
  }
}

const generatedOptinRuntime=servingV1Active
  ?{
      available:false,
      reason:'serving_v1_preview_uses_same_database_all_mode',
      databases:null,
      close(){},
    }
  :openGeneratedOptinRuntime({
      reportPath:generatedOptinReportPath,
      acceptanceMarkerPath:generatedOptinMarkerPath,
      requireRuntimeAcceptance:true,
      writerPath:generatedWriterDbPath,
      englishPath:generatedEnglishDbPath,
      phrasePath:generatedPhraseDbPath,
      entityPath:generatedEntityDbPath,
      englishMarkerPath,
    });
if(!servingV1Active&&!generatedOptinRuntime.available){
  console.warn('Generated opt-in runtime unavailable: '+generatedOptinRuntime.reason);
  if(generatedOptinRuntime.error)console.warn(generatedOptinRuntime.error);
}

const markovRuntime=openMarkovModel(markovModelPath);
if(!markovRuntime.available){
  console.warn(`German Markov transition model unavailable at ${markovModelPath}: ${markovRuntime.reason}`);
  console.warn('Build it with: npm run markov:model:build');
}
const markovEnglishRuntime=openMarkovModel(markovEnglishModelPath);
if(!markovEnglishRuntime.available){
  console.warn(`English Markov transition model unavailable at ${markovEnglishModelPath}: ${markovEnglishRuntime.reason}`);
  console.warn('Build it with: npm run markov:model:build:en');
}
const markovRuntimes={de:markovRuntime,en:markovEnglishRuntime};

const acceptedRuntimeDatabases={
  writerDb,
  englishDb,
  phraseDb,
  entityDb,
  generatedOverlay:false,
};
const canonicalRuntimeDatabases=servingV1Active
  ?servingV1Runtime.coreDatabases
  :acceptedRuntimeDatabases;
const activeGeneratedRuntime=servingV1Active
  ?{
      available:true,
      reason:null,
      databases:servingV1Runtime.allDatabases,
      close(){},
    }
  :generatedOptinRuntime;

let datasetStatsCache=null;
function runtimeDatasetStats(){
  if(!datasetStatsCache){
    datasetStatsCache=generatedOptinDatasetStats(canonicalRuntimeDatabases,activeGeneratedRuntime);
  }
  return datasetStatsCache;
}

function generatedOptinRequested(url){
  return generatedDataRequested(url);
}

function requestRuntimeSelection(url){
  const generated=generatedDataRequested(url);
  if(generated&&activeGeneratedRuntime.available){
    return selectGeneratedOptinDatabases(
      canonicalRuntimeDatabases,
      activeGeneratedRuntime,
      true,
    );
  }
  if(generated&&generatedDataExplicitlyRequired(url)){
    return selectGeneratedOptinDatabases(
      canonicalRuntimeDatabases,
      activeGeneratedRuntime,
      true,
    );
  }
  return selectGeneratedOptinDatabases(
    canonicalRuntimeDatabases,
    activeGeneratedRuntime,
    false,
  );
}

function requestRuntimeDatabases(url){
  const selection=requestRuntimeSelection(url);
  return selection.available?selection.databases:null;
}

function databaseRevisionPart(db,path){
  if(!db) return null;
  let meta=[];
  try{
    meta=db.prepare('SELECT key,value FROM meta ORDER BY key').all()
      .map((row)=>[String(row.key),String(row.value)]);
  }catch{}
  let file=null;
  try{
    const stat=statSync(path,{bigint:true});
    file={
      size:String(stat.size),
      mtimeNs:String(stat.mtimeNs),
    };
  }catch{}
  return {file,meta};
}

function databaseBundleRevision({writerDb,englishDb,phraseDb,entityDb},paths){
  return createHash('sha256')
    .update(JSON.stringify({
      writer:databaseRevisionPart(writerDb,paths.writer),
      english:databaseRevisionPart(englishDb,paths.english),
      phrase:databaseRevisionPart(phraseDb,paths.phrase),
      entity:databaseRevisionPart(entityDb,paths.entity),
    }))
    .digest('hex');
}

const canonicalRuntimePaths=servingV1Active
  ?{
      writer:servingV1DbPath,
      english:servingV1DbPath,
      phrase:servingV1DbPath,
      entity:servingV1DbPath,
    }
  :{
      writer:writerDbPath,
      english:englishDbPath,
      phrase:phraseDbPath,
      entity:entityDbPath,
    };
const generatedRuntimePaths=servingV1Active
  ?canonicalRuntimePaths
  :{
      writer:generatedWriterDbPath,
      english:generatedEnglishDbPath,
      phrase:generatedPhraseDbPath,
      entity:generatedEntityDbPath,
    };
const queryPronunciationRevision=databaseBundleRevision(
  canonicalRuntimeDatabases,
  canonicalRuntimePaths,
);
const generatedQueryPronunciationRevision=activeGeneratedRuntime.available
  ?databaseBundleRevision(activeGeneratedRuntime.databases,generatedRuntimePaths)
  :null;

function generatedRuntimeHealth(){
  if(servingV1Active){
    return {
      available:true,
      reason:null,
      report:null,
      acceptance_marker:null,
      report_fingerprint:servingV1State?.productSemanticFingerprint||null,
      active_espeak_ab:null,
      deferred_total:null,
      phrase_surface_deferred:null,
      query_pronunciation_revision:generatedQueryPronunciationRevision,
      default_enabled:activeGeneratedRuntime.available,
      mode:'serving-v1-all',
      single_database:true,
    };
  }
  return {
    available:generatedOptinRuntime.available,
    reason:generatedOptinRuntime.available ? null : generatedOptinRuntime.reason,
    report:generatedOptinRuntime.available ? generatedOptinRuntime.reportPath : generatedOptinReportPath,
    acceptance_marker:generatedOptinMarkerPath,
    report_fingerprint:generatedOptinRuntime.available ? generatedOptinRuntime.reportFingerprint : null,
    active_espeak_ab:generatedOptinRuntime.available ? generatedOptinRuntime.activeEspeakAB : 0,
    deferred_total:generatedOptinRuntime.available ? generatedOptinRuntime.deferredTotal : 0,
    phrase_surface_deferred:generatedOptinRuntime.available ? generatedOptinRuntime.phraseSurfaceDeferred : 0,
    query_pronunciation_revision:generatedQueryPronunciationRevision,
    default_enabled:activeGeneratedRuntime.available,
    mode:'generated-optin-bundle',
    single_database:false,
  };
}

const writerHtml = readFileSync(resolve(uiDir, 'index.html'));
const padHtml = Buffer.from(materializeRhymePadV14().html);
const studioHtml = readFileSync(resolve(studioUiDir, 'index.html'));
const benchmarkHtml = readFileSync(resolve(benchmarkUiDir, 'index.html'));
const queryPronunciationTestHtml = readFileSync(resolve(queryPronunciationTestDir, 'index.html'));
const markovTestHtml = readFileSync(resolve(markovTestDir, 'index.html'));
const assets = {
  '/': { type: 'text/html; charset=utf-8', body: writerHtml },
  '/pad': { type: 'text/html; charset=utf-8', body: padHtml },
  '/pad/': { type: 'text/html; charset=utf-8', body: padHtml },
  '/studio': { type: 'text/html; charset=utf-8', body: studioHtml },
  '/studio/': { type: 'text/html; charset=utf-8', body: studioHtml },
  '/studio/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'styles.css')) },
  '/studio/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'app.js')) },
  '/studio/studio-core.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'studio-core.mjs')) },
  '/studio/studio-controls.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'studio-controls.mjs')) },
  '/studio/search-adapter.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'search-adapter.mjs')) },
  '/studio/search-filters.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'search-filters.mjs')) },
  '/studio/search-state.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'search-state.mjs')) },
  '/studio/document-adapter.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'document-adapter.mjs')) },
  '/studio/document-model.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'document-model.mjs')) },
  '/studio/capability-adapter.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'capability-adapter.mjs')) },
  '/studio/detail-adapter.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'detail-adapter.mjs')) },
  '/studio/query-pronunciation-client.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'query-pronunciation-client.mjs')) },
  '/studio/query-pronunciation-cache.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'query-pronunciation-cache.mjs')) },
  '/pad/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(padUiDir, 'styles.css')) },
  '/pad/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(padUiDir, 'app.js')) },
  '/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(uiDir, 'styles.css')) },
  '/assets/mobile.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(uiDir, 'mobile.css')) },
  '/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'app.js')) },
  '/assets/search-state.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'search-state.mjs')) },
  '/assets/query-pronunciation-client.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'query-pronunciation-client.mjs')) },
  '/assets/query-pronunciation-cache.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'query-pronunciation-cache.mjs')) },
  '/benchmark': { type: 'text/html; charset=utf-8', body: benchmarkHtml },
  '/benchmark/': { type: 'text/html; charset=utf-8', body: benchmarkHtml },
  '/benchmark/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(benchmarkUiDir, 'styles.css')) },
  '/benchmark/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(benchmarkUiDir, 'app.js')) },
  '/query-pronunciation-test': { type: 'text/html; charset=utf-8', body: queryPronunciationTestHtml },
  '/query-pronunciation-test/': { type: 'text/html; charset=utf-8', body: queryPronunciationTestHtml },
  '/query-pronunciation-test/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(queryPronunciationTestDir, 'app.js')) },
  '/query-pronunciation-test/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(queryPronunciationTestDir, 'styles.css')) },
  '/markov-test': { type: 'text/html; charset=utf-8', body: markovTestHtml },
  '/markov-test/': { type: 'text/html; charset=utf-8', body: markovTestHtml },
  '/markov-test/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(markovTestDir, 'app.js')) },
  '/markov-test/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(markovTestDir, 'styles.css')) },
  '/markov-test/markov-core.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(markovTestDir, 'markov-core.mjs')) },
  '/markov-test/markov-controls.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(markovTestDir, 'markov-controls.mjs')) },
};

function json(res, data, status = 200, allowCors = true) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  };
  if (allowCors) headers['access-control-allow-origin'] = '*';
  res.writeHead(status, headers);
  res.end(JSON.stringify(data, null, 2));
}

function asset(res, entry) {
  res.writeHead(200, {
    'content-type': entry.type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(entry.body);
}

function clientQueryPronunciation(url, language) {
  const ipa = String(url.searchParams.get(`query_ipa_${language}`) || '').trim();
  if (!ipa) return null;
  let components = null;
  const rawComponents = url.searchParams.get(`query_components_${language}`);
  if (rawComponents) {
    try {
      const parsed = JSON.parse(rawComponents);
      if (Array.isArray(parsed)) components = parsed.slice(0, 64).map(String);
    } catch {}
  }
  return {
    ipa: ipa.slice(0, 4096),
    method: String(url.searchParams.get(`query_method_${language}`) || 'client_unknown').slice(0, 80),
    sourceBacked: url.searchParams.get(`query_source_backed_${language}`) === '1',
    components,
  };
}

async function readJsonBody(req, maxBytes = 32 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw new Error('Request body is required');
  return JSON.parse(raw);
}

function isAllowedLocalWriteOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const localHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
    return localHost && (!parsed.port || parsed.port === String(port));
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === 'GET' && assets[url.pathname]) return asset(res, assets[url.pathname]);

    if (url.pathname === '/api/benchmark/review') {
      if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405, false);
      if (!isAllowedLocalWriteOrigin(req)) return json(res, { error: 'Benchmark writes are localhost-only' }, 403, false);
      const body = await readJsonBody(req);
      const saved = await saveBenchmarkReview(body);
      const state = await loadBenchmarkState();
      return json(res, { saved, summary: state.summary, next_task: state.next_task }, 200, false);
    }

    if (url.pathname === '/api/markov/generate') {
      if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405, false);
      if (!isAllowedLocalWriteOrigin(req)) return json(res, { error: 'Markov generation is localhost-only' }, 403, false);
      const body=await readJsonBody(req,512*1024);
      const rows=Array.isArray(body?.rows)?body.rows.slice(0,600):[];
      if(rows.length<2)return json(res,{error:'At least two Writer candidates are required.'},400,false);
      const language=body?.language==='en'?'en':'de';
      const selectedMarkovRuntime=markovRuntimes[language];
      if(!selectedMarkovRuntime?.available){
        return json(res, {
          error:`${language.toUpperCase()} Markov transition model unavailable.`,
          reason:selectedMarkovRuntime?.reason||'missing',
          detail:selectedMarkovRuntime?.error||null,
          build_command:language==='en'?'npm run markov:model:build:en':'npm run markov:model:build',
        }, 503, false);
      }
      try{
        const candidates=generateLyricCandidatesV2(selectedMarkovRuntime,{
          rows,
          language,
          seedText:String(body?.seedText||'').slice(0,1000),
          target:String(body?.target||'').slice(0,240),
          seed:Number(body?.seed)||0,
          targetTokens:Number(body?.targetTokens)||6,
          rhymePressure:Number(body?.rhymePressure)||0,
          naturalness:Number(body?.naturalness)||0,
          weirdness:Number(body?.weirdness)||0,
          mode:String(body?.mode||'balanced').slice(0,40),
          allowEntities:body?.allowEntities!==false,
          entityCategories:Array.isArray(body?.entityCategories)
            ?body.entityCategories
              .map((value)=>String(value||'').slice(0,80))
              .filter(Boolean)
              .slice(0,16)
            :[],
          allowPhrases:body?.allowPhrases!==false,
          count:Number(body?.count)||8,
          attempts:Number(body?.attempts)||48,
        });
        return json(res,{candidates,model:markovModelHealth(selectedMarkovRuntime)},200,false);
      }catch(error){
        return json(res,{error:error instanceof Error?error.message:String(error)},400,false);
      }
    }

    if (req.method !== 'GET') return json(res, { error: 'Method not allowed' }, 405);

    if (url.pathname === '/api/benchmark/state') {
      try {
        return json(res, await loadBenchmarkState(), 200, false);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const missing = message.includes('ENOENT');
        return json(res, {
          error: missing ? 'Benchmark queue not prepared. Run: npm run benchmark:prepare' : message,
        }, missing ? 404 : 500, false);
      }
    }

    if (url.pathname === '/api/health') {
      return json(res, {
        status: 'ok',
        mode: 'local',
        markov_generator: markovModelHealth(markovRuntime),
        markov_generators: {
          de:markovModelHealth(markovRuntime),
          en:markovModelHealth(markovEnglishRuntime),
        },
        package_runtime: servingV1Active ? 'serving-v1-default' : 'legacy-archive-bundle',
        writer_database: canonicalRuntimeDatabases.writerDb ? canonicalRuntimePaths.writer : null,
        writer_runtime: servingV1Active ? SERVING_V1_PRODUCT_RUNTIME : WRITER_RUNTIME_ID,
        serving_v1: servingV1Active ? {
          enabled:true,
          default_runtime:true,
          database:servingV1DbPath,
          state:servingV1State,
        } : {
          enabled:false,
          default_runtime:false,
        },
        legacy_database: legacyDb ? legacyDbPath : null,
        legacy_available: Boolean(legacyDb),
        legacy_error: legacyDb ? null : legacyDbError,
        phrase_database: canonicalRuntimeDatabases.phraseDb ? canonicalRuntimePaths.phrase : null,
        phrase_available: Boolean(canonicalRuntimeDatabases.phraseDb),
        phrase_error: canonicalRuntimeDatabases.phraseDb ? null : phraseDbError,
        entity_database: canonicalRuntimeDatabases.entityDb ? canonicalRuntimePaths.entity : null,
        entity_available: Boolean(canonicalRuntimeDatabases.entityDb),
        entity_error: canonicalRuntimeDatabases.entityDb ? null : entityDbError,
        english_database: canonicalRuntimeDatabases.englishDb ? canonicalRuntimePaths.english : null,
        english_available: Boolean(canonicalRuntimeDatabases.englishDb),
        english_error: canonicalRuntimeDatabases.englishDb ? null : englishDbError,
        english_acceptance_marker: servingV1Active
          ? null
          : (englishMarker.accepted ? englishMarkerPath : null),
        query_pronunciation_revision: queryPronunciationRevision,
        query_pronunciation_cache: {
          schema: 'rhymelab-query-pronunciation-cache-v1',
          revision: queryPronunciationRevision,
          revalidation: 'health_revision_once_per_app_session',
        },
        generated_optin: generatedRuntimeHealth(),
        parallel_search: servingV1Active ? {
          enabled:true,
          ...parallelWriterRuntime.health(),
        } : {
          enabled:false,
        },
        unified_writer: unifiedWriterCapabilities(canonicalRuntimeDatabases),
      });
    }

    if (url.pathname === '/api/dataset-stats') {
      return json(res,runtimeDatasetStats());
    }

    if (url.pathname === '/api/writer') {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return json(res, { error: 'q is required' }, 400);
      const runtimeDatabases=requestRuntimeDatabases(url);
      if(!runtimeDatabases){
        return json(res,{
          error:'Generated opt-in runtime is unavailable.',
          reason:activeGeneratedRuntime.reason,
        },503);
      }
      const searchOptions={
        language: url.searchParams.get('language') || 'de',
        resultLanguage: url.searchParams.get('result_language') || url.searchParams.get('results_language') || null,
        scope: url.searchParams.get('scope') || 'all',
        type: url.searchParams.get('type') || 'all',
        includeVariants: url.searchParams.get('variants') === 'all',
        includeHistorical: url.searchParams.get('historical') === 'all',
        wordLimit: url.searchParams.get('word_limit') || url.searchParams.get('limit'),
        wordPoolLimit: url.searchParams.get('word_pool') || url.searchParams.get('pool'),
        phraseLimit: url.searchParams.get('phrase_limit') || url.searchParams.get('limit'),
        phrasePoolLimit: url.searchParams.get('phrase_pool'),
        phrasePerChannelLimit: url.searchParams.get('phrase_per_channel'),
        entityLimit: url.searchParams.get('entity_limit') || url.searchParams.get('limit'),
        entityPoolLimit: url.searchParams.get('entity_pool'),
        entityCategory: url.searchParams.get('entity_category') || 'all',
        generatedOnly:generatedOnlyRequested(url),
        queryPronunciations: {
          de: clientQueryPronunciation(url, 'de'),
          en: clientQueryPronunciation(url, 'en'),
        },
      };
      const searchStarted=performance.now();
      const result = servingV1Active
        ?await parallelWriterRuntime.search(q,searchOptions,{
            generatedOverlay:generatedOptinRequested(url),
          })
        :searchUnifiedWriter(runtimeDatabases,q,searchOptions);
      const runtimeTiming=writerQueryTiming.record(performance.now()-searchStarted);
      const status = result.status === 'language_unavailable'
        ? 503
        : result.status === 'query_not_found'
          ? 404
          : 200;
      return json(res, {...result,runtimeTiming}, status);
    }

    if (url.pathname === '/api/phrases/stats') {
      const runtimeDatabases=requestRuntimeDatabases(url);
      if(!runtimeDatabases)return json(res,{error:'Generated opt-in runtime is unavailable.',reason:activeGeneratedRuntime.reason},503);
      if (!runtimeDatabases.phraseDb) return json(res, { error: 'Phrase runtime unavailable in the active database.' }, 503);
      return json(res, getPhraseBrowserStats(runtimeDatabases.phraseDb));
    }

    if (url.pathname === '/api/phrases/search') {
      const runtimeDatabases=requestRuntimeDatabases(url);
      if(!runtimeDatabases)return json(res,{error:'Generated opt-in runtime is unavailable.',reason:activeGeneratedRuntime.reason},503);
      if (!runtimeDatabases.phraseDb) return json(res, { error: 'Phrase runtime unavailable in the active database.' }, 503);
      return json(res, {
        results: searchPhrases(runtimeDatabases.phraseDb, {
          q: url.searchParams.get('q') || '',
          type: url.searchParams.get('type') || 'all',
          historical: url.searchParams.get('historical') === 'all',
          evidence: url.searchParams.get('evidence') || 'all',
          limit: url.searchParams.get('limit'),
        }),
      });
    }

    if (url.pathname === '/api/phrases/detail') {
      const runtimeDatabases=requestRuntimeDatabases(url);
      if(!runtimeDatabases)return json(res,{error:'Generated opt-in runtime is unavailable.',reason:activeGeneratedRuntime.reason},503);
      if (!runtimeDatabases.phraseDb) return json(res, { error: 'Phrase runtime unavailable in the active database.' }, 503);
      const result = getPhraseDetail(runtimeDatabases.phraseDb, url.searchParams.get('id') || '');
      return result ? json(res, result) : json(res, { error: 'Phrase not found' }, 404);
    }

    if (url.pathname === '/api/stats') {
      const runtimeDatabases=requestRuntimeDatabases(url);
      if(!runtimeDatabases)return json(res,{error:'Generated opt-in runtime is unavailable.',reason:activeGeneratedRuntime.reason},503);
      return json(res, getStats(runtimeDatabases.writerDb));
    }

    if (url.pathname === '/api/search') {
      const runtimeDatabases=requestRuntimeDatabases(url);
      if(!runtimeDatabases){
        return json(res,{
          error:'Generated opt-in runtime is unavailable.',
          reason:activeGeneratedRuntime.reason,
        },503);
      }
      return json(res, {
        results: searchWords(
          runtimeDatabases.writerDb,
          url.searchParams.get('q') || '',
          url.searchParams.get('limit'),
          { includeHistorical: url.searchParams.get('historical') === 'all' },
        ),
      });
    }

    if (url.pathname.startsWith('/api/word/')) {
      const runtimeDatabases=requestRuntimeDatabases(url);
      if(!runtimeDatabases)return json(res,{error:'Generated opt-in runtime is unavailable.',reason:activeGeneratedRuntime.reason},503);
      const word = decodeURIComponent(url.pathname.slice('/api/word/'.length));
      const language = String(url.searchParams.get('language') || 'de')
        .trim().toLocaleLowerCase('en-US');
      if (language === 'en') {
        if (!runtimeDatabases.englishDb) {
          return json(res, {
            error: 'English Writer runtime is not accepted/enabled locally.',
            reason: englishDbError,
          }, 503);
        }
        const result = getEnglishWord(runtimeDatabases.englishDb, word);
        return result ? json(res, result) : json(res, { error: 'Word not found' }, 404);
      }
      const result = getWord(runtimeDatabases.writerDb, word);
      return result ? json(res, result) : json(res, { error: 'Word not found' }, 404);
    }

    if (url.pathname.startsWith('/api/rhymes/')) {
      const word = decodeURIComponent(url.pathname.slice('/api/rhymes/'.length));
      const options = {
        limit: url.searchParams.get('limit'),
        poolLimit: url.searchParams.get('pool'),
        includeVariants: url.searchParams.get('variants') === 'all',
        includeHistorical: url.searchParams.get('historical') === 'all',
        type: url.searchParams.get('type') || 'all',
        ensureTypeCoverage: url.searchParams.get('coverage') === 'balanced',
        coverageFloor: url.searchParams.get('coverage_floor'),
      };
      const runtimeDatabases=requestRuntimeDatabases(url);
      if(!runtimeDatabases)return json(res,{error:'Generated opt-in runtime is unavailable.',reason:activeGeneratedRuntime.reason},503);
      const runtime = selectRhymeRuntimeDatabases({ writerDb:runtimeDatabases.writerDb, legacyDb }, url.searchParams);
      const result = runtime.mode === 'legacy'
        ? findRhymes(runtime.database, word, options)
        : findWriterRhymes(runtime.database, word, options);
      return result ? json(res, result) : json(res, { error: 'Word not found' }, 404);
    }

    return json(res, { error: 'Not found' }, 404);
  } catch (error) {
    return json(res, { error: error instanceof Error ? error.message : String(error) }, 500, req.method === 'GET' && !String(req.url || '').startsWith('/api/benchmark/'));
  }
});

server.listen(port, host, () => {
  console.log(`RhymeLab local: http://${host}:${port}`);
  console.log(`RhymePad workspace: http://${host}:${port}/pad`);
  console.log(`Studio 02 preview: http://${host}:${port}/studio`);
  console.log(`RhymeLab benchmark review: http://${host}:${port}/benchmark`);
  console.log(`Markov DE database: ${markovRuntime.available ? markovModelPath : 'unavailable — npm run markov:model:build'}`);
  console.log(`Markov EN database: ${markovEnglishRuntime.available ? markovEnglishModelPath : 'unavailable — npm run markov:model:build:en'}`);
  if(servingV1Active){
    console.log(`Product runtime: Serving-v1 canonical/default`);
    console.log(`Serving-v1 SQLite: ${servingV1DbPath}`);
    console.log(`Serving-v1 runtime: ${SERVING_V1_PRODUCT_RUNTIME}`);
    console.log(`Writer execution: ${parallelWriterRuntime.health().execution} · ${parallelWriterRuntime.health().workers} workers`);
    console.log('Generated data: Serving-v1 all-mode default ON · generated=0 opts out');
  }else{
    console.log(`Writer v5 SQLite: ${writerDbPath}`);
    console.log(`Writer runtime: ${WRITER_RUNTIME_ID}`);
    console.log(`Phrase/Mosaic SQLite: ${phraseDb ? phraseDbPath : 'unavailable'}`);
    console.log(`Entity SQLite: ${entityDb ? entityDbPath : 'unavailable'}`);
    console.log(`English Writer SQLite: ${englishDb ? englishDbPath : 'gated/unavailable'}`);
    console.log(`English product acceptance: ${englishMarker.accepted ? 'accepted' : englishDbError}`);
    console.log(`Generated opt-in runtime: ${generatedOptinRuntime.available ? 'available (default OFF)' : 'unavailable: '+generatedOptinRuntime.reason}`);
  }
  if(!servingV1Active){
    console.log(`Archive runtime: legacy Writer bundle`);
    console.log(`Archived legacy/control SQLite: ${legacyDb ? legacyDbPath : 'unavailable'}`);
  }
  console.log(`Unified Writer: http://${host}:${port}`);
});

function shutdown() {
  server.close(async() => {
    try { await parallelWriterRuntime?.close(); } catch {}
    try { writerDb?.close(); } catch {}
    try { legacyDb?.close(); } catch {}
    try { phraseDb?.close(); } catch {}
    try { entityDb?.close(); } catch {}
    try { englishDb?.close(); } catch {}
    try { generatedOptinRuntime.close(); } catch {}
    try { markovRuntime.close(); } catch {}
    try { markovEnglishRuntime.close(); } catch {}
    try { servingV1Runtime?.close(); } catch {}
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
