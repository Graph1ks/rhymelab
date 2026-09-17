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
SQLite          457.68 MiB
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

## Phase 7 — Multi-analysis lexical/morphology model — owner build complete

Experimental migration:

```text
publish  rhymelab-de-publish-v3
DB       rhymelab-local-db-v5
```

Real-data owner build is complete. Publish-v3 preserves all source-supported lexical analyses/provenance; DB-v5 stores normalized `form_analysis` rows. Real DB-v5 before writer materialization is 727.21 MiB with 967,931 lexical-analysis rows and the accepted 838,209 / 904,836 form/pronunciation population after the existing supplemental overlay.

Accepted v2/v4 outputs remain unchanged.

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

Permanent regressions include `Arbeitsweise -> Hochzeitsreise` rank 120/perfect writer-anchor class, `right:reise` through `Weiterreise` rank 3, `Liebe -> Diebe` rank 1, `Leben -> neben` rank 2 and `Nacht -> macht` rank 1.

NDCG@10/20 remains `pending_reference` until complete independent human usefulness labels cover the relevant writer cutoffs.

## Phase 9 — Legacy invariance + materialized writer runtime — current execution phase

### 9A. Accepted legacy control-path invariance — complete

Owner-local runtime gate passed 27/27 queries with no missing queries, runtime candidate mismatches, runtime-policy mismatches or protected-order mismatches. Newly surfaced candidates were safety-clean. Historical reference assets were unavailable, so reference metrics are intentionally absent.

### 9B. Multi-analysis publish/storage — real-data build complete

Publish-v3 / DB-v5 builder migration is complete and real-data counts are internally consistent. Accepted v2/v4 defaults remain unchanged.

### 9C. Right-edge + morphology materialization — correctness passed; compact storage remeasurement next

The first full owner materialization proved correctness and indexed lookup, but its initial schema was storage-inefficient:

```text
DB-v5 before writer materialization     727.21 MiB
first materialized DB-v5              1904.67 MiB
writer materialization delta          1177.46 MiB
writer_anchor                          551.32 MiB
writer_morphology_evidence             626.13 MiB
```

This first layout is rejected for storage efficiency, not linguistic correctness.

Compact storage is now implemented and CI-covered:

```text
anchor storage      compact-primary-key-v2
anchor PK           (anchor_key, pronunciation_id) WITHOUT ROWID
morphology storage  positive-evidence-compact-v2
morphology PK       (form_id, analysis_key) WITHOUT ROWID
```

Anchor semantics are unchanged: every complete right-edge nucleus suffix is still materialized, preserving old suffix-LIKE candidate equivalence. Per-row constant policy/kind/position metadata and the second lookup index were removed.

Morphology derivation semantics are unchanged. Only positive family evidence is physically stored; unresolved evidence is represented by absence of a row because null-family rows never contributed family support. Duplicated JSON, repeated policy/status strings and a redundant family index were removed. Conflicting positive families remain detectable.

CI run #145 passes all 157 tests for the compact layout. Runtime rewiring remains false.

Next owner measurement sequence uses the already-generated `data/de/publish-v3` and must not rebuild/download sources:

1. rebuild only separate DB-v5 from existing publish-v3;
2. compact-materialize writer anchors/morphology;
3. run `measure-writer-v5-storage.mjs`;
4. verify real anchor/pronunciation counts and compact primary-key plan;
5. verify morphology analysis/positive/unresolved/ambiguous counts;
6. verify deterministic materialization repeatability;
7. compare compact indexed retrieval candidate universe/runtime against frozen Writer Page Benchmark v2;
8. only then switch the experimental writer runtime away from suffix `LIKE`;
9. rerun Writer Page Benchmark v2 against the materialized runtime.

Do not modify `findRhymes()` / accepted `ranking=legacy` as part of this phase.

## Phase 10 — Writer-search acceptance + German single-word stabilization

Acceptance report must combine Writer Page structural evidence, independent human NDCG when available, legacy invariance, lexical/morphology provenance integrity, compact materialized runtime performance and deterministic reproducibility. Only then may writer search replace the accepted/base default.

## Phase 11 — Phrase / mosaic rhyme

Only after German single-word writer search is accepted.

## Phase 12 — English profile + benchmark

Separate language-specific sources, parser, scorer and benchmark required.

## Phase 13 — Cross-language rhyme

Only after German and English are individually strong.

## Hosted runtime

Not part of the current roadmap. Core search remains locally executable for desktop, web packaging and later mobile use.
