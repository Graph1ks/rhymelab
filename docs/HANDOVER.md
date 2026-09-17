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

The last formally accepted German baseline remains RhymeLab `v0.10.0`:

```text
DB schema       rhymelab-local-db-v4
forms           838,209
pronunciations  904,836
preferred       838,209
alternate       66,627
historical      1,038
usage-ranked    260,450
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

Writer v7 remains rejected and rolled back. Ad-hoc ranking/morphology tuning is frozen at v6/v4.

## Frozen writer correctness baseline

Writer Page Benchmark v2 passed structurally:

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

Permanent regressions:

```text
Arbeitsweise -> Hochzeitsreise   rank 120, multisyllabic_perfect, score 1, cheap penalty 0
Arbeitsweise -> right:reise      Weiterreise rank 3
Liebe -> Diebe                   rank 1
Leben -> neben                   rank 2
Nacht -> macht                   rank 1
```

Productive `-weise` regressions and false-split regressions (`Verweise`, `Betriebe`, `Bestreben`, `Professoren`, `deutscher`) pass.

NDCG@10/20 stays `pending_reference` until complete independent human usefulness labels cover the relevant current writer cutoffs.

## Phase 9A — legacy/runtime invariance complete

The owner-local gate passed against the accepted DB:

```text
schema                              rhymelab-benchmark-ranking-runtime-candidate-v2
status                              ok
query_count                         27
missing_queries                     []
runtime_candidate_mismatch_queries []
runtime_policy_mismatch_queries    []
protected_order_mismatch_queries   []
reference_evidence                  unavailable_invariance_only
```

Historical local review assets were absent, so NDCG/pairwise are null by design. Runtime order, ranking-policy identity, protected ordering and safety were validated.

Newly surfaced safety aggregate:

```text
new Top-20 candidates               14
new Top-250 candidates              141
without usage rank                  0
explicit rare                       0
usage rank >100k                    0
outside query-relative horizon      0
```

Only `Spotify` changes Top-20 membership. Top-250 membership changes for `Spotify`, `Twitter`, `TikTok`, and `Instagram`.

Do not invent another competing legacy gate.

## Phase 9B — multi-analysis publish/storage fixture gate complete

Experimental schemas:

```text
publish: rhymelab-de-publish-v3
DB:      rhymelab-local-db-v5
```

Implementation:

```text
scripts/writer-lexical-model-core.mjs
scripts/writer-lexical-publish-v3-core.mjs
scripts/writer-lexical-storage-v5-core.mjs
tests/fixtures/writer-lexical-v3-options.json
tests/writer-lexical-model.test.mjs
tests/writer-lexical-publish-storage.test.mjs
tests/local-db-writer-lexical-v5.test.mjs
```

Contract:

- publish v3 compact `a[]` preserves all merged source-supported analyses/provenance;
- old `l/p/g` are deterministic compatibility projection only;
- DB v5 normalizes analyses into `form_analysis` keyed by `(form_id, analysis_key)`;
- v2/v4 remain default and accepted;
- `--writer-lexical-v3` is explicit and writes to separate default output;
- v3 input to the local DB builder writes separate v5 DB/report defaults.

## Phase 9C — materialization fixture gate complete

New implementation:

```text
scripts/writer-anchor-materialization-v5-core.mjs
scripts/writer-morphology-materialization-v5-core.mjs
scripts/materialize-writer-v5.mjs
tests/writer-anchor-materialization-v5.test.mjs
tests/writer-morphology-materialization-v5.test.mjs
```

### Anchor equivalence

The current validation runtime uses:

```text
vowel_key LIKE '%<query-key>'
```

A candidate-side index cannot preserve that universe by storing only the candidate's own secondary anchors. The correct indexed equivalent is to materialize **every complete right-edge nucleus suffix** for every pronunciation, while query keys remain exactly `de-right-edge-anchors-v1`.

Experimental lookup table/index:

```text
writer_anchor
idx_writer_anchor_lookup(anchor_policy, anchor_key, pronunciation_id)
```

Fixture tests prove:

- indexed equality lookup returns exactly the same candidate IDs as the old suffix-`LIKE` validation path;
- `Arbeitsweise -> Hochzeitsreise` remains recoverable;
- `EXPLAIN QUERY PLAN` uses `idx_writer_anchor_lookup`.

### Multi-analysis morphology

Experimental evidence table:

```text
writer_morphology_evidence
PRIMARY KEY(form_id, analysis_key, morphology_policy)
```

Evidence is derived independently per source-supported analysis. The existing family consensus rule is applied only afterward.

Fixtures prove:

- `stufenweise` adjective + adverb analyses both derive `right:weise` via `de-adverbial-weise-v2`, so consensus resolves;
- `Verweise` remains unresolved;
- genuinely conflicting source-supported analyses remain `ambiguous_conflict` with no hard family;
- right-head analysis identity remains in provenance.

### End-to-end materializer

A tiny publish-v3 fixture now:

1. builds DB-v5 through the real DB builder;
2. runs `scripts/materialize-writer-v5.mjs`;
3. creates `writer_anchor` and `writer_morphology_evidence`;
4. verifies the anchor query plan uses the lookup index;
5. confirms `accepted_runtime_rewired=false` and `writer_runtime_rewired=false`.

Full public CI is green for the materializer path.

No accepted DB was overwritten and no full owner v5 DB has been built yet.

## Immediate next gate — separate owner v5 measurement

Fixture-level correctness is now sufficient to authorize a **separate experimental** owner v3/v5 build. This is the first point where rebuilding experimental data is useful. It must not overwrite `data/de/publish`, `data/local/rhymelab.sqlite` or the accepted v4 report.

After pulling the current feature branch, the intended owner-local sequence is:

```powershell
node scripts/build-de-rhyme-publish.mjs --writer-lexical-v3
node scripts/build-local-db.mjs --publish data/de/publish-v3
node scripts/materialize-writer-v5.mjs
```

Default experimental outputs are separate:

```text
data/de/publish-v3/
data/local/rhymelab-v5.sqlite
data/local/build-report-v5.json
data/local/writer-materialization-v5-report.json
```

Required owner evidence before any runtime switch:

1. publish-v3 counts, lexical-analysis count and multi-analysis form count;
2. DB-v5 form/pronunciation parity with accepted source population where expected;
3. DB-v5 SQLite size and delta versus v4;
4. writer-anchor row count and real `EXPLAIN QUERY PLAN` index usage;
5. morphology evidence/resolved/unresolved/ambiguous counts;
6. deterministic materialization repeatability;
7. then a materialized retrieval/runtime comparison against the frozen Writer Page Benchmark v2 candidate universe.

Do **not** switch `findWriterRhymes()` away from suffix `LIKE` until the real-data equivalence gate passes. Do not touch `findRhymes()` / `ranking=legacy` as part of this measurement.

Phrase/mosaic rhyme and English remain after German single-word writer-search acceptance.
