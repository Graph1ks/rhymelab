import {
  CLIENT_QUERY_PRONUNCIATION_POLICY,
  resolveUnknownClientPronunciation,
} from './query-pronunciation-client.mjs';
import {
  readGeneratedPronunciationCache,
  writeGeneratedPronunciationCache,
} from './query-pronunciation-cache.mjs';
import {createSearchState,searchStateToWriterParams} from './search-state.mjs';

const PRIMARY_TYPES=Object.freeze([
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
]);
const SOUND_RELATION_TYPES=Object.freeze(['assonance','consonance']);
const RELATION_LABELS=Object.freeze({
  multisyllabic_perfect:'Mehrsilbiger Vollreim',
  perfect:'Vollreim',
  multisyllabic_slant:'Mehrsilbiger Slant-Reim',
  family:'Reimfamilie',
  slant:'Slant-Reim',
  assonance:'Assonanz',
  consonance:'Konsonanz',
  weak:'Klangtreffer',
});

export function estimateSyllables(surface){
  return (String(surface||'').toLowerCase().match(/[aeiouyäöü]+/g)||[]).length;
}

export function writerScope(scope){
  const normalized=String(scope||'all').trim().toLocaleLowerCase('en-US');
  if(['words','phrases','entities','all'].includes(normalized))return normalized;
  return ({word:'words',phrase:'phrases',entity:'entities'})[normalized]||'all';
}

export function writerRelationType(row){
  const primary=PRIMARY_TYPES.includes(row?.primaryType)
    ?row.primaryType
    :PRIMARY_TYPES.includes(row?.type)
      ?row.type
      :null;
  if(primary)return primary;
  const relation=(row?.relations||[])
    .filter((item)=>SOUND_RELATION_TYPES.includes(item?.type))
    .slice()
    .sort((a,b)=>Number(b?.score||0)-Number(a?.score||0))[0];
  return relation?.type||'weak';
}

export function writerRelationGroup(type){
  return type==='perfect'||type==='multisyllabic_perfect'?'rein':'nah';
}

export function writerRelationLabel(type){
  return RELATION_LABELS[type]||'Klangtreffer';
}

function relationScore(row,type){
  if(SOUND_RELATION_TYPES.includes(type)){
    return Number((row?.relations||[]).find((item)=>item?.type===type)?.score||0);
  }
  return Number(row?.score||0);
}

export function mapWriterResult(row,index=0){
  const relationType=writerRelationType(row);
  const kind=['word','phrase','entity'].includes(row?.resultKind)?row.resultKind:'word';
  const word=String(row?.word||row?.surface||row?.normalized||'').trim();
  return {
    word,
    kind,
    relation:writerRelationGroup(relationType),
    relationType,
    relationLabel:writerRelationLabel(relationType),
    syll:Number(row?.syllableCount||0),
    syllableDistance:Number.isFinite(Number(row?.syllableDistance))
      ?Math.abs(Number(row.syllableDistance))
      :null,
    lang:String(row?.language||'de').toLocaleLowerCase('en-US'),
    id:String(row?.resultId||row?.windowId||row?.normalized||word||index),
    score:relationScore(row,relationType),
    usageRank:row?.usageRank??null,
    usageCount:row?.usageCount??null,
    generatedPronunciation:row?.generatedPronunciation===true,
    raw:row,
  };
}

export function buildWriterParams({
  query,
  queryBasis='de',
  resultLanguage='both',
  scope='all',
  includeVariants=false,
  includeHistorical=false,
  generated=false,
  generatedOnly=false,
  entityCategory='all',
  entityCategories=[],
  rhymeType='all',
  syllableFilter='all',
}={}){
  const state=createSearchState({
    anchor:query,
    queryBasis,
    resultLanguage,
    scope:writerScope(scope),
    rhymeType,
    syllableFilter,
    variantMode:includeVariants?'all':'preferred',
    historical:includeHistorical,
    generated,
    generatedOnly,
    entityCategory,
    entityCategories,
  });
  return searchStateToWriterParams(state);
}

function basisLanguages(value){
  return value==='both'?['de','en']:[value];
}

function queryHasPronunciation(data,language){
  return Boolean(data?.queries?.[language]?.preferredIpa||data?.queries?.[language]?.ipa);
}

async function readResponse(response){
  let data=null;
  try{data=await response.json();}catch{}
  return data||{};
}

function roundMetric(value){
  const number=Number(value);
  return Number.isFinite(number)?Number(number.toFixed(1)):null;
}

function headerNumber(response,name){
  try{
    const value=response?.headers?.get?.(name);
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }catch{return null}
}

