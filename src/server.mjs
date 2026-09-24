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
import {loadReactStudioPreviewAssets,reactStudioPreviewMode} from './react-studio-preview.mjs';
import { WRITER_RUNTIME_ID, selectRhymeRuntimeDatabases } from './runtime-db-routing.mjs';
import { findWriterRhymes } from './writer-search.mjs';
import { loadBenchmarkState, saveBenchmarkReview } from './benchmark-store.mjs';
import { getPhraseBrowserStats, getPhraseDetail, openPhraseBrowserDb, searchPhrases } from './phrase-browser-store.mjs';
import { searchUnifiedWriter, unifiedWriterCapabilities } from './unified-writer-search.mjs';
import { materializeRhymePadV14 } from './rhymepad-v14.mjs';
import { createRollingQueryTiming } from './runtime-query-timing.mjs';
import {
  INTERNAL_DISTRIBUTION_DB_IDS,
  availableInternalRuntimeEntry,
  internalDistributionDbPaths,
  internalDistributionRuntimeSummary,
  internalDistributionSwitcherEnabled,
  internalRuntimeProcessMetrics,
  preferredAvailableDistributionDbId,
  requestedInternalDistributionDbId,
} from './internal-distribution-switcher.mjs';
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
  SERVING_V1_PRODUCT_RUNTIME,
  openServingV1ProductRuntime,
  servingV1ProductRuntimeState,
} from './serving-v1-product-runtime.mjs';
import {
  isServingV1,
  resolveServerRuntimeMode,
} from './server-runtime-mode.mjs';
import {createServingV1ParallelWriterRuntime} from './unified-writer-parallel.mjs';
import {analyzeSongEndRhymes,compactSongAnalysisAnchorResult,createSongAnalysisAnchorCache} from './song-rhyme-analysis.mjs';
import {
  compactStudioWriterPayload,
  studioWriterPayloadStats,
} from './studio-writer-payload.mjs';
import {
  generatedDataExplicitlyRequired,
  generatedDataRequested,
  generatedOnlyRequested,
} from './generated-runtime-request-policy.mjs';
import {createTokenBucketRateLimiter} from './request-rate-limit.mjs';
import {
  assertSafeServerBinding,
  createRequestId,
  isAllowedLocalMutationRequest,
  isAllowedRequestHost,
  isCrossSiteBrowserRequest,
  publicHttpError,
  readJsonRequestBody,
  requestUrlFromTrustedBase,
  securityHeaders,
} from './http-security.mjs';

const host = process.env.RHYMELAB_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.RHYMELAB_PORT || '3030', 10);
const serverBinding=assertSafeServerBinding({host,env:process.env});
const allowedRemoteHosts=serverBinding.allowedHosts||[];
if(serverBinding.remote){
  console.warn('SECURITY: non-loopback binding explicitly enabled via RHYMELAB_ALLOW_REMOTE=1.');
}
const serverRuntimeMode=resolveServerRuntimeMode({
  argv:process.argv.slice(2),
  env:process.env,
});
const servingV1Active=isServingV1(serverRuntimeMode);
const songAnalysisAnchorCache=createSongAnalysisAnchorCache({maxEntries:384});
const searchDefaultRoute=process.argv.includes('--search-default')
  ||String(process.env.RHYMELAB_SEARCH_DEFAULT||'').trim()==='1';
const studioDefaultRoute=process.argv.includes('--studio-default')
  ||String(process.env.RHYMELAB_STUDIO_DEFAULT||'').trim()==='1'
  ||!searchDefaultRoute;
const reactStudioPreview=reactStudioPreviewMode({
  argv:process.argv.slice(2),
  env:process.env,
});
const internalDbPaths=internalDistributionDbPaths({env:process.env});
let servingV1DbPath=internalDbPaths.standard;
let servingV1DbId='standard';
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
const reactStudioDistDir = resolve('apps/studio-react/dist');
const writerQueryTiming=createRollingQueryTiming(100);
const writerRateLimiter=createTokenBucketRateLimiter({
  capacity:Number(process.env.RHYMELAB_WRITER_RATE_BURST||16),
  refillPerSecond:Number(process.env.RHYMELAB_WRITER_RATE_RPS||8),
  maxEntries:Number(process.env.RHYMELAB_WRITER_RATE_KEYS||4096),
});

