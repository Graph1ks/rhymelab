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
- TanStack React Virtual 3.14.9;
- Vite 8.3.0;
- @vitejs/plugin-react 6.1.1;
- TypeScript 5.9.x;
- Vitest 5.0.x.

The Vite-based frontend build/development toolchain requires Node.js 22.12+; this does **not** raise the existing RhymeLab shipping/runtime minimum by itself. Built frontend assets remain served by the existing local runtime.

Before a later dependency bump, run the full parity gate. Dependency upgrades are not bundled casually into functional port work. Vite is configured to emit a bundled dependency license inventory with production builds.

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

R0 is initiated on `refactor/react-studio-replatform`.

Initial files live under:

```text
apps/studio-react/
```

The application is intentionally isolated from the shipping root route. The legacy Studio remains untouched while the new stack is established and verified.
