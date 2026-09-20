# Local API

RhymeLab exposes a localhost-only HTTP API from `src/server.mjs` at `http://127.0.0.1:3030`.

### Serving-v1 product preview

The accepted multi-database runtime remains the default for `npm run dev`. To exercise the current one-file Serving-v1 Product adapter through the **real RhymeLab browser UI and normal API routes**, run:

```powershell
npm run dev:serving
```

This opens `data/local/rhymelab-serving-v1.sqlite` for the normal browser UI and starts five persistent `worker_threads` for the expensive result channels:

```text
DE Words
EN Words
DE Phrase/Mosaic
DE Entities
EN Entities
```

Each worker owns one long-lived read-only SQLite connection. For an `all` search the eligible channels execute concurrently and the parent process merges their already-deterministic channel results in the same order/shape as the synchronous reference implementation. The browser stays at `http://127.0.0.1:3030/`; no alternate UI is used. Generated data is included by default when the accepted/generated-capable runtime is available. Unchecking the Generated checkbox is an explicit Core-only opt-out; Generated only keeps using the existing provenance filter inside the unified Writer pipeline.

This worker runtime deliberately adds **no cross-request result, score, analysis or prepared-feature cache**. Caching remains deferred; the performance gain here is parallel execution only.

Override the preview database path with:

```text
RHYMELAB_SERVING_V1_DB  Serving-v1 Product database path
```

Equivalent direct startup is `node src/server.mjs --serving-v1` or `RHYMELAB_PRODUCT_RUNTIME=serving-v1`. This is a product-preview route on `main`, **not** the final default-runtime promotion; `npm run dev` and `npm start` remain on the accepted bundle until the Product Acceptance switch gate passes.

## Current runtime — v0.11.0

Normal API/UI requests use the promoted Writer runtime:

```text
package               v0.11.0
writer DB             data/local/rhymelab-v5.sqlite
writer DB schema      rhymelab-local-db-v5
writer runtime        materialized-writer-v5-v1
writer ranking        deterministic_writer_utility_v6
right-edge anchor     de-right-edge-anchors-v1
morphology            de-attested-right-head-v4
construction          de-adverbial-weise-v2
```

The previous v0.10 / DB-v4 engine is retained only as the optional legacy/control path via `?ranking=legacy`.

## Runtime databases

Default paths:

```text
Writer v5             data/local/rhymelab-v5.sqlite
English Writer         data/local/rhymelab-en-v1.sqlite
Legacy/control v4      data/local/rhymelab.sqlite
```

Writer v5 is required for normal server startup. The legacy v4 DB is optional. If it is unavailable, normal Writer requests continue to work and only explicit `?ranking=legacy` requests fail with a clear control-database error.

Environment overrides:

```text
RHYMELAB_WRITER_DB     Writer v5 database path
RHYMELAB_ENGLISH_DB    English Writer database path
RHYMELAB_ENGLISH_ACCEPTANCE_MARKER  English local acceptance marker path
RHYMELAB_LEGACY_DB     legacy/control v4 database path
RHYMELAB_DB            compatibility alias for legacy/control v4 path
RHYMELAB_HOST          bind host, default 127.0.0.1
RHYMELAB_PORT          port, default 3030
```

## `GET /api/health`

Returns local runtime status including:

- `writer_database`;
- `writer_runtime`;
- whether the legacy/control DB is available;
- the legacy DB path/error when applicable;
- `unified_writer` language/channel capabilities, including whether German Word Writer and Phrase/Mosaic are ready and whether an English runtime is installed.
- `query_pronunciation_revision` — SHA-256 revision of the active pronunciation/search DB file state plus DB metadata; the browser uses it once per app session to validate persistent generated-pronunciation cache rows.
- `query_pronunciation_cache` — cache schema/revalidation metadata.
- `parallel_search` — Serving-v1 preview worker status, execution policy and channel list.

## `GET /api/writer?q=<word-or-phrase>`

This is the normal unified product endpoint for the main Writer UI.

### Surface consolidation

Product-visible Word/Entity results are consolidated by `language + normalized surface`.

