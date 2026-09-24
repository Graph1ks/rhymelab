# React Studio R4 — Library / persistence / recovery

Status: **IMPLEMENTED / AUTOMATED VERIFIED / BROWSER ACCEPTANCE DEFERRED**  
Parent plan: `docs/REACT_STUDIO_REPLATFORM.md`  
R1 boundary: `docs/REACT_STUDIO_R1_TYPED_BRIDGE.md`  
R2 shell: `docs/REACT_STUDIO_R2_SHELL.md`  
R3 Search/Writer: `docs/REACT_STUDIO_R3_SEARCH_WRITER.md`  
Machine-readable inventory: `apps/studio-react/r4-library-manifest.json`

## Purpose

R4 ports the current Library, persistence and recovery workflows into the React
shell while retaining the existing IndexedDB DocumentStore and portable-backup
contracts.

The persistence boundary is intentionally unchanged:

```text
React Library / Settings
        |
DocumentWorkspaceProvider
  rendering + mutation working copy
        |
R1 document bridge
        |
existing document adapter / migration / DocumentStore / backup modules
        |
IndexedDB
```

React and Zustand do **not** become a second document database. The existing
IndexedDB DocumentStore remains authoritative whenever it is available.

## Startup authority

R4 follows the current Studio startup contract:

1. read legacy LocalStorage state and current Studio preferences;
2. ask the existing DocumentStore whether IndexedDB is available;
3. load and validate the existing document snapshot;
4. if no trusted snapshot exists, migrate the intact legacy state through
   `migrateLegacyStudioStateToStore()`;
5. convert the authoritative snapshot to the existing LegacyStudioState UI model
   with `studioStateFromDocumentSnapshot()`;
6. keep preferences in the existing preference store.

If IndexedDB is unavailable, the current LocalStorage fallback remains usable.
R4 does not invent another fallback format.

## React working state versus storage authority

The React provider keeps an in-memory LegacyStudioState working copy so React can
render Library changes immediately.

That copy is not an independent persistence authority.

Every mutation is sent back through the existing
`shadowLegacyStudioStateToStore()` path. The existing document migration layer
therefore still determines the canonical folders, songs, Bars and revisions stored
in IndexedDB.

This preserves the same bridge R5 will later use for editor state.

## Autosave and lifecycle flush

R4 mirrors the current Studio persistence mechanics:

- default debounce: **180 ms**;
- one serialized Promise chain for IndexedDB writes;
- newer UI generations cannot create parallel snapshot writes;
- Studio preferences are written through the existing preference adapter;
- `visibilitychange` flushes when the document becomes hidden;
- `pagehide` requests an explicit flush;
- LocalStorage is written only on the existing fallback path.

The save status is visible in the Library:

```text
INDEXEDDB / Authoritative
Saving …
Fallback / LocalStorage
Error
```

R4 provides the persistence infrastructure for the React application. The
`editor.autosave` parity row remains pending until R5 supplies actual React editor
mutations and revision boundaries.

## Library documents

The React Library ports the current document workflow:

- create a text;
- open a text;
- search title, folder and lyric content;
- sort by:
  - recently edited;
  - title A–Z;
  - created time;
  - Bar count;
- rename;
- show the active document;
- show first non-empty lyric line as preview;
- show Bar count and edited timestamp.

Opening a document updates the same active document state and immediately persists
that active choice before navigating to Studio.

The React editor is still R5, so R4 exposes the active title and DocumentStore
authority in Studio without implementing a fake editor.

## Folder hierarchy

R4 preserves the path-based Library semantics used by Studio V2:

- nested folder hierarchy;
- create root folder;
- create subfolder;
- rename folder subtree;
- reorder sibling folders;
- delete folder subtree;
- explicit Move action for texts;
- desktop drag/drop into folder targets.

Folder normalization remains behavior-compatible:

- NFKC normalization;
- slash-separated path segments;
- slash characters inside entered segments converted to spaces;
- collapsed whitespace;
- 60-character segment bound;
- 180-character full path bound.

`Entwürfe` remains the protected default folder.

Renaming a folder renames its entire subtree and moves every contained text with it.
A collision with an existing outside subtree is rejected.

Deleting a folder never deletes its texts. The texts are moved to the parent folder,
or to `Entwürfe` when deleting a root folder.

## Trash / restore / permanent delete

Trash behavior remains recoverable:

- moving a non-active document to Trash sets deleted state/timestamp;
- when trashing the active document, Studio selects the most recently updated
  non-deleted fallback;
- the only active/non-deleted document cannot be moved to Trash;
- Restore clears deleted state/timestamp and restores its folder path;
- permanent delete is available only for Trash rows.

Before permanent deletion, R4 creates the existing
`before_permanent_song_delete` recovery snapshot **when IndexedDB is available**.

