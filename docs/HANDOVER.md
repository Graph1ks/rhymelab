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

Plan: `docs/PHRASE_MOSAIC_PLAN.md`. Completed source survey: `docs/PHRASE_SOURCE_SURVEY.md`.

### Phase 11A source/licensing gate — COMPLETE

The production source decision is now explicit:

- **German Wiktionary via raw Kaikki/Wiktextract — USE WITH CONDITIONS** for source-backed phraseology;
- **existing Leipzig News 2024 1M + Wikipedia 2021 1M + Web 2021 1M — USE** for deterministic n-gram/attestation/commonness evidence;
- **Tatoeba — USE WITH CONDITIONS** only after contributor attribution is preserved end-to-end;
- **Wikidata Lexemes — USE** as optional semantic/identity support;
- **OpenThesaurus / OdeNet — USE WITH CONDITIONS** as optional semantic support, never as automatic phrase/commonness truth;
- **ParlaMint-AT 4.1 — USE WITH CONDITIONS / LATER** for register/domain enrichment;
- **COLF-VID, PARSEME, GermaNet, DeReKo/COSMAS, broad DWDS corpus use — RESEARCH ONLY** under the reasons in the survey.

Do not download giant new sources merely because they are listed. Do not treat public web phrase lists as ingestible without verified bulk rights.

### Immediate next action — Phase 11B1

Milestone:

`PHASE_11B1_PROVENANCE_PHRASE_CATALOG`

Implement the separate provenance-bearing phrase data model and deterministic fixture ingestion.

Required first slice:

1. `phrase_source` + `phrase_snapshot` license/snapshot/checksum registry;
2. separate `phrase`, `phrase_attestation`, `phrase_token`, and `phrase_usage_evidence` storage;
3. raw German Wiktextract phrase fixture importer preserving source tags/types without invention;
4. deterministic token boundaries and explicit unresolved lexical-token state;
5. Leipzig fixture-derived attestation/commonness kept separate from phraseological type;
6. deterministic fingerprints, idempotency and provenance tests;
7. Tatoeba schema fixture only until author attribution is proven.

Do **not** yet implement:

- phrase pronunciation or connected-speech rules;
- mosaic retrieval/indexing;
- phrase Writer ranking;
- phrase API/UI surfacing;
- Human Writer NDCG;
- giant new corpus downloads.

The accepted single-word Writer v5/v6 baseline stays frozen and must not be retuned for Phase 11.

After 11B1 acceptance, proceed to deterministic phrase pronunciation (11C), then indexed cross-word mosaic retrieval (11D), then separate phrase ranking (11E), then the dedicated phrase/mosaic benchmark (11F).

English remains after the German phrase/mosaic path is stable enough to freeze.
