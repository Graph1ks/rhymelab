# RhymeLab — Thread Handover

Last updated: 2026-09-18

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

Do not invent source, license, phraseology, pronunciation, or benchmark facts. Public web visibility alone is not sufficient for ingestion/redistribution.

## Current runtime — v0.11.0

The accepted German single-word Writer runtime is now the normal product/dev runtime.

```text
package               v0.11.0
default DB            data/local/rhymelab-v5.sqlite
default DB schema     rhymelab-local-db-v5
writer runtime        materialized-writer-v5-v1
writer ranking        deterministic_writer_utility_v6
right-edge anchor     de-right-edge-anchors-v1
anchor storage        compact-primary-key-v2
candidate basis       legacy-vowel-key-string-suffix-v1
morphology            de-attested-right-head-v4
construction          de-adverbial-weise-v2
morphology storage    positive-evidence-compact-v2
```

`npm run dev` uses v5 by default.

The previous v0.10 / DB-v4 runtime is retained only as an optional regression/control path:

```text
control DB            data/local/rhymelab.sqlite
control DB schema     rhymelab-local-db-v4
request               ?ranking=legacy
```

Normal startup requires only the v5 Writer DB. If v4 is absent, only explicit legacy requests are unavailable.

Build/rebuild the v5 Writer database with:

```powershell
npm run writer:v5:rebuild
```

or individual steps:

```powershell
npm run de:publish:v3
npm run local:db:v5
npm run writer:v5:materialize
```

## German single-word Writer baseline — ACCEPTED / PROMOTED / FROZEN

Acceptance report: `docs/WRITER_SEARCH_ACCEPTANCE.md`.

Final owner evidence:

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

Writer v7 remains rejected and rolled back. Do not reopen ad-hoc v6/v4 tuning without a new benchmarked candidate.

## Human Writer NDCG — deliberately deferred

Do **not** run or fabricate Human Writer NDCG now.

Writer Page human usefulness NDCG@10/20 stays `pending_reference` until the broader German Writer system is sufficiently feature-complete — including phrase/mosaic/phraseology — and independent human reviewers exist. The project owner alone is not an independent reference source.

During Phase 11 use structural, provenance, regression, lexical-safety, deterministic-repeatability, and performance gates.

## Current phase — Phase 11 German phrase / mosaic / phraseology

Plan: `docs/PHRASE_MOSAIC_PLAN.md`. Source survey: `docs/PHRASE_SOURCE_SURVEY.md`. Phrase catalog contract: `docs/PHRASE_CATALOG_V1.md`.

### Phase 11A — COMPLETE

The source/licensing decision remains unchanged: raw German Wiktionary/Kaikki for source-backed phraseology plus the frozen Leipzig News 2024 / Wikipedia 2021 / Web 2021 corpora for deterministic attestation/commonness.

### Phase 11B1 — IMPLEMENTED / FIXTURE VALIDATED

Implemented identifiers:

```text
phrase DB schema       rhymelab-phrase-catalog-v1
phrase policy          de-phrase-catalog-v1
Leipzig match policy   leipzig-exact-token-sequence-v1
runtime rewired        false
```

Implemented files include:

- `scripts/phrase-catalog-core.mjs`;
- `scripts/build-de-phrase-catalog.mjs`;
- `scripts/bootstrap-de-phrase-catalog-local.mjs`;
- `sources/phrase/de-phase11b1-v1.json`;
- `tests/phrase-catalog.test.mjs`.

The fixture gate verifies source provenance, source-backed type mapping, duplicate/idempotent ingest, token boundaries, historical-only suppression from modern commonness matching, mixed historical/current handling, Leipzig per-corpus evidence and deterministic repeat-build fingerprint equality.

### Immediate next owner action

Run:

```powershell
npm run phrase:catalog:bootstrap
```

The bootstrap reuses the existing Kaikki cache when available, verifies/downloads the three frozen Leipzig archives, extracts their sentence files, and builds:

```text
data/local/rhymelab-phrases-v1.sqlite
data/local/phrase-catalog-v1-report.json
```

Then review real-data phrase/type/history/token distributions, Leipzig coverage/commonness, obvious noise, DB size/build time, and a second-build fingerprint.

Do **not** start Phase 11C phrase pronunciation until that full-data gate is reviewed. Do not add mosaic indexing, phrase ranking or UI/API phrase surfacing yet.

The accepted single-word Writer remains frozen. Human Writer NDCG remains pending. English remains deferred.
