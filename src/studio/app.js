
import {$,queryAll,esc,icon,clamp} from './studio-core.mjs';
import {STUDIO_DEMO_LINES,STUDIO_PREFERENCES_KEY,loadStudioPreferences,loadStudioState,studioPreferencesFromState,studioStateFromDocumentSnapshot,writeStudioPreferences,writeStudioState} from './document-adapter.mjs';
import {createWriterSearchClient,estimateSyllables} from './search-adapter.mjs';
import {STUDIO_RHYME_TYPE_LABELS,filterStudioWriterRows,sortStudioWriterRows} from './search-filters.mjs';
import {SEARCH_STATE_STORAGE_KEY,createSearchState,loadSearchState,saveSearchState} from './search-state.mjs';
import {nextDensity,normalizeDensity,setExclusivePressed} from './studio-controls.mjs';
import {loadStudioCapabilities} from './capability-adapter.mjs';
import {buildStudioDetailModel,createStudioDetailClient,studioDetailKey} from './detail-adapter.mjs';
import {createStudioAnalysisClient,studioAnalysisWords} from './analysis-adapter.mjs';
import {barIdentity,createSelectionProof,duplicateEditorBar,editorSnapshot,ensureEditorSong,insertEditorBar,mergeEditorBarWithPrevious,moveEditorBar,pasteEditorText,removeEditorBar,restoreEditorSnapshot,setEditorBarText,splitEditorBar,validateSelectionProof} from './editor-session.mjs';
import {autoMapPerformanceBar,clearPerformanceBar,ensurePerformanceSong,getPerformanceCue,markPerformanceReviewed,movePerformanceCue,performanceBarDurationMs,performanceBarMetrics,performanceConfig,performanceCueSymbol,performanceFlowFingerprint,performanceNeedsReview,performancePocketMetrics,performancePreviousBarPlacements,performanceStepDurationMs,performanceSyllablesPerSecond,setPerformanceConfig,setPerformanceCue} from './performance-session.mjs';
import {installMobileViewportController,mobileScrollDeltaForRect,mobileViewportMetrics} from './mobile-viewport.mjs';
import {createPortableStudioBackup,parsePortableStudioBackup,portableBackupFilename} from './backup-portability.mjs';
import {collectStudioEnvironmentDiagnostics,diagnosticsFilename} from './diagnostics.mjs';
import {
  browserRuntimeMetrics,
  internalDbLabCopyPayload,
  internalDbSummaryMap,
  loadInternalDbLabSelection,
  saveInternalDbLabSelection,
  studioCapabilitiesFromInternalDb,
  studioRuntimeMetrics,
} from './internal-db-lab.mjs';
import {
  INTERNAL_DB_BENCHMARK_SUITE,
  runInternalDbBenchmark,
} from './internal-db-benchmark.mjs';
import {createStudioDomLocalizer,normalizeStudioUiLanguage} from './i18n.mjs';
import {commandShortcutText,rankStudioCommands,studioCommandGroups} from './command-palette.mjs';
import {STUDIO_DEVICE_GATES,createStudioDeviceAcceptance,mergeStudioDeviceAcceptanceReports,parseStudioDeviceAcceptance,studioDeviceAcceptanceFilename,studioDeviceAcceptanceSummary,studioDeviceEnvironmentLabel,studioDeviceGateEnvironmentStatus} from './device-acceptance.mjs';
import {createTypingUndoCoalescer} from './edit-history.mjs';
import {studioParityGroups,studioParitySummary} from './parity-manifest.mjs';
import {runStudioDomAcceptance} from './dom-acceptance.mjs';
import {createStudioDocumentStore,migrateLegacyStudioStateToStore,shadowLegacyStudioStateToStore} from './document-store.mjs';

'use strict';
const initial=STUDIO_DEMO_LINES;
const legacyStudioState=loadStudioState();
let state={...legacyStudioState,...loadStudioPreferences()};
function normalizeFolderSegment(value){
  return String(value??'').normalize('NFKC').replace(/[\\/]+/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
}
function normalizeFolderName(value){
  return String(value??'').normalize('NFKC').split(/[\\/]+/g).map(normalizeFolderSegment).filter(Boolean).join('/').slice(0,180);
}
function folderParent(folder){
  const normalized=normalizeFolderName(folder),index=normalized.lastIndexOf('/');
  return index<0?'':normalized.slice(0,index);
}
function folderLeaf(folder){
  const normalized=normalizeFolderName(folder),index=normalized.lastIndexOf('/');
  return index<0?normalized:normalized.slice(index+1);
}
function folderDepth(folder){return normalizeFolderName(folder).split('/').filter(Boolean).length-1}
function folderContains(parent,folder){
  const root=normalizeFolderName(parent),candidate=normalizeFolderName(folder);
  return Boolean(root&&candidate&&(candidate===root||candidate.startsWith(root+'/')));
}
function expandFolderPaths(values){
  const out=[],seen=new Set();
  for(const value of values){
    const path=normalizeFolderName(value);
    if(!path)continue;
    const parts=path.split('/');
    for(let index=1;index<=parts.length;index++){
      const current=parts.slice(0,index).join('/');
      if(!seen.has(current)){seen.add(current);out.push(current)}
    }
  }
  return out;
}
function normalizeStudioRuntimeState(){
  state.uiLanguage=normalizeStudioUiLanguage(state.uiLanguage);
  state.customThemes=Array.isArray(state.customThemes)?state.customThemes:[];
  state.themeSlots=state.themeSlots&&typeof state.themeSlots==='object'?{light:state.themeSlots.light||null,dark:state.themeSlots.dark||null}:{light:null,dark:null};
  if(!['light','dark'].includes(state.theme)&&!state.customThemes.some(theme=>theme.id===state.theme))state.theme='dark';
  state.songs=Array.isArray(state.songs)?state.songs:[];
  state.folders=expandFolderPaths([
    ...(Array.isArray(state.folders)?state.folders:[]),
    ...state.songs.map((item)=>item.folder),
    'Entwürfe',
  ]);
  state.songs.forEach((item)=>{
    item.folder=normalizeFolderName(item.folder)||'Entwürfe';
    item.createdAt=Number.isFinite(Number(item.createdAt))?Number(item.createdAt):0;
    const latestRevision=Array.isArray(item.revisions)
      ?item.revisions.reduce((latest,row)=>Math.max(latest,Number(row?.at)||0),0)
      :0;
    item.updatedAt=Math.max(Number(item.updatedAt)||0,latestRevision,item.createdAt);
    if(item.deleted&&item.deletedAt==null)item.deletedAt=Math.max(item.updatedAt,1);
    ensureEditorSong(item);
  });
  if(!state.songs.some((item)=>item.id===state.active&&!item.deleted&&!item.deletedAt)){
    state.active=state.songs.find((item)=>!item.deleted&&!item.deletedAt)?.id||state.songs[0]?.id||null;
  }
}
normalizeStudioRuntimeState();
let libraryView={trash:false,query:'',folder:'all',sort:'updated'};

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
let themeEditingId='',themePreviewing=false,themeQuickCloseTimer=0;
let studioCapabilities={status:'loading'};
let sharedSearchState=localStorage.getItem(SEARCH_STATE_STORAGE_KEY)?loadSearchState():createSearchState({queryBasis:'de',resultLanguage:'both'}),pendingSharedResultId=sharedSearchState.selectedResultId||'';
const writerSearch=createWriterSearchClient();
const internalBenchmarkSearch=createWriterSearchClient();
const detailClient=createStudioDetailClient();
const analysisClient=createStudioAnalysisClient();
const documentStore=createStudioDocumentStore();
let writerRows=[],writerStatus='idle',writerError='',writerQuerySyllables=0,writerWarnings=[],writerRuntimeTiming=null,writerCapabilities=null,writerDebounce=0;
let writerClientTiming=null,writerServerTransport=null,writerEffectiveRequest=null,writerExecution=null,lastResultRenderMs=null;
let internalDbLabEnabled=false,internalDbLabPayload=null,internalDbLabActive=loadInternalDbLabSelection(),internalDbLabMetricsOpen=false;
let internalDbBenchmarkReport=null,internalDbBenchmarkAbort=null,internalDbBenchmarkState=null;
let selectedDetail=null,selectedDetailStatus='idle',selectedDetailError='',detailRequest=0;
let analysisStatus='idle',analysisData=null,analysisError='',analysisRequest=0,analysisSignature='',analysisAbort=null,analysisRelationMode='all',analysisChainVisible=false;
let documentStoreStatus='idle',documentStoreError='',documentStoreInitialized=false,documentStoreAuthority=false,documentShadowTimer=0,documentSaveGeneration=0,documentSaveChain=Promise.resolve(),mobileViewportCleanup=null;
let uiLocalizer=null;
const DEVICE_ACCEPTANCE_STORAGE_KEY='rhymelab.studio.deviceAcceptance.v1';
let studioDeviceAcceptance=(()=>{
  try{
    const raw=localStorage.getItem(DEVICE_ACCEPTANCE_STORAGE_KEY);
    return raw?parseStudioDeviceAcceptance(raw):null;
  }catch{return null}
})();
let activeDeviceGateGuide='';
const typingUndo=createTypingUndoCoalescer({windowMs:1100});
let activeLine=3,selection={line:3,start:initial[3].lastIndexOf('Nacht'),end:initial[3].length},mode='write',page='studio',
  query=sharedSearchState.anchor||'Nacht',
  scope=({words:'word',phrases:'phrase',entities:'entity'})[sharedSearchState.scope]||'all',
  relation='all',
  rhymeType=sharedSearchState.rhymeType,
  variantMode=sharedSearchState.variantMode,
  entityCategory=sharedSearchState.entityCategory,
  entityCategories=Array.isArray(sharedSearchState.entityCategories)?[...sharedSearchState.entityCategories]:[],
  includeHistorical=sharedSearchState.historical,
  generated=sharedSearchState.generated,
  generatedOnly=sharedSearchState.generatedOnly,
  advancedExpanded=false,
  hideUsed=state.hideUsed!==false,
  hiddenUsedCount=0,
  sort=sharedSearchState.sort,
  basis=sharedSearchState.queryBasis,
  resultLang=sharedSearchState.resultLanguage,
  pageSize=6,auto=false,pauseUntil=0,scrollFrame=0,lastFrame=0,undo=[],redo=[],composingBarId='',compositionCommitBarId='',compositionCommitValue='',saveTimer,toastTimer,playing=false,tick=0,playTimer,cue='hit',performanceMoveFrom=null,audioContext;
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
    entityCategories,
    selectedResultId:selectedResultId||'',
    ...overrides,
  });
  saveSearchState(sharedSearchState);
  return sharedSearchState;
}
function setStudioUiLanguage(value,{persistState=true,notifyUser=false}={}){
  state.uiLanguage=normalizeStudioUiLanguage(value);
  document.documentElement.lang=state.uiLanguage;
  uiLocalizer?.setLanguage(state.uiLanguage);
  const quick=$('#uiLanguageBtn');
  if(quick){
    quick.textContent=state.uiLanguage.toUpperCase();
    quick.setAttribute('aria-label',state.uiLanguage==='de'?'Switch interface to English':'Oberfläche auf Deutsch umstellen');
    quick.title=state.uiLanguage==='de'?'UI: Deutsch · click for English':'UI: English · Klick für Deutsch';
  }
  if($('#uiLanguageSelect'))$('#uiLanguageSelect').value=state.uiLanguage;
  renderActiveDeviceGuide();
  if(persistState)persist();
  if(notifyUser)notify(state.uiLanguage==='en'?'Interface language: English':'Oberflächensprache: Deutsch');
  return state.uiLanguage;
}
function toggleStudioUiLanguage(){
  setStudioUiLanguage(state.uiLanguage==='de'?'en':'de',{notifyUser:true});
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
  return ensurePerformanceSong(ensureEditorSong(current));
}
const syll=estimateSyllables;
function documentStoreDetail(){
  if(documentStoreStatus==='ready')return documentStoreAuthority?'IndexedDB · autoritativ':'IndexedDB · bereit';
  if(documentStoreStatus==='saving')return 'IndexedDB · synchronisiert …';
  if(documentStoreStatus==='unsupported')return 'nicht verfügbar · LocalStorage-Fallback';
  if(documentStoreStatus==='error')return documentStoreError||'Fehler';
  return 'wird vorbereitet';
}
function cloneStudioStateForPersistence(){
  try{return structuredClone(state)}
  catch{return JSON.parse(JSON.stringify(state))}
}
function queueDocumentShadow(delay=180){
  if(!documentStoreInitialized)return 0;
  clearTimeout(documentShadowTimer);
  const generation=++documentSaveGeneration;
  documentShadowTimer=setTimeout(()=>{void syncDocumentShadow(generation)},delay);
  return generation;
}
function syncDocumentShadow(generation=documentSaveGeneration){
  if(!documentStoreInitialized)return Promise.resolve(false);
  const snapshotState=cloneStudioStateForPersistence();
  documentStoreStatus='saving';
  if($('#saveState'))$('#saveState').textContent='Speichert in IndexedDB …';
  updateCapabilitySurface();
  documentSaveChain=documentSaveChain.catch(()=>{}).then(async()=>{
    try{
      await shadowLegacyStudioStateToStore(snapshotState,documentStore);
      documentStoreAuthority=true;
      if(generation===documentSaveGeneration){
        documentStoreStatus='ready';documentStoreError='';
        if($('#saveState'))$('#saveState').textContent='IndexedDB gespeichert';
        updateCapabilitySurface();
      }
      return true;
    }catch(error){
      if(generation===documentSaveGeneration){
        documentStoreStatus='error';
        documentStoreError=error instanceof Error?error.message:String(error);
        if($('#saveState'))$('#saveState').textContent='IndexedDB-Speichern fehlgeschlagen';
        updateCapabilitySurface();
      }
      return false;
    }
  });
  return documentSaveChain;
}
async function initializeDocumentStore(){
  try{
    const available=await documentStore.available();
    if(!available){
      documentStoreStatus='unsupported';
      documentStoreAuthority=false;
      updateCapabilitySurface();
      return false;
    }
    documentStoreStatus='saving';updateCapabilitySurface();

    let snapshot=null;
    try{
      snapshot=await documentStore.loadSnapshot();
    }catch{
      // Existing v1/corrupt snapshots are never trusted over the still-intact
      // legacy source. Re-migrate from that source and verify before cutover.
      snapshot=null;
    }
    if(!snapshot){
      const migrated=await migrateLegacyStudioStateToStore(legacyStudioState,documentStore);
      snapshot=migrated.migration.snapshot;
    }
    state=studioStateFromDocumentSnapshot(snapshot,{...state,...loadStudioPreferences()});
    normalizeStudioRuntimeState();
    writeStudioPreferences(state);
    documentStoreInitialized=true;
    documentStoreAuthority=true;
    documentStoreStatus='ready';documentStoreError='';
    updateCapabilitySurface();
    return true;
  }catch(error){
    documentStoreAuthority=false;
    documentStoreStatus='error';
    documentStoreError=error instanceof Error?error.message:String(error);
    try{writeStudioState(state)}catch{}
    updateCapabilitySurface();
    return false;
  }
}
function persist(){
  try{
    writeStudioPreferences(state);
    if(documentStoreAuthority||documentStoreInitialized){
      if($('#saveState'))$('#saveState').textContent='Speichert in IndexedDB …';
      queueDocumentShadow();
    }else{
      writeStudioState(state);
      if($('#saveState'))$('#saveState').textContent='Lokal gespeichert · Fallback';
    }
    return true;
  }catch(e){
    if($('#saveState'))$('#saveState').textContent='Speichern nicht möglich · bitte exportieren';
    return false;
  }
}
async function flushStudioPersistence(reason='explicit_flush'){
  clearTimeout(saveTimer);
  clearTimeout(documentShadowTimer);
  revision(reason);
  writeStudioPreferences(state);
  if(documentStoreInitialized){
    const generation=++documentSaveGeneration;
    return syncDocumentShadow(generation);
  }
  writeStudioState(state);
  if($('#saveState'))$('#saveState').textContent='Lokal gespeichert · Fallback';
  return true;
}
function updateUndoRedoButtons(){
  const undoButton=$('#undoBtn'),redoButton=$('#redoBtn');
  if(undoButton){undoButton.disabled=undo.length===0;undoButton.setAttribute('aria-disabled',String(undo.length===0))}
  if(redoButton){redoButton.disabled=redo.length===0;redoButton.setAttribute('aria-disabled',String(redo.length===0))}
}
function pushUndo({coalesced=false}={}){
  if(!coalesced)typingUndo.noteBoundary();
  undo.push(editorSnapshot(song()));
  if(undo.length>80)undo.shift();
  redo.length=0;
  updateUndoRedoButtons();
}
function performUndo(){
  typingUndo.noteBoundary();
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
  typingUndo.noteBoundary();
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
function revision(reason='autosave'){
  const s=song();
  s.revisions=s.revisions||[];
  const snapshot=editorSnapshot(s);
  const text=snapshot.lines.join('\n');
  const snapshotSignature=JSON.stringify(snapshot);
  const previous=s.revisions.at(-1);
  const previousSignature=previous?.snapshotSignature
    ||(previous?.snapshot?JSON.stringify(previous.snapshot):previous?.text);
  if(previousSignature!==snapshotSignature){
    const at=Date.now();
    s.revisions.push({at,text,reason,snapshot,snapshotSignature});
    s.revisions=s.revisions.slice(-30);
    s.updatedAt=Math.max(Number(s.updatedAt)||0,at);
  }
}
function restoreStudioRevision(entry){
  if(!entry)return false;
  const current=song();
  pushUndo();
  revision('before_restore');
  if(entry.snapshot)restoreEditorSnapshot(current,entry.snapshot);
  else{
    current.lines=String(entry.text??'').split('\n');
    current.barIds=[];current.barRevisions=[];
    ensureEditorSong(current);
  }
  activeLine=0;
  selection={line:0,start:0,end:0};
  renderEditor();
  changed();
  return true;
}
function changed(){const s=song();s.updatedAt=Date.now();$('#saveState').textContent='Speichert …';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{revision('autosave');persist()},650);updateStats() }
function notify(t){$('#toast').textContent=t;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3300)}
function ensureActiveBarVisible({behavior}={}){
  const metrics=mobileViewportMetrics(window);
  if(!metrics.isMobile||page!=='studio'||mode!=='write'||document.body.classList.contains('mobile-results'))return;
  const focused=document.activeElement?.matches?.('#lyrics textarea')?document.activeElement:null;
  const target=focused||$('#lyrics textarea[data-line="'+activeLine+'"]');
  const scroller=$('#editorScroll');
  if(!target||!scroller)return;
  const delta=mobileScrollDeltaForRect(target.getBoundingClientRect(),metrics,{
    topInset:70,
    bottomInset:metrics.keyboardOpen?28:82,
  });
  if(Math.abs(delta)<2)return;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  scroller.scrollBy({
    top:delta+(delta>0?14:-14),
    behavior:behavior||(reduced?'auto':'smooth'),
  });
}
function bindMobileViewport(){
  mobileViewportCleanup?.();
  mobileViewportCleanup=installMobileViewportController({
    windowObj:window,
    documentElement:document.documentElement,
    onChange:(metrics)=>{
      if(metrics.isMobile&&document.activeElement?.matches?.('#lyrics textarea')){
        requestAnimationFrame(()=>ensureActiveBarVisible({behavior:'auto'}));
      }
    },
  });
}
function resizeArea(el){el.style.height='34px';el.style.height=el.scrollHeight+'px'}
function renderEditor(){
  const s=song();
  $('#songTitle').textContent=s.title;
  $('#lyrics').innerHTML=s.lines.map((line,index)=>{
    const bar=barIdentity(s,index);
    return `<div class="lyric-line ${index===activeLine?'active':''}" data-bar-id="${esc(bar.id)}"><button class="line-no" data-line="${index}" data-bar-id="${esc(bar.id)}" aria-label="Bar ${index+1} auswählen">${String(index+1).padStart(2,'0')}</button><textarea aria-label="Text Bar ${index+1}" data-line="${index}" data-bar-id="${esc(bar.id)}" data-bar-revision="${bar.revision}" rows="1" spellcheck="false">${esc(line)}</textarea><button class="syllable" data-bar-inspect="${index}" aria-label="Bar ${index+1} analysieren" title="Lokale Silbenschätzung · Klick für Bar Inspector">${syll(line)||'—'}</button></div>`;
  }).join('');
  queryAll('#lyrics textarea').forEach((el)=>{
    resizeArea(el);
    el.addEventListener('focus',()=>{
      activateLine(+el.dataset.line);
      requestAnimationFrame(()=>ensureActiveBarVisible());
    });
    el.addEventListener('pointerdown',()=>typingUndo.noteBoundary(),{passive:true});
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
      else if(!event.isComposing&&composingBarId!==el.dataset.barId){
        const shouldCheckpoint=typingUndo.shouldCheckpoint({
          songId:song().id,
          barId:el.dataset.barId,
          inputType:event.inputType,
          now:Date.now(),
          composing:false,
        });
        if(shouldCheckpoint)pushUndo({coalesced:true});
      }
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
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))typingUndo.noteBoundary();
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
  queryAll('[data-bar-inspect]').forEach((el)=>el.onclick=()=>{
    activeLine=+el.dataset.barInspect;
    activateLine(activeLine);
    openEditorDock('bar');
  });
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
    requestAnimationFrame(()=>ensureActiveBarVisible());
  }
}
function activateLine(index){
  activeLine=index;
  queryAll('.lyric-line').forEach((el,n)=>el.classList.toggle('active',n===index));
  $('#activeBarLabel').textContent=`Bar ${String(index+1).padStart(2,'0')} ausgewählt`;
  $('#mobileAnchor').textContent=`Bar ${index+1}: ${song().lines[index]||'Neue Zeile'}`;
  if(dockTab==='bar'&&!$('#editorDock')?.classList.contains('hidden'))renderDock();
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
function updateStats(){const s=song();const words=s.lines.join(' ').trim().split(/\s+/).filter(Boolean).length,totalSyllables=s.lines.reduce((sum,line)=>sum+syll(line),0),durationSeconds=(performanceBarDurationMs(s)*s.lines.length)/1000;$('#docStats').textContent=`${s.lines.length} Bars · ${words} Wörter`;$('#footerStats').textContent=`${s.lines.length} Bars · ${words} Wörter · ${totalSyllables} Silben≈ · ${durationSeconds.toFixed(1)} s≈ @ ${performanceConfig(s).bpm} BPM`;$('#miniDensity').innerHTML=s.lines.slice(0,16).map(x=>`<i style="height:${Math.max(3,syll(x)*1.5)}px"></i>`).join('');$('#savedCount').textContent=state.saved.length;activateLine(Math.min(activeLine,s.lines.length-1))}
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
function currentWriterSearchOptions(overrides={}){
  return {
    query:String(query||'').trim(),
    queryBasis:basis,
    resultLanguage:resultLang,
    scope,
    rhymeType,
    includeVariants:variantMode==='all',
    includeHistorical,
    generated,
    generatedOnly,
    entityCategory,
    entityCategories:[...entityCategories],
    queryPronunciationRevision:studioCapabilities.queryPronunciationRevision||'',
    runtimeDb:internalDbLabEnabled?internalDbLabActive:'',
    ...overrides,
  };
}
function currentSearchUiState(){
  return {
    scope,
    relation,
    rhymeType,
    syllableMode,
    sort,
    queryBasis:basis,
    resultLanguage:resultLang,
    variantMode,
    includeHistorical,
    generated,
    generatedOnly,
    entityCategory,
    entityCategories:[...entityCategories],
    hideUsed,
    density,
  };
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
    const result=await writerSearch.search(currentWriterSearchOptions({
      query:requestedQuery,
    }));
    if(requestedQuery!==query)return;
    if(internalDbLabEnabled&&result.runtimeDb!==internalDbLabActive){
      throw new Error('Internal DB routing mismatch: expected '+internalDbLabActive+' but backend returned '+String(result.runtimeDb));
    }
    writerRows=result.rows;
    writerQuerySyllables=result.querySyllables;
    writerWarnings=result.warnings;
    writerRuntimeTiming=result.runtimeTiming;
    writerClientTiming=result.clientTiming||null;
    writerServerTransport=result.serverTransport||null;
    writerEffectiveRequest=result.effectiveRequest||null;
    writerExecution=result.runtimeExecution||null;
    writerCapabilities=result.capabilities||writerCapabilities;
    if(internalDbLabEnabled&&internalDbLabPayload){
      const row=internalDbLabPayload.databases?.find((item)=>item.id===internalDbLabActive);
      if(row)row.queryTiming=writerRuntimeTiming;
    }
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
    writerClientTiming=null;
    writerServerTransport=null;
    writerEffectiveRequest=null;
    writerExecution=null;
    writerStatus='error';
    writerError=error instanceof Error?error.message:String(error);
    renderResults();
  }
}

