import {
  MARKOV_GENERATOR_POLICY,
  generateMarkovCandidates,
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
let currentCandidates=[];
let currentPool=[];
let currentHero=null;

const PRESETS={
  balanced:{mode:'balanced',rhymePressure:62,naturalness:76,weirdness:34,targetTokens:10},
  rap:{mode:'internal',rhymePressure:82,naturalness:64,weirdness:43,targetTokens:12},
  chain:{mode:'chain',rhymePressure:88,naturalness:58,weirdness:48,targetTokens:13},
  natural:{mode:'balanced',rhymePressure:28,naturalness:94,weirdness:16,targetTokens:10},
  chaos:{mode:'mosaic',rhymePressure:94,naturalness:36,weirdness:92,targetTokens:15},
};

function esc(value){
  return String(value??'').replace(/[&<>"']/g,(char)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
}

function percentage(value){
  return `${Math.round(Number(value||0)*100)}%`;
}

function integerSeed(){
  try{
    const values=new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0]%1000000;
  }catch{
    return Date.now()%1000000;
  }
}

function languageLocale(language){
  return language==='de'?'de-DE':'en-US';
}

function cacheKey(surface,language){
  return `${language}:${String(surface||'').normalize('NFKC').trim().toLocaleLowerCase(languageLocale(language))}`;
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

function attachGeneratedQuery(params,language,detail){
  params.set(`query_ipa_${language}`,detail.ipa);
  params.set(`query_method_${language}`,detail.method);
  if(detail.sourceBacked)params.set(`query_source_backed_${language}`,'1');
  if(detail.components?.length){
    params.set(`query_components_${language}`,JSON.stringify(detail.components));
  }
}

function writerParams(target,settings){
  return new URLSearchParams({
    q:target,
    language:settings.language,
    result_language:settings.language,
    scope:'all',
    type:'all',
    word_limit:'140',
    word_pool:'1400',
    phrase_limit:settings.allowPhrases?'100':'1',
    phrase_pool:'700',
    phrase_per_channel:'160',
    entity_limit:settings.allowEntities?'100':'1',
    entity_pool:'700',
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
        surface,
        language,
        policy:CLIENT_QUERY_PRONUNCIATION_POLICY,
        databaseRevision:pronunciationRevision,
      }),
      storeCachedPronunciation:(detail)=>writeGeneratedPronunciationCache(detail,pronunciationRevision),
    });
    if(generated?.ipa){
      attachGeneratedQuery(params,settings.language,generated);
      ({response,data}=await writerRequest(params));
    }
  }
  if(!response.ok){
    const message=data?.error||data?.reason||`Writer request failed (${response.status})`;
    throw new Error(message);
  }
  const rows=(data?.results||[]).filter((row)=>{
    if(row?.resultKind==='phrase'&&!settings.allowPhrases)return false;
    if(row?.resultKind==='entity'&&!settings.allowEntities)return false;
    return true;
  });
  return {rows,data};
}

function settingsFromControls(){
  const seedText=$('#seedText').value.trim();
  const target=$('#target').value.trim()||seedText.split(/\s+/u).filter(Boolean).at(-1)||'Arbeitsweise';
  return {
    seedText,
    target,
    language:$('#language').value==='en'?'en':'de',
    mode:$('#mode').value,
    rhymePressure:Number($('#rhymePressure').value),
    naturalness:Number($('#naturalness').value),
    weirdness:Number($('#weirdness').value),
    targetTokens:Number($('#targetTokens').value),
    allowEntities:$('#allowEntities').checked,
    allowPhrases:$('#allowPhrases').checked,
    allowGenerated:generatedAvailable&&$('#allowGenerated').checked,
    seed:Number($('#randomSeed').value)||0,
  };
}

function updateRangeLabel(id,value){
  const output=document.querySelector(`[data-range-value="${id}"]`);
  if(!output)return;
  output.textContent=id==='targetTokens'?`${value} tok`:`${value}%`;
}

function applyPreset(name){
  const preset=PRESETS[name];
  if(!preset)return;
  for(const [key,value] of Object.entries(preset)){
    const control=document.getElementById(key);
    if(!control)continue;
    control.value=String(value);
    if(control.type==='range')updateRangeLabel(key,value);
  }
  document.querySelectorAll('[data-preset]').forEach((button)=>{
    button.classList.toggle('active',button.dataset.preset===name);
  });
}

