import {
  MARKOV_GENERATOR_POLICY,
  compactWriterRows,
  summarizePool,
} from '/markov-test/markov-core.mjs';
import {installMarkovControls} from '/markov-test/markov-controls.mjs';
import {
  CLIENT_QUERY_PRONUNCIATION_POLICY,
  resolveUnknownClientPronunciation,
} from '/assets/query-pronunciation-client.mjs';
import {
  readGeneratedPronunciationCache,
  writeGeneratedPronunciationCache,
} from '/assets/query-pronunciation-cache.mjs';

const $=(selector)=>document.querySelector(selector);
const sourceCache=new Map();
const missCache=new Set();
let pronunciationRevision=null;
let generatedAvailable=false;
let markovHealth=null;
let currentCandidates=[];
let currentPool=[];
let currentHero=null;

const PRESETS={
  balanced:{mode:'balanced',rhymePressure:62,naturalness:82,weirdness:28,targetTokens:10},
  rap:{mode:'internal',rhymePressure:84,naturalness:72,weirdness:38,targetTokens:12},
  chain:{mode:'chain',rhymePressure:88,naturalness:68,weirdness:44,targetTokens:13},
  natural:{mode:'balanced',rhymePressure:34,naturalness:96,weirdness:10,targetTokens:10},
  chaos:{mode:'mosaic',rhymePressure:94,naturalness:38,weirdness:92,targetTokens:15},
};

function esc(value){
  return String(value??'').replace(/[&<>"']/g,(char)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
}
function percentage(value){return `${Math.round(Number(value||0)*100)}%`;}
function integerSeed(){
  try{const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]%1000000;}
  catch{return Date.now()%1000000;}
}
function languageLocale(language){return language==='de'?'de-DE':'en-US';}
function cacheKey(surface,language){return `${language}:${String(surface||'').normalize('NFKC').trim().toLocaleLowerCase(languageLocale(language))}`;}

async function lookupReference(surface,language){
  const key=cacheKey(surface,language);
  if(sourceCache.has(key))return sourceCache.get(key);
  if(missCache.has(key))return null;
  const response=await fetch(`/api/word/${encodeURIComponent(surface)}?language=${encodeURIComponent(language)}`);
  if(response.status===404){missCache.add(key);return null;}
  if(!response.ok)return null;
  const detail=await response.json();
  if(detail?.preferredIpa){sourceCache.set(key,detail);return detail;}
  return null;
}

function attachGeneratedQuery(params,language,detail){
  params.set(`query_ipa_${language}`,detail.ipa);
  params.set(`query_method_${language}`,detail.method);
  if(detail.sourceBacked)params.set(`query_source_backed_${language}`,'1');
  if(detail.components?.length)params.set(`query_components_${language}`,JSON.stringify(detail.components));
}

function writerParams(target,settings){
  return new URLSearchParams({
    q:target,
    language:settings.language,
    result_language:settings.language,
    scope:'all',
    type:'all',
    word_limit:'180',
    word_pool:'1800',
    phrase_limit:settings.allowPhrases?'120':'1',
    phrase_pool:'900',
    phrase_per_channel:'180',
    entity_limit:settings.allowEntities?'120':'1',
    entity_pool:'900',
    generated:settings.allowGenerated?'1':'0',
  });
}

async function writerRequest(params){
  const response=await fetch(`/api/writer?${params}`);
  let data={};
  try{data=await response.json();}catch{}
  return {response,data};
}

async function fetchCandidatePool(target,settings){
  const params=writerParams(target,settings);
  let {response,data}=await writerRequest(params);
  const hasQuery=Boolean(data?.queries?.[settings.language]?.preferredIpa);
  if(!hasQuery){
    const generated=await resolveUnknownClientPronunciation(target,settings.language,{
      lookupReference,
      lookupCachedPronunciation:(surface,language)=>readGeneratedPronunciationCache({
        surface,language,policy:CLIENT_QUERY_PRONUNCIATION_POLICY,databaseRevision:pronunciationRevision,
      }),
      storeCachedPronunciation:(detail)=>writeGeneratedPronunciationCache(detail,pronunciationRevision),
    });
    if(generated?.ipa){attachGeneratedQuery(params,settings.language,generated);({response,data}=await writerRequest(params));}
  }
  if(!response.ok)throw new Error(data?.error||data?.reason||`Writer request failed (${response.status})`);
