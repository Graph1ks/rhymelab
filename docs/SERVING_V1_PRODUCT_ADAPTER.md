# RhymeLab Serving V1 — Product Adapter / Acceptance

## Status

Phase 3 candidate. The current product runtime remains on the accepted legacy Core / Generated-opt-in database bundle until the owner-local Product Acceptance report passes.

Required predecessor:

- Serving-v1 identity/dedupe accepted on `canonical-phoneme-stress-v3`;
- Serving-v1 runtime materialization accepted on the same identity revision;
- retrieval-key equivalence accepted;
- `data/local/rhymelab-serving-v1.sqlite` has `runtime_status=complete`.

## Product target

The final product runtime uses one SQLite file:

```text
data/local/rhymelab-serving-v1.sqlite
```

Runtime modes:

- `all`: Core plus genuine Generated-only pronunciation identities — **future default**;
- `core`: Core only — Generated explicitly disabled by the user;
- `generated`: genuine Generated-only candidates.

Core-equivalent Generated source pronunciations were already absorbed in Phase 1 and never regain Generated status.

## Why a Product metadata layer is needed

Serving Phase 1 intentionally retained compact search identity, pronunciation identity, roles and Entity links rather than duplicating every rich source field.

The existing accepted ranking/output code still depends on a limited set of metadata such as:

- DE usage / lexical tags / pronunciation provenance fields;
- EN wordfreq Zipf, lemmas, POS and pronunciation source fields;
- Phrase query-resolution stress/token metadata;
- Entity category-relative popularity and name/pronunciation records.

Phase 3 materializes only this compatibility/ranking subset into the same Serving DB.

It does **not** copy the four old runtime databases into new tables.

## Product metadata tables

### `runtime_lexical_profile`

One compact lexical compatibility row per Serving Surface where needed.

### `runtime_pronunciation_profile`

One compact source/ranking compatibility row per lexical Serving pronunciation.

Core absorption is preserved: a generated source row that maps to an already canonical Serving pronunciation cannot restore a Generated marker.

### `runtime_phrase_profile`

Only Phrase query-resolution metadata not already present in the Phase-2 runtime tables:

- token count;
- variant rank;
- primary/secondary stress syllable positions.

### Entity compatibility tables

- `runtime_entity_identity`
- `runtime_entity_category`
- `runtime_entity_name`
- `runtime_entity_pronunciation`

Distinct QIDs remain distinct even when they share a Surface/pronunciation.

A source eSpeak Entity pronunciation that maps onto a canonical Serving pronunciation is stored as Core-compatible metadata, not as Generated.

### `runtime_entity_writer_anchor`

Phase 2 deliberately compacted Entity Writer anchors into one `entity_writer_right_edge` channel.

Exact legacy Product equivalence still needs the accepted Writer subchannels. Phase 3 therefore preserves only the missing channel distinction:

- `writer_secondary_anchor`
- `writer_secondary_anchor_context`
- any future accepted `writer_*` channel already present in the source runtime.

This avoids rebuilding the 38M-member Phase-2 unified retrieval index.

## Compatibility adapter

`src/serving-v1-product-runtime.mjs` opens the single Serving DB with connection-local TEMP views matching the interfaces consumed by the existing accepted runtime modules.

The important distinction is:

- storage is new and unified;
- scoring/ranking code is reused.

The adapter exposes two read-only connections to the same file:

- Core mode;
- All mode.

Generated-only uses the All connection with the existing Generated-only candidate filter.

The compatibility views cover:

- DE `hot`;
- EN `en_form` / `en_pronunciation`;
- Entity runtime tables;
- Phrase/Mosaic runtime tables.

The DE materialized Writer path uses the Phase-2 `runtime_key` index directly for right-edge retrieval and `runtime_surface_morphology` directly for morphology consensus.

### Persistent parallel product execution

The Serving-v1 Product path uses five long-lived channel workers:

```text
words_de
words_en
phrases_de
entities_de
entities_en
```

The workers are created once, before the preview server or benchmark begins accepting measured work. Each worker owns one read-only connection to the same Serving-v1 file and runs the existing synchronous channel implementation unchanged. Core/All selection changes only the connection-local compatibility views between requests; workers are not spawned per request.

For `scope=all`, eligible channels execute concurrently. The parent merges channel-local results using the same deterministic language/channel ordering rules as `searchUnifiedWriter()`. Regression coverage compares the parallel response directly against the synchronous reference response on the Serving fixture.

