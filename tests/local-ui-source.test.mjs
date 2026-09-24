import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('local UI exposes one unified word and Phrase/Mosaic Writer surface', async () => {
  const [html, app, searchState, clientPronunciation, pronunciationCache, queryTest, css, mobileCss, server] = await Promise.all([
    readFile('src/ui/index.html', 'utf8'),
    readFile('src/ui/app.js', 'utf8'),
    readFile('src/ui/search-state.mjs', 'utf8'),
    readFile('src/ui/query-pronunciation-client.mjs', 'utf8'),
    readFile('src/ui/query-pronunciation-cache.mjs', 'utf8'),
    readFile('src/query-pronunciation-test/app.js', 'utf8'),
    readFile('src/ui/styles.css', 'utf8'),
    readFile('src/ui/mobile.css', 'utf8'),
    readFile('src/server.mjs', 'utf8'),
  ]);

  assert.match(html, /<html lang="en">/);
  assert.match(html, /Instrument\+Sans/);
  assert.match(html, /IBM\+Plex\+Mono/);
  assert.match(html, /Material\+Symbols\+Outlined/);
  assert.match(html, /id="languageRouteFilter"/);
  assert.match(html, /id="scopeFilter"/);
  assert.match(html, /id="typeFilter"/);
  assert.match(html, /id="syllableFilter"/);
  assert.match(html, /id="sortMode"/);
  assert.match(html, /id="variantMode"/);
  assert.match(html, /id="corpusMode"/);
  assert.match(html, /id="availabilityBar"/);
  assert.match(html, /id="resultsToolbar"[^>]*search-filter-results/);
  assert.match(html, /id="searchOptionsToggle"[^>]*class="search-core-toggle"/);
  assert.doesNotMatch(html, /id="searchOptionsToggle"[^>]*class="search-core-toggle"[^>]*hidden/);
  assert.match(html, /id="searchDbBadge"[^>]*class="search-db-badge"/);
  assert.match(html, /id="resultFiltersToggle"[^>]*class="hidden"/);
  assert.match(html, /id="searchOptionsPanel"/);
  assert.match(html, /id="resultFiltersPanel"/);
  assert.match(html, /id="searchStageAnchor"/);
  assert.match(html, /class="search search-core search-core-flat"/);
  assert.match(html, /class="search-filter-row search-filter-primary"/);
  assert.match(html, /class="search-filter-row search-filter-secondary"/);
  assert.match(html, /value="de:both"/);
  assert.match(html, /value="both:en"/);
  assert.match(html, /id="entityCategory"/);
  assert.match(html, /id="sourcesButton"/);
  assert.match(html, /id="sourcesDialog"/);
  assert.match(html, /id="sourcesList"/);
  assert.match(html, /data-ui-lang="de"/);
  assert.match(html, /data-ui-lang="en"/);
  assert.match(html, /data-view="list"/);
  assert.match(html, /data-view="compact"/);
  assert.match(html, /value="near1"/);
  assert.match(html, /value="near2"/);
  assert.match(html, /value="near3"/);
  assert.match(html, /<option value="1">1<\/option>/);
  assert.match(html, /<option value="2">2<\/option>/);
  assert.match(html, /<option value="3">3\+<\/option>/);
  assert.match(html, /value="syllables"/);
  assert.doesNotMatch(html, /href="\/phrases"/);

  assert.match(html, /id="generatedMode"[^>]*type="checkbox"[^>]*checked[^>]*disabled/);
  assert.match(app, /generatedOptIn:true,generatedOnly:false/);
  assert.match(html, /id="historicalMode"/);
  assert.match(html, /id="scrollSentinel"/);
  assert.doesNotMatch(html, /id="nextPage"|id="prevPage"|id="pageStatus"/);
  for (const type of [
    'multisyllabic_perfect',
    'perfect',
    'multisyllabic_slant',
    'family',
    'slant',
    'assonance',
    'consonance',
  ]) {
    assert.match(html, new RegExp(`value="${type}"`));
  }

  assert.match(app, /PRIMARY_RHYME_TYPES/);
  assert.match(app, /SOUND_RELATION_TYPES/);
  assert.match(app, /relationTypes/);
  assert.match(app, /rowTypes/);
  assert.match(app, /matchesType/);
  assert.match(app, /displayScore/);
  assert.match(app, /resultKind/);
  assert.match(app, /renderPhrasePanel/);
  assert.match(app, /\/api\/writer\?/);
  assert.match(app, /from '\.\/search-state\.mjs'/);
  assert.match(app, /captureSharedSearchState/);
  assert.match(app, /function applyLanguageRoute\(/);
  assert.match(app, /function applyCorpusMode\(/);
  assert.match(app, /function searchCardFitsStickyViewport\(/);
  assert.match(app, /!searchCardFitsStickyViewport\(\)/);
  assert.match(app, /const defaultSearchSectionsExpanded=false/);
  assert.match(app, /rhymelab\.searchOptionsExpanded\.v3/);
  assert.match(app, /toggleSearchSection\('searchOptions'\)/);
  assert.match(app, /function selectedRuntimeDbPreference\(/);
  assert.match(app, /view:\['list','compact'\]\.includes\(savedResultView\)\?savedResultView:'compact'/);
  assert.match(app, /function initializeRuntimeDbPreference\(/);
  assert.match(app, /payload\.databases\|\|\[\]/);
  assert.match(app, /available\.includes\(stored\)/);
  assert.match(app, /runtimeDbPreference=available\.includes\(stored\)/);
  assert.doesNotMatch(app, /\['master','lite','standard','full'\]/);
  assert.match(app, /params\.set\('runtime_db',requestedDb\)/);
  assert.match(app, /function updateRuntimeDbBadge\(/);
  assert.match(app, /document\.addEventListener\('pointerdown'/);
  assert.match(app, /target\.closest\('\.custom-select-popover'\)/);
  assert.match(app, /setSearchSectionExpanded\('searchOptions',false\)/);
  assert.match(app, /#syllableFilter[\s\S]*?void search\(state\.query\)/);
  assert.match(app, /searchStateToWriterParams\(searchState\)/);
  assert.match(app, /writeSearchStateToUrl/);
  assert.match(searchState, /SEARCH_STATE_SCHEMA='rhymelab-search-state-v1'/);
  assert.match(searchState, /export function createSearchState/);
  assert.match(searchState, /export function searchStateToWriterParams/);
  assert.match(searchState, /export function writeSearchStateToUrl/);
  assert.match(searchState, /type:state\.rhymeType/);
  assert.match(app, /resolveUnknownClientPronunciation/);
  assert.match(app, /resolveMissingQueryPronunciations/);
  assert.match(app, /query_ipa_\$\{language\}/);
  assert.match(app, /lookupSourceBackedWord/);
  assert.match(app, /readGeneratedPronunciationCache/);
  assert.match(app, /writeGeneratedPronunciationCache/);
  assert.match(app, /query_pronunciation_revision/);
  assert.match(app, /state\.pronunciationRevision/);
  assert.match(pronunciationCache, /indexedDB/);
  assert.match(pronunciationCache, /databaseRevision/);
  assert.match(pronunciationCache, /QUERY_PRONUNCIATION_CACHE_MAX_ENTRIES=10000/);
  assert.doesNotMatch(pronunciationCache, /localStorage/);
  assert.match(queryTest, /readGeneratedPronunciationCache/);
  assert.match(queryTest, /persistent cache hits/);
  assert.match(clientPronunciation, /client-total-query-pronunciation-v3/);
  assert.match(clientPronunciation, /client_source_reference_compound/);
  assert.match(clientPronunciation, /client_token_chain/);
  assert.match(clientPronunciation, /tokenizeClientPronunciationInput/);
  assert.match(clientPronunciation, /function germanOrthographicPostprocess\(/);
  assert.match(clientPronunciation, /\['g','k'\]/);
  assert.match(clientPronunciation, /\/ag\$\/u/);
  assert.doesNotMatch(app, /isSingleTokenQuery/);
  assert.doesNotMatch(queryTest, /if\(!\/\\s\/u\.test\(query\)\)/);
  assert.doesNotMatch(clientPronunciation, /node:child_process|spawnSync|process\.|RHYMELAB_ESPEAK|espeak/iu);
  assert.doesNotMatch(clientPronunciation, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(clientPronunciation, /findWriterRhymes|searchEnglishWriter|searchEntityRhymes|rankClientRhymeCandidates/);
  assert.match(queryTest, /resolveUnknownClientPronunciation/);
  assert.match(queryTest, /\/api\/writer\?/);
  assert.match(server, /query_ipa_\$\{language\}/);
  assert.match(server, /queryPronunciations:/);
  assert.match(server, /\/query-pronunciation-test/);
  assert.match(server, /query_pronunciation_revision/);
  assert.match(server, /databaseRevisionPart/);
  assert.match(server, /queryPronunciationRevision/);
  assert.match(server, /'\/assets\/search-state\.mjs'/);
  assert.match(server, /resultLanguage: url\.searchParams\.get\('result_language'\)/);
  assert.match(app, /\/api\/phrases\/detail/);
  assert.match(app, /const progressive=selectedType!=='all'/);
  assert.match(app, /progressive\?orderedAll\.slice\(0,state\.visibleCount\):orderedAll/);
  assert.match(app, /setupInfiniteScroll\(progressive&&hasMore\)/);
  assert.match(app, /data-more-section/);
  assert.match(app, /state\.sectionVisible/);
  assert.match(app, /counts\?\.searchPool/);
  assert.match(app, /maximumDistance=syllable==='same'\?0:syllable==='near1'\?1:syllable==='near2'\?2:syllable==='near3'\?3:null/);
  assert.match(app, /rowSyllableDistance\(a\)-rowSyllableDistance\(b\)/);
  assert.match(app, /rhymelab\.searchBasis/);
  assert.match(app, /rhymelab\.resultLanguage/);
  assert.match(app, /scopeCapability/);
  assert.match(app, /syncCapabilityControls/);
  assert.match(app, /renderAvailabilityBar/);
  assert.match(app, /scopeState\.partial/);
  assert.match(app, /rhymelab\.language/);
  assert.match(app, /rhymelab\.resultView/);
  assert.match(app, /syncUiLanguageControls/);
  assert.match(app, /syncViewControls/);
  assert.match(app, /function syncFloatingSearchState\(/);
  assert.match(app, /function syncSearchSectionControls\(/);
  assert.match(app, /function refreshSearchCompactThreshold\(/);
  assert.match(app, /searchAutoCompactThreshold/);
  assert.match(app, /stickyPanelOverride/);
  assert.match(app, /const STICKY_DETAIL_GAP=24/);
  assert.doesNotMatch(app, /focusedInside/);
  assert.match(app, /function enterSearchAutoCompact\(/);
  assert.match(app, /function exitSearchAutoCompact\(/);
  assert.match(app, /function updateFloatingSearchGeometry\(/);
  assert.match(app, /stage\.style\.height=\`\$\{reserveHeight\}px\`/);
  assert.match(app, /--search-fixed-left/);
  assert.match(app, /--search-fixed-width/);
  assert.match(app, /window\.scrollY>=threshold/);
  assert.match(app, /window\.addEventListener\('scroll'/);
  assert.match(app, /window\.addEventListener\('resize'/);
  assert.doesNotMatch(app, /window\.scrollY>96/);
  const appWithoutImports=app.replace(/^import .*?;\s*$/gm,'');
  assert.doesNotThrow(() => new Function(appWithoutImports));
  assert.doesNotMatch(app, /\$\$\$/);
  assert.match(app, /function assertInteractiveControlSurface\(/);
  assert.match(app, /function installInteractiveControls\(/);
  assert.match(app, /dataset\.rhymelabControls='bound'/);
  assert.match(app, /dataset\.rhymelabControls='failed'/);
  assert.match(app, /missingGroups=REQUIRED_CONTROL_GROUPS\.filter\(\(selector\)=>\$\$\(selector\)\.length===0\)/);
  assert.doesNotMatch(app, /missingGroups=REQUIRED_CONTROL_GROUPS\.filter\(\(selector\)=>\$\(selector\)\.length===0\)/);
  assert.doesNotMatch(app, /(?<!\$)\$\([^)]*\)\.(?:forEach|map|filter|some|every|find)\b/);
  assert.doesNotMatch(app, /for\s*\([^)]*\bof\s+(?<!\$)\$\([^)]*\)\s*\)/);
  assert.match(app, /englishUnavailable/);
  assert.match(app, /bothPartial/);
  assert.match(app, /interleaveByType/);

  assert.match(app, /LEXICAL_TAG_LABELS/);
  assert.match(app, /German Wiktionary via Kaikki\/Wiktextract/);
  assert.match(app, /English Wiktionary via Kaikki\/Wiktextract/);
  assert.match(app, /CMU Pronouncing Dictionary/);
  assert.match(app, /Leipzig Corpora Collection/);
  assert.match(app, /RhymeLab curated modern lexicon/);
  assert.match(app, /QRank/);
  assert.match(app, /Wikidata/);
  assert.match(app, /ENTITY_CATEGORY_LABELS/);
  assert.match(app, /'person\.rapper':\{en:'Rapper'/);
  assert.match(app, /'group\.music_group':\{en:'Music Group'/);
  assert.match(app, /'work\.film':\{en:'Movie'/);
  assert.match(app, /'work\.video_game':\{en:'Video Game'/);
  assert.match(app, /'fictional\.character':\{en:'Character'/);
  assert.match(app, /function entityDisplayLabel\(/);
  assert.match(app, /entityCategoryLabel\(category\)/);
  assert.doesNotMatch(app, /· \$\{t\('entity'\)\}/);
  assert.doesNotMatch(app, /layer-badge modern">\$\{t\('entity'\)\}/);
  assert.doesNotMatch(app, /<span class="meta-label">\$\{t\('source'\)\}/);
  assert.match(app, /UNIFIED RHYME WRITER/);
  assert.match(app, /VEREINHEITLICHTER REIM-WRITER/);
  assert.match(app, /Mehrsilbiger Vollreim/);
  assert.match(app, /Assonanz/);
  assert.match(app, /Konsonanz/);
  assert.match(app, /Klangbeziehungen/);
  assert.match(app, /relationStrong/);
  assert.match(app, /rhymeAnalysisHtml/);

  assert.match(css, /--multi-perfect:/);
  assert.match(css, /--assonance:/);
  assert.match(css, /--consonance:/);
  assert.match(css, /\.badge\.assonance/);
  assert.match(css, /\.badge\.consonance/);
  assert.match(css, /\.result-row:focus-visible/);
  assert.match(css, /\.channel-block/);
  assert.match(css, /\.phrase-row/);
  assert.match(css, /Search Filter Deck v2/);
  assert.match(css, /\.search-filter-row/);
  assert.match(css, /2026 adaptive search \+ readability pass/);
  assert.match(css, /\.search-filter-surface\.section-collapsed\{margin:0!important\}/);
  assert.match(css, /#searchOptionsToggle\.search-core-toggle/);
  assert.doesNotMatch(css, /#searchOptionsToggle\{display:none!important\}/);
  assert.match(css, /\.search-db-badge/);
  assert.match(css, /Filter hierarchy: labels bold, selected values calm/);
  assert.match(css, /\.search-filter-field>span\{[\s\S]*?font-weight:850/);
  assert.match(css, /\.search-filter-field \.custom-select-value\{[\s\S]*?font-weight:520/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.search-filter-field\.is-active/);
  assert.match(css, /\.search-core-flat/);
  assert.match(css, /never create a nested scrollbar in sticky search/);
  assert.match(css, /\.search-stage\.search-auto-compact \.search-card\{[\s\S]*?max-height:none;[\s\S]*?overflow:visible;/);
  assert.match(css, /background:var\(--surface-strong\)/);
  assert.doesNotMatch(css, /inset 0 -2px 0 #b58a2b/);
  assert.match(css, /appearance:none/);
  assert.match(css, /\*::-webkit-scrollbar/);
  assert.match(css, /scrollbar-color/);
  assert.match(css, /\.sources-dialog/);
  assert.match(css, /\.more-button/);
  assert.match(css, /\.availability-chip/);
  assert.match(css, /\.ui-language-switch/);
  assert.match(css, /\.view-switch/);
  assert.match(css, /\.results-compact \.result-items/);
  assert.match(css, /grid-template-columns:repeat\(auto-fill,minmax\(220px,1fr\)\)/);
  assert.match(css, /\.search-stage\{[\s\S]*?position:relative/);
  assert.match(css, /\.search-stage\.search-auto-compact \.search-card\{[\s\S]*?position:fixed/);
  assert.match(css, /top:var\(--search-sticky-top,68px\)/);
  assert.match(css, /left:var\(--search-fixed-left,0\)/);
  assert.match(css, /width:var\(--search-fixed-width,100%\)/);
  assert.match(css, /overscroll-behavior:contain/);
  assert.doesNotMatch(css, /\.search-stage\.search-auto-compact\{[\s\S]{0,120}?position:sticky/);
  assert.match(css, /\.inspector-column\{top:var\(--word-panel-sticky-top,152px\)\}/);
  assert.match(css, /grid-template-areas:"word word" "type score" "usage syllable"/);
  assert.match(css, /\.results-compact \.result-title-line strong\{[\s\S]*?white-space:normal/);
  assert.match(css, /\.results-compact \.result-word code\{[\s\S]*?white-space:normal/);

  assert.match(mobileCss, /@media\(max-width:720px\)/);
  assert.match(mobileCss, /min-height:46px/);
  assert.match(mobileCss, /\.result-row \.type-col/);
  assert.match(mobileCss, /\.results-compact \.result-items/);
  assert.match(mobileCss, /\.ui-language-switch/);
  assert.match(mobileCss, /\.search-stage\.search-auto-compact\{top:var\(--search-sticky-top,60px\)\}/);
  assert.match(mobileCss, /height:64px!important/);
  assert.match(mobileCss, /min-height:62px!important/);
  assert.match(mobileCss, /\.results-compact \.result-items\{grid-template-columns:1fr!important\}/);
});


test('standalone Search filter deck hides every native select behind the shared custom listbox primitive',async()=>{
  const [html,app,css,primitive]=await Promise.all([
    readFile('src/ui/index.html','utf8'),
    readFile('src/ui/app.js','utf8'),
    readFile('src/ui/styles.css','utf8'),
    readFile('src/ui/custom-select.mjs','utf8'),
  ]);
  for(const id of ['languageRouteFilter','scopeFilter','typeFilter','syllableFilter','sortMode','variantMode','corpusMode','entityCategory']){
    assert.match(html,new RegExp('<select id="'+id+'"[^>]*class="[^"]*native-select-backing','u'));
  }
  assert.match(app,/installFilterSelectControls\(\)/u);
  assert.match(app,/syncEnhancedSelects\(filterSelectControls\)/u);
  assert.match(css,/\.native-select-backing\{display:none!important\}/u);
  assert.match(css,/\.custom-select-popover/u);
  assert.match(primitive,/role','combobox/u);
  assert.match(primitive,/aria-activedescendant/u);
  assert.match(primitive,/pointerdown/u);
  assert.match(primitive,/key==='Escape'/u);
  assert.match(primitive,/key==='Enter'/u);
  assert.match(primitive,/MutationObserver/u);
});
