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
Legacy/control v4     data/local/rhymelab.sqlite
```

Writer v5 is required for normal server startup. The legacy v4 DB is optional. If it is unavailable, normal Writer requests continue to work and only explicit `?ranking=legacy` requests fail with a clear control-database error.

Environment overrides:

```text
RHYMELAB_WRITER_DB     Writer v5 database path
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

## `GET /api/writer?q=<word-or-phrase>`

This is the normal unified product endpoint for the main Writer UI.

Parameters:

- `q=<text>` — one word or a multi-word query;
- `language=de|en|both` — requested search-language basis;
- `scope=all|words|phrases` — one UI/result surface, optionally filtered by result kind;
- `type=<category>` — rhyme/sound-relation filter;
- `variants=all` — allow stored alternate word pronunciations;
- `historical=all` — include historical single-word candidates;
- `word_limit=<n>`, `word_pool=<n>` — bounded frozen Writer-v5 controls;
- `phrase_limit=<n>`, `phrase_pool=<n>`, `phrase_per_channel=<n>` — bounded Phrase/Mosaic controls.

German single-word queries reuse the frozen `findWriterRhymes()` path unchanged. Phrase/Mosaic results run through the accepted 11D4 retrieval -> 11E2-v2 ranking -> 11E3 diversification stack.

Multi-word user queries are resolved in this order:

1. exact accepted phrase-catalog pronunciation when available;
2. otherwise deterministic composition of preferred Writer-v5 token pronunciations when every lexical token resolves;
3. otherwise the query is returned as pronunciation-unresolved; no G2P or guessed IPA is introduced.

The response keeps Word and Phrase/Mosaic channel orders separate. Numeric scores are not treated as globally calibrated across channels; the unified UI groups both channels in one workspace rather than inventing a cross-channel score.

### Language capability

The UI/API contract accepts `de`, `en`, and `both`. At the current Phase 11E4/F checkpoint only the accepted German phonology/runtime exists. `en` therefore returns an explicit unavailable status; `both` runs German and returns an explicit English-unavailable warning. No German scorer is reused to fake English results. When Phase 12 supplies an accepted English runtime, it plugs into this same endpoint/UI contract.

## `GET /api/stats`

Returns metadata/statistics from the promoted Writer v5 database.

## `GET /api/search?q=<prefix>&limit=<n>&historical=<mode>`

Prefix/exact surface-form lookup against Writer v5. Historical-only forms are excluded by default; `historical=all` includes them. Missing usage remains unranked/unknown.

## `GET /api/word/<word>`

Returns the normalized word entry plus stored pronunciation variants from Writer v5.

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

The browser has one Writer surface for words and Phrase/Mosaic results. There is no separate Phrase Explorer product UI. The main search field accepts a word or multi-word query; `All / Words / Phrases-Mosaic` filters operate inside the same result workspace.

The language-basis selector is `DE / EN / DE+EN`. Availability is capability-driven by `/api/health`; unavailable English is surfaced explicitly rather than emulated.

Word results keep frozen Writer-v5 server ordering. Phrase/Mosaic results keep accepted 11E2-v2 + 11E3 ordering. Explicit UI sorts operate within each channel.

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

`/phrases` now serves the same unified Writer HTML as `/` for backward-compatible bookmarks; the old standalone phrase UI assets were removed.

These detail/catalog endpoints do not alter the frozen single-word Writer ranking path.



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
