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
7. `docs/WRITER_SEARCH_ACCEPTANCE.md`
8. `docs/PHRASE_MOSAIC_PLAN.md`
9. `docs/BENCHMARK.md`
10. `docs/API.md`
11. `docs/WRITER_RANKING.md`
12. `docs/WRITER_LEXICAL_MODEL.md`
13. `docs/EXTERNAL_COMPARISON_D_RHYME.md`

## Hard boundary

RhymeLab core search stays deterministic and local-only. Do not add LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads or runtime network dependencies. Generated linguistic data, SQLite, benchmark queues/reviews/reference labels, reports and downloaded raw sources remain local/gitignored.

Do not invent source, license, phraseology, pronunciation, or benchmark facts. A publicly readable website is not automatically an ingestible/redistributable data source.

## German single-word writer engineering baseline — PASS / FROZEN

Acceptance report: `docs/WRITER_SEARCH_ACCEPTANCE.md`.

Frozen stack:

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

Writer v7 remains rejected and rolled back. Do not reopen ad-hoc v6/v4 tuning without a new benchmarked candidate.

## Final single-word owner evidence

```text
legacy invariance                    27 / 27
runtime candidate mismatches              0
runtime policy mismatches                 0
protected-order mismatches                0

DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
anchor rows                      3,153,639
positive morphology rows          325,724
freelist pages                           0

retrieval equivalence                12 / 12
retrieval mismatch queries                0
morphology regressions               10 / 10
retrieval-only speedup                 14.12x

Writer Page runtime contract         12 / 12
structural gate                          PASS
final mean writer elapsed            1103.9 ms
frozen validation mean               1528.8 ms
mean improvement                       27.8%
Arbeitsweise final                   3021.8 ms
Arbeitsweise previous                7105.7 ms
Arbeitsweise improvement               57.5%
legacy Tier-0 retention              685 / 685
Top-20 exact duplicates                    0
Top-20 near duplicates                     0
Top-20 same-lemma rows                     0
Top-20 repeated family rows                0
preferred pronunciation              240 / 240

repeatability independent opens            3
suite fingerprints equal                true
repeatability mismatches                   0
suite fingerprint
c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab
```

Protected semantics:

- `Arbeitsweise -> Hochzeitsreise` is only a retrieval sentinel (`max_rank: 250`), not a Top-20 guard; final rank 116.
- `Arbeitsweise -> right:reise` is the family surfacing guard; `Weiterreise` rank 3.
- `Liebe -> Diebe` rank 1.
- `Leben -> neben` rank 2.
- `Nacht -> macht` rank 1.
- all 10 productive-`-weise` / false-split morphology regressions pass.

## Human Writer NDCG — deliberately deferred

Do **not** run or fabricate Human Writer NDCG now.

Project decision: Writer Page human usefulness NDCG@10/20 stays `pending_reference` until the German writer system is sufficiently feature-complete — including phrase/mosaic/phraseology — and independent human reviewers exist. The project owner alone is not an independent reference source.

During Phase 11 use structural, provenance, regression, lexical-safety, deterministic-repeatability, and performance gates.

## Current phase — Phase 11 German phrase / mosaic / phraseology

Plan: `docs/PHRASE_MOSAIC_PLAN.md`.

### Immediate next action: Phase 11A source survey

The project does **not** yet have a complete public/source-backed phrase database. Before runtime implementation, research candidate German data sources for:

- common multi-word phrases / n-grams / collocations;
- idioms / Redewendungen;
- proverbs / formulaic expressions;
- metaphors / figurative expressions where structured public data exists;
- common sentence fragments useful to lyricists;
- semantic resources useful for deterministic phrase discovery.

For every candidate source capture:

- source/project name and download/API location;
- license and attribution/share-alike requirements;
- redistribution and commercial compatibility;
- snapshot/version;
- bulk/reproducible access method;
- raw format and approximate scale;
- phrase types actually covered;
- stable provenance identifier;
- whether ingestion can produce a fully offline runtime.

OpenThesaurus and OdeNet are candidate semantic ingredients only; do not assume they solve phraseology/idioms/metaphors by themselves.

### After source selection

1. design a separate provenance-bearing phrase data model;
2. construct deterministic phrase pronunciations from accepted local token pronunciations;
3. design indexed rhyme-span retrieval that can cross word boundaries without full-corpus scans;
4. define a separate phrase/mosaic writer-ranking policy instead of changing single-word v6;
5. build a dedicated German Phrase/Mosaic benchmark with structural, provenance, safety, performance, and repeatability gates;
6. collect independent Human Writer NDCG only after the broader German writer surface is mature enough.

## Repository transition

Owner acceptance review of the single-word writer baseline is complete. PR #3 is authorized to merge after the final `validate` check is green. After merge, continue Phase 11 from `main`; do not reconstruct the old feature branch as project memory.

English remains after the German phrase/mosaic path is stable enough to freeze.