- If a Word/Core result and one or more Entity results share a surface, the Word result remains the visible carrier and keeps its lexical/Core pronunciation and Writer ranking fields.
- Entity taxonomy categories and distinct QIDs are attached as `entityCategories`, `entityQids`, and `entityIdentities`.
- Multiple same-name Entity rows collapse to one visible Entity surface when no Word result is present.
- Alternate pronunciations are retained in `surfacePronunciations` rather than emitted as duplicate cards.
- Phrase/Mosaic results are not merged into lexical surfaces because their displayed IPA may represent a matched mosaic span rather than the full phrase.

The response `counts.surfaceAggregation` block reports pre/post consolidation row counts. Search-pool counts remain retrieval diagnostics and are not reduced by presentation consolidation.

Parameters:

- `q=<text>` — one word or a multi-word query;
- `language=de|en|both` — query-pronunciation language basis; this determines how the input surface is resolved;
- `result_language=de|en|both` — result-language target; defaults to `language` for backward compatibility;
- `scope=all|words|phrases|entities` — one UI/result surface, optionally filtered by result kind;
- `type=<category>` — rhyme/sound-relation filter;
- `variants=all` — allow stored alternate word pronunciations;
- `historical=all` — include historical single-word candidates;
- `word_limit=<n>`, `word_pool=<n>` — bounded frozen Writer-v5 controls;
- `phrase_limit=<n>`, `phrase_pool=<n>`, `phrase_per_channel=<n>` — bounded Phrase/Mosaic controls;
- `entity_limit=<n>`, `entity_pool=<n>` — bounded Entity controls;
- `entity_category=<category|all>` — exact Entity taxonomy filter from the runtime capability list;
- generated data is included by default when the generated-capable runtime is available;
- `generated=0` — explicitly opt out and use Core-only data;
- `generated=1` — explicitly require the generated-capable runtime; if it is unavailable, the request fails closed instead of silently using Core;
- `generated_only=1` — route to the generated-capable runtime and restrict DE Word, EN Word, Phrase/Mosaic and Entity candidate retrieval to Generated provenance before ranking/limits.

### Safe German scorer prefilter

German Word/Writer scoring now has a fail-closed upper-bound stage before expensive prepared-feature/full-score work. It does not shorten the retrieval pool or rank candidates. A candidate is skipped only when a cheap bound proves that the unchanged full scorer cannot satisfy any accepted primary-rhyme, assonance, or consonance threshold. If the proof is inconclusive, the candidate continues through the original scorer.

The implementation retains an internal `disableSafePrefilter` diagnostic option used by regression tests. Serving fixture tests require the complete Writer response with the prefilter enabled to deep-equal the response from the full-scorer control path.

### Runtime timing

Every `/api/writer` response includes a process-local runtime timing block:

```json
{
  "runtimeTiming": {
    "schema": "rhymelab-runtime-query-timing-v1",
    "searchMs": 184.4,
    "averageLast100Ms": 231.2,
    "sampleCount": 37,
    "windowSize": 100
  }
}
```

`searchMs` measures the server-side Writer wall time from query dispatch through DB retrieval, phonetic scoring, ranking and final channel merge. In the accepted default runtime that path remains synchronous; in `dev:serving` it measures the persistent-worker parallel path. It deliberately excludes browser/network latency and JSON serialization. `averageLast100Ms` is the rolling mean of the most recent up-to-100 Writer API executions in the current server process and resets on server restart. The main UI shows both values below the right-hand inspector.

### Unknown / partially unresolved query pronunciation

The API itself does **not** run a pronunciation generator or host executable.

The product flow is:

1. the normal Writer request attempts the existing source-backed query lookup;
2. the browser/client identifies any missing requested-language query anchor;
3. for a multi-word query, each token uses source-backed pronunciation when available and only missing token pronunciations are generated in the end-user client;
4. the browser retries the same Writer endpoint with the generated IPA;
5. the server validates that IPA through the existing accepted language analyzer and uses it only as an ephemeral query anchor;
6. normal Word/Phrase/Entity retrieval, scoring and ranking continue unchanged.

Optional client-anchor parameters:

- `query_ipa_de=<ipa>`
- `query_ipa_en=<ipa>`
- `query_method_de=<method>`
- `query_method_en=<method>`
- `query_source_backed_de=1`
- `query_source_backed_en=1`
- `query_components_de=<json-array>`
- `query_components_en=<json-array>`

A real source-backed query pronunciation always wins over supplied client IPA.