function insertWord(word){const s=song();const {line,start,end}=selection;if(!s.lines[line]&&s.lines[line]!==''){notify('Bitte zuerst eine Textstelle auswählen.');return}pushUndo();const source=s.lines[line];const bar=setEditorBarText(s,line,source.slice(0,start)+word+source.slice(end));selection={line,barId:bar?.id||'',barRevision:bar?.revision||0,start,end:start+word.length};activeLine=line;renderEditor();changed();navigate('studio');setMode('write');const el=$(`#lyrics textarea[data-line="${line}"]`);el.focus();el.setSelectionRange(start,start+word.length);captureSelection(el);notify(`„${word}“ eingesetzt · Rückgängig verfügbar`)}
function toggleSave(word){const i=state.saved.findIndex(x=>x.word===word);if(i>=0)state.saved.splice(i,1);else state.saved.push({word,anchor:query});persist();renderResults();updateStats();if(page==='saved')renderSaved()}
function libraryTimestamp(item){return Math.max(Number(item?.updatedAt)||0,Number(item?.createdAt)||0)}
function touchSong(item,at=Date.now()){if(item)item.updatedAt=Math.max(Number(item.updatedAt)||0,Number(at)||0)}
function folderChildren(parent,folders=state.folders){
  const root=normalizeFolderName(parent);
  return folders.filter((folder)=>folderParent(folder)===root);
}
function flattenFolderHierarchy(overrides=new Map()){
  const ordered=[],seen=new Set(),source=state.folders.slice();
  const walk=(parent)=>{
    const children=overrides.get(parent)||folderChildren(parent,source);
    for(const child of children){
      if(seen.has(child))continue;
      seen.add(child);ordered.push(child);walk(child);
    }
  };
  walk('');
  for(const folder of source)if(!seen.has(folder)){seen.add(folder);ordered.push(folder);walk(folder)}
  return ordered;
}
function canonicalizeFolderOrder(overrides){
  state.folders=flattenFolderHierarchy(overrides);
}
function ensureLibraryFolder(name){
  const normalized=normalizeFolderName(name)||'Entwürfe';
  const paths=expandFolderPaths([normalized]);
  for(const path of paths)if(!state.folders.includes(path))state.folders.push(path);
  canonicalizeFolderOrder();
  return normalized;
}
function libraryFolders(){return state.folders.slice()}
function openSong(id){
  const target=state.songs.find((item)=>item.id===id&&!item.deleted);
  if(!target)return;
  revision();
  state.active=target.id;
  activeLine=0;
  selection={line:0,start:0,end:0};
  undo=[];redo=[];
  persist();
  renderEditor();
  renderProjects();
  navigate('studio');
  setMode('write');
}
function renderProjects(){
  const rows=state.songs.filter((item)=>!item.deleted).slice().sort((a,b)=>libraryTimestamp(b)-libraryTimestamp(a)||a.title.localeCompare(b.title,'de')).slice(0,6);
  $('#projectList').innerHTML=rows.map((item)=>`<button data-song="${esc(item.id)}" class="${item.id===state.active?'current':''}" title="${esc(item.folder||'Entwürfe')}"><span class="project-dot"></span>${esc(item.title)}</button>`).join('');
}
function createLibraryFolder(){
  nameDialog('Neuer Ordner','Neuer Ordner',(value)=>{
    const name=normalizeFolderName(value);
    if(!name)return;
    if(state.folders.some((item)=>item.localeCompare(name,'de',{sensitivity:'base'})===0)){
      notify('Ordner existiert bereits.');
      return;
    }
    ensureLibraryFolder(name);
    libraryView.folder=name;
    persist();
    renderLibrary(false);
    notify('Ordner angelegt.');
  });
}
function createLibrarySubfolder(parent){
  const root=normalizeFolderName(parent);
  if(!root)return;
  nameDialog('Unterordner in „'+folderLeaf(root)+'“','Neuer Ordner',(value)=>{
    const leaf=normalizeFolderSegment(value);
    if(!leaf)return;
    const path=root+'/'+leaf;
    if(state.folders.some((item)=>item.localeCompare(path,'de',{sensitivity:'base'})===0)){
      notify('Unterordner existiert bereits.');
      return;
    }
    ensureLibraryFolder(path);
    libraryView.folder=path;
    persist();renderLibrary(libraryView.trash);notify('Unterordner angelegt.');
  });
}
function renameLibraryFolder(name){
  const folder=normalizeFolderName(name);
  if(!folder||folder==='Entwürfe'){notify('„Entwürfe“ bleibt der feste Standardordner.');return}
  const parent=folderParent(folder);
  nameDialog('Ordner umbenennen',folderLeaf(folder),(value)=>{
    const leaf=normalizeFolderSegment(value);
    if(!leaf)return;
    const next=parent?parent+'/'+leaf:leaf;
    if(next===folder)return;
    const subtree=state.folders.filter((item)=>folderContains(folder,item));
    const outside=new Set(state.folders.filter((item)=>!folderContains(folder,item)).map((item)=>item.toLocaleLowerCase('de-DE')));
    const mapped=subtree.map((item)=>next+item.slice(folder.length));
    if(mapped.some((item)=>outside.has(item.toLocaleLowerCase('de-DE')))){
      notify('Zielname kollidiert mit einem bestehenden Ordner.');
      return;
    }
    state.folders=state.folders.map((item)=>folderContains(folder,item)?next+item.slice(folder.length):item);
    state.songs.forEach((item)=>{
      if(folderContains(folder,item.folder)){
        item.folder=next+normalizeFolderName(item.folder).slice(folder.length);
        touchSong(item);
      }
    });
    if(libraryView.folder!=='all'&&folderContains(folder,libraryView.folder)){
      libraryView.folder=next+normalizeFolderName(libraryView.folder).slice(folder.length);
    }
    canonicalizeFolderOrder();
    persist();renderLibrary(libraryView.trash);renderProjects();notify('Ordnerstruktur umbenannt.');
  });
}
function reorderLibraryFolder(name,direction){
  const folder=normalizeFolderName(name),parent=folderParent(folder);
  const siblings=folderChildren(parent);
  const index=siblings.indexOf(folder),target=index+(direction<0?-1:1);
  if(index<0||target<0||target>=siblings.length)return;
  [siblings[index],siblings[target]]=[siblings[target],siblings[index]];
  canonicalizeFolderOrder(new Map([[parent,siblings]]));
  persist();renderLibrary(libraryView.trash);
}
function deleteLibraryFolder(name){
  const folder=normalizeFolderName(name);
  if(!folder||folder==='Entwürfe'){notify('„Entwürfe“ bleibt als Standardordner erhalten.');return}
  const subtree=state.folders.filter((item)=>folderContains(folder,item));
  const songs=state.songs.filter((item)=>folderContains(folder,item.folder));
  const fallback=folderParent(folder)||'Entwürfe';
  showDialog('Ordnerstruktur löschen',`<p class="notice"><b>${esc(folder)}</b> inklusive ${subtree.length} Ordner${subtree.length===1?'':'n'} löschen? ${songs.length} Text${songs.length===1?'':'e'} werden nach <b>${esc(fallback)}</b> verschoben.</p><div class="dialogactions"><button id="cancelFolderDelete">Abbrechen</button><button id="confirmFolderDelete" class="primary">Ordnerstruktur löschen</button></div>`);
  $('#cancelFolderDelete').onclick=closeDialog;
  $('#confirmFolderDelete').onclick=()=>{
    ensureLibraryFolder(fallback);
    state.songs.forEach((item)=>{if(folderContains(folder,item.folder)){item.folder=fallback;touchSong(item)}});
    state.folders=state.folders.filter((item)=>!folderContains(folder,item));
    if(libraryView.folder!=='all'&&folderContains(folder,libraryView.folder))libraryView.folder=fallback;
    canonicalizeFolderOrder();
    persist();closeDialog();renderLibrary(libraryView.trash);renderProjects();notify('Ordnerstruktur gelöscht · Texte sicher verschoben.');
  };
}
function renameLibrarySong(id){
  const item=state.songs.find((row)=>row.id===id);
  if(!item)return;
  nameDialog('Text umbenennen',item.title,(title)=>{
    item.title=title;touchSong(item);persist();renderLibrary(libraryView.trash);renderProjects();if(item.id===state.active)renderEditor();
  });
}
function moveLibrarySongToFolder(id,folder,{notifyUser=true}={}){
  const item=state.songs.find((row)=>row.id===id&&!row.deleted&&!row.deletedAt);
  if(!item)return false;
  const target=ensureLibraryFolder(folder);
  if(item.folder===target)return false;
  item.folder=target;
  touchSong(item);
  persist();renderLibrary(libraryView.trash);renderProjects();
  if(notifyUser)notify('Text nach „'+target+'“ verschoben.');
  return true;
}
function moveLibrarySong(id){
  const item=state.songs.find((row)=>row.id===id);
  if(!item)return;
  const options=libraryFolders().map((folder)=>`<option value="${esc(folder)}"${folder===item.folder?' selected':''}>${'· '.repeat(Math.max(0,folderDepth(folder)))}${esc(folderLeaf(folder))}</option>`).join('');
  showDialog('Text verschieben',`<label class="field">Ordner<select id="moveSongFolder">${options}</select></label><div class="dialogactions"><button id="cancelMoveSong">Abbrechen</button><button id="confirmMoveSong" class="primary">Verschieben</button></div>`);
  $('#cancelMoveSong').onclick=closeDialog;
  $('#confirmMoveSong').onclick=()=>{
    moveLibrarySongToFolder(id,$('#moveSongFolder').value,{notifyUser:false});
    closeDialog();notify('Text verschoben.');
  };
}
function trashLibrarySong(id){
  const item=state.songs.find((row)=>row.id===id);
  if(!item||item.deleted)return;
  if(item.id===state.active){
    const fallback=state.songs.filter((row)=>!row.deleted&&row.id!==item.id).sort((a,b)=>libraryTimestamp(b)-libraryTimestamp(a))[0];
    if(!fallback){notify('Lege zuerst einen zweiten Text an, bevor du den einzigen aktiven Text löschst.');return}
    revision();
    state.active=fallback.id;
    activeLine=0;selection={line:0,start:0,end:0};undo=[];redo=[];
  }
  const at=Date.now();
  item.deleted=true;item.deletedAt=at;touchSong(item,at);
  persist();renderLibrary(false);renderProjects();notify('Im Papierkorb · wiederherstellbar');
}
function restoreLibrarySong(id){
  const item=state.songs.find((row)=>row.id===id);
  if(!item)return;
  item.deleted=false;item.deletedAt=null;touchSong(item);ensureLibraryFolder(item.folder);
  persist();renderLibrary(true);renderProjects();notify('Text wiederhergestellt.');
}
function permanentlyDeleteLibrarySong(id){
  const item=state.songs.find((row)=>row.id===id&&row.deleted);
  if(!item)return;
  showDialog('Endgültig löschen',`<p class="notice"><b>${esc(item.title)}</b> wird dauerhaft aus dem lokalen Studio-Dokument entfernt. Vorher erstellt Studio automatisch einen Recovery-Punkt, sofern IndexedDB verfügbar ist.</p><div class="dialogactions"><button id="cancelPermanentDelete">Abbrechen</button><button id="confirmPermanentDelete" class="primary">Endgültig löschen</button></div>`);
  $('#cancelPermanentDelete').onclick=closeDialog;
  $('#confirmPermanentDelete').onclick=async()=>{
    const button=$('#confirmPermanentDelete');button.disabled=true;
    try{
      if(documentStoreInitialized)await createRecoveryPoint('before_permanent_song_delete');
      state.songs=state.songs.filter((row)=>row.id!==id);
      if(state.active===id)state.active=state.songs.find((row)=>!row.deleted&&!row.deletedAt)?.id||state.songs[0]?.id||null;
      closeDialog();renderLibrary(true);renderProjects();
      await flushStudioPersistence('permanent_song_delete');
      notify('Text endgültig gelöscht · Recovery-Punkt vorher gesichert.');
    }catch(error){
      button.disabled=false;
      notify('Löschen fehlgeschlagen: '+(error instanceof Error?error.message:String(error)));
    }
  };
}
function clearCurrentDocument(){
  const current=song();
  showDialog('Text leeren',`<p class="notice"><b>${esc(current.title)}</b> leeren? Der aktuelle Stand wird vorher als Revision und – wenn IndexedDB verfügbar ist – als Recovery-Punkt gesichert.</p><div class="dialogactions"><button id="cancelClearDocument">Abbrechen</button><button id="confirmClearDocument" class="primary">Text leeren</button></div>`);
  $('#cancelClearDocument').onclick=closeDialog;
  $('#confirmClearDocument').onclick=async()=>{
    const button=$('#confirmClearDocument');
    button.disabled=true;
    revision('before_clear_document');
    try{if(documentStoreInitialized)await createRecoveryPoint('before_clear_document')}catch{}
    pushUndo();
    current.lines=[''];
    current.barIds=['bar:'+String(current.id)+':clear:'+Date.now().toString(36)];
    current.barRevisions=[0];
    current.steps={};
    current.performanceCues={};
    current.performanceAnchors={};
    ensurePerformanceSong(ensureEditorSong(current));
    activeLine=0;
    selection={line:0,barId:current.barIds[0],barRevision:0,start:0,end:0};
    selectionProof=null;
    analysisSignature='';
    touchSong(current);
    closeDialog();
    renderEditor();
    changed();
    focusLine(0,0);
    notify('Text geleert · vorheriger Stand bleibt wiederherstellbar.');
  };
}
function navigate(target){stopPlay();page=target;document.body.classList.remove('mobile-results','find-only');if(target!=='studio')document.body.classList.remove('focus');$('#workspace').classList.toggle('hidden',target==='library'||target==='saved');$('#largeView').classList.toggle('hidden',target!=='library'&&target!=='saved');$('#breadcrumb').textContent=({studio:'Studio',search:'Reimsuche',library:'Meine Texte',saved:'Merkliste'})[target];document.body.classList.toggle('find-only',target==='search');queryAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===target));setMobileActive(target==='search'?'results':target);if(target==='library')renderLibrary();if(target==='saved')renderSaved();if(target==='studio'){requestAnimationFrame(()=>queryAll('#lyrics textarea').forEach(resizeArea))}}
function setMobileActive(name){queryAll('[data-mobile]').forEach(b=>b.classList.toggle('active',b.dataset.mobile===name))}
function setMode(next){mode=next;stopPlay();queryAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===next;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active)});$('#writeView').classList.toggle('hidden',next!=='write');$('#rhymeView').classList.toggle('hidden',next!=='rhyme');$('#performView').classList.toggle('hidden',next!=='perform');if(next==='rhyme')renderAnalysis();if(next==='perform')renderPerform();if(next==='write')requestAnimationFrame(()=>queryAll('#lyrics textarea').forEach(resizeArea))}
function analysisKey(){
  const s=song();
  return [s.id,basis,generated,generatedOnly,internalDbLabEnabled?internalDbLabActive:'default',...s.barIds.map((id,index)=>id+':'+s.barRevisions[index])].join('|');
}
function analysisRelationLabel(entry){
  if(!entry?.relation)return '—';
  const relation=entry.relation;
  return relation.label+(relation.score?(' · '+Math.round(Number(relation.score)*100)+'%'):'');
}
function renderAnalysisSurface(){
  const s=song(),words=studioAnalysisWords(s.lines);
  const ready=analysisStatus==='ready'&&analysisData;
  const scheme=ready&&Array.isArray(analysisData.scheme)?analysisData.scheme:words.map(()=>'?');
  const rows=s.lines.map((line,index)=>{
    const relation=ready?analysisData.lineRelations?.[index]:null;
    const detail=ready?analysisData.wordDetails?.[index]:null;
    const relationText=relation?analysisRelationLabel(relation):index===0?'Start':'—';
    const prior=relation?.prior!=null?' · Bar '+String(relation.prior+1).padStart(2,'0'):'';
    const stress=detail?.stressPattern||(
      detail?.primaryStressSyllable!=null?'Stress · '+detail.primaryStressSyllable:''
    );
    return '<button class="analysis-line" data-analysis-bar="'+index+'"><span class="analysis-bar-no">'+String(index+1).padStart(2,'0')+'</span><span class="analysis-scheme-letter">'+esc(scheme[index]||'—')+'</span><span class="analysis-end-word">'+esc(words[index]||'—')+(stress?'<small>'+esc(stress)+'</small>':'')+'</span><span class="analysis-relation">'+esc(relationText+prior)+'</span></button>';
  }).join('');
  const coverage=ready&&analysisData.coverage
    ?'<span>'+analysisData.coverage.resolved+'/'+analysisData.coverage.unique+' Endwörter aufgelöst'+(analysisData.coverage.truncated?' · Analyse auf 64 eindeutige Wörter begrenzt':'')+'</span>'
    :'';
  const canonicalState=analysisStatus==='loading'
    ?'<div class="analysis-loading">Writer analysiert Endwörter, Stress und interne Klangbeziehungen …</div>'
    :analysisStatus==='error'
      ?'<div class="analysis-error">Kanonische Analyse nicht verfügbar: '+esc(analysisError)+'</div>'
      :'';
  const runtime=ready&&analysisData.runtimeTiming?.currentMs!=null
    ?' · '+Math.round(Number(analysisData.runtimeTiming.currentMs))+' ms'
    :'';

  const allPairs=ready&&Array.isArray(analysisData.pairs)
    ?analysisData.pairs.slice().sort((a,b)=>Number(b.primary)-Number(a.primary)||Number(b.score||0)-Number(a.score||0))
    :[];
  const visiblePairs=allPairs.filter((pair)=>
    analysisRelationMode==='all'
      ||(analysisRelationMode==='primary'&&pair.primary)
      ||(analysisRelationMode==='soft'&&!pair.primary)
  );
  const relationWorkbench=ready
    ?visiblePairs.length
      ?visiblePairs.map((pair)=>'<button class="analysis-pair" data-analysis-anchor="'+esc(pair.left)+'"><span class="analysis-pair-words"><b>'+esc(pair.left)+'</b><i>↔</i><b>'+esc(pair.right)+'</b></span><span>'+esc(pair.label||pair.type)+'</span><strong>'+Math.round(Number(pair.score||0)*100)+'%</strong><small>'+esc((pair.language||basis).toUpperCase())+'</small></button>').join('')
      :'<div class="analysis-empty">Keine Beziehungen in diesem Filter.</div>'
    :'<div class="analysis-empty">Analyse laden, um Beziehungen im Verse zu sehen.</div>';

  const wordLab=ready&&Array.isArray(analysisData.uniqueWordDetails)
    ?analysisData.uniqueWordDetails.map((detail)=>{
      const unresolved=detail?.unresolved===true;
      const stress=detail?.stressPattern||(
        detail?.primaryStressSyllables?.length
          ?'Primary '+detail.primaryStressSyllables.join(', ')
          :'—'
      );
      return '<article class="analysis-word-card '+(unresolved?'unresolved':'')+'"><div class="row between"><button data-analysis-anchor="'+esc(detail?.surface||detail?.normalized||'')+'" class="analysis-word-title">'+esc(detail?.surface||detail?.normalized||'—')+'</button><span>'+esc(String(detail?.language||'').toUpperCase()||'—')+'</span></div><code>'+(detail?.ipa?'/'+esc(detail.ipa)+'/':'IPA —')+'</code><div class="analysis-word-facts"><span><small>SILBEN</small><b>'+(detail?.syllableCount||'—')+'</b></span><span><small>STRESS</small><b>'+esc(stress)+'</b></span></div>'+(detail?.generatedPronunciation?'<small class="analysis-generated">Generated pronunciation</small>':'')+(unresolved?'<small>Nicht im aktiven Writer-Lexikon aufgelöst.</small>':'')+'</article>';
    }).join('')
    :'';

  const rhymeChain=ready
    ?Object.entries(scheme.reduce((groups,label,index)=>{
      if(!label||label==='—')return groups;
      (groups[label]||(groups[label]=[])).push({index,word:words[index]||'—'});
      return groups;
    },{})).map(([label,items])=>'<div class="rhyme-chain-group"><span class="analysis-scheme-letter">'+esc(label)+'</span><div>'+items.map((item)=>'<button data-analysis-bar="'+item.index+'"><small>BAR '+String(item.index+1).padStart(2,'0')+'</small><b>'+esc(item.word)+'</b></button>').join('<i>→</i>')+'</div></div>').join('')
    :'';
  const stressFingerprint=ready&&Array.isArray(analysisData.wordDetails)
    ?analysisData.wordDetails.map((detail,index)=>{
      const value=detail?.stressPattern||(
        detail?.primaryStressSyllable!=null?'P'+detail.primaryStressSyllable:'—'
      );
      return '<button data-analysis-bar="'+index+'" title="'+esc(words[index]||'Bar '+(index+1))+'"><small>'+String(index+1).padStart(2,'0')+'</small><b>'+esc(value||'—')+'</b></button>';
    }).join('')
    :'';

  $('#rhymeView').innerHTML=`
    <div class="analysis-head row between wrap">
      <div><div class="eyebrow">Song Analysis</div><h2>Klang, Struktur, Spannung.</h2><p class="small">Reimschema, Stressdaten und Klangbeziehungen kommen aus dem kanonischen Writer-Runtime-Pfad. Lokale Silbenzählung ist separat als Approximation markiert.</p></div>
      <div class="row wrap">
        <span class="analysis-source">WRITER · ${esc(String(basis).toUpperCase())}${runtime}</span>
        <div class="analysis-language-toggle" role="group" aria-label="Analysesprache">
          <button data-analysis-language="de" class="${basis==='de'?'active':''}" aria-pressed="${basis==='de'}">DE</button>
          <button data-analysis-language="en" class="${basis==='en'?'active':''}" aria-pressed="${basis==='en'}">EN</button>
          <button data-analysis-language="both" class="${basis==='both'?'active':''}" aria-pressed="${basis==='both'}">Cross DE+EN</button>
        </div>
        <button id="refreshAnalysis" class="outline">Neu analysieren</button><button class="outline" id="backWrite">Zurück zum Text</button>
      </div>
    </div>
    <div class="analysis-layout">
      <section class="analysis-card analysis-rhyme-card">
        <div class="row between wrap"><div><h3>Kanonisches Reimschema</h3><p class="small">Primärreime bestimmen das Schema. Assonanz/Konsonanz bleiben zusätzliche Klangrelationen.</p></div><div class="row">${coverage}<button id="analysisChainToggle" class="outline" aria-pressed="${analysisChainVisible}">${analysisChainVisible?'Chain ausblenden':'Rhyme Chain'}</button></div></div>
        ${canonicalState}
        <div class="analysis-lines">${rows}</div>
        ${analysisChainVisible?'<div class="rhyme-chain">'+(rhymeChain||'<div class="analysis-empty">Noch keine Reimkette.</div>')+'</div>':''}
        ${ready&&analysisData.coverage?.unresolved?.length?'<p class="analysis-note">Nicht im aktiven Writer-Lexikon: '+esc(analysisData.coverage.unresolved.slice(0,12).join(', '))+(analysisData.coverage.unresolved.length>12?' …':'')+'</p>':''}
      </section>
      <section class="analysis-card">
        <div class="row between"><div><h3>Bar-Dichte</h3><p class="small">≈ lokale Silbenschätzung · keine kanonische Phonetikmetrik</p></div><span class="analysis-estimate-badge">APPROX</span></div>
        <div class="analysis-density-list">${s.lines.map((line,index)=>{
          const count=syll(line);
          const width=Math.min(100,Math.max(2,count*4));
          return '<div class="analysis-density-row"><span>'+String(index+1).padStart(2,'0')+'</span><i><b style="width:'+width+'%"></b></i><strong>'+count+'</strong></div>';
        }).join('')}</div>
      </section>
      <section class="analysis-card analysis-relations-card">
        <div class="row between wrap"><div><h3>Relations inside Verse</h3><p class="small">Alle vom Writer gefundenen Beziehungen zwischen Bar-Enden.</p></div><div class="analysis-relation-toggle" role="group"><button data-analysis-relation-mode="all" class="${analysisRelationMode==='all'?'active':''}">Alle</button><button data-analysis-relation-mode="primary" class="${analysisRelationMode==='primary'?'active':''}">Primär</button><button data-analysis-relation-mode="soft" class="${analysisRelationMode==='soft'?'active':''}">Assonanz / Konsonanz</button></div></div>
        <div class="analysis-pairs">${relationWorkbench}</div>
      </section>
      <section class="analysis-card analysis-word-lab">
        <div><h3>Word Laboratory</h3><p class="small">Kanonische IPA-/Stressdaten der analysierten Endwörter. Wort anklicken → als Writer-Anker übernehmen.</p></div>
        <div class="analysis-stress-workbench"><div class="row between"><div><h4>Stress Fingerprint</h4><p class="small">Bar-für-Bar aus den Writer-Querydetails.</p></div><span class="analysis-source">CANONICAL</span></div><div class="analysis-stress-strip">${stressFingerprint||'<span class="small">Noch keine Stressdaten.</span>'}</div></div>
        <div class="analysis-word-grid">${wordLab||'<div class="analysis-empty">Noch keine Wortdaten.</div>'}</div>
      </section>
    </div>`;
  $('#backWrite').onclick=()=>setMode('write');
  $('#refreshAnalysis').onclick=()=>{analysisSignature='';void refreshSongAnalysis(true)};
  $('#analysisChainToggle').onclick=()=>{
    analysisChainVisible=!analysisChainVisible;
    renderAnalysisSurface();
  };
  queryAll('[data-analysis-bar]').forEach((button)=>button.onclick=()=>{
    activeLine=+button.dataset.analysisBar;
    setMode('write');
    focusLine(activeLine);
  });
  queryAll('[data-analysis-relation-mode]').forEach((button)=>button.onclick=()=>{
    analysisRelationMode=button.dataset.analysisRelationMode;
    renderAnalysisSurface();
  });
  queryAll('[data-analysis-language]').forEach((button)=>button.onclick=()=>{
    const next=button.dataset.analysisLanguage;
    if(!['de','en','both'].includes(next)||basis===next)return;
    basis=next;
    pageSize=6;
    analysisSignature='';
    saveStudioSearchState({queryBasis:basis});
    syncInline();
    void refreshWriterResults();
    void refreshSongAnalysis(true);
  });
  queryAll('[data-analysis-anchor]').forEach((button)=>button.onclick=()=>{
    const anchor=String(button.dataset.analysisAnchor||'').trim();
    if(!anchor)return;
    query=anchor;
    pageSize=6;
    followSelection=false;
    saveStudioSearchState({anchor,queryBasis:basis});
    syncFollowControls();
    void refreshWriterResults();
    notify('Writer-Anker: '+anchor);
  });
}
async function refreshSongAnalysis(force=false){
  const signature=analysisKey();
  if(!force&&analysisSignature===signature&&(analysisStatus==='loading'||analysisStatus==='ready'))return;
  analysisSignature=signature;
  analysisAbort?.abort?.();
  analysisAbort=new AbortController();
  const token=++analysisRequest;
  analysisStatus='loading';analysisData=null;analysisError='';
  renderAnalysisSurface();
  try{
    const s=song();
    const result=await analysisClient.analyze(s.lines,{
      language:basis,
      generated,
      generatedOnly,
      runtimeDb:internalDbLabEnabled?internalDbLabActive:'',
      signal:analysisAbort.signal,
    });
    if(token!==analysisRequest)return;
    analysisData=result;analysisStatus='ready';analysisError='';
  }catch(error){
    if(error?.name==='AbortError'||token!==analysisRequest)return;
    analysisStatus='error';analysisError=error instanceof Error?error.message:String(error);
  }
  if(mode==='rhyme')renderAnalysisSurface();
}
function renderAnalysis(){renderAnalysisSurface();void refreshSongAnalysis()}
function renderPerform(){
  stopPlay();
  const s=song();
  const bar=barIdentity(s,activeLine);
  if(!bar)return;
  const barId=bar.id;
  const config=performanceConfig(s);
  const metrics=performanceBarMetrics(s,barId);
  const pocket=performancePocketMetrics(s,barId);
  const previous=performancePreviousBarPlacements(s,barId);
  const barDurationMs=performanceBarDurationMs(s);
  const syllableEstimate=syll(s.lines[activeLine]);
  const syllablesPerSecond=performanceSyllablesPerSecond(s,syllableEstimate);
  const fingerprint=performanceFlowFingerprint(s,barId);
  const steps=config.grid;
  const stepButtons=Array.from({length:steps},(_,index)=>{
    const stored=getPerformanceCue(s,barId,index);
    const symbol=performanceCueSymbol(stored);
    const selected=performanceMoveFrom===index;
    const label=stored
      ?`Schritt ${index+1}: ${stored.type}${stored.type==='pause'?' · '+stored.length+' Schritte':''}`
      :`Schritt ${index+1}: leer`;
    return `<button data-perform-step="${index}" class="${stored?'on cue-'+stored.type:''}${selected?' move-source':''}" draggable="${Boolean(stored)}" aria-label="${esc(label)}"><span>${symbol}</span><small>${index%(steps/4)===0?Math.floor(index/(steps/4))+1:'·'}</small></button>`;
  }).join('');
  const review=metrics.needsReview
    ?'<div class="perform-review"><b>Timing prüfen</b><span>Der Text dieser Bar wurde nach dem letzten Cue-Mapping geändert. Cues bleiben an der stabilen Bar-ID, werden aber nicht stillschweigend verschoben.</span><button id="performMarkReviewed" class="outline">Als geprüft markieren</button></div>'
    :'';
  const moveHint=cue==='move'
    ?'<span class="perform-tool-hint">'+(performanceMoveFrom==null?'Quelle anklicken oder Cue ziehen.':'Ziel für Cue '+(performanceMoveFrom+1)+' wählen.')+'</span>'
    :'';
  $('#performView').innerHTML=`
    <div class="perform-head">
      <div><div class="eyebrow">Perform / Bar ${String(activeLine+1).padStart(2,'0')}</div><h2>Flow sequenzieren.</h2><p>${esc(s.lines[activeLine]||'Leere Bar')}</p></div>
      <div class="perform-metrics">
        <span><b>${syllableEstimate||0}</b><small>Silben ≈</small></span>
        <span><b>${metrics.cues}</b><small>Cues</small></span>
        <span><b>${metrics.accents}</b><small>Akzente</small></span>
        <span><b>${Math.round(metrics.density*100)}%</b><small>Dichte</small></span>
      </div>
    </div>
    ${review}
    <div class="perform-transport">
      <label class="perform-bpm"><span>BPM</span><input id="bpm" type="number" min="40" max="220" value="${config.bpm}"></label>
      <div class="perform-toggle" role="group" aria-label="Feel">
        <button data-perform-feel="straight" class="${config.feel==='straight'?'active':''}" aria-pressed="${config.feel==='straight'}">Straight</button>
        <button data-perform-feel="triplet" class="${config.feel==='triplet'?'active':''}" aria-pressed="${config.feel==='triplet'}">Triplet</button>
      </div>
      <div class="perform-toggle" role="group" aria-label="Raster">
        <button data-perform-grid="8" class="${steps===8?'active':''}" aria-pressed="${steps===8}">8</button>
        <button data-perform-grid="16" class="${steps===16?'active':''}" aria-pressed="${steps===16}">16</button>
      </div>
      <div class="perform-toggle" role="group" aria-label="Tempo Multiplikator">
        <button data-perform-scale="0.5" class="${config.tempoScale===0.5?'active':''}" aria-pressed="${config.tempoScale===0.5}">½×</button>
        <button data-perform-scale="1" class="${config.tempoScale===1?'active':''}" aria-pressed="${config.tempoScale===1}">1×</button>
        <button data-perform-scale="2" class="${config.tempoScale===2?'active':''}" aria-pressed="${config.tempoScale===2}">2×</button>
      </div>
      <button id="playBtn" class="primary">▶ Metronom</button>
    </div>
    <div class="perform-sequencer">
      <div class="row between wrap"><div><h3>Timing & Cues</h3><span class="small">${steps} Schritte · stabile Bar-ID ${esc(barId)}</span></div>${moveHint}</div>
      <div class="cue-tools">
        ${[['move','↔ Verschieben'],['hit','● Hit'],['accent','▲ Akzent'],['pause','Ⅱ Pause'],['breath','◌ Atem'],['hold','→ Halten'],['erase','× Löschen']].map(([value,label])=>`<button data-cue="${value}" class="${value===cue?'active':''}" aria-pressed="${value===cue}">${label}</button>`).join('')}
        <label class="pause-length ${cue==='pause'?'':'hidden'}">Pause<select id="pauseLength"><option value="1">1 Step</option><option value="2">2 Steps</option><option value="3">3 Steps</option><option value="4">4 Steps</option></select></label>
      </div>
      <div class="beatgrid perform-grid-${steps}" id="performGrid">${stepButtons}</div>
      <div class="perform-insights">
        <div><small>BAR TIME</small><b>${(barDurationMs/1000).toFixed(2)} s</b><span>4/4 · BPM × Tempo-Faktor</span></div>
        <div><small>SYLL./SEC ≈</small><b>${syllablesPerSecond.toFixed(2)}</b><span>lokale Silbenschätzung</span></div>
        <div><small>POCKET</small><b>${Math.round(pocket.offBeatShare*100)}% off-beat</b><span>${pocket.onBeat} on · ${pocket.offBeat} off</span></div>
        <div><small>BREATH LOAD</small><b>${pocket.breathLoad}</b><span>${pocket.breaths} Atem · ${pocket.pauseUnits} Pause-Steps</span></div>
        <div class="perform-fingerprint"><small>FLOW FINGERPRINT</small><code>${esc(fingerprint)}</code><span>direkte Cue-Platzierungen</span></div>
        <div><small>PREVIOUS BAR</small><b>${previous.previousBarId?previous.sharedCount+' gleiche Steps':'—'}</b><span>${previous.previousBarId?previous.currentSteps.length+' aktuell · '+previous.previousSteps.length+' vorher':'erste Bar'}</span></div>
      </div>
      <div class="row between wrap perform-actions">
        <span class="small">${config.feel==='triplet'?'Triplet-Feel · 2:1 Puls':'Straight'} · ${config.tempoScale===0.5?'Half Time':config.tempoScale===2?'Double Time':'Normal Time'}</span>
        <div class="row"><button class="outline" id="autoMap">Auto-Map ≈</button><button id="clearCues">Cues leeren</button></div>
      </div>
    </div>`;

  $('#bpm').onchange=(event)=>{
    pushUndo();setPerformanceConfig(s,{bpm:+event.target.value||92});changed();renderPerform();
  };
  queryAll('[data-perform-feel]').forEach((button)=>button.onclick=()=>{
    pushUndo();setPerformanceConfig(s,{feel:button.dataset.performFeel});changed();renderPerform();
  });
  queryAll('[data-perform-grid]').forEach((button)=>button.onclick=()=>{
    pushUndo();setPerformanceConfig(s,{grid:+button.dataset.performGrid});performanceMoveFrom=null;changed();renderPerform();
  });
  queryAll('[data-perform-scale]').forEach((button)=>button.onclick=()=>{
    pushUndo();setPerformanceConfig(s,{tempoScale:+button.dataset.performScale});changed();renderPerform();
  });
  queryAll('[data-cue]').forEach((button)=>button.onclick=()=>{
    cue=button.dataset.cue;
    performanceMoveFrom=null;
    renderPerform();
  });
  if($('#pauseLength')){
    $('#pauseLength').value=String(config.pauseLength);
    $('#pauseLength').onchange=(event)=>{setPerformanceConfig(s,{pauseLength:+event.target.value});persist()};
  }
  queryAll('[data-perform-step]').forEach((button)=>{
    const step=+button.dataset.performStep;
    button.onclick=()=>{
      if(cue==='move'){
        const existing=getPerformanceCue(s,barId,step);
        if(performanceMoveFrom==null){
          if(!existing){notify('Zum Verschieben zuerst einen belegten Cue wählen.');return}
          performanceMoveFrom=step;renderPerform();return;
        }
        pushUndo();
        movePerformanceCue(s,barId,performanceMoveFrom,step);
        performanceMoveFrom=null;changed();renderPerform();return;
      }
      pushUndo();
      setPerformanceCue(s,barId,step,cue,{length:performanceConfig(s).pauseLength});
      changed();renderPerform();
    };
    button.addEventListener('dragstart',(event)=>{
      if(!getPerformanceCue(s,barId,step)){event.preventDefault();return}
      event.dataTransfer?.setData('text/plain',String(step));
      event.dataTransfer&&(event.dataTransfer.effectAllowed='move');
    });
    button.addEventListener('dragover',(event)=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move'});
    button.addEventListener('drop',(event)=>{
      event.preventDefault();
      const from=Number(event.dataTransfer?.getData('text/plain'));
      if(!Number.isInteger(from))return;
      pushUndo();
      movePerformanceCue(s,barId,from,step);
      performanceMoveFrom=null;changed();renderPerform();
    });
  });
  $('#playBtn').onclick=()=>playing?stopPlay():startPlay();
  $('#autoMap').onclick=()=>{
    pushUndo();
    autoMapPerformanceBar(s,barId,syll(s.lines[activeLine]));
    performanceMoveFrom=null;changed();renderPerform();
    notify('Auto-Map aus Silbenschätzung gesetzt · bitte Timing prüfen.');
  };
  $('#clearCues').onclick=()=>{
    pushUndo();clearPerformanceBar(s,barId);performanceMoveFrom=null;changed();renderPerform();
  };
  if($('#performMarkReviewed'))$('#performMarkReviewed').onclick=()=>{
    markPerformanceReviewed(s,barId);persist();renderPerform();notify('Timing für diese Bar als geprüft markiert.');
  };
}
function cueSymbol(c){return performanceCueSymbol(c)}
function stopPlay(){
  playing=false;
  clearTimeout(playTimer);
  playTimer=0;
  queryAll('[data-perform-step]').forEach((element)=>element.classList.remove('playhead'));
  if($('#playBtn'))$('#playBtn').textContent='▶ Metronom';
}
async function startPlay(){
  try{
    const s=song();
    audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
    await audioContext.resume();
    playing=true;tick=0;
    if($('#playBtn'))$('#playBtn').textContent='■ Stop';
    const pulse=()=>{
      if(!playing)return;
      const config=performanceConfig(s);
      const steps=config.grid;
      const current=tick%steps;
      queryAll('[data-perform-step]').forEach((element,index)=>element.classList.toggle('playhead',index===current));
      const bar=barIdentity(s,activeLine);
      const stored=bar?getPerformanceCue(s,bar.id,current):null;
      if(current%(steps/4)===0||stored?.type==='accent'||stored?.type==='hit'){
        const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
        oscillator.frequency.value=stored?.type==='accent'?1120:current===0?960:620;
        const gainValue=(stored?.type==='hit'||stored?.type==='accent') ? .06 : .04;
        gain.gain.setValueAtTime(gainValue,audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.045);
        oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+.05);
      }
      const duration=performanceStepDurationMs(s,current);
      tick=(current+1)%steps;
      playTimer=setTimeout(pulse,duration);
    };
    pulse();
  }catch(error){
    stopPlay();
    notify('Audio hier nicht verfügbar. Timing-Raster bleibt nutzbar.');
  }
}
function showDialog(title,html){$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal()}
function closeDialog(){$('#dialog').close()}
function legacyFilters(){showDialog('Dein Klang. Deine Suche.',`<div class="formgrid"><label class="field">Aussprache der Suchanfrage<select id="basis"><option value="de">Deutsch</option><option value="en">Englisch</option><option value="both">DE + EN</option></select></label><label class="field">Sprache der Ergebnisse<select id="resultLanguage"><option value="both">DE + EN</option><option value="de">Deutsch</option><option value="en">Englisch</option></select></label><label class="field">Reimbeziehung<select id="relation"><option value="all">Alle Beispiele</option><option value="rein">Reiner Reim</option><option value="nah">Naher Klang</option></select></label><label class="field">Reihenfolge<select id="sort"><option value="recommended">Writer-Empfehlung</option><option value="alpha">A–Z</option><option value="syllables">Silben aufsteigend</option></select></label></div><p class="notice">Die Live-Suche nutzt die lokale Writer-Runtime. Die vollständige Filtermatrix, Varianten, historische Formen, Generated-Daten und Provenienz sind im Studio über direkte und erweiterte Filter verfügbar.</p><div class="dialogactions"><button id="resetFilters">Zurücksetzen</button><button id="applyFilters" class="primary">Anwenden</button></div>`);$('#basis').value=basis;$('#resultLanguage').value=resultLang;$('#relation').value=relation;$('#sort').value=sort;$('#applyFilters').onclick=()=>{basis=$('#basis').value;resultLang=$('#resultLanguage').value;relation=$('#relation').value;sort=$('#sort').value;pageSize=6;void refreshWriterResults();closeDialog()};$('#resetFilters').onclick=()=>{basis='de';resultLang='both';relation='all';sort='recommended';void refreshWriterResults();closeDialog()}}
function legacySettings(){showDialog('Dein Studio einrichten',`<label class="field">Schriftgröße im Editor<input id="fontRange" type="range" min="16" max="28" value="${state.fontSize}"></label><p class="small" id="fontValue">${state.fontSize} px</p><div class="row wrap" style="margin-top:20px"><button id="settingTheme" class="outline">Hell / Dunkel wechseln</button><button id="settingHistory" class="outline">Versionsverlauf</button></div><p class="notice">Texte, Revisionen und Performance-Cues werden lokal im versionierten IndexedDB-DocumentStore gespeichert. UI-Präferenzen bleiben in LocalStorage; Recovery-Punkte sind in den Studio-Einstellungen verfügbar.</p><div class="row wrap"><button id="sourceInfo" class="outline">Über Studio 02</button><button id="commandsSettings" class="outline">Tastenkürzel</button></div>`);$('#fontRange').oninput=e=>{state.fontSize=+e.target.value;document.documentElement.style.setProperty('--editor',state.fontSize+'px');queryAll('#lyrics textarea').forEach(resizeArea);$('#fontValue').textContent=state.fontSize+' px';persist()};$('#settingTheme').onclick=toggleTheme;$('#settingHistory').onclick=showHistory;$('#sourceInfo').onclick=showInfo;$('#commandsSettings').onclick=showCommands}
function legacyToggleTheme(){toggleTheme()}
function legacyHistory(){revision('history_open');showDialog('Deine letzten Fassungen',`<p class="notice">Wiederherstellen erzeugt zuvor eine Sicherung der aktuellen Fassung.</p>${(song().revisions||[]).slice().reverse().map((r,i)=>`<div class="revision"><div class="grow"><b>${new Date(r.at).toLocaleTimeString('de-DE')}</b><p>${esc(r.text.slice(0,65))}…</p></div><button class="outline" data-revision="${song().revisions.length-1-i}">Wiederherstellen</button></div>`).join('')||'<p>Noch keine ältere Fassung vorhanden.</p>'}`);queryAll('[data-revision]').forEach(b=>b.onclick=()=>{if(restoreStudioRevision(song().revisions[+b.dataset.revision])){closeDialog();notify('Fassung wiederhergestellt · Bar-IDs und Cues erhalten.')}})}
function showInfo(){showDialog('RhymeLab Studio 02',`<p>Ein gemeinsamer Schreibraum für Browser, Mobile und den späteren Electron-Adapter.</p><p class="notice">Reimsuche, Detail-/Provenienzflächen und Song-Reimschema laufen über die lokale Writer-Runtime. Dokumente, Revisionen und Performance-Cues liegen im versionierten IndexedDB-DocumentStore mit Recovery-Punkten.</p><p class="notice">Explizite Approximationen bleiben die UI-Silbenzählung und das darauf basierende Perform Auto-Map. Browser-, Touch- und Audio-Geräteabnahme bleibt vor dem Default-Route-Cutover erforderlich.</p>`)}
function studioCommandRegistry(){
  return [
    {id:'studio',group:'Navigation',label:'Studio öffnen',keywords:['studio','write','schreiben'],shortcut:'Alt+1',run:()=>navigate('studio')},
    {id:'search',group:'Navigation',label:'Reimsuche öffnen',keywords:['search','rhyme','reim','writer'],shortcut:'Alt+2',run:()=>navigate('search')},
    {id:'library',group:'Navigation',label:'Meine Texte öffnen',keywords:['library','texts','songs','bibliothek'],run:()=>navigate('library')},
    {id:'saved',group:'Navigation',label:'Merkliste öffnen',keywords:['saved','bookmarks','merkliste'],run:()=>navigate('saved')},
    {id:'write-mode',group:'Modus',label:'Schreibmodus',keywords:['write','editor','composer'],shortcut:'Alt+E',run:()=>{navigate('studio');setMode('write');focusLine(activeLine)}},
    {id:'rhyme-mode',group:'Modus',label:'Reimanalyse',keywords:['analysis','rhymes','reime','word laboratory'],run:()=>{navigate('studio');setMode('rhyme')}},
    {id:'perform-mode',group:'Modus',label:'Perform-Modus',keywords:['perform','timing','flow','cues'],shortcut:'Alt+3',run:()=>{navigate('studio');setMode('perform')}},
    {id:'bar-inspector',group:'Modus',label:'Bar Inspector öffnen',keywords:['bar','metrics','stress','pocket'],run:()=>openEditorDock('bar')},
    {id:'bar-navigator',group:'Modus',label:'Bar Navigator öffnen',keywords:['bars','outline','navigator','reorder'],shortcut:'Alt+B',run:()=>openEditorDock('navigator')},
    {id:'bar-new-after',group:'Dokument',label:'Neue Bar nach aktiver Bar',keywords:['bar','new','insert','zeile'],run:()=>addStudioBarAfter(activeLine)},
    {id:'bar-duplicate',group:'Dokument',label:'Aktive Bar duplizieren',keywords:['bar','duplicate','copy','duplizieren'],run:()=>duplicateStudioBar(activeLine)},
    {id:'bar-delete',group:'Dokument',label:'Aktive Bar löschen',keywords:['bar','delete','remove','löschen'],run:()=>deleteStudioBar(activeLine)},
    {id:'new-song',group:'Dokument',label:'Neuen Text anlegen',keywords:['new','song','document','text'],run:newSong},
    {id:'rename-song',group:'Dokument',label:'Titel umbenennen',keywords:['rename','title','name'],run:()=>nameDialog('Titel ändern',song().title,(title)=>{song().title=title;persist();renderEditor();renderProjects()})},
    {id:'history',group:'Dokument',label:'Versionsverlauf öffnen',keywords:['history','versions','revision'],run:showHistory},
    {id:'clear',group:'Dokument',label:'Text sicher leeren',keywords:['clear','empty','delete text'],run:clearCurrentDocument},
    {id:'export-text',group:'Dokument',label:'Text als TXT exportieren',keywords:['export','txt','download'],run:exportText},
    {id:'export-backup',group:'Dokument',label:'Workspace-Backup exportieren',keywords:['backup','json','workspace','export'],run:async()=>{await exportPortableStudioBackup();notify('Portables Studio Backup exportiert.')}},
    {id:'search-focus',group:'Writer',label:'Reimanker suchen',keywords:['anchor','search','writer','query'],shortcut:'Alt+R',run:()=>{if(page==='library'||page==='saved')navigate('studio');if(window.innerWidth<=800){document.body.classList.add('mobile-results');setMobileActive('results')}$('#searchInput').focus();$('#searchInput').select()}},
    {id:'filters',group:'Writer',label:'Filter ein-/ausblenden',keywords:['filters','writer','options'],run:showFilters},
    {id:'hide-used',group:'Writer',label:hideUsed?'Verwendete Treffer wieder zeigen':'Verwendete Treffer ausblenden',keywords:['hide used','used','duplicates'],run:()=>{hideUsed=!hideUsed;state.hideUsed=hideUsed;persist();renderResults()}},
    {id:'auto-scroll',group:'Writer',label:auto?'Auto-Scroll ausschalten':'Auto-Scroll einschalten',keywords:['scroll','automatic','results'],run:toggleAuto},
    {id:'density',group:'Writer',label:'Trefferdichte wechseln',keywords:['density','compact','tiles','list'],shortcut:'Alt+L',run:()=>setDensity(nextDensity(density))},
    {id:'focus',group:'Ansicht',label:'Fokusmodus wechseln',keywords:['focus','distraction free'],shortcut:'Alt+F',run:toggleFocus},
    {id:'settings',group:'Ansicht',label:'Einstellungen öffnen',keywords:['settings','appearance','preferences'],run:showSettings},
    {id:'theme',group:'Ansicht',label:'Light / Dark wechseln',keywords:['theme','light','dark','appearance'],run:toggleTheme},
    {id:'language',group:'Ansicht',label:state.uiLanguage==='de'?'Interface auf English':'Interface auf Deutsch',keywords:['language','sprache','english','deutsch'],run:toggleStudioUiLanguage},
    {id:'diagnostics',group:'System',label:'Browser-Diagnostics öffnen',keywords:['diagnostics','browser','runtime','acceptance'],run:()=>{showSettings();requestAnimationFrame(()=>$('#diagnosticsPanel')?.scrollIntoView({block:'nearest',behavior:'smooth'}))}},
    {id:'recovery',group:'System',label:'Recovery-Punkt erstellen',keywords:['recovery','backup','snapshot'],run:async()=>{await createRecoveryPoint();notify('Recovery-Punkt erstellt.');if(dockTab==='settings')renderDock()}},
  ];
}
function renderCommandPalette(queryValue=''){
  const results=$('#commandResults');
  if(!results)return [];
  const commands=rankStudioCommands(studioCommandRegistry(),queryValue);
  const groups=studioCommandGroups(commands);
  results.innerHTML=groups.length
    ?groups.map((group)=>'<section class="command-group"><span class="command-group-title">'+esc(group.name)+'</span>'+group.commands.map((command,index)=>'<button data-command-id="'+esc(command.id)+'" data-command-index="'+index+'"><span><b>'+esc(command.label)+'</b>'+(command.keywords?.length?'<small>'+esc(command.keywords.slice(0,3).join(' · '))+'</small>':'')+'</span>'+(command.shortcut?'<kbd>'+esc(commandShortcutText(command.shortcut))+'</kbd>':'')+'</button>').join('')+'</section>').join('')
    :'<div class="command-empty">Kein passender Befehl.</div>';
  const buttons=queryAll('#commandResults [data-command-id]');
  buttons.forEach((button,index)=>{
    button.dataset.commandIndex=String(index);
    button.classList.toggle('active',index===0);
    button.setAttribute('aria-selected',String(index===0));
    button.onclick=()=>executeStudioCommand(button.dataset.commandId);
  });
  return commands;
}
function executeStudioCommand(id){
  const command=studioCommandRegistry().find((item)=>item.id===id);
  if(!command)return;
  closeDialog();
  Promise.resolve(command.run()).catch((error)=>notify('Befehl fehlgeschlagen: '+(error instanceof Error?error.message:String(error))));
}
function showCommands(){
  showDialog('Schnell zu deinem nächsten Schritt',`<div class="command-palette"><label class="command-search"><span class="screenreader">Befehle durchsuchen</span><input id="commandSearch" type="search" placeholder="Aktion, Modus, Filter oder Einstellung …" autocomplete="off" spellcheck="false"></label><div id="commandResults" class="command-results" role="listbox" aria-label="Befehle"></div><p class="notice">Strg / ⌘ + K öffnet die Palette · ↑↓ wählen · Enter ausführen · Escape schließen.</p></div>`);
  const input=$('#commandSearch');
  let activeIndex=0;
  const refresh=()=>{
    const commands=renderCommandPalette(input.value);
    activeIndex=0;
    return commands;
  };
  const move=(delta)=>{
    const buttons=queryAll('#commandResults [data-command-id]');
    if(!buttons.length)return;
    activeIndex=(activeIndex+delta+buttons.length)%buttons.length;
    buttons.forEach((button,index)=>{
      const active=index===activeIndex;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    buttons[activeIndex]?.scrollIntoView({block:'nearest'});
  };
  input.oninput=refresh;
  input.onkeydown=(event)=>{
    if(event.key==='ArrowDown'){event.preventDefault();move(1)}
    else if(event.key==='ArrowUp'){event.preventDefault();move(-1)}
    else if(event.key==='Enter'){
      event.preventDefault();
      const button=queryAll('#commandResults [data-command-id]')[activeIndex];
      if(button)executeStudioCommand(button.dataset.commandId);
    }else if(event.key==='Escape'){
      event.preventDefault();closeDialog();
    }
  };
  refresh();
  requestAnimationFrame(()=>input.focus());
}
function toggleFocus(){navigate('studio');document.body.classList.toggle('focus');$('#focusBtn').setAttribute('aria-pressed',document.body.classList.contains('focus'));notify(document.body.classList.contains('focus')?'Fokus an · Alt + F zum Verlassen':'Fokus aus')}
function nameDialog(title,value,callback){showDialog(title,`<label class="field">Titel<input id="nameInput" value="${esc(value)}" maxlength="100"></label><div class="dialogactions"><button id="cancelName">Abbrechen</button><button id="saveName" class="primary">Speichern</button></div>`);$('#cancelName').onclick=closeDialog;$('#saveName').onclick=()=>{const text=$('#nameInput').value.trim();if(!text)return;callback(text);closeDialog()};$('#nameInput').onkeydown=e=>{if(e.key==='Enter')$('#saveName').click()};$('#nameInput').focus();$('#nameInput').select()}
function newSong(){
  nameDialog('Ein neuer Text','Unbenannter Song',(title)=>{
    revision();
    const now=Date.now();
    const folder=ensureLibraryFolder(!libraryView.trash&&libraryView.folder!=='all'?libraryView.folder:'Entwürfe');
    const created={id:'s'+now,title,lines:[''],folder,steps:{},revisions:[],createdAt:now,updatedAt:now};
    state.songs.push(created);
    state.active=created.id;
    activeLine=0;selection={line:0,start:0,end:0};undo=[];redo=[];
    persist();renderEditor();renderProjects();navigate('studio');setMode('write');focusLine(0);
  });
}
function renderLibrary(showTrash=libraryView.trash){
  libraryView.trash=Boolean(showTrash);
  const needle=libraryView.query.trim().toLocaleLowerCase('de-DE');
  const rows=state.songs.filter((item)=>{
    const deleted=Boolean(item.deleted||item.deletedAt);
    if(deleted!==libraryView.trash)return false;
    if(libraryView.folder!=='all'&&!folderContains(libraryView.folder,item.folder))return false;
    if(!needle)return true;
    const haystack=[item.title,item.folder,...(Array.isArray(item.lines)?item.lines:[])].join('\n').toLocaleLowerCase('de-DE');
    return haystack.includes(needle);
  }).slice();
  rows.sort((a,b)=>{
    if(libraryView.sort==='title')return a.title.localeCompare(b.title,'de',{sensitivity:'base'});
    if(libraryView.sort==='created')return (Number(b.createdAt)||0)-(Number(a.createdAt)||0)||a.title.localeCompare(b.title,'de');
    if(libraryView.sort==='bars')return (b.lines?.length||0)-(a.lines?.length||0)||a.title.localeCompare(b.title,'de');
    return libraryTimestamp(b)-libraryTimestamp(a)||a.title.localeCompare(b.title,'de');
  });

  const folders=libraryFolders();
  const sourceRows=state.songs.filter((item)=>Boolean(item.deleted||item.deletedAt)===libraryView.trash);
  const folderButton=(folder)=>{
    const count=sourceRows.filter((item)=>folderContains(folder,item.folder)).length;
    const active=libraryView.folder===folder;
    const siblings=folderChildren(folderParent(folder));
    const position=siblings.indexOf(folder),depth=Math.max(0,folderDepth(folder));
    const actions=!libraryView.trash
      ?`<span class="library-folder-actions"><button data-folder-subfolder="${esc(folder)}" aria-label="Unterordner in ${esc(folder)} anlegen" title="Unterordner">＋</button>${folder!=='Entwürfe'?'<button data-folder-rename="'+esc(folder)+'" aria-label="Ordner '+esc(folder)+' umbenennen" title="Umbenennen">✎</button>':''}<button data-folder-move-up="${esc(folder)}" aria-label="Ordner nach oben" title="Nach oben" ${position<=0?'disabled':''}>↑</button><button data-folder-move-down="${esc(folder)}" aria-label="Ordner nach unten" title="Nach unten" ${position>=siblings.length-1?'disabled':''}>↓</button>${folder!=='Entwürfe'?'<button class="library-folder-delete" data-folder-delete="'+esc(folder)+'" aria-label="Ordner '+esc(folder)+' löschen" title="Ordnerstruktur löschen">×</button>':''}</span>`
      :'';
    const parent=folderParent(folder);
    return `<div class="library-folder-row" data-depth="${depth}" data-folder-drop="${esc(folder)}" style="--folder-depth:${depth}"><button data-folder-filter="${esc(folder)}" class="${active?'active':''}" aria-pressed="${active}" title="${esc(folder)}"><span class="library-folder-label"><i aria-hidden="true">${depth?'↳':'▱'}</i><b>${esc(folderLeaf(folder))}</b>${parent?'<em>'+esc(parent)+'</em>':''}</span><small>${count}</small></button>${actions}</div>`;
  };
  const allActive=libraryView.folder==='all';
  const cards=rows.map((item)=>{
    const preview=(item.lines||[]).find((line)=>String(line).trim())||'Die erste Zeile wartet noch.';
    const changed=libraryTimestamp(item);
    const changedLabel=changed?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(changed):'Legacy';
    return `<article class="songcard ${item.id===state.active?'is-active':''}" ${libraryView.trash?'':'draggable="true" data-library-song-drag="'+esc(item.id)+'"'}>
      <div class="songcard-top"><span class="eyebrow">${esc(item.folder||'Entwürfe')}</span>${item.id===state.active&&!libraryView.trash?'<span class="song-active-badge">AKTIV</span>':''}</div>
      <h3>${esc(item.title)}</h3>
      <p>${esc(preview)}</p>
      <div class="songcard-meta"><span>${item.lines?.length||0} Bars</span><span>·</span><span>${esc(changedLabel)}</span></div>
      <div class="songcard-actions">
        ${libraryView.trash
          ?`<button data-restore="${esc(item.id)}" class="outline">Wiederherstellen</button><button data-permanent-delete="${esc(item.id)}" class="danger-ghost">Endgültig löschen</button>`
          :`<button class="outline" data-song="${esc(item.id)}">Öffnen ↗</button><button data-rename-song="${esc(item.id)}">Umbenennen</button><button data-move-song="${esc(item.id)}">Verschieben</button><button data-trash="${esc(item.id)}" class="danger-ghost">Papierkorb</button>`}
      </div>
    </article>`;
  }).join('');

  $('#largeView').innerHTML=`
    <div class="library-head row between wrap">
      <div><div class="eyebrow">Deine Ideen bleiben bei dir</div><h1>${libraryView.trash?'Papierkorb':'Meine Texte'}</h1><p class="muted">Suchen, sortieren, ordnen und ohne Kontextverlust weiterschreiben.</p></div>
      <div class="row wrap">
        <button id="trashToggle" class="outline">${libraryView.trash?'← Alle Texte':'Papierkorb ('+state.songs.filter((item)=>item.deleted||item.deletedAt).length+')'}</button>
        ${libraryView.trash?'':'<button id="newSongMain" class="primary">＋ Neuer Text</button>'}
      </div>
    </div>
    <div class="library-toolbar">
      <label class="library-search"><span class="screenreader">Texte durchsuchen</span><input id="librarySearch" type="search" value="${esc(libraryView.query)}" placeholder="Titel, Text oder Ordner durchsuchen …" autocomplete="off"></label>
      <label class="library-sort">SORTIEREN<select id="librarySort"><option value="updated">Zuletzt bearbeitet</option><option value="title">Titel A–Z</option><option value="created">Neu erstellt</option><option value="bars">Meiste Bars</option></select></label>
    </div>
    <div class="library-shell">
      <aside class="library-folders" aria-label="Ordner">
        <div class="library-folder-head"><span class="eyebrow">ORDNERSTRUKTUR</span>${libraryView.trash?'':'<button id="newFolderBtn" class="icon" aria-label="Neuer Hauptordner" title="Neuer Hauptordner">＋</button>'}</div>
        <div class="library-folder-row"><button data-folder-filter="all" class="${allActive?'active':''}" aria-pressed="${allActive}"><span>Alle Texte</span><small>${sourceRows.length}</small></button></div>
        ${folders.map(folderButton).join('')}
      </aside>
      <section class="library-content">
        <div class="library-results-head"><span>${rows.length} ${rows.length===1?'Text':'Texte'}</span>${libraryView.folder!=='all'?'<button data-folder-filter="all">Filter löschen ×</button>':''}</div>
        <div class="song-grid">${cards||'<div class="library-empty"><b>Nichts gefunden.</b><span>Suchbegriff oder Ordnerfilter ändern.</span></div>'}</div>
      </section>
    </div>`;

  $('#librarySort').value=libraryView.sort;
  $('#librarySearch').oninput=(event)=>{libraryView.query=event.target.value;renderLibrary(libraryView.trash);const input=$('#librarySearch');input.focus();input.setSelectionRange(input.value.length,input.value.length)};
  $('#librarySort').onchange=(event)=>{libraryView.sort=event.target.value;renderLibrary(libraryView.trash)};
  $('#trashToggle').onclick=()=>{libraryView.trash=!libraryView.trash;libraryView.folder='all';renderLibrary(libraryView.trash)};
  if($('#newSongMain'))$('#newSongMain').onclick=newSong;
  if($('#newFolderBtn'))$('#newFolderBtn').onclick=createLibraryFolder;
  if(!libraryView.trash){
    queryAll('[data-library-song-drag]').forEach((card)=>{
      card.addEventListener('dragstart',(event)=>{
        event.dataTransfer?.setData('application/x-rhymelab-song',card.dataset.librarySongDrag);
        event.dataTransfer?.setData('text/plain',card.dataset.librarySongDrag);
        if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend',()=>{
        card.classList.remove('is-dragging');
        queryAll('[data-folder-drop]').forEach((row)=>row.classList.remove('is-drop-target'));
      });
    });
    queryAll('[data-folder-drop]').forEach((row)=>{
      row.addEventListener('dragenter',(event)=>{
        if(!event.dataTransfer?.types?.includes('application/x-rhymelab-song'))return;
        event.preventDefault();row.classList.add('is-drop-target');
      });
      row.addEventListener('dragover',(event)=>{
        if(!event.dataTransfer?.types?.includes('application/x-rhymelab-song'))return;
        event.preventDefault();
        if(event.dataTransfer)event.dataTransfer.dropEffect='move';
        row.classList.add('is-drop-target');
      });
      row.addEventListener('dragleave',(event)=>{
        if(!row.contains(event.relatedTarget))row.classList.remove('is-drop-target');
      });
      row.addEventListener('drop',(event)=>{
        event.preventDefault();row.classList.remove('is-drop-target');
        const id=event.dataTransfer?.getData('application/x-rhymelab-song')||event.dataTransfer?.getData('text/plain');
        if(id)moveLibrarySongToFolder(id,row.dataset.folderDrop);
      });
    });
  }
}
function renderSaved(){$('#largeView').innerHTML=`<div class="eyebrow">Wörter für später</div><h1 style="margin-top:9px">Deine Merkliste.</h1><p class="muted" style="margin-top:14px">Gute Funde, direkt zurück in deinen Text.</p><div class="collection-list">${state.saved.map(r=>`<div class="result"><div class="grow"><h3>${esc(r.word)}</h3><small>Gefunden zu „${esc(r.anchor)}“</small></div><button data-insert="${esc(r.word)}" class="outline">Einsetzen</button><button data-save="${esc(r.word)}" aria-label="${esc(r.word)} entfernen">×</button></div>`).join('')||'<div class="empty">Merke ein Wort über das Lesezeichen neben einem Reim.</div>'}</div>`}
function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportText(){
  const blob=new Blob([song().title+'\n\n'+song().lines.join('\n')],{type:'text/plain;charset=utf-8'});
  downloadBlob(blob,(song().title.replace(/[^\p{L}\p{N} -]/gu,'')||'rhymelab')+'.txt');
  notify('Text als TXT exportiert.');
}
function runAuto(t){if(!auto)return;const el=$('#resultsScroll');if(t>pauseUntil&&!document.hidden&&!$('#dialog').open&&el.clientHeight>0){el.scrollTop+=(t-(lastFrame||t))*.018;if(el.scrollTop+el.clientHeight>=el.scrollHeight-2){if(pageSize<data().length){pageSize+=6;renderResults()}else{el.scrollTop=0;pauseUntil=t+1200}}}lastFrame=t;scrollFrame=requestAnimationFrame(runAuto)}
function toggleAuto(){auto=!auto;$('#autoBtn').textContent='Auto-Scroll: '+(auto?'An':'Aus');$('#autoBtn').setAttribute('aria-pressed',auto);cancelAnimationFrame(scrollFrame);lastFrame=0;if(auto){pauseUntil=performance.now()+1000;scrollFrame=requestAnimationFrame(runAuto)}}
function bind(){const required=['lyrics','searchForm','dialog','results','workspace','largeView','performView','rhymeView','writeView','themeBtn','exportBtn','filterBtn','autoBtn','moreBtn','focusBtn'];for(const id of required)if(!document.getElementById(id))throw Error('Fehlendes Element: '+id);
const bindClick=(id,handler,{optional=false}={})=>{
  const element=document.getElementById(id);
  if(!element){
    if(optional)return null;
    throw new Error('Fehlendes interaktives Element: '+id);
  }
  element.onclick=handler;
  return element;
};
bindClick('closeDialog',closeDialog);
bindClick('themeBtn',toggleTheme);
bindClick('deviceGuidePass',()=>completeActiveDeviceGuide(true));
bindClick('deviceGuideFail',()=>completeActiveDeviceGuide(false));
bindClick('deviceGuideBack',returnToDeviceAcceptanceCenter);
bindClick('uiLanguageBtn',toggleStudioUiLanguage);
bindClick('clearDocBtn',clearCurrentDocument,{optional:true});
bindClick('exportBtn',exportText);
bindClick('commandBtn',showCommands);
bindClick('settingsBtn',showSettings);
bindClick('settingsSide',showSettings);
bindClick('filterBtn',showFilters);
bindClick('languageBtn',showFilters);
bindClick('historyBtn',showHistory);
bindClick('infoBtn',showInfo);
bindClick('focusBtn',toggleFocus);
bindClick('newSongSidebar',newSong);
bindClick('renameBtn',()=>nameDialog('Titel ändern',song().title,t=>{song().title=t;persist();renderEditor()}));
bindClick('addBar',()=>{
  pushUndo();
  const current=song(),last=current.lines.length-1;
  splitEditorBar(current,last,current.lines[last].length,current.lines[last].length);
  activeLine=current.lines.length-1;
  renderEditor();focusLine(activeLine,0);changed();
});
bindClick('undoBtn',performUndo);
bindClick('redoBtn',performRedo);
const searchForm=$('#searchForm');
searchForm.onsubmit=e=>{
  e.preventDefault();
  query=$('#searchInput').value.trim()||query;
  pageSize=6;
  void refreshWriterResults();
  $('#resultsScroll').scrollTop=0;
};
bindClick('autoBtn',toggleAuto);
bindClick('moreBtn',()=>{pageSize+=6;renderResults()});
const resultsScroll=$('#resultsScroll');
resultsScroll.addEventListener('scroll',()=>{
  if(resultsScroll.scrollTop>0&&resultsScroll.scrollHeight-resultsScroll.scrollTop-resultsScroll.clientHeight<90&&pageSize<data().length){
    pageSize+=6;renderResults();
  }
},{passive:true});
['wheel','touchstart','pointerdown','focusin'].forEach((eventName)=>
  resultsScroll.addEventListener(eventName,()=>pauseUntil=performance.now()+5000,{passive:true})
);
queryAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));queryAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));queryAll('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope;pageSize=6;setExclusivePressed(queryAll('[data-scope]'),scope,'scope');void refreshWriterResults()});queryAll('[data-mobile]').forEach(b=>b.onclick=()=>{const dest=b.dataset.mobile;if(dest==='settings')return showSettings();if(dest==='results'){navigate('studio');document.body.classList.remove('focus');document.body.classList.add('mobile-results');setMobileActive('results')}else navigate(dest)});
document.addEventListener('click',(event)=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.insert)insertWord(button.dataset.insert);
  if(button.dataset.save)toggleSave(button.dataset.save);
  if(button.dataset.query){query=button.dataset.query;void refreshWriterResults()}
  if(button.dataset.retryWriter)void refreshWriterResults();
  if(button.dataset.detail)openDetail(button.dataset.detail,button.dataset.detailId||'');
  if(button.dataset.song)openSong(button.dataset.song);
  if(button.dataset.trash)trashLibrarySong(button.dataset.trash);
  if(button.dataset.restore)restoreLibrarySong(button.dataset.restore);
  if(button.dataset.permanentDelete)permanentlyDeleteLibrarySong(button.dataset.permanentDelete);
  if(button.dataset.renameSong)renameLibrarySong(button.dataset.renameSong);
  if(button.dataset.moveSong)moveLibrarySong(button.dataset.moveSong);
  if(button.dataset.folderFilter){
    libraryView.folder=button.dataset.folderFilter;
    renderLibrary(libraryView.trash);
  }
  if(button.dataset.folderDelete)deleteLibraryFolder(button.dataset.folderDelete);
  if(button.dataset.folderSubfolder)createLibrarySubfolder(button.dataset.folderSubfolder);
  if(button.dataset.folderRename)renameLibraryFolder(button.dataset.folderRename);
  if(button.dataset.folderMoveUp)reorderLibraryFolder(button.dataset.folderMoveUp,-1);
  if(button.dataset.folderMoveDown)reorderLibraryFolder(button.dataset.folderMoveDown,1);
});
document.addEventListener('keydown',e=>{
  const modifier=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
  if(modifier&&key==='z'){e.preventDefault();if(e.shiftKey)performRedo();else performUndo();return}
  if(modifier&&key==='y'){e.preventDefault();performRedo();return}
  if(modifier&&key==='k'){e.preventDefault();showCommands()}
  if(e.altKey&&e.key==='1'){e.preventDefault();navigate('studio')}
  if(e.altKey&&e.key==='2'){e.preventDefault();navigate('search')}
  if(e.altKey&&key==='f'){e.preventDefault();toggleFocus()}
});window.addEventListener('resize',()=>queryAll('#lyrics textarea').forEach(resizeArea));document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPlay();void flushStudioPersistence('visibility_hidden')}});window.addEventListener('pagehide',()=>{void flushStudioPersistence('pagehide');mobileViewportCleanup?.();uiLocalizer?.disconnect()});document.body.dataset.controls='bound';}
// Version 2: direct desktop controls and docked surfaces.
let density=normalizeDensity(state.density),syllableMode='all',followSelection=true,selectedResult='',selectedResultId='',dockTab='',resultSignature='',selectionProof=null,barNavigatorQuery='';
state.motion=state.motion||'auto';
const baseData=data, baseRenderResults=renderResults, baseRenderEditor=renderEditor, baseCapture=captureSelection, baseInsert=insertWord, baseToggleSave=toggleSave, baseMode=setMode;
function animateSurface(el,name='surface-enter'){if(!el)return;el.classList.remove(name);void el.offsetWidth;el.classList.add(name)}
function sortedData(){return sortStudioWriterRows(data(),{sort,rhymeType,querySyllables:writerQuerySyllables||syll(query),locale:basis==='en'?'en':'de'})}

