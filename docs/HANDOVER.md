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

Important regression semantics:

- `Arbeitsweise -> Hochzeitsreise` is only a retrieval sentinel (`max_rank: 250`), not a Top-20 requirement.
- Top-20 surfacing is family-based: `Arbeitsweise -> right:reise`.
- `Liebe -> Diebe`, `Leben -> neben`, and `Nacht -> macht` remain protected.
- Productive `-weise` plus false-split guards (`Verweise`, `Betriebe`, `Bestreben`, `Professoren`, `deutscher`) remain protected.
- NDCG@10/20 stays `pending_reference` until independent human usefulness labels cover the relevant cutoff.

## Phase 9A — accepted legacy invariance complete

Owner-local control-path invariance passed 27/27 queries with no missing queries, runtime candidate mismatches, runtime-policy mismatches or protected-order mismatches. Do not invent a competing legacy gate.

## Phase 9B — multi-analysis owner build complete

Experimental schemas:

```text
publish  rhymelab-de-publish-v3
DB       rhymelab-local-db-v5
```

Real owner data:

```text
publish forms                     838,199
DB forms                          838,209
DB pronunciations                 904,836
lexical analyses                  967,931
multi-analysis forms              101,315
DB-v5 pre-materialization         727.21 MiB
```

Publish-v3 preserves all source-supported lexical analyses; DB-v5 stores them in `form_analysis`. Local publish-v3 already exists on the owner machine; do not redownload/rebuild it unless explicitly necessary.

## Phase 9C — compact materialization complete

The first correct layout was storage-rejected at 1,904.67 MiB. Compact storage is now:

```text
writer_anchor       PRIMARY KEY(anchor_key, pronunciation_id) WITHOUT ROWID
anchor storage      compact-primary-key-v2
candidate basis     legacy-vowel-key-string-suffix-v1

writer_morphology_evidence
                    PRIMARY KEY(form_id, analysis_key) WITHOUT ROWID
morphology storage  positive-evidence-compact-v2
```

After correcting candidate materialization to exactly reproduce legacy `vowel_key LIKE '%key'` string-suffix semantics, the final owner DB is:

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

The anchor-only correction left morphology unchanged and the query plan uses `PRIMARY KEY(anchor_key=?)`.

## Phase 9D — real-data equivalence complete / PASS

Owner report `data/local/writer-v5-equivalence-report.json` passed:

```text
schema                              rhymelab-writer-v5-equivalence-v1
status                              ok
queries                             12 / 12
missing queries                     0
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
Hochzeitsreise retrieval sentinel   retained
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

This proves exact ordered candidate equality for every frozen right-edge channel. The speedup is retrieval-only, not full Writer Page latency.

## Phase 9E — materialized v5 runtime benchmark is the current gate

Experimental runtime ID:

```text
materialized-writer-v5-v1
```

Implemented:

```text
src/writer-materialized-runtime.mjs
src/experimental-writer-db.mjs
scripts/benchmark-writer-page-v5-materialized.mjs
tests/writer-materialized-runtime.test.mjs
```

Behavior:

- default v4 writer path stays unchanged (`LIKE + dynamic morphology`);
- only a complete v5 storage contract activates materialized retrieval/morphology;
- v5 right-edge retrieval uses `writer_anchor`;
- v5 morphology reconstructs multi-analysis consensus from `form_analysis + writer_morphology_evidence`;
- converged, unresolved and ambiguous-conflict states are preserved;
- the benchmark fails if any frozen query does not actually report runtime ID `materialized-writer-v5-v1`.

CI run #168 is green.

### Immediate owner action

Run from repository root:

```powershell
npm run benchmark:writer-page:v5
```

Expected output report:

```text
reports/de-writer-page-benchmark-v5-materialized.json
```

Upload that report. Then compare against the frozen Writer Page v2 baseline for:

1. all 12 queries using `materialized-writer-v5-v1`;
2. structural gate status;
3. Top-10/Top-20 duplicate/family/safety metrics;
4. page regressions and the 10 morphology regressions;
5. legacy Tier-0 retention;
6. end-to-end mean writer latency versus 1528.8 ms;
7. NDCG remains pending unless independent complete human labels exist.

Only if this gate passes should an acceptance report be considered. Do not promote or mark PR #3 ready yet.

Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