Generated query metadata includes `generatedPronunciation=true` and `queryPronunciation.clientOnly=true`. The composed query anchor is not persisted as lexical truth. Generated **token pronunciations** may be retained in the browser's revision-/policy-gated IndexedDB performance cache; they remain non-canonical and are invalidated when `query_pronunciation_revision` or the client resolver policy changes.

`language=both` may therefore use source-backed pronunciation for one language and client-generated pronunciation only for the missing language. Multi-word input is supported: the client composes a complete ephemeral phrase IPA from source-backed and generated token pronunciations.


German single-word queries reuse the frozen `findWriterRhymes()` path unchanged. Phrase/Mosaic results run through the accepted 11D4 retrieval -> 11E2-v2 ranking -> 11E3 diversification stack.

Multi-word user queries are resolved in this order:

1. exact accepted phrase-catalog pronunciation when available;
2. otherwise deterministic server composition of preferred Writer-v5 token pronunciations when every lexical token resolves;
3. otherwise the browser/client resolves each token independently: source-backed word pronunciation where available, local deterministic IPA only for missing tokens;
4. the composed client phrase IPA is validated by the accepted analyzer and used only as the query anchor for the existing Word/Phrase/Entity search paths.

The response keeps Word and Phrase/Mosaic channel orders separate. Numeric scores are not treated as globally calibrated across channels; the unified UI groups both channels in one workspace rather than inventing a cross-channel score.

### Query language vs. result language

Input pronunciation and output language are independent product controls.

Examples:

```text
language=de&result_language=de
German query pronunciation -> German results

language=de&result_language=en
German query pronunciation -> English results

language=de&result_language=both
German query pronunciation -> German + English results
```

For the DE -> EN word path, RhymeLab does **not** look up the German spelling as an English word. It resolves the German source-backed pronunciation first, selects the rightmost eligible stressed German rhyme anchor, adapts only that right-edge rhyme tail into the accepted English target phonology, then uses the existing indexed English retrieval/scoring/ranking pipeline. This prevents irrelevant German-only phones earlier in a compound from killing the English rhyme search; for example, `Arbeitsweise` and `Weise` reach the same right-edge English rhyme neighborhood. The accepted same-language DE and EN paths remain unchanged.

This specifically allows inputs such as `Schwein` to retrieve English candidates from the /aɪn/ rhyme neighborhood without pretending that `Schwein` is an English lexeme.

The reverse EN -> DE word pronunciation bridge is not currently implemented because English source phones cannot be losslessly reinterpreted as German pronunciation without an explicit target-language adaptation policy.

Phrase/Mosaic remains German-only. If `result_language=en` is selected, German Phrase/Mosaic results are excluded rather than mislabeled as English.

Source-backed Entity rhyme channels support DE and EN target profiles independently. Entity categories are exposed by `/api/health` and accepted verbatim by `entity_category`.

### Language capability

The UI/API contract accepts `de`, `en`, and `both` for both query basis and result target.

Phase 12B11 provides the accepted source-backed English single-word Writer behind its local acceptance marker. Phase 12C provides the accepted source-backed multilingual Entity runtime.

- `language` controls query resolution;
- `result_language` controls which result-language channels are requested;
- DE+EN results preserve language-local channel ranks; raw DE/EN scores are not treated as cross-language calibrated;
- English Phrase/Mosaic remains unavailable;
- unknown normalized single-token queries use `total-query-pronunciation-v1`: source-backed lookup first, then browser/client-generated ephemeral IPA only for missing language anchors; multi-word Phrase/Mosaic behavior is unchanged.

The response includes `counts.searchPool` with bounded candidate-pool counts from the active indexed pipelines. These are truthful current search-pool counts, not a claim that the entire lexical/entity database was exhaustively rescored.

## `GET /api/dataset-stats`

Returns the live local pronunciation-record inventory used by the main UI Stats dialog. Counts are split into `Core`, `Generated`, and `Total` for:

- German Word Writer pronunciations;
- English Word Writer pronunciations;
- Phrase/Mosaic pronunciations;
- Entity pronunciations.

`Core` is the canonical/default runtime inventory. `Generated` is the accepted opt-in overlay provenance only. `Total` is the augmented runtime population. The endpoint reports pronunciation records, not unique lexical surfaces.

The server computes the snapshot lazily from the opened local databases and caches it for the lifetime of the process. It does not rebuild or mutate any database.