function resultBadges(row){
  const raw=row?.raw||{},badges=[];
  const list=(value)=>Array.isArray(value)?value:(value==null||value===''?[]:[value]);
  const push=(value,kind='meta')=>{
    const label=String(value??'').trim();
    if(!label||badges.some((item)=>item.label===label))return;
    badges.push({label,kind});
  };
  if(raw.historical)push('Historisch','warn');
  if(raw.generatedPronunciation||row.generatedPronunciation)push('Generated','generated');
  if(raw.partOfSpeech&&raw.partOfSpeech!=='phrase')push(humanizeDetail(raw.partOfSpeech),'pos');
  for(const value of list(raw.lexicalTags))push(humanizeDetail(value),'lexical');
  for(const value of list(raw.phraseTypes))push(humanizeDetail(value),'phrase');
  if(raw.primaryCategory)push(humanizeDetail(raw.primaryCategory),'entity');
  for(const entry of list(raw.entityCategories)){
    push(humanizeDetail(typeof entry==='string'?entry:entry?.category),'entity');
  }
  if(raw.lexiconLayer&&raw.lexiconLayer!=='phrase')push(humanizeDetail(raw.lexiconLayer),'source');
  if(raw.pronunciationSource)push(humanizeDetail(raw.pronunciationSource),'source');
  if(row.usageRank!=null&&Number.isFinite(Number(row.usageRank)))push('Usage #'+Number(row.usageRank),'usage');
  return badges.slice(0,5);
}
function resultBadgeMarkup(row){
  const badges=resultBadges(row);
  return badges.length
    ?'<div class="result-badges">'+badges.map((badge)=>'<span data-kind="'+esc(badge.kind)+'">'+esc(badge.label)+'</span>').join('')+'</div>'
    :'';
}
function writerTimingText(){
  if(writerStatus==='loading')return 'Runtime …';
  if(writerStatus!=='ready'||!writerRuntimeTiming)return '';
  const current=writerRuntimeTiming.searchMs==null?null:Number(writerRuntimeTiming.searchMs);
  const average=writerRuntimeTiming.averageLast100Ms==null?null:Number(writerRuntimeTiming.averageLast100Ms);
  const count=Number(writerRuntimeTiming.sampleCount||0);
  const parts=[];
  if(current!=null&&Number.isFinite(current))parts.push(current.toFixed(current<10?1:0)+' ms');
  if(average!=null&&Number.isFinite(average))parts.push('Ø100 '+average.toFixed(average<10?1:0)+' ms');
  if(count)parts.push('n='+count);
  return parts.join(' · ');
}
data=function(){return filterUnusedWriterRows(filterStudioWriterRows(baseData(),{rhymeType,syllableMode,querySyllables:writerQuerySyllables||syll(query)}))};
resultHTML=function(r){const saved=state.saved.some(s=>s.word===r.word),kind=r.kind==='phrase'?'PHRASE':r.kind==='entity'?'NAME':'',active=selectedResultId?selectedResultId===r.id:selectedResult===r.word,shortRelation=({multisyllabic_perfect:'Multi-Voll',perfect:'Voll',multisyllabic_slant:'Multi-Slant',family:'Familie',slant:'Slant',assonance:'Asson.',consonance:'Konson.'})[r.relationType]||'Klang';return `<div class="result ${active?'is-selected':''}" data-result-word="${esc(r.word)}" data-result-id="${esc(r.id)}"><div class="grow"><button class="result-word" data-detail="${esc(r.word)}" data-detail-id="${esc(r.id)}" aria-label="Details zu ${esc(r.word)}" aria-pressed="${active}">${esc(r.word)}${kind?`<span class="result-kind">${kind}</span>`:''}</button><div class="result-meta"><b>${esc(r.relationLabel||'Klangtreffer')}</b><span>${r.syll||'—'} Silb.</span><span>${r.kind==='word'?'Wort':r.kind==='phrase'?'Phrase':'Name'} · ${r.lang.toUpperCase()}</span></div>${resultBadgeMarkup(r)}</div><span class="result-relation">${esc(shortRelation)}</span><span class="result-syll">${r.syll||'—'}</span><div class="result-actions"><button data-save="${esc(r.word)}" class="${saved?'saved':''}" aria-pressed="${saved}" aria-label="${esc(r.word)} ${saved?'entmerken':'merken'}">${icon('book')}</button><button data-insert="${esc(r.word)}" aria-label="${esc(r.word)} einsetzen">${icon('plus')}</button></div></div>`};
renderResults=function(){
  const renderStarted=performance.now();
  baseRenderResults();
  const runtimeInline=$('#runtimeInline');if(runtimeInline)runtimeInline.textContent=writerTimingText();
  const panel=$('.inspector');['list','compact','tiles'].forEach(v=>panel.classList.toggle('density-'+v,v===density));
  queryAll('[data-density]').forEach(b=>{b.classList.toggle('active',b.dataset.density===density);b.setAttribute('aria-pressed',b.dataset.density===density)});
  queryAll('#results .result').forEach((r,i)=>r.style.setProperty('--i',i));
  const sig=[query,scope,relation,rhymeType,variantMode,entityCategories.join(','),includeHistorical,generated,generatedOnly,sort,basis,resultLang,syllableMode,density,internalDbLabEnabled?internalDbLabActive:'default'].join('|');
  if(sig!==resultSignature){animateSurface($('#results'),'results-enter');animateSurface($('#anchorWord'),'anchor-change');resultSignature=sig;$('#resultsScroll').scrollTop=0}
  syncInline();
  if(selectedResult&&!data().some(r=>selectedResultId?r.id===selectedResultId:r.word===selectedResult)){selectedResult='';selectedResultId='';selectedDetail=null;$('#detailDock').classList.add('hidden')}
  if(selectedResult&&!$('#detailDock').classList.contains('hidden'))renderDetail();
  $('#resultCount').textContent=writerStatus==='loading'?'Suche …':writerStatus==='error'?'Nicht verfügbar':data().length+' Treffer'+(hiddenUsedCount?' · '+hiddenUsedCount+' verwendet ausgeblendet':'');
  $('#filterLabel').textContent=$('#directFilters').classList.contains('hidden')?'Filter öffnen':hasActiveSearchFilters()?'Filter aktiv':'Filter sichtbar';
  lastResultRenderMs=Number((performance.now()-renderStarted).toFixed(1));
  if(internalDbLabEnabled)renderInternalDbLab();
};
renderEditor=function(){baseRenderEditor();selectionProof=createSelectionProof(song(),{index:selection.line,start:selection.start,end:selection.end});$('#fontSizeLive').textContent=state.fontSize;if(dockTab==='saved'||dockTab==='navigator')renderDock();};
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
    entityCategories.length>0,
    includeHistorical,
    generated,
    generatedOnly,
  ].filter(Boolean).length;
}
function availableEntityCategories(){
  const values=writerCapabilities?.entities?.categories;
  return Array.isArray(values)?values:[];
}
function setEntityCategories(values,{refresh=true}={}){
  const available=availableEntityCategories();
  const next=[];
  for(const value of Array.isArray(values)?values:[]){
    const category=String(value||'').trim();
    if(!category||category==='all'||next.includes(category))continue;
    if(available.length&&!available.includes(category))continue;
    next.push(category);
    if(next.length>=24)break;
  }
  entityCategories=next;
  entityCategory=entityCategories[0]||'all';
  saveStudioSearchState({entityCategory,entityCategories});
  syncAdvancedControls();
  if(refresh)void refreshWriterResults();
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
  const categoryMulti=$('#advancedEntityCategoryMulti');
  const categories=availableEntityCategories();
  if(categories.length){
    entityCategories=entityCategories.filter((value)=>categories.includes(value));
    entityCategory=entityCategories[0]||'all';
  }
  categorySelect.innerHTML='<option value="all">Alle Entities</option>'+categories.map((value)=>'<option value="'+esc(value)+'">'+esc(humanizeDetail(value))+'</option>').join('');
  categorySelect.value=entityCategory;
  const categoryAvailable=categories.length>0&&(scope==='all'||scope==='entity');
  const categoryField=$('#advancedEntityCategoryField');
  categoryField.classList.toggle('is-unavailable',!categoryAvailable);
  categorySelect.disabled=!categoryAvailable;
  categoryMulti.innerHTML='<button type="button" data-entity-category="all" class="'+(!entityCategories.length?'active':'')+'" aria-pressed="'+String(!entityCategories.length)+'">Alle</button>'
    +categories.map((value)=>{
      const active=entityCategories.includes(value);
      return '<button type="button" data-entity-category="'+esc(value)+'" class="'+(active?'active':'')+'" aria-pressed="'+String(active)+'" '+(!categoryAvailable?'disabled':'')+'>'+esc(humanizeDetail(value))+'</button>';
    }).join('');
  queryAll('#advancedEntityCategoryMulti [data-entity-category]').forEach((button)=>button.onclick=()=>{
    const value=button.dataset.entityCategory;
    if(value==='all'){setEntityCategories([]);return}
    const next=entityCategories.includes(value)
      ?entityCategories.filter((item)=>item!==value)
      :[...entityCategories,value];
    setEntityCategories(next);
  });

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
  return scope!=='all'||relation!=='all'||rhymeType!=='all'||syllableMode!=='all'||resultLang!=='both'||basis!=='de'||sort!=='recommended'||variantMode!=='preferred'||entityCategories.length>0||includeHistorical||generated||generatedOnly;
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
  for(const category of entityCategories)items.push(['entityCategory:'+category,'Entity: '+humanizeDetail(category)]);
  if(includeHistorical)items.push(['historical','Historisch']);
  if(generated)items.push(['generated','Generated']);
  if(generatedOnly)items.push(['generatedOnly','Nur Generated']);
  $('#activeFilters').innerHTML=items.map(([id,label])=>`<button data-clear-filter="${id}" aria-label="Filter ${esc(label)} entfernen">${esc(label)} ×</button>`).join('');
}
function resetInline(){
  scope='all';relation='all';rhymeType='all';variantMode='preferred';entityCategory='all';entityCategories=[];includeHistorical=false;generated=false;generatedOnly=false;sort='recommended';basis='de';resultLang='both';syllableMode='all';pageSize=12;
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
    button.setAttribute('aria-label','Light/Dark QuickSwitch · aktiv: '+(resolved.name||state.theme));
    button.title=(resolved.name||state.theme)+' · Klick: gesetzten Light/Dark Style wechseln';
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
function setThemeQuickOpen(open,{render=true}={}){
  const quick=$('#themeQuick'),menuButton=$('#themeMenuBtn');
  if(!quick||!menuButton)return;
  const wasOpen=quick.classList.contains('open');
  clearTimeout(themeQuickCloseTimer);
  themeQuickCloseTimer=0;
  quick.classList.toggle('open',Boolean(open));
  menuButton.setAttribute('aria-expanded',String(Boolean(open)));
  // Never rebuild the menu while focus is moving into an existing item:
  // replacing the focused button between pointerdown and click cancels activation.
  if(open&&render&&!wasOpen)renderThemeQuickMenu();
}
function scheduleThemeQuickClose(delay=180){
  clearTimeout(themeQuickCloseTimer);
  themeQuickCloseTimer=setTimeout(()=>setThemeQuickOpen(false,{render:false}),delay);
}
function bindThemeQuickMenu(){
  const quick=$('#themeQuick'),menu=$('#themeQuickMenu'),button=$('#themeBtn'),menuButton=$('#themeMenuBtn');
  if(!quick||!menu||!button||!menuButton)return;
  renderThemeQuickMenu();

  // Main control preserves the original one-click switch between configured
  // Light/Dark slots. The adjacent chevron owns explicit menu opening so
  // touch users are not forced to rely on hover.
  button.onclick=function(event){
    event.preventDefault();
    event.stopPropagation();
    toggleTheme();
    setThemeQuickOpen(false,{render:false});
  };
  menuButton.onclick=function(event){
    event.preventDefault();
    event.stopPropagation();
    setThemeQuickOpen(!quick.classList.contains('open'));
  };
  const openFromKeyboard=function(event){
    if(event.key==='ArrowDown'){
      event.preventDefault();
      setThemeQuickOpen(true);
      requestAnimationFrame(()=>menu.querySelector('[data-theme-choice]')?.focus());
    }
    if(event.key==='Escape'){
      event.preventDefault();
      setThemeQuickOpen(false,{render:false});
    }
  };
  button.addEventListener('keydown',openFromKeyboard);
  menuButton.addEventListener('keydown',openFromKeyboard);

  quick.addEventListener('mouseenter',()=>setThemeQuickOpen(true));
  quick.addEventListener('mouseleave',()=>scheduleThemeQuickClose());
  menu.addEventListener('mouseenter',()=>setThemeQuickOpen(true,{render:false}));
  menu.addEventListener('mouseleave',()=>scheduleThemeQuickClose());
  quick.addEventListener('focusin',function(event){
    if(event.target!==button&&event.target!==menuButton)setThemeQuickOpen(true,{render:false});
  });
  quick.addEventListener('focusout',function(){
    requestAnimationFrame(function(){
      if(!quick.contains(document.activeElement))scheduleThemeQuickClose(80);
    });
  });

  menu.addEventListener('click',function(event){
    const target=event.target.closest('[data-theme-choice]');
    if(!target)return;
    event.preventDefault();
    event.stopPropagation();
    const choice=target.dataset.themeChoice;
    applyThemeChoice(choice);
    setThemeQuickOpen(false,{render:false});
    button.focus({preventScroll:true});
  });

  document.addEventListener('pointerdown',function(event){
    if(!quick.contains(event.target))setThemeQuickOpen(false,{render:false});
  });
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&quick.classList.contains('open')){
      setThemeQuickOpen(false,{render:false});
      button.focus({preventScroll:true});
    }
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
function formatLabBytes(value){
  const bytes=Number(value||0);
  if(!Number.isFinite(bytes)||bytes<=0)return '—';
  if(bytes>=1024**3)return (bytes/1024**3).toFixed(bytes>=10*1024**3?1:2)+' GiB';
  if(bytes>=1024**2)return (bytes/1024**2).toFixed(bytes>=100*1024**2?0:1)+' MiB';
  if(bytes>=1024)return (bytes/1024).toFixed(1)+' KiB';
  return bytes+' B';
}
function formatLabMs(value){
  const ms=Number(value);
  if(!Number.isFinite(ms))return '—';
  return ms.toFixed(ms<10?1:0)+' ms';
}
function internalDbActiveSummary(){
  return internalDbSummaryMap(internalDbLabPayload)[internalDbLabActive]||null;
}
function internalDbCardMarkup(row){
  const caps=row?.capabilities||{};
  const timing=row?.queryTiming||{};
  const meta=row?.meta||{};
  const capsMarkup=[
    ['DE',caps.words_de],['EN',caps.words_en],['Phrases',caps.phrases],
    ['Entities',caps.entities],['Generated',caps.generated],
  ].map(([label,on])=>'<span class="'+(on?'':'off')+'">'+label+'</span>').join('');
  return '<article class="internal-db-card '+(row?.id===internalDbLabActive?'active ':'')+(row?.available?'':'off')+'">'
    +'<div class="internal-db-card-head"><b>'+esc(String(row?.id||'').toUpperCase())+'</b><span>'+(row?.available?'READY':'UNAVAILABLE')+'</span></div>'
    +'<dl>'
    +'<dt>File</dt><dd>'+formatLabBytes(row?.file?.sizeBytes)+'</dd>'
    +'<dt>Allocated</dt><dd>'+formatLabBytes(row?.sqlite?.allocatedBytes)+'</dd>'
    +'<dt>Free pages</dt><dd>'+formatLabBytes(row?.sqlite?.freeBytes)+'</dd>'
    +'<dt>Pages</dt><dd>'+Number(row?.sqlite?.pageCount||0).toLocaleString('de-DE')+'</dd>'
    +'<dt>Tables / Indexes</dt><dd>'+Number(row?.sqlite?.tables||0)+' / '+Number(row?.sqlite?.indexes||0)+'</dd>'
    +'<dt>Target entries</dt><dd>'+esc(meta.distribution_total_target||'MASTER')+'</dd>'
    +'<dt>Last query</dt><dd>'+formatLabMs(timing.searchMs)+'</dd>'
    +'<dt>Ø100</dt><dd>'+formatLabMs(timing.averageLast100Ms)+'</dd>'
    +'<dt>Samples</dt><dd>'+Number(timing.sampleCount||0)+'</dd>'
    +'</dl><div class="capline">'+capsMarkup+'</div>'
    +(row?.error?'<small class="small">'+esc(row.error)+'</small>':'')
    +'</article>';
}
function currentInternalDbLabMetrics(){
  return {
    browser:browserRuntimeMetrics({
      windowObj:window,
      documentObj:document,
      performanceObj:performance,
      navigatorObj:navigator,
    }),
    studio:studioRuntimeMetrics({
      activeDb:internalDbLabActive,
      writerStatus,
      writerRuntimeTiming,
      writerClientTiming,
      writerExecution,
      lastRenderMs:lastResultRenderMs,
      resultCount:writerRows.length,
      visibleResultCount:data().length,
      query,
    }),
  };
}
function renderInternalDbLab(){
  const root=$('#internalDbLab');
  if(!root)return;
  root.classList.toggle('hidden',!internalDbLabEnabled);
  if(!internalDbLabEnabled)return;
  const map=internalDbSummaryMap(internalDbLabPayload);
  const active=map[internalDbLabActive];
  queryAll('#internalDbSwitch [data-runtime-db]').forEach((button)=>{
    const row=map[button.dataset.runtimeDb];
    const available=row?.available===true;
    button.disabled=!available;
    button.classList.toggle('active',button.dataset.runtimeDb===internalDbLabActive);
    button.setAttribute('aria-pressed',String(button.dataset.runtimeDb===internalDbLabActive));
    const small=button.querySelector('small');
    if(small)small.textContent=available
      ?formatLabBytes(row.file?.sizeBytes)+(row.meta?.distribution_total_target?' · '+Number(row.meta.distribution_total_target).toLocaleString('de-DE'):' · MASTER')
      :'nicht verfügbar';
  });
  const status=$('#internalDbLabStatus');
  if(status)status.textContent=active?.available
    ?String(internalDbLabActive).toUpperCase()+' · '+formatLabBytes(active.file?.sizeBytes)+' · '+(writerExecution||'bereit')
    :'DB nicht verfügbar';
  const metrics=$('#internalDbMetrics');
  metrics?.classList.toggle('hidden',!internalDbLabMetricsOpen);
  $('#internalDbMetricsToggle')?.setAttribute('aria-expanded',String(internalDbLabMetricsOpen));
  if(!metrics||!internalDbLabMetricsOpen)return;
  const live=currentInternalDbLabMetrics();
  const s=live.studio,b=live.browser,server=internalDbLabPayload?.server||{};
  metrics.innerHTML='<div class="internal-db-metrics-head"><div><b>DB + Site Performance Lab</b><small>Per-request routing · Ergebnisse, Details und Song-Analyse bleiben an '+esc(internalDbLabActive.toUpperCase())+' gebunden.</small></div><small>Internal only · shipping=false</small></div>'
    +'<div class="internal-db-live-grid">'
    +'<div class="internal-db-metric"><small>Server search</small><b>'+formatLabMs(s.serverSearchMs)+'</b></div>'
    +'<div class="internal-db-metric"><small>Client roundtrip</small><b>'+formatLabMs(s.clientRoundTripMs)+'</b></div>'
    +'<div class="internal-db-metric"><small>Result render</small><b>'+formatLabMs(s.resultRenderMs)+'</b></div>'
    +'<div class="internal-db-metric"><small>Results</small><b>'+Number(s.resultCount||0).toLocaleString('de-DE')+'</b></div>'
    +'<div class="internal-db-metric"><small>TTFB</small><b>'+formatLabMs(b.navigation?.ttfbMs)+'</b></div>'
    +'<div class="internal-db-metric"><small>FCP</small><b>'+formatLabMs(b.paint?.['first-contentful-paint'])+'</b></div>'
    +'</div>'
    +'<div class="internal-db-card-grid">'+(internalDbLabPayload?.databases||[]).map(internalDbCardMarkup).join('')+'</div>'
    +'<div class="internal-db-tech-grid"><section class="internal-db-tech"><h4>Browser / Site</h4><pre>'+esc(JSON.stringify(b,null,2))+'</pre></section>'
    +'<section class="internal-db-tech"><h4>Server / Process</h4><pre>'+esc(JSON.stringify(server,null,2))+'</pre></section></div>';
}
async function refreshInternalDbLabPayload({silent=false}={}){
  if(!internalDbLabEnabled&&!silent)return null;
  const response=await fetch('/api/internal/distribution-dbs',{headers:{accept:'application/json'}});
  if(response.status===404){
    internalDbLabEnabled=false;
    internalDbLabPayload=null;
    renderInternalDbLab();
    return null;
  }
  const payload=await response.json();
  if(!response.ok||payload?.enabled!==true)throw new Error(payload?.error||'Internal DB Lab unavailable');
  internalDbLabEnabled=true;
  internalDbLabPayload=payload;
  const map=internalDbSummaryMap(payload);
  if(!map[internalDbLabActive]?.available){
    internalDbLabActive=map.master?.available?'master':Object.values(map).find((row)=>row.available)?.id||'master';
    saveInternalDbLabSelection(internalDbLabActive);
  }
  studioCapabilities=studioCapabilitiesFromInternalDb(map[internalDbLabActive],studioCapabilities);
  updateCapabilitySurface();
  renderInternalDbLab();
  return payload;
}
async function setInternalDbLabDb(id){
  if(!internalDbLabEnabled)return;
  const next=String(id||'').toLowerCase();
  const summary=internalDbSummaryMap(internalDbLabPayload)[next];
  if(!summary?.available){notify('DB '+String(next).toUpperCase()+' ist nicht verfügbar.');return}
  if(next===internalDbLabActive)return;
  internalDbLabActive=saveInternalDbLabSelection(next);
  writerSearch.cancel();
  detailClient.clear();
  detailClient.cancel();
  selectedResult='';selectedResultId='';selectedDetail=null;selectedDetailStatus='idle';selectedDetailError='';
  $('#detailDock')?.classList.add('hidden');
  analysisAbort?.abort?.();analysisSignature='';analysisStatus='idle';analysisData=null;
  writerRows=[];writerRuntimeTiming=null;writerClientTiming=null;writerExecution=null;lastResultRenderMs=null;
  if(summary.capabilities?.generated!==true){generated=false;generatedOnly=false}
  studioCapabilities=studioCapabilitiesFromInternalDb(summary,studioCapabilities);
  updateCapabilitySurface();
  renderResults();
  renderInternalDbLab();
  notify('Runtime DB → '+next.toUpperCase());
  await refreshStudioCapabilities();
  studioCapabilities=studioCapabilitiesFromInternalDb(internalDbActiveSummary(),studioCapabilities);
  updateCapabilitySurface();
  await refreshWriterResults();
  if(mode==='rhyme')void refreshSongAnalysis(true);
}
async function copyInternalDbLabMetrics(){
  const live=currentInternalDbLabMetrics();
  const payload=internalDbLabCopyPayload({
    payload:internalDbLabPayload,
    activeDb:internalDbLabActive,
    browser:live.browser,
    studio:live.studio,
  });
  const text=JSON.stringify(payload,null,2);
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    const area=document.createElement('textarea');
    area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';
    document.body.append(area);area.select();document.execCommand('copy');area.remove();
  }
  notify('DB + Site Metrics kopiert.');
  return payload;
}
async function initializeInternalDbLab(){
  try{
    const response=await fetch('/api/internal/distribution-dbs',{headers:{accept:'application/json'}});
    if(response.status===404){renderInternalDbLab();return false}
    const payload=await response.json();
    if(!response.ok||payload?.enabled!==true){renderInternalDbLab();return false}
    internalDbLabEnabled=true;
    internalDbLabPayload=payload;
    const map=internalDbSummaryMap(payload);
    if(!map[internalDbLabActive]?.available)internalDbLabActive=map.master?.available?'master':'lite';
    saveInternalDbLabSelection(internalDbLabActive);
    studioCapabilities=studioCapabilitiesFromInternalDb(map[internalDbLabActive],studioCapabilities);
    queryAll('#internalDbSwitch [data-runtime-db]').forEach((button)=>{
      button.onclick=()=>{void setInternalDbLabDb(button.dataset.runtimeDb)};
    });
    $('#internalDbMetricsToggle').onclick=()=>{
      internalDbLabMetricsOpen=!internalDbLabMetricsOpen;
      renderInternalDbLab();
    };
    $('#internalDbMetricsCopy').onclick=()=>{void copyInternalDbLabMetrics()};
    $('#internalDbMetricsRefresh').onclick=async()=>{
      try{await refreshInternalDbLabPayload({silent:true});notify('DB-Metriken aktualisiert.')}
      catch(error){notify('Metrics-Refresh fehlgeschlagen: '+(error instanceof Error?error.message:String(error)))}
    };
    renderInternalDbLab();
    return true;
  }catch(error){
    console.warn('Internal DB Lab disabled:',error);
    internalDbLabEnabled=false;
    renderInternalDbLab();
    return false;
  }
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
    studioCapabilities=await loadStudioCapabilities({
      runtimeDb:internalDbLabEnabled?internalDbLabActive:'',
    });
    if(internalDbLabEnabled){
      const summary=internalDbSummaryMap(internalDbLabPayload)[internalDbLabActive];
      studioCapabilities=studioCapabilitiesFromInternalDb(summary,studioCapabilities);
    }
  }catch(error){
    studioCapabilities={status:'error',error:error instanceof Error?error.message:String(error)};
  }
  updateCapabilitySurface();
}

