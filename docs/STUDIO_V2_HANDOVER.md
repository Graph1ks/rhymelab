# Studio V2 Release Handover

Branch: `feature/studio-v2-ui-redesign`  
PR: #185 — `feat: release Studio V2 as default RhymeLab shell`

This file is the durable continuation checkpoint for the Studio V2 release branch. It records the implemented production-direction work so a later session can continue without reconstructing context from chat history.

## Migration role — behavioral golden master

As of 2026-09-24, new product feature development is frozen while the frontend is
replatformed under `docs/REACT_STUDIO_REPLATFORM.md`.

This Studio V2 implementation is now the **behavioral golden master** for the React
port. Nothing documented here may be dropped merely because the implementation
technology changes. The source remains intact as the shipping implementation and
rollback surface until the React parity gate and post-cutover burn-in are complete.

The hard migration gate is `docs/REACT_STUDIO_PARITY_GATE.md`.

## Current checkpoint

Studio V2 has moved well beyond the original static redesign shell. The branch now contains the Writer integration, production document model, IndexedDB authority, recovery, Library hierarchy, Perform sequencing, canonical song analysis, mobile acceptance engineering, DE/EN localization, diagnostics, and desktop command/navigation improvements.

Studio V2 is now the default root product route. The previous Search remains at `/search` and `/legacy`; RhymePad remains at `/pad` and `/pad-legacy`. `--search-default` / `RHYMELAB_SEARCH_DEFAULT=1` provides an explicit rollback mode while real-device/browser acceptance is completed.

### Workflow UX v3

The current Studio interaction pass adds direct-manipulation and review behavior
without changing Writer scoring/ranking semantics:

- Bar numbers can be held and dragged to reorder Bars. The transported Bar remains
  visible as a floating ghost, the editor creates a live insertion space/preview,
  edge auto-scroll continues during transport, and release commits the exact drop.
- Compact result density is the first-run default in Studio and standalone Search;
  explicit user density/view changes remain persisted.
- The Studio bottom tool drawer has one wheel-scroll owner so Bar Navigator,
  Inspector and History content do not block mouse-wheel scrolling.
- History restore is review-first: selecting a revision opens a scrollable
  full-lyrics line-by-line comparison with highlighted changed/added/removed/moved
  rows. Restore is only offered after that comparison and still creates a
  pre-restore revision.
- Rhyme search follows the current editor selection on startup. Pin/fixed-anchor
  behavior remains an explicit toggle instead of the initial state.
- Result paging is continuous/infinite; the redundant manual load-more control is
  removed.
- The explicit “Neue Zeile” action is removed. Normal editor newline behavior is
  the line-creation mechanism.
- Holding the writing editor for 1.5 seconds opens a section quick-insert menu at
  the current caret for `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`,
  `[Post-Chorus]`, `[Hook]`, `[Bridge]`, and `[Outro]`.
- Database Settings only enable editions actually available on disk. The active
  LITE/STANDARD/FULL edition is visible in both Studio and Search.


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

### Shipping database selector and diagnostics

Studio Settings exposes the three shipping runtime editions only:

```text
LITE | STANDARD | FULL
```

Master/Developer is build-only and never selectable. Missing local editions remain
visible but disabled. Startup prefers STANDARD, then FULL, then LITE, so a LITE-only
installation remains usable.

The selected edition is propagated request-by-request through Writer, detail,
song-analysis and capability requests; there is no mutable global active-database
state. Studio and Search visibly identify the active database.

Controlled edition diagnostics remain available with:

```powershell
npm run dev:distribution-lab
```

Full runtime/diagnostics contract:

`docs/DATABASE_RUNTIME.md` and `docs/INTERNAL_DISTRIBUTION_LAB.md`

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
