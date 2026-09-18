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

### Phase 11B1 — FULL OWNER BUILD COMPLETE

The full owner-local Wiktionary + Leipzig phrase catalog build succeeded:

```text
schema                    rhymelab-phrase-catalog-v1
fingerprint               f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
SQLite                    153.74 MiB
phrases                   98,504
modern eligible           97,400
historical only            1,104
mixed historical             148
attestations              99,357
Leipzig usage rows        28,799
runtime rewired            false
```

All three frozen Leipzig corpora completed with 1,000,000 sentences and zero malformed sentence rows. A second independent full build is still required before 11C to confirm the same semantic fingerprint.

### Phase 11B2 — modern register evidence / diagnostics

Cologne Kiezdeutsch 2025 v2 is selected as a lightweight CC BY 4.0 youth/urban/spoken register sensor. Only the three transcription PDFs are downloaded (~970 KiB total); audio is deliberately excluded. Register evidence is additive and cannot create phrase types, candidates, or general commonness claims.

RUEG is now selected through DAKODA's slim German subcorpora: RUEG-Lx (103,779 tokens), RUEG-L1 (41,953) and RUEG-HL (13,413), reported total 159,145. Use EXB + metadata only. Preserve `dipl` and `norm` in parallel; do not collapse the diplomatic surface into normalized text.

Phase 11B2 diagnostics completed successfully. Key result: 15,449 modern-eligible phrases have Leipzig evidence (15.86%); 4,683 occur in all three frozen Leipzig corpora. The raw catalog is lexeme-heavy (92,967 `multiword_lexeme`; 93,863 two-token rows), so abbreviation aliases and generic lexical combinations must remain visible as lower-quality/noise classes rather than being mistaken for phraseology.

Phase 11C1 implementation is now present. It reuses the accepted Writer-v5 pronunciation inventory instead of introducing a second G2P source.

```text
schema                    rhymelab-phrase-pronunciation-v1
policy                    de-phrase-pronunciation-v1
resolver                  writer-v5-preferred-normalized-exact-v1
composition               preferred-token-citation-composition-v1
boundaries                explicit-word-boundary-v1
analyzer                  de-ipa-v2
connected speech          attested-or-explicit-rule-only-v1
```

11C1 materializes exactly one preferred citation pronunciation per fully resolved phrase. Token alternatives are counted but not cross-product-expanded. Unknown tokens remain unresolved; no G2P guessing occurs. Phrase IPA retains word boundaries plus per-token phoneme/syllable spans and all citation stress positions.

The Phase 11B1 catalog fingerprint is explicitly checked before/after materialization and must remain unchanged.

Owner commands after merge:

```powershell
npm run phrase:pronunciation
npm run dev
```

Review `data/local/phrase-pronunciation-v1-report.json` and the IPA section in `http://127.0.0.1:3030/phrases`. Then run the pronunciation materializer again and require an identical pronunciation fingerprint. Phase 11D mosaic retrieval remains blocked until this full-data gate is accepted. RUEG remains independent additive register/context evidence; it is not required to construct citation IPA.

Single-word Writer remains frozen; Human Writer NDCG remains pending.