function applyDocumentSnapshotState(snapshot){
  state=studioStateFromDocumentSnapshot(snapshot,{...state,...loadStudioPreferences()});
  normalizeStudioRuntimeState();
  activeLine=Math.min(activeLine,Math.max(0,song().lines.length-1));
  selection={line:activeLine,start:0,end:0};
  undo=[];redo=[];
  renderEditor();
  renderProjects();
  if(page==='library')renderLibrary(libraryView.trash);
  writeStudioPreferences(state);
}
async function exportPortableStudioBackup(){
  if(!documentStoreInitialized)throw new Error('DocumentStore ist nicht verfügbar.');
  await syncDocumentShadow();
  const snapshot=await documentStore.loadSnapshot();
  if(!snapshot)throw new Error('Kein Dokument-Snapshot vorhanden.');
  const payload=createPortableStudioBackup({
    snapshot,
    preferences:studioPreferencesFromState(state),
    searchState:sharedSearchState,
  });
  const blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json;charset=utf-8'});
  downloadBlob(blob,portableBackupFilename(song()?.title||'studio'));
  return payload;
}
async function applyPortableStudioBackup(payload){
  if(!documentStoreInitialized)throw new Error('DocumentStore ist nicht verfügbar.');
  const parsed=parsePortableStudioBackup(payload);
  const current=await documentStore.loadSnapshot();
  if(current)await documentStore.saveDocumentBackup(current,{reason:'before_portable_import'});
  await documentStore.saveSnapshot(parsed.snapshot);
  const loaded=await documentStore.loadSnapshot();
  if(!loaded)throw new Error('Import konnte nicht verifiziert werden.');

  state=studioStateFromDocumentSnapshot(loaded,{...state,...parsed.preferences});
  normalizeStudioRuntimeState();
  setStudioUiLanguage(state.uiLanguage,{persistState:false});
  writeStudioPreferences(state);

  if(parsed.searchState&&Object.keys(parsed.searchState).length){
    sharedSearchState=createSearchState(parsed.searchState);
    saveSearchState(sharedSearchState);
    query=sharedSearchState.anchor||query;
    basis=sharedSearchState.queryBasis;
    resultLang=sharedSearchState.resultLanguage;
    scope=({words:'word',phrases:'phrase',entities:'entity'})[sharedSearchState.scope]||'all';
    rhymeType=sharedSearchState.rhymeType;
    variantMode=sharedSearchState.variantMode;
    entityCategory=sharedSearchState.entityCategory;
    entityCategories=Array.isArray(sharedSearchState.entityCategories)?[...sharedSearchState.entityCategories]:[];
    includeHistorical=sharedSearchState.historical;
    generated=sharedSearchState.generated;
    generatedOnly=sharedSearchState.generatedOnly;
    sort=sharedSearchState.sort;
    syllableMode=sharedSearchState.syllableFilter||'all';
  }

  activeLine=0;selection={line:0,start:0,end:0};selectionProof=null;
  undo=[];redo=[];analysisSignature='';
  documentStoreAuthority=true;documentStoreStatus='ready';documentStoreError='';
  applyThemeChoice(state.theme,{persistState:false});
  document.documentElement.style.setProperty('--editor',state.fontSize+'px');
  applyEditorFont();
  renderEditor();renderProjects();renderResults();
  if(page==='library')renderLibrary(libraryView.trash);
  updateCapabilitySurface();
  return parsed;
}
function confirmPortableStudioImport(parsed,fileName='Backup'){
  const counts={
    songs:parsed.snapshot.songs.length,
    bars:parsed.snapshot.bars.length,
    revisions:parsed.snapshot.revisions.length,
    folders:parsed.snapshot.folders.length,
  };
  showDialog('Studio Backup importieren',`<p class="notice"><b>${esc(fileName)}</b> enthält ${counts.songs} Texte, ${counts.bars} Bars, ${counts.revisions} Revisionen und ${counts.folders} Ordner.</p><p class="notice">Der aktuelle IndexedDB-Stand wird automatisch als Recovery-Punkt gesichert, bevor das Backup übernommen wird.</p><div class="dialogactions"><button id="cancelPortableImport">Abbrechen</button><button id="confirmPortableImport" class="primary">Backup importieren</button></div>`);
  $('#cancelPortableImport').onclick=closeDialog;
  $('#confirmPortableImport').onclick=async()=>{
    const button=$('#confirmPortableImport');button.disabled=true;
    try{
      await applyPortableStudioBackup(parsed);
      closeDialog();
      notify('Studio Backup importiert und verifiziert.');
      if(dockTab==='settings')renderDock();
    }catch(error){
      notify('Backup-Import fehlgeschlagen: '+(error instanceof Error?error.message:String(error)));
      button.disabled=false;
    }
  };
}
async function readPortableStudioBackupFile(file){
  if(!file)throw new Error('Keine Backup-Datei ausgewählt.');
  if(file.size>64*1024*1024)throw new Error('Backup-Datei ist größer als 64 MB.');
  return parsePortableStudioBackup(await file.text());
}