## `GET /api/stats`

Returns metadata/statistics from the promoted Writer v5 database.

## `GET /api/search?q=<prefix>&limit=<n>&historical=<mode>`

Prefix/exact surface-form lookup against Writer v5. Historical-only forms are excluded by default; `historical=all` includes them. Missing usage remains unranked/unknown.

## `GET /api/word/<word>`

Returns normalized word detail plus stored pronunciation variants.

- default / `?language=de`: Writer v5 German detail;
- `?language=en`: accepted source-backed en-US English Writer detail.

English detail returns 503 while the local integrated product acceptance marker is absent.

## `GET /api/rhymes/<word>`

Supported query parameters include:

- `limit=<n>` — result limit, maximum 250;
- `pool=<n>` — bounded candidate limit per retrieval channel, maximum 800;
- `variants=all` — allow stored alternate pronunciation variants;
- `historical=all` — include historical-only candidates;
- `type=<category>` — one primary rhyme/sound relation or `all`;
- `coverage=balanced` — legacy/base balanced-coverage option;
- `coverage_floor=<n>` — requested category floor;
- `ranking=legacy` — explicitly use the preserved v4 control engine instead of Writer v5.

### Default request

Omitting `ranking=legacy` uses `findWriterRhymes()` with the materialized v5 runtime.

The response exposes Writer-specific retrieval, morphology, safety, ranking, and diversity diagnostics. The active writer policy is `deterministic_writer_utility_v6`.

### Legacy/control request

```text
?ranking=legacy
```

This routes to the preserved DB-v4 `findRhymes()` engine with ranking policy:

```text
modern_entity_relative_commonness_1decade_0_05
```

The control DB exists for regression/comparison evidence. It is not the normal v0.11 product/UI runtime.

## Primary rhyme vs. sound relation

Primary rhyme is exclusive. A result has at most one of:

1. `multisyllabic_perfect`
2. `perfect`
3. `multisyllabic_slant`
4. `family`
5. `slant`

Assonance and consonance are independent overlapping relations:

- `assonance`
- `consonance`

A result can therefore have a primary class and one or both independent sound relations.

## Writer pipeline

The promoted single-word Writer path is deterministic:

```text
base phonetic retrieval/scoring
  + indexed materialized right-edge retrieval
  -> multi-anchor writer scoring
  -> materialized multi-analysis morphology consensus
  -> lexical-safety tier
  -> structural lexical cheapness
  -> deterministic writer utility
  -> deterministic family/list diversity
```

Key policy identifiers:

```text
rankingPolicy                 deterministic_writer_utility_v6
phonology.writerAnchorPolicy  de-right-edge-anchors-v1
writerMorphology.policy       de-attested-right-head-v4
runtime                       materialized-writer-v5-v1
```

Writer v7 remains rejected/rolled back.

## Writer morphology

The v5 runtime uses normalized `form_analysis` plus compact positive `writer_morphology_evidence`. Multiple source-supported lexical analyses are preserved and resolved by deterministic family consensus. Conflicting supported families remain ambiguous rather than being guessed.

The explicit German productive construction remains:

```text
de-adverbial-weise-v2
```

False-split regressions for `Verweise`, `Betriebe`, `Bestreben`, `Professoren`, and `deutscher` remain protected.

## Writer lexical safety

Current writer safety policy preserves phonetic truth while demoting unsafe default-page vocabulary:

```text
measured usage <= 250000                     -> tier penalty 0
unranked / unknown usage                     -> tier penalty 1
measured usage > 250000                      -> tier penalty 1
explicit rare/archaic/obsolete/dated tag     -> tier penalty 2
```

Missing usage is unknown/unranked, not automatically rare.

## Browser behavior

The browser has one Writer surface for Words, Phrase/Mosaic and Entities. There is no separate Phrase Explorer product UI. The main search field accepts a word or multi-word query; `All / Words / Phrases / Entities` filters operate inside the same result workspace.

The UI separates `Query pronunciation: DE / EN / DE+EN` from `Result language: DE / EN / DE+EN`. Availability is capability-driven by `/api/health`.

Generated data remains default OFF and is not persisted across app restarts. The `Generated only` checkbox implies generated opt-in and applies provenance filtering inside each retrieval channel before ranking and result limits. The top-bar Stats dialog reads `/api/dataset-stats` and labels the canonical/default inventory as `Core`.