If IndexedDB is unavailable, permanent deletion still follows the existing
LocalStorage fallback behavior instead of being newly blocked. The UI explicitly
states that IndexedDB recovery was unavailable.

## Recovery points

The Data Safety surface uses the existing DocumentStore backup store.

R4 provides:

- manual recovery-point creation;
- recent recovery list;
- document snapshot restore;
- legacy migration-backup restore;
- status/error feedback.

The existing `restoreDocumentBackup()` contract remains authoritative and creates
its own `before_recovery_restore` backup before restoration, then reloads and
validates the restored snapshot.

For legacy migration backups R4 retains the existing behavior:

1. save the current document snapshot as `before_legacy_recovery`;
2. parse the preserved legacy payload;
3. migrate it through the existing migration bridge;
4. use the resulting verified snapshot.

Document recovery restores documents only, matching the current Studio behavior;
it does not silently overwrite unrelated appearance preferences.

## Portable backup export

Portable export uses the existing schema and filename helpers.

The payload still contains:

```text
snapshot
preferences
SearchState
schema/version metadata
```

R4 first flushes queued persistence, then reads the authoritative snapshot and passes
it to `createPortableStudioBackup()`.

No React-specific backup format exists.

## Portable backup import

Import retains the current safeguards:

- JSON/file input;
- **64 MiB** file-size guard;
- parse and validate through `parsePortableStudioBackup()`;
- confirmation shows text/Bar/revision/folder counts;
- save current IndexedDB document as `before_portable_import`;
- save imported snapshot through the existing DocumentStore;
- reload the snapshot to verify the write;
- restore existing Studio preferences;
- restore the shared R3 SearchState through its existing normalization/persistence
  functions.

After preference import, active shell language/theme and R3 saved/search preferences
are rehydrated. This is UI synchronization only; the preference storage contract is
unchanged.

## R3 integration

R3 Hide-used already reads active lyric text from the existing DocumentStore.

R4 publishes a lightweight React-local document-change signal after an active
document/Library mutation. R3 responds by refetching the same existing read-only
DocumentStore text.

This signal does not contain document data and is not another state store.

## Responsive and scroll ownership

Desktop Library uses bounded, explicit scroll owners:

```text
Library
  folder pane      <-- folder/data-safety scroll owner
  content pane
    song grid      <-- document-grid scroll owner
```

The outer shell does not create an additional desktop Library scrollbar.

At the mobile breakpoint the panes become part of the shell's vertical document
flow so touch scrolling remains natural, and primary Library actions use touch-sized
targets.

Real-device/browser interaction evidence remains an R7 acceptance requirement.

## Automated verification

`apps/studio-react/src/features/library/r4-library.test.ts` protects:

1. nested folder creation;
2. subtree rename plus contained-document relocation;
3. sibling reorder without flattening descendants;
4. safe folder-tree deletion and fallback relocation;
5. document moves plus missing path creation;
6. active-document Trash fallback and only-document guard;
7. Trash restore and permanent-delete eligibility;
8. title/text/folder search and current sort behavior;
9. debounced newest-generation autosave;
10. serialized overlapping persistence flushes;
11. portable export with current SearchState;
12. pre-import recovery before snapshot replacement.

Focused verification:

```bash
npm run studio:react:r4
```

The dedicated React gate currently verifies:

- strict TypeScript;
- R1 regression;
- R2 regression;
- R3 Search regression;
- R4 Library/persistence/recovery contracts;
- parity inventory;
- production Vite build.

At the R4 functional checkpoint this is **50 / 50 automated tests passing**.

Full RhymeLab CI and the existing Studio V2 Gate also remain mandatory and pass in
parallel.

## Parity status

R4's implemented Library/System rows are marked `ported`, not `verified`.

In particular:

- browser/device interaction evidence is still deferred to R7;
- `editor.autosave` remains R5 because the React editor does not yet exist;
- revision creation/restore UI remains part of R5;
- no R4 result weakens the 93/93 cutover rule.

## R4 exit

- [x] existing IndexedDB DocumentStore remains authoritative;
- [x] no Zustand/React document authority added;
- [x] existing legacy migration path retained;
- [x] LocalStorage fallback retained;
- [x] serialized 180-ms autosave queue;
- [x] visibility/pagehide flush;
- [x] create/open/search/sort/rename documents;
- [x] nested folders;
- [x] folder create/subfolder/rename/reorder/delete;
- [x] document move + drag/drop;
- [x] Trash/restore;
- [x] permanent delete;
- [x] conditional pre-delete recovery;
- [x] manual recovery points;
- [x] verified restore;
- [x] portable backup export;
- [x] guarded/confirmed portable import;
- [x] pre-import recovery;
- [x] imported preferences/SearchState rehydrated;
- [x] R3 Hide-used follows R4 active-document changes;
- [x] no R1 bridge modified;
- [x] no shipping Studio V2/backend implementation modified.

Next phase: **R5 — editor**.
