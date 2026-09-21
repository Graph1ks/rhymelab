import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Studio 02 golden-master surface is present with its core visual/interaction contract',async()=>{
  const [html,css,app]=await Promise.all([
    readFile('src/studio/index.html','utf8'),
    readFile('src/studio/styles.css','utf8'),
    readFile('src/studio/app.js','utf8'),
  ]);

  assert.match(html,/RhymeLab Studio 02 — Desktop Workbench/u);
  assert.match(html,/href=["']\/studio\/styles\.css["']/u);
  assert.match(html,/src=["']\/studio\/app\.js["']/u);
  assert.match(html,/id=["']runtimeStatus["']/u);
  assert.match(html,/Live Writer · lokale Datenbank/u);
  assert.match(html,/type=["']module["'][^>]*src=["']\/studio\/app\.js["']/u);

  assert.match(css,/--assist-width:470px/u);
  assert.match(css,/--bg:#EAE7DC/u);
  assert.match(css,/--line:#D8C3A5/u);
  assert.match(css,/--accent:#E85A4F/u);
  assert.match(css,/--accent-2:#E98074/u);
  assert.match(css,/\[data-theme=dark\]/u);
  assert.match(css,/--bg:#272727/u);
  assert.match(css,/--accent:#FFE400/u);
  assert.match(css,/--accent-2:#FF652F/u);
  assert.match(css,/--green:#14A76C/u);
  assert.match(css,/prefers-reduced-motion:reduce/u);
  assert.match(css,/100dvh/u);
  assert.match(css,/Studio 02: bounded settings dock \+ themed scrollbars/u);
  assert.match(css,/\.editor-dock-body\{[\s\S]*?min-height:0;[\s\S]*?overflow-y:auto;/u);
  assert.match(css,/#editorDock\[data-tab=settings\]\{[\s\S]*?flex:1 1 460px;[\s\S]*?max-height:min\(68dvh,620px\)/u);
  assert.match(css,/\.theme-builder-actions\{[\s\S]*?position:sticky;[\s\S]*?bottom:0/u);
  assert.match(css,/\*::-webkit-scrollbar-thumb/u);
  assert.match(css,/scrollbar-color:color-mix\(in srgb,var\(--muted\) 52%,var\(--line\)\) transparent/u);
  assert.match(css,/Studio capability surface/u);
  assert.match(css,/\.capability-grid/u);
  assert.match(css,/\.local\.degraded/u);
  assert.match(css,/Studio live Writer states/u);
  assert.match(css,/\.writer-loading:after/u);
  assert.match(css,/Studio production detail parity/u);
  assert.match(css,/\.detail-fact-grid/u);
  assert.match(css,/\.advanced-filters/u);
  assert.match(css,/\.advanced-filter-grid/u);
  assert.match(css,/\.advanced-check/u);

  assert.match(html,/class="splitter"/u);
  assert.match(html,/class="detail-dock hidden"/u);
  assert.match(html,/class="editor-dock hidden"/u);
  assert.match(html,/class="mobile-nav"/u);
  assert.match(html,/data-density="compact"/u);
  assert.match(html,/data-density="tiles"/u);
  assert.match(html,/id=["']redoBtn["']/u);
  assert.match(html,/id=["']advancedFiltersToggle["']/u);
  assert.match(html,/id=["']advancedPreset["']/u);
  assert.match(html,/id=["']advancedRhymeType["']/u);
  assert.match(html,/id=["']advancedVariants["']/u);
  assert.match(html,/id=["']advancedEntityCategory["']/u);
  assert.match(html,/id=["']advancedHideUsed["']/u);
  assert.match(html,/id=["']advancedHistorical["']/u);
  assert.match(html,/id=["']advancedGenerated["']/u);
  assert.match(html,/id=["']advancedGeneratedOnly["']/u);
  assert.match(app,/dataset\.studioVersion='2'/u);
  assert.match(html,/id=["']themeQuick["']/u);
  assert.match(html,/id=["']themeQuickMenu["']/u);
  assert.match(css,/\.theme-quick:hover \.theme-quick-menu/u);
  assert.match(css,/\.theme-quick-menu::before/u);
  assert.match(css,/#themeBtn\[aria-expanded="true"\] \+ \.theme-quick-menu/u);
  assert.match(css,/\.theme-builder-grid/u);
  assert.match(app,/customThemes/u);
  assert.match(app,/themeSlots/u);
  assert.match(app,/Light-Style ersetzen/u);
  assert.match(app,/Dark-Style ersetzen/u);
  assert.match(app,/function saveThemeDraft\(/u);
  assert.match(app,/function renderThemeQuickMenu\(/u);
  assert.match(app,/function setThemeQuickOpen\(/u);
  assert.match(app,/function scheduleThemeQuickClose\(/u);
  assert.match(app,/open&&render&&!wasOpen/u);
  assert.match(app,/if\(event\.target!==button\)setThemeQuickOpen\(true,\{render:false\}\)/u);
  assert.match(app,/button\.onclick=function\(event\)/u);
  assert.match(app,/button\.onclick=function\(event\)\{[\s\S]*?toggleTheme\(\);[\s\S]*?setThemeQuickOpen\(false,\{render:false\}\)/u);
  assert.match(app,/applyThemeChoice\(choice\)/u);
  assert.match(app,/function previewThemeDraft\(/u);
  assert.match(app,/compositionstart/u);
  assert.match(app,/compositionend/u);
  assert.match(app,/addEventListener\('paste'/u);
  assert.match(app,/validateSelectionProof\(song\(\),selectionProof\)/u);
  assert.match(app,/performUndo/u);
  assert.match(app,/performRedo/u);
  assert.match(app,/initializeDocumentStore/u);
  assert.match(app,/shadowLegacyStudioStateToStore/u);
  assert.match(app,/DocumentStore/u);
  assert.match(app,/function renderLibrary\(/u);
  assert.match(app,/function createLibraryFolder\(/u);
  assert.match(app,/function deleteLibraryFolder\(/u);
  assert.match(app,/function moveLibrarySong\(/u);
  assert.match(app,/function permanentlyDeleteLibrarySong\(/u);
  assert.match(app,/id="librarySearch"/u);
  assert.match(app,/id="librarySort"/u);
  assert.match(css,/Studio library parity/u);
  assert.match(css,/\.library-shell/u);
  assert.match(css,/\.library-folder-row/u);
  assert.match(css,/\.songcard-actions/u);
});

test('Studio preview route is parallel and leaves legacy Search and RhymePad routes in place',async()=>{
  const server=await readFile('src/server.mjs','utf8');

  assert.match(server,/const studioUiDir = resolve\('src\/studio'\)/u);
  assert.match(server,/const studioHtml = readFileSync\(resolve\(studioUiDir, 'index\.html'\)\)/u);
  assert.match(server,/'\/studio': \{ type: 'text\/html; charset=utf-8', body: studioHtml \}/u);
  assert.match(server,/'\/studio\/': \{ type: 'text\/html; charset=utf-8', body: studioHtml \}/u);
  assert.match(server,/'\/studio\/styles\.css': \{ type: 'text\/css; charset=utf-8'/u);
  assert.match(server,/'\/studio\/app\.js': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/studio-core\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/search-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/search-filters\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/search-state\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/document-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/document-model\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/document-store\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/editor-session\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/capability-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/detail-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/query-pronunciation-client\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/query-pronunciation-cache\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);

  assert.match(server,/'\/assets\/search-state\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/': \{ type: 'text\/html; charset=utf-8', body: writerHtml \}/u);
  assert.match(server,/'\/pad': \{ type: 'text\/html; charset=utf-8', body: padHtml \}/u);
  assert.match(server,/Studio 02 preview:/u);
});

test('Studio migration contract keeps old routes until exhaustive parity acceptance',async()=>{
  const parity=await readFile('docs/UI_REDESIGN_PARITY.md','utf8');
  const migration=await readFile('docs/STUDIO_V2_MIGRATION_PLAN.md','utf8');

  assert.match(parity,/Do not switch \/ to Studio until/u);
  assert.match(parity,/exhaustive old-vs-new feature audit/u);
  assert.match(parity,/Library folder hierarchy/u);
  assert.match(parity,/legacy tags\/badges/u);
  assert.match(parity,/optional rhyme-chain visualization/u);
  assert.match(parity,/Nested result scrollers are forbidden/u);
  assert.match(parity,/Markov work remains intentionally paused/u);

  assert.match(migration,/exact Studio 02 import\s+DONE/u);
  assert.match(migration,/parallel \/studio route\s+DONE/u);
  assert.match(migration,/parity matrix\s+DONE/u);
  assert.match(migration,/live \/api\/writer search\s+DONE/u);
  assert.match(migration,/detail\/provenance parity\s+DONE/u);
  assert.match(migration,/complete filter parity\s+DONE/u);
  assert.match(migration,/shared SearchState\s+DONE/u);
  assert.match(migration,/document\/editor spike\s+DONE/u);
});


test('Studio orchestrator is split behind maintainable module boundaries',async()=>{
  const [app,core,controls,search,filters,sharedSearchState,documents,documentModel,documentStore,editorSession,capabilities,details,pronunciationClient,pronunciationCache]=await Promise.all([
    readFile('src/studio/app.js','utf8'),
    readFile('src/studio/studio-core.mjs','utf8'),
    readFile('src/studio/studio-controls.mjs','utf8'),
    readFile('src/studio/search-adapter.mjs','utf8'),
    readFile('src/studio/search-filters.mjs','utf8'),
    readFile('src/ui/search-state.mjs','utf8'),
    readFile('src/studio/document-adapter.mjs','utf8'),
    readFile('src/studio/document-model.mjs','utf8'),
    readFile('src/studio/document-store.mjs','utf8'),
    readFile('src/studio/editor-session.mjs','utf8'),
    readFile('src/studio/capability-adapter.mjs','utf8'),
    readFile('src/studio/detail-adapter.mjs','utf8'),
    readFile('src/studio/query-pronunciation-client.mjs','utf8'),
    readFile('src/studio/query-pronunciation-cache.mjs','utf8'),
  ]);

  assert.match(app,/from '\.\/studio-core\.mjs'/u);
  assert.match(app,/from '\.\/document-adapter\.mjs'/u);
  assert.match(app,/from '\.\/document-store\.mjs'/u);
  assert.match(app,/from '\.\/search-adapter\.mjs'/u);
  assert.match(app,/from '\.\/search-filters\.mjs'/u);
  assert.match(app,/from '\.\/search-state\.mjs'/u);
  assert.match(app,/from '\.\/studio-controls\.mjs'/u);
  assert.match(app,/createWriterSearchClient\(\)/u);
  assert.match(app,/refreshWriterResults\(\)/u);
  assert.match(app,/queryBasis:basis/u);
  assert.match(app,/resultLanguage:resultLang/u);
  assert.match(app,/rhymeType,/u);
  assert.match(app,/includeVariants:variantMode==='all'/u);
  assert.match(app,/includeHistorical,/u);
  assert.match(app,/generatedOnly,/u);
  assert.match(app,/entityCategory,/u);
  assert.match(app,/function syncAdvancedControls\(/u);
  assert.match(app,/function applySearchPreset\(/u);
  assert.match(app,/function filterUnusedWriterRows\(/u);
  assert.match(app,/writerRowAlreadyUsed/u);
  assert.match(app,/writeStudioState\(state\)/u);
  assert.match(app,/from '\.\/capability-adapter\.mjs'/u);
  assert.match(app,/from '\.\/detail-adapter\.mjs'/u);
  assert.match(app,/from '\.\/editor-session\.mjs'/u);
  assert.match(app,/refreshStudioCapabilities\(\)/u);
  assert.match(app,/id="capabilitySummary"/u);

  assert.match(core,/export const queryAll=/u);
  assert.match(controls,/export function normalizeDensity/u);
  assert.match(search,/export function createWriterSearchClient/u);
  assert.match(search,/export function buildWriterParams/u);
  assert.match(search,/export function mapWriterResult/u);
  assert.match(filters,/export function filterStudioWriterRows/u);
  assert.match(filters,/export function sortStudioWriterRows/u);
  assert.match(sharedSearchState,/SEARCH_STATE_SCHEMA='rhymelab-search-state-v1'/u);
  assert.match(sharedSearchState,/export function searchStateToWriterParams/u);
  assert.match(documents,/export function loadStudioState/u);
  assert.match(documents,/export function loadStudioDocumentSnapshot/u);
  assert.match(documentModel,/STUDIO_DOCUMENT_SCHEMA='rhymelab-studio-document-v1'/u);
  assert.match(documentModel,/export function migrateLegacyStudioState/u);
  assert.match(documentModel,/export function splitBar/u);
  assert.match(documentModel,/export function replaceSelection/u);
  assert.match(documentStore,/export function createStudioDocumentStore/u);
  assert.match(documentStore,/export async function migrateLegacyStudioStateToStore/u);
  assert.match(documentStore,/export async function shadowLegacyStudioStateToStore/u);
  assert.match(documentStore,/createObjectStore/u);
  assert.match(documentStore,/songOrder/u);
  assert.match(editorSession,/export function ensureEditorSong/u);
  assert.match(editorSession,/export function pasteEditorText/u);
  assert.match(editorSession,/export function createSelectionProof/u);
  assert.match(editorSession,/export function validateSelectionProof/u);
  assert.match(capabilities,/export async function loadStudioCapabilities/u);
  assert.match(details,/export function createStudioDetailClient/u);
  assert.match(details,/export function buildStudioDetailModel/u);
  assert.match(pronunciationClient,/CLIENT_QUERY_PRONUNCIATION_POLICY/u);
  assert.match(pronunciationCache,/QUERY_PRONUNCIATION_CACHE_SCHEMA/u);
});


test('Studio capability adapter normalizes backend health without leaking backend shapes into UI',async()=>{
  const {normalizeStudioCapabilities}=await import('../src/studio/capability-adapter.mjs');
  const normalized=normalizeStudioCapabilities({
    status:'ok',
    writer_database:'/tmp/de.sqlite',
    writer_runtime:'writer-v5',
    serving_v1:{enabled:true},
    english_available:true,
    phrase_available:true,
    entity_available:false,
    generated_optin:{available:true,default_enabled:false},
    query_pronunciation_revision:'abcdef1234567890',
  },{
    totals:{core:100,generated:25,total:125,consistent:true},
  });

  assert.deepEqual(normalized,{
    status:'ready',
    runtime:'serving-v1',
    servingV1:true,
    deWriter:true,
    enWriter:true,
    phrases:true,
    entities:false,
    generated:true,
    generatedDefault:false,
    queryPronunciationRevision:'abcdef1234567890',
    dataset:{core:100,generated:25,total:125,consistent:true},
  });
});


test('Studio Writer adapter maps runtime rows and preserves canonical recommended order',async()=>{
  const {
    buildWriterParams,
    createWriterSearchClient,
    mapWriterResult,
    writerRelationGroup,
  }=await import('../src/studio/search-adapter.mjs');

  const params=buildWriterParams({
    query:'Arbeitsweise',
    queryBasis:'de',
    resultLanguage:'both',
    scope:'phrase',
    rhymeType:'multisyllabic_perfect',
    includeVariants:true,
    includeHistorical:true,
    generated:true,
    generatedOnly:true,
    entityCategory:'musician',
  });
  assert.equal(params.get('q'),'Arbeitsweise');
  assert.equal(params.get('language'),'de');
  assert.equal(params.get('result_language'),'both');
  assert.equal(params.get('scope'),'phrases');
  assert.equal(params.get('type'),'multisyllabic_perfect');
  assert.equal(params.get('variants'),'all');
  assert.equal(params.get('historical'),'all');
  assert.equal(params.get('generated'),'1');
  assert.equal(params.get('generated_only'),'1');
  assert.equal(params.get('entity_category'),'musician');
  const relationOnly=buildWriterParams({query:'Zeit',rhymeType:'assonance'});
  assert.equal(relationOnly.get('type'),'all');

  const mapped=mapWriterResult({
    resultKind:'word',
    resultId:'hochzeitsreise',
    word:'Hochzeitsreise',
    language:'de',
    syllableCount:4,
    syllableDistance:0,
    primaryType:'multisyllabic_perfect',
    score:.93,
  });
  assert.equal(mapped.word,'Hochzeitsreise');
  assert.equal(mapped.relationType,'multisyllabic_perfect');
  assert.equal(mapped.relation,'rein');
  assert.equal(mapped.relationLabel,'Mehrsilbiger Vollreim');
  assert.equal(writerRelationGroup('slant'),'nah');

  const urls=[];
  const payload={
    status:'ok',
    query:{surface:'Arbeitsweise',syllableCount:4,preferredIpa:'x'},
    queries:{de:{surface:'Arbeitsweise',preferredIpa:'x'},en:null},
    capabilities:{languages:{de:{available:true},en:{available:true}}},
    results:[
      {resultKind:'word',resultId:'b',word:'Zweiter',language:'de',syllableCount:2,primaryType:'slant',score:.7},
      {resultKind:'word',resultId:'a',word:'Erster',language:'de',syllableCount:2,primaryType:'perfect',score:.9},
    ],
    warnings:[],
    runtimeTiming:{currentMs:12},
  };
  const client=createWriterSearchClient({
    fetchImpl:async(url)=>{
      urls.push(String(url));
      return {ok:true,status:200,json:async()=>payload};
    },
  });
  const result=await client.search({
    query:'Arbeitsweise',
    queryBasis:'de',
    resultLanguage:'de',
    scope:'word',
    queryPronunciationRevision:'rev-1',
  });
  assert.match(urls[0],/^\/api\/writer\?/u);
  assert.deepEqual(result.rows.map((row)=>row.word),['Zweiter','Erster']);
  assert.equal(result.querySyllables,4);
});


test('Studio detail adapter uses canonical detail endpoints and keeps entities on Writer metadata',async()=>{
  const {createStudioDetailClient,buildStudioDetailModel}=await import('../src/studio/detail-adapter.mjs');
  const urls=[];
  const client=createStudioDetailClient({
    fetchImpl:async(url)=>{
      urls.push(String(url));
      return {
        ok:true,
        json:async()=>({
          surface:'Hochzeitsreise',
          preferredIpa:'hɔx',
          syllableCount:4,
          partOfSpeech:'noun',
          lemma:'Hochzeitsreise',
          pronunciations:[{ipa:'hɔx',preferred:true,locale:'de-DE',source:'writer'}],
        }),
      };
    },
  });
  const word={
    kind:'word',
    lang:'de',
    id:'word-1',
    word:'Hochzeitsreise',
    relationLabel:'Mehrsilbiger Vollreim',
    relationType:'multisyllabic_perfect',
    score:.93,
    syll:4,
    raw:{
      resultKind:'word',
      word:'Hochzeitsreise',
      language:'de',
      relations:[{type:'assonance',score:.8}],
      usageRank:120,
    },
  };
  const payload=await client.load(word);
  const model=buildStudioDetailModel(word,payload);
  assert.match(urls[0],/^\/api\/word\/Hochzeitsreise\?language=de&generated=0$/u);
  assert.equal(model.partOfSpeech,'noun');
  assert.equal(model.usageRank,120);
  assert.equal(model.relations[0].type,'assonance');

  const before=urls.length;
  const entity={
    kind:'entity',
    lang:'en',
    id:'entity-1',
    word:'Bach',
    relationLabel:'Vollreim',
    relationType:'perfect',
    score:.8,
    raw:{
      resultKind:'entity',
      word:'Bach',
      language:'en',
      ipa:'bɑːk',
      entityQid:'Q1',
      primaryCategory:'person',
      entityCategories:['composer'],
      popularityPercentile:.97,
      popularityTier:'top',
    },
  };
  const entityPayload=await client.load(entity);
  const entityModel=buildStudioDetailModel(entity,entityPayload);
  assert.equal(urls.length,before);
  assert.deepEqual(entityModel.categories,['person','composer']);
  assert.equal(entityModel.popularity,97);
});


test('Studio full Writer filter matrix is wired without changing canonical recommended ordering',async()=>{
  const [html,app]=await Promise.all([
    readFile('src/studio/index.html','utf8'),
    readFile('src/studio/app.js','utf8'),
  ]);

  for(const id of [
    'advancedFiltersToggle',
    'advancedRhymeType',
    'advancedVariants',
    'advancedEntityCategory',
    'advancedHistorical',
    'advancedGenerated',
    'advancedGeneratedOnly',
  ]){
    assert.match(html,new RegExp('id=["\\\']'+id+'["\\\']','u'));
  }

  assert.match(app,/filterStudioWriterRows\(baseData\(\)/u);
  assert.match(app,/sortStudioWriterRows\(data\(\)/u);
  assert.match(app,/sort==='closest'/u);
  assert.match(app,/sort==='common'/u);
  assert.match(app,/syllableMode==='near2'/u);
  assert.match(app,/syllableMode==='near3'/u);
  assert.match(app,/writerCapabilities=result\.capabilities/u);
  assert.match(app,/entityCategories\(\)/u);
  assert.match(app,/advancedFilterCount\(\)/u);
  assert.match(app,/generatedOnly=e\.target\.checked/u);
});


test('Studio filter module covers exact sound relations, syllable windows and deterministic sorts',async()=>{
  const {
    filterStudioWriterRows,
    sortStudioWriterRows,
    studioRowMatchesType,
  }=await import('../src/studio/search-filters.mjs');

  const rows=[
    {
      id:'a',word:'Alpha',relationType:'perfect',syll:3,syllableDistance:0,score:.82,usageRank:120,
      raw:{relations:[{type:'assonance',score:.91}]},
    },
    {
      id:'b',word:'Beta',relationType:'slant',syll:4,syllableDistance:1,score:.94,usageRank:20,
      raw:{relations:[{type:'consonance',score:.88}]},
    },
    {
      id:'c',word:'Gamma',relationType:'family',syll:6,syllableDistance:3,score:.72,usageCount:900},
  ];

  assert.equal(studioRowMatchesType(rows[0],'assonance'),true);
  assert.equal(studioRowMatchesType(rows[1],'assonance'),false);
  assert.deepEqual(
    filterStudioWriterRows(rows,{rhymeType:'all',syllableMode:'near2',querySyllables:3}).map((row)=>row.id),
    ['a','b'],
  );
  assert.deepEqual(
    sortStudioWriterRows(rows,{sort:'closest',rhymeType:'all',querySyllables:3}).map((row)=>row.id),
    ['b','a','c'],
  );
  assert.deepEqual(
    sortStudioWriterRows(rows,{sort:'syllables',querySyllables:3}).map((row)=>row.id),
    ['a','b','c'],
  );
});


test('shared SearchState preserves search context across standalone Search and Studio',async()=>{
  const {
    SEARCH_STATE_STORAGE_KEY,
    createSearchState,
    loadSearchState,
    saveSearchState,
    searchStateFromUrl,
    searchStateToWriterParams,
    writeSearchStateToUrl,
  }=await import('../src/ui/search-state.mjs');

  const values=new Map();
  const storage={
    getItem:(key)=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
  };
  const initial=createSearchState({
    anchor:'Arbeitsweise',
    queryBasis:'de',
    resultLanguage:'both',
    scope:'phrase',
    rhymeType:'assonance',
    syllableFilter:'near2',
    sort:'closest',
    variantMode:'all',
    historical:true,
    generated:true,
    generatedOnly:true,
    entityCategory:'person.rapper',
    selectedResultId:'row-42',
  });
  const saved=saveSearchState(initial,storage);
  assert.equal(values.has(SEARCH_STATE_STORAGE_KEY),true);
  assert.equal(loadSearchState(storage).selectedResultId,'row-42');
  assert.equal(saved.scope,'phrases');
  assert.equal(saved.generated,true);

  const params=searchStateToWriterParams(saved);
  assert.equal(params.get('scope'),'phrases');
  assert.equal(params.get('type'),'all');
  assert.equal(params.get('variants'),'all');
  assert.equal(params.get('historical'),'all');
  assert.equal(params.get('generated_only'),'1');

  const url=writeSearchStateToUrl(new URL('http://127.0.0.1:3030/'),saved);
  const restored=searchStateFromUrl(url,createSearchState());
  assert.equal(restored.anchor,'Arbeitsweise');
  assert.equal(restored.rhymeType,'assonance');
  assert.equal(restored.syllableFilter,'near2');
  assert.equal(restored.sort,'closest');
  assert.equal(restored.entityCategory,'person.rapper');
});
