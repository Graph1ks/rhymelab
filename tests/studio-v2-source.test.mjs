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

  assert.match(html,/class="splitter"/u);
  assert.match(html,/class="detail-dock hidden"/u);
  assert.match(html,/class="editor-dock hidden"/u);
  assert.match(html,/class="mobile-nav"/u);
  assert.match(html,/data-density="compact"/u);
  assert.match(html,/data-density="tiles"/u);
  assert.match(app,/dataset\.studioVersion='2'/u);
  assert.match(html,/id=["']themeQuick["']/u);
  assert.match(html,/id=["']themeQuickMenu["']/u);
  assert.match(css,/\.theme-quick:hover \.theme-quick-menu/u);
  assert.match(css,/\.theme-builder-grid/u);
  assert.match(app,/customThemes/u);
  assert.match(app,/themeSlots/u);
  assert.match(app,/Light-Style ersetzen/u);
  assert.match(app,/Dark-Style ersetzen/u);
  assert.match(app,/function saveThemeDraft\(/u);
  assert.match(app,/function renderThemeQuickMenu\(/u);
  assert.match(app,/function previewThemeDraft\(/u);
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
  assert.match(server,/'\/studio\/document-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/capability-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/query-pronunciation-client\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/query-pronunciation-cache\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);

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
});


test('Studio orchestrator is split behind maintainable module boundaries',async()=>{
  const [app,core,controls,search,documents,capabilities,pronunciationClient,pronunciationCache]=await Promise.all([
    readFile('src/studio/app.js','utf8'),
    readFile('src/studio/studio-core.mjs','utf8'),
    readFile('src/studio/studio-controls.mjs','utf8'),
    readFile('src/studio/search-adapter.mjs','utf8'),
    readFile('src/studio/document-adapter.mjs','utf8'),
    readFile('src/studio/capability-adapter.mjs','utf8'),
    readFile('src/studio/query-pronunciation-client.mjs','utf8'),
    readFile('src/studio/query-pronunciation-cache.mjs','utf8'),
  ]);

  assert.match(app,/from '\.\/studio-core\.mjs'/u);
  assert.match(app,/from '\.\/document-adapter\.mjs'/u);
  assert.match(app,/from '\.\/search-adapter\.mjs'/u);
  assert.match(app,/from '\.\/studio-controls\.mjs'/u);
  assert.match(app,/createWriterSearchClient\(\)/u);
  assert.match(app,/refreshWriterResults\(\)/u);
  assert.match(app,/queryBasis:basis/u);
  assert.match(app,/resultLanguage:resultLang/u);
  assert.match(app,/writeStudioState\(state\)/u);
  assert.match(app,/from '\.\/capability-adapter\.mjs'/u);
  assert.match(app,/refreshStudioCapabilities\(\)/u);
  assert.match(app,/id="capabilitySummary"/u);

  assert.match(core,/export const queryAll=/u);
  assert.match(controls,/export function normalizeDensity/u);
  assert.match(search,/export function createWriterSearchClient/u);
  assert.match(search,/export function buildWriterParams/u);
  assert.match(search,/export function mapWriterResult/u);
  assert.match(documents,/export function loadStudioState/u);
  assert.match(capabilities,/export async function loadStudioCapabilities/u);
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
  });
  assert.equal(params.get('q'),'Arbeitsweise');
  assert.equal(params.get('language'),'de');
  assert.equal(params.get('result_language'),'both');
  assert.equal(params.get('scope'),'phrases');
  assert.equal(params.get('type'),'all');

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
