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

Current RhymePad migration status:

~~~text
stable Bar IDs / revisions             DONE
stale-selection proof by Bar ID        DONE
Undo + Redo                            DONE
Enter split / Backspace merge          DONE
explicit multiline paste -> Bars       DONE
IME composition transaction guard      DONE
appearance / custom Quickstyles        DONE
Light/Dark one-click quickswitch       DONE
library search + sort                   DONE
folder create/delete/move              DONE
nested folder hierarchy                 DONE
folder rename + subtree rename          DONE
folder sibling reorder                  DONE
safe subtree delete + song fallback     DONE
trash + restore + permanent delete     DONE
stable revision snapshots / restore     DONE
empty-folder migration to DocumentStore DONE
legacy LocalStorage migration source    READ-ONLY / FALLBACK
IndexedDB DocumentStore shadow          DONE
authoritative DocumentStore cutover     DONE
UI preferences split to LocalStorage    DONE
manual recovery points + restore        DONE
save/revision IndexedDB authority        DONE
canonical analysis                       DONE
Word Laboratory + canonical stress        DONE
verse all-relations workbench             DONE
optional rhyme-chain visualization        DONE
result metadata badges                    DONE
Writer runtime + rolling AVG100 telemetry DONE
live Bar Inspector metrics                DONE
verse totals + duration estimate          DONE
full Perform parity                      DONE
typing-burst undo coalescing              DONE
stable-ID Bar Navigator + reorder          DONE
source-backed parity manifest              DONE · 80 mapped capabilities
static old-vs-new evidence audit            DONE · 73 source gates
real-device parity gates                    REQUIRED · 7 gates
persistent DE / EN UI localization       DONE
serialized autosave queue + lifecycle flush DONE
portable backup import/export             DONE
live DOM acceptance audit                 DONE
searchable desktop command palette        DONE
desktop Library drag-to-folder            DONE
pre-delete automatic recovery checkpoint  DONE
portable full-workspace backup           DONE
browser/runtime diagnostics dashboard    DONE
~~~

The textarea geometry remains the Studio 02 visual baseline while the production document model is introduced behind it.

---

## Stage 10 — Analysis mode

Canonical end-rhyme analysis is now wired through the Writer runtime:

~~~text
batch song rhyme-scheme endpoint       DONE
canonical Writer rhyme relations       DONE
scheme assignment from primary types   DONE
assonance/consonance shown descriptively DONE
unresolved-anchor coverage              DONE
analysis runtime timing                 DONE
bar navigation from analysis            DONE
Word Laboratory IPA/stress               DONE
stress fingerprint                        DONE
relations inside verse                    DONE
all-relations primary/soft filtering      DONE
optional rhyme-chain visualization        DONE
DE / EN / Cross DE+EN analysis controls   DONE
syllable-density estimate labeling       DONE · explicit approximation
~~~

Every visible analysis metric declares its source. Rhyme classification comes from the canonical Writer/backend path; the separate Bar-density chart remains explicitly marked as a local syllable estimate. Word-ending string comparison is no longer presented as rhyme analysis.

---

## Stage 11 — Perform mode

Implementation parity is now wired in Studio:

~~~text
move                          DONE
accent                        DONE
pause                         DONE
breath                        DONE
hold                          DONE
erase                         DONE
drag + accessible alternative DONE
pause length                  DONE
auto-map                      DONE · explicit approximation
clear                         DONE
straight/triplet              DONE
double/half time              DONE
8/16 grid                     DONE
bar metrics                   DONE
stable Bar-ID cue anchors     DONE
text-edit review invalidation DONE
variable-timing metronome     DONE
~~~

Cues now reference stable Bar IDs instead of line indexes. When the text revision of a cued Bar changes, Studio keeps the cue mapping but marks it for explicit review rather than silently moving it. Final browser/audio/touch acceptance remains part of Stage 13.

---

## Stage 12 — Library and persistence

Target browser persistence is IndexedDB. Use localStorage only for small UI preferences.

Required workflows:

~~~text
new                  DONE in Studio shell
open                 DONE in Studio shell
search               DONE in Studio library
sort                 DONE in Studio library
rename               DONE in Studio library
folder create/delete DONE in Studio library
nested hierarchy     DONE via path-backed folder tree
folder rename        DONE including descendants
folder reorder       DONE among sibling subtrees
move                 DONE in Studio library
trash                DONE in Studio library
restore              DONE in Studio library
permanent delete     DONE in Studio library
revision restore     DONE on versioned document snapshots
export               DONE
recovery             DONE · manual points + verified restore
~~~