function paramsSnapshot(params){
  const out={};
  for(const [key,value] of params.entries()){
    if(Object.hasOwn(out,key)){
      out[key]=Array.isArray(out[key])?[...out[key],value]:[out[key],value];
    }else{
      out[key]=value;
    }
  }
  return out;
}

function responseTextBytes(value){
  try{return new TextEncoder().encode(String(value||'')).byteLength}
  catch{return String(value||'').length}
}

function browserResourceMetric(requestUrl,startedAt){
  try{
    if(typeof performance?.getEntriesByName!=='function'||typeof location==='undefined')return null;
    const absolute=new URL(requestUrl,location.href).href;
    const entries=performance.getEntriesByName(absolute,'resource');
    const row=[...entries].reverse().find((entry)=>
      Number(entry?.startTime||0)>=Number(startedAt||0)-2
    )||entries.at?.(-1);
    if(!row)return null;
    return {
      name:absolute,
      durationMs:roundMetric(row.duration),
      fetchStartMs:roundMetric(row.fetchStart),
      responseStartMs:roundMetric(row.responseStart),
      responseEndMs:roundMetric(row.responseEnd),
      transferSize:Number(row.transferSize||0),
      encodedBodySize:Number(row.encodedBodySize||0),
      decodedBodySize:Number(row.decodedBodySize||0),
    };
  }catch{return null}
}

async function readMeasuredWriterResponse(response,{requestUrl,startedAt,headersMs}={}){
  const bodyStarted=performance.now();
  let data=null;
  let bodyReadMs=null;
  let parseMs=null;
  let responseBytes=headerNumber(response,'x-rhymelab-response-bytes')
    ??headerNumber(response,'content-length');
  if(typeof response?.text==='function'){
    let raw='';
    try{raw=await response.text();}catch{}
    bodyReadMs=roundMetric(performance.now()-bodyStarted);
    if(responseBytes==null)responseBytes=responseTextBytes(raw);
    const parseStarted=performance.now();
    try{data=raw?JSON.parse(raw):null;}catch{}
    parseMs=roundMetric(performance.now()-parseStarted);
  }else{
    const parseStarted=performance.now();
    data=await readResponse(response);
    parseMs=roundMetric(performance.now()-parseStarted);
    bodyReadMs=0;
  }
  const totalMs=roundMetric(performance.now()-startedAt);
  return {
    data:data||{},
    clientTiming:{
      headersMs:roundMetric(headersMs),
      bodyReadMs,
      parseMs,
      totalMs,
      roundTripMs:totalMs,
      responseBytes,
      resource:browserResourceMetric(requestUrl,startedAt),
    },
    serverTransport:{
      searchMs:headerNumber(response,'x-rhymelab-search-ms'),
      beforeSerializeMs:headerNumber(response,'x-rhymelab-before-serialize-ms'),
      serializeMs:headerNumber(response,'x-rhymelab-json-serialize-ms'),
      responseBytes:headerNumber(response,'x-rhymelab-response-bytes')
        ??headerNumber(response,'content-length'),
    },
  };
}

async function lookupSourceBackedWord(fetchImpl,surface,language,generated,signal,runtimeDb=''){
  const params=new URLSearchParams({
    language,
    generated:generated?'1':'0',
  });
  if(runtimeDb)params.set('runtime_db',runtimeDb);
  const response=await fetchImpl(
    `/api/word/${encodeURIComponent(surface)}?${params}`,
    {signal,headers:{accept:'application/json'}},
  );
  if(!response.ok)return null;
  const detail=await readResponse(response);
  return detail?.preferredIpa?detail:null;
}

export function resolvedRightEdgeComponent(detail){
  const method=String(detail?.method||'');
  if(/compound_right_edge$/u.test(method)){
    const components=Array.isArray(detail?.components)?detail.components:[];
    return String(components.at(-1)||'').trim();
  }
  if(method==='client_token_chain'){
    const tokens=Array.isArray(detail?.tokens)?detail.tokens:[];
    const last=tokens.at(-1);
    const lastMethod=String(last?.method||'');
    if(/compound_right_edge$/u.test(lastMethod)){
      const components=Array.isArray(last?.components)?last.components:[];
      return String(components.at(-1)||'').trim();
    }
  }
  return'';
}

