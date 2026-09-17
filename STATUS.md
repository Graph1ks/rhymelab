# Public-facing status

Last updated: 2026-09-17

RhymeLab's public repository is `Graph1ks/rhymelab`. `main` is protected and the required public CI check is `validate`.

## Accepted baseline

The formally accepted German runtime remains RhymeLab `v0.10.0`:

- DB schema `rhymelab-local-db-v4`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternate pronunciations;
- 1,038 historical-only forms;
- 260,450 usage-ranked forms;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- ranking `modern_entity_relative_commonness_1decade_0_05`.

The accepted/base path remains `?ranking=legacy`. No accepted baseline, scorer or relation policy has changed on the writer branch.

## Experimental writer branch

Feature branch `feat/deterministic-writer-ranking-v1` / draft PR #3 uses:

```text
writer ranking:    deterministic_writer_utility_v6
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v4
construction:      de-adverbial-weise-v2
```

Writer v7 remains rejected and rolled back. Ad-hoc ranking/morphology tuning is frozen at v6/v4. The core remains deterministic, local-only, and free of LLM/ML inference, hosted ranking, telemetry and runtime network dependencies.

## Writer Page Benchmark v2 — structural baseline frozen

The corrected owner-local v6/v4 run passed:

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
legacy tier-0 retention             685 / 685
```

Permanent regressions pass:

```text
Arbeitsweise -> Hochzeitsreise   rank 120, multisyllabic_perfect, score 1, cheap penalty 0
Arbeitsweise -> right:reise      Weiterreise rank 3
Liebe -> Diebe                   rank 1
Leben -> neben                   rank 2
Nacht -> macht                   rank 1
```

Productive `-weise` and false-split morphology regressions pass. NDCG@10/20 remains `pending_reference` until the current writer cutoff is completely covered by independent human songwriting-usefulness labels.

## Phase 9A — legacy/runtime invariance complete

The owner-local retrieval-aware gate passed against the accepted DB:

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

The historical local queue/review files were absent, so NDCG/pairwise values are deliberately null. Runtime order, policy identity, protected ordering and safety are still fully validated.

Safety of newly surfaced candidates:

```text
new Top-20 candidates               14
new Top-250 candidates              141
without usage rank                  0
explicit rare                       0
usage rank >100k                    0
usage rank >500k                    0
outside relative 1-decade horizon   0
unknown relative horizon            0
```

Only `Spotify` changes Top-20 membership. Top-250 membership changes for `Spotify`, `Twitter`, `TikTok`, and `Instagram`.

## Phase 9B — multi-analysis publish/storage fixture gate complete

Experimental migration schemas:

```text
publish: rhymelab-de-publish-v3
DB:      rhymelab-local-db-v5
```

Implemented:

- compact publish `a[]` preserves all merged source-supported lexical analyses and provenance;
- legacy `l/p/g` remain deterministic compatibility projection only;
- normalized `form_analysis` stores one row per `(form_id, analysis_key)`;
- default publish v2 / DB v4 paths remain untouched;
- `--writer-lexical-v3` is explicit and defaults to separate publish-v3 output;
- publish-v3 input defaults to separate v5 SQLite/report outputs;
- fixture tests cover equal-confidence ambiguity, deterministic provenance merging, source-order independence, duplicate rejection and end-to-end publish-v3 -> DB-v5 construction.

## Phase 9C — materialization fixture gate complete; owner measurement next

The experimental v5 materialization layer now exists without rewiring runtime:

```text
scripts/writer-anchor-materialization-v5-core.mjs
scripts/writer-morphology-materialization-v5-core.mjs
scripts/materialize-writer-v5.mjs
tests/writer-anchor-materialization-v5.test.mjs
tests/writer-morphology-materialization-v5.test.mjs
tests/local-db-writer-lexical-v5.test.mjs
```

### Indexed right-edge retrieval contract

The old validation path uses `vowel_key LIKE '%<query-key>'`. Exact candidate equivalence requires materializing every complete right-edge nucleus suffix for each candidate pronunciation, while query keys remain exactly those produced by `de-right-edge-anchors-v1`.

The v5 table/index is:

```text
writer_anchor
idx_writer_anchor_lookup(anchor_policy, anchor_key, pronunciation_id)
```

Fixture evidence now proves:

- indexed equality lookup returns the same candidate IDs as the old suffix-`LIKE` path;
- `Arbeitsweise -> Hochzeitsreise` remains in the right-edge candidate universe;
- `EXPLAIN QUERY PLAN` uses `idx_writer_anchor_lookup`.

### Multi-analysis morphology materialization

The v5 table `writer_morphology_evidence` stores versioned evidence per `(form_id, analysis_key, morphology_policy)`.

Fixtures prove:

- adjective + adverb analyses for `stufenweise` independently converge on `right:weise` through `de-adverbial-weise-v2`;
- `Verweise` remains unresolved;
- conflicting source-supported analyses remain `ambiguous_conflict` with no hard family;
- evidence retains the supporting right-head analysis identity.

### End-to-end materializer

A tiny publish-v3 fixture now builds DB-v5, runs `materialize-writer-v5.mjs`, creates indexed anchors and morphology evidence, verifies the anchor query plan, and confirms both accepted and writer runtime rewiring flags remain false. Full public CI is green for this path.

No accepted DB has been overwritten and no owner experimental v5 DB has been built yet.

## Next gate

Fixture-level storage/materialization correctness is now sufficient to permit a **separate experimental owner v3/v5 build** for real-data measurement. This must not overwrite `data/local/rhymelab.sqlite` or change the accepted v4 control path.

The next evidence required is:

1. real publish-v3 / DB-v5 build counts and size delta;
2. full v5 writer materialization counts;
3. indexed anchor query-plan confirmation on the real DB;
4. deterministic candidate-equivalence/runtime comparison against the frozen v6/v4 writer baseline;
5. only after that, switch the experimental writer runtime away from suffix `LIKE` and rerun Writer Page Benchmark v2;
6. produce an explicit writer-search acceptance report before any default promotion.

Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