The hotpath benchmark and Product Acceptance latency measurement both use this persistent-worker path by default. `scripts/benchmark-serving-v1-hotpaths.mjs --serial` remains available as the synchronous diagnostic reference.

**No cross-request search caching is introduced by this layer.** There is no result cache, score cache, analysis cache or prepared-feature cache shared between requests. Caching is intentionally deferred until after the existing Serving-v1/parallelization plan is completed and measured.

## Build workflow

### Read-only plan

```powershell
npm run serving:v1:product:plan
```

No work copy is created.

### Build / resume

```powershell
npm run serving:v1:product:build
```

Work file:

```text
data/local/rhymelab-serving-v1.product-building.sqlite
```

The initial copy is resumable by byte offset. All metadata stages then use persistent SQLite checkpoints and bounded transactions.

Ordinary rerun resumes.

### Status

```powershell
npm run serving:v1:product:status
```

### Safe reset

```powershell
npm run serving:v1:product:build -- --reset
```

This deletes only incomplete Phase-3 work.

### Promotion

The Phase-2 Serving DB remains untouched until all Product metadata stages, invariants and `PRAGMA quick_check` pass.

The previous Phase-2 file is retained at:

```text
data/local/rhymelab-serving-v1.pre-product.sqlite
```

The Product builder still does **not** rewire `npm start`.

A non-default product preview is available on `main`:

```powershell
npm run dev:serving
```

It routes the normal browser UI and primary local API through this adapter using the same Serving-v1 file for DE Words, EN Words, Phrase/Mosaic and Entities. The five result channels above run through persistent workers rather than serially on the server thread. Core mode remains the preview default; the existing Generated UI toggle switches the worker connections to the adapter's All mode. This preview is explicitly for owner hands-on testing and does not satisfy or bypass the final Product Acceptance switch gate.

## Retrieval equivalence hardening

The Phase-2 retrieval harness now requires DE Generated Writer samples to come from actually populated genuine Generated-only Serving keys.

A Generated DE sample set made entirely of `0 == 0` membership comparisons is a hard coverage failure.

Run after Product build:

```powershell
npm run serving:v1:runtime:equivalence
```

No Phase-2 runtime rebuild is required for this stronger verification.

## Product Acceptance

### Plan

```powershell
npm run serving:v1:product:accept:plan
```

The plan builds a deterministic query matrix but performs no benchmark searches.

### Run / resume

```powershell
npm run serving:v1:product:accept
```

Checkpoint DB:

```text
data/local/rhymelab-serving-v1-product-acceptance-work.sqlite
```

Final report:

```text
data/local/rhymelab-serving-v1-product-acceptance-report.json
```

A normal rerun resumes completed cases.

### Status

```powershell
npm run serving:v1:product:accept:status
```

### Acceptance matrix

The old accepted runtime and Serving-v1 Product adapter are run against the same deterministic inputs in:

- Core mode;
- Core + Generated mode;
- genuine Generated-only mode;
- German;
- English;
- selected cross-language `both` cases;
- Word / Phrase / Entity channels through the unified Writer endpoint.

Semantic comparison covers Product-facing meaning/order:

- query resolution;
- result identity;
- result order;
- normalized surface / IPA;
- rhyme type;
- numeric score/components;
- usage/lexical fields used by ranking;
- Phrase identity;
- Entity QID/category/popularity semantics.

Runtime IDs, database fingerprints and intentionally changed redundant Generated provenance are not treated as Product-semantic mismatches.

### Latency targets

Initial Product-switch targets:

```text
p50 <= 100 ms
p95 <= 250 ms
max <= 1500 ms
```

They can be overridden explicitly for diagnostic runs, but the defaults encode the current performance objective.

Possible report statuses:

- `accepted`: semantic parity and latency gates pass;
- `needs_optimization`: semantic parity passes but latency target does not;
- `failed`: semantic parity fails.

A Product runtime switch is permitted only when:

```text
ready_for_product_runtime_switch = true
```

## Deliberately deferred until owner-local acceptance passes

Phase 3 does not yet:

- make Serving-v1 the default `npm start` runtime; `npm run dev:serving` is an explicit owner preview only;
- remove the legacy runtime opening code;
- flip the UI Generated checkbox default;
- delete source/legacy DB artifacts;
- claim the 80–100 ms objective has been achieved.

Those changes belong to the final switch PR after reviewing the owner-local Product Acceptance report.
