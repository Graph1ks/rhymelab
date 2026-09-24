# React Studio replatform — P0 migration contract

Status: **ACTIVE / P0 / FEATURE FREEZE**  
Branch: `refactor/react-studio-replatform`  
Baseline: `main@fbda43a9e4dd`  
Target: React + TypeScript + Vite + Base UI + Motion + TanStack Query + Zustand + TanStack Virtual

## Owner decision

RhymeLab product feature development is frozen while the current browser frontend is replatformed.

Allowed work during the freeze:

- React replatform work;
- parity/regression tests and migration tooling;
- bug fixes required to preserve already-existing behavior;
- security/correctness fixes that cannot reasonably wait;
- documentation/CI required for the migration.

Not allowed during the freeze without an explicit owner instruction:

- new product features;
- opportunistic UX behavior changes disguised as migration;
- removal or simplification of existing controls/workflows;
- backend/ranking/data redesign merely because the frontend is moving to React.

## Non-negotiable invariant

**The React Studio is not allowed to replace Studio V2 until it preserves every existing user-facing capability and interaction contract.**

The existing Studio V2 implementation on the baseline commit is the behavioral golden master. The new application may improve internal structure, accessibility implementation, component boundaries and rendering architecture, but it may not silently change product semantics.

The cutover gate is conjunctive:

1. every capability in `src/studio/parity-manifest.mjs` is represented in `apps/studio-react/parity-coverage.json`;
2. every additional Workflow UX v3 behavior from the baseline commit is represented;
3. every row is `verified`, not merely implemented;
4. existing deterministic Writer/Serving-v1 semantics are unchanged;
5. automated React unit/component/integration tests pass;
6. existing repository tests pass;
7. browser E2E parity passes for the migration-critical flows;
8. the existing seven real-device/touch/Web Audio gates remain required;
9. the old Studio remains available as a rollback surface through the cutover burn-in.

No percentage-complete shortcut is permitted. 99% parity is a failed cutover.

## Architecture boundary

The migration is a frontend replatform, not a product/runtime rewrite.

```text
React / TypeScript / Vite
        |
        +-- Base UI primitives
        +-- Motion
        +-- TanStack Query      -> async API/server state
        +-- Zustand             -> ephemeral UI/session state
        +-- TanStack Virtual    -> large result/list rendering
        |
existing browser-domain modules/adapters
        |
existing local HTTP API
        |
Node.js / Serving-v1 / SQLite
```

The accepted Writer, Phrase/Mosaic, Entity, query-pronunciation, analysis and Serving-v1 behavior stays authoritative.

## State ownership

| State class | Owner after replatform |
| --- | --- |
| Writer/detail/analysis/capability requests | TanStack Query |
| transient shell/UI state | Zustand |
| songs/folders/revisions/recovery | existing IndexedDB DocumentStore |
| editor semantics, stable Bar IDs, selection proofs, split/merge/paste/IME | existing domain logic, wrapped by typed adapters |
| performance cue semantics | existing performance-session logic |
| appearance tokens | CSS custom properties + CSS Modules |
| motion/presence/layout transitions | Motion, with reduced-motion respected |

Do **not** copy persistent document authority into Zustand. Do **not** move canonical search/ranking state into React-only logic.

## Package baseline at migration start

Versions are deliberately pinned in the new isolated frontend package so dependency drift cannot silently change migration behavior:

- React 19.3.0;
- Base UI 1.8.0;
- Motion 13.4.0;
- TanStack React Query 5.103.1;
- Zustand 5.0.15;
- TanStack React Virtual 3.14.13;
- Vite 8.3.0;
- @vitejs/plugin-react 6.1.1;
- TypeScript 5.9.3;
- Vitest 5.0.x.

The Vite-based frontend build/development toolchain requires Node.js 22.12+; this does **not** raise the existing RhymeLab shipping/runtime minimum by itself. Built frontend assets remain served by the existing local runtime.

Before a later dependency bump, run the full parity gate. Dependency upgrades are not bundled casually into functional port work. Vite is configured to emit a bundled dependency license inventory with production builds. The resolved frontend dependency tree is committed in `apps/studio-react/package-lock.json`; CI and the root install helper use `npm ci`.

## Migration phases

### R0 — freeze, inventory, scaffold

- freeze feature development;
- capture the exact baseline commit;
- create machine-readable parity inventory;
- add React/Vite/TypeScript application shell;
- add dedicated React CI;
- preserve old Studio unchanged.

Exit: inventory gate passes and the scaffold typechecks/tests/builds.

### R1 — shared typed contracts and adapters

Port/wrap existing browser-compatible domain modules without changing semantics:

- SearchState;
- query pronunciation client/cache;
- document model/store/adapter;
- editor-session;
- edit-history;
- performance-session;
- backup portability;
- analysis/detail/search adapters;
- capabilities and runtime-edition selection;
- diagnostics/device-acceptance data models.

Exit: adapters have parity tests against the existing modules.

### R2 — shell + design system

Implement:

- app shell/sidebar/topbar/mobile nav;
- Light/Dark/custom semantic themes;
- DE/EN UI language;
- command palette;
- Base UI primitives for dialog/popover/select/menu/tooltip/drawer;
- focus restoration;
- reduced motion;
- responsive geometry and single-scroll ownership.

No feature semantics are changed.

### R3 — Search / Writer

Port every Search/Writer parity item:

