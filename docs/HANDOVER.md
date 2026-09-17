# RhymeLab — Thread Handover

Last updated: 2026-09-17

Repository state is authoritative. Do not reconstruct project state from prior chats.

## Start here

Read in order:

1. `AGENTS.md`
2. this file
3. `STATUS.md`
4. `PROJECT_STATE.json`
5. `ROADMAP.md`
6. `DATA_SOURCES.md`
7. `docs/BENCHMARK.md`
8. `docs/API.md`
9. `docs/WRITER_RANKING.md`
10. `docs/WRITER_LEXICAL_MODEL.md`
11. `docs/EXTERNAL_COMPARISON_D_RHYME.md`

## Hard runtime boundary

RhymeLab is local-only. Core retrieval, scoring, writer ranking and diversification must remain deterministic and locally executable. Do not add LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads or runtime network dependencies.

Generated linguistic data, SQLite, benchmark queues/reviews/reference labels, reports and downloaded raw sources remain local/gitignored. `main` is protected; required public check is `validate`.

## Formally accepted baseline

The last formally accepted German baseline remains RhymeLab `v0.10.0`:

- DB schema `rhymelab-local-db-v4`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternate pronunciations;
- 1,038 historical-only forms;
- 260,450 usage-ranked forms;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- accepted ranking `modern_entity_relative_commonness_1decade_0_05`.

The accepted/base path remains available through `?ranking=legacy`.

## Current feature branch

```text
branch:            feat/deterministic-writer-ranking-v1
draft PR:          #3
writer ranking:    deterministic_writer_utility_v6
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v4
construction:      de-adverbial-weise-v2
```

Writer v7 remains rejected and rolled back. Ad-hoc writer-ranking and morphology tuning is frozen at v6/v4.

## Established writer findings

### `Arbeitsweise -> Hochzeitsreise` was a retrieval/anchor failure

Legacy retrieval omitted `Hochzeitsreise`. Direct legacy phonetics were usable slant (`0.7574`), while writer right-edge retrieval recovers the candidate through secondary-stress keys and the best secondary-anchor domain is `multisyllabic_perfect`, score `1`.

This is a permanent candidate-universe/phonetic regression, not a requirement that the exact surface form appear in Top 20.

### Family-level surfacing, not family flooding

For `Arbeitsweise`, at least one `right:reise` member must surface in Top 20. Repeated-family flooding remains forbidden. The rejected v7 experiment moved `Hochzeitsreise` only from rank 120 to 101 while creating 4 repeated-family rows in `Arbeitsweise` Top 20 and failing the structural gate.

### Writer v6 cheapness correction

```text
Liebe -> Diebe   rank 1, perfect-class, cheap penalty 0
Leben -> neben   rank 2, perfect-class, cheap penalty 0
Nacht -> macht   rank 1, perfect-class, cheap penalty 0
```

### Morphology v4

Known false splits stay rejected:

```text
Betriebe     -> no bet|riebe
Bestreben    -> no best|reben
Professoren  -> no profes|soren
deutscher    -> no deut|scher
```

Productive `-weise` forms use explicit construction rule `de-adverbial-weise-v2` and resolve to `right:weise` when source/lexical gates are satisfied.

### Lexical safety

Current provisional default-page tiers:

```text
measured usage <= 250000                     -> +0
unranked / unknown usage                     -> +1
measured usage > 250000                      -> +1
explicit rare/archaic/obsolete/dated tag     -> +2
```

Missing usage remains unknown/unranked, not linguistic rarity.

## Writer Page Benchmark v2 — structural baseline passed

