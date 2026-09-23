import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Studio V2 production surface is present with its core visual/interaction contract',async()=>{
  const [html,css,app,server]=await Promise.all([
    readFile('src/studio/index.html','utf8'),
    readFile('src/studio/styles.css','utf8'),
    readFile('src/studio/app.js','utf8'),
    readFile('src/server.mjs','utf8'),
  ]);

  assert.match(html,/RhymeLab Studio V2/u);
  assert.match(html,/href=["']\/studio\/styles\.css["']/u);
  assert.match(html,/src=["']\/studio\/app\.js["']/u);
  assert.match(html,/id=["']runtimeStatus["']/u);
  assert.match(html,/Live Writer · lokale Datenbank/u);
  assert.match(html,/type=["']module["'][^>]*src=["']\/studio\/app\.js["']/u);
  assert.match(app,/from '\.\/custom-select\.mjs'/u);
  assert.match(server,/['"]\/studio\/custom-select\.mjs['"]/u);
  assert.match(server,/['"]\/ui\/custom-select\.mjs['"]/u);
  assert.match(server,/['"]\/assets\/custom-select\.mjs['"]/u);
  assert.match(html,/STUDIO V2/u);
  assert.doesNotMatch(html,/STUDIO 02 · DEMO/u);
  assert.match(html,/data-dock=["']settings["']>Einstellungen<\/button>/u);
  assert.doesNotMatch(html,/Design 02/u);
  assert.doesNotMatch(html,/id=["']internalDbLab["']/u);
  assert.doesNotMatch(html,/INTERNAL_DB_LAB_(?:START|END)/u);
  assert.match(app,/let settingsTab='general'/u);
  assert.match(app,/function settingsTabButton\(/u);
  assert.match(app,/function settingsRuntimeDbBody\(/u);
  assert.match(app,/function bindRuntimeDatabaseSettings\(/u);
  const settingsSurface=app.slice(app.indexOf('function settingsCopy()'),app.indexOf('function readThemeDraft()'));
  assert.match(settingsSurface,/Allgemein/u);
  assert.match(settingsSurface,/Design/u);
  assert.match(settingsSurface,/Datenbank/u);
  assert.match(settingsSurface,/Daten & Backup/u);
  assert.match(settingsSurface,/\{id:'lite'/u);
  assert.match(settingsSurface,/\{id:'standard'/u);
  assert.match(settingsSurface,/\{id:'full'/u);
  assert.doesNotMatch(settingsSurface,/\{id:'master'/u);
  assert.doesNotMatch(settingsSurface,/Diagnostics|Acceptance|Benchmark|Bench current|Metrics/u);
  assert.match(css,/Studio Settings 2026/u);
  assert.match(css,/\.settings-layout/u);
  assert.match(css,/\.settings-nav-item/u);
  assert.match(css,/\.runtime-db-grid/u);
  assert.match(css,/\.runtime-db-choice/u);

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
  assert.match(css,/\.startup-failure/u);
  assert.match(css,/\.startup-failure-actions/u);
  assert.match(css,/Studio live Writer states/u);
  assert.match(css,/\.writer-loading:after/u);
  assert.match(css,/Studio production detail parity/u);
  assert.match(css,/\.detail-fact-grid/u);
  assert.match(css,/Search Filter Deck v2/u);
  assert.match(css,/\.filter-deck-row\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/u);
  assert.match(css,/\.filter-field\.is-active/u);
  assert.match(css,/\.custom-select-trigger/u);
  assert.match(css,/\.custom-select-popover/u);
  assert.match(css,/\.native-select-backing\{display:none!important\}/u);

  assert.match(html,/class="splitter"/u);
  assert.match(html,/class="detail-dock hidden"/u);
  assert.match(html,/class="editor-dock hidden"/u);
  assert.match(html,/class="mobile-nav"/u);
  assert.match(html,/data-density="compact"/u);
  assert.match(html,/data-density="tiles"/u);
  assert.match(html,/id=["']redoBtn["']/u);
  assert.match(html,/data-dock=["']bar["']/u);
  assert.match(html,/data-dock=["']navigator["']/u);
  assert.match(html,/Bar Navigator/u);
  assert.match(html,/Bar Inspector/u);
  for(const id of ['directLanguageRoute','directScope','directRhymeType','directSyllables','directSort','directVariants','directCorpus','directEntityCategories','directHideUsed']){
    assert.match(html,new RegExp(`id=["']${id}["']`,'u'));
  }
  for(const type of ['all','multisyllabic_perfect','perfect','multisyllabic_slant','family','slant','assonance','consonance']){
    assert.match(html,new RegExp(`<option value=["']${type}["']`,'u'));
  }
  assert.doesNotMatch(html,/id=["']advancedFiltersToggle["']/u);
  assert.doesNotMatch(html,/id=["']advancedFilters["']/u);
  assert.doesNotMatch(html,/id=["']advancedPreset["']/u);
  assert.doesNotMatch(html,/id=["']advancedRhymeType["']/u);
  assert.match(html,/id=["']runtimeInline["']/u);
  assert.match(app,/dataset\.studioVersion='2'/u);
  assert.match(app,/function renderStartupFailure\(/u);
  assert.match(app,/STUDIO_PREFERENCES_KEY/u);
  assert.match(app,/data-startup-action="reset-ui"/u);
  assert.match(app,/href="\/legacy"/u);
  assert.match(html,/id=["']themeQuick["']/u);
  assert.match(html,/id=["']themeQuickMenu["']/u);
  assert.match(html,/id=["']themeMenuBtn["']/u);
  assert.match(html,/id=["']uiLanguageBtn["']/u);
  assert.match(html,/id=["']deviceGuideBar["']/u);
  assert.match(html,/id=["']deviceGuidePass["']/u);
  assert.match(html,/id=["']deviceGuideFail["']/u);
  assert.match(html,/id=["']deviceGuideBack["']/u);
  assert.match(app,/from '\.\/i18n\.mjs'/u);
  assert.match(app,/function setStudioUiLanguage\(/u);
  assert.match(app,/function studioCommandRegistry\(/u);
  assert.match(app,/function renderCommandPalette\(/u);
  assert.match(app,/function executeStudioCommand\(/u);
  assert.match(app,/rankStudioCommands/u);
  assert.match(app,/commandShortcutText/u);
  assert.match(app,/function toggleStudioUiLanguage\(/u);
  assert.match(app,/createStudioDomLocalizer/u);
  const i18n=await readFile('src/studio/i18n.mjs','utf8');
  assert.match(i18n,/#songTitle/u);
  assert.match(i18n,/\.project-list/u);
  assert.match(i18n,/#lyrics/u);
  assert.match(app,/id="uiLanguageSelect"/u);
  assert.match(app,/uiLanguageSelect/u);
  assert.match(css,/\.theme-quick:hover \.theme-quick-menu/u);
  assert.match(css,/\.theme-quick-menu::before/u);
  assert.match(css,/#themeMenuBtn\[aria-expanded="true"\] \+ \.theme-quick-menu/u);
  assert.match(css,/\.theme-builder-grid/u);
  assert.match(css,/\.language-quick/u);
  assert.match(css,/Studio command palette/u);
  assert.match(css,/\.command-results/u);
  assert.match(css,/\.command-group/u);
  assert.match(app,/customThemes/u);
  assert.match(app,/themeSlots/u);
  assert.match(app,/Light-Style ersetzen/u);
  assert.match(app,/Dark-Style ersetzen/u);
  assert.match(app,/function saveThemeDraft\(/u);
  assert.match(app,/function renderThemeQuickMenu\(/u);
  assert.match(app,/function setThemeQuickOpen\(/u);
  assert.match(app,/function scheduleThemeQuickClose\(/u);
  assert.match(app,/open&&render&&!wasOpen/u);
  assert.match(app,/event\.target!==button&&event\.target!==menuButton/u);
  assert.match(app,/button\.onclick=function\(event\)/u);
  assert.match(app,/button\.onclick=function\(event\)\{[\s\S]*?toggleTheme\(\);[\s\S]*?setThemeQuickOpen\(false,\{render:false\}\)/u);
  assert.match(app,/menuButton\.onclick=function\(event\)\{[\s\S]*?setThemeQuickOpen\(!quick\.classList\.contains\('open'\)\)/u);
  assert.match(app,/applyThemeChoice\(choice\)/u);
  assert.match(app,/function previewThemeDraft\(/u);
  assert.match(app,/compositionstart/u);
  assert.match(app,/compositionend/u);
  assert.match(app,/addEventListener\('paste'/u);
  assert.match(app,/validateSelectionProof\(song\(\),selectionProof\)/u);
  assert.match(app,/performUndo/u);
  assert.match(app,/performRedo/u);
  assert.match(app,/createTypingUndoCoalescer/u);
  assert.match(app,/typingUndo\.shouldCheckpoint/u);
  assert.match(app,/coalesced:true/u);
  assert.match(app,/typingUndo\.noteBoundary/u);
  assert.match(app,/data-perform-feel/u);
  assert.match(app,/data-perform-grid/u);
  assert.match(app,/data-perform-scale/u);
  assert.match(app,/data-perform-step/u);
  assert.match(app,/performanceNeedsReview/u);
  assert.match(app,/function renderBarNavigatorDock\(/u);
  assert.match(app,/function addStudioBarAfter\(/u);
  assert.match(app,/function duplicateStudioBar\(/u);
  assert.match(app,/function deleteStudioBar\(/u);
  assert.match(app,/duplicateEditorBar/u);
  assert.match(app,/insertEditorBar/u);
  assert.match(app,/data-bar-duplicate/u);
  assert.match(app,/data-bar-delete/u);
  assert.match(app,/function moveStudioBar\(/u);
  assert.match(app,/function jumpToStudioBar\(/u);
  assert.match(app,/moveEditorBar/u);
  assert.match(app,/application\/x-rhymelab-bar/u);
  assert.match(app,/Alt\+B/u);
  assert.match(app,/function renderBarInspectorDock\(/u);
  assert.match(app,/data-bar-inspect/u);
  assert.match(app,/performancePocketMetrics/u);
  assert.match(app,/performancePreviousBarPlacements/u);
  assert.match(app,/performanceSyllablesPerSecond/u);
  assert.match(app,/loadBarAnalysis/u);
  assert.match(app,/openPerformFromBar/u);
  assert.match(app,/movePerformanceCue/u);
  assert.match(app,/autoMapPerformanceBar/u);
  assert.match(app,/function ensureActiveBarVisible\(/u);
  assert.match(app,/function bindMobileViewport\(/u);
  assert.match(app,/mobileScrollDeltaForRect/u);
  assert.match(app,/installMobileViewportController/u);
  assert.match(app,/Speichert in IndexedDB/u);
  assert.match(app,/IndexedDB gespeichert/u);
  assert.match(app,/documentSaveGeneration/u);
  assert.match(app,/documentSaveChain/u);
  assert.match(app,/function cloneStudioStateForPersistence\(/u);
  assert.match(app,/function flushStudioPersistence\(/u);
  assert.match(app,/flushStudioPersistence\('visibility_hidden'\)/u);
  assert.match(app,/flushStudioPersistence\('pagehide'\)/u);
  assert.match(app,/function refreshSongAnalysis\(/u);
  assert.match(app,/kanonischen Writer-Runtime-Pfad/u);
  assert.match(app,/analysisData\.lineRelations/u);
  assert.match(app,/data-analysis-bar/u);
  assert.match(app,/Word Laboratory/u);
  assert.match(app,/Relations inside Verse/u);
  assert.match(app,/data-analysis-relation-mode/u);
  assert.match(app,/data-analysis-language/u);
  assert.match(app,/data-analysis-anchor/u);
  assert.match(app,/analysisData\.wordDetails/u);
  assert.match(app,/analysisData\.uniqueWordDetails/u);
  assert.match(app,/analysisData\.pairs/u);
  assert.match(app,/analysisChainToggle/u);
  assert.match(app,/analysisChainVisible/u);
  assert.match(app,/Stress Fingerprint/u);
  assert.match(app,/rhyme-chain/u);
  assert.match(app,/analysis-stress-strip/u);
  assert.match(app,/function restoreStudioRevision\(/u);
  assert.match(app,/snapshot=editorSnapshot\(s\)/u);
  assert.match(app,/restoreEditorSnapshot\(current,entry\.snapshot\)/u);
  assert.match(app,/initializeDocumentStore/u);
  assert.match(app,/shadowLegacyStudioStateToStore/u);
  assert.match(app,/DocumentStore/u);
  assert.match(app,/documentStoreAuthority/u);
  assert.match(app,/studioStateFromDocumentSnapshot/u);
  assert.match(app,/writeStudioPreferences/u);
  assert.match(app,/function createRecoveryPoint\(/u);
  assert.match(app,/function restoreRecoveryPoint\(/u);
  assert.match(app,/function renderRecoveryPanel\(/u);
  assert.match(app,/function exportPortableStudioBackup\(/u);
  assert.match(app,/function applyPortableStudioBackup\(/u);
  assert.match(app,/function confirmPortableStudioImport\(/u);
  assert.match(app,/createPortableStudioBackup/u);
  assert.match(app,/parsePortableStudioBackup/u);
  assert.match(app,/function collectCurrentStudioDiagnostics\(/u);
  assert.match(app,/from '\.\/device-acceptance\.mjs'/u);
  assert.match(app,/function currentDeviceAcceptanceEnvironment\(/u);
  assert.match(app,/function renderDeviceAcceptancePanel\(/u);
  assert.match(app,/function launchDeviceAcceptanceGuide\(/u);
  assert.match(app,/function renderActiveDeviceGuide\(/u);
  assert.match(app,/function completeActiveDeviceGuide\(/u);
  assert.match(app,/function returnToDeviceAcceptanceCenter\(/u);
  assert.match(app,/activeDeviceGateGuide/u);
  assert.match(app,/data-device-gate-card/u);
  assert.match(app,/studioDeviceGateEnvironmentStatus/u);
  assert.match(app,/data-device-gate-guide/u);
  assert.match(app,/audioSupported:Boolean\(window\.AudioContext\|\|window\.webkitAudioContext\)/u);
  assert.match(app,/visualViewportSupported:Boolean\(window\.visualViewport\)/u);
  assert.match(app,/function exportStudioDeviceAcceptance\(/u);
  assert.match(app,/function importStudioDeviceAcceptanceFile\(/u);
  assert.match(app,/mergeStudioDeviceAcceptanceReports/u);
  assert.match(app,/Teilreport exportieren/u);
  assert.match(app,/STUDIO_DEVICE_GATES/u);
  assert.match(app,/DEVICE_ACCEPTANCE_STORAGE_KEY/u);
  assert.match(app,/function renderDiagnosticsPanel\(/u);
  assert.match(app,/function exportStudioDiagnostics\(/u);
  assert.match(app,/collectStudioEnvironmentDiagnostics/u);
  assert.match(app,/runStudioDomAcceptance/u);
  assert.match(app,/studioParitySummary/u);
  assert.match(app,/studioParityGroups/u);
  assert.match(app,/function parityManifestMarkup\(/u);
  assert.match(app,/domAcceptance/u);
  assert.match(app,/combinedSummary/u);
  assert.match(app,/releaseReadiness/u);
  assert.match(app,/deviceAcceptance:device/u);
  assert.match(app,/CUTOVER READINESS/u);
  assert.match(app,/studio:v2:live/u);
  assert.match(app,/IndexedDB · autoritativ/u);
  assert.match(app,/function renderLibrary\(/u);
  assert.match(app,/function createLibraryFolder\(/u);
  assert.match(app,/function createLibrarySubfolder\(/u);
  assert.match(app,/function renameLibraryFolder\(/u);
  assert.match(app,/function reorderLibraryFolder\(/u);
  assert.match(app,/function folderContains\(/u);
  assert.match(app,/function expandFolderPaths\(/u);
  assert.match(app,/data-folder-subfolder/u);
  assert.match(app,/ORDNERSTRUKTUR/u);
  assert.match(app,/function deleteLibraryFolder\(/u);
  assert.match(app,/function moveLibrarySong\(/u);
  assert.match(app,/function moveLibrarySongToFolder\(/u);
  assert.match(app,/data-library-song-drag/u);
  assert.match(app,/data-folder-drop/u);
  assert.match(app,/application\/x-rhymelab-song/u);
  assert.match(app,/function permanentlyDeleteLibrarySong\(/u);
  assert.match(app,/id="librarySearch"/u);
  assert.match(app,/id="librarySort"/u);
  assert.match(css,/Studio library parity/u);
  assert.match(css,/\.library-shell/u);
  assert.match(css,/\.library-folder-row/u);
  assert.match(css,/\.library-folder-label/u);
  assert.match(css,/\.library-folder-row\.is-drop-target/u);
  assert.match(css,/\.songcard\.is-dragging/u);
  assert.match(css,/--folder-depth/u);
  assert.match(css,/\.songcard-actions/u);
  assert.match(css,/\.result-badges/u);
  assert.match(css,/\.runtime-inline/u);
  assert.match(css,/\.density-compact \.result-meta,\.density-compact \.result-badges\{display:none\}/u);
  assert.match(css,/Studio authoritative persistence \+ Perform parity/u);
  assert.match(css,/\.recovery-list/u);
  assert.match(css,/\.recovery-head-actions/u);
  assert.match(css,/Studio diagnostics/u);
  assert.match(css,/\.diagnostics-grid/u);
  assert.match(css,/\.diagnostic-check/u);
  assert.match(css,/\.diagnostics-section-title/u);
  assert.match(css,/\.cutover-readiness/u);
  assert.match(css,/\.cutover-readiness\.is-ready/u);
  assert.match(css,/Studio real-device acceptance/u);
  assert.match(css,/\.device-acceptance-summary/u);
  assert.match(css,/\.device-gate-list/u);
  assert.match(css,/\.device-gate/u);
  assert.match(css,/\.device-gate-evidence/u);
  assert.match(css,/Studio guided acceptance overlay/u);
  assert.match(css,/\.device-guide-bar/u);
  assert.match(css,/#deviceGuidePass/u);
  assert.match(css,/\.parity-summary/u);
  assert.match(css,/\.parity-group-grid/u);
  assert.match(css,/\.perform-transport/u);
  assert.match(css,/\.perform-review/u);
  assert.match(css,/\.perform-sequencer/u);
  assert.match(css,/Studio Bar Navigator/u);
  assert.match(css,/\.bar-navigator-row/u);
  assert.match(css,/\.bar-navigator-row\.is-drop-target/u);
  assert.match(css,/Studio Bar Inspector/u);
  assert.match(css,/\.bar-inspector-grid/u);
  assert.match(css,/\.bar-inspector-canonical/u);
  assert.match(css,/\.bar-flow-row/u);
  assert.match(css,/Studio canonical song analysis/u);
  assert.match(css,/\.analysis-lines/u);
  assert.match(css,/\.analysis-scheme-letter/u);
  assert.match(css,/\.analysis-density-list/u);
  assert.match(css,/\.analysis-pairs/u);
  assert.match(css,/\.analysis-pair/u);
  assert.match(css,/\.analysis-word-grid/u);
  assert.match(css,/\.analysis-word-card/u);
  assert.match(css,/\.analysis-language-toggle/u);
  assert.match(css,/\.rhyme-chain/u);
  assert.match(css,/\.rhyme-chain-group/u);
  assert.match(css,/\.analysis-stress-workbench/u);
  assert.match(css,/\.analysis-stress-strip/u);
  assert.match(css,/Studio mobile acceptance engineering/u);
  assert.match(css,/--visual-viewport-height/u);
  assert.match(css,/html\[data-mobile-keyboard="true"\] \.mobile-nav\{display:none!important\}/u);
  assert.match(css,/\.editor-dock-open \.editor-scroll\{overflow:hidden/u);
  assert.match(css,/\.topbar \.icon\{width:44px;height:44px;min-height:44px/u);
});

test('Studio live default route leaves legacy Search and RhymePad routes in place',async()=>{
  const server=await readFile('src/server.mjs','utf8');

  assert.match(server,/const studioUiDir = resolve\('src\/studio'\)/u);
  assert.match(server,/const studioHtml=readFileSync\(resolve\(studioUiDir,'index\.html'\)\)/u);
  assert.match(server,/internalDbSwitcherEnabled/u);
  assert.match(server,/'\/studio': \{ type: 'text\/html; charset=utf-8', body: studioHtml \}/u);
  assert.match(server,/'\/studio\/': \{ type: 'text\/html; charset=utf-8', body: studioHtml \}/u);
  assert.match(server,/'\/studio\/styles\.css': \{ type: 'text\/css; charset=utf-8'/u);
  assert.match(server,/'\/studio\/app\.js': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/studio-core\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/search-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/search-filters\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/search-state\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/ui\/search-state\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/document-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/document-model\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/document-store\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/editor-session\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/performance-session\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/mobile-viewport\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/capability-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/detail-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/analysis-adapter\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/backup-portability\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/diagnostics\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/internal-db-lab\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/internal-db-benchmark\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/i18n\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/dom-acceptance\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/command-palette\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/device-acceptance\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/studioDefaultRoute\?studioHtml:writerHtml/u);
  assert.match(server,/'\/legacy': \{ type: 'text\/html; charset=utf-8', body: writerHtml \}/u);
  assert.match(server,/'\/pad-legacy': \{ type: 'text\/html; charset=utf-8', body: padHtml \}/u);
  assert.match(server,/'\/api\/studio\/route-mode'/u);
  assert.match(server,/'\/studio\/edit-history\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/parity-manifest\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/query-pronunciation-client\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/'\/studio\/query-pronunciation-cache\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);

  assert.match(server,/'\/assets\/search-state\.mjs': \{ type: 'text\/javascript; charset=utf-8'/u);
  assert.match(server,/studioDefaultRoute\?studioHtml:writerHtml/u);
  assert.match(server,/'\/pad': \{ type: 'text\/html; charset=utf-8', body: padHtml \}/u);
  assert.match(server,/Studio V2:/u);
  assert.match(server,/'\/api\/analysis\/rhyme-scheme'/u);
  assert.match(server,/entity_categories/u);
  assert.match(server,/entityCategories/u);
  assert.match(server,/analyzeSongEndRhymes/u);
  assert.match(server,/compactStudioWriterPayload/u);
  assert.match(server,/studioTransport=url\.searchParams\.get\('studio'\)==='1'/u);
  assert.match(server,/x-rhymelab-json-serialize-ms/u);
  assert.match(server,/x-rhymelab-response-bytes/u);
});

test('Studio shared SearchState re-export resolves to a served browser URL',async()=>{
  const [studioSearchState,server]=await Promise.all([
    readFile('src/studio/search-state.mjs','utf8'),
    readFile('src/server.mjs','utf8'),
  ]);

  assert.match(studioSearchState,/export \* from '\.\.\/ui\/search-state\.mjs';/u);
  const resolved=new URL(
    '../ui/search-state.mjs',
    'http://127.0.0.1:3030/studio/search-state.mjs',
  );
  assert.equal(resolved.pathname,'/ui/search-state.mjs');
  assert.match(
    server,
    /'\/ui\/search-state\.mjs': \{ type: 'text\/javascript; charset=utf-8', body: readFileSync\(resolve\(uiDir, 'search-state\.mjs'\)\) \}/u,
  );
});

test('Studio live migration contract keeps fallback routes through acceptance',async()=>{
  const parity=await readFile('docs/UI_REDESIGN_PARITY.md','utf8');
  const migration=await readFile('docs/STUDIO_V2_MIGRATION_PLAN.md','utf8');

  assert.match(parity,/Do not remove the fallback routes until/u);
  assert.match(parity,/Continue the deliberate old-vs-new audit/u);
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
  assert.match(migration,/library search \+ sort\s+DONE/u);
  assert.match(migration,/folder create\/delete\/move\s+DONE/u);
  assert.match(migration,/trash \+ restore \+ permanent delete\s+DONE/u);
  assert.match(migration,/stable revision snapshots \/ restore\s+DONE/u);
  assert.match(migration,/authoritative DocumentStore cutover\s+DONE/u);
  assert.match(migration,/full Perform parity\s+DONE/u);
  assert.match(parity,/\| UI language EN \|[^\n]*\| READY(?: ·[^\n]*)? \|/u);
});


test('Studio orchestrator is split behind maintainable module boundaries',async()=>{
  const [app,core,controls,search,filters,sharedSearchState,documents,documentModel,documentStore,editorSession,performanceSession,analysisAdapter,capabilities,details,pronunciationClient,pronunciationCache]=await Promise.all([
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
    readFile('src/studio/performance-session.mjs','utf8'),
    readFile('src/studio/analysis-adapter.mjs','utf8'),
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
  assert.match(app,/function syncFilterDeckControls\(/u);
  assert.match(app,/function applyLanguageRoute\(/u);
  assert.match(app,/function applyCorpusMode\(/u);
  assert.match(app,/function filterUnusedWriterRows\(/u);
  assert.match(app,/function resultBadges\(/u);
  assert.match(app,/function resultBadgeMarkup\(/u);
  assert.match(app,/function writerTimingText\(/u);
  assert.match(app,/averageLast100Ms/u);
  assert.match(app,/Usage #/u);
  assert.match(app,/writerRowAlreadyUsed/u);
  assert.match(app,/writeStudioState\(state\)/u);
  assert.match(app,/from '\.\/capability-adapter\.mjs'/u);
  assert.match(app,/from '\.\/detail-adapter\.mjs'/u);
  assert.match(app,/from '\.\/editor-session\.mjs'/u);
  assert.match(app,/from '\.\/performance-session\.mjs'/u);
  assert.match(app,/from '\.\/mobile-viewport\.mjs'/u);
  assert.match(app,/from '\.\/analysis-adapter\.mjs'/u);
  assert.match(app,/from '\.\/internal-db-benchmark\.mjs'/u);
  assert.match(app,/runStudioInternalDbBenchmark/u);
  assert.match(app,/internalDbBenchCurrent/u);
  assert.match(app,/internalDbBenchSuite/u);
  assert.match(app,/copyInternalDbLabMetrics/u);
  assert.match(app,/refreshInternalDbLabPayload\(\{silent:true\}\)/u);
  assert.match(app,/refreshStudioCapabilities\(\)/u);
  assert.match(app,/class="settings-status-grid"/u);
  assert.match(app,/id="settingsRuntimeDb"/u);

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
  assert.match(documentModel,/function snapshotBarsForLegacyRevision\(/u);
  assert.match(documentStore,/export function createStudioDocumentStore/u);
  assert.match(documentStore,/export async function migrateLegacyStudioStateToStore/u);
  assert.match(documentStore,/export async function shadowLegacyStudioStateToStore/u);
  assert.match(documentStore,/createObjectStore/u);
  assert.match(documentStore,/songOrder/u);
  assert.match(editorSession,/export function ensureEditorSong/u);
  assert.match(editorSession,/export function pasteEditorText/u);
  assert.match(editorSession,/export function createSelectionProof/u);
  assert.match(editorSession,/export function validateSelectionProof/u);
  assert.match(performanceSession,/export function ensurePerformanceSong/u);
  assert.match(performanceSession,/export function setPerformanceCue/u);
  assert.match(performanceSession,/export function movePerformanceCue/u);
  assert.match(performanceSession,/export function performanceNeedsReview/u);
  assert.match(performanceSession,/export function performanceStepDurationMs/u);
  assert.match(analysisAdapter,/export function createStudioAnalysisClient/u);
  assert.match(analysisAdapter,/export function studioAnalysisWords/u);
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
  assert.equal(relationOnly.get('type'),'assonance');

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


test('Studio two-row filter deck preserves the full Writer filter matrix',async()=>{
  const [html,app,filters]=await Promise.all([
    readFile('src/studio/index.html','utf8'),
    readFile('src/studio/app.js','utf8'),
    readFile('src/studio/search-filters.mjs','utf8'),
  ]);

  for(const id of [
    'directLanguageRoute','directScope','directRhymeType','directSyllables',
    'directSort','directVariants','directCorpus','directEntityCategories','directHideUsed',
  ]){
    assert.match(html,new RegExp(`id=["']${id}["']`));
  }
  assert.doesNotMatch(html,/advancedFiltersToggle|advancedRhymeType|advancedPreset/u);
  assert.match(app,/function applyLanguageRoute\(/u);
  assert.match(app,/function applyCorpusMode\(/u);
  assert.match(app,/function corpusModeValue\(/u);
  assert.match(app,/function setEntityCategories\(/u);
  assert.match(app,/directEntityCategories/u);
  assert.match(app,/enhanceSelect/u);
  assert.match(app,/#directRhymeType/u);
  assert.match(app,/rhymeType=e\.target\.value;[\s\S]*?refreshWriterResults\(\)/u);
  assert.match(app,/filterStudioWriterRows\(baseData\(\)/u);
  assert.match(app,/sortStudioWriterRows\(data\(\)/u);
  assert.match(filters,/sort==='closest'/u);
  assert.match(filters,/sort==='common'/u);
  assert.match(filters,/mode==='near2'/u);
  assert.match(filters,/mode==='near3'/u);
  assert.match(app,/writerCapabilities=result\.capabilities/u);
  assert.match(app,/entityCategories=Array\.isArray\(sharedSearchState\.entityCategories\)/u);
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
  assert.equal(params.get('type'),'assonance');
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


test('Studio startup static controls stay synchronized with the golden-master DOM',async()=>{
  const [html,app]=await Promise.all([
    readFile('src/studio/index.html','utf8'),
    readFile('src/studio/app.js','utf8'),
  ]);
  const ids=new Set([...html.matchAll(/\bid=["']([^"']+)["']/gu)].map((match)=>match[1]));
  const required=[...app.matchAll(/bindClick\('([^']+)'[^\n]*\);/gu)]
    .filter((match)=>!match[0].includes('optional:true'))
    .map((match)=>match[1]);
  assert.ok(ids.has('clearDocBtn'),'clear document control must be present in Studio HTML');
  assert.match(app,/bindClick\('clearDocBtn',clearCurrentDocument,\{optional:true\}\)/u);
  assert.deepEqual(required.filter((id)=>!ids.has(id)),[]);
});


test('Studio filter deck exposes only custom-visible selects and keeps native controls hidden as backing state',async()=>{
  const [html,app,css]=await Promise.all([
    readFile('src/studio/index.html','utf8'),
    readFile('src/studio/app.js','utf8'),
    readFile('src/studio/styles.css','utf8'),
  ]);
  for(const id of ['directLanguageRoute','directScope','directRhymeType','directSyllables','directSort','directVariants','directCorpus','directEntityCategories']){
    assert.match(html,new RegExp('<select id="'+id+'"[^>]*class="[^"]*native-select-backing','u'));
  }
  assert.doesNotMatch(html,/filter-multi-dropdown|<details[^>]+directEntityCategory/u);
  assert.match(app,/installFilterSelectControls\(\)/u);
  assert.match(app,/syncEnhancedSelects\(filterSelectControls\)/u);
  assert.match(css,/\.custom-select-option\[aria-selected="true"\]/u);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/u);
});