- query/result language;
- scopes;
- rhyme relations;
- syllable filters;
- sorts;
- variants;
- historical/generated modes;
- Entity taxonomy multi-select;
- presets/hide-used/autoscroll;
- compact/list/tile behaviors where applicable;
- continuous loading;
- result detail/provenance;
- keyboard navigation;
- all empty/loading/error/capability states;
- active runtime DB selection/visibility.

### R4 — Library / persistence / recovery

Port DocumentStore-backed Library and destructive-operation safeguards before the editor:

- folders, subtree operations and ordering;
- document create/open/search/sort/rename/move;
- trash/restore/permanent delete;
- pre-delete recovery;
- portable backup/import;
- autosave/lifecycle flush.

### R5 — editor

Highest-risk phase. Preserve:

- one unified document;
- tracked/free lines and bracket metadata;
- stable Bar IDs;
- selection-follow and fixed-anchor opt-in;
- selection proofs;
- replace/split/merge/paste;
- IME transaction behavior;
- undo/redo coalescing;
- font/size/theme controls;
- Bar actions;
- Bar navigator;
- hold-drag transport;
- section long-press insertion;
- revision compare-before-restore.

No generic rich-text framework is introduced unless separately approved after a demonstrated parity prototype.

### R6 — Analysis + Perform

Port all canonical analysis and performance workflows, including Web Audio and cue-state invalidation.

### R7 — automated parity + real-device matrix

Required:

- unit/domain tests;
- React component interaction tests;
- browser E2E;
- keyboard/focus flows;
- touch target checks;
- viewport/software keyboard behavior;
- IME;
- Web Audio;
- reduced motion;
- import/export/recovery;
- runtime edition switching;
- parity inventory cutover mode.

### R8 — reversible cutover

Only after all rows are verified:

- serve React Studio as default;
- retain old Studio at an explicit rollback route;
- keep Search/RhymePad regression routes during burn-in;
- compare diagnostics/behavior;
- remove old frontend only in a later dedicated cleanup after owner approval.

## Testing rule

Presence is not interaction. The current `docs/UI_INTERACTION_CONTRACT.md` remains authoritative.

Every ported primary control requires a test that exercises the registered React interaction and verifies the resulting state/behavior. Snapshot/source tests alone are insufficient.

## Rollback

The existing Studio V2 source is not deleted during migration. Until the owner approves cleanup after cutover, the old frontend remains the behavioral reference and rollback implementation.

## Current implementation checkpoint

R0 through R7 source parity are complete on `refactor/react-studio-replatform`.

```text
R0  scaffold / freeze / parity inventory        VERIFIED
R1  typed legacy domain bridge                  VERIFIED
R2  shell + design system                       AUTOMATED VERIFIED
R3  Search / Writer                             AUTOMATED VERIFIED
R4  Library / persistence / recovery            AUTOMATED VERIFIED
R5  editor                                      AUTOMATED VERIFIED
R6  Analysis + Perform                          AUTOMATED VERIFIED
R7  source parity + acceptance infrastructure   AUTOMATED SOURCE COMPLETE
    real-browser / physical-device evidence     ACTIVE
R8  reversible cutover                          BLOCKED
```

R1 wraps 18 existing browser/domain modules behind strict TypeScript contracts
without replacing their implementation:

`docs/REACT_STUDIO_R1_TYPED_BRIDGE.md`

R2 establishes the real React application shell, semantic design system, responsive
geometry, navigation, appearance controls, command palette and VisualViewport
wiring:

`docs/REACT_STUDIO_R2_SHELL.md`

R3 places the live existing Search/Writer path into both the React Search surface
and Studio Sound Explorer using one shared SearchState and the R1 Writer,
pronunciation, detail, capability and runtime-edition bridges:

`docs/REACT_STUDIO_R3_SEARCH_WRITER.md`

R4 places Library, the authoritative IndexedDB DocumentStore workflow, serialized
autosave, Trash/Restore, Recovery and portable backup/import into the React shell
without introducing a parallel React/Zustand document authority:

`docs/REACT_STUDIO_R4_LIBRARY_PERSISTENCE.md`

R5 places the unified editor, stable Bar identity, native text editing, IME/undo
boundaries, Selection Proof Writer insertion, revisions, Bar workflows, mobile
Editor/Results swap, hold-drag and section long-press on that exact R4 persistence
path:

`docs/REACT_STUDIO_R5_EDITOR.md`

R6 places canonical end/all-rhyme Analysis, Word Laboratory/Stress/Chain/Bar
Inspector projections and stable-Bar-ID Perform sequencing onto the existing R1
analysis/performance contracts. Perform writes reuse the R5 history/revision boundary
and R4 persistence path; Web Audio browser acceptance remains deferred:

`docs/REACT_STUDIO_R6_ANALYSIS_PERFORM.md`

R7 closes all remaining source rows, adds fail-closed startup/diagnostics/device
acceptance infrastructure, single-drawer scroll ownership and an opt-in reversible
React preview route without changing the normal root route:

`docs/REACT_STUDIO_R7_PARITY.md`

Focused verification:

```bash
npm run studio:react:r1
npm run studio:react:r2
npm run studio:react:r3
npm run studio:react:r4
npm run studio:react:r5
npm run studio:react:r6
npm run studio:react:r7
```

The application remains intentionally isolated from the shipping root route. Studio
V2 is still the shipping behavioral golden master and rollback implementation.
R7 source parity is now 93 `ported`, 0 `in_progress`, 0 `pending` and
0 `verified`. This is not cutover readiness. Real-browser interaction evidence and
the seven physical device gates remain active R7 work. R8 stays blocked until every
mandatory row is `verified` and `npm run studio:react:r7:cutover` passes.
