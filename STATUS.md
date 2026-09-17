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

Writer v7 remains rejected and rolled back. Ad-hoc ranking/morphology tuning is frozen at v6/v4. Core search remains deterministic, local-only, and free of LLM/ML inference, hosted ranking, telemetry and runtime network dependencies.

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

Owner real-data counts:

```text
publish forms                     838,199
DB forms                          838,209
DB pronunciations                 904,836
lexical analyses                  967,931
multi-analysis forms              101,315
DB-v5 before writer materialize   727.21 MiB
```

The 10-form / 28-pronunciation difference between publish and DB is exactly the existing supplemental overlay. Accepted v2/v4 defaults remain untouched.

## Phase 9C — compact materialization owner gate passed

The first materialization was correct but storage-rejected at 1,904.67 MiB final / +1,177.46 MiB writer delta. The compact layout keeps semantics unchanged while removing repeated metadata, redundant indexes, duplicated JSON and unresolved morphology rows.

Compact storage:

```text
anchor storage      compact-primary-key-v2
anchor PK           (anchor_key, pronunciation_id) WITHOUT ROWID
morphology storage  positive-evidence-compact-v2
morphology PK       (form_id, analysis_key) WITHOUT ROWID
```

Clean owner remeasurement:

```text
DB-v5 pre-materialization          727.21 MiB
final compact DB-v5                816.88 MiB
compact writer delta                89.67 MiB
writer_anchor                        57.54 MiB
writer_morphology_evidence           32.13 MiB
form_analysis                       269.48 MiB
hot                                 457.72 MiB
freelist pages                           0
```

That removes 1,087.79 MiB versus the first final v5 build and cuts writer-materialization storage by 92.38%.

Real-data counts remain exactly stable:

```text
anchor pronunciations             904,836
anchor rows                      2,854,155
morphology analyses               967,931
positive morphology rows          325,724
unresolved morphology rows        642,207
ambiguous forms                     29,199
```

The real query plan uses `PRIMARY KEY(anchor_key=?)`. Compact storage therefore passes size/count/query-plan validation. Runtime rewiring is still false.

## Phase 9D — real-data equivalence next

A read-only owner gate now exists:

```text
npm run benchmark:writer-v5:equivalence
```

It compares old suffix-`LIKE` retrieval with compact indexed retrieval over every right-edge channel for all 12 frozen Writer Page v2 queries, requiring exact ordered candidate-ID equality and preserving `Arbeitsweise -> Hochzeitsreise`. It also evaluates all 10 morphology regressions from compact multi-analysis evidence and records retrieval timing.

Output:

```text
data/local/writer-v5-equivalence-report.json
```

Only if that report is `status: ok` may the experimental v5 writer runtime be switched to compact anchors/materialized morphology. The complete Writer Page Benchmark v2 must then be rerun before any promotion decision.

`findRhymes()` / `ranking=legacy` remains untouched. Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