IndexedDB is now the authoritative browser document source after a verified migration. The old Studio LocalStorage document blob is retained only as the non-destructive migration/fallback source; normal saves write UI preferences to the small preferences key and documents to the versioned IndexedDB DocumentStore. Settings exposes manual recovery points and restore.

Electron persistence remains a later adapter.

---

## Stage 13 — Mobile acceptance

Studio 02 responsive behavior stays the visual base.

Production gates:

- active bar survives mode changes; **ENGINEERED**
- opening results preserves insertion target; **ENGINEERED**
- insertion returns to the exact saved selection; **ENGINEERED**
- keyboard does not hide active line; **ENGINEERED via VisualViewport + active-Bar correction**
- one active main mobile scroller; **ENGINEERED; nested Analysis scroll removed and editor scroll locks while tool dock owns scrolling**
- primary touch targets at least 44×44 CSS px; **ENGINEERED for primary mobile controls**
- no hover-only action; **ENGINEERED; Quickstyles has an explicit touch/menu trigger while the main button remains the Light/Dark QuickSwitch**
- reduced motion works; **ENGINEERED**

These gates still require real device/browser acceptance before the default-route switch.

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

The reversible cutover wiring is implemented but remains disabled by default until real-device acceptance passes.

Preview the exact production route shape with:

~~~bash
npm run dev:studio-default
~~~

Preview routing:

~~~text
/           -> Studio
/search     -> previous Search
/legacy     -> previous Search alias
/pad        -> current RhymePad
/pad-legacy -> explicit RhymePad legacy alias
/studio     -> Studio
~~~

The same mode can be enabled with `RHYMELAB_STUDIO_DEFAULT=1`. Normal `npm run dev` still serves the existing Search at `/`.

Cutover is guarded by:

~~~bash
npm run studio:v2:cutover:code
npm run studio:v2:cutover:check
~~~

The full gate requires explicit real-device evidence for all seven gates. Settings provides guided launchers for each gate and records the hardware/browser environment with the evidence. Mobile gates can only be confirmed on a touch/coarse-pointer viewport at or below 800 CSS px; invalid evidence is rejected during normalization and called out by the cutover CLI.

Multi-device flow:

~~~bash
# export partial reports from Settings on the tested devices
npm run studio:v2:acceptance:merge -- desktop.json mobile.json
npm run studio:v2:cutover:check
npm run studio:v2:accepted-preview
~~~

The accepted-preview command runs the full cutover gate before starting `--studio-default`. No old route is deleted in the first production switch commit.

---

# Immediate implementation sequence

~~~text
1  exact Studio 02 import                  DONE
2  parallel /studio route                  DONE
3  parity matrix                           DONE
4  route/design regression test            DONE
5  extract CSS/JS without visual change     DONE
6  reference palettes + custom Quickstyles DONE
7  functional module split                  DONE
8  capability wiring                         DONE
9  live /api/writer search                   DONE
10 detail/provenance parity                  DONE
11 complete filter parity                    DONE
12 shared SearchState                        DONE
13 document/editor spike                     DONE
14 RhymePad migration                        DONE · implementation parity
15 IndexedDB authoritative cutover            DONE
16 Library / folders / trash workflows        DONE
17 stable revision + recovery workflow         DONE
18 Perform parity                              DONE
19 canonical analysis                         DONE
20 mobile acceptance engineering              DONE
21 legacy metadata badges + runtime telemetry DONE
Entity category multi-select             DONE · shared SearchState + OR runtime retrieval
22 hierarchical Library tree                   DONE
23 Analysis workbench / Word Laboratory        DONE
24 Bar Inspector + verse totals                DONE
25 portable backup + restore                    DONE
26 browser/runtime diagnostics                  DONE
27 DE / EN interface localization               DONE
28 searchable command palette                  DONE
29 lifecycle persistence hardening             DONE
30 desktop Library direct manipulation         DONE
31 live DOM acceptance audit                   DONE
32 typing undo coalescing                    DONE
33 Bar Navigator / stable-ID reorder           DONE
34 source-backed exhaustive parity manifest      DONE
35 acceptance center parity integration         DONE
36 reversible default-route preview             DONE
37 deterministic cutover release gate           DONE
38 guided real-device acceptance workflow      DONE
39 environment eligibility enforcement          DONE
40 multi-device acceptance merge CLI            DONE
41 real device/browser acceptance              REQUIRED · 7 device gates
~~~

The first user-review checkpoint is intentionally after steps 1–4 so visual feedback can happen before production behavior starts reshaping the surface.
