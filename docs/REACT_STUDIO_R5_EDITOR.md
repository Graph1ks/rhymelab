# React Studio R5 — unified editor

Status: **IMPLEMENTED / AUTOMATED VERIFIED / BROWSER ACCEPTANCE DEFERRED**  
Parent plan: `docs/REACT_STUDIO_REPLATFORM.md`  
R1 boundary: `docs/REACT_STUDIO_R1_TYPED_BRIDGE.md`  
R3 Search/Writer: `docs/REACT_STUDIO_R3_SEARCH_WRITER.md`  
R4 persistence: `docs/REACT_STUDIO_R4_LIBRARY_PERSISTENCE.md`  
Machine-readable inventory: `apps/studio-react/r5-editor-manifest.json`

## Purpose

R5 ports the Studio V2 unified text editor into React without inventing a second
editor domain model or document database.

The editor boundary is:

```text
React EditorWorkspace
        |
EditorSessionProvider
 DOM / selection / IME / undo orchestration
        |
      R1 bridge
 existing editor-session + edit-history semantics
        |
R4 DocumentWorkspaceProvider
 UI working copy + serialized persistence
        |
existing document adapter / migration / DocumentStore
        |
     IndexedDB
```

The existing IndexedDB DocumentStore remains authoritative. React does not move
documents into Zustand, add a second IndexedDB schema, or introduce a replacement
backup format.

## Unified document geometry

R5 uses one controlled `textarea`, matching the Studio V2 unified document
contract. Native browser editing remains responsible for ordinary text behavior.

The existing editor bridge reconciles that text back into the document model:

- tracked lyric Bars retain stable Bar IDs;
- free blank lines remain untracked;
- bracket metadata remains in the document but is excluded from lyric tracking;
- unchanged prefix/suffix Bars retain identity;
- changed Bars increment their Bar revision;
- newly introduced lines receive new stable IDs;
- Bar-scoped state is removed when its tracked Bar disappears.

This path covers ordinary replace, native Enter split, boundary merge/delete and
multiline paste without a generic rich-text framework.

## Selection, rhyme anchor and safe insert

Selection capture follows the Studio V2 rules:

1. a caret inside a word expands to the current word;
2. multiline selections are not valid rhyme anchors;
3. bracket metadata is excluded;
4. only tracked lyric text produces a Selection Proof;
5. the proof captures document, Bar ID, Bar revision and selected text.

The Sound Explorer now follows valid editor selection by default. A fixed rhyme
anchor is an explicit opt-in toggle.

Writer result insertion is enabled only when a current Selection Proof exists.
Before an insert, R5 validates that proof against the freshest R4 working state.
A stale Bar revision or changed text therefore rejects the insert before an undo
checkpoint is created.

The result `+` action and keyboard Enter use the same safe path.

## IME and native input transactions

R5 keeps the browser-native text surface and mirrors the golden-master event
boundaries:

- `beforeinput` drives typing-burst undo checkpoints;
- composing input does not create ordinary per-keystroke checkpoints;
- `compositionstart` creates one transaction boundary;
- input during composition still reconciles the document;
- `compositionend` commits the transaction, refreshes selection and schedules the
  revision boundary.

This preserves native IME behavior instead of replacing it with synthetic rich-text
editing.

## Undo / redo

The React editor keeps a local editor-session history only. It is not a persistence
authority.

- maximum undo history: **80 snapshots**;
- typing coalescing window: **1100 ms**;
- structural actions create explicit boundaries;
- undo and redo restore the existing editor snapshots, including stable Bar IDs and
  Bar revisions;
- document switching clears session-local undo/redo.

The coalescing semantics come from the existing R1 edit-history bridge.

## Persistence, autosave and revisions

Every editor mutation uses `DocumentWorkspaceProvider.mutate()`. That means the
actual React editor stream now reaches the R4 persistence pipeline:

- R4 serialized persistence debounce: **180 ms**;
- one serialized IndexedDB write chain;
- existing `shadowLegacyStudioStateToStore()` path;
- existing LocalStorage fallback when IndexedDB is unavailable;
- lifecycle flush on `visibilitychange:hidden` and `pagehide`.

R5 additionally restores editor revision semantics:

