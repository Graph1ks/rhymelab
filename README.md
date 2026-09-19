# RhymeLab

Local-first phonetic rhyme engine and songwriting workspace for German and English.

RhymeLab is a **local-only** Node.js + SQLite project. Core search is deterministic and does not require LLM/ML inference, hosted ranking, telemetry, uploads, or a runtime network connection.

## Current runtime

RhymeLab `v0.11.0` promotes the accepted German single-word Writer runtime as the normal local/UI path:

```text
writer runtime        materialized-writer-v5-v1
writer DB schema      rhymelab-local-db-v5
writer ranking        deterministic_writer_utility_v6
right-edge anchor     de-right-edge-anchors-v1
morphology            de-attested-right-head-v4
construction          de-adverbial-weise-v2
```

The previous v4 runtime remains available only as the protected regression/control path through `?ranking=legacy` when `data/local/rhymelab.sqlite` is present.

The accepted Writer v5 evidence is documented in `docs/WRITER_SEARCH_ACCEPTANCE.md`.

## Local run

Requirements:

- Node.js 22.5+
- promoted Writer database at `data/local/rhymelab-v5.sqlite`

Run:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:3030
```

`npm run dev` now uses the materialized v5 Writer runtime by default.

The old v4 database is optional for normal use. If present at `data/local/rhymelab.sqlite`, requests with `?ranking=legacy` use it as the regression/control path.

### Build the Writer v5 database

If `data/local/rhymelab-v5.sqlite` does not exist and the source snapshots are already available locally:

```powershell
npm run writer:v5:rebuild
```

Individual steps are also exposed:

```powershell
npm run de:publish:v3
npm run local:db:v5
npm run writer:v5:materialize
```

Generated databases and downloaded/generated linguistic datasets stay local and gitignored.

## Runtime overrides

```text
RHYMELAB_WRITER_DB   promoted Writer v5 database
RHYMELAB_LEGACY_DB   optional v4 control database
RHYMELAB_HOST        bind host, default 127.0.0.1
RHYMELAB_PORT        port, default 3030
```

`RHYMELAB_DB` remains a compatibility alias for the legacy/control DB path.

## Repository continuity

Repository state is authoritative. In a fresh development thread read:

1. `AGENTS.md`
2. `PROJECT.md`
3. `docs/PHASE_12C_ENTITY_RUNTIME_AI_STAGING_HANDOVER.md`
4. `docs/HANDOVER.md`
5. `STATUS.md`
6. `PROJECT_STATE.json`
7. `ROADMAP.md`
8. `DATA_SOURCES.md`
9. the acceptance/domain documents relevant to the subsystem being changed

`PROJECT.md` holds durable project intent, repository mode, architecture boundaries, cost/licensing/contribution policy, and QA expectations. `STATUS.md` plus the handover documents hold current continuation state. `CHANGELOG.md` is the curated meaningful history from 2026-09-19 onward.

## Tests and public-readiness

```powershell
npm run check
npm test
npm run public:audit
```

GitHub Actions runs the same `validate` gate for pull requests and `main`.

## Writer acceptance summary

The German single-word Writer baseline passed the engineering gates before promotion:

```text
legacy invariance                    27 / 27
retrieval equivalence                12 / 12
retrieval mismatches                      0
morphology regressions               10 / 10
legacy Tier-0 retention              685 / 685
final Writer mean                  1103.9 ms
frozen validation mean             1528.8 ms
mean improvement                     27.8%
repeatability DB opens                    3
repeatability mismatches                  0
```

`Arbeitsweise -> Hochzeitsreise` is a retrieval sentinel only, not a Top-20 requirement. The family surfacing guard is `right:reise`.

Human Writer NDCG@10/20 remains `pending_reference` by explicit project decision until the broader German Writer surface, including phrase/mosaic/phraseology, is mature and independent human reviewers are available.

## Current project state

The major accepted baselines are now:

- **Phase 11 German Phrase/Mosaic:** complete, accepted, and frozen.
- **Phase 12B English single-word Writer:** accepted and frozen; English has its own analyzer/scorer/profile and is not routed through German phonology.
- **Phase 12C source-backed multilingual Entity runtime:** accepted on `main`; the accepted DE Entity fingerprint is preserved and the accepted EN runtime contains source-backed rows only.
- **AI Entity pronunciation staging:** isolated evidence only. It is not canonical runtime truth and is not promoted automatically.

Current follow-up work is intentionally narrower:

1. improve Entity Writer latency without changing accepted semantics;
2. continue only the targeted Top-100k unresolved-Entity pronunciation evidence campaign, not the full unresolved long tail;
3. refine the product/UI without silently changing frozen retrieval, ranking, phonology, or diversity behavior.

Authoritative current-state documents:

- `docs/PHASE_12C_ENTITY_RUNTIME_AI_STAGING_HANDOVER.md`
- `docs/PHASE_12C_ACCEPTANCE.md`
- `docs/ENTITY_AI_PRONUNCIATION_STAGING_V1.md`
- `docs/PHASE_11_ACCEPTANCE.md`
- `docs/WRITER_SEARCH_ACCEPTANCE.md`
- `docs/ENGLISH_WRITER_SOURCE_PLAN.md`

## Data and provenance

Current German source families include Leipzig Corpora Collection for usage evidence, German Wiktionary via Kaikki/Wiktextract for pronunciation and lexical metadata, and a small curated modern-entity pronunciation layer.

Raw third-party snapshots, generated language datasets, runtime SQLite, generated benchmark/reference files, and reports are not committed. See `DATA_SOURCES.md` and `THIRD_PARTY_NOTICES.md`.

## Rhyme model

Primary rhyme classes are exclusive:

- `multisyllabic_perfect`
- `perfect`
- `multisyllabic_slant`
- `family`
- `slant`

Assonance and Consonance are independent overlapping relations. Usage rank is a product-ordering signal, not phonological truth. Missing usage means unknown/unranked, not automatically rare.

## Licensing

RhymeLab is **source-available, not OSI Open Source**.

Graph1ks Material is governed by `LICENSE` and `COMMERCIAL_LICENSE.md`. Third-party material retains its own license and attribution requirements; it is not automatically relicensed by the repository root license.

See:

- `LICENSE`
- `COMMERCIAL_LICENSE.md`
- `THIRD_PARTY_NOTICES.md`
- `DATA_SOURCES.md`

## Contributing

RhymeLab is a public **owner-controlled / solo-dev** project. Issues may be used for bug reports, suggestions, and feedback, but unsolicited external pull requests are not accepted.

Explicitly authorized external code/documentation contributions remain subject to `CONTRIBUTING.md` and `CLA.md`.

Never commit credentials, personal data, downloaded raw third-party corpora, generated local databases, benchmark review/reference files, or generated reports.
