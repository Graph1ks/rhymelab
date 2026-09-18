# German Phrase / Mosaic Rhyme — Phase 11 Plan

Last updated: 2026-09-18

## Goal

Extend the accepted German single-word writer baseline into deterministic multi-word writer search: phrase rhyme, mosaic rhyme, and phraseological continuations that can match a query phonetically across word boundaries while remaining useful to lyricists.

The single-word writer baseline is frozen reference evidence. Phase 11 must not silently retune `deterministic_writer_utility_v6`, `de-right-edge-anchors-v1`, `de-attested-right-head-v4`, or the accepted single-word regression set.

## Hard boundaries

Core runtime remains local-only and deterministic. Do not introduce LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads, or runtime network dependencies.

Phrase/mosaic output must be source-backed or deterministically generated from source-backed phrase material. Do not fabricate idioms, quotations, metaphors, collocations, or phrase frequency claims.

## Human-reference timing

Independent Writer Page human NDCG is deliberately deferred until the German writer system is feature-complete enough to evaluate as one coherent product surface. The current owner is not treated as an independent human-reference source.

Until an independent reviewer pool or other defensible human-reference process exists, NDCG@10/20 remains `pending_reference`. Structural, regression, provenance, lexical-safety, determinism, and performance gates continue to be required during development.

## Phase 11A — public-source survey and licensing gate — COMPLETE

Before runtime implementation, identify publicly obtainable sources that can legally and reproducibly support at least these layers:

1. multi-word phrases and common n-grams / collocations;
2. idioms and fixed expressions / Redewendungen;
3. metaphorical or figurative expressions where source licensing and structure permit deterministic ingestion;
4. common sentence fragments / formulaic language useful for lyric continuation;
5. lexical-semantic relations useful for phrase discovery without becoming an ML ranking dependency.

For every candidate source record:

- source/project name;
- public download/API location;
- license and redistribution obligations;
- language/snapshot/version;
- downloadable raw format;
- approximate scale;
- whether phrase text is available directly or must be derived;
- provenance key that can survive into local data;
- whether commercial redistribution is compatible with RhymeLab's distribution model;
- whether attribution/share-alike boundaries require separate artifacts;
- whether runtime can operate fully offline after ingestion.

No source is accepted merely because it is publicly viewable. License compatibility and reproducible bulk access are required.

## Phase 11B — phrase data model

Design a separate local phrase layer rather than overloading the single-word `hot` table. Minimum conceptual fields should cover:

- canonical phrase text;
- normalized tokens;
- source/provenance;
- phrase type(s): free phrase, collocation, idiom, fixed expression, proverb/formulaic expression, figurative expression, other source-backed class;
- lexical/register/style tags where attested;
- usage/commonness evidence where available;
- token-level lexical identities when available;
- phrase-level pronunciation sequence derived from attested/accepted token pronunciations;
- word-boundary positions;
- syllable/stress/nucleus sequence across boundaries;
- historical/current eligibility;
- deterministic eligibility reason when a phrase cannot be pronounced reliably.

Phraseology must remain separate from phonetic truth: an expression being an idiom or metaphor affects usefulness/filtering, not whether the sound relation is real.

## Phase 11C — deterministic phrase pronunciation

Contract: `docs/PHRASE_PRONUNCIATION_V1.md`.

Construct phrase pronunciations from the accepted local pronunciation inventory. Preserve token pronunciation provenance and do not silently replace unknown tokens with guessed pronunciations.

### Phase 11C1 implementation

Implemented baseline:

- exact normalized token lookup against Writer-v5 preferred eligible pronunciations;
- one preferred citation pronunciation per fully resolved phrase;
- explicit word-boundary positions in phoneme and syllable coordinates;
- per-token Writer pronunciation provenance and spans;
- all citation stress markers retained; no invented phrase-level main accent;
- no G2P fallback;
- no alternate phrase Cartesian product;
- no generated connected-speech variants;
- deterministic pronunciation fingerprint;
- hard assertion that the Phase 11B1 base catalog fingerprint is unchanged.

The owner full-data pronunciation gate is complete. Two independent owner runs produced the identical pronunciation fingerprint `fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548`; Phase 11C1 is accepted.

Connected-speech variants may be added only when backed by explicit deterministic rules or attested source evidence and must remain distinguishable from lexical citation pronunciations.

Required diagnostics include:

- token coverage rate;
- phrase coverage rate;
- alternate-pronunciation explosion;
- unknown-token reasons;
- boundary/stress preservation;
- deterministic reconstruction tests.

## Phase 11D — mosaic retrieval architecture — CURRENT

A mosaic rhyme is a phonetic match whose aligned rhyme span can cross one or more word boundaries in the candidate phrase.

### Phase 11D1 — deterministic cross-word window substrate

Contract: `docs/PHRASE_MOSAIC_RETRIEVAL_V1.md`.

Implemented at fixture/code level:

