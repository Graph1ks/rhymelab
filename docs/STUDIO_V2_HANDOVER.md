# Studio 02 Continuation Handover

Branch: `feature/studio-v2-ui-redesign`  
PR: #185 — `feat: introduce Studio 02 UI redesign surface`

This file is the durable continuation checkpoint for the Studio 02 redesign branch. It records the implemented production-direction work so a later session can continue without reconstructing context from chat history.

## Current checkpoint

Studio 02 has moved well beyond the original static redesign shell. The branch now contains the Writer integration, production document model, IndexedDB authority, recovery, Library hierarchy, Perform sequencing, canonical song analysis, mobile acceptance engineering, DE/EN localization, diagnostics, and desktop command/navigation improvements.

Studio V2 is now the default root product route. The previous Search remains at `/search` and `/legacy`; RhymePad remains at `/pad` and `/pad-legacy`. `--search-default` / `RHYMELAB_SEARCH_DEFAULT=1` provides an explicit rollback mode while real-device/browser acceptance is completed.

## Major implemented areas

### Writer / Search

- Live local `/api/writer` integration.
- DE / EN / DE+EN query and result language controls.
- Word / Phrase-Mosaic / Entity scopes.
- Exact primary rhyme types plus assonance/consonance.
- Syllable filters, sort modes, variants, historical/generated/generated-only controls.
- Shared versioned SearchState between Studio and the legacy search UI.
- Unknown-query pronunciation retry/cache.
- Capability-driven UI for runtime/data availability.
- Full detail/provenance surface for words, phrases, and entities.
- Result metadata badges.
- Current runtime + rolling AVG100 telemetry.
- Entity category multi-select carried through SearchState, Studio, server, unified Writer and Entity runtime as OR retrieval.

### Writing / Editor

- Stable Bar IDs and Bar revisions.
- Selection proof keyed to song / Bar / revision / range.
- Undo + redo.
- Enter split, Backspace merge/remove, multiline paste.
- IME composition transaction guard.
- Editor snapshots include performance state.
- Revision restore preserves stable Bar identity and cue state.
- Safe document clear with pre-clear revision / recovery.
- Serialized IndexedDB save chain with lifecycle flush on hidden/pagehide.

### Document model / persistence

- Versioned Studio document model.
- IndexedDB DocumentStore is authoritative after verified migration.
- LocalStorage only remains as migration/fallback document source and UI preference storage.
- Empty folders are preserved as first-class records.
- Recovery points and verified restore.
- Portable full-workspace JSON backup/import:
  - document snapshot
  - preferences
  - shared SearchState
  - pre-import recovery checkpoint
- Permanent song deletion creates a recovery checkpoint first.

### Library

- Search and sorting.
- Trash / restore / permanent delete.
- Song rename and move.
- Hierarchical folder paths.
- Root folders + subfolders.
- Safe subtree rename.
- Sibling subtree reorder.
- Safe subtree delete with song fallback.
- Desktop drag-to-folder direct manipulation.
- Explicit folder ordering is retained instead of alphabetic re-sorting.

### Themes / appearance

- Reference Light and Dark theme slots.
- Main theme control remains a one-click Light/Dark QuickSwitch.
- Separate explicit Quickstyle menu trigger for touch/keyboard.
- Hover Quickstyles remain available on pointer devices.
- Custom semantic theme builder, preview, contrast feedback, save/delete and Light/Dark slot replacement.
- Editor font and size settings.
- Reduced-motion handling.

### Analysis

- Demo string-ending rhyme heuristic removed.
- Canonical Writer-backed song rhyme-scheme endpoint.
- Primary rhyme types determine scheme; assonance/consonance remain descriptive relations.
- Canonical IPA / stress data exposed from Writer query details.
- Word Laboratory.
- Relations-inside-verse workbench.
- Primary vs soft relation filtering.
- DE / EN / Cross DE+EN analysis controls.
- Stress Fingerprint.
- Optional Rhyme Chain visualization.
- Bar navigation from analysis.
- Local syllable-density UI remains explicitly labelled as approximation.

### Perform

