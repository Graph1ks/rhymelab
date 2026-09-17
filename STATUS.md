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

The owner-local gate passed 27/27 queries with no missing queries, runtime candidate mismatches, runtime-policy mismatches or protected-order mismatches. Historical review assets were absent, so NDCG/pairwise remain deliberately unavailable for this invariance-only gate.

## Phase 9B — multi-analysis publish/storage real-data build complete

Experimental migration schemas:

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

Accepted v2/v4 defaults remain untouched.

## Phase 9C — compact materialization owner gate passed

The first materialization was correct but storage-rejected at 1,904.67 MiB. The compact layout stores only the runtime evidence required by the active policies.

Final exact-suffix owner storage after correcting candidate materialization to match legacy `vowel_key LIKE '%key'` string-suffix semantics:

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

The anchor-only correction left morphology untouched and the real query plan uses `PRIMARY KEY(anchor_key=?)`.

## Phase 9D — real-data equivalence complete

`npm run benchmark:writer-v5:equivalence` now passes on owner data:

```text
status                              ok
queries                             12 / 12
missing queries                     0
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
Hochzeitsreise retrieval sentinel   retained
sample anchor plan                  PRIMARY KEY(anchor_key=?)
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

This gate proves exact ordered candidate equivalence for every frozen right-edge channel. The 14.12x number is retrieval-only and is not yet the full Writer Page runtime result.

## Phase 9E — materialized v5 runtime benchmark ready

An opt-in experimental runtime now exists as `materialized-writer-v5-v1`:

- v4/default writer behavior remains the existing validation `LIKE + dynamic morphology` path;
- a fully validated v5 database uses `writer_anchor` for right-edge retrieval;
- v5 morphology is reconstructed from `form_analysis + writer_morphology_evidence`, preserving converged/unresolved/ambiguous multi-analysis semantics;
- the v5 opener refuses incomplete storage contracts;
- the owner benchmark fails if any of the 12 queries does not actually use `materialized-writer-v5-v1`.

CI run #168 passes tests and public-readiness checks.

Next owner gate:

```text
npm run benchmark:writer-page:v5
```

Output:

```text
reports/de-writer-page-benchmark-v5-materialized.json
```

That report must be compared against the frozen Writer Page v2 baseline for structural quality, protected regressions, legacy Tier-0 retention, multi-analysis morphology behavior and full end-to-end latency before any promotion decision.

`findRhymes()` / `ranking=legacy` remains untouched. Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