The corrected owner-local v6/v4 run is the frozen structural baseline:

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
preferred pronunciation            240 / 240
legacy tier-0 retention             685 / 685
```

Permanent page regressions:

```text
Arbeitsweise -> Hochzeitsreise   rank 120, multisyllabic_perfect, score 1, cheap penalty 0
Arbeitsweise -> right:reise      Weiterreise rank 3
Liebe -> Diebe                   rank 1
Leben -> neben                   rank 2
Nacht -> macht                   rank 1
```

All direct productive-`-weise` and previous false-split morphology regressions passed.

NDCG@10/20 remains `pending_reference` until the relevant current writer cutoff is completely covered by independent human 0–4 songwriting-usefulness labels. Sparse labels or model judgments are not valid substitutes.

## Legacy/runtime invariance — passed

The feature branch keeps accepted/base search isolated:

```text
ranking=legacy -> findRhymes(...)
writer default -> findWriterRhymes(...)
```

The owner-local runtime gate on the current accepted DB passed:

```text
schema                              rhymelab-benchmark-ranking-runtime-candidate-v2
status                              ok
query_count                         27
missing_queries                     []
runtime_candidate_mismatch_queries []
runtime_policy_mismatch_queries    []
protected_order_mismatch_queries   []
reference_evidence                  unavailable_invariance_only
```

Historical local review assets are absent, therefore NDCG/pairwise are null in this run by design. This run is valid for runtime-order, ranking-policy, protected-order and safety invariance.

Newly surfaced safety evidence:

```text
new Top-20 candidates               14
new Top-250 candidates              141
without usage rank                  0
explicit rare                       0
usage rank >100k                    0
outside query-relative horizon      0
```

Only `Spotify` changed Top-20 membership; Top-250 membership changed for `Spotify`, `Twitter`, `TikTok`, and `Instagram`.

Phase 9A is complete. Do not rerun or replace this gate unless later code touches the accepted control path or a migration comparison explicitly requires it.

## Multi-analysis lexical model — Phase 9B migration path implemented

Live morphology proved that DB v4's single selected lemma/POS analysis is not a sufficient final writer substrate.

The source resolver exposes multiple source-supported analyses (`resolutionKey`, lemma, normalized lemma, POS, homograph number, confidence, source record keys, match kinds, style/form tags and candidate IPA evidence). Writer semantics must preserve those alternatives.

Design/core:

```text
docs/WRITER_LEXICAL_MODEL.md
scripts/writer-lexical-model-core.mjs
tests/writer-lexical-model.test.mjs
```

Experimental publish/storage implementation:

```text
scripts/writer-lexical-publish-v3-core.mjs
scripts/writer-lexical-storage-v5-core.mjs
tests/fixtures/writer-lexical-v3-options.json
tests/writer-lexical-publish-storage.test.mjs
tests/local-db-writer-lexical-v5.test.mjs
```

Migration schemas:

```text
publish: rhymelab-de-publish-v3
DB:      rhymelab-local-db-v5
```

Builder behavior:

- default `build-de-rhyme-publish.mjs` remains v2;
- `--writer-lexical-v3` enables the experimental multi-analysis output and defaults to `data/de/publish-v3` unless `--out` is explicit;
- default v2 input to `build-local-db.mjs` remains DB v4;
- publish-v3 input produces DB v5 and defaults to separate v5 DB/report filenames unless explicitly overridden;
- v3 `a[]` preserves all merged analyses; `l/p/g` remain deterministic compatibility fields only;
- v5 stores one normalized `form_analysis` row per `(form_id, analysis_key)`.

The fixture contract verifies equal-confidence adjective/adverb preservation, deterministic provenance merging, source-order independence, stable fingerprinting, compatibility projection, normalized storage and duplicate identity rejection. The end-to-end fixture runs the real local DB builder from publish-v3 into DB-v5.

No owner database rebuild is authorized yet.

## Performance boundary

Right-edge validation still uses suffix `LIKE` retrieval against DB v4. `Arbeitsweise` remains roughly eight seconds on the current owner benchmark and produces 1,353 right-edge / 1,580 merged candidates.

This is intentionally validation-only and not acceptable final local/mobile performance.

## Immediate next work — Phase 9C

1. Keep accepted v2/v4 defaults untouched.
2. Materialize `de-right-edge-anchors-v1` signatures per pronunciation in the experimental v5 path.
3. Add an indexed lookup shape for `(anchor_policy, anchor_key)` and prove query plans use it.
4. Materialize/version `de-attested-right-head-v4` morphology evidence per source-supported `analysis_key`.
5. Resolve hard writer families only through the existing multi-analysis consensus rule; conflicting source-supported families remain unresolved.
6. Add fixture-level candidate-equivalence regressions before any owner DB rebuild.
7. Replace broad suffix `LIKE` probing in the final writer path with indexed anchor retrieval only after equivalence is demonstrated.
8. Then measure DB-size/runtime impact and rerun Writer Page Benchmark v2 on a materialized owner-local DB.
9. Produce an explicit writer-search acceptance report before changing the accepted/base default.

Optional independent human usefulness review can still be prepared for future NDCG@10/20; it is not required to begin 9C.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality, provenance model, benchmark evidence and runtime performance are stable.