async function createRecoveryPoint(reason='manual_recovery_point'){
  if(!documentStoreInitialized)throw new Error('DocumentStore ist nicht verfügbar.');
  await syncDocumentShadow();
  const snapshot=await documentStore.loadSnapshot();
  if(!snapshot)throw new Error('Kein Dokument-Snapshot vorhanden.');
  return documentStore.saveDocumentBackup(snapshot,{reason});
}
async function restoreRecoveryPoint(id){
  const row=await documentStore.getBackup(id);
  if(!row)throw new Error('Recovery-Punkt nicht gefunden.');
  if(row.kind==='document'){
    const result=await documentStore.restoreDocumentBackup(id);
    if(!result.restored)throw new Error(result.reason||'Recovery fehlgeschlagen.');
    applyDocumentSnapshotState(result.snapshot);
  }else if(row.kind==='legacy'||(!row.kind&&row.backup)){
    const current=await documentStore.loadSnapshot();
    if(current)await documentStore.saveDocumentBackup(current,{reason:'before_legacy_recovery'});
    const parsed=JSON.parse(row.backup||'{}');
    const payload=parsed&&typeof parsed==='object'?parsed.payload:null;
    if(!payload)throw new Error('Legacy-Backup ist ungültig.');
    const result=await migrateLegacyStudioStateToStore(payload,documentStore);
    applyDocumentSnapshotState(result.migration.snapshot);
  }else{
    throw new Error('Unbekanntes Backup-Format.');
  }
  documentStoreAuthority=true;
  documentStoreStatus='ready';documentStoreError='';
  persist();
  updateCapabilitySurface();
}
async function renderRecoveryPanel(){
  const panel=$('#recoveryPanel');
  if(!panel)return;
  if(!documentStoreInitialized){
    panel.innerHTML='<p class="small">IndexedDB-Recovery ist in diesem Browser nicht verfügbar.</p>';
    return;
  }
  panel.innerHTML='<p class="small">Recovery-Punkte werden geladen …</p>';
  try{
    const rows=(await documentStore.listBackups()).slice(0,8);
    panel.innerHTML=rows.length
      ?'<div class="recovery-list">'+rows.map((row)=>{
        const when=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(Number(row.createdAt)||Date.now());
        const kind=row.kind==='document'?'Studio Snapshot':'Legacy Import';
        const detail=row.kind==='document'&&row.counts
          ?row.counts.songs+' Texte · '+row.counts.bars+' Bars'
          :(row.sourceSchema||'Migration Backup');
        return '<div class="recovery-row"><div><b>'+esc(when)+' · '+esc(kind)+'</b><small>'+esc(detail)+(row.reason?' · '+esc(row.reason):'')+'</small></div><button class="outline" data-recovery-restore="'+esc(row.id)+'">Wiederherstellen</button></div>';
      }).join('')+'</div>'
      :'<p class="small">Noch keine Recovery-Punkte vorhanden.</p>';
    queryAll('[data-recovery-restore]').forEach((button)=>button.onclick=async()=>{
      button.disabled=true;
      try{
        await restoreRecoveryPoint(button.dataset.recoveryRestore);
        renderDock();
        notify('Recovery-Punkt wiederhergestellt.');
      }catch(error){
        notify('Recovery fehlgeschlagen: '+(error instanceof Error?error.message:String(error)));
        button.disabled=false;
      }
    });
  }catch(error){
    panel.innerHTML='<p class="small">Recovery-Liste nicht verfügbar: '+esc(error instanceof Error?error.message:String(error))+'</p>';
  }
}

