# RhymeLab Roadmap

Last updated: 2026-09-17

## Phase 0 — German phonology + source pipeline — complete

German IPA/feature models, Leipzig usage ranking, Kaikki resolver, deterministic local shard pipeline and compact pronunciation-backed publish data are implemented.

## Phase 1 — Local runtime/product foundation — complete through accepted v0.10

Accepted baseline:

- package `v0.10.0`;
- DB schema `rhymelab-local-db-v4`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternates;
- 1,038 historical-only forms;
- 260,450 usage-ranked forms;
- accepted phonology `de-ipa-v2` + `de-phon-v3` + `rhyme-relations-v2`;
- accepted report `ok`, 5/5 QA gates.

## Phase 2 — German blind reference benchmark — complete

Refreshed `de-human-rhyme-v1` is complete: 367/367 reviewed with ranking NDCG 0.9562 / pairwise 0.8350.

## Phase 3 — Benchmark-informed German refinement — accepted first pass

Accepted improvements include `de-ipa-v2`, `de-phon-v3`, `rhyme-relations-v2`, curated-modern pronunciation overlay and provenance-aware pronunciation integrity policy. Exact rhyme behavior remains a hard regression boundary.

## Phase 4 — Targeted diagnostics + ranking isolation — final acceptance gate

Broad scorer/relation retuning remains unjustified. Ranking changes stay isolated from phonology.

### Pure score-band — rejected

`score_band_0_05` improved reviewed metrics but failed lexical safety.

### Hybrid v1 — rejected

Lexical safety improved, but gains were too small and hitzefrei regressed.

### Hybrid v2 — rejected

Modern-query log-commonness recovered Spotify and protected dictionary queries, but Netflix/TikTok still admitted much-rarer candidates.

### Hybrid v3 — experiment passed

Policy:

```text
modern_entity_relative_commonness_1decade_0_05
```

Mechanism:

- modern queries with measured usage only;
- dictionary/missing-usage fallback stays usage-first;
- exact tier 0 and relation-only rows stay protected;
- candidates may be 0.05 score-band reordered only while `candidate_usage_rank <= query_usage_rank * 10`;
- outside the query-relative one-decade horizon, usage-first remains authoritative.

Isolated result:

- sample `0.9613 / 0.8640`;
- live `0.9610 / 0.8382`;
- only Spotify changes top-20 membership;
- all new top-20 rows ranked, <=100k and within horizon;
- no protected-order/reconstruction mismatches.

### Retrieval-aware runtime-candidate validation — passed

Owner-local v1 report:

- status `ok`;
- 27 queries, 0 missing;
- 0 reconstruction mismatches;
- 0 protected-order mismatches;
- reference `0.9559 / 0.8099`;
- candidate `0.9610 / 0.8366`;
- 14 new top-20 rows, all safe by current commonness gates;
- 141 new top-250 members, all ranked, none explicit-rare, none >100k, none outside horizon;
- top-20 membership change only on Spotify;
- top-250 membership change only on Spotify, Twitter, TikTok and Instagram;
- Netflix/YouTube top-250 membership unchanged;
- hitzefrei unchanged.

Decision: retrieval-aware pre-promotion gate passed.

### Runtime source promotion — wired, post-promotion acceptance pending

Current main contains the validated policy in `src/runtime-ranking-policy.mjs` and uses it in `src/local-engine.mjs` for normal `type=all`, non-balanced ranked mode.

Still unchanged:

- scorer and relation policy;
- retrieval keys and pool mechanics;
- DB schema/data;
- type-specific result ordering;
- balanced-coverage result ordering.

The final gate is owner-local post-promotion reproduction:

```powershell
git pull
npm run benchmark:ranking:runtime-candidate
```

Expected schema:

```text
rhymelab-benchmark-ranking-runtime-candidate-v2
```

It must report:

- `status=ok`;
- zero runtime-vs-validated-candidate mismatches;
- zero runtime-policy mismatches;
- zero protected-order mismatches;
- candidate metrics/safety consistent with the passed v1 retrieval evidence.

