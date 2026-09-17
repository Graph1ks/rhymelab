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
- accepted ranking `modern_entity_relative_commonness_1decade_0_05`.

## Phase 2 — German blind relation/reference benchmark — complete

Refreshed `de-human-rhyme-v1` is complete: 367/367 reviewed with ranking NDCG 0.9562 / pairwise 0.8350. This benchmark remains the relation/scorer baseline; it is not sufficient for writer-page quality.

## Phase 3 — Benchmark-informed German refinement — accepted first pass

Accepted improvements include `de-ipa-v2`, `de-phon-v3`, `rhyme-relations-v2`, curated-modern pronunciation overlay and provenance-aware pronunciation integrity policy. Exact rhyme behavior remains a hard regression boundary.

## Phase 4 — Runtime ranking isolation — accepted control path

The accepted/base ranking is `modern_entity_relative_commonness_1decade_0_05`. `?ranking=legacy` remains the protected control path while writer search is experimental.

## Phase 5 — Pronunciation coverage + lexical quality — open background work

Still required after writer-search acceptance:

- cluster remaining IPA-normalization failures;
- prioritize common-word failures;
- investigate poor preferred defaults;
- expand reviewed modern vocabulary/provenance;
- add fallback/G2P only if attested coverage proves insufficient.

## Phase 6 — Deterministic writer-oriented search — live validation passed, not promoted

Core rule: no LLM, machine-learning model, neural inference, hosted ranker or network dependency in rhyme retrieval/ranking.

Current feature policies:

```text
writer ranking:    deterministic_writer_utility_v6
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v4
construction:      de-adverbial-weise-v2
```

Implemented architecture:

```text
accepted/base retrieval + deterministic right-edge retrieval
  -> multi-anchor writer phonetic scoring
  -> conservative lexical/morphology evidence
  -> lexical-safety tier
  -> structural writer cheapness
  -> deterministic family/list diversification
  -> writer-oriented page
```

The owner-local 12-query v6/v4 diagnostic passed. Ad-hoc writer-ranking and morphology tuning is frozen at v6/v4. Writer v7 remains rejected because it improved one specific `Hochzeitsreise` rank only slightly while introducing repeated-family flooding and failing the structural benchmark.

## Phase 7 — Deterministic multi-analysis lexical/morphology data model — migration path implemented

DB v4 stores one selected lemma/POS analysis per surface form. Live validation proved that this is not sufficient as a final writer-morphology substrate because source entries can legitimately expose multiple analyses.

Design contract:

```text
docs/WRITER_LEXICAL_MODEL.md
```

Target normalized model:

```text
form
  -> pronunciation variants
  -> multiple source-supported lemma/POS analyses + provenance
  -> derived/versioned writer morphology evidence
  -> materialized/versioned writer right-edge anchors
```

Required behavior remains:

- preserve ambiguous lexical analyses rather than forcing false single semantic truth;
- derive morphology independently per source-supported analysis;
- resolve a hard family only when supported analysis evidence converges on one family;
- keep conflicting families explicitly ambiguous/unresolved for hard writer penalties;
- preserve source record keys, match kinds, lexical/form tags and resolver identity;
- materialize a compact SQLite hot layer suitable for ordinary PCs and later mobile runtime;
- do not invent morphology facts.

The first implementation layers now exist:

```text
scripts/writer-lexical-model-core.mjs
scripts/writer-lexical-publish-v3-core.mjs
scripts/writer-lexical-storage-v5-core.mjs
tests/writer-lexical-model.test.mjs
tests/writer-lexical-publish-storage.test.mjs
tests/local-db-writer-lexical-v5.test.mjs
```

Experimental schemas:

```text
publish: rhymelab-de-publish-v3
DB:      rhymelab-local-db-v5
```

The accepted v2/v4 paths remain defaults. v3 is opt-in through `--writer-lexical-v3`; v5 uses separate default local outputs for v3 input. No owner DB rebuild is authorized yet.

## Phase 8 — Search-quality benchmark v2 — structural baseline passed / human reference pending

Infrastructure:

```text
benchmarks/de-writer-v2/plan.json
scripts/writer-page-benchmark-core.mjs
scripts/benchmark-writer-page-v2.mjs
scripts/prepare-writer-page-benchmark-v2.mjs
tests/writer-page-benchmark.test.mjs
```

The corrected v6/v4 owner-local structural run passed:

