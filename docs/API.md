# Local API

RhymeLab exposes a localhost-only HTTP API from `src/server.mjs` at `http://127.0.0.1:3030`.

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
RHYMELAB_ESPEAK_COMMAND optional path/name for a separately installed eSpeak-NG executable used only for generated single-token query pronunciation
```

## `GET /api/health`

Returns local runtime status including:

- `writer_database`;
- `writer_runtime`;
- whether the legacy/control DB is available;
- the legacy DB path/error when applicable;
- `unified_writer` language/channel capabilities, including whether German Word Writer and Phrase/Mosaic are ready and whether an English runtime is installed.

## `GET /api/writer?q=<word-or-phrase>`

This is the normal unified product endpoint for the main Writer UI.

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
- `entity_category=<category|all>` — exact Entity taxonomy filter from the runtime capability list.

### Unknown single-token query pronunciation

For a normalizable single-token query that has no source-backed pronunciation in a requested query language, the Writer API generates an **ephemeral query pronunciation** rather than returning `query_not_found` for that reason alone.

Resolution order:

1. source-backed local pronunciation;
2. optional separately installed local eSpeak-NG host executable, analyzer-gated;
3. deterministic RhymeLab language rules;
4. deterministic grapheme fallback.

Generated query metadata includes `generatedPronunciation=true` and a `queryPronunciation` object describing policy, method, engine, language and persistence boundary. Generated query pronunciations are not written to the accepted DE/EN/Entity/Phrase databases and are not lexical facts.

`language=both` resolves DE and EN query anchors independently. This total-resolution contract applies to **single-token input only**. Accepted multi-word Phrase/Mosaic pronunciation rules remain unchanged.


German single-word queries reuse the frozen `findWriterRhymes()` path unchanged. Phrase/Mosaic results run through the accepted 11D4 retrieval -> 11E2-v2 ranking -> 11E3 diversification stack.

Multi-word user queries are resolved in this order:

1. exact accepted phrase-catalog pronunciation when available;
2. otherwise deterministic composition of preferred Writer-v5 token pronunciations when every lexical token resolves;
3. otherwise the multi-word query remains pronunciation-unresolved; Total Query Pronunciation v1 deliberately does not G2P unresolved multi-word Phrase/Mosaic input.

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

For the DE -> EN word path, RhymeLab does **not** look up the German spelling as an English word. It resolves the German source-backed pronunciation first, re-analyzes that pronunciation under the accepted English target phonology, then uses the existing indexed English retrieval/scoring/ranking pipeline. The accepted same-language DE and EN paths remain unchanged.

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
- unknown normalized single-token queries use `total-query-pronunciation-v1`: source-backed lookup first, then a deterministic ephemeral language-specific query pronunciation; multi-word Phrase/Mosaic behavior is unchanged.

The response includes `counts.searchPool` with bounded candidate-pool counts from the active indexed pipelines. These are truthful current search-pool counts, not a claim that the entire lexical/entity database was exhaustively rescored.

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