const internalDbSwitcherEnabled=servingV1Active&&internalDistributionSwitcherEnabled({
  argv:process.argv.slice(2),
  env:process.env,
});
const internalDbQueryTimings=new Map(
  INTERNAL_DISTRIBUTION_DB_IDS.map((id)=>[id,createRollingQueryTiming(100)]),
);
const internalDbEntries=new Map();

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

function openDistributionRuntime(id,path){
  const runtime=openServingV1ProductRuntime(path);
  const state=servingV1ProductRuntimeState(runtime.coreDb);
  const edition=String(state?.distribution?.edition||'').toLowerCase();
  if(!state.available||edition!==id){
    try{runtime.close?.()}catch{}
    throw new Error(
      !state.available
        ?String(state.reason||'distribution_runtime_unavailable')
        :`distribution_edition_mismatch: expected ${id}, got ${edition||'unknown'}`
    );
  }
  return {runtime,state};
}

let servingV1Runtime=null;
let servingV1State=null;
if(servingV1Active){
  for(const id of INTERNAL_DISTRIBUTION_DB_IDS){
    const path=internalDbPaths[id];
    try{
      const {runtime,state}=openDistributionRuntime(id,path);
      internalDbEntries.set(id,{
        id,
        path,
        runtime,
        state,
        error:null,
        owned:true,
      });
    }catch(error){
      internalDbEntries.set(id,{
        id,
        path,
        runtime:null,
        state:null,
        error:error instanceof Error?error.message:String(error),
        owned:false,
      });
    }
  }

  servingV1DbId=preferredAvailableDistributionDbId(internalDbEntries)||'';
  if(!servingV1DbId){
    console.error('Cannot open any shipping distribution database (LITE / STANDARD / FULL).');
    for(const id of INTERNAL_DISTRIBUTION_DB_IDS){
      const entry=internalDbEntries.get(id);
      console.error(`  ${id.toUpperCase()}: ${entry?.error||'unavailable'} · ${internalDbPaths[id]}`);
    }
    console.error('Build or install at least one edition with: npm run distribution:build');
    process.exit(1);
  }
  const canonicalEntry=internalDbEntries.get(servingV1DbId);
  servingV1DbPath=canonicalEntry.path;
  servingV1Runtime=canonicalEntry.runtime;
  servingV1State=canonicalEntry.state;
  canonicalEntry.owned=false;
}

function requestedInternalRuntimeEntry(url){
  const id=requestedInternalDistributionDbId(url,{enabled:internalDbSwitcherEnabled});
  if(!id)return null;
  const entry=availableInternalRuntimeEntry(internalDbEntries,id);
  if(!entry){
    const detail=internalDbEntries.get(id);
    const error=new Error(
      'Internal distribution database '+id+' is unavailable'
      +(detail?.error?': '+detail.error:'')
    );
    error.statusCode=503;
    error.runtimeDb=id;
    throw error;
  }
  return entry;
}

function internalDbTimingSnapshot(id){
  return internalDbQueryTimings.get(id)?.snapshot?.()||null;
}

function internalDistributionPayload(){
  return {
    schema:'rhymelab-distribution-runtime-v1',
    enabled:internalDbSwitcherEnabled,
    internalOnly:false,
    shipping:true,
    defaultDatabase:servingV1DbId,
    selectionMode:'per-request-query-parameter',
    parameter:'runtime_db',
    databases:INTERNAL_DISTRIBUTION_DB_IDS.map((id)=>{
      const entry=internalDbEntries.get(id)||{
        id,path:internalDbPaths[id],runtime:null,state:null,error:'not_initialized',
      };
      return internalDistributionRuntimeSummary({
        id,
        path:entry.path,
        runtime:entry.runtime,
        state:entry.state,
        error:entry.error,
        timing:internalDbTimingSnapshot(id),
      });
    }),
    server:internalRuntimeProcessMetrics({performanceObj:performance,processObj:process}),
  };
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
      available:servingV1Runtime.capabilities?.generated===true,
      reason:servingV1Runtime.capabilities?.generated===true
        ?null
        :'distribution_generated_unavailable',
      databases:servingV1Runtime.capabilities?.generated===true
        ?servingV1Runtime.allDatabases
        :null,
      close(){},
    }
  :generatedOptinRuntime;

