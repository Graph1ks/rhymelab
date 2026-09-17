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

`de-human-rhyme-v1`: 367/367 reviewed with accepted ranking NDCG 0.9562 / pairwise 0.8350. This remains the relation/scorer benchmark, not a substitute for Writer Page usefulness labels.

## Phase 3 — Benchmark-informed German refinement — accepted first pass

Accepted improvements include `de-ipa-v2`, `de-phon-v3`, `rhyme-relations-v2`, curated-modern pronunciation overlay and provenance-aware pronunciation integrity policy.

## Phase 4 — Runtime ranking isolation — accepted control path

Accepted/base ranking is `modern_entity_relative_commonness_1decade_0_05`. `?ranking=legacy` remains the protected control path.

## Phase 5 — Pronunciation coverage + lexical quality — open background work

Continue after writer acceptance as background diagnostics: cluster remaining IPA failures, prioritize common-word failures, investigate poor preferred defaults, expand reviewed modern vocabulary/provenance, and add fallback/G2P only if attested coverage proves insufficient.

## Phase 6 — Deterministic writer-oriented search — engineering accepted

Frozen policies:

```text
writer ranking:       deterministic_writer_utility_v6
right-edge anchor:    de-right-edge-anchors-v1
morphology family:    de-attested-right-head-v4
construction:         de-adverbial-weise-v2
```

No LLM/ML/neural inference, hosted ranking or runtime network dependency is allowed in core retrieval/ranking. Writer v7 remains rejected and rolled back.

## Phase 7 — Multi-analysis lexical/morphology model — complete

Experimental migration:

```text
publish  rhymelab-de-publish-v3
DB       rhymelab-local-db-v5
```

Real owner DB contains 967,931 lexical-analysis rows across 838,209 forms / 904,836 pronunciations. Source-supported analyses are normalized in `form_analysis`.

## Phase 8 — Writer Page Benchmark v2 — structural baseline complete / human reference pending

Frozen validation baseline:

```text
status                              structural_ok_reference_pending
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

Writer NDCG@10/20 remains `pending_reference` until complete independent usefulness labels exist.

## Phase 9 — Legacy invariance + materialized writer runtime — complete

### 9A. Accepted legacy control-path invariance — PASS

27/27 queries; zero runtime candidate, runtime policy, or protected-order mismatches.

### 9B. Multi-analysis publish/storage — PASS

Publish-v3 / DB-v5 builder migration and owner build complete.

### 9C. Compact right-edge + morphology materialization — PASS

Final owner storage:

```text
DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
anchor rows                      3,153,639
positive morphology rows          325,724
freelist pages                           0
```

Storage contracts:

```text
anchor storage      compact-primary-key-v2
candidate basis     legacy-vowel-key-string-suffix-v1
morphology storage  positive-evidence-compact-v2
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

Final full Writer Page result:

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

```text
schema                              rhymelab-writer-v5-repeatability-v1
status                              ok
independent DB opens                     3
queries per run                          12
suite fingerprints equal              true
mismatches                                0
suite fingerprint
c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab
```

Complete semantic `findWriterRhymes()` responses are reproducible across three independent database opens.

## Phase 10 — German single-word writer engineering acceptance — complete / PASS

Acceptance report:

```text
docs/WRITER_SEARCH_ACCEPTANCE.md
```

The deterministic German single-word writer architecture is accepted as the frozen experimental writer engineering baseline.

Important distinction:

- engineering acceptance: **PASS**;
- formal/default v4 runtime replacement: **not performed**;
- Writer Page human NDCG@10/20: **pending_reference**.

Default promotion remains a separate explicit product/runtime decision. The absence of complete human Writer Page labels must remain visible and must not be replaced with inferred scores.

PR #3 stays draft until owner acceptance review.

## Phase 11 — German phrase / mosaic rhyme — next after acceptance review

Begin only as a separate architecture/benchmark phase after owner review of `docs/WRITER_SEARCH_ACCEPTANCE.md`.

Phrase/mosaic work must preserve the accepted single-word evidence and remain deterministic/local-only. It needs explicit phrase candidate sources, segmentation/search design, scoring semantics, writer usefulness/diversity behavior, and its own benchmark rather than piggybacking silently on single-word metrics.

## Phase 12 — English profile + benchmark

Separate language-specific sources, parser, scorer and benchmark required. English remains after the German path is stable.

## Phase 13 — Cross-language rhyme

Only after German and English are individually strong.

## Hosted runtime

Not part of the current roadmap. Core search remains locally executable for desktop, web packaging and later mobile use.
