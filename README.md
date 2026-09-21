# RhymeLab

Local-first phonetic rhyme engine and songwriting workspace for German and English.

RhymeLab is a **local-only** Node.js + SQLite project. Core search is deterministic and does not require LLM/ML inference, hosted ranking, telemetry, uploads, or a runtime network connection.

## Current runtime

RhymeLab `v0.11.0` now uses the canonical single-file Serving-v1 product runtime and Studio V2 shell:

~~~text
product shell          Studio V2 (default / route)
product runtime        serving-v1-single-db-product-candidate
canonical database     data/local/rhymelab-serving-v1.sqlite
search channels        DE/EN Words + Phrase/Mosaic + Entities
generated policy       available by default, explicit opt-out
legacy Search          /search and /legacy
RhymePad fallback      /pad and /pad-legacy
~~~

The accepted Writer/rhyme semantics remain deterministic and source-backed. Historical Writer-v5/v4 paths are retained as engineering/control inputs rather than the normal product route.

Markov / Constrained Lyric Decoder V2 is intentionally frozen. Its demo infrastructure may ship, but it is not part of RhymeLab product navigation.

## Local run

Requirements:

- Node.js 22.5+
- canonical Serving-v1 database at `data/local/rhymelab-serving-v1.sqlite`

Run:

~~~powershell
npm run dev
~~~

Open:

~~~text
http://127.0.0.1:3030
~~~

Studio V2 is served at the root route. The previous Search and RhymePad remain available for regression/fallback use.

To temporarily restore Search as the root route:

~~~powershell
npm run dev:search-default
~~~

### Build the canonical Serving-v1 database

If the canonical product database is not available and the required local source/runtime material has already been prepared:

~~~powershell
npm run serving:v1:build
npm run serving:v1:status
~~~

Generated databases and downloaded/generated linguistic datasets stay local and gitignored.

## Runtime overrides

~~~text
RHYMELAB_SERVING_V1_DB   canonical Serving-v1 product database
RHYMELAB_SEARCH_DEFAULT  set to 1 to use previous Search at /
RHYMELAB_HOST            bind host, default 127.0.0.1
RHYMELAB_PORT            port, default 3030
~~~

Legacy Writer/database override variables remain available for explicit engineering/control modes.

### Browser unknown-word pronunciation test

Run the normal development server, then open:

```text
http://127.0.0.1:3030/query-pronunciation-test
```

This test keeps the normal database/retrieval/ranking pipeline intact and moves only missing query pronunciation into browser JavaScript. Multi-word queries are resolved token-by-token: existing DB pronunciations are reused and only missing token pronunciations are generated locally. Generated OOV token pronunciations are cached in IndexedDB across reloads, but only after the app's initial health/DB revision check; DB or resolver updates invalidate stale cache entries.

## Repository continuity

Repository state is authoritative. In a fresh development thread read:

1. `AGENTS.md`
2. `PROJECT.md`
3. `docs/STUDIO_V2_HANDOVER.md`
4. `docs/STUDIO_V2_DEVICE_ACCEPTANCE.md`
5. `docs/HANDOVER.md`
6. `STATUS.md`
7. `PROJECT_STATE.json`
8. `ROADMAP.md`
9. `DATA_SOURCES.md`
10. the acceptance/domain documents relevant to the subsystem being changed

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
- **Client Total Query Pronunciation:** unknown words and partially unresolved word chains resolve to ephemeral DE/EN query anchors in the end-user client. Source-backed token pronunciation still wins; only missing token IPA is generated client-side, then the existing Writer/Phrase/Entity search pipeline continues unchanged. eSpeak-NG is benchmark-only and is not an end-user runtime dependency.

Current follow-up work is intentionally narrower:

1. complete the seven real-device/browser/touch/Web Audio acceptance checks for live Studio V2;
2. fix only concrete Studio regressions found by that acceptance while keeping the Search-root rollback available;
3. preserve Serving-v1 and the accepted Phrase/English/Entity/ranking semantics;
4. keep Markov frozen and unlinked until the owner explicitly reopens that work;
5. continue separate pronunciation/data work only under its existing explicit gates.

Authoritative current-state documents:

- `docs/STUDIO_V2_HANDOVER.md`
- `docs/STUDIO_V2_DEVICE_ACCEPTANCE.md`
- `docs/MARKOV_GENERATOR_HANDOVER.md`
- `docs/PHASE_12C_ENTITY_RUNTIME_AI_STAGING_HANDOVER.md`
- `docs/PHASE_12C_ACCEPTANCE.md`
- `docs/ENTITY_AI_PRONUNCIATION_STAGING_V1.md`
- `docs/PHASE_11_ACCEPTANCE.md`
- `docs/WRITER_SEARCH_ACCEPTANCE.md`
- `docs/ENGLISH_WRITER_SOURCE_PLAN.md`
- `docs/UNKNOWN_QUERY_PRONUNCIATION_FALLBACK.md`
- `docs/QUERY_PRONUNCIATION_TOTAL_V1.md`
- `docs/QUERY_PRONUNCIATION_CLIENT_HANDOVER.md`

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