- materialized 2–6-syllable windows over accepted 11C1 pronunciations;
- retain only windows with at least one strict interior word boundary;
- preserve zero-based half-open syllable and phoneme coordinates;
- preserve overlapping token span and whether a window begins/ends inside a token;
- store exact phoneme key, exact vowel/nucleus key, stress shape and final coda;
- materialize exact/vowel/phrase indexes;
- deterministic row ids and whole-window-table fingerprint;
- no full-corpus runtime scan is required for exact indexed lookup.

11D1 owner full-data materialization/repeatability remains pending.

### Phase 11D2 — bounded candidate retrieval

After 11D1 owner acceptance, add deterministic query-side candidate generation over indexed keys. Do not introduce broad fuzzy scans; any slant/feature candidate expansion needs an explicit bounded anchor policy and benchmark.

The first architecture should reuse the accepted German phonology/scorer primitives where possible while introducing explicit phrase-span alignment. Candidate generation must avoid scanning every phrase at query time; design materialized/indexed right-edge phrase anchors or an equivalent deterministic local index.

Keep separate evidence for:

- whole phrase pronunciation;
- matched phrase suffix/span;
- token boundaries crossed by the match;
- primary/secondary stress anchors;
- number of syllables/nuclei matched;
- relation class and score;
- lexical/phrase usefulness signals.

## Phase 11E — writer-oriented phrase ranking

Phrase ranking is a new policy and must not mutate the accepted single-word writer policy in place.

Candidate signals may include, when source-backed and deterministic:

- phonetic relation strength;
- matched span length;
- stress alignment;
- number of word boundaries crossed;
- phrase/commonness evidence;
- lexical novelty relative to the query;
- phraseological type;
- register/style safety;
- duplicate / near-duplicate / same-template diversity.

Do not promote a phrase merely because it is semantically interesting if its phonetic match is weak. Do not promote a phonetically strong phrase that is source-unsupported garbage merely to fill a page.

## Phase 11F — benchmark

Create a dedicated German phrase/mosaic benchmark rather than reusing the single-word benchmark as if it were equivalent.

Initial structural/regression gates should cover:

- exact multi-word rhymes;
- strong mosaic matches crossing one boundary;
- matches crossing multiple boundaries;
- secondary-stress cases;
- short-query false positives;
- common-vs-obscure phrase safety;
- idiom/fixed-expression provenance;
- duplicate and template diversity;
- pronunciation ambiguity;
- historical/dated phrase filtering;
- performance on large phrase pools;
- deterministic repeatability.

Human usefulness NDCG should be collected only when the combined German writer surface is mature enough and independent reviewers are available.

## Phase 11A outcome

Completed source matrix and decision:

`docs/PHRASE_SOURCE_SURVEY.md`

Selected initial production stack:

- German Wiktionary via raw Kaikki/Wiktextract for source-backed phraseology;
- existing Leipzig News 2024 1M + Wikipedia 2021 1M + Web 2021 1M corpora for deterministic phrase attestation/commonness;
- Tatoeba only after attribution provenance is proven;
- Wikidata/OpenThesaurus/OdeNet as optional semantic support, not phrase truth;
- ParlaMint-AT as later register/domain enrichment;
- COLF-VID, PARSEME, GermaNet, DeReKo/DWDS remain research-only under the documented conditions.

## Phase 11B1 implementation status — FIXTURE GATE PASS

Milestone:

`PHASE_11B1_PROVENANCE_PHRASE_CATALOG`

Implementation contract: `docs/PHRASE_CATALOG_V1.md`.

Implemented:

1. `rhymelab-phrase-catalog-v1` separate SQLite schema;
2. source + snapshot/license/provenance registry;
3. raw German Wiktextract streamed multi-word ingestion;
4. source-backed phrase types/tags without invented classifications;
5. deterministic token boundaries and explicit unresolved lexical-token state;
6. `historical_only` / `mixed` / current eligibility handling;
7. Leipzig News/Web/Wikipedia exact-token-sequence occurrence/commonness evidence;
8. deterministic semantic catalog fingerprint;
9. duplicate/idempotency and repeat-build fixture tests;
10. local full-data bootstrap.

No accepted single-word runtime code is rewired.

### Immediate next action — owner-local full-data gate

Run:

```powershell
npm run phrase:catalog:bootstrap
```

Expected generated outputs:

```text
data/local/rhymelab-phrases-v1.sqlite
data/local/phrase-catalog-v1-report.json
```

Review the full source build before Phase 11C. Required diagnostics include phrase/type/history/token distributions, Leipzig 1/2/3-corpus coverage, top/common phrase noise, build size/time, and deterministic repeat fingerprint equality.

Phase 11C1 is complete and accepted. Phase 11D1 is now the active owner-local full-data gate.

Still explicitly out of scope after 11C1:

- alternate/connected-speech phrase pronunciation generation;
- mosaic retrieval/indexing;
- phrase Writer ranking;
- Markov/generative recombination;
- semantic/vector reranking;
- Human Writer NDCG.

The frozen single-word Writer remains untouched.
