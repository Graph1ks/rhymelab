# React Studio R3 — Search / Writer

Status: **IMPLEMENTED / AUTOMATED VERIFIED / BROWSER ACCEPTANCE DEFERRED**  
Parent plan: `docs/REACT_STUDIO_REPLATFORM.md`  
R1 boundary: `docs/REACT_STUDIO_R1_TYPED_BRIDGE.md`  
R2 shell: `docs/REACT_STUDIO_R2_SHELL.md`  
Machine-readable inventory: `apps/studio-react/r3-search-manifest.json`

## Purpose

R3 ports the existing Search / Writer product surface into the React shell without
changing the accepted Writer, pronunciation, capability, runtime-edition or detail
semantics.

The governing boundary remains:

```text
React Search/Writer UI
        |
        +-- shared SearchState provider
        +-- TanStack Query server-state orchestration
        +-- Search presentation state
        |
R1 typed bridges
        |
existing SearchState / query pronunciation / Writer / detail / capability logic
        |
existing local HTTP API
        |
Node / Serving-v1 / SQLite
```

R3 does not add a second search engine, ranking implementation, pronunciation
policy or runtime database selector.

## Shared SearchState

One `SearchStateProvider` wraps the React shell. Search and the Studio Sound
Explorer therefore consume the same state for:

- anchor;
- query pronunciation basis;
- result language;
- scope;
- rhyme relation;
- syllable filter;
- sort;
- pronunciation variants;
- historical/generated corpus policy;
- Entity taxonomy selection;
- selected Writer result.

Persistence and URL encoding still use the existing R1/legacy SearchState functions.

The first React Studio state preserves the current Studio first-run route:

```text
anchor          Nacht
query basis     de
result language both
```

An already stored SearchState or explicit URL state remains authoritative.

## Writer request path

The React query layer calls the existing `createWriterSearchClient()`.

The request contract remains:

```text
query
queryBasis
resultLanguage
scope
rhymeType
syllableFilter
includeVariants
includeHistorical
generated
generatedOnly
entityCategory / entityCategories
queryPronunciationRevision
runtimeDb
```

The existing Writer client still owns:

- SearchState -> Writer parameter mapping;
- source-backed query lookup;
- unknown client pronunciation;
- pronunciation cache policy/revision gating;
- retry with generated query IPA;
- stale-request cancellation;
- Writer response mapping;
- runtime/client timing extraction.

Changing UI sort order remains client-only, matching Studio V2; it does not issue a
new Writer request.

## Search controls

R3 implements the current direct controls:

- DE / EN / DE+EN query -> result routes;
- All / Words / Phrases / Entities;
- full rhyme/sound relation matrix;
- Same / ±1 / ±2 / ±3 / exact syllable modes;
- Recommended / proximity / common / syllable / A-Z sort;
- preferred/all pronunciation variants;
- current/generated/generated-only/historical corpus modes;
- Entity taxonomy multi-select with the current 24-category request bound;
- reset;
- RhymePad-compatible presets:
  - Best;
  - Words;
  - Phrases;
  - Entities;
  - each supported rhyme relation.

Generated modes are disabled when the active runtime capability does not expose
generated data. Pronunciation variants remain unavailable for Phrase/Entity-only
scope, matching the current surface.

## Runtime editions

R3 uses the existing R1 runtime-edition functions for:

- stored selection;
- availability map;
- capability overlay;
- requested -> server default -> STANDARD -> FULL -> LITE fallback.

When the existing distribution switcher endpoint is enabled, LITE/STANDARD/FULL are
shown and missing editions remain disabled.

Normal startup may intentionally keep that selector endpoint disabled. The existing
`/api/health` payload already exposes the actual shipping edition through
`serving_v1.internal_db`; R3 reads that value only for the active-edition label.
It does not create a second selection/fallback policy.

## Results

R3 provides:

- List;
- Compact;
- Tiles;
- Compact as the first-run density while preserving an existing preference;
- continuous reveal without a Load More control;
- bounded TanStack Virtual rendering for List/Compact;
- automatic fill when the viewport has not filled yet;
- current result metadata and badges;
- specific Entity taxonomy labels;
- no generic individual `Entity / Entität` item type;
- neutral malformed-Entity fallback `Named item / Eigenname`.

The existing filter and sort functions from
`src/studio/search-filters.mjs` are identity-reused.

## Hide used

Hide-used reads the active document **read-only** from the existing IndexedDB
DocumentStore, with the existing legacy state only as a fallback when IndexedDB is
unavailable.

It preserves the current matching rule:

- Word candidate: exact normalized lyric token;
- Phrase/Entity candidate: normalized candidate contained in normalized tracked lyric
  text;
