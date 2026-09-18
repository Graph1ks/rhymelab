const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEY = 'rhymelab.rhymepad.v1';
const RHYME_TYPES = ['multisyllabic_perfect','perfect','multisyllabic_slant','family','slant','assonance','consonance'];
const TYPE_LABELS = {
  multisyllabic_perfect:'Multisyllabic perfect',perfect:'Perfect rhyme',multisyllabic_slant:'Multisyllabic slant',
  family:'Rhyme family',slant:'Slant rhyme',assonance:'Assonance',consonance:'Consonance',weak:'No primary rhyme',
};
const ENTITY_CATEGORY_LABELS = {
  'person.rapper':'Rapper','person.musician':'Musician','person.actor':'Actor','person.director':'Director',
  'group.music_group':'Band / group','work.song':'Song','work.album':'Album','work.film':'Film',
  'work.video_game':'Game','fictional.character':'Character','organization.car_brand':'Car brand',
  'organization.fashion_house':'Fashion house','organization.company':'Company',
};

let uidCounter=0;
function uid(){uidCounter+=1;return `song-${Date.now().toString(36)}-${uidCounter.toString(36)}`;}
function freshSong(){return {id:uid(),title:'Untitled',folder:'Unfiled',text:'',trash:false,updatedAt:Date.now(),history:[{at:Date.now(),text:''}],performance:{bpm:92,cues:{},offsets:{}}};}
function loadStore(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(parsed&&Array.isArray(parsed.songs)&&parsed.songs.length)return parsed;
  }catch{}
  const song=freshSong();
  return {songs:[song],activeSongId:song.id,mode:'write',basis:'de',fontSize:18,libraryView:'active',libraryOpen:true};
}
const store=loadStore();
const state={searchAbort:null,searchTimer:null,saveTimer:null,activeCue:'move',selectedPerformKey:null,lastAutoQuery:'',capabilities:null};