- editor revision debounce: **650 ms**;
- editor snapshots are signature-deduplicated;
- maximum retained revisions: **30**;
- restore creates `before_restore` first;
- clear creates `before_clear_document` first;
- clear also creates an R4 Recovery Point when IndexedDB is available;
- fallback availability is not removed when IndexedDB is unavailable.

## Bar actions and navigator

The editor exposes the existing structural Bar workflows:

- create Bar;
- duplicate Bar with a new stable ID;
- delete Bar;
- move Bar;
- jump to a Bar;
- searchable Bar Navigator.

Selection/navigation state follows stable Bar identity rather than treating the
current array index as identity.

## Hold-drag transport

Bar-number hold-drag is implemented directly on the React gutter with the Studio V2
interaction constants:

- hold activation: **260 ms**;
- movement before activation cancels after **8 px**;
- live transport ghost;
- full lyric-surface drop-space preview;
- edge auto-scroll while dragging;
- commit through the existing R1 `moveEditorBar()` behavior.

## Section long-press

Long-press on the editor opens the existing quick section set:

- hold: **1500 ms**;
- pre-open movement cancellation: **9 px**;
- `[Intro]`;
- `[Verse]`;
- `[Pre-Chorus]`;
- `[Chorus]`;
- `[Post-Chorus]`;
- `[Hook]`;
- `[Bridge]`;
- `[Outro]`.

The selected range, or current caret position, is replaced through the same unified
document range mutation path.

## Revisions

History is visible from the editor dock. A revision can be compared against the
complete current lyric snapshot before restore.

The comparison uses the existing stable-Bar revision diff implementation and shows
added, removed, changed and moved rows. Restoring a previous revision first records
the current state as `before_restore`.

## Font controls

R5 restores editor-only typography controls:

- Studio Sans;
- Editorial / serif;
- Mono;
- **16–28 px** size range.

These settings remain Studio preferences and do not become document storage
authority.

The existing semantic theme system from R2 continues to style the editor. The
`editor.theme` parity row remains `in_progress`; R5 does not upgrade it merely
because the editor consumes the theme tokens.

## Mobile single-surface behavior

At the canonical `800 px` breakpoint, Studio exposes one explicit Editor / Rhymes
swap.

Only the selected surface is shown. The existing outer Studio mobile viewport
continues to own normal page scrolling; the Writer results keep their existing
bounded results scroller. R5 does not add a nested page scrollbar.

## Verification

The functional R5 code checkpoint is
`85dbd349ac65984049ad7d079987756914816580`.

On that code checkpoint:

```text
Strict TypeScript               PASS
Vitest test files               6 / 6 PASS
Vitest tests                    60 / 60 PASS
Vite production build           PASS
React Studio Replatform #132    PASS
RhymeLab CI #1315               PASS
Studio V2 Gate #450             PASS
```

The focused local gate is:

```bash
npm run studio:react:r5
```

R5 adds **10** focused editor contract tests. They cover stable Bar identity,
tracked/bracket selection behavior, Selection Proof invalidation, unified-document
identity reconciliation, native split/merge/multiline-paste semantics, revision
dedupe/restore, safe clear and active-document selection.

## Parity accounting

After R5:

```text
ported        66
in_progress    5
pending       22
verified       0
total         93
```

R5 moves **23** rows to `ported`. It does not mark browser/device-dependent
behavior as `verified`.

Still intentionally not promoted:

- `editor.theme` remains `in_progress`;
- `workflow-v3.single-drawer-scroll` remains `pending`;
- browser/component interaction evidence remains required before cutover-grade
  verification;
- the existing physical browser/touch/IME/Web Audio acceptance matrix remains
  required in R7.

## Boundary check

Diffing the functional R5 checkpoint against the completed R4 head
`cc147fad72c0d3f39377e85473a4b6071bb9c6da` shows:

```text
apps/studio-react/*       changed
root package.json         focused R5 gate only
src/studio/*              0 files changed
backend / Serving-v1      0 files changed
R1 legacy bridge files    0 files changed
```

Shipping Studio V2 remains the behavioral golden master and rollback implementation.

## Next phase

R6 is **Analysis + Perform**. It must continue to reuse the existing R1 analysis,
performance, Web Audio and cue-state contracts rather than reimplementing those
semantics in React.