- NFKC + lowercase + collapsed whitespace normalization;
- blank lines and fully bracket-only lines excluded;
- inline bracket metadata removed before matching.

R3 never writes editor/document state.

## Auto-scroll and continuous results

Auto-scroll keeps the existing Studio behavior:

- explicit opt-in;
- requestAnimationFrame scrolling;
- current scroll rate;
- manual wheel/touch/pointer/focus pause;
- continued result reveal at the bottom;
- loop to the beginning after all available rows are visible.

Manual scrolling also expands the visible result window near the bottom. No paging
buttons are introduced.

## Detail / provenance

Selecting a result opens the existing detail model:

- IPA;
- pronunciation variants;
- stress;
- rhyme/sound relations;
- word/Phrase/Entity metadata;
- usage;
- lexical tags;
- Entity categories/QID;
- source/provenance information.

The existing detail client remains authoritative. If the detail endpoint cannot
respond, the surface falls back to the already available Writer-row model rather
than fabricating detail data.

## Saved results

The React Saved surface reads and writes the existing Studio preference format:

```json
{ "word": "...", "anchor": "..." }
```

Search and the Studio assistant use the same saved-result state. Selecting a saved
item restores its anchor into the shared SearchState and opens Search.

## Keyboard behavior

R3 ports the Search-owned keyboard actions:

- Arrow Up/Down: result selection;
- Space: toggle saved state.

The existing Enter-to-insert action is **not faked** in R3.

A safe insert needs the real editor state from R5:

- stable Bar ID;
- current selection;
- Selection Proof;
- stale-selection validation;
- IME transaction safety;
- undo/redo integration.

Until R5 supplies that contract, Insert controls remain visible but disabled with an
explicit explanation. Consequently `search.keyboard` remains `in_progress`, not
`ported` or `verified`.

The same dependency applies to:

- selection-follow as the default rhyme anchor;
- fixed-anchor opt-in.

Those are completed together with the real React editor in R5.

## Responsive / scroll ownership

Search owns one bounded result scroll surface inside the fixed R2 application shell.

```text
app viewport
  topbar
  SearchExperience
    controls
    result toolbar
    results scroller   <-- primary Search scroll owner
    bounded detail
  mobile navigation
```

The Search route does not add a page scrollbar around the result scroller. The
desktop Studio assistant uses the same SearchExperience implementation rather than
a separate search implementation.

Mobile Search remains reachable through the bottom navigation. The legacy
single-surface editor/results swap remains a later editor-integrated acceptance item
because the React editor itself is R5.

## R3 automated verification

`apps/studio-react/src/features/search/r3-search.test.ts` protects:

1. identity reuse of legacy filter/sort/density functions;
2. Compact default;
3. exact RhymePad preset composition;
4. all nine query/result language routes;
5. all six corpus modes;
6. exact SearchState -> Writer option mapping;
7. STANDARD -> FULL -> LITE fallback behavior;
8. active edition extraction from existing health metadata;
9. tracked-text/bracket exclusion for hide-used;
10. Word versus Phrase/Entity hide-used matching;
11. specific Entity category presentation and neutral fallback.

Focused verification:

```bash
npm run studio:react:r3
```

The dedicated React CI still runs the complete R1 + R2 + R3 test set, strict
TypeScript, parity inventory validation and the production Vite build.

## Parity status

R3 Search rows that have been implemented are marked `ported`, not
`verified`.

That distinction is intentional:

- automated parity and production build are complete;
- browser geometry/input behavior still needs R7 acceptance;
- Enter insertion and selection-follow/fixed-anchor need R5.

The global cutover condition remains **93 / 93 VERIFIED**.

## R3 exit

- [x] one shared SearchState across React Search and Studio;
- [x] live existing Writer client in React;
- [x] existing client query pronunciation path retained;
- [x] query/result language routes;
- [x] scope/relation/syllable/sort/variant/corpus controls;
- [x] Entity taxonomy multi-select;
- [x] presets;
- [x] capability-driven states;
- [x] LITE/STANDARD/FULL availability + active database presentation;
- [x] Hide-used against existing document authority;
- [x] List / Compact / Tiles;
- [x] continuous results;
- [x] auto-scroll/manual pause;
- [x] result metadata;
- [x] detail/IPA/provenance;
- [x] loading/empty/error/warning states;
- [x] Saved result compatibility;
- [x] Arrow selection + Space save;
- [x] unsafe editor insertion explicitly blocked until R5;
- [x] no R1 bridge or accepted domain implementation changed.

Next phase: **R4 — Library / persistence / recovery**.