function setBusy(busy){
  $('#generateButton').disabled=busy;
  $('#rerollSeed').disabled=busy;
  document.documentElement.dataset.markovState=busy?'generating':'ready';
}

function setStatus(message,tone='neutral'){
  const status=$('#status');
  status.textContent=message;
  status.dataset.tone=tone;
}

function randomSurface(pool,index){
  if(!pool.length)return ['tick','tack','reim','peng'][index%4];
  const row=pool[(index*17+7)%pool.length];
  return row?.surface||row?.word||'...';
}

function delay(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}

async function runSlotMachine(pool){
  const stage=$('#sentenceStage');
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduce)return;
  stage.innerHTML=`<div class="machine" aria-hidden="true"><span class="machine-label">MARKOV IS COOKING</span><strong id="machineWord">${esc(randomSurface(pool,0))}</strong><div class="machine-dots"><i></i><i></i><i></i></div></div>`;
  stage.classList.add('is-cooking');
  for(let index=1;index<=7;index+=1){
    await delay(55+index*5);
    const word=$('#machineWord');
    if(word)word.textContent=randomSurface(pool,index);
  }
  stage.classList.remove('is-cooking');
}

function tokenMarkup(token,index){
  const label=token.kind==='structure'?'glue':token.kind;
  return `<span class="sentence-token token-${esc(token.kind)}" style="--i:${index}" title="${esc(label)}">${esc(token.text)}</span>`;
}

function scoreBar(label,value){
  const percent=Math.round(Number(value||0)*100);
  return `<div class="score-row"><span>${esc(label)}</span><div class="score-track"><i style="--score:${percent}%"></i></div><strong>${percent}</strong></div>`;
}

function sourceBadges(candidate){
  const counts=candidate.sourceCounts||{};
  const badges=[];
  if(counts.word)badges.push(`<span>WORDS ${counts.word}</span>`);
  if(counts.phrase)badges.push(`<span>PHRASES ${counts.phrase}</span>`);
  if(counts.entity)badges.push(`<span>ENTITIES ${counts.entity}</span>`);
  if(counts.generated)badges.push(`<span>GENERATED ${counts.generated}</span>`);
  badges.push(`<span>SEED ${candidate.seed}</span>`);
  return badges.join('');
}

function renderHero(candidate,{animate=true}={}){
  currentHero=candidate;
  const stage=$('#sentenceStage');
  const tokens=candidate.tokens.map(tokenMarkup).join(' ');
  stage.innerHTML=`
    <div class="stage-orbit" aria-hidden="true"><span>✦</span><span>~</span><span>♪</span></div>
    <div class="hero-kicker"><span>#${candidate.rank}</span><span>${esc(candidate.mode.toUpperCase())}</span><span>${esc(MARKOV_GENERATOR_POLICY)}</span></div>
    <blockquote class="hero-sentence ${animate?'animate-in':''}" aria-label="Generated Markov sentence">${tokens}<span class="sentence-punctuation">.</span></blockquote>
    <div class="hero-bottom">
      <div class="source-badges">${sourceBadges(candidate)}</div>
      <button id="copySentence" class="ghost-button" type="button">COPY LINE</button>
    </div>
    <div class="score-grid">
      ${scoreBar('Utility',candidate.scores.utility)}
      ${scoreBar('Natural',candidate.scores.naturalness)}
      ${scoreBar('Rhyme',candidate.scores.rhyme)}
      ${scoreBar('Assonance chain',candidate.scores.assonanceChain)}
      ${scoreBar('Internal',candidate.scores.internalRhyme)}
      ${scoreBar('Length fit',candidate.scores.lengthFit)}
    </div>`;
  $('#copySentence')?.addEventListener('click',async()=>{
    try{
      await navigator.clipboard?.writeText(candidate.sentence);
      $('#copySentence').textContent='COPIED ✓';
      setTimeout(()=>{if($('#copySentence'))$('#copySentence').textContent='COPY LINE';},900);
    }catch{
      setStatus('Clipboard unavailable — select the sentence manually.','warn');
    }
  });
}

