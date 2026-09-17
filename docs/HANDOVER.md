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

## Hard boundary

RhymeLab core search stays deterministic and local-only. Do not add LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads or runtime network dependencies.

Generated linguistic data, SQLite, benchmark queues/reviews/reference labels, reports and downloaded raw sources remain local/gitignored. `main` is protected; required public check is `validate`.

## Accepted baseline

The formally accepted German baseline remains RhymeLab `v0.10.0`:

```text
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

The accepted/base path remains `?ranking=legacy`.

## Current branch

```text
branch:            feat/deterministic-writer-ranking-v1
draft PR:          #3
writer ranking:    deterministic_writer_utility_v6
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v4
construction:      de-adverbial-weise-v2
```

Writer v7 remains rejected and rolled back. Ad-hoc writer ranking/morphology tuning is frozen at v6/v4.

## Frozen writer correctness baseline

Writer Page Benchmark v2 remains:

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

Permanent regressions include `Arbeitsweise -> Hochzeitsreise` rank 120 / perfect writer-anchor class / score 1 / cheap 0, `right:reise -> Weiterreise` rank 3, `Liebe -> Diebe` rank 1, `Leben -> neben` rank 2 and `Nacht -> macht` rank 1. Productive `-weise` and false-split regressions (`Verweise`, `Betriebe`, `Bestreben`, `Professoren`, `deutscher`) remain protected.

NDCG@10/20 stays `pending_reference` until complete independent human usefulness labels cover the relevant writer cutoffs.

## Phase 9A — legacy/runtime invariance complete

Owner-local legacy control-path invariance passed 27/27 queries with no missing queries, runtime candidate mismatches, runtime-policy mismatches or protected-order mismatches. Historical queue/review assets were absent, so reference metrics are unavailable by design.

Do not invent another competing legacy gate.

## Phase 9B — multi-analysis owner build complete

Experimental schemas:

```text
publish: rhymelab-de-publish-v3
DB:      rhymelab-local-db-v5
```

The full owner build succeeded. Real-data counts:

```text
publish forms                     838,199
DB forms                          838,209
DB pronunciations                 904,836
preferred                         838,209
alternate                         66,627
historical                        1,038
usage-ranked                      260,450
lexical analyses                  967,931
multi-analysis forms              101,315
DB-v5 pre-materialization         727.21 MiB
```

The +10 forms / +28 pronunciations versus publish are exactly the supplemental modern overlay. Publish-v3 preserves all source-supported lexical analyses; DB-v5 normalizes them into `form_analysis`. Accepted v2/v4 defaults remain unchanged.

Local publish prerequisites and `data/de/publish-v3` already exist on the owner machine. Do not redownload Kaikki/Leipzig or rebuild publish-v3 unless those files are explicitly lost.

## Phase 9C — compact materialization owner gate passed

The first full materialization proved correctness but used a rejected storage layout:

```text
first final DB-v5                  1,904.67 MiB
first writer materialization       1,177.46 MiB
writer_anchor                        551.32 MiB
writer_morphology_evidence           626.13 MiB
```

The compact v2 layout keeps the same policies and derivation semantics:

```text
anchor storage      compact-primary-key-v2
anchor PK           (anchor_key, pronunciation_id) WITHOUT ROWID
morphology storage  positive-evidence-compact-v2
morphology PK       (form_id, analysis_key) WITHOUT ROWID
```

Owner remeasurement after a clean DB-v5 rebuild passed:

```text
DB-v5 pre-materialization             727.21 MiB
final compact DB-v5                   816.88 MiB
compact writer materialization         89.67 MiB
reduction vs first final DB-v5       1087.79 MiB (57.11%)
writer materialization reduction       92.38%
writer_anchor                           57.54 MiB
writer_morphology_evidence              32.13 MiB
form_analysis                          269.48 MiB
hot                                    457.72 MiB
freelist pages                              0
```

All real-data counts are unchanged:

```text
anchor pronunciations              904,836
anchor rows                       2,854,155
morphology analysis rows            967,931
positive morphology rows            325,724
unresolved morphology rows          642,207
ambiguous forms                      29,199
```

The real `EXPLAIN QUERY PLAN` uses `PRIMARY KEY(anchor_key=?)`. Therefore compact storage passes the owner size/count/query-plan gate. `form_analysis` remains intentionally unchanged for now so storage optimization and retrieval-quality changes stay separable.

Both `accepted_runtime_rewired` and `writer_runtime_rewired` remain false.

## Phase 9D — real-data candidate/morphology equivalence gate next

Implementation now exists:

```text
scripts/writer-v5-equivalence-core.mjs
scripts/benchmark-writer-v5-equivalence.mjs
tests/writer-v5-equivalence.test.mjs
```

The gate uses the frozen `benchmarks/de-writer-v2/plan.json` and checks before any runtime switch:

1. all 12 Writer Page v2 queries resolve in DB-v5;
2. for every right-edge retrieval channel, compact indexed lookup returns exactly the same candidate IDs in exactly the same order as old `vowel_key LIKE '%key'` retrieval with the same 800-row pool and filters;
3. union candidate membership is identical;
4. `Arbeitsweise -> Hochzeitsreise` remains retrieved;
5. all 10 morphology regressions pass when family consensus is reconstructed from compact positive evidence plus absent-as-unresolved analyses;
6. negative morphology regressions require zero supported false families, so conflicting wrong positives cannot hide behind `ambiguous_conflict`;
7. primary-key query plan is verified;
8. old-LIKE versus indexed retrieval timing is recorded as evidence, but full writer-runtime performance remains a later gate.

Run from the repository root:

```powershell
npm run benchmark:writer-v5:equivalence
```

Output:

```text
data/local/writer-v5-equivalence-report.json
```

If and only if this real-data report is `status: ok`, the next code change may rewire **only the experimental v5 writer runtime** to compact anchors/materialized morphology. Then rerun the complete Writer Page Benchmark v2 and compare page metrics/regressions/ranking against the frozen baseline.

Do not touch `findRhymes()` / `ranking=legacy`. Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
