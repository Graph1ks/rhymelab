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
11. `docs/WRITER_SEARCH_ACCEPTANCE.md`
12. `docs/EXTERNAL_COMPARISON_D_RHYME.md`

## Hard boundary

RhymeLab core search stays deterministic and local-only. Do not add LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads or runtime network dependencies. Generated linguistic data, SQLite, benchmark queues/reviews/reference labels, reports and downloaded raw sources remain local/gitignored.

## Formally accepted/default runtime

The formal runtime baseline remains RhymeLab `v0.10.0`:

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

The accepted/base path remains `?ranking=legacy`. Do not overwrite the accepted v4 DB.

## German single-word writer engineering acceptance — PASS

Branch / PR:

```text
branch:            feat/deterministic-writer-ranking-v1
draft PR:          #3
acceptance report: docs/WRITER_SEARCH_ACCEPTANCE.md
```

Frozen writer stack:

```text
writer ranking       deterministic_writer_utility_v6
right-edge anchor    de-right-edge-anchors-v1
anchor storage       compact-primary-key-v2
candidate basis      legacy-vowel-key-string-suffix-v1
morphology family    de-attested-right-head-v4
construction         de-adverbial-weise-v2
morphology storage   positive-evidence-compact-v2
runtime              materialized-writer-v5-v1
DB schema            rhymelab-local-db-v5
```

Writer v7 remains rejected and rolled back. Do not reopen ad-hoc writer v6/v4 tuning without a new benchmarked candidate.

Engineering acceptance does **not** mean default runtime promotion. The v4 baseline remains the formal default until a separate explicit promotion decision.

## Final owner evidence

### Legacy invariance

```text
queries                             27 / 27
runtime candidate mismatches        0
runtime policy mismatches           0
protected-order mismatches          0
```

### Final compact v5 storage

```text
DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
form_analysis                       269.48 MiB
hot                                 457.72 MiB
freelist pages                           0
anchor rows                      3,153,639
positive morphology rows          325,724
```

### Exact retrieval/morphology equivalence

```text
queries                             12 / 12
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

`Arbeitsweise -> Hochzeitsreise` is a retrieval sentinel only (`max_rank: 250`), not a Top-20 surfacing guard. Top-20 surfacing is family-based through `right:reise`.

### Final Writer Page v5 runtime

```text
status                              structural_ok_reference_pending
runtime contract                    12 / 12
queries                             12 / 12
mean writer elapsed                 1103.9 ms
frozen validation mean              1528.8 ms
mean improvement                     27.8%
Top-20 exact duplicates                  0
Top-20 near duplicates                   0
Top-20 same-lemma rows                   0
Top-20 repeated family rows              0
Top-20 unranked rows                     1
Top-20 usage rank >100k rows            25
Top-20 usage rank >250k rows              1
Top-20 explicit rare/historical           0
preferred pronunciation            240 / 240
legacy Tier-0 retention             685 / 685
```

Protected ranks:

```text
Hochzeitsreise                       116  retrieval sentinel
Weiterreise / right:reise              3
Diebe                                  1
neben                                  2
macht                                  1
```

All five page regressions and all 10 morphology regressions pass.

The prefix-stable runtime optimization reduced `Arbeitsweise` from 7105.7 ms to 3021.8 ms while preserving the same 1,580 merged-candidate universe and the same selected ranking prefix.

### Deterministic repeatability

Owner report:

```text
schema                              rhymelab-writer-v5-repeatability-v1
status                              ok
independent DB opens                     3
queries per run                          12
suite fingerprints equal              true
mismatches                                0
suite fingerprint
c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab
```

All 12 per-query semantic fingerprints and the suite fingerprint are identical across all three independent opens. Timing and report timestamps are excluded from the fingerprint.

## Human-reference status

Writer Page NDCG@10/20 remains `pending_reference`. Complete independent usefulness labels do not exist yet. Do not invent, extrapolate, or substitute a score.

This is an explicit open evidence item, not a failed engineering gate.

## Current decision / next action

`docs/WRITER_SEARCH_ACCEPTANCE.md` records **engineering acceptance PASS** for the German single-word writer baseline.

Immediate next step is owner review of that acceptance document. Keep PR #3 draft until that review. Do not promote the writer runtime to the formal default implicitly.

After acceptance review, Phase 11 German phrase/mosaic rhyme may begin as a separate architecture/benchmark phase. English remains later.
