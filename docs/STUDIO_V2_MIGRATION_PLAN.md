# Studio 02 Migration Plan

## Goal

Integrate the supplied Studio 02 design as the new RhymeLab product shell without losing Search or RhymePad semantics.

The design is treated as a golden master first. Functional integration must adapt to the design rather than rebuilding the previous control wall inside it.

## Branch

~~~text
feature/studio-v2-ui-redesign
~~~

Base:

~~~text
033b64ddaa96d32563b08f279da53b5bd1315684
~~~

The base includes the intentionally paused Markov V2 work. Markov is not part of the first Studio integration gate.

---

## Stage 0 — Reference import and contract

### Files

~~~text
src/studio/index.html
docs/UI_REDESIGN_PARITY.md
docs/STUDIO_V2_MIGRATION_PLAN.md
tests/studio-v2-source.test.mjs
src/server.mjs
~~~

### Result

- exact supplied Studio 02 prototype is available at /studio;
- / and /pad remain unchanged;
- visual golden-master markers are regression-tested;
- parity matrix is explicit before product wiring.

### Acceptance

GET /studio and GET /studio/ resolve to Studio 02 without changing existing routes.

---

## Stage 1 — Extract Studio into maintainable modules without visual change

Mechanical refactor only.

### Target files

~~~text
src/studio/
  index.html
  styles.css
  app.js
  studio-core.mjs
  studio-controls.mjs
  search-adapter.mjs
  document-adapter.mjs
  capability-adapter.mjs
  query-pronunciation-client.mjs
  query-pronunciation-cache.mjs
~~~

Pixel/layout behavior must remain equivalent to the imported single-file reference.

The 100 KB single-file prototype remains the initial visual reference but not the desired long-term implementation shape.

---

## Stage 2 — Capability adapter

Wire /api/health and /api/dataset-stats.

Studio needs capability state for:

~~~text
DE Writer
EN Writer
Phrase/Mosaic
Entities
Generated data
query-pronunciation revisions
Serving-v1 runtime
~~~

The UI must not know SQLite paths or Node internals.

Files:

~~~text
src/studio/capability-adapter.mjs
src/studio/app.js
tests/studio-capability.test.mjs
~~~

Server API changes are allowed only if a real missing capability is demonstrated.

---

## Stage 3 — Live Writer adapter

Replace demo datasets with /api/writer.

Do not retune retrieval, ranking, phonetic classification, usage ranking, Phrase/Mosaic ranking, Entity ranking or pronunciation provenance during this UI stage.

Search adapter responsibilities:

~~~text
query pronunciation basis
result language
scope
rhyme relation
syllable filter
sort
variant mode
historical mode
generated/generated-only
entity category/categories
cursor/page state
unknown-query client IPA
request cancellation
latest-request wins
~~~

Reuse/adapt:

~~~text
src/ui/query-pronunciation-client.mjs
src/ui/query-pronunciation-cache.mjs
existing /api/writer contract
existing Entity taxonomy labels
existing result presentation semantics
~~~

Tests must execute actual state changes and request construction, not merely inspect selectors.

---

## Stage 4 — Search result parity in Studio

Wire real Writer result rows into the existing Studio 02 result surfaces:

~~~text
List
Compact
Tile/field
Detail dock
Saved candidates
More / infinite paging
Keyboard selection
Insert
~~~

Detail dock gains contextual production sections without changing Studio geometry:

~~~text
pronunciation / IPA
variant provenance
primary rhyme class
assonance / consonance
syllables / stress
lexical metadata
usage/commonness
Phrase/Mosaic metadata
Entity category/popularity
source/provenance
~~~

Rare diagnostics remain outside the normal list.

---

## Stage 5 — Full filters without control-wall regression

Permanent surface remains intentionally small:

~~~text
anchor
scope
query pronunciation
result language
primary relation
syllable quick filter
sort
active filter chips
density
~~~

Contextual controls appear only when applicable:

~~~text
Entity categories
pronunciation variants
Generated
Historical
~~~

A bounded advanced-filter surface carries the remainder of the legacy matrix. No fourth permanent desktop column.

---

## Stage 6 — Shared SearchState

Standalone Reimsuche and Studio Inspector must share one model.

