# RhymeLab Roadmap

Last updated: 2026-09-17

## Phase 0 — German phonology + source pipeline — complete

German IPA/feature models, Leipzig usage ranking, Kaikki resolver, deterministic local shard pipeline and compact pronunciation-backed publish data are implemented.

## Phase 1 — Local runtime/product foundation — accepted through v0.10

Formal/default baseline remains:

```text
package         v0.10.0
DB schema       rhymelab-local-db-v4
forms           838,209
pronunciations  904,836
preferred       838,209
alternate       66,627
historical      1,038
usage-ranked    260,450
SQLite          457.68 MiB
analyzer        de-ipa-v2
scorer          de-phon-v3
relation        rhyme-relations-v2
ranking         modern_entity_relative_commonness_1decade_0_05
```

## Phase 2 — German blind relation/reference benchmark — complete

`de-human-rhyme-v1`: 367/367 reviewed with accepted ranking NDCG 0.9562 / pairwise 0.8350. This remains the relation/scorer benchmark, not Writer Page human gold.

## Phase 3 — Benchmark-informed German refinement — accepted first pass

Accepted improvements include `de-ipa-v2`, `de-phon-v3`, `rhyme-relations-v2`, curated-modern pronunciation overlay and provenance-aware pronunciation integrity policy.

## Phase 4 — Runtime ranking isolation — accepted control path

Accepted/base ranking is `modern_entity_relative_commonness_1decade_0_05`. `?ranking=legacy` remains the protected control path.

## Phase 5 — Pronunciation coverage + lexical quality — open background work

Continue as background diagnostics: cluster remaining IPA failures, prioritize common-word failures, investigate poor preferred defaults, expand reviewed modern vocabulary/provenance, and add fallback/G2P only if attested coverage proves insufficient.

## Phase 6 — Deterministic writer-oriented single-word search — engineering accepted

Frozen policies:

```text
writer ranking:       deterministic_writer_utility_v6
right-edge anchor:    de-right-edge-anchors-v1
morphology family:    de-attested-right-head-v4
construction:         de-adverbial-weise-v2
runtime:              materialized-writer-v5-v1
DB schema:            rhymelab-local-db-v5
```

No LLM/ML/neural inference, hosted ranking or runtime network dependency is allowed in core retrieval/ranking. Writer v7 remains rejected and rolled back.

## Phase 7 — Multi-analysis lexical/morphology model — complete

Publish-v3 / DB-v5 preserves source-supported lexical analyses in `form_analysis`. Real owner data contains 967,931 lexical-analysis rows across 838,209 forms / 904,836 pronunciations.

## Phase 8 — Writer Page Benchmark v2 — structural baseline complete

Frozen validation baseline:

```text
queries                             12 / 12
mean writer elapsed                 1528.8 ms
Top-20 exact duplicates             0
Top-20 near duplicates              0
Top-20 same-lemma rows              0
Top-20 repeated family rows         0
Top-20 unranked rows                1
Top-20 usage rank >100k rows        25
Top-20 usage rank >250k rows        1
Top-20 explicit rare/historical     0
preferred pronunciation rows        240 / 240
legacy tier-0 retention             685 / 685
```

`Arbeitsweise -> Hochzeitsreise` is a retrieval sentinel with `max_rank: 250`, not a Top-20 surfacing guard. `Arbeitsweise -> right:reise` is the family surfacing gate.

Writer NDCG@10/20 is deliberately deferred until the German writer system is feature-complete enough for coherent independent human evaluation. The project owner is not treated as an independent human-reference source.

## Phase 9 — Legacy invariance + materialized writer runtime — complete

### 9A. Accepted legacy control-path invariance — PASS

27/27 queries; zero runtime candidate, runtime policy, or protected-order mismatches.

### 9B. Multi-analysis publish/storage — PASS

Publish-v3 / DB-v5 builder migration and owner build complete.

### 9C. Compact right-edge + morphology materialization — PASS

```text
DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
anchor rows                      3,153,639
positive morphology rows          325,724
freelist pages                           0
```

### 9D. Retrieval/morphology equivalence — PASS

```text
queries                             12 / 12
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

### 9E. Materialized runtime structural gate — PASS

Runtime `materialized-writer-v5-v1` uses compact indexed anchors and materialized multi-analysis morphology. Runtime contract 12/12, page regressions pass, morphology regressions pass, legacy Tier-0 retention 685/685.

### 9F. Prefix-stable runtime performance gate — PASS

```text
mean writer elapsed                 1103.9 ms
frozen validation mean              1528.8 ms
mean improvement                     27.8%
Arbeitsweise                         3021.8 ms
previous Arbeitsweise                7105.7 ms
Arbeitsweise improvement              57.5%
```

No score, tier, ranking, morphology, or diversity policy changed. Prefix-stability is protected by test.

### 9G. Deterministic runtime repeatability — PASS

Three independent DB opens produced identical complete semantic `findWriterRhymes()` per-query and suite fingerprints across all 12 frozen queries; mismatch count 0.

## Phase 10 — German single-word writer engineering acceptance — complete / PASS

Acceptance report: `docs/WRITER_SEARCH_ACCEPTANCE.md`.

The deterministic German single-word writer architecture is accepted as the frozen writer engineering baseline.

Important distinction:

- engineering acceptance: **PASS**;
- Writer Page human NDCG@10/20: **deferred / pending_reference** until the broader German writer surface is complete and independent human reviewers exist;
- future writer changes must preserve or explicitly supersede the frozen single-word evidence.

## Phase 11 — German phrase / mosaic / phraseology — current

Execution plan: `docs/PHRASE_MOSAIC_PLAN.md`.

### 11A. Public phraseology source survey — immediate next action

Before implementing a phrase database or runtime, research publicly obtainable German resources for:

- common multi-word phrases / n-grams / collocations;
- idioms and Redewendungen;
- proverbs / formulaic expressions where usable;
- metaphorical / figurative expressions where structured public data exists;
- common sentence fragments useful to lyricists;
- semantic resources that can support deterministic discovery.

For every candidate, document bulk access, license/redistribution/commercial compatibility, snapshot/version, scale, raw format, provenance, and offline ingestion viability. Public web visibility alone is insufficient.

### 11B. Phrase data model

Build a separate provenance-bearing phrase layer with token boundaries, phrase type, lexical/register evidence, commonness evidence where available, and phrase-level pronunciation derived from accepted local pronunciations.

### 11C. Deterministic phrase pronunciation

Construct phrase pronunciations from accepted token pronunciations; preserve provenance and explicitly handle unknown/ambiguous tokens.

### 11D. Mosaic retrieval architecture

Add deterministic indexed phrase-span retrieval capable of matching rhyme spans across one or more word boundaries without scanning the full phrase corpus at query time.

### 11E. Phrase writer ranking

Create a separate benchmarked phrase-ranking policy. Do not mutate the frozen single-word writer policy in place.

### 11F. Phrase/mosaic benchmark

Build dedicated structural, regression, lexical-safety, provenance, performance, and repeatability gates. Human usefulness NDCG comes only when the combined German writer system is mature and independent reviewers exist.

## Phase 12 — English profile + benchmark

Only after the German writer path, including phrase/mosaic work, is stable enough to freeze.

## Phase 13 — Cross-language rhyme

Only after German and English are individually strong.

## Hosted runtime

Not part of the current roadmap. Core search remains locally executable for desktop, web packaging and later mobile use.