- Stable Bar-ID cue model instead of line-index cue ownership.
- Legacy cue migration.
- Hit / accent / pause / breath / hold / erase.
- Move by click and drag.
- Accessible click alternative.
- Pause length.
- 8 / 16 grids.
- Straight / triplet.
- Half / normal / double time.
- Variable timing metronome.
- Auto-map remains explicitly approximate.
- Cue invalidation/review when Bar text revision changes.
- Bar metrics:
  - cues / hits / accents / pauses / breaths / holds
  - density
  - Bar time
  - syllables/sec approximation
  - on/off-beat pocket
  - breath load
  - flow fingerprint
  - previous-Bar shared placements
- Live Bar Inspector dock combines local flow metrics with canonical Writer IPA/stress/rhyme information.

### Mobile / interaction engineering

- VisualViewport controller.
- Active Bar correction when software keyboard shrinks the viewport.
- Mobile navigation hides while software keyboard owns the lower viewport.
- Primary mobile controls engineered for 44px touch targets.
- Analysis nested scrolling removed.
- Editor scroll locks while tool dock owns mobile scrolling.
- Reduced-motion gates.
- Explicit touch Quickstyles trigger.
- Runtime DOM acceptance audit checks:
  - required controls
  - duplicate IDs
  - visible button labels
  - Quickstyle touch trigger
  - DE/EN quick switch
  - touch target sizing
  - keyboard/mobile-nav conflict
  - single-scroll behavior
  - active Bar presence
  - motion state

### Diagnostics

Settings now includes a local diagnostics dashboard and JSON export covering:

- DocumentStore authority/status.
- Writer status.
- current / AVG100 timing.
- IndexedDB API.
- Web Audio.
- VisualViewport.
- preferences storage.
- reduced-motion signal.
- primary pointer class.
- DOM/interaction acceptance gates.

### DE / EN UI

- Persistent `uiLanguage` preference.
- One-click DE/EN topbar control.
- DOM localization engine for static and dynamically rendered Studio UI.
- User text / result content is intentionally excluded from translation.
- Portable backups include the UI language preference.

### Desktop command UX

- Static command dialog replaced by a searchable ranked command palette.
- Keyboard search / Arrow navigation / Enter execution / Escape close.
- Commands cover:
  - navigation
  - Studio modes
  - document actions
  - Writer/search actions
  - view/theme/language actions
  - diagnostics/recovery

## Regression protection added

Dedicated tests/modules now cover at least:

- Studio source structure.
- Document model migration.
- Document adapter / IndexedDB hydration.
- Performance session semantics.
- Stable revision snapshots.
- Mobile viewport helpers.
- Canonical song rhyme analysis.
- SearchState Entity multi-select.
- Portable backup format.
- Environment diagnostics.
- DOM acceptance audit.
- DE/EN translation helpers.
- Command palette ranking/grouping.

`npm run studio:v2:verify` and the repository source/test suite pass on GitHub Actions at the live-cutover checkpoint. The Markov demo isolation is regression-tested so product surfaces do not link `/markov-test`.

## Important validation limitation

No claim is made that full physical browser E2E, touch-device, Web Audio, or Electron acceptance has been executed inside the editing environment. The complete repository test suite is exercised by CI.

The owner explicitly approved the reversible live default-route cutover on 2026-09-21 while the seven real-device acceptance checks remain pending.

## Remaining high-priority work

1. Complete real browser/device/audio acceptance across the release viewport matrix.
2. Finish the exhaustive old `/pad` + old Search versus Studio interaction audit.
3. Fix any discrepancies found by that audit; use the explicit Search-root rollback only if a material regression requires it.
4. Keep the complete repository CI/source/test gates green on the release branch/main.
5. After browser/device acceptance: continue Electron packaging work when explicitly requested.

## Continuation rule

Do not regress the production-direction contracts already established here:

- Writer/backend stays canonical for rhyme data.
- Approximate metrics must remain visibly labelled approximate.
- Stable Bar identity must survive editor/revision/Perform operations.
- IndexedDB remains the authoritative document store.
- Permanent/destructive operations require recoverability.
- One-click Light/Dark QuickSwitch must remain intact.
- Touch functionality must not depend on hover.
- Legacy Search/RhymePad routes remain available as regression/fallback surfaces after cutover.
- Markov remains frozen, direct-demo-only, and unlinked from the RhymeLab product UI.