Entity taxonomy categories are populated from runtime capabilities and may be filtered exactly. Standard unfiltered result browsing uses explicit per-category **More** buttons; automatic endless scrolling is reserved for a selected rhyme/sound relation.

Per-result Source fields are intentionally omitted from the inspector. The UI's Sources dialog lists the active source families in one alphabetized place; durable provenance remains in `DATA_SOURCES.md` and the underlying data records.

German word results keep frozen Writer-v5 server ordering. English word results use `guarded_commonness_06` plus Diversity `0.08` inside anchored <=0.03 phonetic bands. In DE+EN mode the UI preserves language-local channel ranks and does not compare raw DE/EN scores. Phrase/Mosaic results keep accepted 11E2-v2 + 11E3 ordering. Explicit UI sorts operate within each channel.

`ranking=legacy` remains only a debugging/regression control endpoint; the normal unified UI does not use it.

## Database build commands

Full Writer v5 rebuild from the configured local source snapshots:

```powershell
npm run writer:v5:rebuild
```

Individual steps:

```powershell
npm run de:publish:v3
npm run local:db:v5
npm run writer:v5:materialize
```

## Benchmark status

The Writer v5 path passed the engineering acceptance gates documented in `docs/WRITER_SEARCH_ACCEPTANCE.md`, including exact retrieval equivalence on the frozen suite, morphology regressions, page-structure gates, 685/685 legacy Tier-0 retention, performance improvement, and deterministic repeatability.

Human Writer NDCG@10/20 remains `pending_reference` until the broader German Writer surface is mature and independent reviewers are available.

## Runtime safety

The server binds to `127.0.0.1` by default. There is no hosted/public API contract and no runtime network dependency in core search.

## Phrase catalog/detail diagnostic API

These read-only endpoints remain available as internal data/detail support for the unified Writer and diagnostics. They are no longer backed by a separate product UI.

The phrase data lives in:

```text
data/local/rhymelab-phrases-v1.sqlite
```

Override with:

```text
RHYMELAB_PHRASE_DB
```

The phrase DB is optional. If it is missing, the promoted Writer runtime still starts normally; phrase endpoints return a clear unavailable status.

### `GET /api/phrases/stats`

Returns phrase-catalog counts plus available Leipzig/register statistics and registered source records.

### `GET /api/phrases/search`

Parameters:

- `q=<text>` — normalized substring lookup;
- `type=all|phrase|idiom|proverb|figurative_expression|multiword_lexeme`;
- `historical=all` — include historical-only rows;
- `evidence=all|leipzig|register|pronunciation`;
- `limit=<n>` — maximum 250.

This is a data-browser ordering, not the future Phrase Writer ranking policy.

### `GET /api/phrases/detail?id=<phrase-id-or-normalized-surface>`

Returns phrase tokens, source attestations, Leipzig evidence and generic register evidence. After Phase 11C1 materialization it also returns the preferred citation phrase IPA, syllable/stress data, explicit word-boundary positions, per-token IPA spans and token-resolution diagnostics.

There is no `/phrases` product route. The main Writer UI at `/` is the only supported browser surface.

These detail/catalog endpoints remain internal support surfaces and do not alter the frozen single-word Writer ranking path.



## Phrase pronunciation materialization — Phase 11C1

Prerequisites:

```text
data/local/rhymelab-v5.sqlite
data/local/rhymelab-phrases-v1.sqlite
```

Run:

```powershell
npm run phrase:pronunciation
```

This adds the read-only/explorer-facing pronunciation tables to the phrase SQLite file and writes:

```text
data/local/phrase-pronunciation-v1-report.json
```

Policy identifiers:

```text
schema                  rhymelab-phrase-pronunciation-v1
policy                  de-phrase-pronunciation-v1
resolver                writer-v5-preferred-surface-aware-v2
composition             preferred-token-citation-composition-v1
boundary policy         explicit-word-boundary-v1
connected speech        attested-or-explicit-rule-only-v1
IPA analyzer            de-ipa-v2
```

11C1 uses no G2P fallback, creates no alternate phrase Cartesian products, and generates no connected-speech variants. Unknown tokens remain unresolved. The materializer asserts that the accepted Phase 11B1 base catalog fingerprint is unchanged.