function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(store));}
function activeSong(){return store.songs.find((song)=>song.id===store.activeSongId)||store.songs[0];}
function esc(value){return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function number(value){return Number(value||0).toLocaleString('en-US');}
function lines(text){return String(text??'').split('\n');}
function words(text){return String(text??'').trim().match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[];}
function saveStateLabel(value){$('#saveState').textContent=value;}
function ensurePerformance(song){song.performance ||= {bpm:92,cues:{},offsets:{}};song.performance.cues ||= {};song.performance.offsets ||= {};return song.performance;}

function renderShell(){
  const song=activeSong();
  if(!song)return;
  $('#songTitle').value=song.title||'Untitled';
  $('#songFolder').value=song.folder||'Unfiled';
  $('#lyricsEditor').value=song.text||'';
  $('#fontSize').value=String(store.fontSize||18);
  $('#lyricsEditor').style.fontSize=`${store.fontSize||18}px`;
  $('#workbench').dataset.mode=store.mode||'write';
  $$('.mode-tab').forEach((button)=>button.classList.toggle('active',button.dataset.mode===store.mode));
  $$('.basis-option').forEach((button)=>button.classList.toggle('active',button.dataset.basis===store.basis));
  $('#libraryPanel').classList.toggle('collapsed',store.libraryOpen===false);
  $('#bpmInput').value=String(ensurePerformance(song).bpm||92);
  updateModeCopy();
  updateStats();
  renderBarRail();
  renderLibrary();
  renderPerform();
  syncCursorQuery(true);
}

function updateModeCopy(){
  const copy={write:['WRITE','Stay in the lyric.'],rhyme:['RHYME','Open the full RhymeLab surface.'],perform:['PERFORM','Shape delivery directly on the bars.']}[store.mode]||['WRITE','Stay in the lyric.'];
  $('#editorEyebrow').textContent=copy[0];$('#editorHeading').textContent=copy[1];
  $('#assistHeading').textContent=store.mode==='rhyme'?'Deep RhymeLab results':'Best of RhymeLab';
  if(store.mode==='rhyme')scheduleSearch(0);
  if(store.mode==='perform')renderPerform();
}

function updateStats(){
  const text=$('#lyricsEditor').value;const barCount=Math.max(1,lines(text).length);const wordCount=words(text).length;
  $('#songStats').textContent=`${barCount} bars · ${wordCount} words · ${text.length} chars`;
}
function renderBarRail(){
  const count=Math.max(1,lines($('#lyricsEditor').value).length);const lineHeight=Number.parseFloat(getComputedStyle($('#lyricsEditor')).lineHeight)||29.7;
  $('#barRail').innerHTML=Array.from({length:count},(_,i)=>`<div class="bar-number" style="height:${lineHeight}px">${i+1}</div>`).join('');
}
function cursorBar(){return $('#lyricsEditor').value.slice(0,$('#lyricsEditor').selectionStart).split('\n').length;}
function updateCursorReadout(){$('#cursorReadout').textContent=`Bar ${cursorBar()}`;}

function stableVersion(song,text){
  const last=song.history?.at(-1)?.text??'';
  if(last===text)return;
  song.history ||= [];
  song.history.push({at:Date.now(),text});
  if(song.history.length>100)song.history.splice(0,song.history.length-100);
}
function scheduleSongSave(){
  saveStateLabel('Saving…');clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(()=>{
    const song=activeSong();if(!song)return;
    song.text=$('#lyricsEditor').value;song.updatedAt=Date.now();stableVersion(song,song.text);persist();renderLibrary();saveStateLabel('Saved locally');
  },650);
}
function saveMetadata(){const song=activeSong();song.title=$('#songTitle').value.trim()||'Untitled';song.folder=$('#songFolder').value.trim()||'Unfiled';song.updatedAt=Date.now();persist();renderLibrary();saveStateLabel('Saved locally');}

function renderLibrary(){
  const q=$('#librarySearch').value.trim().toLocaleLowerCase('de-DE');const view=store.libraryView||'active';
  $$('.library-tab').forEach((button)=>button.classList.toggle('active',button.dataset.libraryView===view));
  const list=store.songs.filter((song)=>(view==='trash')===Boolean(song.trash)).filter((song)=>!q||`${song.title} ${song.folder}`.toLocaleLowerCase('de-DE').includes(q)).sort((a,b)=>b.updatedAt-a.updatedAt);
  $('#libraryList').innerHTML=list.length?list.map((song)=>`<button class="library-item ${song.id===store.activeSongId?'active':''}" type="button" data-song-id="${esc(song.id)}"><strong>${esc(song.title||'Untitled')}</strong><span>${esc(song.folder||'Unfiled')} · ${new Date(song.updatedAt).toLocaleDateString()}</span></button>`).join(''):'<div class="assist-status">Nothing here.</div>';
  $('#deleteSong').classList.toggle('hidden',view==='trash');$('#restoreSong').classList.toggle('hidden',view!=='trash');
}
function switchSong(id){
  const target=store.songs.find((song)=>song.id===id);if(!target)return;
  const current=activeSong();if(current){current.text=$('#lyricsEditor').value;current.title=$('#songTitle').value.trim()||current.title;current.folder=$('#songFolder').value.trim()||current.folder;}
  store.activeSongId=id;persist();renderShell();
}
function newSong(){const song=freshSong();store.songs.push(song);store.activeSongId=song.id;store.libraryView='active';persist();renderShell();$('#songTitle').select();}
function trashSong(){const song=activeSong();if(!song)return;song.trash=true;song.updatedAt=Date.now();const next=store.songs.find((item)=>!item.trash&&item.id!==song.id)||freshSong();if(!store.songs.includes(next))store.songs.push(next);store.activeSongId=next.id;persist();renderShell();}
function restoreSong(){const song=activeSong();if(!song)return;song.trash=false;song.updatedAt=Date.now();store.libraryView='active';persist();renderShell();}

function selectionQuery(){
  const editor=$('#lyricsEditor');const start=editor.selectionStart,end=editor.selectionEnd,text=editor.value;
  if(end>start){const selected=text.slice(start,end).replace(/\s+/g,' ').trim();if(selected.length>=2&&selected.length<=120)return selected;}
  const left=text.slice(0,start),right=text.slice(start);const leftMatch=left.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*$/u);const rightMatch=right.match(/^[\p{L}\p{N}]*(?:['’\-][\p{L}\p{N}]+)*/u);return `${leftMatch?.[0]||''}${rightMatch?.[0]||''}`.trim();
}
function currentTokenBounds(){
  const editor=$('#lyricsEditor'),text=editor.value,start=editor.selectionStart,end=editor.selectionEnd;
  if(end>start)return {start,end};
  const left=text.slice(0,start),right=text.slice(start);const lm=left.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*$/u),rm=right.match(/^[\p{L}\p{N}]*(?:['’\-][\p{L}\p{N}]+)*/u);
  return {start:start-(lm?.[0].length||0),end:start+(rm?.[0].length||0)};
}
function syncCursorQuery(force=false){
  updateCursorReadout();if(!$('#followCursor').checked&&!force)return;
  const query=selectionQuery();if(!query||query.length<2){if(force)$('#rhymeQuery').value='';$('#liveQueryReadout').textContent='Rhyme assist follows the word at your cursor.';return;}
  if($('#rhymeQuery').value!==query)$('#rhymeQuery').value=query;
  $('#liveQueryReadout').textContent=`Live rhyme: ${query}`;
  if(query!==state.lastAutoQuery||force){state.lastAutoQuery=query;scheduleSearch();}
}
function replaceCurrent(text){
  const editor=$('#lyricsEditor'),bounds=currentTokenBounds(),before=editor.value.slice(0,bounds.start),after=editor.value.slice(bounds.end);editor.value=`${before}${text}${after}`;const caret=bounds.start+text.length;editor.setSelectionRange(caret,caret);editor.focus();updateStats();renderBarRail();scheduleSongSave();syncCursorQuery(true);
}

function relationTypes(row){const out=[];if(row.primaryType&&RHYME_TYPES.includes(row.primaryType))out.push(row.primaryType);else if(RHYME_TYPES.includes(row.type))out.push(row.type);for(const type of row.relationTypes||[])if(RHYME_TYPES.includes(type)&&!out.includes(type))out.push(type);return out;}
function mainType(row){return relationTypes(row)[0]||row.type||'weak';}
function typeLabel(type){return TYPE_LABELS[type]||type.replaceAll('_',' ');}
function resultScore(row,type=mainType(row)){if(type==='assonance'||type==='consonance'){const rel=(row.relations||[]).find((item)=>item.type===type);return Number(rel?.score||0);}return Number(row.score||0);}
function entityCategoryLabel(category){return ENTITY_CATEGORY_LABELS[category]||String(category||'Entity').replaceAll('.',' / ');}
function candidateHtml(row,type=mainType(row)){
  const isPhrase=row.resultKind==='phrase',isEntity=row.resultKind==='entity';
  const kind=isEntity?'ENTITY':isPhrase?'PHRASE':'WORD';
  const usage=isEntity?(row.popularityTier?`Tier ${row.popularityTier}`:'—'):isPhrase?(row.usageCount?number(row.usageCount):'—'):(row.usageRank?`#${number(row.usageRank)}`:'—');
  const entityCategories=isEntity?(row.entityCategories||[]).filter((item)=>item.retained!==false).slice(0,3).map((item)=>`<span class="entity-category-chip">${esc(entityCategoryLabel(item.category))}</span>`).join(''):'';
  const ipa=isEntity&&row.ipa?`<span class="entity-ipa">/${esc(row.ipa)}/</span>`:'';
  return `<div class="rhyme-candidate ${isEntity?'entity-candidate':''}"><div class="candidate-main"><div class="candidate-title"><strong>${esc(row.word)}</strong><span class="candidate-kind ${isEntity?'entity':''}">${kind}</span>${entityCategories}</div><div class="candidate-meta"><span class="badge ${esc(type)}">${esc(typeLabel(type))}</span><span>${Math.round(resultScore(row,type)*100)}%</span><span>${esc(row.syllableCount??'—')} syll.</span><span>${usage}</span>${ipa}</div></div><button class="use-candidate" type="button" data-candidate="${esc(row.word)}">Use</button></div>`;
}
function compactResults(data){
  const rows=data.results||[],wordRows=rows.filter((row)=>row.resultKind==='word').slice(0,10),phraseRows=rows.filter((row)=>row.resultKind==='phrase').slice(0,8),entityRows=rows.filter((row)=>row.resultKind==='entity').slice(0,10);
  const block=(label,items)=>items.length?`<section class="compact-channel"><div class="compact-channel-heading"><strong>${label}</strong><span>${items.length}</span></div>${items.map((row)=>candidateHtml(row)).join('')}</section>`:'';
  return block('Words',wordRows)+block('Phrases / Mosaic',phraseRows)+block('Entities',entityRows)||'<div class="assist-status">No matching rhymes.</div>';
}
function deepResults(data){
  const rows=data.results||[],scope=$('#rhymeScope').value;
  const scopeKind={words:'word',phrases:'phrase',entities:'entity'}[scope]||null;const visible=rows.filter((row)=>!scopeKind||row.resultKind===scopeKind);
  const labels={word:'Words',phrase:'Phrases / Mosaic',entity:'Entities'};
  const chunks=[];for(const kind of ['word','phrase','entity']){const kindRows=visible.filter((row)=>row.resultKind===kind);if(!kindRows.length)continue;for(const type of RHYME_TYPES){const typed=kindRows.filter((row)=>relationTypes(row).includes(type));if(!typed.length)continue;chunks.push(`<section class="rhyme-group ${kind}"><div class="rhyme-group-heading"><strong>${labels[kind]} · ${esc(typeLabel(type))}</strong><span>${typed.length}</span></div>${typed.map((row)=>candidateHtml(row,type)).join('')}</section>`);}}
  return chunks.join('')||'<div class="assist-status">No matching rhymes.</div>';
}
function presetToRequest(){
  if(store.mode==='rhyme')return {scope:$('#rhymeScope').value,type:$('#rhymeType').value};
  const preset=$('#assistPreset').value;if(['words','phrases','entities'].includes(preset))return {scope:preset,type:'all'};if(RHYME_TYPES.includes(preset))return {scope:'all',type:preset};return {scope:'all',type:'all'};
}
function scheduleSearch(delay=320){clearTimeout(state.searchTimer);state.searchTimer=setTimeout(runSearch,delay);}
async function runSearch(){
  const query=$('#rhymeQuery').value.trim();if(query.length<2){$('#assistStatus').textContent='Type in the editor to start local rhyme search.';$('#rhymeResults').innerHTML='';return;}
  state.searchAbort?.abort();state.searchAbort=new AbortController();const {scope,type}=presetToRequest();const deep=store.mode==='rhyme';
  const params=new URLSearchParams({q:query,language:store.basis||'de',scope,type,word_limit:deep?'250':'36',word_pool:deep?'800':'220',phrase_limit:deep?'250':'36',phrase_pool:deep?'512':'128',phrase_per_channel:deep?'128':'32',entity_limit:deep?'250':'36',entity_pool:deep?'256':'96',entity_category:$('#entityCategory').value||'all'});
  $('#assistStatus').classList.remove('error');$('#assistStatus').textContent=`Searching ${query} locally…`;
  try{
    const response=await fetch(`/api/writer?${params}`,{signal:state.searchAbort.signal});const data=await response.json();
    if(!response.ok)throw new Error((data.warnings||[]).map((item)=>item.message).filter(Boolean).join(' ')||data.error||data.status||'Search failed');
    state.capabilities=data.capabilities||state.capabilities;const count=data.results?.length||0;const counts=data.counts||{};const parts=[counts.words!=null?`${counts.words} words`:null,counts.phrases!=null?`${counts.phrases} phrases`:null,counts.entities!=null?`${counts.entities} entities`:null].filter(Boolean);$('#assistStatus').textContent=`${count} results${parts.length?` · ${parts.join(' · ')}`:''} · ${data.elapsedMs?`${Math.round(data.elapsedMs)} ms · `:''}RhymeLab local`;
    $('#rhymeResults').innerHTML=deep?deepResults(data):compactResults(data);
  }catch(error){if(error.name==='AbortError')return;$('#assistStatus').textContent=error.message;$('#assistStatus').classList.add('error');$('#rhymeResults').innerHTML='';}
}

function tokenKey(lineIndex,wordIndex){return `${lineIndex}:${wordIndex}`;}
function renderPerform(){
  const song=activeSong();if(!song)return;const performance=ensurePerformance(song);$('#bpmInput').value=performance.bpm||92;
  const rows=lines($('#lyricsEditor').value);$('#performScore').innerHTML=rows.map((line,lineIndex)=>{const lineWords=words(line);const body=lineWords.length?lineWords.map((word,wordIndex)=>{const key=tokenKey(lineIndex,wordIndex),cue=performance.cues[key]||'',offset=Number(performance.offsets[key]||0);return `<button type="button" class="perform-word ${cue?`cue-${esc(cue)}`:''} ${state.selectedPerformKey===key?'selected':''}" data-perform-key="${key}" style="--offset:${offset}px">${esc(word)}</button>`;}).join(''):'<span class="candidate-meta">Empty bar</span>';return `<div class="perform-line"><div class="perform-bar-no">${lineIndex+1}</div><div class="perform-track ${state.selectedPerformKey?.startsWith(`${lineIndex}:`)?'has-selected':''}"><div class="perform-words">${body}<span class="move-controls"><button type="button" data-move="-8">−</button><button type="button" data-move="8">+</button></span></div></div></div>`;}).join('');
}
function applyCue(key){const song=activeSong(),performance=ensurePerformance(song);if(state.activeCue==='move'){state.selectedPerformKey=key;renderPerform();return;}if(state.activeCue==='erase')delete performance.cues[key];else performance.cues[key]=state.activeCue;state.selectedPerformKey=key;persist();renderPerform();}
function moveSelected(delta){const song=activeSong(),performance=ensurePerformance(song);if(!state.selectedPerformKey)return;performance.offsets[state.selectedPerformKey]=Math.max(-24,Math.min(120,Number(performance.offsets[state.selectedPerformKey]||0)+Number(delta)));persist();renderPerform();}

$$('.mode-tab').forEach((button)=>button.addEventListener('click',()=>{store.mode=button.dataset.mode;persist();renderShell();}));
$$('.basis-option').forEach((button)=>button.addEventListener('click',()=>{store.basis=['de','en','both'].includes(button.dataset.basis)?button.dataset.basis:'de';persist();renderShell();scheduleSearch(0);}));
$('#lyricsEditor').addEventListener('input',()=>{updateStats();renderBarRail();scheduleSongSave();syncCursorQuery();if(store.mode==='perform')renderPerform();});
['click','keyup','select'].forEach((eventName)=>$('#lyricsEditor').addEventListener(eventName,()=>syncCursorQuery()));
$('#lyricsEditor').addEventListener('scroll',()=>{$('#barRail').scrollTop=$('#lyricsEditor').scrollTop;});
$('#fontSize').addEventListener('change',()=>{store.fontSize=Math.max(13,Math.min(64,Number($('#fontSize').value)||18));$('#lyricsEditor').style.fontSize=`${store.fontSize}px`;persist();renderBarRail();});
$('#songTitle').addEventListener('change',saveMetadata);$('#songFolder').addEventListener('change',saveMetadata);
$('#toggleLibrary').addEventListener('click',()=>{store.libraryOpen=!store.libraryOpen;persist();$('#libraryPanel').classList.toggle('collapsed',store.libraryOpen===false);});
$('#librarySearch').addEventListener('input',renderLibrary);$('#newSong').addEventListener('click',newSong);$('#deleteSong').addEventListener('click',trashSong);$('#restoreSong').addEventListener('click',restoreSong);
$('#libraryList').addEventListener('click',(event)=>{const item=event.target.closest('[data-song-id]');if(item)switchSong(item.dataset.songId);});
$$('.library-tab').forEach((button)=>button.addEventListener('click',()=>{store.libraryView=button.dataset.libraryView;persist();renderLibrary();}));
$('#followCursor').addEventListener('change',()=>{if($('#followCursor').checked)syncCursorQuery(true);});
$('#rhymeQuery').addEventListener('input',()=>{if($('#followCursor').checked)$('#followCursor').checked=false;scheduleSearch();});
$('#assistPreset').addEventListener('change',()=>scheduleSearch(0));$('#rhymeScope').addEventListener('change',()=>scheduleSearch(0));$('#rhymeType').addEventListener('change',()=>scheduleSearch(0));$('#entityCategory').addEventListener('change',()=>scheduleSearch(0));
$('#rhymeResults').addEventListener('click',(event)=>{const button=event.target.closest('[data-candidate]');if(button)replaceCurrent(button.dataset.candidate);});
$$('.cue-button').forEach((button)=>button.addEventListener('click',()=>{state.activeCue=button.dataset.cue;$$('.cue-button').forEach((node)=>node.classList.toggle('active',node===button));}));
$('#performScore').addEventListener('click',(event)=>{const move=event.target.closest('[data-move]');if(move){moveSelected(move.dataset.move);return;}const word=event.target.closest('[data-perform-key]');if(word)applyCue(word.dataset.performKey);});
$('#bpmInput').addEventListener('change',()=>{const song=activeSong();ensurePerformance(song).bpm=Math.max(40,Math.min(240,Number($('#bpmInput').value)||92));persist();});

renderShell();
