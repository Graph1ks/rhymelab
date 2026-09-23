import {writerResultQuality} from './internal-db-benchmark.mjs';

export const INTERNAL_DB_LAB_STORAGE_KEY='rhymelab.internal.dbLab.v1';
export const INTERNAL_DB_LAB_IDS=Object.freeze(['lite','standard','full']);

export function normalizeInternalDbLabId(value){
  const id=String(value||'').trim().toLowerCase();
  return INTERNAL_DB_LAB_IDS.includes(id)?id:'standard';
}

export function loadInternalDbLabSelection(storage=globalThis.localStorage){
  try{return normalizeInternalDbLabId(storage?.getItem?.(INTERNAL_DB_LAB_STORAGE_KEY)||'standard')}
  catch{return 'standard'}
}

export function saveInternalDbLabSelection(id,storage=globalThis.localStorage){
  const value=normalizeInternalDbLabId(id);
  try{storage?.setItem?.(INTERNAL_DB_LAB_STORAGE_KEY,value)}catch{}
  return value;
}

function finite(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function navigationMetrics(performanceObj){
  const nav=performanceObj?.getEntriesByType?.('navigation')?.[0]||null;
  if(!nav)return null;
  return {
    type:String(nav.type||''),
    durationMs:finite(nav.duration),
    ttfbMs:finite(nav.responseStart),
    domInteractiveMs:finite(nav.domInteractive),
    domContentLoadedMs:finite(nav.domContentLoadedEventEnd),
    loadEventMs:finite(nav.loadEventEnd),
    transferSize:finite(nav.transferSize),
    encodedBodySize:finite(nav.encodedBodySize),
    decodedBodySize:finite(nav.decodedBodySize),
  };
}

function paintMetrics(performanceObj){
  const result={};
  for(const entry of performanceObj?.getEntriesByType?.('paint')||[]){
    if(entry?.name)result[String(entry.name)]=finite(entry.startTime);
  }
  return result;
}

function resourceMetrics(performanceObj){
  const entries=performanceObj?.getEntriesByType?.('resource')||[];
  let transferSize=0,encodedBodySize=0,decodedBodySize=0,durationMs=0;
  for(const entry of entries){
    transferSize+=Number(entry?.transferSize||0);
    encodedBodySize+=Number(entry?.encodedBodySize||0);
    decodedBodySize+=Number(entry?.decodedBodySize||0);
    durationMs+=Number(entry?.duration||0);
  }
  return {
    count:entries.length,
    transferSize,
    encodedBodySize,
    decodedBodySize,
    aggregateDurationMs:Number(durationMs.toFixed(1)),
  };
}

export function browserRuntimeMetrics({
  windowObj=globalThis.window,
  documentObj=globalThis.document,
  performanceObj=globalThis.performance,
  navigatorObj=globalThis.navigator,
}={}){
  const connection=navigatorObj?.connection||navigatorObj?.mozConnection||navigatorObj?.webkitConnection||null;
  const memory=performanceObj?.memory||null;
  return {
    collectedAt:new Date().toISOString(),
    viewport:{
      width:Number(windowObj?.innerWidth||0),
      height:Number(windowObj?.innerHeight||0),
      dpr:Number(windowObj?.devicePixelRatio||1),
    },
    device:{
      hardwareConcurrency:Number(navigatorObj?.hardwareConcurrency||0)||null,
      deviceMemoryGiB:Number(navigatorObj?.deviceMemory||0)||null,
      maxTouchPoints:Number(navigatorObj?.maxTouchPoints||0),
    },
    network:connection?{
      effectiveType:String(connection.effectiveType||''),
      downlinkMbps:finite(connection.downlink),
      rttMs:finite(connection.rtt),
      saveData:connection.saveData===true,
    }:null,
    jsHeap:memory?{
      usedBytes:finite(memory.usedJSHeapSize),
      totalBytes:finite(memory.totalJSHeapSize),
      limitBytes:finite(memory.jsHeapSizeLimit),
    }:null,
    navigation:navigationMetrics(performanceObj),
    paint:paintMetrics(performanceObj),
    resources:resourceMetrics(performanceObj),
    dom:{
      elements:Number(documentObj?.getElementsByTagName?.('*')?.length||0),
      resultNodes:Number(documentObj?.querySelectorAll?.('#results .result')?.length||0),
    },
  };
}

export function studioRuntimeMetrics({
  activeDb='standard',
  writerStatus='idle',
  writerRuntimeTiming=null,
  writerClientTiming=null,
  writerServerTransport=null,
  writerExecution=null,
  writerEffectiveRequest=null,
  writerRows=[],
  lastRenderMs=null,
  resultCount=0,
  visibleResultCount=0,
  query='',
}={}){
  const quality=writerResultQuality(writerRows||[]);
  const searchMs=finite(writerRuntimeTiming?.searchMs);
  const beforeSerializeMs=finite(writerServerTransport?.beforeSerializeMs);
  const postSearchMs=searchMs!=null&&beforeSerializeMs!=null
    ?Math.max(0,beforeSerializeMs-searchMs)
    :null;
  return {
    activeDb:normalizeInternalDbLabId(activeDb),
    writerStatus:String(writerStatus||''),
    query:String(query||''),
    effectiveRequest:writerEffectiveRequest||null,
    resultCount:Number(resultCount||0),
    visibleResultCount:Number(visibleResultCount||0),
    resultQuality:quality,
    serverSearchMs:searchMs,
    serverPostSearchMs:postSearchMs,
    serverAverageLast100Ms:finite(writerRuntimeTiming?.averageLast100Ms),
    serverSampleCount:Number(writerRuntimeTiming?.sampleCount||0),
    serverBeforeSerializeMs:finite(writerServerTransport?.beforeSerializeMs),
    serverSerializeMs:finite(writerServerTransport?.serializeMs),
    responseBytes:finite(writerClientTiming?.responseBytes??writerServerTransport?.responseBytes),
    clientHeadersMs:finite(writerClientTiming?.headersMs),
    clientBodyReadMs:finite(writerClientTiming?.bodyReadMs),
    clientParseMs:finite(writerClientTiming?.parseMs),
    clientMapMs:finite(writerClientTiming?.mapMs),
    clientTotalMs:finite(writerClientTiming?.totalMs??writerClientTiming?.roundTripMs),
    clientRoundTripMs:finite(writerClientTiming?.roundTripMs),
    queryResource:writerClientTiming?.resource||null,
    resultRenderMs:finite(lastRenderMs),
    execution:writerExecution||null,
  };
}

export function internalDbSummaryMap(payload){
  return Object.fromEntries(
    (payload?.databases||[]).map((row)=>[String(row.id),row]),
  );
}

export function studioCapabilitiesFromInternalDb(summary,current={}){
  if(!summary?.available)return current;
  const caps=summary.capabilities||{};
  return {
    ...current,
    status:'ready',
    runtime:'serving-v1/'+String(summary.id||'standard'),
    servingV1:true,
    deWriter:caps.words_de===true,
    enWriter:caps.words_en===true,
    phrases:caps.phrases===true,
    entities:caps.entities===true,
    generated:caps.generated===true,
    generatedDefault:false,
    queryPronunciationRevision:String(
      summary.state?.productSemanticFingerprint
      ||summary.meta?.product_adapter_semantic_fingerprint
      ||''
    ),
  };
}

export function internalDbLabCopyPayload({
  payload,
  activeDb,
  browser,
  studio,
  benchmark=null,
}={}){
  return {
    schema:'rhymelab-internal-db-lab-copy-v2',
    copiedAt:new Date().toISOString(),
    internalOnly:true,
    shipping:false,
    activeDb:normalizeInternalDbLabId(activeDb),
    studio:studio||null,
    browser:browser||null,
    server:payload?.server||null,
    databases:payload?.databases||[],
    benchmark:benchmark||null,
  };
}
