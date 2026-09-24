export const STUDIO_PARITY_MANIFEST_VERSION=1;

const READY='ready';
const ADAPTED='adapted';
const DEVICE='device';

const item=(id,group,label,legacy,studio,evidence,status=READY,acceptance='source')=>Object.freeze({
  id,group,label,legacy,studio,status,acceptance,evidence:Object.freeze(evidence),
});

export const STUDIO_PARITY_MANIFEST=Object.freeze([
  item('search.shared-state','Search / Writer','Shared SearchState across Search and Studio','Search','Inspector',['src/ui/search-state.mjs::createSearchState']),
  item('search.query-basis','Search / Writer','DE / EN / DE+EN query pronunciation basis','Search + Pad','Filter deck',['src/studio/index.html::id="directLanguageRoute"']),
  item('search.result-language','Search / Writer','DE / EN / DE+EN result language','Search + Pad','Filter deck',['src/studio/index.html::id="directLanguageRoute"']),
  item('search.scope','Search / Writer','All / Words / Phrases / Entities scope','Search + Pad','Filter deck',['src/studio/index.html::id="directScope"']),
  item('search.rhyme-types','Search / Writer','Exact rhyme + sound-relation matrix','Search + Pad','Filter deck',['src/studio/index.html::id="directRhymeType"']),
  item('search.syllables','Search / Writer','Same / ±1 / ±2 / ±3 / exact syllable filters','Search','Direct filters',['packages/shared-core/src/search/search-filters.mjs::near3']),
  item('search.sorts','Search / Writer','Recommended / proximity / syllables / common / A-Z','Search','Direct filters',['packages/shared-core/src/search/search-filters.mjs::sortStudioWriterRows']),
  item('search.variants','Search / Writer','Preferred and all pronunciation variants','Search + Pad','Filter deck',['src/studio/index.html::id="directVariants"']),
  item('search.historical','Search / Writer','Historical / obsolete forms','Search','Corpus selector',['src/studio/app.js::applyCorpusMode']),
  item('search.generated','Search / Writer','Generated pronunciation opt-in','Search','Corpus selector',['src/studio/app.js::applyCorpusMode']),
  item('search.generated-only','Search / Writer','Generated-only result mode','Search','Corpus selector',['src/studio/app.js::applyCorpusMode']),
  item('search.entity-taxonomy','Search / Writer','Entity taxonomy from runtime capabilities','Search + Pad','Entity chips',['src/studio/app.js::availableEntityCategories']),
  item('search.entity-multi','Search / Writer','Entity multi-select OR retrieval','Search','Entity chips',['src/ui/search-state.mjs::entityCategories','src/entity-writer-runtime.mjs::requestedCategories']),
  item('search.hide-used','Search / Writer','Hide already used lyric candidates','Pad','Direct action',['src/studio/index.html::id="directHideUsed"']),
  item('search.presets','Search / Writer','Best / words / phrases / entities / rhyme presets','Pad','Direct scope + rhyme composition',['src/studio/index.html::id="directScope"','src/studio/index.html::id="directRhymeType"'],ADAPTED),
  item('search.autoscroll','Search / Writer','Opt-in auto-scroll with manual pause','Pad','Inspector',['src/studio/app.js::toggleAuto']),
  item('search.density','Search / Writer','List / compact / tile density','Search prototype','Result toolbar',['src/studio/app.js::setDensity']),
  item('search.paging','Search / Writer','Continuous result loading without manual paging controls','Search + Pad','Result scroller',['src/studio/app.js::queueInfiniteResultsFill','src/ui/app.js::setupInfiniteScroll'],ADAPTED),
  item('search.metadata','Search / Writer','Legacy metadata tags and badges','Search + Pad','Result rows',['src/studio/app.js::resultBadges']),
  item('search.detail','Search / Writer','Word / phrase / entity detail and provenance','Search','Detail dock',['packages/shared-core/src/services/detail-adapter.mjs::buildStudioDetailModel']),
  item('search.ipa','Search / Writer','IPA and pronunciation variants','Search','Detail dock',['src/studio/app.js::detail-pronunciation']),
  item('search.runtime','Search / Writer','Query runtime and rolling AVG100 telemetry','Search','Inspector + Diagnostics',['src/studio/app.js::writerTimingText']),
  item('search.states','Search / Writer','Loading / empty / unavailable / error states','Search + Pad','Results surface',['src/studio/app.js::writerStatus']),
  item('search.keyboard','Search / Writer','Keyboard result navigation and actions','Search','Inspector',['src/studio/app.js::moveResult']),

  item('editor.bars','Writing / Editor','Stable Bar-ID editor model','Pad','Composer',['packages/shared-core/src/editor/editor-session.mjs::barIdentity']),
  item('editor.geometry','Writing / Editor','Continuous document with tracked and free lines','Pad','Composer',['packages/shared-core/src/editor/editor-session.mjs::editorLineKind','src/studio/app.js::lyricsEditor']),
  item('editor.bracket-metadata','Writing / Editor','Inline [bracket] metadata is excluded from lyric tracking','Studio extension','Composer + Analysis',['packages/shared-core/src/editor/editor-session.mjs::editorTrackableText']),
  item('editor.anchor','Writing / Editor','Selection-follow and pinned rhyme anchor','Pad','Composer + Inspector',['src/studio/app.js::toggleFollow']),
  item('editor.selection-proof','Writing / Editor','Stale-selection protection by Bar revision','Pad','Composer',['packages/shared-core/src/editor/editor-session.mjs::validateSelectionProof']),
  item('editor.replace','Writing / Editor','Replace selected word or range','Pad','Result action',['src/studio/app.js::insertWord']),
  item('editor.split','Writing / Editor','Native Enter creates editable document lines','Pad','Composer',['src/studio/app.js::reconcileEditorDocumentText']),
  item('editor.merge','Writing / Editor','Native Backspace/Delete edit across line boundaries','Pad','Composer',['src/studio/app.js::lyricsEditor']),
  item('editor.paste','Writing / Editor','Native multiline paste updates the unified document','Pad','Composer',['packages/shared-core/src/editor/editor-session.mjs::reconcileEditorDocumentText']),
  item('editor.ime','Writing / Editor','IME transaction safety','Pad','Composer',['src/studio/app.js::compositionstart'],ADAPTED,DEVICE),
  item('editor.undo','Writing / Editor','Undo / redo with typing-burst coalescing','Pad','Composer',['packages/shared-core/src/editor/edit-history.mjs::createTypingUndoCoalescer']),
  item('editor.font','Writing / Editor','Font family and size controls','Pad','Quick tools + Settings',['src/studio/app.js::setFontSize']),
  item('editor.theme','Writing / Editor','Light / dark / custom semantic themes','Pad','Quickstyle + Settings',['src/studio/app.js::saveThemeDraft']),
  item('editor.clear','Writing / Editor','Safe clear with revision and recovery point','Pad','Document action',['src/studio/app.js::clearCurrentDocument']),
  item('editor.autosave','Writing / Editor','IndexedDB authoritative autosave','Pad','DocumentStore',['src/studio/app.js::syncDocumentShadow']),
  item('editor.revisions','Writing / Editor','Revision history and stable restore','Pad','Editor dock',['src/studio/app.js::restoreStudioRevision']),
  item('editor.navigator','Writing / Editor','Searchable Bar Navigator with stable reorder','Studio extension','Editor dock',['src/studio/app.js::renderBarNavigatorDock']),
  item('editor.bar-actions','Writing / Editor','Create / duplicate / delete Bar actions','Studio extension','Bar Navigator',['src/studio/app.js::duplicateStudioBar','packages/shared-core/src/editor/editor-session.mjs::duplicateEditorBar']),

  item('library.documents','Library','Create / open / search / sort / rename documents','Pad','My texts',['src/studio/app.js::renderLibrary']),
  item('library.folders','Library','Nested folder hierarchy','Pad','My texts',['src/studio/app.js::expandFolderPaths']),
  item('library.folder-actions','Library','Folder create / subfolder / rename / reorder / delete','Pad','My texts',['src/studio/app.js::renameLibraryFolder']),
  item('library.move','Library','Move documents between folders','Pad','Dialog + drag/drop',['src/studio/app.js::moveLibrarySongToFolder']),
  item('library.trash','Library','Trash / restore / permanent delete','Pad','My texts',['src/studio/app.js::permanentlyDeleteLibrarySong']),
  item('library.predelete-recovery','Library','Automatic recovery checkpoint before permanent delete','Studio extension','My texts',['src/studio/app.js::before_permanent_song_delete']),

  item('analysis.scheme','Analysis','Canonical end-rhyme scheme','Pad','Reime',['packages/shared-core/src/services/analysis-adapter.mjs::createStudioAnalysisClient']),
  item('analysis.all-rhymes','Analysis','Canonical all-word rhyme analysis by Bar, Section and document','Studio extension','Reime',['src/studio/app.js::renderAllRhymeSurface','packages/shared-core/src/services/analysis-adapter.mjs::analyzeAll']),
  item('analysis.relations','Analysis','Primary and soft relations inside verse','Pad','Reime',['src/studio/app.js::analysisRelationMode']),
  item('analysis.word-lab','Analysis','Word Laboratory IPA / stress','Pad','Reime',['src/studio/app.js::Word Laboratory']),
  item('analysis.stress','Analysis','Stress fingerprint','Pad','Reime',['src/studio/app.js::Stress Fingerprint']),
  item('analysis.chain','Analysis','Optional rhyme-chain visualization','Pad','Reime',['src/studio/app.js::analysisChainVisible']),
  item('analysis.languages','Analysis','DE / EN / Cross DE+EN controls','Pad','Reime',['src/studio/app.js::data-analysis-language']),
  item('analysis.bar-inspector','Analysis','Live Bar Inspector metrics','Pad','Editor dock',['src/studio/app.js::renderBarInspectorDock']),
  item('analysis.verse-totals','Analysis','Verse totals and duration estimate','Pad','Editor footer',['src/studio/app.js::durationSeconds'],ADAPTED),

  item('perform.cues','Perform','Hit / accent / pause / breath / hold / erase','Pad','Perform',['packages/shared-core/src/editor/performance-session.mjs::PERFORMANCE_CUE_TYPES']),
  item('perform.move','Perform','Cue move and drag with accessible alternative','Pad','Perform',['packages/shared-core/src/editor/performance-session.mjs::movePerformanceCue']),
  item('perform.pause-length','Perform','Pause length','Pad','Perform',['packages/shared-core/src/editor/performance-session.mjs::pauseLength']),
  item('perform.grid','Perform','8/16 grid, straight/triplet, half/double time','Pad','Perform',['packages/shared-core/src/editor/performance-session.mjs::tempoScale']),
  item('perform.automap','Perform','Auto-map and clear','Pad','Perform',['packages/shared-core/src/editor/performance-session.mjs::autoMapPerformanceBar'],ADAPTED),
  item('perform.stable-cues','Perform','Stable Bar-ID cue anchors and edit invalidation','Pad','Perform',['packages/shared-core/src/editor/performance-session.mjs::performanceNeedsReview']),
  item('perform.metronome','Perform','Variable-timing Web Audio metronome','Pad','Perform',['src/studio/app.js::AudioContext'],READY,DEVICE),

  item('appearance.quick-switch','Appearance / UX','One-click configured Light/Dark switch','Studio prototype','Topbar',['src/studio/app.js::toggleTheme']),
  item('appearance.quickstyles','Appearance / UX','Hover + explicit touch Quickstyles menu','Studio prototype','Topbar',['src/studio/app.js::setThemeQuickOpen']),
  item('appearance.language','Appearance / UX','Persistent DE / EN interface switch','Search','Topbar + Settings',['src/studio/i18n.mjs::createStudioDomLocalizer']),
  item('appearance.command-palette','Appearance / UX','Searchable ranked keyboard command palette','Studio extension','Global dialog',['src/studio/app.js::studioCommandRegistry']),
  item('appearance.motion','Appearance / UX','Restrained motion and reduced-motion support','Studio prototype','Global',['src/studio/styles.css::prefers-reduced-motion']),

  item('mobile.navigation','Mobile','Bottom navigation','Studio prototype','Mobile shell',['src/studio/index.html::mobile-nav'],READY,DEVICE),
  item('mobile.swap','Mobile','Single-surface editor/results swap','Studio prototype','Mobile shell',['src/studio/app.js::mobile-results'],READY,DEVICE),
  item('mobile.keyboard','Mobile','VisualViewport keyboard correction','Pad','Composer',['packages/platform-web/src/mobile-viewport.mjs::installMobileViewportController'],READY,DEVICE),
  item('mobile.touch','Mobile','Primary touch targets >=44 CSS px','Studio prototype','Mobile CSS',['src/studio/dom-acceptance.mjs::touch-targets'],READY,DEVICE),
  item('mobile.no-hover','Mobile','No hover-only primary action','Studio prototype','Quickstyles + Library',['src/studio/index.html::themeMenuBtn'],READY,DEVICE),

  item('system.backup','System / Recovery','Portable workspace backup import/export','Studio extension','Settings',['packages/shared-core/src/document/backup-portability.mjs::createPortableStudioBackup']),
  item('system.recovery','System / Recovery','Manual recovery points and verified restore','Studio extension','Settings',['src/studio/app.js::restoreRecoveryPoint']),
  item('system.persistence','System / Recovery','Serialized autosave queue and lifecycle flush','Studio extension','DocumentStore',['src/studio/app.js::flushStudioPersistence']),
  item('system.diagnostics','System / Recovery','Environment + DOM acceptance diagnostics','Studio extension','Settings',['src/studio/dom-acceptance.mjs::runStudioDomAcceptance']),
  item('system.startup-bindings','System / Recovery','Startup control binding guard','Studio extension','Startup',['src/studio/app.js::bindClick']),
  item('system.device-acceptance','System / Recovery','Seven-gate multi-device acceptance merge','Studio extension','Settings',['packages/platform-web/src/device-acceptance.mjs::mergeStudioDeviceAcceptanceReports']),
  item('system.cutover-gate','System / Recovery','Deterministic source + device cutover gate','Studio extension','Release tooling',['scripts/check-studio-v2-cutover.mjs::parity.source-evidence']),
  item('system.reversible-route','System / Recovery','Reversible React-default route with Studio V2 rollback alias','Studio extension','Server routes',["src/server.mjs::legacyStudio:'/studio-legacy'"]),
]);

export function studioParitySummary(manifest=STUDIO_PARITY_MANIFEST){
  const rows=Array.isArray(manifest)?manifest:[];
  const source=rows.filter((row)=>row.acceptance!=='device');
  const device=rows.filter((row)=>row.acceptance==='device');
  const mapped=rows.filter((row)=>row.status===READY||row.status===ADAPTED);
  return {
    total:rows.length,
    mapped:mapped.length,
    sourceTotal:source.length,
    sourceReady:source.filter((row)=>row.status===READY||row.status===ADAPTED).length,
    deviceTotal:device.length,
    devicePending:device.map((row)=>row.id),
    adapted:rows.filter((row)=>row.status===ADAPTED).map((row)=>row.id),
    groups:[...new Set(rows.map((row)=>row.group))],
  };
}

export function studioParityGroups(manifest=STUDIO_PARITY_MANIFEST){
  const result=[];
  const byGroup=new Map();
  for(const row of manifest){
    if(!byGroup.has(row.group)){
      const group={name:row.group,items:[]};
      byGroup.set(row.group,group);result.push(group);
    }
    byGroup.get(row.group).items.push(row);
  }
  return result;
}