function renderCandidateList(candidates){
  $('#resultList').innerHTML=candidates.map((candidate)=>`
    <button class="candidate-card ${candidate.rank===1?'active':''}" type="button" data-candidate-id="${esc(candidate.id)}">
      <span class="candidate-rank">${candidate.rank}</span>
      <span class="candidate-copy">${esc(candidate.sentence)}</span>
      <span class="candidate-score">${percentage(candidate.scores.utility)}</span>
      <span class="candidate-mini">R ${percentage(candidate.scores.rhyme)} · N ${percentage(candidate.scores.naturalness)}</span>
    </button>`).join('');
  document.querySelectorAll('[data-candidate-id]').forEach((button)=>{
    button.addEventListener('click',()=>{
      const candidate=currentCandidates.find((row)=>row.id===button.dataset.candidateId);
      if(!candidate)return;
      document.querySelectorAll('[data-candidate-id]').forEach((row)=>row.classList.toggle('active',row===button));
      renderHero(candidate,{animate:true});
      $('#sentenceStage').scrollIntoView?.({behavior:'smooth',block:'nearest'});
    });
  });
}

function renderPoolStats(pool,data){
  const summary=summarizePool(pool);
  const meta=$('#poolStats');
  meta.innerHTML=`
    <span><b>${summary.total}</b> candidates</span>
    <span><b>${summary.word}</b> words</span>
    <span><b>${summary.phrase}</b> phrases</span>
    <span><b>${summary.entity}</b> entities</span>
    <span><b>${Math.round(Number(data?.runtimeTiming?.searchMs||0))}</b> ms lookup</span>`;
}

async function generate(){
  const settings=settingsFromControls();
  setBusy(true);
  setStatus('Pulling phonetic candidates from RhymeLab…','busy');
  $('#uiError').hidden=true;
  try{
    const {rows,data}=await fetchCandidatePool(settings.target,settings);
    currentPool=rows;
    if(rows.length<2)throw new Error('Too few RhymeLab candidates for generation. Try another rhyme target.');
    renderPoolStats(rows,data);
    await runSlotMachine(rows);
    currentCandidates=generateMarkovCandidates({
      rows,
      ...settings,
      count:8,
      attempts:48,
    });
    if(!currentCandidates.length)throw new Error('The constrained generator could not build a valid sentence from this pool.');
    renderHero(currentCandidates[0],{animate:true});
    renderCandidateList(currentCandidates);
    setStatus(`Generated ${currentCandidates.length} deterministic variants from ${rows.length} live RhymeLab candidates.`,'ok');
  }catch(error){
    $('#uiError').hidden=false;
    $('#uiError').textContent=error instanceof Error?error.message:String(error);
    setStatus('Generation failed.','error');
    $('#sentenceStage').innerHTML='<div class="empty-stage"><span>¯\\_(ツ)_/¯</span><strong>MARKOV DROPPED THE MIC</strong><p>Change the target or disable a strict option and try again.</p></div>';
  }finally{
    setBusy(false);
  }
}

function reroll(){
  $('#randomSeed').value=String(integerSeed());
  generate().catch(()=>{});
}

async function initialize(){
  try{
    const healthResponse=await fetch('/api/health');
    const health=healthResponse.ok?await healthResponse.json():null;
    pronunciationRevision=health?.query_pronunciation_revision||null;
    generatedAvailable=Boolean(health?.generated_optin?.available);
    const generated=$('#allowGenerated');
    generated.disabled=!generatedAvailable;
    if(!generatedAvailable)generated.checked=false;
    $('#generatedHint').textContent=generatedAvailable?'available':'not available in this runtime';

    const controls=installMarkovControls(document,{
      generate:()=>generate().catch(()=>{}),
      reroll,
      rangeChange:updateRangeLabel,
      optionChange:()=>{},
      preset:applyPreset,
    });
    for(const id of ['rhymePressure','naturalness','weirdness','targetTokens']){
      const control=document.getElementById(id);
      updateRangeLabel(id,control.value);
    }
    controls.randomSeed.value=String(integerSeed());
    applyPreset('balanced');
    setStatus('Ready. Pick a target and make Markov misbehave responsibly.','ok');
  }catch(error){
    document.documentElement.dataset.rhymelabControls='failed';
    $('#uiError').hidden=false;
    $('#uiError').textContent=`UI initialization failed: ${error instanceof Error?error.message:String(error)}`;
    console.error(error);
  }
}

initialize();