Suggested shape:

~~~text
SearchState
  anchor
  queryBasis
  resultLanguage
  scope
  relation
  syllableFilter
  sort
  variantMode
  historical
  generated
  generatedOnly
  entityCategories
  cursor
  selectedResultId
~~~

Navigation preserves valid search context and selected result.

---

## Stage 7 — Document model adapter

The demo localStorage data model must not become the production document model.

Target stable identities:

~~~text
Song
  id
  title
  folderId
  createdAt
  updatedAt
  deletedAt
  schemaVersion

Bar
  id
  songId
  orderKey
  text
  revision

Revision
  id
  songId
  createdAt
  documentSnapshot
  reason
~~~

Existing RhymePad content is backed up/exported before import.

Migration must be versioned, repeatable, non-destructive and verified by IDs/count/content. The old source is not deleted on first successful import.

---

## Stage 8 — Production editor spike

Before replacing the compressed RhymePad editor, validate geometry independently.

Required fixture cases:

~~~text
200 bars
very long wrapped bars
mixed DE/EN
emoji/punctuation
IME composition
multi-word selection
paste
Enter split
undo/redo
200% zoom
font size 16–28
mobile keyboard viewport
~~~

Do not add CodeMirror merely because the concept proposes it. Prove that it improves stable bar identity, gutter alignment, selection, IME, decorations, cue anchoring and mobile behavior first.

---

## Stage 9 — RhymePad writing parity

Migrate one group at a time:

1. writing/editing;
2. appearance;
3. save/revisions;
4. library/folders/trash;
5. live rhyme suggestions;
6. analysis;
7. performance.

Each group requires a parity test before the old implementation is considered replaceable.

---

## Stage 10 — Analysis mode

Replace demo heuristics.

Every visible metric declares its source as one of:

~~~text
canonical Writer/backend
existing RhymePad heuristic
explicit approximation
~~~

Do not present word-ending string comparisons as canonical rhyme analysis.

---

## Stage 11 — Perform mode

Preserve:

~~~text
move
accent
pause
breath
hold
erase
drag + accessible alternative
pause length
auto-map
clear
straight/triplet
double/half time
8/16 grid
bar metrics
~~~

Cues reference stable Bar/token anchors. Text edits mark invalidated cues for review rather than silently moving them.

---

## Stage 12 — Library and persistence

Target browser persistence is IndexedDB. Use localStorage only for small UI preferences.

Required workflows:

~~~text
new
open
search
sort
rename
folder create/delete
move
trash
restore
permanent delete
revision restore
export
recovery
~~~

Electron persistence remains a later adapter.

---

## Stage 13 — Mobile acceptance

Studio 02 responsive behavior stays the visual base.

Production gates:

- active bar survives mode changes;
- opening results preserves insertion target;
- insertion returns to the exact saved selection;
- keyboard does not hide active line;
- one active main mobile scroller;
- primary touch targets at least 44×44 CSS px;
- no hover-only action;
- reduced motion works.

Full offline mobile Writer runtime remains a separate technical project.

---

## Stage 14 — Electron adapter

Only after browser Studio parity.

Renderer does not receive direct Node/SQLite access.

Target boundary:

~~~text
SearchService
DocumentStore
CapabilityService
ExportService
~~~

Electron uses a narrow validated preload/IPC adapter.

---

## Stage 15 — Default-route switch

Only after docs/UI_REDESIGN_PARITY.md is accepted.

Transition concept:

~~~text
/           -> Studio
/legacy     -> previous Search
/pad-legacy -> previous Pad
~~~

Exact legacy route names are finalized at cutover. No old route is deleted in the first switch commit.

---

# Immediate implementation sequence

~~~text
1  exact Studio 02 import                  DONE
2  parallel /studio route                  DONE
3  parity matrix                           DONE
4  route/design regression test            DONE
5  split prototype into modules            NEXT
6  capability wiring
7  live /api/writer search
8  complete filter parity
9  detail/provenance parity
10 shared SearchState
11 document/editor spike
12 RhymePad migration
~~~

The first user-review checkpoint is intentionally after steps 1–4 so visual feedback can happen before production behavior starts reshaping the surface.
