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

RhymeLab core search stays deterministic and local-only. Do not add LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads or runtime network dependencies. Generated linguistic data, SQLite, benchmark queues/reviews/reference labels, reports and downloaded raw sources remain local/gitignored.

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

The accepted/base path remains `?ranking=legacy`. Do not overwrite the accepted v4 DB.

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

## Frozen Writer Page v2 validation baseline

```text
status                              structural_ok_reference_pending
queries                             12 / 12
mean writer elapsed                 1528.8 ms
Top-20 exact duplicates             0
Top-20 near duplicates              0
Top-20 same-lemma rows              0
Top-20 repeated family rows         0
Top-20 unranked rows                1
Top-20 usage rank >100k rows        25
Top-20 usage rank >250k rows        1
Top-20 explicit rare/historical     0
preferred pronunciation            240 / 240
legacy tier-0 retention             685 / 685
```

Important regression semantics:

- `Arbeitsweise -> Hochzeitsreise` is only a retrieval sentinel (`max_rank: 250`), not a Top-20 requirement.
- Top-20 surfacing is family-based through `Arbeitsweise -> right:reise`.
- `Liebe -> Diebe`, `Leben -> neben`, and `Nacht -> macht` remain protected.
- productive `-weise` plus false-split guards (`Verweise`, `Betriebe`, `Bestreben`, `Professoren`, `deutscher`) remain protected.
- NDCG@10/20 remains `pending_reference` until independent human usefulness labels cover the relevant cutoff.

## Phase 9A — accepted legacy invariance complete

Owner-local control-path invariance passed 27/27 queries with no missing queries, runtime candidate mismatches, runtime-policy mismatches or protected-order mismatches.

## Phase 9B — multi-analysis owner build complete

Experimental schemas are `rhymelab-de-publish-v3` and `rhymelab-local-db-v5`. Real owner data has 838,209 forms / 904,836 pronunciations and 967,931 lexical-analysis rows. Publish-v3 already exists locally; do not redownload/rebuild it unless explicitly necessary.

## Phase 9C — compact materialization complete

Final exact legacy-suffix-equivalent owner DB:

```text
DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
form_analysis                       269.48 MiB
hot                                 457.72 MiB
freelist pages                           0
anchor pronunciations             904,836
anchor rows                      3,153,639
positive morphology rows          325,724
```

Storage contracts:

```text
anchor storage      compact-primary-key-v2
candidate basis     legacy-vowel-key-string-suffix-v1
morphology storage  positive-evidence-compact-v2
```

The real anchor query plan uses `PRIMARY KEY(anchor_key=?)`.

## Phase 9D — real-data equivalence complete / PASS

Owner report passed:

```text
queries                             12 / 12
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
Hochzeitsreise retrieval sentinel   retained
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

This proves exact ordered candidate equivalence for every frozen right-edge channel.

## Phase 9E — materialized runtime structural gate complete / PASS

Experimental runtime ID is `materialized-writer-v5-v1`. It activates only for a complete validated v5 storage contract; default v4 behavior remains unchanged.

First full owner Writer Page run:

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
preferred pronunciation            240 / 240
legacy tier-0 retention             685 / 685
```

All page regressions and all 10 morphology regressions pass. `Hochzeitsreise` is rank 116 as retrieval sentinel; `right:reise` surfaces via `Weiterreise` rank 3. The mean is ~8.3% faster than the 1528.8 ms validation baseline.

Performance is not yet accepted because `Arbeitsweise` is still 7105.7 ms with 1,580 merged candidates. The other 11 queries average about 883.38 ms.

## Phase 9F — current gate: prefix-stable runtime performance refinement

Root cause in the Writer runtime: `findWriterRhymes()` greedily diversity-ranked every merged candidate to the tail even though the API can return at most 250 rows. For `Arbeitsweise`, that meant completing all 1,580 greedy selection rounds.

Implemented performance-only change:

```text
src/writer-search.mjs
  rankWriterRecommendedResults(..., { limit })
  instead of ranking all morphologyRows to completion
```

Why quality is unchanged: greedy selection is prefix-stable. Later selection rounds cannot change an already-selected prefix. No score, tier, morphology rule, diversity rule or ranking policy changed.

Protection:

```text
tests/writer-ranking-prefix-stability.test.mjs
```

The test compares a full ranking with early-stopped selection and requires the selected prefix to be byte-for-byte identical. CI run #174 is green.

### Immediate owner action

Run from repository root:

```powershell
npm run benchmark:writer-page:v5
```

Upload only:

```text
reports/de-writer-page-benchmark-v5-materialized.json
```

The rerun must retain:

1. runtime contract 12/12;
2. structural gate pass;
3. the same Top-10/Top-20 safety/diversity counts;
4. all page + 10 morphology regressions;
5. 685/685 legacy Tier-0 retention;
6. `Hochzeitsreise` only as retrieval sentinel, not Top-20 guard;
7. materially lower `Arbeitsweise` and overall latency.

After that, establish materialization/runtime repeatability and only then consider a Writer Search acceptance report. Do not promote or mark PR #3 ready yet. Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
