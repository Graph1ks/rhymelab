export const STUDIO_PARITY_MANIFEST_VERSION=1;

const READY='ready';
const ADAPTED='adapted';
const DEVICE='device';

const item=(id,group,label,legacy,studio,evidence,status=READY,acceptance='source')=>Object.freeze({
  id,group,label,legacy,studio,status,acceptance,evidence:Object.freeze(evidence),
});

export const STUDIO_PARITY_MANIFEST=Object.freeze([
  item('search.shared-state','Search / Writer','Shared SearchState across Search and Studio','Search','Inspector',['src/ui/search-state.mjs::createSearchState']),
  item('search.query-basis','Search / Writer','DE / EN / DE+EN query pronunciation basis','Search + Pad','Inspector',['src/studio/app.js::data-basis']),
  item('search.result-language','Search / Writer','DE / EN / DE+EN result language','Search + Pad','Inspector',['src/studio/app.js::data-result-lang']),
  item('search.scope','Search / Writer','All / Words / Phrases / Entities scope','Search + Pad','Inspector',['src/studio/app.js::data-scope']),
  item('search.rhyme-types','Search / Writer','Exact rhyme-class matrix','Search + Pad','Advanced filters',['src/studio/search-filters.mjs::STUDIO_RHYME_TYPE_LABELS']),
  item('search.syllables','Search / Writer','Same / ±1 / ±2 / ±3 / exact syllable filters','Search','Direct filters',['src/studio/search-filters.mjs::near3']),
  item('search.sorts','Search / Writer','Recommended / proximity / syllables / common / A-Z','Search','Direct filters',['src/studio/search-filters.mjs::sortStudioWriterRows']),
  item('search.variants','Search / Writer','Preferred and all pronunciation variants','Search + Pad','Advanced filters',['src/studio/app.js::advancedVariants']),
  item('search.historical','Search / Writer','Historical / obsolete forms','Search','Advanced filters',['src/studio/app.js::advancedHistorical']),
  item('search.generated','Search / Writer','Generated pronunciation opt-in','Search','Advanced filters',['src/studio/app.js::advancedGenerated']),
  item('search.generated-only','Search / Writer','Generated-only result mode','Search','Advanced filters',['src/studio/app.js::advancedGeneratedOnly']),
  item('search.entity-taxonomy','Search / Writer','Entity taxonomy from runtime capabilities','Search + Pad','Entity chips',['src/studio/app.js::availableEntityCategories']),
  item('search.entity-multi','Search / Writer','Entity multi-select OR retrieval','Search','Entity chips',['src/ui/search-state.mjs::entityCategories','src/entity-writer-runtime.mjs::requestedCategories']),
  item('search.hide-used','Search / Writer','Hide already used lyric candidates','Pad','Advanced toggle',['src/studio/app.js::filterUnusedWriterRows']),
  item('search.presets','Search / Writer','Best / words / phrases / entities / rhyme presets','Pad','Preset control',['src/studio/app.js::applySearchPreset']),
  item('search.autoscroll','Search / Writer','Opt-in auto-scroll with manual pause','Pad','Inspector',['src/studio/app.js::toggleAuto']),
  item('search.density','Search / Writer','List / compact / tile density','Search prototype','Result toolbar',['src/studio/app.js::setDensity']),
  item('search.paging','Search / Writer','Stable loaded set with explicit More reveal','Search + Pad','Result footer',['src/studio/app.js::moreBtn'],ADAPTED),
  item('search.metadata','Search / Writer','Legacy metadata tags and badges','Search + Pad','Result rows',['src/studio/app.js::resultBadges']),
  item('search.detail','Search / Writer','Word / phrase / entity detail and provenance','Search','Detail dock',['src/studio/detail-adapter.mjs::buildStudioDetailModel']),
  item('search.ipa','Search / Writer','IPA and pronunciation variants','Search','Detail dock',['src/studio/app.js::detail-pronunciation']),
  item('search.runtime','Search / Writer','Query runtime and rolling AVG100 telemetry','Search','Inspector + Diagnostics',['src/studio/app.js::writerTimingText']),
  item('search.states','Search / Writer','Loading / empty / unavailable / error states','Search + Pad','Results surface',['src/studio/app.js::writerStatus']),
  item('search.keyboard','Search / Writer','Keyboard result navigation and actions','Search','Inspector',['src/studio/app.js::moveResult']),

  item('editor.bars','Writing / Editor','Stable Bar-ID editor model','Pad','Composer',['src/studio/editor-session.mjs::barIdentity']),
  item('editor.geometry','Writing / Editor','One logical newline equals one Bar','Pad','Composer',['src/studio/editor-session.mjs::splitEditorBar']),
  item('editor.anchor','Writing / Editor','Selection-follow and pinned rhyme anchor','Pad','Composer + Inspector',['src/studio/app.js::toggleFollow']),
  item('editor.selection-proof','Writing / Editor','Stale-selection protection by Bar revision','Pad','Composer',['src/studio/editor-session.mjs::validateSelectionProof']),
  item('editor.replace','Writing / Editor','Replace selected word or range','Pad','Result action',['src/studio/app.js::insertWord']),
  item('editor.split','Writing / Editor','Enter splits a Bar','Pad','Composer',['src/studio/app.js::splitEditorBar']),
  item('editor.merge','Writing / Editor','Backspace merges with previous Bar','Pad','Composer',['src/studio/app.js::mergeEditorBarWithPrevious']),
  item('editor.paste','Writing / Editor','Multiline paste creates Bars','Pad','Composer',['src/studio/editor-session.mjs::pasteEditorText']),
  item('editor.ime','Writing / Editor','IME transaction safety','Pad','Composer',['src/studio/app.js::compositionstart'],ADAPTED,DEVICE),
  item('editor.undo','Writing / Editor','Undo / redo with typing-burst coalescing','Pad','Composer',['src/studio/edit-history.mjs::createTypingUndoCoalescer']),
  item('editor.font','Writing / Editor','Font family and size controls','Pad','Quick tools + Settings',['src/studio/app.js::setFontSize']),
  item('editor.theme','Writing / Editor','Light / dark / custom semantic themes','Pad','Quickstyle + Settings',['src/studio/app.js::saveThemeDraft']),
  item('editor.clear','Writing / Editor','Safe clear with revision and recovery point','Pad','Document action',['src/studio/app.js::clearCurrentDocument']),
  item('editor.autosave','Writing / Editor','IndexedDB authoritative autosave','Pad','DocumentStore',['src/studio/app.js::syncDocumentShadow']),
  item('editor.revisions','Writing / Editor','Revision history and stable restore','Pad','Editor dock',['src/studio/app.js::restoreStudioRevision']),
  item('editor.navigator','Writing / Editor','Searchable Bar Navigator with stable reorder','Studio extension','Editor dock',['src/studio/app.js::renderBarNavigatorDock']),
  item('editor.bar-actions','Writing / Editor','Create / duplicate / delete Bar actions','Studio extension','Bar Navigator',['src/studio/app.js::duplicateStudioBar','src/studio/editor-session.mjs::duplicateEditorBar']),

  item('library.documents','Library','Create / open / search / sort / rename documents','Pad','My texts',['src/studio/app.js::renderLibrary']),
  item('library.folders','Library','Nested folder hierarchy','Pad','My texts',['src/studio/app.js::expandFolderPaths']),
  item('library.folder-actions','Library','Folder create / subfolder / rename / reorder / delete','Pad','My texts',['src/studio/app.js::renameLibraryFolder']),
  item('library.move','Library','Move documents between folders','Pad','Dialog + drag/drop',['src/studio/app.js::moveLibrarySongToFolder']),
  item('library.trash','Library','Trash / restore / permanent delete','Pad','My texts',['src/studio/app.js::permanentlyDeleteLibrarySong']),
  item('library.predelete-recovery','Library','Automatic recovery checkpoint before permanent delete','Studio extension','My texts',['src/studio/app.js::before_permanent_song_delete']),

  item('analysis.scheme','Analysis','Canonical end-rhyme scheme','Pad','Reime',['src/studio/analysis-adapter.mjs::createStudioAnalysisClient']),
  item('analysis.relations','Analysis','Primary and soft relations inside verse','Pad','Reime',['src/studio/app.js::analysisRelationMode']),
  item('analysis.word-lab','Analysis','Word Laboratory IPA / stress','Pad','Reime',['src/studio/app.js::Word Laboratory']),
  item('analysis.stress','Analysis','Stress fingerprint','Pad','Reime',['src/studio/app.js::Stress Fingerprint']),
  item('analysis.chain','Analysis','Optional rhyme-chain visualization','Pad','Reime',['src/studio/app.js::analysisChainVisible']),
  item('analysis.languages','Analysis','DE / EN / Cross DE+EN controls','Pad','Reime',['src/studio/app.js::data-analysis-language']),
  item('analysis.bar-inspector','Analysis','Live Bar Inspector metrics','Pad','Editor dock',['src/studio/app.js::renderBarInspectorDock']),
  item('analysis.verse-totals','Analysis','Verse totals and duration estimate','Pad','Editor footer',['src/studio/app.js::durationSeconds'],ADAPTED),

  item('perform.cues','Perform','Hit / accent / pause / breath / hold / erase','Pad','Perform',['src/studio/performance-session.mjs::PERFORMANCE_CUE_TYPES']),
  item('perform.move','Perform','Cue move and drag with accessible alternative','Pad','Perform',['src/studio/performance-session.mjs::movePerformanceCue']),
  item('perform.pause-length','Perform','Pause length','Pad','Perform',['src/studio/performance-session.mjs::pauseLength']),
  item('perform.grid','Perform','8/16 grid, straight/triplet, half/double time','Pad','Perform',['src/studio/performance-session.mjs::tempoScale']),
  item('perform.automap','Perform','Auto-map and clear','Pad','Perform',['src/studio/performance-session.mjs::autoMapPerformanceBar'],ADAPTED),
  item('perform.stable-cues','Perform','Stable Bar-ID cue anchors and edit invalidation','Pad','Perform',['src/studio/performance-session.mjs::performanceNeedsReview']),
  item('perform.metronome','Perform','Variable-timing Web Audio metronome','Pad','Perform',['src/studio/app.js::AudioContext'],READY,DEVICE),

  item('appearance.quick-switch','Appearance / UX','One-click configured Light/Dark switch','Studio prototype','Topbar',['src/studio/app.js::toggleTheme']),
  item('appearance.quickstyles','Appearance / UX','Hover + explicit touch Quickstyles menu','Studio prototype','Topbar',['src/studio/app.js::setThemeQuickOpen']),
  item('appearance.language','Appearance / UX','Persistent DE / EN interface switch','Search','Topbar + Settings',['src/studio/i18n.mjs::createStudioDomLocalizer']),
  item('appearance.command-palette','Appearance / UX','Searchable ranked keyboard command palette','Studio extension','Global dialog',['src/studio/app.js::studioCommandRegistry']),
  item('appearance.motion','Appearance / UX','Restrained motion and reduced-motion support','Studio prototype','Global',['src/studio/styles.css::prefers-reduced-motion']),

  item('mobile.navigation','Mobile','Bottom navigation','Studio prototype','Mobile shell',['src/studio/index.html::mobile-nav'],READY,DEVICE),
  item('mobile.swap','Mobile','Single-surface editor/results swap','Studio prototype','Mobile shell',['src/studio/app.js::mobile-results'],READY,DEVICE),
  item('mobile.keyboard','Mobile','VisualViewport keyboard correction','Pad','Composer',['src/studio/mobile-viewport.mjs::installMobileViewportController'],READY,DEVICE),
  item('mobile.touch','Mobile','Primary touch targets >=44 CSS px','Studio prototype','Mobile CSS',['src/studio/dom-acceptance.mjs::touch-targets'],READY,DEVICE),
  item('mobile.no-hover','Mobile','No hover-only primary action','Studio prototype','Quickstyles + Library',['src/studio/index.html::themeMenuBtn'],READY,DEVICE),

  item('system.backup','System / Recovery','Portable workspace backup import/export','Studio extension','Settings',['src/studio/backup-portability.mjs::createPortableStudioBackup']),
  item('system.recovery','System / Recovery','Manual recovery points and verified restore','Studio extension','Settings',['src/studio/app.js::restoreRecoveryPoint']),
  item('system.persistence','System / Recovery','Serialized autosave queue and lifecycle flush','Studio extension','DocumentStore',['src/studio/app.js::flushStudioPersistence']),
  item('system.diagnostics','System / Recovery','Environment + DOM acceptance diagnostics','Studio extension','Settings',['src/studio/dom-acceptance.mjs::runStudioDomAcceptance']),
  item('system.startup-bindings','System / Recovery','Startup control binding guard','Studio extension','Startup',['src/studio/app.js::bindClick']),
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
