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

Owner-local 12-query v6/v4 validation passed on 2026-09-17:

```text
queries found                       12 / 12
mean elapsed                        1502.8 ms
repeated family rows                0
unranked top-30 rows                2
usage rank > 100k rows              45
usage rank > 250k rows              2
explicit rare/historical rows       0
writer-safety-tier penalized rows   4
Arbeitsweise elapsed                7926.5 ms
Arbeitsweise right-edge             1353
Arbeitsweise merged                 1580
```

Validation gates passed:

- productive `*-weise` top-page flooding removed;
- `Liebe -> Diebe`, `Leben -> neben`, `Nacht -> macht` remain perfect-class results with cheap penalty 0;
- known false morphology (`Betriebe`, `Bestreben`, `Professoren`, `deutscher`) remains rejected;
- lexical-safety gains remain intact.

Decision: **freeze ad-hoc writer-ranking and morphology tuning at v6/v4** until page-quality benchmark evidence identifies a concrete failure.

The feature remains draft and is not the accepted runtime baseline.

## Phase 7 — Deterministic lexical/morphology data model — design required before materialization

Current DB v4 stores one selected lemma/POS analysis per surface form. Live validation proved that this is not sufficient as a final writer-morphology substrate because source entries can legitimately expose multiple analyses.

Target normalized build model:

```text
lexeme
  -> form
  -> pronunciation variants
  -> eligible rhyme anchors / tails

form
  -> multiple source-supported lemma/POS analyses + provenance
  -> inflection family
  -> morphology / compound constituents / head
  -> lexical status / register / usage
```

Required German work:

- preserve ambiguous lexical analyses rather than forcing a false single semantic analysis;
- deterministic inflection-family identification where source evidence supports it;
- deterministic compound segmentation with confidence/provenance;
- constituent/head fields for writer redundancy;
- no invented morphology facts;
- materialize a compact SQLite hot layer suitable for ordinary PCs and later mobile runtime.

## Phase 8 — Search-quality benchmark v2 — current milestone

Infrastructure is implemented on the writer-search feature branch:

```text
benchmarks/de-writer-v2/plan.json
scripts/writer-page-benchmark-core.mjs
scripts/benchmark-writer-page-v2.mjs
scripts/prepare-writer-page-benchmark-v2.mjs
tests/writer-page-benchmark.test.mjs
```

Commands:

```powershell
npm run benchmark:writer-page:v2
npm run benchmark:writer-page:prepare
```

The structural benchmark measures:

- Top-10 / Top-20 exact duplicate and near-duplicate rate;
- same-lemma rate;
- repeated morphology-family rate;
- morphology-family diversity;
- rare/unranked/very-low-use intrusion;
- preferred-pronunciation rate;
- retention of accepted/legacy top-250 tier-0 rhyme candidates;
- permanent page regressions including `Arbeitsweise/Hochzeitsreise`, `Liebe/Diebe`, `Leben/neben`, `Nacht/macht`;
- direct productive-`-weise` and false-split morphology regressions.

NDCG@10 / NDCG@20 is supported only when the relevant current writer cutoff has complete independent **human** songwriting-usefulness labels. Missing labels produce `pending_reference`; sparse labels must not be treated as a valid NDCG benchmark. No LLM/ML reference evaluation is required.

Immediate goal: run the structural benchmark on the owner DB, freeze the first measured page-quality baseline, then decide whether additional human NDCG review is needed before acceptance.

## Phase 9 — German multi-anchor retrieval/materialization refinement

Only after benchmark evidence is stable:

- verify accepted `ranking=legacy` exact-rhyme/relation invariance;
- benchmark eligible right-edge rhyme anchors for compounds/secondary stress;
- materialize/index validated right-edge signatures and morphology evidence;
- remove broad suffix `LIKE` probing from final runtime;
- meet local/mobile latency targets without changing phonetic truth.

Any change to `de-phon-v3` or `rhyme-relations-v2` requires its own scorer/relation acceptance path.

## Phase 10 — Writer-search acceptance + German single-word stabilization

Produce an explicit acceptance report combining:

- writer page benchmark v2;
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
