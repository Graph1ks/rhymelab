
import {$,queryAll,esc,icon,clamp} from './studio-core.mjs';
import {STUDIO_DEMO_LINES,loadStudioState,writeStudioState} from './document-adapter.mjs';
import {createWriterSearchClient,estimateSyllables} from './search-adapter.mjs';
import {STUDIO_RHYME_TYPE_LABELS,filterStudioWriterRows,sortStudioWriterRows} from './search-filters.mjs';
import {SEARCH_STATE_STORAGE_KEY,createSearchState,loadSearchState,saveSearchState} from './search-state.mjs';
import {nextDensity,normalizeDensity,setExclusivePressed} from './studio-controls.mjs';
import {loadStudioCapabilities} from './capability-adapter.mjs';
import {buildStudioDetailModel,createStudioDetailClient,studioDetailKey} from './detail-adapter.mjs';
import {barIdentity,createSelectionProof,editorSnapshot,ensureEditorSong,mergeEditorBarWithPrevious,pasteEditorText,removeEditorBar,restoreEditorSnapshot,setEditorBarText,splitEditorBar,validateSelectionProof} from './editor-session.mjs';
import {createStudioDocumentStore,migrateLegacyStudioStateToStore,shadowLegacyStudioStateToStore} from './document-store.mjs';

'use strict';
const initial=STUDIO_DEMO_LINES;
let state=loadStudioState();
state.customThemes=Array.isArray(state.customThemes)?state.customThemes:[];
state.themeSlots=state.themeSlots&&typeof state.themeSlots==='object'?{light:state.themeSlots.light||null,dark:state.themeSlots.dark||null}:{light:null,dark:null};
if(!['light','dark'].includes(state.theme)&&!state.customThemes.some(theme=>theme.id===state.theme))state.theme='dark';

const STUDIO_BUILTIN_THEMES={
  light:{
    id:'light',name:'Light',subtitle:'Warm Atelier',mode:'light',
    colors:{bg:'#EAE7DC',panel:'#F4F0E6',ink:'#272727',muted:'#6B6965',line:'#D8C3A5',accent:'#E85A4F',accent2:'#E98074',signal:'#8E8D8A',nav:'#E3DCCF',tint:'#F1D5CE',onAccent:'#171717'}
  },
  dark:{
    id:'dark',name:'Dark',subtitle:'Signal Noir',mode:'dark',
    colors:{bg:'#272727',panel:'#303030',ink:'#F5F4EC',muted:'#A3A3A3',line:'#474747',accent:'#FFE400',accent2:'#FF652F',signal:'#14A76C',nav:'#232323',tint:'#3A3823',onAccent:'#272727'}
  }
};
const THEME_COLOR_FIELDS=[
  ['bg','Background'],['panel','Surface'],['ink','Text'],['muted','Muted'],
  ['accent','Primary'],['accent2','Secondary'],['signal','Signal']
];
let themeEditingId='',themePreviewing=false;
let studioCapabilities={status:'loading'};
let sharedSearchState=localStorage.getItem(SEARCH_STATE_STORAGE_KEY)?loadSearchState():createSearchState({queryBasis:'de',resultLanguage:'both'}),pendingSharedResultId=sharedSearchState.selectedResultId||'';
const writerSearch=createWriterSearchClient();
const detailClient=createStudioDetailClient();
const documentStore=createStudioDocumentStore();
let writerRows=[],writerStatus='idle',writerError='',writerQuerySyllables=0,writerWarnings=[],writerRuntimeTiming=null,writerCapabilities=null,writerDebounce=0;
let selectedDetail=null,selectedDetailStatus='idle',selectedDetailError='',detailRequest=0;
let documentStoreStatus='idle',documentStoreError='',documentStoreInitialized=false,documentShadowTimer=0;
let activeLine=3,selection={line:3,start:initial[3].lastIndexOf('Nacht'),end:initial[3].length},mode='write',page='studio',
  query=sharedSearchState.anchor||'Nacht',
  scope=({words:'word',phrases:'phrase',entities:'entity'})[sharedSearchState.scope]||'all',
  relation='all',
  rhymeType=sharedSearchState.rhymeType,
  variantMode=sharedSearchState.variantMode,
  entityCategory=sharedSearchState.entityCategory,
  includeHistorical=sharedSearchState.historical,
  generated=sharedSearchState.generated,
  generatedOnly=sharedSearchState.generatedOnly,
  advancedExpanded=false,
  hideUsed=state.hideUsed!==false,
  hiddenUsedCount=0,
  sort=sharedSearchState.sort,
  basis=sharedSearchState.queryBasis,
  resultLang=sharedSearchState.resultLanguage,
  pageSize=6,auto=false,pauseUntil=0,scrollFrame=0,lastFrame=0,undo=[],redo=[],composingBarId='',compositionCommitBarId='',compositionCommitValue='',saveTimer,toastTimer,playing=false,tick=0,playTimer,cue='hit',bpm=92,audioContext;