async function resolveMissingPronunciations({
  fetchImpl,
  data,
  params,
  query,
  queryBasis,
  generated,
  queryPronunciationRevision,
  signal,
  runtimeDb='',
}){
  const languages=basisLanguages(queryBasis).filter(
    (language)=>data?.capabilities?.languages?.[language]?.available!==false,
  );
  const missing=languages.filter((language)=>!queryHasPronunciation(data,language));
  if(!missing.length)return false;

  let changed=false;
  for(const language of missing){
    const detail=await resolveUnknownClientPronunciation(query,language,{
      lookupReference:(surface,referenceLanguage)=>
        lookupSourceBackedWord(fetchImpl,surface,referenceLanguage,generated,signal,runtimeDb),
      lookupCachedPronunciation:(surface,referenceLanguage)=>{
        if(!queryPronunciationRevision)return null;
        return readGeneratedPronunciationCache({
          surface,
          language:referenceLanguage,
          policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
          databaseRevision:queryPronunciationRevision,
        });
      },
      storeCachedPronunciation:(resolved)=>{
        if(!queryPronunciationRevision)return false;
        return writeGeneratedPronunciationCache(resolved,queryPronunciationRevision);
      },
    });
    if(!detail?.ipa)continue;
    params.set(`query_ipa_${language}`,detail.ipa);
    params.set(`query_method_${language}`,detail.method||'client_unknown');
    if(detail.sourceBacked)params.set(`query_source_backed_${language}`,'1');
    if(Array.isArray(detail.components)&&detail.components.length){
      params.set(`query_components_${language}`,JSON.stringify(detail.components));
    }
    const rightEdgeComponent=resolvedRightEdgeComponent(detail);
    if(rightEdgeComponent){
      params.set(`query_right_edge_${language}`,rightEdgeComponent);
    }
    changed=true;
  }
  return changed;
}

export function createWriterSearchClient({fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetch is unavailable');
  let activeController=null;
  let requestId=0;

  return {
    cancel(){
      activeController?.abort();
      activeController=null;
    },
    async search(options={}){
      const query=String(options.query||'').trim();
      if(!query)return {
        status:'idle',
        rows:[],
        query:null,
        querySyllables:0,
        warnings:[],
        runtimeTiming:null,
        raw:null,
      };

      activeController?.abort();
      const controller=new AbortController();
      activeController=controller;
      const current=++requestId;
      const params=buildWriterParams(options);
      params.set('studio','1');
      if(options.internalProfile===true)params.set('profile','1');
      if(options.runtimeDb)params.set('runtime_db',String(options.runtimeDb));
      const request=async()=>{
        const requestUrl=`/api/writer?${params}`;
        const started=performance.now();
        const response=await fetchImpl(
          requestUrl,
          {signal:controller.signal,headers:{accept:'application/json'}},
        );
        const headersMs=performance.now()-started;
        const measured=await readMeasuredWriterResponse(response,{
          requestUrl,
          startedAt:started,
          headersMs,
        });
        return {response,...measured};
      };

      let {response,data,clientTiming,serverTransport}=await request();
      const generatedPronunciation=await resolveMissingPronunciations({
        fetchImpl,
        data,
        params,
        query,
        queryBasis:options.queryBasis||'de',
        generated:options.generated===true,
        queryPronunciationRevision:options.queryPronunciationRevision||'',
        signal:controller.signal,
        runtimeDb:options.runtimeDb||'',
      });
      if(generatedPronunciation){
        ({response,data,clientTiming,serverTransport}=await request());
      }

      if(current!==requestId){
        const stale=new Error('Stale Studio Writer request');
        stale.name='AbortError';
        throw stale;
      }
      if(!response.ok){
        const error=new Error(
          response.status===404
            ?'Für diese Aussprache wurden keine Writer-Treffer gefunden.'
            :(data?.error||data?.status||`Writer request failed (HTTP ${response.status})`),
        );
        error.status=response.status;
        error.data=data;
        throw error;
      }

      const mapStarted=performance.now();
      const rows=(data?.results||[]).map(mapWriterResult).filter((row)=>row.word);
      clientTiming={
        ...(clientTiming||{}),
        mapMs:roundMetric(performance.now()-mapStarted),
      };
      return {
        status:'ready',
        rows,
        query:data?.query||null,
        queries:data?.queries||null,
        querySyllables:Number(data?.query?.syllableCount||0),
        warnings:Array.isArray(data?.warnings)?data.warnings:[],
        runtimeTiming:data?.runtimeTiming||null,
        runtimeDb:data?.runtimeDb||options.runtimeDb||null,
        runtimeExecution:data?.runtimeExecution||null,
        effectiveRequest:paramsSnapshot(params),
        clientTiming,
        serverTransport,
        capabilities:data?.capabilities||null,
        raw:data,
      };
    },
  };
}
