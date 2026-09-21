import {
  CLIENT_QUERY_PRONUNCIATION_POLICY,
  resolveUnknownClientPronunciation,
} from './query-pronunciation-client.mjs';
import {
  readGeneratedPronunciationCache,
  writeGeneratedPronunciationCache,
} from './query-pronunciation-cache.mjs';

export const DEMO_RHYME_DATASETS=Object.freeze({
  nacht:[['Macht','word','rein',1],['gedacht','word','rein',2],['erwacht','word','rein',2],['vollbracht','word','rein',2],['gute Nacht','phrase','rein',3],['Acht','word','rein',1],['über Nacht','phrase','rein',3],['entfacht','word','rein',2],['Wacht','word','rein',1],['Bracht','entity','rein',1],['lacht','word','rein',1],['sacht','word','rein',1]],
  zeit:[['bereit','word','rein',2],['weit','word','rein',1],['Ewigkeit','word','rein',3],['mit der Zeit','phrase','rein',3],['befreit','word','rein',2],['zu zweit','phrase','rein',2],['Kleid','word','rein',1],['Leid','word','rein',1]],
  leben:[['schweben','word','rein',2],['geben','word','rein',2],['daneben','word','rein',3],['erleben','word','rein',3],['nach den Sternen streben','phrase','rein',5],['eben','word','rein',2],['Regen','word','nah',2],['Segen','word','nah',2]],
  nation:[['station','word','rein',2,'en'],['creation','word','rein',3,'en'],['vibration','word','rein',3,'en'],['imagination','word','rein',5,'en'],['destination','word','rein',4,'en']],
  haut:[['laut','word','rein',1],['vertraut','word','rein',2],['gebaut','word','rein',2],['aufgetaut','word','rein',3]],
  wach:[['Dach','word','rein',1],['Bach','entity','rein',1],['danach','word','rein',2],['nach und nach','phrase','rein',3]],
});

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

export function getDemoSearchRows({
  query,
  scope='all',
  relation='all',
  resultLanguage='both',
  queryBasis='de',
}={}){
  const normalized=String(query||'').toLocaleLowerCase().trim();
  return (DEMO_RHYME_DATASETS[normalized]||[])
    .map((row,index)=>({
      word:row[0],
      kind:row[1],
      relation:row[2],
      relationType:row[2]==='rein'?'perfect':'slant',
      relationLabel:row[2]==='rein'?'Vollreim':'Naher Klang',
      syll:row[3],
      lang:row[4]||'de',
      id:`${normalized}-${index}`,
      score:null,
      raw:null,
    }))
    .filter((row)=>(
      (scope==='all'||scope===row.kind)
      &&(relation==='all'||relation===row.relation)
      &&(resultLanguage==='both'||resultLanguage===row.lang)
      &&(queryBasis==='both'||queryBasis===row.lang)
    ));
}

export function writerScope(scope){
  return ({word:'words',phrase:'phrases',entity:'entities'})[scope]||'all';
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
}={}){
  return new URLSearchParams({
    q:String(query||'').trim(),
    language:['de','en','both'].includes(queryBasis)?queryBasis:'de',
    result_language:['de','en','both'].includes(resultLanguage)?resultLanguage:'both',
    scope:writerScope(scope),
    word_limit:'250',
    word_pool:'800',
    phrase_limit:'250',
    phrase_pool:'512',
    phrase_per_channel:'128',
    entity_limit:'250',
    entity_pool:'512',
    entity_category:entityCategory||'all',
    variants:includeVariants?'all':'standard',
    historical:includeHistorical?'all':'current',
    generated:generated?'1':'0',
    generated_only:generatedOnly?'1':'0',
    type:'all',
  });
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

async function lookupSourceBackedWord(fetchImpl,surface,language,generated,signal){
  const params=new URLSearchParams({
    language,
    generated:generated?'1':'0',
  });
  const response=await fetchImpl(
    `/api/word/${encodeURIComponent(surface)}?${params}`,
    {signal,headers:{accept:'application/json'}},
  );
  if(!response.ok)return null;
  const detail=await readResponse(response);
  return detail?.preferredIpa?detail:null;
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
        lookupSourceBackedWord(fetchImpl,surface,referenceLanguage,generated,signal),
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
      const request=async()=>{
        const response=await fetchImpl(
          `/api/writer?${params}`,
          {signal:controller.signal,headers:{accept:'application/json'}},
        );
        return {response,data:await readResponse(response)};
      };

      let {response,data}=await request();
      const generatedPronunciation=await resolveMissingPronunciations({
        fetchImpl,
        data,
        params,
        query,
        queryBasis:options.queryBasis||'de',
        generated:options.generated===true,
        queryPronunciationRevision:options.queryPronunciationRevision||'',
        signal:controller.signal,
      });
      if(generatedPronunciation){
        ({response,data}=await request());
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

      const rows=(data?.results||[]).map(mapWriterResult).filter((row)=>row.word);
      return {
        status:'ready',
        rows,
        query:data?.query||null,
        queries:data?.queries||null,
        querySyllables:Number(data?.query?.syllableCount||0),
        warnings:Array.isArray(data?.warnings)?data.warnings:[],
        runtimeTiming:data?.runtimeTiming||null,
        capabilities:data?.capabilities||null,
        raw:data,
      };
    },
  };
}
