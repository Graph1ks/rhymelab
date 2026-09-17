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

## Writer Page Benchmark v2 — frozen validation baseline

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

`Arbeitsweise -> Hochzeitsreise` is a retrieval sentinel only (`max_rank: 250`), not a Top-20 surfacing requirement. Top-20 surfacing is family-based through `right:reise`. Other protected regressions include `Liebe -> Diebe`, `Leben -> neben`, and `Nacht -> macht`.

NDCG@10/20 remains `pending_reference` until complete independent human usefulness labels cover the current writer cutoff.

## Phase 9A — legacy/runtime invariance complete

The owner-local gate passed 27/27 queries with no missing queries, runtime candidate mismatches, runtime-policy mismatches or protected-order mismatches.

## Phase 9B — multi-analysis publish/storage real-data build complete

Experimental migration schemas remain `rhymelab-de-publish-v3` / `rhymelab-local-db-v5`. The real owner DB has 967,931 lexical-analysis rows across 838,209 forms / 904,836 pronunciations. Accepted v2/v4 defaults remain untouched.

## Phase 9C — compact materialization owner gate passed

Final exact-suffix owner storage:

```text
DB-v5 pre-materialization          727.21 MiB
final experimental DB-v5           819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
form_analysis                       269.48 MiB
hot                                 457.72 MiB
freelist pages                           0
anchor pronunciations             904,836
anchor rows                      3,153,639
positive morphology rows          325,724
```

The real anchor plan uses `PRIMARY KEY(anchor_key=?)`.

## Phase 9D — real-data equivalence complete

Owner equivalence passes:

```text
status                              ok
queries                             12 / 12
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
Hochzeitsreise retrieval sentinel   retained
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

This proves exact ordered candidate equivalence for every frozen right-edge channel.

## Phase 9E — materialized v5 runtime structural gate passed

The first full owner run of `materialized-writer-v5-v1` passes its runtime contract and Writer Page structural gate:

```text
status                              structural_ok_reference_pending
runtime contract                    12 / 12
queries                             12 / 12
mean writer elapsed                 1401.9 ms
median writer elapsed                862.45 ms
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

Protected regressions all pass. `Hochzeitsreise` is rank 116 as the retrieval sentinel; `right:reise` still surfaces through `Weiterreise` at rank 3. `Diebe` remains rank 1, `neben` rank 2 and `macht` rank 1. All 10 morphology regressions pass.

The materialized runtime is about 8.3% faster on the 12-query mean than the frozen 1528.8 ms baseline, but `Arbeitsweise` is still a 7105.7 ms outlier because its 1,580 merged candidates were being greedily diversity-ranked all the way to the tail even though at most 250 rows can be returned.

## Phase 9F — prefix-stable runtime performance refinement

The writer runtime now stops greedy diversity selection at the requested page size. This changes no score, tier, ranking policy, morphology policy or diversity rule: greedy selection is prefix-stable, so later selection rounds cannot change an already-selected top-K prefix.

A dedicated test compares a complete ranking with an early-stopped ranking and requires the selected prefix to be byte-for-byte identical. CI run #174 passes.

Next owner gate:

```text
npm run benchmark:writer-page:v5
```

The rerun must keep the Phase 9E structural metrics/regressions and 685/685 Tier-0 retention while measuring the new full end-to-end latency, especially `Arbeitsweise`.

`findRhymes()` / `ranking=legacy` remains untouched. Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