function currentDeviceAcceptanceEnvironment(){
  const viewport=window.visualViewport;
  return {
    userAgent:navigator.userAgent||'',
    language:navigator.language||'',
    platform:navigator.userAgentData?.platform||navigator.platform||'',
    viewportWidth:Number(viewport?.width||window.innerWidth||0),
    viewportHeight:Number(viewport?.height||window.innerHeight||0),
    devicePixelRatio:Number(window.devicePixelRatio||1),
    maxTouchPoints:Number(navigator.maxTouchPoints||0),
    coarsePointer:window.matchMedia?.('(pointer: coarse)')?.matches===true,
    audioSupported:Boolean(window.AudioContext||window.webkitAudioContext),
    visualViewportSupported:Boolean(window.visualViewport),
  };
}
function ensureStudioDeviceAcceptance(){
  if(studioDeviceAcceptance)return studioDeviceAcceptance;
  studioDeviceAcceptance=createStudioDeviceAcceptance({
    environment:currentDeviceAcceptanceEnvironment(),
  });
  return studioDeviceAcceptance;
}
function persistStudioDeviceAcceptance(){
  try{localStorage.setItem(DEVICE_ACCEPTANCE_STORAGE_KEY,JSON.stringify(ensureStudioDeviceAcceptance()))}catch{}
}
function deviceEligibilityText(status){
  if(status?.eligible)return state.uiLanguage==='en'?'This device is eligible':'Dieses Gerät ist geeignet';
  const map=state.uiLanguage==='en'
    ?{
      'viewport <= 800 CSS px':'viewport ≤ 800 CSS px',
      'touch/coarse pointer':'touch/coarse pointer',
      'Web Audio support':'Web Audio support',
      'VisualViewport support':'VisualViewport support',
    }
    :{
      'viewport <= 800 CSS px':'Viewport ≤ 800 CSS px',
      'touch/coarse pointer':'Touch/Coarse Pointer',
      'Web Audio support':'Web-Audio-Unterstützung',
      'VisualViewport support':'VisualViewport-Unterstützung',
    };
  const failures=(status?.failures||[]).map((value)=>map[value]||value);
  return (state.uiLanguage==='en'?'Requires: ':'Benötigt: ')+failures.join(' + ');
}
function setStudioDeviceGate(id,passed,note){
  const report=ensureStudioDeviceAcceptance();
  const environment=currentDeviceAcceptanceEnvironment();
  const eligibility=studioDeviceGateEnvironmentStatus(id,environment);
  if(passed&&!eligibility.eligible){
    notify((state.uiLanguage==='en'?'This gate cannot be confirmed here: ':'Dieses Gate kann hier nicht bestätigt werden: ')+deviceEligibilityText(eligibility)+'.');
    renderDeviceAcceptancePanel();
    return false;
  }
  report.environment=environment;
  report.testedAt=Date.now();
  report.results[id]={
    passed:Boolean(passed),
    note:String(note??report.results[id]?.note??'').trim().slice(0,400),
    testedAt:Date.now(),
    environment,
  };
  studioDeviceAcceptance=createStudioDeviceAcceptance(report);
  persistStudioDeviceAcceptance();
  renderDeviceAcceptancePanel();
  return true;
}
function resetStudioDeviceAcceptance(){
  studioDeviceAcceptance=createStudioDeviceAcceptance({environment:currentDeviceAcceptanceEnvironment()});
  persistStudioDeviceAcceptance();
  renderDeviceAcceptancePanel();
}
async function importStudioDeviceAcceptanceFile(file){
  if(!file)throw new Error('Keine Acceptance-Datei ausgewählt.');
  if(file.size>8*1024*1024)throw new Error('Acceptance-Datei ist größer als 8 MB.');
  const incoming=parseStudioDeviceAcceptance(await file.text());
  studioDeviceAcceptance=mergeStudioDeviceAcceptanceReports([
    ensureStudioDeviceAcceptance(),
    incoming,
  ]);
  persistStudioDeviceAcceptance();
  renderDeviceAcceptancePanel();
  return studioDeviceAcceptanceSummary(studioDeviceAcceptance);
}
function exportStudioDeviceAcceptance(){
  const report=ensureStudioDeviceAcceptance();
  downloadBlob(
    new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json;charset=utf-8'}),
    studioDeviceAcceptanceFilename(new Date(report.testedAt||Date.now())),
  );
  return report;
}
function renderActiveDeviceGuide(){
  const bar=$('#deviceGuideBar');
  if(!bar)return;
  const gate=STUDIO_DEVICE_GATES.find((entry)=>entry.id===activeDeviceGateGuide);
  if(!gate){
    bar.classList.add('hidden');
    return;
  }
  $('#deviceGuideTitle').textContent=gate.label;
  $('#deviceGuideInstruction').textContent=gate.instruction;
  bar.classList.remove('hidden');
}
function returnToDeviceAcceptanceCenter(){
  activeDeviceGateGuide='';
  renderActiveDeviceGuide();
  showSettings();
  requestAnimationFrame(()=>{
    $('#deviceAcceptancePanel')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  });
}
function completeActiveDeviceGuide(passed){
  const id=activeDeviceGateGuide;
  if(!id)return;
  const gate=STUDIO_DEVICE_GATES.find((entry)=>entry.id===id);
  const report=ensureStudioDeviceAcceptance();
  const note=report.results?.[id]?.note||'';
  if(!setStudioDeviceGate(id,passed,note))return;
  activeDeviceGateGuide='';
  renderActiveDeviceGuide();
  notify(passed
    ?(state.uiLanguage==='en'?'Device gate confirmed: ':'Geräte-Gate bestätigt: ')+(gate?.label||id)
    :(state.uiLanguage==='en'?'Device gate marked as failed: ':'Geräte-Gate als nicht bestanden markiert: ')+(gate?.label||id));
  showSettings();
  requestAnimationFrame(()=>{
    const target=$('[data-device-gate-card="'+id+'"]')||$('#deviceAcceptancePanel');
    target?.scrollIntoView({block:'center',behavior:'smooth'});
  });
}
function launchDeviceAcceptanceGuide(id){
  const environment=currentDeviceAcceptanceEnvironment();
  const eligibility=studioDeviceGateEnvironmentStatus(id,environment);
  if(!eligibility.eligible){
    notify((state.uiLanguage==='en'?'Gate requirements: ':'Gate benötigt: ')+deviceEligibilityText(eligibility)+'.');
    return false;
  }
  activeDeviceGateGuide=id;
  renderActiveDeviceGuide();
  const closeSettings=()=>{if(dockTab==='settings')closeEditorDock()};
  if(id==='editor.ime'){
    closeSettings();navigate('studio');setMode('write');
    focusLine(activeLine);
    notify('IME-Test: jetzt mit deiner IME Text eingeben → Commit → einmal Undo → einmal Redo.');
    return true;
  }
  if(id==='perform.metronome'){
    closeSettings();navigate('studio');setMode('perform');
    requestAnimationFrame(()=>{
      $('#playBtn')?.focus({preventScroll:true});
      notify('Audio-Test: Metronom starten, BPM / Feel / Tempo ändern und hörbares Timing prüfen.');
    });
    return true;
  }
  if(id==='mobile.navigation'){
    closeSettings();navigate('studio');setMode('write');
    requestAnimationFrame(()=>notify('Mobile-Test: Bottom-Navigation Studio → Ergebnisse → Texte → Merkliste → Studio durchtesten.'));
    return true;
  }
  if(id==='mobile.swap'){
    closeSettings();navigate('studio');setMode('write');
    focusLine(activeLine);
    notify('Swap-Test: Wort markieren → Ergebnisse öffnen → Treffer einsetzen → exakte Auswahlposition prüfen.');
    return true;
  }
  if(id==='mobile.keyboard'){
    closeSettings();navigate('studio');setMode('write');
    const target=Math.max(0,song().lines.length-1);
    activeLine=target;renderEditor();
    // Keep focus inside the originating tap/click task. iOS may refuse to
    // open the software keyboard when focus is delayed to requestAnimationFrame.
    focusLine(target);
    notify('Keyboard-Test: Software-Tastatur offen lassen und prüfen, ob die letzte aktive Bar erreichbar bleibt.');
    return true;
  }
  if(id==='mobile.touch'){
    closeSettings();navigate('studio');setMode('write');
    requestAnimationFrame(()=>notify('Touch-Test: Topbar, Quicktools, Writer-Filter, Library und Perform ausschließlich per Touch bedienen.'));
    return true;
  }
  if(id==='mobile.no-hover'){
    closeSettings();navigate('studio');
    requestAnimationFrame(()=>{
      setThemeQuickOpen(true);
      $('#themeMenuBtn')?.focus({preventScroll:true});
      notify('No-Hover-Test: Quickstyles, Ergebnisaktionen, Library und Perform ohne Hover bedienen.');
    });
    return true;
  }
  return false;
}
function renderDeviceAcceptancePanel(){
  const panel=$('#deviceAcceptancePanel');
  if(!panel)return;
  const report=ensureStudioDeviceAcceptance();
  const summary=studioDeviceAcceptanceSummary(report);
  panel.innerHTML=
    '<div class="device-acceptance-summary '+(summary.ready?'is-ready':'')+'"><div><span class="eyebrow">REAL DEVICE GATES</span><b>'+summary.passed+'/'+summary.total+' bestätigt</b><small>'+(summary.ready?'Cutover Device-Gate vollständig':'Noch '+summary.pending.length+' reale Geräteprüfung'+(summary.pending.length===1?'':'en')+' offen')+'</small></div><div class="device-env">'+esc(report.environment.platform||'Unknown platform')+' · '+Math.round(report.environment.viewportWidth)+'×'+Math.round(report.environment.viewportHeight)+' · '+report.environment.maxTouchPoints+' touch</div></div>'+
    '<div class="device-gate-list">'+STUDIO_DEVICE_GATES.map((gate)=>{
      const row=report.results[gate.id]||{passed:false,note:''};
      const eligibility=studioDeviceGateEnvironmentStatus(gate.id,currentDeviceAcceptanceEnvironment());
      const evidence=row.passed&&row.environment
        ?'<em class="device-gate-evidence">'+esc(studioDeviceEnvironmentLabel(row.environment))+(row.testedAt?' · '+new Date(row.testedAt).toLocaleString():'')+'</em>'
        :'';
      const environmentHint='<em class="device-gate-environment '+(eligibility.eligible?'is-eligible':'is-ineligible')+'">'+esc(deviceEligibilityText(eligibility))+'</em>';
      const disabled=!eligibility.eligible?'disabled':'';
      return '<article class="device-gate '+(row.passed?'is-pass ':'')+(eligibility.eligible?'is-eligible':'is-ineligible')+'" data-device-gate-card="'+esc(gate.id)+'"><div class="device-gate-main"><label><input type="checkbox" data-device-gate="'+esc(gate.id)+'" '+(row.passed?'checked ':'')+disabled+'><span><b>'+esc(gate.label)+'</b><small>'+esc(gate.instruction)+'</small>'+environmentHint+evidence+'</span></label><button type="button" class="outline device-gate-guide" data-device-gate-guide="'+esc(gate.id)+'" '+(eligibility.eligible?'':'disabled')+'>Test starten</button></div><input type="text" data-device-gate-note="'+esc(gate.id)+'" value="'+esc(row.note||'')+'" placeholder="Notiz / Gerät / Browser …" maxlength="400"></article>';
    }).join('')+'</div>';
  queryAll('[data-device-gate]').forEach((input)=>input.onchange=()=>{
    const id=input.dataset.deviceGate;
    const note=queryAll('[data-device-gate-note]').find((row)=>row.dataset.deviceGateNote===id)?.value||'';
    setStudioDeviceGate(id,input.checked,note);
  });
  queryAll('[data-device-gate-note]').forEach((input)=>input.onchange=()=>{
    const id=input.dataset.deviceGateNote;
    const checked=queryAll('[data-device-gate]').find((row)=>row.dataset.deviceGate===id)?.checked||false;
    setStudioDeviceGate(id,checked,input.value);
  });
  queryAll('[data-device-gate-guide]').forEach((button)=>button.onclick=()=>{
    launchDeviceAcceptanceGuide(button.dataset.deviceGateGuide);
  });
  if($('#exportDeviceAcceptance')){
    $('#exportDeviceAcceptance').disabled=false;
    $('#exportDeviceAcceptance').title=summary.ready
      ?'Vollständigen Acceptance-Report exportieren'
      :'Teilreport exportieren · auf anderem Gerät importierbar';
  }
}
function collectCurrentStudioDiagnostics(){
  const environment=collectStudioEnvironmentDiagnostics({
    windowObj:window,
    documentObj:document,
    documentStoreStatus,
    documentStoreAuthority,
    writerStatus,
    writerCapabilities,
    writerRuntimeTiming,
    controlsBound:document.body.dataset.controls==='bound',
  });
  const dom=runStudioDomAcceptance({documentObj:document,windowObj:window});
  const parity=studioParitySummary();
  const device=studioDeviceAcceptanceSummary(ensureStudioDeviceAcceptance());
  const automatedFailures=[...environment.summary.failing,...dom.summary.failing];
  const sourceReady=parity.sourceReady===parity.sourceTotal;
  const automatedReady=automatedFailures.length===0;
  return {
    ...environment,
    domAcceptance:dom,
    parity,
    deviceAcceptance:device,
    releaseReadiness:{
      ready:sourceReady&&automatedReady&&device.ready,
      sourceReady,
      automatedReady,
      deviceReady:device.ready,
      pendingDevice:[...device.pending],
      automatedFailures,
    },
    combinedSummary:{
      passing:environment.summary.passing+dom.summary.passing+parity.sourceReady,
      total:environment.summary.total+dom.summary.total+parity.sourceTotal,
      failing:automatedFailures,
    },
  };
}
function diagnosticsCheckMarkup(check){
  return '<div class="diagnostic-check '+(check.ok?'is-ok':'is-fail')+'"><span aria-hidden="true">'+(check.ok?'✓':'!')+'</span><div><b>'+esc(check.label)+'</b><small>'+esc(check.detail)+'</small></div></div>';
}
function parityManifestMarkup(){
  const summary=studioParitySummary();
  const groups=studioParityGroups();
  return '<div class="parity-summary"><div><span class="eyebrow">PARITY CONTRACT</span><b>'+summary.sourceReady+'/'+summary.sourceTotal+' source-mapped</b><small>'+summary.total+' total capabilities · '+summary.deviceTotal+' require real device/browser execution</small></div><div class="parity-group-grid">'+groups.map((group)=>{
    const source=group.items.filter((item)=>item.acceptance!=='device');
    const device=group.items.filter((item)=>item.acceptance==='device');
    const ready=source.filter((item)=>item.status==='ready'||item.status==='adapted').length;
    return '<div class="parity-group"><b>'+esc(group.name)+'</b><span>'+ready+'/'+source.length+' source</span>'+(device.length?'<small>'+device.length+' device gate'+(device.length===1?'':'s')+'</small>':'')+'</div>';
  }).join('')+'</div></div>';
}

