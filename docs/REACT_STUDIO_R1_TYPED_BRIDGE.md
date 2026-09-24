# React Studio R1 — typed legacy bridge

Status: **IMPLEMENTED / VERIFIED**  
Parent plan: `docs/REACT_STUDIO_REPLATFORM.md`  
Machine-readable inventory: `apps/studio-react/r1-adapter-manifest.json`

## Purpose

R1 establishes a typed boundary between the new React application and the existing
browser/domain implementation. It deliberately does **not** rewrite accepted Studio
logic.

The governing rule is:

> TypeScript may describe and orchestrate current behavior, but R1 does not replace
> current behavior with a second implementation.

For direct domain operations, the exported React bridge function is the same runtime
function object as the legacy implementation. The R1 parity test checks that
identity explicitly.

## Boundary

```text
React / TypeScript
        |
apps/studio-react/src/legacy/
        |
        +-- contracts.ts     TypeScript contracts only
        +-- search.ts        SearchState / query IPA / Writer / capabilities / DB tier
        +-- documents.ts     document model / IndexedDB / backup
        +-- editor.ts        editor / history / Perform / revision diff
        +-- services.ts      analysis / detail
        +-- system.ts        diagnostics / device acceptance
        |
existing src/**/*.mjs modules
```

There is no forked React implementation of the editor, document model, query
pronunciation or performance semantics in R1.

## Covered source modules

R1 wraps 18 existing modules:

| Domain | Existing source |
| --- | --- |
| Search state | `src/ui/search-state.mjs` |
| Client query pronunciation | `src/ui/query-pronunciation-client.mjs` |
| Pronunciation cache | `src/ui/query-pronunciation-cache.mjs` |
| Writer adapter | `src/studio/search-adapter.mjs` |
| Capabilities | `src/studio/capability-adapter.mjs` |
| Runtime edition | `src/studio/internal-db-lab.mjs` |
| Document model | `src/studio/document-model.mjs` |
| DocumentStore | `src/studio/document-store.mjs` |
| Document adapter/preferences | `src/studio/document-adapter.mjs` |
| Portable backup | `src/studio/backup-portability.mjs` |
| Editor session | `src/studio/editor-session.mjs` |
| Undo coalescing | `src/studio/edit-history.mjs` |
| Perform session | `src/studio/performance-session.mjs` |
| Revision diff | `src/studio/revision-diff.mjs` |
| Analysis | `src/studio/analysis-adapter.mjs` |
| Detail | `src/studio/detail-adapter.mjs` |
| Diagnostics | `src/studio/diagnostics.mjs` |
| Device acceptance | `src/studio/device-acceptance.mjs` |

## Type contracts

`contracts.ts` now gives React explicit contracts for:

- SearchState and every current query/result/scope/rhyme/syllable/sort/variant enum;
- Writer request options, normalized rows and search-client result state;
- DE/EN client pronunciation details and cache records;
- document snapshot, Song, Bar, Folder and Revision records;
- IndexedDB DocumentStore operations;
- legacy Studio state/preferences and portable backups;
- editor Bar identity, snapshots, selection proofs and proof validation;
- Perform configuration, cue types and metrics;
- analysis occurrences/relations and detail models;
- runtime capability state and LITE/STANDARD/FULL edition identifiers;
- diagnostics;
- the seven real-device acceptance gates and report model;
- stable-Bar revision diff rows.

The boundary prefers explicit fields and `unknown` for intentionally open
server/domain metadata. It does not introduce permissive application-wide `any`
types.

## Runtime database selection

The existing shipping behavior remains authoritative:

```text
allowed editions   LITE | STANDARD | FULL
stored selection   existing internal-db-lab storage contract
fallback order     requested → server default → STANDARD → FULL → LITE
unavailable tier   never selected
```

R1 adds `chooseAvailableRuntimeEdition()` as typed orchestration over the existing
`internalDbSummaryMap()` and normalizer. It does not add a new persistence format
or backend selector.

## Verification

`apps/studio-react/src/legacy/legacy-parity.test.ts` checks:

1. direct wrapper functions are identical to the existing implementation functions;
2. SearchState URL/Writer-param round trips;
3. unknown-query pronunciation and revision-gated cache records;
4. document migration, stable Bar IDs, revisions and portable backup round-trip;
5. IndexedDB-unavailable behavior without replacing DocumentStore;
6. selection proofs, multiline paste and Performance cue ownership;
7. typing-burst undo boundaries and revision move detection;
8. canonical analysis/detail mapping;
9. capability normalization and runtime-edition fallback;
10. diagnostics and all seven device gates;
11. strict TypeScript consumer types.

`runtime-smoke.ts` is imported by the migration shell so Vite production builds
must resolve representative exports from every R1 bridge group. This prevents a
test-only adapter layer that cannot actually ship.

## R1 exit criteria

- [x] SearchState is typed without changing normalization or storage.
- [x] Client query pronunciation/cache is typed without changing policy.
- [x] Document model/store/adapter is typed without moving persistence authority.
- [x] Editor/session/history functions retain their existing implementation.
- [x] Perform functions retain their existing implementation.
- [x] Backup/import contract remains the existing portable format.
- [x] Writer/analysis/detail/capability clients have typed React-facing interfaces.
- [x] LITE/STANDARD/FULL selection uses the existing storage/runtime contract.
- [x] Diagnostics and device-acceptance models are typed.
- [x] Representative semantics and implementation identity are regression-tested.
- [x] Strict TypeScript, Vitest and Vite build pass in the dedicated migration CI.

## What R1 explicitly does not do

R1 does not mark any user-facing parity row complete. Rendering and interaction
parity starts in R2/R3.

R1 also does not:

- change the default product route;
- delete or modify Studio V2 behavior;
- move documents into Zustand;
- move Writer results into a second client-side truth store;
- alter accepted search/ranking/phonology behavior;
- introduce a generic rich-text editor;
- claim the seven physical-device gates are complete.

The next phase is R2: shell/design-system implementation on top of this typed
boundary.