Only after this should the formal accepted runtime baseline/version be advanced.

## Phase 5 — Pronunciation coverage + lexical quality

After ranking isolation:

- cluster the 17,233 remaining IPA-normalization failures;
- prioritize common-word failures;
- investigate poor preferred defaults;
- expand reviewed modern vocabulary/provenance;
- add fallback/G2P only if attested coverage proves insufficient.

This remains required, but writer-search architecture work may proceed independently where it does not alter pronunciation or relation truth.

## Phase 6 — Deterministic writer-oriented ranking — current feature milestone

Core rule: no LLM, machine-learning model, neural inference, hosted ranker, or network dependency in rhyme retrieval/ranking.

Writer ranking is separate from phonetic truth:

```text
phonetic retrieval/scoring
  -> deterministic lexical/writer utility
  -> deterministic list diversification
  -> writer-oriented results
```

Initial implementation:

- `src/writer-ranking-policy.mjs`;
- `src/writer-search.mjs`;
- explicit `writer` explanation payload per result;
- same-lemma suppression;
- query lexical-overlap penalty;
- repeated productive surface-construction diversification;
- O(n²) greedy result diversification;
- `Arbeitsweise` regression tests;
- legacy ranking remains available during validation.

See `docs/WRITER_RANKING.md`.

This phase must be validated on live local data before it can replace the accepted ranking baseline.

## Phase 7 — Deterministic lexical/morphology data model

Move beyond surface-only heuristics by representing writer-relevant lexical structure explicitly during the local build.

Target normalized build model:

```text
lexeme
  -> form
  -> pronunciation variants
  -> eligible rhyme anchors / tails

form
  -> lemma / inflection family
  -> morphology analyses
  -> compound constituents / head
  -> lexical status / register / usage
```

The runtime may continue to materialize a compact SQLite `hot` layer. Do not sacrifice mobile/local lookup speed for normalized build purity.

Required German work:

- deterministic inflection-family identification where source evidence supports it;
- deterministic compound segmentation with confidence/provenance;
- constituent/head fields for writer redundancy;
- no invented morphology facts;
- keep ambiguous analyses when necessary rather than forcing a false single split.

## Phase 8 — Search-quality benchmark v2

The existing rhyme-relation benchmark remains useful but is insufficient for page quality.

Add query/list metrics and regression constraints including:

- NDCG@10 / NDCG@20;
- useful-result recall;
- duplicate / near-duplicate rate;
- same-lemma rate;
- repeated-construction rate;
- lexical/morphological diversity;
- rare/unranked intrusion rate;
- pronunciation-confidence quality;
- exact-rhyme recall protection.

`Arbeitsweise` becomes a permanent regression query. The benchmark should constrain bad result-page patterns rather than pretending one exact total ordering is linguistic truth.

## Phase 9 — German multi-anchor phonology / retrieval refinement

Only after writer-page problems are measured separately from relation correctness:

- benchmark eligible right-edge rhyme anchors for German compounds/secondary stress;
- add richer deterministic retrieval signatures where recall evidence justifies them;
- keep candidate retrieval high-recall and ranking precision-oriented;
- do not change `de-phon-v3` merely to solve lexical boredom.

Any phonology revision requires a separate scorer/relation acceptance path.

## Phase 10 — Phrase / mosaic rhyme

Only after German single-word retrieval, pronunciation quality, deterministic writer ranking, lexical diversity and search-quality benchmark remain stable.

## Phase 11 — English profile + English benchmark

English remains separate and unimplemented. It requires its own lexical/pronunciation sources, IPA parser, phoneme similarities, thresholds, pronunciation policy and benchmark.

## Phase 12 — Cross-language rhyme

Only after German and English are individually strong.

## Hosted runtime

Not part of the current roadmap. The core search path is designed to remain locally executable for desktop, web packaging and later mobile use. Any hosted deployment is a separate product decision and must not become a requirement for rhyme retrieval/ranking.