function renderDiagnosticsPanel(){
  const panel=$('#diagnosticsPanel');
  if(!panel)return;
  const report=collectCurrentStudioDiagnostics();
  const viewport=report.viewport;
  const readiness=report.releaseReadiness;
  const readinessDetail=readiness.ready
    ?'Source contract, current browser diagnostics and all seven real-device gates are complete.'
    :[
      readiness.sourceReady?'Source contract ready':'Source contract incomplete',
      readiness.automatedReady?'Current browser checks ready':readiness.automatedFailures.length+' browser/DOM check'+(readiness.automatedFailures.length===1?'':'s')+' pending',
      readiness.deviceReady?'7/7 device gates ready':(7-readiness.pendingDevice.length)+'/7 device gates ready',
    ].join(' · ');
  panel.innerHTML='<div class="cutover-readiness '+(readiness.ready?'is-ready':'')+'"><div><span class="eyebrow">CUTOVER READINESS</span><b>'+(readiness.ready?'SOURCE GATE READY':'DEVICE ACCEPTANCE OPEN')+'</b><small>'+esc(readinessDetail)+'</small></div><code>'+(readiness.ready?'npm run studio:v2:live':'npm run studio:v2:cutover:check')+'</code></div><div class="diagnostics-summary"><div><span class="eyebrow">CURRENT ENVIRONMENT</span><b>'+report.combinedSummary.passing+'/'+report.combinedSummary.total+' automated/source checks</b><small>'+Math.round(viewport.width)+'×'+Math.round(viewport.height)+' CSS px · DPR '+viewport.devicePixelRatio.toFixed(2)+' · '+(report.input.coarsePointer?'Touch/Coarse':'Mouse/Fine')+'</small></div><div class="diagnostics-runtime"><span>DocumentStore <b>'+esc(report.runtime.documentStoreStatus)+'</b></span><span>Writer <b>'+esc(report.runtime.writerStatus)+'</b></span><span>Runtime <b>'+(report.runtime.writerCurrentMs==null?'—':report.runtime.writerCurrentMs.toFixed(1)+' ms')+'</b></span><span>Ø100 <b>'+(report.runtime.writerAverageLast100Ms==null?'—':report.runtime.writerAverageLast100Ms.toFixed(1)+' ms')+'</b></span></div></div>'+parityManifestMarkup()+'<div class="diagnostics-section-title">ENVIRONMENT</div><div class="diagnostics-grid">'+report.checks.map(diagnosticsCheckMarkup).join('')+'</div><div class="diagnostics-section-title">DOM / INTERACTION GATES</div><div class="diagnostics-grid">'+report.domAcceptance.checks.map(diagnosticsCheckMarkup).join('')+'</div>';
  return report;
}
function exportStudioDiagnostics(){
  const report=collectCurrentStudioDiagnostics();
  downloadBlob(
    new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json;charset=utf-8'}),
    diagnosticsFilename(),
  );
  return report;
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
  body.innerHTML='<div class="theme-settings"><section class="theme-settings-card"><h3>Studio Appearance</h3><p>Quickstyles bleiben sofort erreichbar. Eigene Styles werden nur lokal in diesem Browser gespeichert.</p><div class="dock-settings" style="margin-top:13px"><label>Schriftgröße<input id="fontRange" type="range" min="16" max="28" value="'+state.fontSize+'"></label><label>Schrift<select id="editorFont"><option value="sans">Studio Sans</option><option value="serif">Editorial Serif</option><option value="mono">Monospace</option></select></label><label>Bewegung<select id="motionSelect"><option value="auto">System beachten</option><option value="off">Aus</option></select></label><label>UI-Sprache<select id="uiLanguageSelect"><option value="de">Deutsch</option><option value="en">English</option></select></label></div><div id="capabilitySummary" class="capability-summary">'+capabilityMarkup()+'</div><div class="theme-slot-list">'+themeSlotCard('light')+themeSlotCard('dark')+'</div><div class="theme-saved-list">'+savedThemeRows()+'</div></section><section class="theme-settings-card"><div class="theme-builder-head"><div><h3>Custom Theme Studio</h3><p>Semantische Farben statt einzelner CSS-Werte. Änderungen werden live auf das Studio vorgespielt.</p></div><button class="outline" data-theme-new>Neu</button></div><div id="themePalettePreview" class="theme-palette-preview">'+preview+'</div><div class="theme-builder-grid">'+fields+'</div><div class="theme-builder-meta"><input id="themeName" value="'+esc(draft.name||'Mein Studio')+'" maxlength="40" aria-label="Theme Name"><select id="themeMode" aria-label="Theme Basis"><option value="light">Light Basis</option><option value="dark">Dark Basis</option></select></div><div class="theme-replace-row"><label><input id="replaceLight" type="checkbox" '+(lightChecked?'checked':'')+'> Light-Style ersetzen</label><label><input id="replaceDark" type="checkbox" '+(darkChecked?'checked':'')+'> Dark-Style ersetzen</label></div><div class="theme-contrast"><span id="themeTextContrast"></span><span id="themeAccentContrast"></span></div><div class="theme-builder-actions"><button class="outline" id="themeRevert">Vorschau zurücksetzen</button><button class="primary" id="themeSave">'+(themeEditingId?'Style aktualisieren':'Style speichern')+'</button></div></section><section class="theme-settings-card recovery-card"><div class="recovery-head"><div><h3>Data & Recovery</h3><p>Dokumente laufen primär über IndexedDB. Recovery-Punkte sichern den kompletten versionierten Studio-Snapshot vor größeren Änderungen. Portable Backups enthalten Dokumente, UI-Präferenzen und den gemeinsamen SearchState.</p></div><div class="recovery-head-actions"><button id="exportStudioBackup" class="outline">Backup exportieren</button><button id="importStudioBackup" class="outline">Backup importieren</button><button id="createRecoveryPoint" class="outline">Recovery-Punkt erstellen</button><input id="studioBackupFile" type="file" accept="application/json,.json" hidden></div></div><div id="recoveryPanel"></div></section><section class="theme-settings-card diagnostics-card"><div class="diagnostics-head"><div><h3>Browser & Runtime Diagnostics</h3><p>Acceptance Center für Parity-Manifest, Storage, Writer, Audio, VisualViewport, Touch/Pointer und Motion. Keine Daten werden hochgeladen.</p></div><div class="row"><button id="rerunDiagnostics" class="outline">Neu prüfen</button><button id="exportDiagnostics" class="outline">Diagnostics exportieren</button></div></div><div id="diagnosticsPanel"></div></section><section class="theme-settings-card device-acceptance-card"><div class="diagnostics-head"><div><h3>Real Device Acceptance</h3><p>Die sieben Gates müssen bewusst auf echter Hardware bestätigt werden. Reports von mehreren Geräten lassen sich zusammenführen; Studio markiert nie automatisch bestanden.</p></div><div class="row"><button id="resetDeviceAcceptance" class="outline">Zurücksetzen</button><button id="importDeviceAcceptance" class="outline">Acceptance importieren</button><button id="exportDeviceAcceptance" class="outline">Acceptance JSON exportieren</button><input id="deviceAcceptanceFile" type="file" accept="application/json,.json" hidden></div></div><div id="deviceAcceptancePanel"></div></section></div>';
  $('#fontRange').oninput=function(event){setFontSize(+event.target.value)};
  $('#editorFont').value=state.editorFont||'sans';
  $('#editorFont').onchange=function(event){state.editorFont=event.target.value;applyEditorFont();persist()};
  $('#motionSelect').value=state.motion;
  $('#motionSelect').onchange=function(event){state.motion=event.target.value;document.documentElement.dataset.motion=state.motion;persist()};
  $('#uiLanguageSelect').value=state.uiLanguage;
  $('#uiLanguageSelect').onchange=function(event){setStudioUiLanguage(event.target.value,{notifyUser:true})};
  $('#createRecoveryPoint').onclick=async function(){
    const button=this;button.disabled=true;
    try{
      await createRecoveryPoint();
      await renderRecoveryPanel();
      notify('Recovery-Punkt erstellt.');
    }catch(error){
      notify('Recovery nicht möglich: '+(error instanceof Error?error.message:String(error)));
    }finally{button.disabled=false}
  };
  $('#exportStudioBackup').onclick=async function(){
    const button=this;button.disabled=true;
    try{await exportPortableStudioBackup();notify('Portables Studio Backup exportiert.')}
    catch(error){notify('Backup-Export fehlgeschlagen: '+(error instanceof Error?error.message:String(error)))}
    finally{button.disabled=false}
  };
  $('#importStudioBackup').onclick=()=>$('#studioBackupFile').click();
  $('#studioBackupFile').onchange=async function(){
    const file=this.files?.[0];this.value='';
    if(!file)return;
    try{confirmPortableStudioImport(await readPortableStudioBackupFile(file),file.name)}
    catch(error){notify('Backup-Datei ungültig: '+(error instanceof Error?error.message:String(error)))}
  };
  void renderRecoveryPanel();
  $('#rerunDiagnostics').onclick=()=>{renderDiagnosticsPanel();notify('Browser-Diagnostics aktualisiert.')};
  $('#exportDiagnostics').onclick=()=>{exportStudioDiagnostics();notify('Diagnostics als JSON exportiert.')};
  $('#resetDeviceAcceptance').onclick=()=>{resetStudioDeviceAcceptance();notify('Device-Acceptance zurückgesetzt.')};
  $('#importDeviceAcceptance').onclick=()=>$('#deviceAcceptanceFile').click();
  $('#deviceAcceptanceFile').onchange=async function(){
    const file=this.files?.[0];this.value='';
    if(!file)return;
    try{
      const summary=await importStudioDeviceAcceptanceFile(file);
      notify('Device-Acceptance zusammengeführt · '+summary.passed+'/'+summary.total+' bestätigt.');
    }catch(error){
      notify('Acceptance-Import fehlgeschlagen: '+(error instanceof Error?error.message:String(error)));
    }
  };
  $('#exportDeviceAcceptance').onclick=()=>{exportStudioDeviceAcceptance();notify('Device-Acceptance als JSON exportiert.')};
  renderDiagnosticsPanel();
  renderDeviceAcceptancePanel();
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

function renderBarInspectorDock(body){
  const s=song(),bar=barIdentity(s,activeLine);
  if(!bar){body.innerHTML='<p class="small">Keine aktive Bar.</p>';return}
  const text=s.lines[activeLine]||'';
  const words=(text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]).length;
  const syllables=syll(text);
  const pocket=performancePocketMetrics(s,bar.id);
  const durationMs=performanceBarDurationMs(s);
  const syllablesPerSecond=performanceSyllablesPerSecond(s,syllables);
  const fingerprint=performanceFlowFingerprint(s,bar.id);
  const previous=performancePreviousBarPlacements(s,bar.id);
  const canonicalReady=analysisStatus==='ready'&&analysisData&&analysisSignature===analysisKey();
  const detail=canonicalReady?analysisData.wordDetails?.[activeLine]:null;
  const relation=canonicalReady?analysisData.lineRelations?.[activeLine]:null;
  const endWord=studioAnalysisWords([text])[0]||'—';
  const stress=detail?.stressPattern||(
    detail?.primaryStressSyllable!=null?'Primary · Silbe '+detail.primaryStressSyllable:'—'
  );
  const canonicalState=canonicalReady
    ?'<span class="bar-source canonical">WRITER CANONICAL</span>'
    :analysisStatus==='loading'
      ?'<span class="bar-source">WRITER LÄDT …</span>'
      :'<button id="loadBarAnalysis" class="outline">Kanonische Analyse laden</button>';
  body.innerHTML=`
    <div class="bar-inspector">
      <div class="bar-inspector-head">
        <div><span class="eyebrow">BAR ${String(activeLine+1).padStart(2,'0')}</span><h3>${esc(endWord)}</h3><p>${esc(text||'Leere Bar')}</p></div>
        <div class="row"><button data-bar-nav="-1" aria-label="Vorherige Bar" ${activeLine<=0?'disabled':''}>←</button><button data-bar-nav="1" aria-label="Nächste Bar" ${activeLine>=s.lines.length-1?'disabled':''}>→</button>${canonicalState}</div>
      </div>
      <div class="bar-inspector-grid">
        <div><small>WÖRTER</small><b>${words}</b><span>tokenisiert lokal</span></div>
        <div><small>SILBEN ≈</small><b>${syllables||0}</b><span>UI-Schätzung</span></div>
        <div><small>BAR TIME</small><b>${(durationMs/1000).toFixed(2)} s</b><span>${performanceConfig(s).bpm} BPM</span></div>
        <div><small>SYLL./SEC ≈</small><b>${syllablesPerSecond.toFixed(2)}</b><span>aus Bar Time</span></div>
        <div><small>CUES</small><b>${pocket.cues}</b><span>${pocket.hits} Hit · ${pocket.accents} Akzent · ${pocket.holds} Hold</span></div>
        <div><small>BREATH LOAD</small><b>${pocket.breathLoad}</b><span>${pocket.breaths} Atem · ${pocket.pauseUnits} Pause</span></div>
        <div><small>POCKET</small><b>${Math.round(pocket.offBeatShare*100)}% off</b><span>${pocket.onBeat} on · ${pocket.offBeat} off</span></div>
        <div><small>PREVIOUS</small><b>${previous.previousBarId?previous.sharedCount+' shared':'—'}</b><span>${previous.previousBarId?previous.currentSteps.length+' / '+previous.previousSteps.length+' placements':'erste Bar'}</span></div>
      </div>
      <div class="bar-inspector-canonical">
        <div><small>ENDWORT</small><b>${esc(endWord)}</b></div>
        <div><small>IPA</small><code>${detail?.ipa?'/'+esc(detail.ipa)+'/':'—'}</code></div>
        <div><small>STRESS</small><b>${esc(stress)}</b></div>
        <div><small>REIM IM VERSE</small><b>${esc(relation?analysisRelationLabel(relation):'—')}</b></div>
      </div>
      <div class="bar-flow-row"><small>FLOW FINGERPRINT</small><code>${esc(fingerprint||'·')}</code><button id="openPerformFromBar" class="outline">Perform öffnen ↗</button></div>
    </div>`;
  queryAll('[data-bar-nav]').forEach((button)=>button.onclick=()=>{
    const next=Math.max(0,Math.min(s.lines.length-1,activeLine+Number(button.dataset.barNav||0)));
    activeLine=next;activateLine(next);
    if(mode==='write')focusLine(next);
  });
  if($('#loadBarAnalysis'))$('#loadBarAnalysis').onclick=async()=>{
    const button=$('#loadBarAnalysis');button.disabled=true;button.textContent='Writer analysiert …';
    analysisSignature='';
    await refreshSongAnalysis(true);
    if(dockTab==='bar')renderDock();
  };
  if($('#openPerformFromBar'))$('#openPerformFromBar').onclick=()=>{
    closeEditorDock();setMode('perform');
  };
}

