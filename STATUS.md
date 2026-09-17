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
- 457.68 MiB SQLite;
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

Permanent regressions include `Arbeitsweise -> Hochzeitsreise` rank 120 / `multisyllabic_perfect` / score 1 / cheap penalty 0, `Arbeitsweise -> right:reise` through `Weiterreise` rank 3, `Liebe -> Diebe` rank 1, `Leben -> neben` rank 2 and `Nacht -> macht` rank 1.

NDCG@10/20 remains `pending_reference` until complete independent human usefulness labels cover the current writer cutoff.

## Phase 9A — legacy/runtime invariance complete

The owner-local gate passed 27/27 queries with no missing queries, runtime candidate mismatches, runtime-policy mismatches or protected-order mismatches. Historical review assets were absent, so NDCG/pairwise remain deliberately unavailable for this invariance-only gate.

## Phase 9B — multi-analysis publish/storage real-data build complete

Experimental migration schemas remain:

```text
publish: rhymelab-de-publish-v3
DB:      rhymelab-local-db-v5
```

The first full owner build completed successfully:

```text
publish forms                     838,199
DB forms                          838,209
DB pronunciations                 904,836
lexical analyses                  967,931
multi-analysis forms              101,315
DB-v5 before writer materialize   727.21 MiB
```

The 10-form / 28-pronunciation difference between publish and DB is exactly the existing supplemental overlay. Accepted v2/v4 defaults remain untouched.

## Phase 9C — materialization correctness passed; first storage layout rejected

The first full owner materialization was internally consistent:

```text
anchor pronunciations processed   904,836
anchor rows                        2,854,155
morphology analysis rows           967,931
positive morphology rows           325,724
unresolved morphology rows         642,207
ambiguous forms                    29,199
anchor query plan indexed          yes
```

However, the first storage layout grew the experimental DB from 727.21 MiB to 1,904.67 MiB (+1,177.46 MiB), so storage efficiency failed the promotion gate.

A SQLite dbstat audit located the bloat:

```text
writer_morphology_evidence         626.13 MiB
writer_anchor                      551.32 MiB
hot                                457.72 MiB
form_analysis                      269.48 MiB
```

The original writer tables duplicated constant policy metadata, morphology JSON payloads and multiple indexes. This was a schema/storage problem, not a source-population or linguistic-correctness problem.

## Compact materialization — fixture gate complete

The experimental materializer now uses compact storage while keeping policy semantics unchanged:

### Anchors

```text
storage: compact-primary-key-v2
writer_anchor(anchor_key, pronunciation_id)
PRIMARY KEY(anchor_key, pronunciation_id) WITHOUT ROWID
```

Every complete right-edge nucleus suffix is still materialized, so the candidate universe is unchanged. Fixture tests still prove equality with the old `vowel_key LIKE '%key'` retrieval and retain `Arbeitsweise -> Hochzeitsreise`. Constant policy/kind/position metadata is no longer duplicated per row; policy identity remains in DB metadata.

### Morphology

```text
storage: positive-evidence-compact-v2
PRIMARY KEY(form_id, analysis_key) WITHOUT ROWID
```

Only positive family evidence is stored. An unresolved analysis is represented by absence of a row; this preserves family-consensus semantics because unresolved/null-family rows never contributed a supported family. Duplicated `evidence_json`, per-row policy/status strings and the redundant family index were removed. Supporting right-head analysis identity and the compact evidence fields remain stored.

CI run #145 passes all 157 tests for the compact layout. Both `accepted_runtime_rewired` and `writer_runtime_rewired` remain false.

## Immediate next gate

Rebuild only the separate experimental DB-v5 from the already-generated local publish-v3, run compact materialization, and remeasure storage. There is no need to redownload sources or rebuild publish-v3.

Required evidence after compact rematerialization:

1. final physical/live SQLite size;
2. compact anchor and morphology table sizes;
3. unchanged real-data anchor row count and indexed plan;
4. unchanged morphology analysis / positive / unresolved / ambiguous counts;
5. deterministic repeatability;
6. candidate-universe/runtime comparison against frozen Writer Page Benchmark v2;
7. only then may the experimental writer runtime replace suffix `LIKE`.

`findRhymes()` / `ranking=legacy` remains untouched. Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
