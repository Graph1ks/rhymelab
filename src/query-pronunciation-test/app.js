import {
  CLIENT_QUERY_PRONUNCIATION_POLICY,
  resolveUnknownClientPronunciation,
} from '/assets/query-pronunciation-client.mjs';
import {
  readGeneratedPronunciationCache,
  writeGeneratedPronunciationCache,
} from '/assets/query-pronunciation-cache.mjs';

const $=(selector)=>document.querySelector(selector);
const $$=(selector)=>[...document.querySelectorAll(selector)];
const sourceCache=new Map();
const missCache=new Set();
let pronunciationRevision=null;
const healthReady=fetch('/api/health')
  .then((response)=>response.ok?response.json():null)
  .then((health)=>{
    pronunciationRevision=health?.query_pronunciation_revision||null;
    return health;
  })
  .catch(()=>null);

function languagesFor(value){
  return value==='both'?['de','en']:[value];
}

function cacheKey(surface,language){
  return `${language}:${String(surface||'').normalize('NFKC').trim().toLocaleLowerCase(language==='de'?'de-DE':'en-US')}`;
}

async function lookupReference(surface,language){
  const key=cacheKey(surface,language);
  if(sourceCache.has(key))return sourceCache.get(key);
  if(missCache.has(key))return null;
  const response=await fetch(`/api/word/${encodeURIComponent(surface)}?language=${encodeURIComponent(language)}`);
  if(response.status===404){
    missCache.add(key);
    return null;
  }
  if(!response.ok)return null;
  const detail=await response.json();
  if(detail?.preferredIpa){
    sourceCache.set(key,detail);
    return detail;
  }
  return null;
}

function baseParams(query,language,resultLanguage){
  return new URLSearchParams({
    q:query,
    language,
    result_language:resultLanguage,
    scope:'all',
    type:'all',
    word_limit:'60',
    word_pool:'800',
    phrase_limit:'60',
    phrase_pool:'512',
    phrase_per_channel:'128',
    entity_limit:'60',
    entity_pool:'512',
  });
}

async function writerRequest(params){
  const response=await fetch(`/api/writer?${params}`);
  const data=await response.json();
  return {response,data};
}

function attachGenerated(params,language,detail){
  params.set(`query_ipa_${language}`,detail.ipa);
  params.set(`query_method_${language}`,detail.method);
  if(detail.sourceBacked)params.set(`query_source_backed_${language}`,'1');
  if(detail.components?.length){
    params.set(`query_components_${language}`,JSON.stringify(detail.components));
  }
}

function esc(value){
  return String(value??'').replace(/[&<>"']/g,(c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}

function renderLanguageCards(query,requested,data,generated){
  $('#languages').innerHTML=requested.map((language)=>{
    const resolved=data?.queries?.[language];
    const local=generated[language];
    const sourceBacked=resolved&&!resolved.generatedPronunciation;
    const method=sourceBacked
      ?'source-backed database pronunciation'
      :(resolved?.queryPronunciation?.method||local?.method||'unresolved');
    const ipa=resolved?.preferredIpa||local?.ipa||'—';
    const components=resolved?.queryPronunciation?.components||local?.components||[];
    return `<article class="card language-card">
      <div class="language-head"><strong>${language.toUpperCase()}</strong><span class="${sourceBacked?'source':'generated'}">${sourceBacked?'DB SOURCE':'BROWSER IPA'}</span></div>
      <h2>${esc(query)}</h2>
      <code>/${esc(ipa)}/</code>
      <dl>
        <div><dt>Method</dt><dd>${esc(method)}</dd></div>
        <div><dt>Generated locally</dt><dd>${sourceBacked?'No':'Yes'}</dd></div>
        <div><dt>Host executable</dt><dd>No</dd></div>
        <div><dt>Components</dt><dd>${components.length?esc(components.join(' + ')):'—'}</dd></div>
      </dl>
    </article>`;
  }).join('');
}

function renderResults(data){
  const rows=(data?.results||[]).slice(0,40);
  $('#searchMeta').textContent=`${data?.counts?.total??rows.length} loaded · status ${data?.status||'unknown'} · existing /api/writer pipeline`;
  $('#results').innerHTML=rows.length
    ?rows.map((row)=>`<div class="result"><strong>${esc(row.word||row.surface)}</strong><span>${esc(row.language||'')}</span><span>${esc(row.resultKind||'word')}</span><span>${esc(row.primaryType||row.type||'')}</span><span>${Math.round(Number(row.score||0)*100)}%</span></div>`).join('')
    :'<p>No result rows returned.</p>';
}

async function run(){
  await healthReady;
  const query=$('#query').value.trim();
  const language=$('#language').value;
  const resultLanguage=$('#resultLanguage').value;
  if(!query)return;

  const started=performance.now();
  $('#summary').textContent='Running existing DB lookup/search…';
  $('#languages').innerHTML='';
  $('#results').innerHTML='';
  const params=baseParams(query,language,resultLanguage);
  let {response,data}=await writerRequest(params);
  const requested=languagesFor(language);
  const generated={};

  for(const code of requested){
    if(data?.queries?.[code]?.preferredIpa)continue;
    generated[code]=await resolveUnknownClientPronunciation(query,code,{
      lookupReference,
      lookupCachedPronunciation:(surface,language)=>
        readGeneratedPronunciationCache({
          surface,
          language,
          policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
          databaseRevision:pronunciationRevision,
        }),
      storeCachedPronunciation:(detail)=>
        writeGeneratedPronunciationCache(detail,pronunciationRevision),
    });
    if(generated[code]?.ipa)attachGenerated(params,code,generated[code]);
  }

  if(Object.values(generated).some((row)=>row?.ipa)){
    ({response,data}=await writerRequest(params));
  }

  const elapsed=performance.now()-started;
  renderLanguageCards(query,requested,data,generated);
  renderResults(data);
  const cacheHits=Object.values(generated)
    .flatMap((row)=>row?.tokens||[row])
    .filter((row)=>row?.cacheHit).length;
  $('#summary').innerHTML=`<strong>${response.ok?'PASS':'FAIL'}</strong> · HTTP ${response.status} · ${elapsed.toFixed(1)} ms · local generation used for ${Object.keys(generated).length} language(s) · persistent cache hits ${cacheHits}.`;
}

$('#testForm').addEventListener('submit',(event)=>{
  event.preventDefault();
  run().catch((error)=>{
    $('#summary').textContent=`FAIL · ${error.message}`;
  });
});

$$('[data-word]').forEach((button)=>button.addEventListener('click',()=>{
  $('#query').value=button.dataset.word;
  run().catch((error)=>{$('#summary').textContent=`FAIL · ${error.message}`;});
}));