let datasetStatsCache=null;
const internalDatasetStatsCache=new Map();
function runtimeDatasetStats(url=null){
  const internalEntry=url?requestedInternalRuntimeEntry(url):null;
  if(internalEntry){
    if(!internalDatasetStatsCache.has(internalEntry.id)){
      const generatedRuntime=internalEntry.runtime.capabilities?.generated===true
        ?{available:true,databases:internalEntry.runtime.allDatabases}
        :null;
      internalDatasetStatsCache.set(
        internalEntry.id,
        generatedOptinDatasetStats(
          internalEntry.runtime.coreDatabases,
          generatedRuntime,
        ),
      );
    }
    return internalDatasetStatsCache.get(internalEntry.id);
  }
  if(!datasetStatsCache){
    datasetStatsCache=generatedOptinDatasetStats(canonicalRuntimeDatabases,activeGeneratedRuntime);
  }
  return datasetStatsCache;
}

function generatedOptinRequested(url){
  return generatedDataRequested(url);
}

function requestRuntimeSelection(url){
  const internalEntry=requestedInternalRuntimeEntry(url);
  if(internalEntry){
    const generated=generatedDataRequested(url);
    const capabilities=internalEntry.runtime.capabilities||{};
    if(generated&&capabilities.generated===true){
      return {
        available:true,
        reason:null,
        databases:internalEntry.runtime.allDatabases,
        internalDbId:internalEntry.id,
        internal:internalEntry.id!==servingV1DbId,
      };
    }
    if(generated&&generatedDataExplicitlyRequired(url)){
      return {
        available:false,
        reason:'selected_distribution_generated_unavailable',
        databases:null,
        internalDbId:internalEntry.id,
        internal:internalEntry.id!==servingV1DbId,
      };
    }
    return {
      available:true,
      reason:null,
      databases:internalEntry.runtime.coreDatabases,
      internalDbId:internalEntry.id,
      internal:internalEntry.id!==servingV1DbId,
    };
  }

  const generated=generatedDataRequested(url);
  const selection=generated&&activeGeneratedRuntime.available
    ?selectGeneratedOptinDatabases(
      canonicalRuntimeDatabases,
      activeGeneratedRuntime,
      true,
    )
    :generated&&generatedDataExplicitlyRequired(url)
      ?selectGeneratedOptinDatabases(
        canonicalRuntimeDatabases,
        activeGeneratedRuntime,
        true,
      )
      :selectGeneratedOptinDatabases(
        canonicalRuntimeDatabases,
        activeGeneratedRuntime,
        false,
      );
  return {
    ...selection,
    internalDbId:servingV1Active?servingV1DbId:null,
    internal:false,
  };
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
      available:activeGeneratedRuntime.available,
      reason:activeGeneratedRuntime.available?null:'distribution_generated_unavailable',
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
const studioHtml=readFileSync(resolve(studioUiDir,'index.html'));
const benchmarkHtml = readFileSync(resolve(benchmarkUiDir, 'index.html'));
const queryPronunciationTestHtml = readFileSync(resolve(queryPronunciationTestDir, 'index.html'));
const markovTestHtml = readFileSync(resolve(markovTestDir, 'index.html'));
const reactStudioAssets=loadReactStudioPreviewAssets(reactStudioDistDir);
const reactStudioHtml=reactStudioAssets['/studio-react/']?.body;
const assets = {
  '/': {
    type: 'text/html; charset=utf-8',
    body: searchDefaultRoute
      ?writerHtml
      :(reactStudioPreview.defaultRoute?reactStudioHtml:studioHtml),
  },
  '/search': { type: 'text/html; charset=utf-8', body: writerHtml },
  '/search/': { type: 'text/html; charset=utf-8', body: writerHtml },
  '/legacy': { type: 'text/html; charset=utf-8', body: writerHtml },
  '/legacy/': { type: 'text/html; charset=utf-8', body: writerHtml },
  '/pad': { type: 'text/html; charset=utf-8', body: padHtml },
  '/pad-legacy': { type: 'text/html; charset=utf-8', body: padHtml },
  '/pad-legacy/': { type: 'text/html; charset=utf-8', body: padHtml },
  '/pad/': { type: 'text/html; charset=utf-8', body: padHtml },
  '/studio': { type: 'text/html; charset=utf-8', body: reactStudioHtml },
  '/studio/': { type: 'text/html; charset=utf-8', body: reactStudioHtml },
  '/studio-legacy': { type: 'text/html; charset=utf-8', body: studioHtml },
  '/studio-legacy/': { type: 'text/html; charset=utf-8', body: studioHtml },
  '/studio/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'styles.css')) },
  '/studio/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'app.js')) },
  '/studio/custom-select.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'custom-select.mjs')) },
  '/studio/studio-core.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'studio-core.mjs')) },
  '/studio/studio-controls.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'studio-controls.mjs')) },
  '/studio/search-adapter.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'search-adapter.mjs')) },
  '/studio/search-filters.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'search-filters.mjs')) },
  '/studio/search-state.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'search-state.mjs')) },
  '/ui/search-state.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'search-state.mjs')) },
  '/ui/custom-select.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'custom-select.mjs')) },
  '/ui/query-pronunciation-client.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'query-pronunciation-client.mjs')) },
  '/ui/query-pronunciation-cache.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'query-pronunciation-cache.mjs')) },
  '/studio/document-adapter.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'document-adapter.mjs')) },
  '/studio/document-model.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'document-model.mjs')) },
  '/studio/document-store.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'document-store.mjs')) },
  '/studio/editor-session.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'editor-session.mjs')) },
  '/studio/performance-session.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'performance-session.mjs')) },
  '/studio/mobile-viewport.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'mobile-viewport.mjs')) },
  '/studio/capability-adapter.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'capability-adapter.mjs')) },
  '/studio/detail-adapter.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'detail-adapter.mjs')) },
  '/studio/analysis-adapter.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'analysis-adapter.mjs')) },
  '/studio/analysis-cache.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'analysis-cache.mjs')) },
  '/studio/backup-portability.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'backup-portability.mjs')) },
  '/studio/diagnostics.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'diagnostics.mjs')) },
  '/studio/internal-db-lab.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'internal-db-lab.mjs')) },
  '/studio/internal-db-benchmark.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'internal-db-benchmark.mjs')) },
  '/studio/i18n.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'i18n.mjs')) },
  '/studio/dom-acceptance.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'dom-acceptance.mjs')) },
  '/studio/command-palette.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'command-palette.mjs')) },
  '/studio/device-acceptance.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'device-acceptance.mjs')) },
  '/studio/edit-history.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'edit-history.mjs')) },
  '/studio/parity-manifest.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'parity-manifest.mjs')) },
  '/studio/revision-diff.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'revision-diff.mjs')) },
  '/studio/query-pronunciation-client.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'query-pronunciation-client.mjs')) },
  '/studio/query-pronunciation-cache.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(studioUiDir, 'query-pronunciation-cache.mjs')) },
  '/pad/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(padUiDir, 'styles.css')) },
  '/pad/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(padUiDir, 'app.js')) },
  '/assets/styles.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(uiDir, 'styles.css')) },
  '/assets/mobile.css': { type: 'text/css; charset=utf-8', body: readFileSync(resolve(uiDir, 'mobile.css')) },
  '/assets/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'app.js')) },
  '/assets/custom-select.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(uiDir, 'custom-select.mjs')) },
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
  ...reactStudioAssets,
};

function studioRouteModePayload(){
  return {
    studioDefaultRoute,
    reactStudioPreview:reactStudioPreview.enabled,
    reactStudioPreviewDefault:reactStudioPreview.defaultRoute,
    defaultRoute:searchDefaultRoute
      ?'search'
      :(reactStudioPreview.defaultRoute?'react-studio':'studio-legacy'),
    reactStudio:'/studio',
    reactStudioAlias:'/studio-react',
    studio:'/studio',
    legacyStudio:'/studio-legacy',
    search:'/search',
    legacySearch:'/legacy',
    legacyPad:'/pad-legacy',
  };
}

function json(res,data,status=200,_legacyAllowCors=false,diagnostics=null){
  const serializeStarted=performance.now();
  const body=JSON.stringify(data);
  const serializeMs=performance.now()-serializeStarted;
  const responseBytes=Buffer.byteLength(body);
  const headers={
    ...securityHeaders({
      contentType:'application/json; charset=utf-8',
      requestId:res.getHeader('x-request-id')||null,
    }),
    'content-length':String(responseBytes),
    'cache-control':'no-store',
  };
  if(diagnostics?.measured===true){
    const searchMs=Number(diagnostics.searchMs);
    const beforeSerializeMs=Number(diagnostics.beforeSerializeMs);
    if(Number.isFinite(searchMs))headers['x-rhymelab-search-ms']=searchMs.toFixed(3);
    if(Number.isFinite(beforeSerializeMs)){
      headers['x-rhymelab-before-serialize-ms']=beforeSerializeMs.toFixed(3);
    }
    headers['x-rhymelab-json-serialize-ms']=serializeMs.toFixed(3);
    headers['x-rhymelab-response-bytes']=String(responseBytes);
    const timings=[];
    if(Number.isFinite(searchMs))timings.push(`search;dur=${searchMs.toFixed(3)}`);
    timings.push(`serialize;dur=${serializeMs.toFixed(3)}`);
    headers['server-timing']=timings.join(', ');
  }
  res.writeHead(status,headers);
  res.end(body);
  return {serializeMs,responseBytes};
}

function asset(res,entry){
  const isHtml=String(entry.type||'').toLowerCase().startsWith('text/html');
  res.writeHead(200,{
    ...securityHeaders({
      contentType:entry.type,
      isHtml,
      requestId:res.getHeader('x-request-id')||null,
    }),
    'cache-control':'no-store',
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
    rightEdgeComponent: String(
      url.searchParams.get(`query_right_edge_${language}`) || '',
    ).trim().slice(0, 160) || null,
  };
}

const server = createServer(async (req, res) => {
  const requestId=createRequestId();
  res.setHeader('x-request-id',requestId);
  try {
    const url=requestUrlFromTrustedBase(req.url,{host,port});
    if(!isAllowedRequestHost(req,{
      remote:serverBinding.remote,
      allowedRemoteHosts,
      port,
    })){
      return json(res,{error:'Request host is not allowed.',code:'host_not_allowed'},421,false);
    }
    if(url.pathname.startsWith('/api/')&&isCrossSiteBrowserRequest(req)){
      return json(res,{error:'Cross-site browser requests are not allowed.',code:'cross_site_request'},403,false);
    }

    if (req.method === 'GET' && assets[url.pathname]) return asset(res, assets[url.pathname]);

    if (url.pathname === '/api/benchmark/review') {
      if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405, false);
      if (!isAllowedLocalMutationRequest(req,{port})) return json(res, { error: 'Benchmark writes are localhost-only' }, 403, false);
      const body = await readJsonRequestBody(req);
      const saved = await saveBenchmarkReview(body);
      const state = await loadBenchmarkState();
      return json(res, { saved, summary: state.summary, next_task: state.next_task }, 200, false);
    }

    if (url.pathname === '/api/markov/generate') {
      if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405, false);
      if (!isAllowedLocalMutationRequest(req,{port})) return json(res, { error: 'Markov generation is localhost-only' }, 403, false);
      const body=await readJsonRequestBody(req,{maxBytes:512*1024});
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

    if(url.pathname==='/api/internal/distribution-dbs'){
      if(!internalDbSwitcherEnabled){
        return json(res,{enabled:false,error:'internal_distribution_db_switcher_disabled'},200,false);
      }
      return json(res,internalDistributionPayload(),200,false);
    }

    if (url.pathname === '/api/health') {
      const healthInternalEntry=requestedInternalRuntimeEntry(url);
      const healthRuntime=healthInternalEntry?.runtime||servingV1Runtime;
      const healthState=healthInternalEntry?.state||servingV1State;
      const healthDatabases=healthInternalEntry?.runtime?.coreDatabases||canonicalRuntimeDatabases;
      const healthPath=healthInternalEntry?.path||servingV1DbPath;
      return json(res, {
        status: 'ok',
        mode: 'local',
        markov_generator: markovModelHealth(markovRuntime),
        markov_generators: {
          de:markovModelHealth(markovRuntime),
          en:markovModelHealth(markovEnglishRuntime),
        },
        package_runtime: servingV1Active ? 'serving-v1-'+servingV1DbId : 'legacy-archive-bundle',
        writer_database: healthDatabases.writerDb ? healthPath : null,
        writer_runtime: servingV1Active ? SERVING_V1_PRODUCT_RUNTIME : WRITER_RUNTIME_ID,
        serving_v1: servingV1Active ? {
          enabled:true,
          default_runtime:true,
          database:healthPath,
          state:healthState,
          distribution:healthRuntime?.capabilities||null,
          internal_db:healthInternalEntry?.id||(servingV1Active?servingV1DbId:null),
        } : {
          enabled:false,
          default_runtime:false,
        },
        legacy_database: legacyDb ? legacyDbPath : null,
        legacy_available: Boolean(legacyDb),
        legacy_error: legacyDb ? null : legacyDbError,
        phrase_database: healthDatabases.phraseDb ? healthPath : null,
        phrase_available: Boolean(healthDatabases.phraseDb),
        phrase_error: healthDatabases.phraseDb ? null : phraseDbError,
        entity_database: healthDatabases.entityDb ? healthPath : null,
        entity_available: Boolean(healthDatabases.entityDb),
        entity_error: healthDatabases.entityDb ? null : entityDbError,
        english_database: healthDatabases.englishDb ? healthPath : null,
        english_available: Boolean(healthDatabases.englishDb),
        english_error: healthDatabases.englishDb ? null : englishDbError,
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
        unified_writer: unifiedWriterCapabilities(healthDatabases),
      });
    }

    if (url.pathname === '/api/dataset-stats') {
      return json(res,runtimeDatasetStats(url));
    }

    if(url.pathname==='/api/studio/route-mode'){
      json(res,studioRouteModePayload());
      return;
    }

    if (url.pathname === '/api/writer') {
      const rateKey=String(req.socket?.remoteAddress||'anonymous');
      const rate=writerRateLimiter.consume(rateKey);
      res.setHeader('x-ratelimit-limit',String(Math.floor(rate.capacity)));
      res.setHeader('x-ratelimit-remaining',String(Math.max(0,Math.floor(rate.remaining))));
      if(!rate.allowed){
        const retrySeconds=Math.max(1,Math.ceil(rate.retryAfterMs/1000));
        res.setHeader('retry-after',String(retrySeconds));
        return json(res,{
          error:'Too many Writer requests.',
          status:'rate_limited',
          retryAfterMs:rate.retryAfterMs,
        },429);
      }
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return json(res, { error: 'q is required' }, 400);
      const runtimeSelection=requestRuntimeSelection(url);
      const runtimeDatabases=runtimeSelection.available?runtimeSelection.databases:null;
      if(!runtimeDatabases){
        return json(res,{
          error:'Selected runtime database cannot satisfy this request.',
          reason:runtimeSelection.reason||activeGeneratedRuntime.reason,
          runtimeDb:runtimeSelection.internalDbId||null,
        },503);
      }
      const searchOptions={
        language: url.searchParams.get('language') || 'de',
        resultLanguage: url.searchParams.get('result_language') || url.searchParams.get('results_language') || null,
        scope: url.searchParams.get('scope') || 'all',
        type: url.searchParams.get('type') || 'all',
        syllableFilter: url.searchParams.get('syllables') || 'all',
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
        entityCategories: [
          ...url.searchParams.getAll('entity_category'),
          ...(url.searchParams.get('entity_categories')||'').split(','),
        ].map((value)=>String(value||'').trim()).filter((value,index,array)=>
          value&&value!=='all'&&array.indexOf(value)===index
        ).slice(0,24),
        generatedOnly:generatedOnlyRequested(url),
        profileStages:internalDbSwitcherEnabled&&url.searchParams.get('profile')==='1',
        queryPronunciations: {
          de: clientQueryPronunciation(url, 'de'),
          en: clientQueryPronunciation(url, 'en'),
        },
      };
      const requestStarted=performance.now();
      const searchStarted=performance.now();
      const useInternalDirect=runtimeSelection.internal===true;
      const result = servingV1Active&&!useInternalDirect
        ?await parallelWriterRuntime.search(q,searchOptions,{
            generatedOverlay:generatedOptinRequested(url),
          })
        :searchUnifiedWriter(runtimeDatabases,q,searchOptions);
      const elapsed=performance.now()-searchStarted;
      const runtimeTiming=(runtimeSelection.internalDbId
        ?internalDbQueryTimings.get(runtimeSelection.internalDbId)
        :writerQueryTiming
      ).record(elapsed);
      const status = result.status === 'language_unavailable'
        ? 503
        : result.status === 'query_not_found'
          ? 404
          : 200;
      const studioTransport=url.searchParams.get('studio')==='1';
      const projected=studioTransport?compactStudioWriterPayload(result):result;
      const payload={
        ...projected,
        runtimeTiming,
        runtimeDb:runtimeSelection.internalDbId||null,
        runtimeExecution:useInternalDirect?'direct-internal-db-lab':servingV1Active?'parallel-serving-v1':'direct-legacy',
        ...(studioTransport?{
          transportProjection:'studio-writer-compact-v1',
          transportStats:studioWriterPayloadStats(projected),
        }:{}),
      };
      const beforeSerializeMs=performance.now()-requestStarted;
      return json(res,payload,status,true,{
        measured:true,
        searchMs:elapsed,
        beforeSerializeMs,
      });
    }

    if (url.pathname === '/api/analysis/rhyme-scheme') {
      const analysisMode=url.searchParams.get('mode')==='all'?'all':'end';
      const maxWords=analysisMode==='all'?500:200;
      const words=url.searchParams.getAll('word').map((word)=>String(word||'').trim()).slice(0,maxWords);
      if(!words.some(Boolean))return json(res,{error:'at least one word is required'},400);
      const language=String(url.searchParams.get('language')||'de').trim().toLocaleLowerCase('en-US');
      const normalizedLanguage=['de','en','both'].includes(language)?language:'de';
      const runtimeSelection=requestRuntimeSelection(url);
      const runtimeDatabases=runtimeSelection.available?runtimeSelection.databases:null;
      if(!runtimeDatabases){
        return json(res,{
          error:'Selected runtime database cannot satisfy this request.',
          reason:runtimeSelection.reason||activeGeneratedRuntime.reason,
          runtimeDb:runtimeSelection.internalDbId||null,
        },503);
      }
      const started=performance.now();
      let analysisCacheHits=0,analysisCacheMisses=0;
      const generatedOverlay=generatedOptinRequested(url);
      const generatedOnly=generatedOnlyRequested(url);
      const runtimeCacheId=runtimeSelection.internalDbId
        ?'internal:'+runtimeSelection.internalDbId
        :(servingV1Active?'serving-v1':'legacy');
      const searchAnchor=async(word)=>{
        const options={
          language:normalizedLanguage,
          resultLanguage:normalizedLanguage,
          scope:'words',
          type:'all',
          includeVariants:true,
          includeHistorical:false,
          wordLimit:250,
          wordPoolLimit:1200,
          generatedOnly,
        };
        const normalizedWord=String(word||'').normalize('NFKC').trim().toLocaleLowerCase(normalizedLanguage==='en'?'en-US':'de-DE');
        const cacheKey=[runtimeCacheId,normalizedLanguage,generatedOverlay?'generated':'canonical',generatedOnly?'only':'mixed',normalizedWord].join('|');
        const cached=await songAnalysisAnchorCache.resolve(cacheKey,async()=>{
          const result=servingV1Active&&runtimeSelection.internal!==true
            ?await parallelWriterRuntime.search(word,options,{generatedOverlay})
            :searchUnifiedWriter(runtimeDatabases,word,options);
          return compactSongAnalysisAnchorResult(result);
        });
        if(cached.hit)analysisCacheHits+=1;
        else analysisCacheMisses+=1;
        return cached.value;
      };
      const analysis=await analyzeSongEndRhymes(words,{
        searchAnchor,
        language:normalizedLanguage,
        maxUnique:analysisMode==='all'?180:64,
        concurrency:analysisMode==='all'?8:4,
      });
      return json(res,{
        ...analysis,
        mode:analysisMode,
        inputWordCount:words.length,
        inputTruncated:url.searchParams.getAll('word').length>maxWords,
        runtimeTiming:{currentMs:Number((performance.now()-started).toFixed(3))},
        analysisCache:{
          hits:analysisCacheHits,
          misses:analysisCacheMisses,
          size:songAnalysisAnchorCache.size,
          maxEntries:songAnalysisAnchorCache.maxEntries,
        },
        runtimeDb:runtimeSelection.internalDbId||null,
      });
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
    const publicError=publicHttpError(error,{requestId});
    if(publicError.statusCode>=500){
      const errorName=error instanceof Error?error.name:'Error';
      console.error(`[http ${requestId}] ${errorName} (${publicError.body.code})`);
    }
    return json(res,publicError.body,publicError.statusCode,false);
  }
});

server.headersTimeout=10_000;
server.requestTimeout=30_000;
server.keepAliveTimeout=5_000;
server.maxHeadersCount=100;
server.maxRequestsPerSocket=100;

server.listen(port, host, () => {
  console.log(`RhymeLab local: http://${host}:${port}`);
  console.log(`RhymePad workspace: http://${host}:${port}/pad`);
  console.log(`Studio V2: http://${host}:${port}${studioDefaultRoute?' / (default)':'/studio'}`);
  console.log(`Legacy Search: http://${host}:${port}/search${studioDefaultRoute?'':' (default)'}`);
  console.log(`RhymeLab benchmark review: http://${host}:${port}/benchmark`);
  console.log(`Markov DE database: ${markovRuntime.available ? markovModelPath : 'unavailable — npm run markov:model:build'}`);
  console.log(`Markov EN database: ${markovEnglishRuntime.available ? markovEnglishModelPath : 'unavailable — npm run markov:model:build:en'}`);
  if(servingV1Active){
    console.log(`Product runtime: Serving-v1 ${servingV1DbId.toUpperCase()} (best available shipping edition)`);
    console.log(`Serving-v1 SQLite: ${servingV1DbPath}`);
    console.log(`Serving-v1 runtime: ${SERVING_V1_PRODUCT_RUNTIME}`);
    console.log(`Writer execution: ${parallelWriterRuntime.health().execution} · ${parallelWriterRuntime.health().workers} workers`);
    console.log(`Generated data: ${activeGeneratedRuntime.available?'available in '+servingV1DbId.toUpperCase():'unavailable in '+servingV1DbId.toUpperCase()}`);
    if(internalDbSwitcherEnabled){
      console.log('Distribution selector: ENABLED · per-request LITE / STANDARD / FULL');
      for(const id of INTERNAL_DISTRIBUTION_DB_IDS){
        const entry=internalDbEntries.get(id);
        console.log(`  ${id.padEnd(8)} ${entry?.runtime?'ready':'unavailable'} · ${internalDbPaths[id]}`);
      }
    }
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
    for(const entry of internalDbEntries.values()){
      if(entry?.owned)try{entry.runtime?.close();}catch{}
    }
    try { servingV1Runtime?.close(); } catch {}
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