function saveStudioSearchState(overrides={}){
  sharedSearchState=createSearchState({
    ...sharedSearchState,
    anchor:query,
    queryBasis:basis,
    resultLanguage:resultLang,
    scope,
    rhymeType,
    syllableFilter:syllableMode||sharedSearchState.syllableFilter,
    sort,
    variantMode,
    historical:includeHistorical,
    generated,
    generatedOnly,
    entityCategory,
    selectedResultId:selectedResultId||'',
    ...overrides,
  });
  saveSearchState(sharedSearchState);
  return sharedSearchState;
}
function syncFollowControls(){
  $('#followBtn')?.setAttribute('aria-pressed',String(followSelection));
  if($('#followBtn'))$('#followBtn').textContent=followSelection?'↗ Auswahl folgen':'⌖ Anker fixiert';
  $('#pinAnchor')?.setAttribute('aria-pressed',String(!followSelection));
  if($('#pinAnchor'))$('#pinAnchor').textContent=followSelection?'⌖ Fixieren':'⌖ Fixiert';
  if($('#anchorLive'))$('#anchorLive').textContent=followSelection?'FOLGT DEINER AUSWAHL':'ANKER FIXIERT';
}
function song(){
  const current=state.songs.find((item)=>item.id===state.active)||state.songs[0];
  return ensureEditorSong(current);
}
const syll=estimateSyllables;
function documentStoreDetail(){
  if(documentStoreStatus==='ready')return 'IndexedDB · Shadow verifiziert';
  if(documentStoreStatus==='saving')return 'IndexedDB · synchronisiert …';
  if(documentStoreStatus==='unsupported')return 'nicht verfügbar · LocalStorage bleibt aktiv';
  if(documentStoreStatus==='error')return documentStoreError||'Fehler';
  return 'wird vorbereitet';
}
function queueDocumentShadow(delay=220){
  if(!documentStoreInitialized)return;
  clearTimeout(documentShadowTimer);
  documentShadowTimer=setTimeout(()=>{void syncDocumentShadow()},delay);
}
async function syncDocumentShadow(){
  if(!documentStoreInitialized)return;
  documentStoreStatus='saving';updateCapabilitySurface();
  try{
    await shadowLegacyStudioStateToStore(state,documentStore);
    documentStoreStatus='ready';documentStoreError='';
  }catch(error){
    documentStoreStatus='error';
    documentStoreError=error instanceof Error?error.message:String(error);
  }
  updateCapabilitySurface();
}
async function initializeDocumentStore(){
  try{
    const available=await documentStore.available();
    if(!available){
      documentStoreStatus='unsupported';
      updateCapabilitySurface();
      return;
    }
    documentStoreStatus='saving';updateCapabilitySurface();
    await migrateLegacyStudioStateToStore(state,documentStore);
    documentStoreInitialized=true;
    documentStoreStatus='ready';documentStoreError='';
  }catch(error){
    documentStoreStatus='error';
    documentStoreError=error instanceof Error?error.message:String(error);
  }
  updateCapabilitySurface();
}
function persist(){try{writeStudioState(state);$('#saveState').textContent='Lokal gespeichert';queueDocumentShadow();return true}catch(e){$('#saveState').textContent='Speichern nicht möglich · bitte exportieren';return false}}
function updateUndoRedoButtons(){
  const undoButton=$('#undoBtn'),redoButton=$('#redoBtn');
  if(undoButton){undoButton.disabled=undo.length===0;undoButton.setAttribute('aria-disabled',String(undo.length===0))}
  if(redoButton){redoButton.disabled=redo.length===0;redoButton.setAttribute('aria-disabled',String(redo.length===0))}
}
function pushUndo(){
  undo.push(editorSnapshot(song()));
  if(undo.length>80)undo.shift();
  redo.length=0;
  updateUndoRedoButtons();
}
function performUndo(){
  if(!undo.length){notify('Keine Änderung zum Rückgängigmachen.');return}
  const s=song();
  redo.push(editorSnapshot(s));
  const previous=undo.pop();
  restoreEditorSnapshot(s,previous);
  activeLine=Math.min(activeLine,s.lines.length-1);
  selection={line:activeLine,start:0,end:0};
  renderEditor();
  focusLine(activeLine);
  changed();
  updateUndoRedoButtons();
  notify('Änderung rückgängig gemacht.');
}
function performRedo(){
  if(!redo.length){notify('Keine Änderung zum Wiederholen.');return}
  const s=song();
  undo.push(editorSnapshot(s));
  const next=redo.pop();
  restoreEditorSnapshot(s,next);
  activeLine=Math.min(activeLine,s.lines.length-1);
  selection={line:activeLine,start:0,end:0};
  renderEditor();
  focusLine(activeLine);
  changed();
  updateUndoRedoButtons();
  notify('Änderung wiederholt.');
}
function revision(){const s=song();s.revisions=s.revisions||[];const text=s.lines.join('\n');if(s.revisions.at(-1)?.text!==text){s.revisions.push({at:Date.now(),text});s.revisions=s.revisions.slice(-30)}}
function changed(){ $('#saveState').textContent='Speichert …';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{revision();persist()},650);updateStats() }
function notify(t){$('#toast').textContent=t;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3300)}
function resizeArea(el){el.style.height='34px';el.style.height=el.scrollHeight+'px'}
function renderEditor(){
  const s=song();
  $('#songTitle').textContent=s.title;
  $('#lyrics').innerHTML=s.lines.map((line,index)=>{
    const bar=barIdentity(s,index);
    return `<div class="lyric-line ${index===activeLine?'active':''}" data-bar-id="${esc(bar.id)}"><button class="line-no" data-line="${index}" data-bar-id="${esc(bar.id)}" aria-label="Bar ${index+1} auswählen">${String(index+1).padStart(2,'0')}</button><textarea aria-label="Text Bar ${index+1}" data-line="${index}" data-bar-id="${esc(bar.id)}" data-bar-revision="${bar.revision}" rows="1" spellcheck="false">${esc(line)}</textarea><span class="syllable" title="Grobe Silbenschätzung der Demo">${syll(line)||'—'}</span></div>`;
  }).join('');
  queryAll('#lyrics textarea').forEach((el)=>{
    resizeArea(el);
    el.addEventListener('focus',()=>activateLine(+el.dataset.line));
    el.addEventListener('compositionstart',()=>{
      if(composingBarId)return;
      compositionCommitBarId='';compositionCommitValue='';
      pushUndo();
      composingBarId=el.dataset.barId;
    });
    el.addEventListener('compositionend',()=>{
      const index=+el.dataset.line;
      const bar=setEditorBarText(song(),index,el.value);
      if(bar){
        el.value=bar.text;
        el.dataset.barRevision=String(bar.revision);
      }
      composingBarId='';
      compositionCommitBarId=el.dataset.barId;compositionCommitValue=el.value;
      el.parentElement.querySelector('.syllable').textContent=syll(el.value)||'—';
      resizeArea(el);
      changed();
      captureSelection(el);
    });
    el.addEventListener('input',(event)=>{
      const index=+el.dataset.line;
      const trailingCompositionCommit=compositionCommitBarId===el.dataset.barId&&compositionCommitValue===el.value;
      if(trailingCompositionCommit){compositionCommitBarId='';compositionCommitValue=''}
      else if(!event.isComposing&&composingBarId!==el.dataset.barId)pushUndo();
      const bar=setEditorBarText(song(),index,el.value);
      if(bar){
        if(el.value!==bar.text)el.value=bar.text;
        el.dataset.barRevision=String(bar.revision);
      }
      el.parentElement.querySelector('.syllable').textContent=syll(el.value)||'—';
      resizeArea(el);
      if(!trailingCompositionCommit&&!event.isComposing&&composingBarId!==el.dataset.barId)changed();
    });
    ['click','keyup','select'].forEach((eventName)=>el.addEventListener(eventName,()=>{
      if(composingBarId!==el.dataset.barId)captureSelection(el);
    }));
    el.addEventListener('paste',(event)=>{
      const clipboard=event.clipboardData?.getData('text/plain');
      if(clipboard==null)return;
      event.preventDefault();
      pushUndo();
      const index=+el.dataset.line;
      const result=pasteEditorText(song(),index,el.selectionStart,el.selectionEnd,clipboard);
      if(!result)return;
      activeLine=result.focusIndex;
      renderEditor();
      focusLine(result.focusIndex,result.selectionStart);
      changed();
    });
    el.addEventListener('keydown',(event)=>{
      if(event.isComposing||composingBarId===el.dataset.barId)return;
      const index=+el.dataset.line;
      if(event.key==='Enter'){
        event.preventDefault();
        pushUndo();
        const split=splitEditorBar(song(),index,el.selectionStart,el.selectionEnd);
        if(!split)return;
        activeLine=index+1;
        renderEditor();
        focusLine(activeLine,0);
        changed();
        return;
      }
      if(event.key==='Backspace'&&el.selectionStart===0&&el.selectionEnd===0&&index>0){
        event.preventDefault();
        pushUndo();
        const merged=mergeEditorBarWithPrevious(song(),index);
        if(!merged)return;
        activeLine=merged.index;
        renderEditor();
        focusLine(activeLine,merged.caret);
        changed();
        return;
      }
      if(event.key==='Backspace'&&!el.value&&song().lines.length>1&&index===0){
        event.preventDefault();
        pushUndo();
        removeEditorBar(song(),0);
        activeLine=0;
        renderEditor();
        focusLine(0,0);
        changed();
      }
    });
  });
  queryAll('.line-no').forEach((el)=>el.onclick=()=>focusLine(+el.dataset.line));
  updateStats();
  renderProjects();
  updateUndoRedoButtons();
}
function focusLine(index,pos){
  const el=$(`#lyrics textarea[data-line="${index}"]`);
  if(el){
    el.focus();
    const caret=pos??el.value.length;
    el.setSelectionRange(caret,caret);
    captureSelection(el);
  }
}
function activateLine(index){
  activeLine=index;
  queryAll('.lyric-line').forEach((el,n)=>el.classList.toggle('active',n===index));
  $('#activeBarLabel').textContent=`Bar ${String(index+1).padStart(2,'0')} ausgewählt`;
  $('#mobileAnchor').textContent=`Bar ${index+1}: ${song().lines[index]||'Neue Zeile'}`;
}
function captureSelection(el){
  if(composingBarId===el.dataset.barId)return;
  const index=+el.dataset.line,text=el.value;
  let start=el.selectionStart,end=el.selectionEnd;
  if(start===end){
    while(start>0&&/[\p{L}\p{N}'’-]/u.test(text[start-1]))start--;
    while(end<text.length&&/[\p{L}\p{N}'’-]/u.test(text[end]))end++;
  }
  const bar=barIdentity(song(),index);
  selection={line:index,barId:bar?.id||'',barRevision:bar?.revision||0,start,end};
  const q=text.slice(start,end).trim();
  if(q&&q!==query){query=q;pageSize=6;queueWriterSearch()}
  activateLine(index);
}
function updateStats(){const s=song();const words=s.lines.join(' ').trim().split(/\s+/).filter(Boolean).length;$('#docStats').textContent=`${s.lines.length} Bars · ${words} Wörter`;$('#footerStats').textContent=`${s.lines.length} Bars · ${words} Wörter · Silben ≈ Demo-Schätzung`;$('#miniDensity').innerHTML=s.lines.slice(0,16).map(x=>`<i style="height:${Math.max(3,syll(x)*1.5)}px"></i>`).join('');$('#savedCount').textContent=state.saved.length;activateLine(Math.min(activeLine,s.lines.length-1))}
function normalizeCandidateSurface(value){
  return String(value||'').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/g,' ').trim();
}
function lyricWordSet(){
  return new Set(
    (song().lines.join(' ').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[])
      .map(normalizeCandidateSurface)
      .filter(Boolean),
  );
}
function writerRowAlreadyUsed(row,words,normalizedLyrics){
  const candidate=normalizeCandidateSurface(row.word);
  if(!candidate)return true;
  if(row.kind==='phrase'||row.kind==='entity')return normalizedLyrics.includes(candidate);
  return words.has(candidate);
}
function filterUnusedWriterRows(rows){
  hiddenUsedCount=0;
  if(!hideUsed||!rows.length)return rows;
  const words=lyricWordSet(),normalizedLyrics=normalizeCandidateSurface(song().lines.join('\n'));
  const unused=rows.filter((row)=>!writerRowAlreadyUsed(row,words,normalizedLyrics));
  hiddenUsedCount=rows.length-unused.length;
  return unused;
}
function data(){
  return writerRows.filter((row)=>
    (scope==='all'||scope===row.kind)
    &&(relation==='all'||relation===row.relation)
  );
}
function resultHTML(r){const saved=state.saved.some(s=>s.word===r.word);return `<div class="result"><div class="grow"><button class="result-word" data-detail="${esc(r.word)}">${esc(r.word)}</button><div class="result-meta"><b>${esc(r.relationLabel||'Klangtreffer')}</b><span>${r.syll||'—'} Silb.</span><span>${r.kind==='word'?'Wort':r.kind==='phrase'?'Phrase':'Name'} · ${r.lang.toUpperCase()}</span></div></div><div class="result-actions"><button data-save="${esc(r.word)}" class="${saved?'saved':''}" aria-pressed="${saved}" aria-label="${esc(r.word)} ${saved?'entmerken':'merken'}">${icon('book')}</button><button data-insert="${esc(r.word)}" aria-label="${esc(r.word)} einsetzen">${icon('plus')}</button></div></div>`}
function renderResults(){
  const rows=sortStudioWriterRows(data(),{sort,rhymeType,querySyllables:writerQuerySyllables||syll(query),locale:basis==='en'?'en':'de'});
  $('#anchorWord').textContent=query;
  $('#languageBtn').textContent=(basis==='both'?'DE+EN':basis.toUpperCase())+' ↓';
  $('#anchorSub').textContent=writerStatus==='loading'
    ?'Live Writer · Suche läuft …'
    :writerStatus==='error'
      ?'Live Writer · Runtime-Fehler'
      :'Live Writer · lokale Datenbank';
  if(writerStatus==='loading'){
    $('#resultCount').textContent='Suche …';
    $('#results').innerHTML='<div class="empty writer-loading">Writer durchsucht Wörter, Phrasen und Entities …</div>';
  }else if(writerStatus==='error'){
    $('#resultCount').textContent='Nicht verfügbar';
    $('#results').innerHTML='<div class="empty writer-error">'+esc(writerError||'Writer-Suche fehlgeschlagen.')+'<br><br><button class="outline" data-retry-writer>Erneut versuchen</button></div>';
  }else if(writerStatus==='idle'){
    $('#resultCount').textContent='Bereit';
    $('#results').innerHTML='<div class="empty">Live Writer wird vorbereitet …</div>';
  }else{
    $('#resultCount').textContent=rows.length+' Treffer';
    $('#results').innerHTML=rows.length
      ?rows.slice(0,pageSize).map(resultHTML).join('')
      :'<div class="empty">Keine passenden Writer-Treffer für „'+esc(query)+'“ und diese Filter.</div>';
  }
  $('#moreBtn').classList.toggle('hidden',writerStatus!=='ready'||rows.length<=pageSize);
  $('#announcer').textContent=writerStatus==='ready'
    ?rows.length+' Writer-Treffer für '+query
    :writerStatus==='loading'
      ?'Writer-Suche läuft'
      :'Writer-Suche nicht verfügbar';
  $('#filterLabel').textContent=(relation!=='all'||sort!=='recommended'||resultLang!=='both')?'Filter aktiv':'Filter & Aussprache';
}
function queueWriterSearch(delay=140){
  clearTimeout(writerDebounce);
  writerSearch.cancel();
  writerDebounce=setTimeout(()=>{void refreshWriterResults()},delay);
}
async function refreshWriterResults(){
  clearTimeout(writerDebounce);
  saveStudioSearchState();
  const requestedQuery=String(query||'').trim();
  if(!requestedQuery){
    writerRows=[];
    writerStatus='idle';
    writerError='';
    renderResults();
    return;
  }
  writerStatus='loading';
  writerError='';
  selectedResult='';selectedResultId='';
  selectedDetail=null;selectedDetailStatus='idle';selectedDetailError='';detailClient.cancel();
  $('#detailDock')?.classList.add('hidden');
  renderResults();
  try{
    const result=await writerSearch.search({
      query:requestedQuery,
      queryBasis:basis,
      resultLanguage:resultLang,
      scope,
      rhymeType,
      includeVariants:variantMode==='all',
      includeHistorical,
      generated,
      generatedOnly,
      entityCategory,
      queryPronunciationRevision:studioCapabilities.queryPronunciationRevision||'',
    });
    if(requestedQuery!==query)return;
    writerRows=result.rows;
    writerQuerySyllables=result.querySyllables;
    writerWarnings=result.warnings;
    writerRuntimeTiming=result.runtimeTiming;
    writerCapabilities=result.capabilities||writerCapabilities;
    writerStatus='ready';
    pageSize=density==='compact'?24:12;
    renderResults();
    if(pendingSharedResultId){
      const restored=writerRows.find((row)=>row.id===pendingSharedResultId);
      pendingSharedResultId='';
      if(restored)openDetail(restored.word,restored.id);
    }
  }catch(error){
    if(error?.name==='AbortError')return;
    writerRows=[];
    writerQuerySyllables=0;
    writerWarnings=[];
    writerRuntimeTiming=null;
    writerStatus='error';
    writerError=error instanceof Error?error.message:String(error);
    renderResults();
  }
}

function insertWord(word){const s=song();const {line,start,end}=selection;if(!s.lines[line]&&s.lines[line]!==''){notify('Bitte zuerst eine Textstelle auswählen.');return}pushUndo();const source=s.lines[line];const bar=setEditorBarText(s,line,source.slice(0,start)+word+source.slice(end));selection={line,barId:bar?.id||'',barRevision:bar?.revision||0,start,end:start+word.length};activeLine=line;renderEditor();changed();navigate('studio');setMode('write');const el=$(`#lyrics textarea[data-line="${line}"]`);el.focus();el.setSelectionRange(start,start+word.length);captureSelection(el);notify(`„${word}“ eingesetzt · Rückgängig verfügbar`)}
function toggleSave(word){const i=state.saved.findIndex(x=>x.word===word);if(i>=0)state.saved.splice(i,1);else state.saved.push({word,anchor:query});persist();renderResults();updateStats();if(page==='saved')renderSaved()}
function renderProjects(){$('#projectList').innerHTML=state.songs.filter(s=>!s.deleted).slice(0,6).map(s=>`<button data-song="${s.id}" class="${s.id===state.active?'current':''}"><span class="project-dot"></span>${esc(s.title)}</button>`).join('')}
function navigate(target){stopPlay();page=target;document.body.classList.remove('mobile-results','find-only');if(target!=='studio')document.body.classList.remove('focus');$('#workspace').classList.toggle('hidden',target==='library'||target==='saved');$('#largeView').classList.toggle('hidden',target!=='library'&&target!=='saved');$('#breadcrumb').textContent=({studio:'Studio',search:'Reimsuche',library:'Meine Texte',saved:'Merkliste'})[target];document.body.classList.toggle('find-only',target==='search');queryAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===target));setMobileActive(target==='search'?'results':target);if(target==='library')renderLibrary();if(target==='saved')renderSaved();if(target==='studio'){requestAnimationFrame(()=>queryAll('#lyrics textarea').forEach(resizeArea))}}
function setMobileActive(name){queryAll('[data-mobile]').forEach(b=>b.classList.toggle('active',b.dataset.mobile===name))}
function setMode(next){mode=next;stopPlay();queryAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===next;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active)});$('#writeView').classList.toggle('hidden',next!=='write');$('#rhymeView').classList.toggle('hidden',next!=='rhyme');$('#performView').classList.toggle('hidden',next!=='perform');if(next==='rhyme')renderAnalysis();if(next==='perform')renderPerform();if(next==='write')requestAnimationFrame(()=>queryAll('#lyrics textarea').forEach(resizeArea))}
function renderAnalysis(){const s=song();$('#rhymeView').innerHTML=`<div><div class="eyebrow">Der Blick auf deinen Verse</div><h2 style="margin-top:7px">Klang, Struktur, Spannung.</h2></div><div class="analysis-card"><h3>Endreime</h3><div class="scheme">${s.lines.map((l,i)=>`<span title="Bar ${i+1}">${esc((l.match(/[\p{L}]+[.!?]?$/u)||['—'])[0].slice(-3))}</span>`).join('')}</div><p class="analysis-note" style="margin-top:14px">Demo: Wortenden als Orientierung. Echte Reimfamilien und Relationen liefert in der App der bestehende Phonetik-Kern.</p></div><div class="analysis-card"><h3>Silben pro Bar <span class="small">≈ Schätzung</span></h3><div class="densitychart">${s.lines.slice(0,16).map(l=>`<div style="height:${Math.min(85,syll(l)*5)}px"><span>${syll(l)}</span></div>`).join('')}</div><p class="analysis-note">Bar-Längen im Vergleich. Keine Bewertung deiner Lyrics.</p></div><button class="outline" id="backWrite">Zurück zum Text</button>`;$('#backWrite').onclick=()=>setMode('write')}
function renderPerform(){stopPlay();const s=song();s.steps=s.steps||{};$('#performView').innerHTML=`<div><div class="eyebrow">Perform / Bar ${String(activeLine+1).padStart(2,'0')}</div><h2 style="margin-top:9px">Gib der Zeile deinen Flow.</h2><p style="margin-top:14px;font-size:17px">${esc(s.lines[activeLine])}</p></div><div class="row between"><label class="row"><input id="bpm" class="bpm" type="number" min="40" max="220" value="${bpm}" aria-label="Tempo in BPM"><span class="small">BPM · 4/4</span></label><button id="playBtn" class="primary">▶ Metronom</button></div><div><div class="row between" style="margin-bottom:13px"><h3>Timing & Cues</h3><span class="small">16 Schritte · 1 Bar</span></div><div class="cue-tools">${[['hit','● Hit'],['accent','▲ Akzent'],['rest','Ⅱ Pause'],['breath','◌ Atem'],['hold','→ Halten'],['erase','× Löschen']].map(([v,t])=>`<button data-cue="${v}" class="${v===cue?'active':''}" aria-pressed="${v===cue}">${t}</button>`).join('')}</div><div class="beatgrid" style="margin-top:17px">${Array.from({length:16},(_,i)=>`<button data-step="${i}" class="${s.steps[activeLine+'-'+i]?'on':''}" aria-label="Schritt ${i+1}: ${s.steps[activeLine+'-'+i]||'leer'}">${s.steps[activeLine+'-'+i]?cueSymbol(s.steps[activeLine+'-'+i]):i%4===0?i/4+1:'·'}</button>`).join('')}</div><div class="row between" style="margin-top:15px"><button class="outline" id="autoMap">Auto-Map ≈</button><button id="clearCues">Cues leeren</button></div></div><p class="analysis-note">Cue auswählen und auf einen Schritt tippen. Cues werden pro Bar gespeichert. Das Metronom ist echt; Auto-Map ist eine vereinfachte Demo-Verteilung.</p>`;$('#bpm').onchange=e=>{bpm=Math.max(40,Math.min(220,+e.target.value||92));e.target.value=bpm;stopPlay()};$('#playBtn').onclick=()=>playing?stopPlay():startPlay();queryAll('[data-cue]').forEach(b=>b.onclick=()=>{cue=b.dataset.cue;renderPerform()});queryAll('[data-step]').forEach(b=>b.onclick=()=>{pushUndo();const k=activeLine+'-'+b.dataset.step;if(cue==='erase'||s.steps[k]===cue)delete s.steps[k];else s.steps[k]=cue;persist();renderPerform()});$('#autoMap').onclick=()=>{pushUndo();for(let i=0;i<16;i++)delete s.steps[activeLine+'-'+i];const n=Math.min(16,syll(s.lines[activeLine]));for(let i=0;i<n;i++)s.steps[activeLine+'-'+Math.floor(i*16/n)]='hit';persist();renderPerform()};$('#clearCues').onclick=()=>{pushUndo();Object.keys(s.steps).filter(k=>k.startsWith(activeLine+'-')).forEach(k=>delete s.steps[k]);persist();renderPerform()}}
function cueSymbol(c){return ({hit:'●',accent:'▲',rest:'Ⅱ',breath:'◌',hold:'→'})[c]||'·'}
function stopPlay(){playing=false;clearInterval(playTimer);queryAll('[data-step]').forEach(e=>e.classList.remove('playhead'));if($('#playBtn'))$('#playBtn').textContent='▶ Metronom'}
async function startPlay(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();playing=true;tick=0;$('#playBtn').textContent='■ Stop';const pulse=()=>{queryAll('[data-step]').forEach((e,i)=>e.classList.toggle('playhead',i===tick));if(tick%4===0){const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=tick===0?1000:650;g.gain.setValueAtTime(.05,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.045);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.05)}tick=(tick+1)%16};pulse();playTimer=setInterval(pulse,60000/bpm/4)}catch(e){notify('Audio hier nicht verfügbar. Timing-Raster bleibt nutzbar.')}}
function showDialog(title,html){$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal()}
function closeDialog(){$('#dialog').close()}
function legacyFilters(){showDialog('Dein Klang. Deine Suche.',`<div class="formgrid"><label class="field">Aussprache der Suchanfrage<select id="basis"><option value="de">Deutsch</option><option value="en">Englisch</option><option value="both">DE + EN</option></select></label><label class="field">Sprache der Ergebnisse<select id="resultLanguage"><option value="both">DE + EN</option><option value="de">Deutsch</option><option value="en">Englisch</option></select></label><label class="field">Reimbeziehung<select id="relation"><option value="all">Alle Beispiele</option><option value="rein">Reiner Reim</option><option value="nah">Naher Klang</option></select></label><label class="field">Reihenfolge<select id="sort"><option value="recommended">Writer-Empfehlung</option><option value="alpha">A–Z</option><option value="syllables">Silben aufsteigend</option></select></label></div><p class="notice">Die Live-Suche nutzt bereits die lokale Writer-Runtime. Die vollständige Filtermatrix, Varianten, historische Formen und Provenienz werden im nächsten Paritätsschritt in diese Studio-Fläche gezogen.</p><div class="dialogactions"><button id="resetFilters">Zurücksetzen</button><button id="applyFilters" class="primary">Anwenden</button></div>`);$('#basis').value=basis;$('#resultLanguage').value=resultLang;$('#relation').value=relation;$('#sort').value=sort;$('#applyFilters').onclick=()=>{basis=$('#basis').value;resultLang=$('#resultLanguage').value;relation=$('#relation').value;sort=$('#sort').value;pageSize=6;void refreshWriterResults();closeDialog()};$('#resetFilters').onclick=()=>{basis='de';resultLang='both';relation='all';sort='recommended';void refreshWriterResults();closeDialog()}}
function legacySettings(){showDialog('Dein Studio einrichten',`<label class="field">Schriftgröße im Editor<input id="fontRange" type="range" min="16" max="28" value="${state.fontSize}"></label><p class="small" id="fontValue">${state.fontSize} px</p><div class="row wrap" style="margin-top:20px"><button id="settingTheme" class="outline">Hell / Dunkel wechseln</button><button id="settingHistory" class="outline">Versionsverlauf</button></div><p class="notice">Diese Demo speichert Texte, Cues und Merkliste nur in diesem Browser. Exportiere deine Texte zur Sicherung. Keine Analyse- oder Cloud-Dienste.</p><div class="row wrap"><button id="sourceInfo" class="outline">Über diese Demo</button><button id="commandsSettings" class="outline">Tastenkürzel</button></div>`);$('#fontRange').oninput=e=>{state.fontSize=+e.target.value;document.documentElement.style.setProperty('--editor',state.fontSize+'px');queryAll('#lyrics textarea').forEach(resizeArea);$('#fontValue').textContent=state.fontSize+' px';persist()};$('#settingTheme').onclick=toggleTheme;$('#settingHistory').onclick=showHistory;$('#sourceInfo').onclick=showInfo;$('#commandsSettings').onclick=showCommands}
function legacyToggleTheme(){toggleTheme()}
function legacyHistory(){revision();showDialog('Deine letzten Fassungen',`<p class="notice">Wiederherstellen erzeugt zuvor eine Sicherung der aktuellen Fassung.</p>${(song().revisions||[]).slice().reverse().map((r,i)=>`<div class="revision"><div class="grow"><b>${new Date(r.at).toLocaleTimeString('de-DE')}</b><p>${esc(r.text.slice(0,65))}…</p></div><button class="outline" data-revision="${song().revisions.length-1-i}">Wiederherstellen</button></div>`).join('')||'<p>Noch keine ältere Fassung vorhanden.</p>'}`);queryAll('[data-revision]').forEach(b=>b.onclick=()=>{const text=song().revisions[+b.dataset.revision].text;pushUndo();revision();song().lines=text.split('\n');activeLine=0;selection={line:0,start:0,end:0};renderEditor();changed();closeDialog();notify('Fassung wiederhergestellt.')})}
function showInfo(){showDialog('RhymeLab Studio Konzept',`<p>Ein gemeinsamer Schreibraum für Browser, Mobile und Electron.</p><p class="notice">Die Reimsuche ist an die lokale <code>/api/writer</code>-Runtime angeschlossen und nutzt Wörter, Phrase/Mosaic und Entities entsprechend den verfügbaren Capabilities. Textbearbeitung, lokale Speicherung, Verlauf, Merkliste, Themes, Timing-Cues und Metronom bleiben im Studio-Shell erhalten.</p><p class="notice">Noch nicht Produktionsparität: Editor-Silbenzählung, Analyse und Auto-Map enthalten weiterhin explizite Näherungen. Erweiterte Writer-Filter und vollständige Detail-/Provenienzflächen werden schrittweise aus der bestehenden Search-UI übernommen.</p>`)}
function showCommands(){showDialog('Schnell zu deinem nächsten Schritt',`<div class="commandlist"><button data-command="studio">Studio öffnen <span class="small">Alt + 1</span></button><button data-command="search">Reimsuche öffnen <span class="small">Alt + 2</span></button><button data-command="focus">Fokusmodus wechseln <span class="small">Alt + F</span></button><button data-command="history">Versionsverlauf</button><button data-command="settings">Einstellungen</button><button data-command="export">Text exportieren</button></div><p class="notice">Strg / ⌘ + K öffnet dieses Menü. Escape schließt Dialoge. Native Textbearbeitung und Undo bleiben verfügbar.</p>`);queryAll('[data-command]').forEach(b=>b.onclick=()=>{closeDialog();({studio:()=>navigate('studio'),search:()=>navigate('search'),focus:toggleFocus,history:showHistory,settings:showSettings,export:exportText})[b.dataset.command]()})}
function toggleFocus(){navigate('studio');document.body.classList.toggle('focus');$('#focusBtn').setAttribute('aria-pressed',document.body.classList.contains('focus'));notify(document.body.classList.contains('focus')?'Fokus an · Alt + F zum Verlassen':'Fokus aus')}
function nameDialog(title,value,callback){showDialog(title,`<label class="field">Titel<input id="nameInput" value="${esc(value)}" maxlength="100"></label><div class="dialogactions"><button id="cancelName">Abbrechen</button><button id="saveName" class="primary">Speichern</button></div>`);$('#cancelName').onclick=closeDialog;$('#saveName').onclick=()=>{const text=$('#nameInput').value.trim();if(!text)return;callback(text);closeDialog()};$('#nameInput').onkeydown=e=>{if(e.key==='Enter')$('#saveName').click()};$('#nameInput').focus();$('#nameInput').select()}
function newSong(){nameDialog('Ein neuer Text','Unbenannter Song',title=>{revision();state.songs.push({id:'s'+Date.now(),title,lines:[''],folder:'Entwürfe',steps:{},revisions:[]});state.active=state.songs.at(-1).id;activeLine=0;selection={line:0,start:0,end:0};undo=[];redo=[];persist();renderEditor();navigate('studio');setMode('write');focusLine(0)})}
function renderLibrary(showTrash=false){$('#largeView').innerHTML=`<div class="row between wrap"><div><div class="eyebrow">Deine Ideen bleiben bei dir</div><h1 style="margin-top:9px">${showTrash?'Papierkorb':'Meine Texte'}</h1></div><div class="row"><button id="trashToggle" class="outline">${showTrash?'Alle Texte':'Papierkorb'}</button><button id="newSongMain" class="primary">＋ Neuer Text</button></div></div><p class="muted" style="margin-top:13px">Anfangen, liegen lassen, wiederfinden.</p><div class="song-grid">${state.songs.filter(s=>!!s.deleted===showTrash).map(s=>`<article class="songcard"><span class="eyebrow">${esc(s.folder||'Entwürfe')}</span><h3>${esc(s.title)}</h3><p>${esc(s.lines.find(x=>x.trim())||'Die erste Zeile wartet noch.')}</p><small>${s.lines.length} Bars</small><div class="row between">${showTrash?`<button data-restore="${s.id}" class="outline">Wiederherstellen</button>`:`<button class="outline" data-song="${s.id}">Öffnen ↗</button><button data-trash="${s.id}">In Papierkorb</button>`}</div></article>`).join('')||'<p class="empty">Hier ist noch nichts.</p>'}</div>`;$('#newSongMain').onclick=newSong;$('#trashToggle').onclick=()=>renderLibrary(!showTrash)}
function renderSaved(){$('#largeView').innerHTML=`<div class="eyebrow">Wörter für später</div><h1 style="margin-top:9px">Deine Merkliste.</h1><p class="muted" style="margin-top:14px">Gute Funde, direkt zurück in deinen Text.</p><div class="collection-list">${state.saved.map(r=>`<div class="result"><div class="grow"><h3>${esc(r.word)}</h3><small>Gefunden zu „${esc(r.anchor)}“</small></div><button data-insert="${esc(r.word)}" class="outline">Einsetzen</button><button data-save="${esc(r.word)}" aria-label="${esc(r.word)} entfernen">×</button></div>`).join('')||'<div class="empty">Merke ein Wort über das Lesezeichen neben einem Reim.</div>'}</div>`}
function exportText(){const blob=new Blob([song().title+'\n\n'+song().lines.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(song().title.replace(/[^\p{L}\p{N} -]/gu,'')||'rhymelab')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Text als TXT exportiert.')}
function runAuto(t){if(!auto)return;const el=$('#resultsScroll');if(t>pauseUntil&&!document.hidden&&!$('#dialog').open&&el.clientHeight>0){el.scrollTop+=(t-(lastFrame||t))*.018;if(el.scrollTop+el.clientHeight>=el.scrollHeight-2){if(pageSize<data().length){pageSize+=6;renderResults()}else{el.scrollTop=0;pauseUntil=t+1200}}}lastFrame=t;scrollFrame=requestAnimationFrame(runAuto)}
function toggleAuto(){auto=!auto;$('#autoBtn').textContent='Auto-Scroll: '+(auto?'An':'Aus');$('#autoBtn').setAttribute('aria-pressed',auto);cancelAnimationFrame(scrollFrame);lastFrame=0;if(auto){pauseUntil=performance.now()+1000;scrollFrame=requestAnimationFrame(runAuto)}}
function bind(){const required=['lyrics','searchForm','dialog','results','workspace','largeView','performView','rhymeView','writeView','themeBtn','exportBtn','filterBtn','autoBtn','moreBtn','focusBtn'];for(const id of required)if(!document.getElementById(id))throw Error('Fehlendes Element: '+id);
$('#closeDialog').onclick=closeDialog;$('#themeBtn').onclick=toggleTheme;$('#exportBtn').onclick=exportText;$('#commandBtn').onclick=showCommands;$('#settingsBtn').onclick=showSettings;$('#settingsSide').onclick=showSettings;$('#filterBtn').onclick=showFilters;$('#languageBtn').onclick=showFilters;$('#historyBtn').onclick=showHistory;$('#infoBtn').onclick=showInfo;$('#focusBtn').onclick=toggleFocus;$('#newSongSidebar').onclick=newSong;$('#renameBtn').onclick=()=>nameDialog('Titel ändern',song().title,t=>{song().title=t;persist();renderEditor()});$('#addBar').onclick=()=>{pushUndo();const current=song(),last=current.lines.length-1;splitEditorBar(current,last,current.lines[last].length,current.lines[last].length);activeLine=current.lines.length-1;renderEditor();focusLine(activeLine,0);changed()};$('#undoBtn').onclick=performUndo;$('#redoBtn').onclick=performRedo;$('#searchForm').onsubmit=e=>{e.preventDefault();query=$('#searchInput').value.trim()||query;pageSize=6;void refreshWriterResults();$('#resultsScroll').scrollTop=0};$('#autoBtn').onclick=toggleAuto;$('#moreBtn').onclick=()=>{pageSize+=6;renderResults()};$('#resultsScroll').addEventListener('scroll',()=>{const el=$('#resultsScroll');if(el.scrollTop>0&&el.scrollHeight-el.scrollTop-el.clientHeight<90&&pageSize<data().length){pageSize+=6;renderResults()}},{passive:true});['wheel','touchstart','pointerdown','focusin'].forEach(ev=>$('#resultsScroll').addEventListener(ev,()=>pauseUntil=performance.now()+5000,{passive:true}));
queryAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));queryAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));queryAll('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope;pageSize=6;setExclusivePressed(queryAll('[data-scope]'),scope,'scope');void refreshWriterResults()});queryAll('[data-mobile]').forEach(b=>b.onclick=()=>{const dest=b.dataset.mobile;if(dest==='settings')return showSettings();if(dest==='results'){navigate('studio');document.body.classList.remove('focus');document.body.classList.add('mobile-results');setMobileActive('results')}else navigate(dest)});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.insert)insertWord(b.dataset.insert);if(b.dataset.save)toggleSave(b.dataset.save);if(b.dataset.query){query=b.dataset.query;void refreshWriterResults()}if(b.dataset.retryWriter){void refreshWriterResults()}if(b.dataset.detail)openDetail(b.dataset.detail,b.dataset.detailId||'');if(b.dataset.song){revision();state.active=b.dataset.song;activeLine=0;selection={line:0,start:0,end:0};undo=[];redo=[];persist();renderEditor();navigate('studio');setMode('write')}if(b.dataset.trash){const s=state.songs.find(s=>s.id===b.dataset.trash);if(s.id===state.active){notify('Öffne zuerst einen anderen Text, um diesen abzulegen.');return}s.deleted=true;persist();renderLibrary();renderProjects();notify('Im Papierkorb · wiederherstellbar')}if(b.dataset.restore){state.songs.find(s=>s.id===b.dataset.restore).deleted=false;persist();renderLibrary(true);renderProjects()}});
document.addEventListener('keydown',e=>{
  const modifier=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
  if(modifier&&key==='z'){e.preventDefault();if(e.shiftKey)performRedo();else performUndo();return}
  if(modifier&&key==='y'){e.preventDefault();performRedo();return}
  if(modifier&&key==='k'){e.preventDefault();showCommands()}
  if(e.altKey&&e.key==='1'){e.preventDefault();navigate('studio')}
  if(e.altKey&&e.key==='2'){e.preventDefault();navigate('search')}
  if(e.altKey&&key==='f'){e.preventDefault();toggleFocus()}
});window.addEventListener('resize',()=>queryAll('#lyrics textarea').forEach(resizeArea));document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPlay();revision();persist()}});window.addEventListener('pagehide',()=>{revision();persist()});document.body.dataset.controls='bound';}
// Version 2: direct desktop controls and docked surfaces.
let density=normalizeDensity(state.density),syllableMode='all',followSelection=true,selectedResult='',selectedResultId='',dockTab='',resultSignature='',selectionProof=null;
state.motion=state.motion||'auto';
const baseData=data, baseRenderResults=renderResults, baseRenderEditor=renderEditor, baseCapture=captureSelection, baseInsert=insertWord, baseToggleSave=toggleSave, baseMode=setMode;
function animateSurface(el,name='surface-enter'){if(!el)return;el.classList.remove(name);void el.offsetWidth;el.classList.add(name)}
function sortedData(){return sortStudioWriterRows(data(),{sort,rhymeType,querySyllables:writerQuerySyllables||syll(query),locale:basis==='en'?'en':'de'})}
data=function(){return filterUnusedWriterRows(filterStudioWriterRows(baseData(),{rhymeType,syllableMode,querySyllables:writerQuerySyllables||syll(query)}))};
resultHTML=function(r){const saved=state.saved.some(s=>s.word===r.word),kind=r.kind==='phrase'?'PHRASE':r.kind==='entity'?'NAME':'',active=selectedResultId?selectedResultId===r.id:selectedResult===r.word,shortRelation=({multisyllabic_perfect:'Multi-Voll',perfect:'Voll',multisyllabic_slant:'Multi-Slant',family:'Familie',slant:'Slant',assonance:'Asson.',consonance:'Konson.'})[r.relationType]||'Klang';return `<div class="result ${active?'is-selected':''}" data-result-word="${esc(r.word)}" data-result-id="${esc(r.id)}"><div class="grow"><button class="result-word" data-detail="${esc(r.word)}" data-detail-id="${esc(r.id)}" aria-label="Details zu ${esc(r.word)}" aria-pressed="${active}">${esc(r.word)}${kind?`<span class="result-kind">${kind}</span>`:''}</button><div class="result-meta"><b>${esc(r.relationLabel||'Klangtreffer')}</b><span>${r.syll||'—'} Silb.</span><span>${r.kind==='word'?'Wort':r.kind==='phrase'?'Phrase':'Name'} · ${r.lang.toUpperCase()}</span></div></div><span class="result-relation">${esc(shortRelation)}</span><span class="result-syll">${r.syll||'—'}</span><div class="result-actions"><button data-save="${esc(r.word)}" class="${saved?'saved':''}" aria-pressed="${saved}" aria-label="${esc(r.word)} ${saved?'entmerken':'merken'}">${icon('book')}</button><button data-insert="${esc(r.word)}" aria-label="${esc(r.word)} einsetzen">${icon('plus')}</button></div></div>`};
renderResults=function(){baseRenderResults();const panel=$('.inspector');['list','compact','tiles'].forEach(v=>panel.classList.toggle('density-'+v,v===density));queryAll('[data-density]').forEach(b=>{b.classList.toggle('active',b.dataset.density===density);b.setAttribute('aria-pressed',b.dataset.density===density)});queryAll('#results .result').forEach((r,i)=>r.style.setProperty('--i',i));const sig=[query,scope,relation,rhymeType,variantMode,entityCategory,includeHistorical,generated,generatedOnly,sort,basis,resultLang,syllableMode,density].join('|');if(sig!==resultSignature){animateSurface($('#results'),'results-enter');animateSurface($('#anchorWord'),'anchor-change');resultSignature=sig;$('#resultsScroll').scrollTop=0}syncInline();if(selectedResult&&!data().some(r=>selectedResultId?r.id===selectedResultId:r.word===selectedResult)){selectedResult='';selectedResultId='';selectedDetail=null;$('#detailDock').classList.add('hidden')}if(selectedResult&&!$('#detailDock').classList.contains('hidden'))renderDetail();$('#resultCount').textContent=writerStatus==='loading'?'Suche …':writerStatus==='error'?'Nicht verfügbar':data().length+' Treffer'+(hiddenUsedCount?' · '+hiddenUsedCount+' verwendet ausgeblendet':'');$('#filterLabel').textContent=$('#directFilters').classList.contains('hidden')?'Filter öffnen':hasActiveSearchFilters()?'Filter aktiv':'Filter sichtbar'};
renderEditor=function(){baseRenderEditor();selectionProof=createSelectionProof(song(),{index:selection.line,start:selection.start,end:selection.end});$('#fontSizeLive').textContent=state.fontSize;if(dockTab==='saved')renderDock();};
captureSelection=function(el){const old=query;baseCapture(el);if(!followSelection){query=old;renderResults()}selectionProof=createSelectionProof(song(),{index:selection.line,start:selection.start,end:selection.end});if(selectedResult&&!$('#detailDock').classList.contains('hidden'))renderDetail()};
insertWord=function(word){if(selectionProof){const check=validateSelectionProof(song(),selectionProof);if(!check.valid){notify('Textstelle geändert. Bitte Zielwort erneut auswählen.');return}}baseInsert(word);animateSurface($(`#lyrics textarea[data-line="${activeLine}"]`)?.parentElement,'insert-flash');selectionProof=createSelectionProof(song(),{index:selection.line,start:selection.start,end:selection.end});if(selectedResult)renderDetail()};
toggleSave=function(word){baseToggleSave(word);const b=queryAll('[data-save]').find(b=>b.dataset.save===word);animateSurface(b,'bookmark-pop');if(dockTab==='saved')renderDock();if(selectedResult)renderDetail()};
setMode=function(next){baseMode(next);animateSurface($(next==='write'?'#writeView':next==='rhyme'?'#rhymeView':'#performView'))};
function currentSearchPreset(){
  if(scope==='word'&&rhymeType==='all')return 'words';
  if(scope==='phrase'&&rhymeType==='all')return 'phrases';
  if(scope==='entity'&&rhymeType==='all')return 'entities';
  if(scope==='all'&&STUDIO_RHYME_TYPE_LABELS[rhymeType])return rhymeType;
  if(scope==='all'&&rhymeType==='all')return 'best';
  return 'custom';
}
function syncScopeButtons(){
  queryAll('[data-scope]').forEach((button)=>{
    const active=button.dataset.scope===scope;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
}
function applySearchPreset(value){
  const preset=String(value||'best');
  relation='all';
  if(preset==='words'){scope='word';rhymeType='all'}
  else if(preset==='phrases'){scope='phrase';rhymeType='all'}
  else if(preset==='entities'){scope='entity';rhymeType='all'}
  else if(STUDIO_RHYME_TYPE_LABELS[preset]){scope='all';rhymeType=preset}
  else if(preset==='best'){scope='all';rhymeType='all'}
  else return;
  pageSize=density==='compact'?24:12;
  syncScopeButtons();
  void refreshWriterResults();
}
function advancedFilterCount(){
  return [
    rhymeType!=='all',
    variantMode!=='preferred',
    entityCategory!=='all',
    includeHistorical,
    generated,
    generatedOnly,
  ].filter(Boolean).length;
}
function entityCategories(){
  const values=writerCapabilities?.entities?.categories;
  return Array.isArray(values)?values:[];
}
function syncAdvancedControls(){
  const panel=$('#advancedFilters'),toggle=$('#advancedFiltersToggle');
  if(!panel||!toggle)return;
  panel.classList.toggle('hidden',!advancedExpanded);
  toggle.setAttribute('aria-expanded',String(advancedExpanded));
  $('#advancedPreset').value=currentSearchPreset();
  $('#advancedRhymeType').value=rhymeType;
  $('#advancedVariants').value=variantMode;
  $('#advancedHideUsed').checked=hideUsed;
  $('#advancedHistorical').checked=includeHistorical;
  $('#advancedGenerated').checked=generated;
  $('#advancedGeneratedOnly').checked=generatedOnly;

  const categorySelect=$('#advancedEntityCategory');
  const categories=entityCategories();
  const categoryValue=entityCategory;
  categorySelect.innerHTML='<option value="all">Alle Entities</option>'+categories.map((value)=>'<option value="'+esc(value)+'">'+esc(humanizeDetail(value))+'</option>').join('');
  categorySelect.value=categories.includes(categoryValue)?categoryValue:'all';
  if(categoryValue!=='all'&&!categories.includes(categoryValue))entityCategory='all';

  const categoryAvailable=categories.length>0&&(scope==='all'||scope==='entity');
  const categoryField=$('#advancedEntityCategoryField');
  categoryField.classList.toggle('is-unavailable',!categoryAvailable);
  categorySelect.disabled=!categoryAvailable;

  const variantsAvailable=scope==='all'||scope==='word';
  $('#advancedVariants').disabled=!variantsAvailable;
  $('#advancedVariants').closest('label')?.classList.toggle('is-unavailable',!variantsAvailable);

  const generatedAvailable=studioCapabilities.generated===true;
  const generatedField=$('#advancedGeneratedField');
  const generatedOnlyField=$('#advancedGeneratedOnlyField');
  generatedField.classList.toggle('is-unavailable',!generatedAvailable);
  generatedOnlyField.classList.toggle('is-unavailable',!generatedAvailable||!generated);
  $('#advancedGenerated').disabled=!generatedAvailable;
  $('#advancedGeneratedOnly').disabled=!generatedAvailable||!generated;

  const count=advancedFilterCount(),countEl=$('#advancedFilterCount');
  countEl.textContent=String(count);
  countEl.classList.toggle('hidden',count===0);
}
function hasActiveSearchFilters(){
  return scope!=='all'||relation!=='all'||rhymeType!=='all'||syllableMode!=='all'||resultLang!=='both'||basis!=='de'||sort!=='recommended'||variantMode!=='preferred'||entityCategory!=='all'||includeHistorical||generated||generatedOnly;
}
function syncInline(){
  for(const [id,value]of [['directBasis',basis],['directLang',resultLang],['directRelation',relation],['directSyllables',syllableMode],['directSort',sort]])$('#'+id).value=value;
  syncAdvancedControls();
  const items=[];
  if(scope!=='all')items.push(['scope',scope==='word'?'Wörter':scope==='phrase'?'Phrasen':'Namen']);
  if(relation!=='all')items.push(['relation',relation==='rein'?'Vollreime':'Slant / Klang']);
  if(rhymeType!=='all')items.push(['rhymeType',STUDIO_RHYME_TYPE_LABELS[rhymeType]||rhymeType]);
  if(syllableMode!=='all')items.push(['syllables','Silben: '+({same:'wie Anker',near:'±1',near2:'±2',near3:'±3','1':'1','2':'2','3':'3+'})[syllableMode]]);
  if(resultLang!=='both')items.push(['lang','Ergebnis: '+resultLang.toUpperCase()]);
  if(basis!=='de')items.push(['basis','Anker: '+(basis==='both'?'DE+EN':'EN')]);
  if(sort!=='recommended')items.push(['sort',({alpha:'A–Z',syllables:'Silbendistanz',closest:'Klangnähe',common:'Häufigkeit'})[sort]||sort]);
  if(variantMode!=='preferred')items.push(['variants','Alle Aussprachevarianten']);
  if(entityCategory!=='all')items.push(['entityCategory','Entity: '+humanizeDetail(entityCategory)]);
  if(includeHistorical)items.push(['historical','Historisch']);
  if(generated)items.push(['generated','Generated']);
  if(generatedOnly)items.push(['generatedOnly','Nur Generated']);
  $('#activeFilters').innerHTML=items.map(([id,label])=>`<button data-clear-filter="${id}" aria-label="Filter ${esc(label)} entfernen">${esc(label)} ×</button>`).join('');
}
function resetInline(){
  scope='all';relation='all';rhymeType='all';variantMode='preferred';entityCategory='all';includeHistorical=false;generated=false;generatedOnly=false;sort='recommended';basis='de';resultLang='both';syllableMode='all';pageSize=12;
  queryAll('[data-scope]').forEach(b=>{b.classList.toggle('active',b.dataset.scope==='all');b.setAttribute('aria-pressed',b.dataset.scope==='all')});
  void refreshWriterResults();
}
function setDensity(v){density=v;state.density=v;pageSize=v==='compact'?24:12;renderResults();persist()}
function toggleFollow(){followSelection=!followSelection;syncFollowControls();if(followSelection){const el=$(`#lyrics textarea[data-line="${activeLine}"]`);if(el&&el.selectionEnd>0)captureSelection(el)}saveStudioSearchState()}

function normalizeThemeHex(value,fallback){
  fallback=fallback||'#000000';
  const text=String(value||'').trim().toUpperCase();
  if(/^#[0-9A-F]{6}$/.test(text))return text;
  if(/^[0-9A-F]{6}$/.test(text))return '#'+text;
  return fallback;
}
function hexRgb(value){
  const hex=normalizeThemeHex(value);
  return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
}
function rgbHex(rgb){
  return '#'+rgb.map(function(value){return Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,'0')}).join('').toUpperCase();
}
function mixThemeHex(a,b,ratio){
  ratio=ratio==null?.5:Math.max(0,Math.min(1,Number(ratio)||0));
  const left=hexRgb(a),right=hexRgb(b);
  return rgbHex(left.map(function(value,index){return value*(1-ratio)+right[index]*ratio}));
}
function relativeLuminance(value){
  return hexRgb(value).map(function(channel){return channel/255}).map(function(channel){return channel<=.03928?channel/12.92:Math.pow((channel+.055)/1.055,2.4)}).reduce(function(sum,value,index){return sum+value*[.2126,.7152,.0722][index]},0);
}
function contrastRatio(a,b){
  const left=relativeLuminance(a),right=relativeLuminance(b),high=Math.max(left,right),low=Math.min(left,right);
  return (high+.05)/(low+.05);
}
function readableAccentText(accent){
  return contrastRatio(accent,'#171717')>=contrastRatio(accent,'#FFFFFF')?'#171717':'#FFFFFF';
}
function completeThemeColors(colors){
  const next={
    bg:normalizeThemeHex(colors&&colors.bg,'#272727'),
    panel:normalizeThemeHex(colors&&colors.panel,'#303030'),
    ink:normalizeThemeHex(colors&&colors.ink,'#F5F4EC'),
    muted:normalizeThemeHex(colors&&colors.muted,'#A3A3A3'),
    accent:normalizeThemeHex(colors&&colors.accent,'#FFE400'),
    accent2:normalizeThemeHex(colors&&colors.accent2,'#FF652F'),
    signal:normalizeThemeHex(colors&&colors.signal,'#14A76C')
  };
  return Object.assign({},next,{
    line:normalizeThemeHex(colors&&colors.line,mixThemeHex(next.muted,next.bg,.52)),
    nav:normalizeThemeHex(colors&&colors.nav,mixThemeHex(next.panel,next.bg,.54)),
    tint:normalizeThemeHex(colors&&colors.tint,mixThemeHex(next.accent,next.bg,.82)),
    onAccent:normalizeThemeHex(colors&&colors.onAccent,readableAccentText(next.accent))
  });
}
function customThemeById(id){return state.customThemes.find(function(theme){return theme.id===id})||null}
function resolveThemeChoice(choice){
  if(choice==='light'||choice==='dark'){
    const replacement=customThemeById(state.themeSlots&&state.themeSlots[choice]);
    if(replacement)return Object.assign({},replacement,{slot:choice,colors:completeThemeColors(replacement.colors)});
    const builtin=STUDIO_BUILTIN_THEMES[choice];
    return Object.assign({},builtin,{slot:choice,colors:completeThemeColors(builtin.colors)});
  }
  const custom=customThemeById(choice);
  if(custom)return Object.assign({},custom,{colors:completeThemeColors(custom.colors)});
  const fallback=STUDIO_BUILTIN_THEMES.dark;
  return Object.assign({},fallback,{slot:'dark',colors:completeThemeColors(fallback.colors)});
}
function themePaletteMarkup(theme){
  const colors=completeThemeColors(theme.colors);
  return '<span class="theme-mini-palette" aria-hidden="true"><i style="background:'+colors.bg+'"></i><i style="background:'+colors.panel+'"></i><i style="background:'+colors.accent+'"></i><i style="background:'+colors.signal+'"></i></span>';
}
function applyThemeObject(theme){
  const colors=completeThemeColors(theme.colors),root=document.documentElement;
  root.dataset.theme=theme.mode==='light'?'light':'dark';
  const vars={'--bg':colors.bg,'--panel':colors.panel,'--ink':colors.ink,'--muted':colors.muted,'--line':colors.line,'--accent':colors.accent,'--accent-2':colors.accent2,'--tint':colors.tint,'--green':colors.signal,'--nav':colors.nav,'--on-accent':colors.onAccent};
  Object.entries(vars).forEach(function(entry){root.style.setProperty(entry[0],entry[1])});
}
function applyThemeChoice(choice,options){
  options=options||{};
  const resolved=resolveThemeChoice(choice);
  state.theme=(choice==='light'||choice==='dark'||customThemeById(choice))?choice:resolved.mode;
  themePreviewing=false;
  applyThemeObject(resolved);
  const button=$('#themeBtn');
  if(button){
    button.dataset.themeMode=resolved.mode;
    button.setAttribute('aria-label','Quickstyle wechseln · aktiv: '+(resolved.name||state.theme));
    button.title=(resolved.name||state.theme)+' · Klick: Light/Dark · Hover: Quickstyles';
  }
  renderThemeQuickMenu();
  if(options.persistState!==false)persist();
}
function slotThemeButton(slot){
  const theme=resolveThemeChoice(slot),replaced=Boolean(customThemeById(state.themeSlots&&state.themeSlots[slot])),active=state.theme===slot;
  return '<button class="theme-choice '+(active?'active':'')+'" data-theme-choice="'+slot+'" role="menuitem">'+themePaletteMarkup(theme)+'<span class="theme-choice-copy"><b>'+(slot==='light'?'Light':'Dark')+'</b><small>'+(replaced?'ersetzt durch '+esc(theme.name):esc(theme.subtitle||theme.name))+'</small></span><span class="theme-choice-check">'+(active?'✓':'')+'</span></button>';
}
function renderThemeQuickMenu(){
  const menu=$('#themeQuickMenu');
  if(!menu)return;
  const slotted=new Set([state.themeSlots&&state.themeSlots.light,state.themeSlots&&state.themeSlots.dark].filter(Boolean));
  const extras=state.customThemes.filter(function(theme){return !slotted.has(theme.id)});
  let html='<div class="theme-quick-title">Quickstyle</div>'+slotThemeButton('light')+slotThemeButton('dark');
  if(extras.length){
    html+='<div class="theme-quick-divider"></div>';
    html+=extras.map(function(theme){
      const active=state.theme===theme.id;
      return '<button class="theme-choice '+(active?'active':'')+'" data-theme-choice="'+esc(theme.id)+'" role="menuitem">'+themePaletteMarkup(theme)+'<span class="theme-choice-copy"><b>'+esc(theme.name)+'</b><small>Eigener Style · '+(theme.mode==='light'?'Light':'Dark')+' Basis</small></span><span class="theme-choice-check">'+(active?'✓':'')+'</span></button>';
    }).join('');
  }
  menu.innerHTML=html;
}
function bindThemeQuickMenu(){
  const quick=$('#themeQuick'),menu=$('#themeQuickMenu'),button=$('#themeBtn');
  if(!quick||!menu||!button)return;
  renderThemeQuickMenu();
  quick.addEventListener('mouseenter',function(){button.setAttribute('aria-expanded','true');renderThemeQuickMenu()});
  quick.addEventListener('mouseleave',function(){button.setAttribute('aria-expanded','false')});
  quick.addEventListener('focusin',function(){button.setAttribute('aria-expanded','true');renderThemeQuickMenu()});
  quick.addEventListener('focusout',function(){requestAnimationFrame(function(){if(!quick.contains(document.activeElement))button.setAttribute('aria-expanded','false')})});
  menu.addEventListener('click',function(event){
    const target=event.target.closest('[data-theme-choice]');
    if(!target)return;
    applyThemeChoice(target.dataset.themeChoice);
    button.setAttribute('aria-expanded','false');
  });
}
function toggleTheme(){
  const current=resolveThemeChoice(state.theme);
  applyThemeChoice(current.mode==='dark'?'light':'dark');
}
function activeThemeForBuilder(){
  if(themeEditingId){
    const editing=customThemeById(themeEditingId);
    if(editing)return Object.assign({},editing,{colors:completeThemeColors(editing.colors)});
  }
  const active=resolveThemeChoice(state.theme);
  return {id:'',name:'Mein Studio',mode:active.mode,colors:completeThemeColors(active.colors)};
}
function themeSlotCard(slot){
  const theme=resolveThemeChoice(slot),active=state.theme===slot,replaced=Boolean(customThemeById(state.themeSlots&&state.themeSlots[slot]));
  return '<button class="theme-slot '+(active?'active':'')+'" data-theme-choice="'+slot+'">'+themePaletteMarkup(theme)+'<span class="theme-slot-copy"><b>'+(slot==='light'?'Light':'Dark')+' · '+esc(theme.name)+'</b><small>'+(replaced?'eigener Style ersetzt Standard':esc(theme.subtitle||'Studio Standard'))+'</small></span><span class="theme-mode-badge">'+slot+'</span></button>';
}
function savedThemeRows(){
  if(!state.customThemes.length)return '<div class="theme-empty">Noch keine eigenen Styles gespeichert.</div>';
  return state.customThemes.map(function(theme){
    const slots=['light','dark'].filter(function(slot){return state.themeSlots&&state.themeSlots[slot]===theme.id});
    return '<div class="theme-saved-row">'+themePaletteMarkup(theme)+'<div><b>'+esc(theme.name)+'</b><small>'+(slots.length?'ersetzt '+slots.join(' + '):'Quickstyle · '+theme.mode)+'</small></div><div class="theme-saved-actions"><button data-theme-choice="'+esc(theme.id)+'" title="Anwenden">✓</button><button data-theme-edit="'+esc(theme.id)+'" title="Bearbeiten">✎</button><button data-theme-delete="'+esc(theme.id)+'" title="Löschen">×</button></div></div>';
  }).join('');
}
function formatCapabilityCount(value){
  const count=Number(value||0);
  return new Intl.NumberFormat('de-DE',{notation:count>=100000?'compact':'standard',maximumFractionDigits:1}).format(count);
}
function capabilityMarkup(){
  if(studioCapabilities.status==='loading')return '<div class="capability-head"><b>Runtime</b><span>prüft Backend …</span></div>';
  if(studioCapabilities.status==='error')return '<div class="capability-head" data-state="off"><b>Runtime</b><span>nicht erreichbar</span></div>';
  const c=studioCapabilities;
  const item=function(label,enabled,detail){
    return '<span class="capability-item" data-state="'+(enabled?'on':'off')+'"><i></i><b>'+esc(label)+'</b><small>'+esc(detail||(enabled?'bereit':'nicht verfügbar'))+'</small></span>';
  };
  return '<div class="capability-head"><b>Runtime</b><span>'+esc(c.runtime)+(c.dataset&&c.dataset.total?' · '+formatCapabilityCount(c.dataset.total)+' Records':'')+'</span></div><div class="capability-grid">'
    +item('DE Writer',c.deWriter)
    +item('EN Writer',c.enWriter)
    +item('Phrase / Mosaic',c.phrases)
    +item('Entities',c.entities)
    +item('Generated',c.generated,c.generated?(c.generatedDefault?'aktiv':'verfügbar'):'nicht verfügbar')
    +item('Query IPA',Boolean(c.queryPronunciationRevision),c.queryPronunciationRevision?c.queryPronunciationRevision.slice(0,8):'keine Revision')
    +item('DocumentStore',!['error','unsupported'].includes(documentStoreStatus),documentStoreDetail())
    +'</div>';
}
function updateCapabilitySurface(){
  const status=$('#runtimeStatus');
  if(status){
    const ready=studioCapabilities.status==='ready';
    status.classList.toggle('degraded',!ready);
    status.textContent=studioCapabilities.status==='loading'
      ?'Runtime prüfen …'
      :ready
        ?(studioCapabilities.servingV1?'Serving v1 · bereit':'Writer · bereit')
        :'Runtime eingeschränkt';
    status.title=studioCapabilities.status==='error'
      ?String(studioCapabilities.error||'Backend nicht erreichbar')
      :'Live aus /api/health und /api/dataset-stats';
  }
  const summary=$('#capabilitySummary');
  if(summary)summary.innerHTML=capabilityMarkup();
  syncAdvancedControls();
}
async function refreshStudioCapabilities(){
  try{
    studioCapabilities=await loadStudioCapabilities();
  }catch(error){
    studioCapabilities={status:'error',error:error instanceof Error?error.message:String(error)};
  }
  updateCapabilitySurface();
}

function renderSettingsDock(body){
  const draft=activeThemeForBuilder(),colors=completeThemeColors(draft.colors);
  const lightChecked=Boolean(themeEditingId&&state.themeSlots&&state.themeSlots.light===themeEditingId);
  const darkChecked=Boolean(themeEditingId&&state.themeSlots&&state.themeSlots.dark===themeEditingId);
  const fields=THEME_COLOR_FIELDS.map(function(field){
    const key=field[0],label=field[1];
    return '<label class="theme-color-field"><span>'+label+'</span><input type="color" data-theme-color="'+key+'" value="'+colors[key]+'" aria-label="'+label+' Farbe"><input type="text" data-theme-hex="'+key+'" value="'+colors[key]+'" maxlength="7" spellcheck="false" aria-label="'+label+' Hex"></label>';
  }).join('');
  const preview=THEME_COLOR_FIELDS.map(function(field){return '<i data-preview-color="'+field[0]+'" style="background:'+colors[field[0]]+'"></i>'}).join('');
  body.innerHTML='<div class="theme-settings"><section class="theme-settings-card"><h3>Studio Appearance</h3><p>Quickstyles bleiben sofort erreichbar. Eigene Styles werden nur lokal in diesem Browser gespeichert.</p><div class="dock-settings" style="margin-top:13px"><label>Schriftgröße<input id="fontRange" type="range" min="16" max="28" value="'+state.fontSize+'"></label><label>Schrift<select id="editorFont"><option value="sans">Studio Sans</option><option value="serif">Editorial Serif</option><option value="mono">Monospace</option></select></label><label>Bewegung<select id="motionSelect"><option value="auto">System beachten</option><option value="off">Aus</option></select></label></div><div id="capabilitySummary" class="capability-summary">'+capabilityMarkup()+'</div><div class="theme-slot-list">'+themeSlotCard('light')+themeSlotCard('dark')+'</div><div class="theme-saved-list">'+savedThemeRows()+'</div></section><section class="theme-settings-card"><div class="theme-builder-head"><div><h3>Custom Theme Studio</h3><p>Semantische Farben statt einzelner CSS-Werte. Änderungen werden live auf das Studio vorgespielt.</p></div><button class="outline" data-theme-new>Neu</button></div><div id="themePalettePreview" class="theme-palette-preview">'+preview+'</div><div class="theme-builder-grid">'+fields+'</div><div class="theme-builder-meta"><input id="themeName" value="'+esc(draft.name||'Mein Studio')+'" maxlength="40" aria-label="Theme Name"><select id="themeMode" aria-label="Theme Basis"><option value="light">Light Basis</option><option value="dark">Dark Basis</option></select></div><div class="theme-replace-row"><label><input id="replaceLight" type="checkbox" '+(lightChecked?'checked':'')+'> Light-Style ersetzen</label><label><input id="replaceDark" type="checkbox" '+(darkChecked?'checked':'')+'> Dark-Style ersetzen</label></div><div class="theme-contrast"><span id="themeTextContrast"></span><span id="themeAccentContrast"></span></div><div class="theme-builder-actions"><button class="outline" id="themeRevert">Vorschau zurücksetzen</button><button class="primary" id="themeSave">'+(themeEditingId?'Style aktualisieren':'Style speichern')+'</button></div></section></div>';
  $('#fontRange').oninput=function(event){setFontSize(+event.target.value)};
  $('#editorFont').value=state.editorFont||'sans';
  $('#editorFont').onchange=function(event){state.editorFont=event.target.value;applyEditorFont();persist()};
  $('#motionSelect').value=state.motion;
  $('#motionSelect').onchange=function(event){state.motion=event.target.value;document.documentElement.dataset.motion=state.motion;persist()};
  $('#themeMode').value=draft.mode==='light'?'light':'dark';
  updateThemeContrast(draft);
  bindThemeSettings();
}
function readThemeDraft(){
  const current=activeThemeForBuilder(),colors={};
  THEME_COLOR_FIELDS.forEach(function(field){
    const key=field[0],input=$('[data-theme-hex="'+key+'"]');
    colors[key]=normalizeThemeHex(input&&input.value,current.colors[key]);
  });
  return {id:themeEditingId||'',name:(($('#themeName')&&$('#themeName').value)||'Mein Studio').trim().slice(0,40)||'Mein Studio',mode:$('#themeMode')&&$('#themeMode').value==='light'?'light':'dark',colors:completeThemeColors(colors)};
}
function updateThemeContrast(theme){
  const colors=completeThemeColors(theme.colors);
  const text=contrastRatio(colors.ink,colors.bg),accent=contrastRatio(colors.onAccent,colors.accent);
  const textEl=$('#themeTextContrast'),accentEl=$('#themeAccentContrast');
  if(textEl){textEl.textContent='Text '+text.toFixed(1)+':1 '+(text>=4.5?'AA':'LOW');textEl.dataset.tone=text>=4.5?'ok':'warn'}
  if(accentEl){accentEl.textContent='Accent '+accent.toFixed(1)+':1 '+(accent>=4.5?'AA':'LOW');accentEl.dataset.tone=accent>=4.5?'ok':'warn'}
}
function previewThemeDraft(){
  const draft=readThemeDraft();
  themePreviewing=true;
  applyThemeObject(draft);
  THEME_COLOR_FIELDS.forEach(function(field){
    const key=field[0],preview=$('[data-preview-color="'+key+'"]');
    if(preview)preview.style.background=draft.colors[key];
  });
  updateThemeContrast(draft);
}
function bindThemeSettings(){
  Array.from(document.querySelectorAll('[data-theme-color]')).forEach(function(color){
    color.addEventListener('input',function(){
      const key=color.dataset.themeColor,hex=$('[data-theme-hex="'+key+'"]');
      if(hex)hex.value=normalizeThemeHex(color.value);
      previewThemeDraft();
    });
  });
  Array.from(document.querySelectorAll('[data-theme-hex]')).forEach(function(input){
    input.addEventListener('input',function(){
      const key=input.dataset.themeHex,value=String(input.value||'').trim().toUpperCase();
      if(!/^#[0-9A-F]{6}$/.test(value))return;
      const color=$('[data-theme-color="'+key+'"]');
      if(color)color.value=value;
      previewThemeDraft();
    });
    input.addEventListener('blur',function(){
      const key=input.dataset.themeHex,color=$('[data-theme-color="'+key+'"]');
      input.value=normalizeThemeHex(input.value,color&&color.value||'#000000');
    });
  });
  $('#themeMode').onchange=previewThemeDraft;
  $('#replaceLight').onchange=function(event){if(event.target.checked)$('#replaceDark').checked=false};
  $('#replaceDark').onchange=function(event){if(event.target.checked)$('#replaceLight').checked=false};
  $('#themeRevert').onclick=function(){themePreviewing=false;applyThemeChoice(state.theme,{persistState:false});renderDock()};
  $('#themeSave').onclick=saveThemeDraft;
  Array.from(document.querySelectorAll('[data-theme-choice]')).forEach(function(button){button.onclick=function(){themePreviewing=false;applyThemeChoice(button.dataset.themeChoice);if(dockTab==='settings')renderDock()}});
  Array.from(document.querySelectorAll('[data-theme-edit]')).forEach(function(button){button.onclick=function(){themeEditingId=button.dataset.themeEdit;themePreviewing=false;applyThemeChoice(state.theme,{persistState:false});renderDock()}});
  Array.from(document.querySelectorAll('[data-theme-delete]')).forEach(function(button){button.onclick=function(){deleteCustomTheme(button.dataset.themeDelete)}});
  $('[data-theme-new]').onclick=function(){themeEditingId='';themePreviewing=false;applyThemeChoice(state.theme,{persistState:false});renderDock()};
}
function saveThemeDraft(){
  const draft=readThemeDraft(),id=themeEditingId||'custom-'+Date.now().toString(36);
  const replace=$('#replaceLight')&&$('#replaceLight').checked?'light':$('#replaceDark')&&$('#replaceDark').checked?'dark':null;
  const saved=Object.assign({},draft,{id:id,mode:replace||draft.mode,colors:completeThemeColors(draft.colors)});
  const index=state.customThemes.findIndex(function(theme){return theme.id===id});
  if(index>=0)state.customThemes[index]=saved;else state.customThemes.push(saved);
  ['light','dark'].forEach(function(slot){if(state.themeSlots&&state.themeSlots[slot]===id)state.themeSlots[slot]=null});
  if(replace)state.themeSlots[replace]=id;
  themeEditingId=id;
  themePreviewing=false;
  applyThemeChoice(replace||id);
  renderDock();
  notify(replace?saved.name+' ersetzt jetzt '+(replace==='light'?'Light':'Dark')+'.':saved.name+' als Quickstyle gespeichert.');
}
function deleteCustomTheme(id){
  const theme=customThemeById(id);
  if(!theme)return;
  const activeWasCustom=state.theme===id;
  const activeSlot=['light','dark'].find(function(slot){return state.theme===slot&&state.themeSlots&&state.themeSlots[slot]===id});
  ['light','dark'].forEach(function(slot){if(state.themeSlots&&state.themeSlots[slot]===id)state.themeSlots[slot]=null});
  state.customThemes=state.customThemes.filter(function(item){return item.id!==id});
  themeEditingId='';
  applyThemeChoice(activeWasCustom?(theme.mode||'dark'):(activeSlot||state.theme));
  renderDock();
  notify(theme.name+' gelöscht.');
}

function showFilters(){const hidden=$('#directFilters').classList.toggle('hidden');$('#filterBtn').setAttribute('aria-expanded',!hidden);$('#filterLabel').textContent=hidden?'Filter öffnen':'Filter sichtbar';if(!hidden)animateSurface($('#directFilters'))}
function showSettings(){openEditorDock('settings')}
function showHistory(){revision();openEditorDock('history')}
function openEditorDock(tab){if(page!=='studio')navigate('studio');document.body.classList.remove('mobile-results');setMobileActive('studio');dockTab=tab;$('#editorDock').dataset.tab=tab;$('#editorDock').classList.remove('hidden');renderDock();animateSurface($('#editorDock'))}
function closeEditorDock(){if(themePreviewing){themePreviewing=false;applyThemeChoice(state.theme,{persistState:false})}$('#editorDock').classList.add('hidden');delete $('#editorDock').dataset.tab;dockTab='';}
function renderDock(){queryAll('#dockTabs [data-dock]').forEach(b=>{b.classList.toggle('active',b.dataset.dock===dockTab);b.setAttribute('aria-pressed',b.dataset.dock===dockTab)});const body=$('#editorDockBody');if(dockTab==='saved'){body.innerHTML=`<div class="saved-chips">${state.saved.map(r=>`<div class="saved-chip"><button data-insert="${esc(r.word)}" title="Am markierten Wort einsetzen">${esc(r.word)} ＋</button><button data-save="${esc(r.word)}" aria-label="${esc(r.word)} entmerken">×</button></div>`).join('')||'<p class="small">Gute Wörter sammeln: Lesezeichen am Treffer anklicken oder Leertaste in der Liste.</p>'}</div>`}else if(dockTab==='history'){body.innerHTML=(song().revisions||[]).slice().reverse().map((r,i)=>`<div class="revision"><div class="grow"><b>${new Date(r.at).toLocaleTimeString('de-DE')}</b><p>${esc(r.text.slice(0,76))}…</p></div><button class="outline" data-restore-version="${song().revisions.length-1-i}">Wiederherstellen</button></div>`).join('')||'<p class="small">Neue Fassungen entstehen automatisch beim Schreiben.</p>'}else if(dockTab==='settings'){renderSettingsDock(body)}else{body.innerHTML=`<div class="studio-note"><b>Studio 02 · Desktop Workbench</b><p>Schreiben und Recherchieren bleiben gleichzeitig sichtbar. Filter wirken sofort; Details sind angedockt. Kompakt zeigt dieselben Treffer dichter, Wortfeld lädt zum Stöbern ein.</p><p style="margin-top:9px"><b>Direkte Bedienung</b> · Trennlinie ziehen oder per Pfeiltaste verstellen · Anker fixieren · Wortdetails anklicken · Merkliste, Versionen und Darstellung hier unten öffnen.</p><p style="margin-top:9px"><kbd>Alt + R</kbd> Suche · <kbd>Alt + E</kbd> Editor · <kbd>Alt + 3</kbd> Perform · <kbd>Alt + F</kbd> Fokus · <kbd>Alt + L</kbd> Dichte wechseln · In Treffern: <kbd>↑ ↓</kbd> auswählen, <kbd>Enter</kbd> einsetzen, <kbd>Space</kbd> merken.</p><p style="margin-top:9px"><b>Motion</b> · kurze gestaffelte Trefferwechsel, weiche Panel-Einblendung, Auswahl- und Einsetzfeedback. Systemseitig reduzierte Bewegung wird respektiert. Kein externer Dienst, keine Motion-Bibliothek erforderlich.</p><p style="margin-top:9px"><b>Runtime</b> · Reimtreffer kommen live aus /api/writer; Editor-Silben, Analyse und Auto-Map bleiben bis zu ihren jeweiligen Migrationsstufen explizite Näherungen. Die vollständige Funktionsmatrix aus Konzept 1.0 bleibt verbindlich. Version 2 ersetzt dessen Popup-orientierte Desktop-Bedienung.</p><p style="margin-top:9px"><b>Prüfung</b> · 70 Event- und Zustandsprüfungen im DOM-Modell bestanden. Keine reale Browser-, Touch-, Audio- oder Electron-Abnahme in dieser Umgebung.</p></div>`}}
function setFontSize(n){state.fontSize=clamp(n,16,28);document.documentElement.style.setProperty('--editor',state.fontSize+'px');$('#fontSizeLive').textContent=state.fontSize;queryAll('#lyrics textarea').forEach(resizeArea);persist()}
function applyEditorFont(){const value=({sans:'var(--font)',serif:'Georgia, serif',mono:'ui-monospace, monospace'})[state.editorFont||'sans'];document.documentElement.style.setProperty('--lyric-font',value);queryAll('#lyrics textarea').forEach(resizeArea)}
function humanizeDetail(value){
  return String(value||'').replace(/[._-]+/g,' ').replace(/\b\w/g,(char)=>char.toUpperCase());
}
function detailFact(label,value){
  if(value==null||value===''||(Array.isArray(value)&&!value.length))return '';
  const text=Array.isArray(value)?value.map(humanizeDetail).join(', '):String(value);
  return '<div class="detail-fact"><small>'+esc(label)+'</small><b>'+esc(text)+'</b></div>';
}
async function loadSelectedDetail(row){
  const token=++detailRequest;
  selectedDetailStatus='loading';selectedDetail=null;selectedDetailError='';
  renderDetail();
  try{
    const payload=await detailClient.load(row);
    if(token!==detailRequest||selectedResultId!==row.id)return;
    selectedDetail=buildStudioDetailModel(row,payload);
    selectedDetailStatus='ready';
    renderDetail();
  }catch(error){
    if(error?.name==='AbortError')return;
    if(token!==detailRequest)return;
    selectedDetailStatus='error';
    selectedDetailError=error instanceof Error?error.message:String(error);
    selectedDetail=buildStudioDetailModel(row,null);
    renderDetail();
  }
}
function openDetail(word,id=''){
  const row=data().find((item)=>id?item.id===id:item.word===word);
  if(!row)return;
  selectedResult=row.word;selectedResultId=row.id;selectedDetail=null;selectedDetailStatus='idle';selectedDetailError='';saveStudioSearchState({selectedResultId:row.id});
  queryAll('#results .result').forEach(node=>{const active=node.dataset.resultId===row.id;node.classList.toggle('is-selected',active);node.querySelector('[data-detail]')?.setAttribute('aria-pressed',active)});
  $('#detailDock').classList.remove('hidden');
  renderDetail();void loadSelectedDetail(row);
  animateSurface($('#detailDock'));pauseUntil=performance.now()+5000;
}
function renderDetail(){
  const r=data().find((item)=>selectedResultId?item.id===selectedResultId:item.word===selectedResult);if(!r)return;
  const model=selectedDetail&&selectedDetail.key===studioDetailKey(r)
    ?selectedDetail
    :buildStudioDetailModel(r,null);
  const line=song().lines[selection.line]||'';
  const preview=esc(line.slice(0,selection.start))+'<mark>'+esc(r.word)+'</mark>'+esc(line.slice(selection.end));
  const score=model.score>0?Math.round(model.score*100)+'%':null;
  const variants=model.pronunciations.slice(0,4).map((item)=>'<div class="detail-variant"><code>/'+esc(item.ipa)+'/</code><small>'+esc([item.preferred?'Standard':'Variante',item.locale,item.register,item.dialect,item.source].filter(Boolean).join(' · '))+'</small></div>').join('');
  const relationRows=model.relations.slice(0,3).map((item)=>'<span>'+esc(humanizeDetail(item.type))+(item.score?(' · '+Math.round(item.score*100)+'%'):'')+'</span>').join('');
  const facts=[
    detailFact('Betonung',model.primaryStress!=null?('Silbe '+model.primaryStress):model.stressPattern),
    detailFact('Wortart',model.partOfSpeech),
    detailFact('Lemma',model.lemma),
    detailFact('Gebrauch',model.usageRank?('#'+model.usageRank):(model.usageCount!=null?model.usageCount:null)),
    detailFact('Lexik-Tags',model.lexicalTags),
    detailFact('Phrasentyp',model.phraseTypes),
    detailFact('Wortgrenzen',model.crossedWordBoundaries),
    detailFact('Entity',model.categories),
    detailFact('Popularität',model.popularity!=null?(model.popularity+'%'+(model.popularityTier?' · '+model.popularityTier:'')):null),
    detailFact('QID',model.entityQid),
  ].filter(Boolean).join('');
  const sources=model.sources.slice(0,5).map((source)=>'<span>'+esc(source)+'</span>').join('');
  const detailState=selectedDetailStatus==='loading'
    ?'<div class="detail-state">Detaildaten werden geladen …</div>'
    :selectedDetailStatus==='error'
      ?'<div class="detail-state error">Detail-Endpunkt nicht verfügbar · Writer-Zeile wird angezeigt.</div>'
      :'';
  $('#detailBody').innerHTML=`
    <div class="row between"><h3 class="detail-word">${esc(r.word)}</h3><span class="pill">${esc(model.relationLabel.toUpperCase())}</span></div>
    <div class="detail-labels"><span>${model.syllables||'—'} Silbe${model.syllables===1?'':'n'}</span><span>${esc(model.language)}</span><span>${model.kind==='word'?'Wort':model.kind==='phrase'?'Phrase':'Name'}</span>${score?`<span>${score}</span>`:''}${model.generated?'<span>Generated</span>':''}${model.historical?'<span>Historisch</span>':''}</div>
    ${detailState}
    ${model.ipa?`<div class="detail-pronunciation"><code>/${esc(model.ipa)}/</code>${variants&&model.pronunciations.length>1?`<div class="detail-variants">${variants}</div>`:''}</div>`:''}
    ${relationRows?`<div class="detail-relations"><small>Klangbeziehungen</small><div>${relationRows}</div></div>`:''}
    ${facts?`<div class="detail-fact-grid">${facts}</div>`:''}
    ${sources?`<div class="detail-sources"><small>Quelle / Provenienz</small><div>${sources}</div></div>`:''}
    <div class="detail-preview" aria-label="Vorschau nach Ersetzung">${preview||esc(r.word)}</div>
    <div class="detail-bottom"><small>Live Writer · ${esc(model.detailSource)} · Bar ${selection.line+1}</small><div class="row"><button data-save="${esc(r.word)}" class="outline">${state.saved.some(s=>s.word===r.word)?'✓ Gemerkt':'◇ Merken'}</button><button data-insert="${esc(r.word)}" class="primary">Einsetzen ↵</button></div></div>`;
}
function closeDetail(){detailClient.cancel();detailRequest++;selectedResult='';selectedResultId='';selectedDetail=null;selectedDetailStatus='idle';selectedDetailError='';saveStudioSearchState({selectedResultId:''});$('#detailDock').classList.add('hidden');$('#resultsScroll').focus()}
function moveResult(delta){const rows=sortedData();if(!rows.length)return;let index=rows.findIndex(r=>selectedResultId?r.id===selectedResultId:r.word===selectedResult);index=index<0?(delta>0?0:rows.length-1):Math.max(0,Math.min(rows.length-1,index+delta));if(index>=pageSize){pageSize=index+12;renderResults()}openDetail(rows[index].word,rows[index].id);const row=queryAll('#results .result').find(r=>r.dataset.resultId===selectedResultId);row?.scrollIntoView?.({block:'nearest',behavior:'smooth'})}
function setAssistWidth(value){const max=clamp(window.innerWidth-660,350,640);const width=clamp(value,350,max);document.documentElement.style.setProperty('--assist-width',width+'px');$('#splitter').setAttribute('aria-valuenow',width);$('#splitter').setAttribute('aria-valuemax',max);state.assistWidth=width;queryAll('#lyrics textarea').forEach(resizeArea);}
function bindV2(){for(const id of ['directBasis','directLang','directRelation','directSyllables','directSort','advancedFiltersToggle','advancedFilters','advancedPreset','advancedRhymeType','advancedVariants','advancedEntityCategory','advancedHideUsed','advancedHistorical','advancedGenerated','advancedGeneratedOnly','detailDock','editorDock','splitter','pinAnchor','followBtn','resetInline'])if(!$('#'+id))throw Error('Studio 02 Control fehlt: '+id);document.documentElement.dataset.motion=state.motion;pageSize=density==='compact'?24:12;applyEditorFont();bindThemeQuickMenu();$('#fontDown').onclick=()=>setFontSize(state.fontSize-1);$('#fontUp').onclick=()=>setFontSize(state.fontSize+1);$('#followBtn').onclick=toggleFollow;$('#pinAnchor').onclick=toggleFollow;$('#closeDetail').onclick=closeDetail;$('#closeEditorDock').onclick=closeEditorDock;$('#resetInline').onclick=resetInline;$('#infoBtn').onclick=()=>openEditorDock('notes');$('#directBasis').onchange=e=>{basis=e.target.value;void refreshWriterResults()};
$('#directLang').onchange=e=>{resultLang=e.target.value;void refreshWriterResults()};
$('#directRelation').onchange=e=>{relation=e.target.value;renderResults()};
$('#directSyllables').onchange=e=>{syllableMode=e.target.value;saveStudioSearchState();renderResults()};
$('#directSort').onchange=e=>{sort=e.target.value;saveStudioSearchState();renderResults()};
$('#advancedFiltersToggle').onclick=()=>{advancedExpanded=!advancedExpanded;syncAdvancedControls();if(advancedExpanded)animateSurface($('#advancedFilters'))};
$('#advancedPreset').onchange=e=>applySearchPreset(e.target.value);
$('#advancedHideUsed').onchange=e=>{hideUsed=e.target.checked;state.hideUsed=hideUsed;persist();renderResults()};
$('#advancedRhymeType').onchange=e=>{rhymeType=e.target.value;void refreshWriterResults()};
$('#advancedVariants').onchange=e=>{variantMode=e.target.value;void refreshWriterResults()};
$('#advancedEntityCategory').onchange=e=>{entityCategory=e.target.value;void refreshWriterResults()};
$('#advancedHistorical').onchange=e=>{includeHistorical=e.target.checked;void refreshWriterResults()};
$('#advancedGenerated').onchange=e=>{generated=e.target.checked;if(!generated)generatedOnly=false;syncAdvancedControls();void refreshWriterResults()};
$('#advancedGeneratedOnly').onchange=e=>{generatedOnly=e.target.checked;if(generatedOnly)generated=true;syncAdvancedControls();void refreshWriterResults()};queryAll('[data-density]').forEach(b=>b.onclick=()=>setDensity(b.dataset.density));queryAll('[data-dock]').forEach(b=>b.onclick=()=>{if(dockTab===b.dataset.dock)closeEditorDock();else{if(b.dataset.dock==='history')revision();openEditorDock(b.dataset.dock)}});$('#resultsScroll').addEventListener('keydown',e=>{if(e.target.closest('input')||e.target.closest('select')||e.target.closest('.view-choices'))return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();moveResult(e.key==='ArrowDown'?1:-1)}else if(e.key==='Enter'&&selectedResult&&!e.target.closest('[data-save]')&&!e.target.closest('[data-insert]')){e.preventDefault();insertWord(selectedResult)}else if(e.key===' '&&selectedResult&&!e.target.closest('[data-save]')&&!e.target.closest('[data-insert]')){e.preventDefault();toggleSave(selectedResult)}else if(e.key==='Escape')closeDetail()});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.clearFilter){
  const f=b.dataset.clearFilter;
  if(f==='scope'){scope='all';queryAll('[data-scope]').forEach(x=>{x.classList.toggle('active',x.dataset.scope==='all');x.setAttribute('aria-pressed',x.dataset.scope==='all')})}
  if(f==='relation')relation='all';
  if(f==='rhymeType')rhymeType='all';
  if(f==='syllables')syllableMode='all';
  if(f==='lang')resultLang='both';
  if(f==='basis')basis='de';
  if(f==='sort')sort='recommended';
  if(f==='variants')variantMode='preferred';
  if(f==='entityCategory')entityCategory='all';
  if(f==='historical')includeHistorical=false;
  if(f==='generated'){generated=false;generatedOnly=false}
  if(f==='generatedOnly')generatedOnly=false;
  if(['scope','rhymeType','lang','basis','variants','entityCategory','historical','generated','generatedOnly'].includes(f))void refreshWriterResults();else renderResults();
}if(b.dataset.restoreVersion){const text=song().revisions[+b.dataset.restoreVersion].text;pushUndo();revision();song().lines=text.split('\n');activeLine=0;selection={line:0,start:0,end:0};renderEditor();changed();renderDock();notify('Fassung wiederhergestellt · aktuelle Fassung gesichert')}});
document.addEventListener('keydown',e=>{if($('#dialog').open)return;if(e.altKey&&e.key.toLowerCase()==='r'){e.preventDefault();if(page==='library'||page==='saved')navigate('studio');if(window.innerWidth<=800){document.body.classList.add('mobile-results');setMobileActive('results')}$('#searchInput').focus();$('#searchInput').select()}if(e.altKey&&e.key.toLowerCase()==='e'){e.preventDefault();navigate('studio');setMode('write');focusLine(activeLine)}if(e.altKey&&e.key==='3'){e.preventDefault();navigate('studio');setMode('perform')}if(e.altKey&&e.key.toLowerCase()==='l'){e.preventDefault();setDensity(nextDensity(density))}if(e.key==='Escape'){if(!$('#detailDock').classList.contains('hidden'))closeDetail();else if(dockTab)closeEditorDock();else if(document.body.classList.contains('focus'))toggleFocus()}});
const handle=$('#splitter');let drag=null;handle.addEventListener('pointerdown',e=>{if(window.innerWidth<=800)return;drag={x:e.clientX,width:+handle.getAttribute('aria-valuenow')};handle.setPointerCapture?.(e.pointerId);document.body.classList.add('resizing');e.preventDefault()});handle.addEventListener('pointermove',e=>{if(drag)setAssistWidth(drag.width+drag.x-e.clientX)});for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,()=>{if(!drag)return;drag=null;document.body.classList.remove('resizing');persist()});handle.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setAssistWidth(+handle.getAttribute('aria-valuenow')+(e.key==='ArrowLeft'?20:-20));persist()}if(e.key==='Home'){e.preventDefault();setAssistWidth(470);persist()}});if(window.innerWidth>800)setAssistWidth(state.assistWidth||470);if(window.innerWidth<=800){$('#directFilters').classList.add('hidden');$('#filterBtn').setAttribute('aria-expanded','false')}window.addEventListener('resize',()=>{if(window.innerWidth>800)setAssistWidth(state.assistWidth||470)});document.body.dataset.studioVersion='2';}

try{bind();bindV2();void initializeDocumentStore();const capabilitiesReady=refreshStudioCapabilities();applyThemeChoice(state.theme,{persistState:false});document.documentElement.style.setProperty('--editor',state.fontSize+'px');activeLine=Math.min(activeLine,song().lines.length-1);const initialText=song().lines[activeLine]||'';const lastWord=initialText.match(/[\p{L}\p{N}'’-]+$/u);selection={line:activeLine,start:lastWord?initialText.length-lastWord[0].length:initialText.length,end:initialText.length};if(sharedSearchState.anchor){query=sharedSearchState.anchor;followSelection=!lastWord||lastWord[0]===sharedSearchState.anchor}else if(lastWord)query=lastWord[0];syncFollowControls();renderEditor();renderResults();capabilitiesReady.finally(()=>{void refreshWriterResults()});revision();persist();}catch(e){document.body.dataset.controls='failed';const banner=document.createElement('div');banner.className='startup-failure';banner.textContent='Die Demo konnte nicht vollständig starten. Bitte neu laden. '+e.message;document.body.prepend(banner);console.error(e)}