```text
status                              structural_ok_reference_pending
queries                             12 / 12
mean writer elapsed                 1528.8 ms
Top-10 repeated family rows         0
Top-20 repeated family rows         0
Top-20 exact duplicates             0
Top-20 near duplicates              0
Top-20 same-lemma rows              0
Top-20 unranked rows                1
Top-20 usage rank >100k rows        25
Top-20 usage rank >250k rows        1
Top-20 explicit rare/historical     0
preferred pronunciation rows        240 / 240
legacy top-250 tier-0 retention     685 / 685
```

Permanent regressions passed:

```text
Arbeitsweise -> Hochzeitsreise   rank 120, multisyllabic_perfect, score 1, cheap penalty 0
Arbeitsweise -> right:reise      Weiterreise rank 3
Liebe -> Diebe                   rank 1
Leben -> neben                   rank 2
Nacht -> macht                   rank 1
```

NDCG@10 / NDCG@20 is supported only when the relevant current writer cutoff has complete independent human songwriting-usefulness labels. Missing labels correctly produce `pending_reference`; sparse labels must not be treated as valid NDCG.

Decision: freeze this structural baseline. Human usefulness review remains available but is not required before storage/materialization engineering.

## Phase 9 — Legacy invariance + materialized writer runtime — current execution phase

### 9A. Accepted legacy control-path invariance — complete

`ranking=legacy` routes to the accepted `findRhymes()` path, while writer search uses `findWriterRhymes()`.

The owner-local retrieval-aware runtime gate passed on the current accepted DB:

```text
schema                              rhymelab-benchmark-ranking-runtime-candidate-v2
status                              ok
queries                             27 / 27
missing_queries                     []
runtime_candidate_mismatch_queries []
runtime_policy_mismatch_queries    []
protected_order_mismatch_queries   []
reference evidence                 unavailable_invariance_only
```

Historical local human-review assets were absent, therefore NDCG/pairwise were correctly not recomputed. Runtime order, policy identity, protected ordering and safety were verified.

The newly surfaced candidate safety aggregate contained 14 Top-20 and 141 Top-250 candidates with zero missing usage rank, zero explicit rare flags, zero >100k usage ranks and zero query-relative horizon violations.

### 9B. Multi-analysis publish/storage implementation — fixture/builder contract complete, owner rebuild pending later gate

Implemented:

- publish-v3 compact `a[]` preserves all merged source-supported lexical analyses;
- old `l/p/g` remain deterministic compatibility projection only;
- DB-v5 `form_analysis` stores one row per `(form_id, analysis_key)`;
- provenance arrays are sorted and deterministic;
- v3/v5 fixture tests cover equal-confidence ambiguity, repeated provenance merging, input-order independence and normalized SQLite storage;
- the real local DB builder is exercised end-to-end by a tiny publish-v3 fixture;
- accepted v2/v4 defaults and output locations remain untouched.

No owner DB rebuild has been performed or authorized yet.

### 9C. Right-edge + morphology materialization — next

Only now that the multi-analysis lexical substrate is explicit:

- materialize/index validated `de-right-edge-anchors-v1` signatures per pronunciation;
- materialize/version `de-attested-right-head-v4` evidence per source-supported analysis;
- store policy/version/provenance on all derived evidence;
- use indexed `(anchor_policy, anchor_key)` lookups;
- merge indexed writer retrieval with accepted/base retrieval;
- remove broad suffix `LIKE` probing from final writer runtime only after fixture equivalence is demonstrated;
- inspect SQLite query plans and record DB-size/runtime impact;
- require candidate/regression equivalence with the frozen Writer Page Benchmark v2 structural baseline;
- preserve accepted/base behavior under `ranking=legacy`.

Any change to `de-phon-v3` or `rhyme-relations-v2` requires its own scorer/relation acceptance path.

## Phase 10 — Writer-search acceptance + German single-word stabilization

Produce an explicit acceptance report combining:

- Writer Page Benchmark v2 structural evidence;
- independent human NDCG@10/20 if/when complete labels are collected;
- legacy invariance;
- lexical/morphology provenance integrity;
- materialized runtime performance;
- deterministic reproducibility.

Only then may writer search replace the accepted/base default.

## Phase 11 — Phrase / mosaic rhyme

Only after German single-word retrieval, pronunciation quality, deterministic writer ranking, lexical diversity, benchmark evidence and runtime performance are stable.

## Phase 12 — English profile + English benchmark

English remains separate and unimplemented. It requires its own lexical/pronunciation sources, IPA parser, phoneme similarities, thresholds, pronunciation policy and language-specific benchmark.

## Phase 13 — Cross-language rhyme

Only after German and English are individually strong.

## Hosted runtime

Not part of the current roadmap. The core search path is designed to remain locally executable for desktop, web packaging and later mobile use. Any hosted deployment is a separate product decision and must not become a requirement for rhyme retrieval/ranking.