function addStudioBarAfter(index=activeLine){
  const current=song(),target=Math.max(-1,Math.min(current.lines.length-1,Number(index)));
  pushUndo();
  const inserted=insertEditorBar(current,target+1,'');
  if(!inserted)return false;
  activeLine=inserted.index;
  selection={line:inserted.index,barId:inserted.id,barRevision:inserted.revision,start:0,end:0};
  selectionProof=createSelectionProof(current,{index:inserted.index,start:0,end:0});
  analysisSignature='';
  renderEditor();changed();
  if(dockTab==='navigator')renderDock();
  focusLine(inserted.index,0);
  return true;
}
function duplicateStudioBar(index=activeLine){
  const current=song(),source=barIdentity(current,index);
  if(!source)return false;
  pushUndo();
  const inserted=duplicateEditorBar(current,index);
  if(!inserted)return false;
  activeLine=inserted.index;
  selection={line:inserted.index,barId:inserted.id,barRevision:inserted.revision,start:inserted.text.length,end:inserted.text.length};
  selectionProof=createSelectionProof(current,{index:inserted.index,start:inserted.text.length,end:inserted.text.length});
  analysisSignature='';
  renderEditor();changed();
  if(dockTab==='navigator')renderDock();
  focusLine(inserted.index,inserted.text.length);
  notify('Bar dupliziert · neue stabile Bar-ID.');
  return true;
}
function deleteStudioBar(index=activeLine){
  const current=song();
  if(current.lines.length<=1){notify('Der Text muss mindestens eine Bar behalten.');return false}
  const removed=barIdentity(current,index);
  if(!removed)return false;
  const activeBarId=current.barIds[activeLine]||'';
  const selectedBarId=selection.barId||current.barIds[selection.line]||'';
  pushUndo();
  const result=removeEditorBar(current,index);
  if(!result)return false;
  let nextIndex=current.barIds.indexOf(activeBarId);
  if(nextIndex<0)nextIndex=Math.max(0,Math.min(index,current.lines.length-1));
  activeLine=nextIndex;
  let selectedIndex=current.barIds.indexOf(selectedBarId);
  if(selectedIndex<0)selectedIndex=activeLine;
  const text=current.lines[selectedIndex]||'';
  selection={
    line:selectedIndex,
    barId:current.barIds[selectedIndex],
    barRevision:current.barRevisions[selectedIndex],
    start:Math.min(selection.start||0,text.length),
    end:Math.min(selection.end??selection.start??0,text.length),
  };
  selectionProof=createSelectionProof(current,{index:selectedIndex,start:selection.start,end:selection.end});
  analysisSignature='';
  renderEditor();changed();
  if(dockTab==='navigator')renderDock();
  focusLine(activeLine,Math.min(text.length,selection.start||0));
  notify('Bar gelöscht · zugehörige Performance-Cues entfernt.');
  return true;
}

function moveStudioBar(fromIndex,toIndex){
  const current=song();
  const activeBarId=current.barIds[activeLine]||'';
  const selectedBarId=selection.barId||current.barIds[selection.line]||'';
  const selectedStart=selection.start||0,selectedEnd=selection.end??selectedStart;
  pushUndo();
  const moved=moveEditorBar(current,fromIndex,toIndex);
  if(!moved?.moved)return false;
  activeLine=Math.max(0,current.barIds.indexOf(activeBarId));
  const selectedIndex=current.barIds.indexOf(selectedBarId);
  if(selectedIndex>=0){
    selection={...selection,line:selectedIndex,barId:selectedBarId,start:selectedStart,end:selectedEnd};
  }else{
    selection={line:activeLine,barId:current.barIds[activeLine],barRevision:current.barRevisions[activeLine],start:0,end:0};
  }
  selectionProof=createSelectionProof(current,{
    index:selection.line,
    start:selection.start,
    end:selection.end,
  });
  analysisSignature='';
  renderEditor();
  changed();
  if(dockTab==='navigator')renderDock();
  return true;
}
function jumpToStudioBar(barId,{focus=true}={}){
  const current=song(),index=current.barIds.indexOf(String(barId));
  if(index<0)return false;
  activeLine=index;
  const text=current.lines[index]||'';
  selection={line:index,barId:current.barIds[index],barRevision:current.barRevisions[index],start:text.length,end:text.length};
  selectionProof=createSelectionProof(current,{index,start:text.length,end:text.length});
  activateLine(index);
  if(focus&&mode==='write')focusLine(index,text.length);
  return true;
}
function renderBarNavigatorDock(body){
  const current=song();
  const needle=barNavigatorQuery.trim().toLocaleLowerCase(state.uiLanguage==='en'?'en-US':'de-DE');
  const rows=current.lines.map((line,index)=>({
    index,
    line,
    bar:barIdentity(current,index),
  })).filter((row)=>!needle||String(row.line).toLocaleLowerCase(state.uiLanguage==='en'?'en-US':'de-DE').includes(needle));
  body.innerHTML=`
    <div class="bar-navigator">
      <div class="bar-navigator-head">
        <div><span class="eyebrow">BAR NAVIGATOR</span><b>${current.lines.length} Bars</b><small>Stable Bar IDs · Drag, Pfeile oder Klick</small></div>
        <div class="bar-navigator-head-actions"><label class="bar-navigator-search"><span class="screenreader">Bars durchsuchen</span><input id="barNavigatorSearch" type="search" value="${esc(barNavigatorQuery)}" placeholder="Bar-Text durchsuchen …" autocomplete="off"></label><div class="row"><button id="navigatorAddBar" class="outline">＋ Bar</button><button id="navigatorDuplicateBar" class="outline">⧉ Duplizieren</button></div></div>
      </div>
      <div class="bar-navigator-list">
        ${rows.map((row)=>{
          const metrics=performanceBarMetrics(current,row.bar.id);
          const review=performanceNeedsReview(current,row.bar.id);
          const active=row.index===activeLine;
          const preview=String(row.line||'').trim()||'Leere Bar';
          return `<article class="bar-navigator-row ${active?'is-active':''}" draggable="true" data-bar-navigator-id="${esc(row.bar.id)}">
            <button class="bar-navigator-jump" data-bar-jump="${esc(row.bar.id)}" aria-label="Bar ${row.index+1} auswählen">
              <span class="bar-navigator-number">${String(row.index+1).padStart(2,'0')}</span>
              <span class="bar-navigator-copy">${esc(preview)}</span>
              <span class="bar-navigator-meta">${syll(row.line)||0} Silb. · ${metrics.cues} Cues${review?' · Timing prüfen':''}</span>
            </button>
            <div class="bar-navigator-actions">
              <button data-bar-duplicate="${esc(row.bar.id)}" aria-label="Bar ${row.index+1} duplizieren" title="Duplizieren">⧉</button>
              <button data-bar-reorder="${esc(row.bar.id)}" data-bar-direction="-1" aria-label="Bar ${row.index+1} nach oben" ${row.index===0?'disabled':''}>↑</button>
              <button data-bar-reorder="${esc(row.bar.id)}" data-bar-direction="1" aria-label="Bar ${row.index+1} nach unten" ${row.index===current.lines.length-1?'disabled':''}>↓</button>
              <button data-bar-delete="${esc(row.bar.id)}" aria-label="Bar ${row.index+1} löschen" title="Bar löschen" ${current.lines.length<=1?'disabled':''}>×</button>
              <span class="bar-drag-handle" aria-hidden="true">⋮⋮</span>
            </div>
          </article>`;
        }).join('')||'<div class="bar-navigator-empty">Keine Bars für diesen Filter.</div>'}
      </div>
    </div>`;
  $('#navigatorAddBar').onclick=()=>addStudioBarAfter(activeLine);
  $('#navigatorDuplicateBar').onclick=()=>duplicateStudioBar(activeLine);
  const search=$('#barNavigatorSearch');
  search.oninput=(event)=>{
    barNavigatorQuery=event.target.value;
    renderBarNavigatorDock(body);
    const next=$('#barNavigatorSearch');
    next?.focus();
    next?.setSelectionRange(next.value.length,next.value.length);
  };
  queryAll('[data-bar-jump]').forEach((button)=>button.onclick=()=>jumpToStudioBar(button.dataset.barJump));
  queryAll('[data-bar-duplicate]').forEach((button)=>button.onclick=()=>{
    const index=current.barIds.indexOf(button.dataset.barDuplicate);
    if(index>=0)duplicateStudioBar(index);
  });
  queryAll('[data-bar-delete]').forEach((button)=>button.onclick=()=>{
    const index=current.barIds.indexOf(button.dataset.barDelete);
    if(index>=0)deleteStudioBar(index);
  });
  queryAll('[data-bar-reorder]').forEach((button)=>button.onclick=()=>{
    const id=button.dataset.barReorder;
    const from=current.barIds.indexOf(id);
    const to=from+Number(button.dataset.barDirection||0);
    if(to>=0&&to<current.lines.length)moveStudioBar(from,to);
  });
  queryAll('[data-bar-navigator-id]').forEach((row)=>{
    row.addEventListener('dragstart',(event)=>{
      event.dataTransfer?.setData('application/x-rhymelab-bar',row.dataset.barNavigatorId);
      event.dataTransfer?.setData('text/plain',row.dataset.barNavigatorId);
      if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend',()=>{
      row.classList.remove('is-dragging');
      queryAll('[data-bar-navigator-id]').forEach((item)=>item.classList.remove('is-drop-target'));
    });
    row.addEventListener('dragover',(event)=>{
      if(!event.dataTransfer?.types?.includes('application/x-rhymelab-bar'))return;
      event.preventDefault();
      if(event.dataTransfer)event.dataTransfer.dropEffect='move';
      row.classList.add('is-drop-target');
    });
    row.addEventListener('dragleave',(event)=>{
      if(!row.contains(event.relatedTarget))row.classList.remove('is-drop-target');
    });
    row.addEventListener('drop',(event)=>{
      event.preventDefault();row.classList.remove('is-drop-target');
      const sourceId=event.dataTransfer?.getData('application/x-rhymelab-bar')||event.dataTransfer?.getData('text/plain');
      const targetId=row.dataset.barNavigatorId;
      const from=current.barIds.indexOf(sourceId),to=current.barIds.indexOf(targetId);
      if(from>=0&&to>=0&&from!==to)moveStudioBar(from,to);
    });
  });
}

function showFilters(){const hidden=$('#directFilters').classList.toggle('hidden');$('#filterBtn').setAttribute('aria-expanded',!hidden);$('#filterLabel').textContent=hidden?'Filter öffnen':'Filter sichtbar';if(!hidden)animateSurface($('#directFilters'))}
function showSettings(){openEditorDock('settings')}
function showHistory(){revision();openEditorDock('history')}
function openEditorDock(tab){if(page!=='studio')navigate('studio');document.body.classList.remove('mobile-results');document.body.classList.add('editor-dock-open');setMobileActive('studio');dockTab=tab;$('#editorDock').dataset.tab=tab;$('#editorDock').classList.remove('hidden');renderDock();animateSurface($('#editorDock'))}
function closeEditorDock(){if(themePreviewing){themePreviewing=false;applyThemeChoice(state.theme,{persistState:false})}document.body.classList.remove('editor-dock-open');$('#editorDock').classList.add('hidden');delete $('#editorDock').dataset.tab;dockTab='';}
function renderDock(){queryAll('#dockTabs [data-dock]').forEach(b=>{b.classList.toggle('active',b.dataset.dock===dockTab);b.setAttribute('aria-pressed',b.dataset.dock===dockTab)});const body=$('#editorDockBody');if(dockTab==='navigator'){renderBarNavigatorDock(body)}else if(dockTab==='bar'){renderBarInspectorDock(body)}else if(dockTab==='saved'){body.innerHTML=`<div class="saved-chips">${state.saved.map(r=>`<div class="saved-chip"><button data-insert="${esc(r.word)}" title="Am markierten Wort einsetzen">${esc(r.word)} ＋</button><button data-save="${esc(r.word)}" aria-label="${esc(r.word)} entmerken">×</button></div>`).join('')||'<p class="small">Gute Wörter sammeln: Lesezeichen am Treffer anklicken oder Leertaste in der Liste.</p>'}</div>`}else if(dockTab==='history'){body.innerHTML=(song().revisions||[]).slice().reverse().map((r,i)=>`<div class="revision"><div class="grow"><b>${new Date(r.at).toLocaleTimeString('de-DE')}</b><p>${esc(r.text.slice(0,76))}…</p></div><button class="outline" data-restore-version="${song().revisions.length-1-i}">Wiederherstellen</button></div>`).join('')||'<p class="small">Neue Fassungen entstehen automatisch beim Schreiben.</p>'}else if(dockTab==='settings'){renderSettingsDock(body)}else{body.innerHTML=`<div class="studio-note"><b>Studio 02 · Desktop Workbench</b><p>Schreiben und Recherchieren bleiben gleichzeitig sichtbar. Filter wirken sofort; Details sind angedockt. Kompakt zeigt dieselben Treffer dichter, Wortfeld lädt zum Stöbern ein.</p><p style="margin-top:9px"><b>Direkte Bedienung</b> · Trennlinie ziehen oder per Pfeiltaste verstellen · Anker fixieren · Wortdetails anklicken · Merkliste, Versionen und Darstellung hier unten öffnen.</p><p style="margin-top:9px"><kbd>Alt + R</kbd> Suche · <kbd>Alt + E</kbd> Editor · <kbd>Alt + B</kbd> Bars · <kbd>Alt + 3</kbd> Perform · <kbd>Alt + F</kbd> Fokus · <kbd>Alt + L</kbd> Dichte wechseln · In Treffern: <kbd>↑ ↓</kbd> auswählen, <kbd>Enter</kbd> einsetzen, <kbd>Space</kbd> merken.</p><p style="margin-top:9px"><b>Motion</b> · kurze gestaffelte Trefferwechsel, weiche Panel-Einblendung, Auswahl- und Einsetzfeedback. Systemseitig reduzierte Bewegung wird respektiert. Kein externer Dienst, keine Motion-Bibliothek erforderlich.</p><p style="margin-top:9px"><b>Runtime</b> · Reimtreffer kommen live aus /api/writer; Song-Reimschema und Reimrelationen laufen kanonisch über Writer; nur UI-Silbenzählung und Perform Auto-Map bleiben explizite Approximationen. Die vollständige Funktionsmatrix aus Konzept 1.0 bleibt verbindlich. Version 2 ersetzt dessen Popup-orientierte Desktop-Bedienung.</p><p style="margin-top:9px"><b>Prüfung</b> · Source-/Modell-Gates decken die migrierten Zustände ab. Reale Browser-, Touch- und Audio-Geräteabnahme bleibt vor dem Route-Cutover erforderlich.</p></div>`}}
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
    const payload=await detailClient.load(row,{
      runtimeDb:internalDbLabEnabled?internalDbLabActive:'',
    });
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
function bindV2(){for(const id of ['directBasis','directLang','directRelation','directSyllables','directSort','advancedFiltersToggle','advancedFilters','advancedPreset','advancedRhymeType','advancedVariants','advancedEntityCategory','advancedEntityCategoryMulti','advancedHideUsed','advancedHistorical','advancedGenerated','advancedGeneratedOnly','detailDock','editorDock','splitter','pinAnchor','followBtn','resetInline'])if(!$('#'+id))throw Error('Studio 02 Control fehlt: '+id);document.documentElement.dataset.motion=state.motion;pageSize=density==='compact'?24:12;applyEditorFont();bindThemeQuickMenu();bindMobileViewport();$('#fontDown').onclick=()=>setFontSize(state.fontSize-1);$('#fontUp').onclick=()=>setFontSize(state.fontSize+1);$('#followBtn').onclick=toggleFollow;$('#pinAnchor').onclick=toggleFollow;$('#closeDetail').onclick=closeDetail;$('#closeEditorDock').onclick=closeEditorDock;$('#resetInline').onclick=resetInline;$('#infoBtn').onclick=()=>openEditorDock('notes');$('#directBasis').onchange=e=>{basis=e.target.value;void refreshWriterResults()};
$('#directLang').onchange=e=>{resultLang=e.target.value;void refreshWriterResults()};
$('#directRelation').onchange=e=>{relation=e.target.value;renderResults()};
$('#directSyllables').onchange=e=>{syllableMode=e.target.value;saveStudioSearchState();renderResults()};
$('#directSort').onchange=e=>{sort=e.target.value;saveStudioSearchState();renderResults()};
$('#advancedFiltersToggle').onclick=()=>{advancedExpanded=!advancedExpanded;syncAdvancedControls();if(advancedExpanded)animateSurface($('#advancedFilters'))};
$('#advancedPreset').onchange=e=>applySearchPreset(e.target.value);
$('#advancedHideUsed').onchange=e=>{hideUsed=e.target.checked;state.hideUsed=hideUsed;persist();renderResults()};
$('#advancedRhymeType').onchange=e=>{rhymeType=e.target.value;void refreshWriterResults()};
$('#advancedVariants').onchange=e=>{variantMode=e.target.value;void refreshWriterResults()};
$('#advancedEntityCategory').onchange=e=>{const value=e.target.value;setEntityCategories(value==='all'?[]:[value])};
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
  if(f==='entityCategory'){entityCategory='all';entityCategories=[]}
  if(f.startsWith('entityCategory:')){
    const category=f.slice('entityCategory:'.length);
    entityCategories=entityCategories.filter((value)=>value!==category);
    entityCategory=entityCategories[0]||'all';
  }
  if(f==='historical')includeHistorical=false;
  if(f==='generated'){generated=false;generatedOnly=false}
  if(f==='generatedOnly')generatedOnly=false;
  if(['scope','rhymeType','lang','basis','variants','entityCategory','historical','generated','generatedOnly'].includes(f)||f.startsWith('entityCategory:'))void refreshWriterResults();else renderResults();
}if(b.dataset.restoreVersion){if(restoreStudioRevision(song().revisions[+b.dataset.restoreVersion])){renderDock();notify('Fassung wiederhergestellt · aktuelle Fassung gesichert')}}});
document.addEventListener('keydown',e=>{if($('#dialog').open)return;if(e.altKey&&e.key.toLowerCase()==='r'){e.preventDefault();if(page==='library'||page==='saved')navigate('studio');if(window.innerWidth<=800){document.body.classList.add('mobile-results');setMobileActive('results')}$('#searchInput').focus();$('#searchInput').select()}if(e.altKey&&e.key.toLowerCase()==='e'){e.preventDefault();navigate('studio');setMode('write');focusLine(activeLine)}if(e.altKey&&e.key.toLowerCase()==='b'){e.preventDefault();openEditorDock('navigator')}if(e.altKey&&e.key==='3'){e.preventDefault();navigate('studio');setMode('perform')}if(e.altKey&&e.key.toLowerCase()==='l'){e.preventDefault();setDensity(nextDensity(density))}if(e.key==='Escape'){if(!$('#detailDock').classList.contains('hidden'))closeDetail();else if(dockTab)closeEditorDock();else if(document.body.classList.contains('focus'))toggleFocus()}});
const handle=$('#splitter');let drag=null;handle.addEventListener('pointerdown',e=>{if(window.innerWidth<=800)return;drag={x:e.clientX,width:+handle.getAttribute('aria-valuenow')};handle.setPointerCapture?.(e.pointerId);document.body.classList.add('resizing');e.preventDefault()});handle.addEventListener('pointermove',e=>{if(drag)setAssistWidth(drag.width+drag.x-e.clientX)});for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,()=>{if(!drag)return;drag=null;document.body.classList.remove('resizing');persist()});handle.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setAssistWidth(+handle.getAttribute('aria-valuenow')+(e.key==='ArrowLeft'?20:-20));persist()}if(e.key==='Home'){e.preventDefault();setAssistWidth(470);persist()}});if(window.innerWidth>800)setAssistWidth(state.assistWidth||470);if(window.innerWidth<=800){$('#directFilters').classList.add('hidden');$('#filterBtn').setAttribute('aria-expanded','false')}window.addEventListener('resize',()=>{if(window.innerWidth>800)setAssistWidth(state.assistWidth||470)});document.body.dataset.studioVersion='2';}

async function startStudio(){
  uiLocalizer=createStudioDomLocalizer({
    root:document.body,
    documentElement:document.documentElement,
    initialLanguage:state.uiLanguage,
  });
  bind();
  bindV2();
  setStudioUiLanguage(state.uiLanguage,{persistState:false});
  await initializeDocumentStore();
  await initializeInternalDbLab();
  const capabilitiesReady=refreshStudioCapabilities();
  applyThemeChoice(state.theme,{persistState:false});
  document.documentElement.style.setProperty('--editor',state.fontSize+'px');
  activeLine=Math.min(activeLine,Math.max(0,song().lines.length-1));
  const initialText=song().lines[activeLine]||'';
  const lastWord=initialText.match(/[\p{L}\p{N}'’-]+$/u);
  selection={line:activeLine,start:lastWord?initialText.length-lastWord[0].length:initialText.length,end:initialText.length};
  if(sharedSearchState.anchor){
    query=sharedSearchState.anchor;
    followSelection=!lastWord||lastWord[0]===sharedSearchState.anchor;
  }else if(lastWord)query=lastWord[0];
  syncFollowControls();
  renderEditor();
  renderResults();
  capabilitiesReady.finally(()=>{void refreshWriterResults()});
  revision('startup');
  persist();
}
function renderStartupFailure(error){
  document.body.dataset.controls='failed';
  const existing=document.querySelector('.startup-failure');
  if(existing)existing.remove();
  const banner=document.createElement('section');
  banner.className='startup-failure';
  banner.setAttribute('role','alert');
  const message=error instanceof Error?error.message:String(error);
  const stack=error instanceof Error&&error.stack?error.stack:message;
  banner.innerHTML=`
    <div class="startup-failure-copy">
      <span class="eyebrow">STUDIO STARTUP RECOVERY</span>
      <b>Das Studio konnte nicht vollständig starten.</b>
      <p>${esc(message)}</p>
      <details><summary>Technische Details</summary><pre>${esc(stack)}</pre></details>
    </div>
    <div class="startup-failure-actions">
      <button type="button" data-startup-action="reload" class="primary">Neu laden</button>
      <button type="button" data-startup-action="reset-ui" class="outline">Nur UI-Einstellungen zurücksetzen</button>
      <a href="/legacy" class="outline">Legacy Search öffnen</a>
    </div>`;
  document.body.prepend(banner);
  banner.querySelector('[data-startup-action="reload"]').onclick=()=>window.location.reload();
  banner.querySelector('[data-startup-action="reset-ui"]').onclick=()=>{
    try{localStorage.removeItem(STUDIO_PREFERENCES_KEY)}catch{}
    window.location.reload();
  };
}
void startStudio().catch((error)=>{
  renderStartupFailure(error);
  console.error(error);
});

