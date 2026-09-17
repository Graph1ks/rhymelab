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

The full owner build succeeded after adding the guarded prerequisite/bootstrap wrapper and compact publish-ranking input. Real-data counts:

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

Local publish prerequisites and `data/de/publish-v3` already exist on the owner machine. Do not redownload Kaikki/Leipzig or rebuild publish-v3 for the next gate unless those files are explicitly lost.

## Phase 9C — first owner materialization correct but storage-rejected

The first full materialization produced:

```text
anchor pronunciations              904,836
anchor rows                         2,854,155
morphology analysis rows            967,931
positive morphology rows            325,724
unresolved morphology rows          642,207
ambiguous forms                     29,199
indexed anchor plan                 yes
```

It was internally consistent and did not rewire runtime. However SQLite grew from 727.21 MiB to 1,904.67 MiB, a +1,177.46 MiB materialization delta. This fails the storage-efficiency gate.

`measure-writer-v5-storage.mjs` identified:

```text
writer_morphology_evidence         626.13 MiB
writer_anchor                      551.32 MiB
hot                                457.72 MiB
form_analysis                      269.48 MiB
```

The bloat was schema redundancy, not data corruption: old anchors stored repeated policy/kind/position metadata plus both a PK index and lookup index; old morphology stored 642k unresolved rows and duplicated structured evidence inside `evidence_json`.

## Compact materialization implemented and CI-green

### Compact right-edge anchor storage

Policy remains `de-right-edge-anchors-v1`. Candidate generation is unchanged: every complete right-edge nucleus suffix is still materialized, preserving the old `vowel_key LIKE '%<query-key>'` candidate universe.

Physical storage is now:

```sql
writer_anchor(
  anchor_key TEXT NOT NULL,
  pronunciation_id INTEGER NOT NULL,
  PRIMARY KEY(anchor_key, pronunciation_id)
) WITHOUT ROWID
```

Storage ID: `compact-primary-key-v2`.

There is no duplicated per-row policy/kind/position/nuclei data and no second lookup index. Policy identity stays in `meta`. Fixture tests still prove candidate-ID equality with old suffix-LIKE retrieval, preserve `Arbeitsweise -> Hochzeitsreise`, and verify primary-key lookup.

### Compact morphology evidence

Policy remains `de-attested-right-head-v4`. Derivation remains per source-supported analysis and consensus semantics are unchanged.

Storage ID: `positive-evidence-compact-v2`.

The compact table stores only positive family evidence per `(form_id, analysis_key)` and retains family key, construction rule, split, left normalized form, right normalized form and right-head analysis identity. It is `WITHOUT ROWID`.

Unresolved analysis is represented by absence of a row. This is semantics-preserving because unresolved/null-family evidence never contributed a supported family in `resolveWriterFamilyConsensus`. Conflicting positive families remain detectable as `ambiguous_conflict`.

Removed from per-row storage:

- repeated morphology policy string;
- repeated status string;
- duplicated `evidence_json`;
- unresolved rows;
- redundant morphology family index.

## Compact fixture gate

CI run #145 passes all 157 tests after the compact migration. The end-to-end fixture explicitly distinguishes derived analysis rows from positive rows actually stored. Both runtime rewiring flags remain false.

## Immediate next gate — owner compact remeasurement

Do **not** rerun publish-v3. Rebuild only the experimental v5 SQLite from the existing publish-v3 so the physical-size measurement starts without freelist residue, then compact-materialize and audit:

```powershell
cd C:\Users\svend\rhymelab-public-new
git pull --ff-only

node scripts/build-local-db.mjs --publish data/de/publish-v3
node scripts/materialize-writer-v5.mjs
node scripts/measure-writer-v5-storage.mjs
```

This only replaces `data/local/rhymelab-v5.sqlite` and its experimental reports. It does not touch accepted `data/local/rhymelab.sqlite`.

Collect/upload:

```text
data/local/writer-materialization-v5-report.json
data/local/writer-v5-storage-report.json
```

Required checks:

1. anchor rows remain 2,854,155 and all 904,836 pronunciations are processed;
2. query plan uses the compact primary key;
3. morphology still derives 967,931 analysis rows, with 325,724 positive / 642,207 unresolved and 29,199 ambiguous forms unless a code change legitimately explains a difference;
4. physical/live SQLite size drops substantially versus 1,904.67 MiB;
5. materialization is deterministic on repeat;
6. next implement real-data old-LIKE vs compact-indexed candidate-universe/runtime comparison against frozen Writer Page Benchmark v2;
7. only after equivalence passes may the experimental writer runtime be rewired.

Do not touch `findRhymes()` / `ranking=legacy`. Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
