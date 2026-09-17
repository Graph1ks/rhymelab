# RhymeLab Roadmap

Last updated: 2026-09-17

## Phase 0 — German phonology + source pipeline — complete

German IPA/feature models, Leipzig usage ranking, Kaikki resolver, deterministic local shard pipeline and compact pronunciation-backed publish data are implemented.

## Phase 1 — Local runtime/product foundation — accepted through v0.10

Accepted baseline:

```text
package         v0.10.0
DB schema       rhymelab-local-db-v4
forms           838,209
pronunciations  904,836
preferred       838,209
alternate       66,627
historical      1,038
usage-ranked    260,450
analyzer        de-ipa-v2
scorer          de-phon-v3
relation        rhyme-relations-v2
ranking         modern_entity_relative_commonness_1decade_0_05
```

## Phase 2 — German blind relation/reference benchmark — complete

Refreshed `de-human-rhyme-v1` is complete: 367/367 reviewed with ranking NDCG 0.9562 / pairwise 0.8350. This remains the relation/scorer baseline, not the writer-page benchmark.

## Phase 3 — Benchmark-informed German refinement — accepted first pass

Accepted improvements include `de-ipa-v2`, `de-phon-v3`, `rhyme-relations-v2`, curated-modern pronunciation overlay and provenance-aware pronunciation integrity policy.

## Phase 4 — Runtime ranking isolation — accepted control path

Accepted/base ranking is `modern_entity_relative_commonness_1decade_0_05`. `?ranking=legacy` remains the protected control path while writer search is experimental.

## Phase 5 — Pronunciation coverage + lexical quality — open background work

After writer-search acceptance: cluster remaining IPA failures, prioritize common-word failures, investigate poor preferred defaults, expand reviewed modern vocabulary/provenance, and add fallback/G2P only if attested coverage proves insufficient.

## Phase 6 — Deterministic writer-oriented search — structural validation passed, not promoted

Current policies:

```text
writer ranking:    deterministic_writer_utility_v6
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v4
construction:      de-adverbial-weise-v2
```

No LLM/ML/neural inference, hosted ranking or runtime network dependency is allowed in core retrieval/ranking. Writer v7 remains rejected and rolled back. Ad-hoc writer ranking/morphology tuning is frozen at v6/v4.

## Phase 7 — Multi-analysis lexical/morphology model — experimental migration implemented

Accepted DB v4 stores one selected lemma/POS analysis per form; final writer morphology requires preserving multiple source-supported analyses.

Experimental migration:

```text
publish  rhymelab-de-publish-v3
DB       rhymelab-local-db-v5
```

Implemented:

- all merged lexical analyses/provenance preserved in publish `a[]`;
- deterministic legacy `l/p/g` compatibility projection;
- normalized `form_analysis` keyed by `(form_id, analysis_key)`;
- v2/v4 remain accepted defaults;
- v3/v5 use separate default outputs;
- fixture tests cover ambiguity, provenance, deterministic ordering, normalized storage and end-to-end builder behavior.

## Phase 8 — Writer Page Benchmark v2 — structural baseline passed / human reference pending

Frozen owner-local baseline:

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

Permanent regressions include `Arbeitsweise -> Hochzeitsreise` rank 120/perfect writer-anchor class, `right:reise` surfacing through `Weiterreise` rank 3, `Liebe -> Diebe` rank 1, `Leben -> neben` rank 2 and `Nacht -> macht` rank 1.

NDCG@10/20 remains `pending_reference` until complete independent human usefulness labels cover the relevant writer cutoffs.

## Phase 9 — Legacy invariance + materialized writer runtime — current execution phase

### 9A. Accepted legacy control-path invariance — complete

Owner-local runtime gate:

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

Newly surfaced safety: 14 Top-20 and 141 Top-250 candidates, with zero missing usage rank, zero explicit rare flags, zero >100k usage ranks and zero query-relative horizon violations.

### 9B. Multi-analysis publish/storage — fixture/builder gate complete

Publish-v3 and DB-v5 migration paths are implemented and CI-covered. Accepted v2/v4 defaults and output paths remain unchanged.

### 9C. Right-edge + morphology materialization — fixture gate complete / owner measurement next

Implemented:

```text
scripts/writer-anchor-materialization-v5-core.mjs
scripts/writer-morphology-materialization-v5-core.mjs
scripts/materialize-writer-v5.mjs
tests/writer-anchor-materialization-v5.test.mjs
tests/writer-morphology-materialization-v5.test.mjs
```

Anchor materialization:

- query keys remain exactly `de-right-edge-anchors-v1`;
- candidate side materializes every complete right-edge nucleus suffix, preserving the old `vowel_key LIKE '%key'` candidate universe without a suffix scan;
- indexed lookup is `(anchor_policy, anchor_key)` through `idx_writer_anchor_lookup`;
- fixture test proves candidate-ID equality with the old `LIKE` retrieval and preserves `Arbeitsweise -> Hochzeitsreise`;
- `EXPLAIN QUERY PLAN` must use the anchor lookup index.

Morphology materialization:

- evidence is stored per `(form_id, analysis_key, morphology_policy)`;
- derivation happens independently per source-supported analysis;
- family consensus is applied only after per-analysis derivation;
- `stufenweise` adj+adv converges on `right:weise`;
- `Verweise` remains unresolved;
- conflicting analyses remain `ambiguous_conflict` with no hard family.

End-to-end fixture:

- publish-v3 -> DB-v5 -> writer materialization passes full public CI;
- indexed anchor plan is verified;
- runtime rewiring remains explicitly false.

The fixture gate is now sufficient to authorize a **separate experimental owner v3/v5 build** for real-data size/runtime/equivalence measurements. Accepted v4 must not be overwritten.

Required owner measurement sequence:

1. build publish-v3 to its separate output;
2. build DB-v5 to its separate SQLite/report defaults;
3. run writer materialization;
4. inspect form/pronunciation/analysis/materialization counts;
5. measure SQLite size delta versus accepted v4;
6. verify real DB anchor query plans;
7. establish deterministic materialization repeatability;
8. compare materialized retrieval candidate universe and runtime against the frozen v6/v4 writer benchmark;
9. only then switch the experimental writer runtime away from suffix `LIKE`;
10. rerun Writer Page Benchmark v2 against that materialized runtime.

Do not modify `findRhymes()` / accepted `ranking=legacy` as part of this phase.

## Phase 10 — Writer-search acceptance + German single-word stabilization

Acceptance report must combine Writer Page structural evidence, independent human NDCG when available, legacy invariance, lexical/morphology provenance integrity, materialized runtime performance and deterministic reproducibility. Only then may writer search replace the accepted/base default.

## Phase 11 — Phrase / mosaic rhyme

Only after German single-word writer search is accepted.

## Phase 12 — English profile + benchmark

Separate language-specific sources, parser, scorer and benchmark required.

## Phase 13 — Cross-language rhyme

Only after German and English are individually strong.

## Hosted runtime

Not part of the current roadmap. Core search remains locally executable for desktop, web packaging and later mobile use.
