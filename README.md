# RhymeLab

Local-first phonetic rhyme engine and songwriting workspace for German and English.

RhymeLab is a **local-only** Node.js + SQLite project. Core search is deterministic and does not require LLM/ML inference, hosted ranking, telemetry, uploads, or a runtime network connection.

## Current runtime

RhymeLab `v0.11.0` uses Studio V2 plus the Serving-v1 shipping distributions:

~~~text
product shell          Studio V2 (default / route)
runtime editions       LITE | STANDARD | FULL
preferred database     STANDARD → FULL → LITE (first locally available edition)
search channels        edition-dependent DE/EN Words + Phrase/Mosaic + Entities
generated policy       FULL capability only
legacy Search UI       /search and /legacy
RhymePad fallback      /pad and /pad-legacy
~~~

The accepted Writer/rhyme semantics remain deterministic and source-backed.
The approximately 20-GB Master/Developer database is a build/materialization source
only and is not an application runtime.

Markov / Constrained Lyric Decoder V2 is intentionally frozen. Its demo
infrastructure may ship, but it is not part of RhymeLab product navigation.


### Frontend replatform in progress

New product feature development is temporarily frozen while Studio is migrated,
behavior-for-behavior, to React + TypeScript + Vite + Base UI + Motion + TanStack
Query + Zustand + TanStack Virtual. R0 scaffold/freeze, R1 typed-domain bridging,
R2 shell/design-system foundations and R3 Search/Writer are complete; R4
Library/persistence/recovery is next. The existing Studio V2 remains the shipping
golden master until the hard parity gate passes. See
`docs/REACT_STUDIO_REPLATFORM.md`, `docs/REACT_STUDIO_R1_TYPED_BRIDGE.md`,
`docs/REACT_STUDIO_R2_SHELL.md`, `docs/REACT_STUDIO_R3_SEARCH_WRITER.md`, and
`docs/REACT_STUDIO_PARITY_GATE.md`.

## Local run

Requirements:

- Node.js 22.5+
- at least one valid local shipping database:
  - `data/local/distribution/rhymelab-serving-v1-lite.sqlite`
  - `data/local/distribution/rhymelab-serving-v1-standard.sqlite`
  - `data/local/distribution/rhymelab-serving-v1-full.sqlite`

STANDARD is preferred when present; FULL and then LITE are supported startup
fallbacks. A LITE-only installation is valid.

Run:

~~~powershell
npm run dev
~~~

Open:

~~~text
http://127.0.0.1:3030
~~~

Studio V2 is served at the root route. Search and RhymePad remain available as
alternate UI surfaces, but they use the same shipping-tier database runtime.

To temporarily restore Search as the root route:

~~~powershell
npm run dev:search-default
~~~

### Build the shipping databases

The Master/Developer database remains the local build source. Materialize the
runtime editions with:

~~~powershell
npm run distribution:plan
npm run distribution:build
npm run distribution:verify:nesting
~~~

Generated databases and downloaded/generated linguistic datasets stay local and
gitignored.

## Runtime overrides

~~~text
RHYMELAB_DISTRIBUTION_LITE_DB      LITE path
RHYMELAB_DISTRIBUTION_STANDARD_DB  STANDARD path
RHYMELAB_DISTRIBUTION_FULL_DB      FULL path
RHYMELAB_DISTRIBUTION_SWITCHER     set to 0 to disable edition switching
RHYMELAB_SEARCH_DEFAULT            set to 1 to use Search at /
RHYMELAB_HOST                      bind host, default 127.0.0.1
RHYMELAB_PORT                      port, default 3030
~~~

A file whose `distribution_edition` does not match its requested tier is rejected.
Master and archived split databases cannot be selected as app runtimes.

### LITE / STANDARD / FULL selection and diagnostics

Normal startup exposes the installed shipping editions in Studio Settings. Missing
edition files stay visible but disabled. The active database is shown in Studio and
Search; a stored choice that is no longer installed is replaced with an available
edition. Selection is request-scoped, so concurrent requests cannot cross database
boundaries.

For controlled cross-edition diagnostics:

~~~powershell
npm run dev:distribution-lab
~~~

The diagnostic benchmark compares LITE / STANDARD / FULL and uses FULL as the
shipping-edition quality reference. It never opens Master as a runtime.

See `docs/DATABASE_RUNTIME.md` and `docs/INTERNAL_DISTRIBUTION_LAB.md`.

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
3. `docs/REACT_STUDIO_REPLATFORM.md`
4. `docs/REACT_STUDIO_PARITY_GATE.md`
5. `docs/STUDIO_V2_HANDOVER.md`
6. `docs/STUDIO_V2_DEVICE_ACCEPTANCE.md`
7. `docs/HANDOVER.md`
8. `STATUS.md`
9. `PROJECT_STATE.json`
10. `ROADMAP.md`
11. `DATA_SOURCES.md`
12. the acceptance/domain documents relevant to the subsystem being changed

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

1. complete the P0 React Studio replatform with all mandatory parity rows verified before cutover;
2. keep new product feature development frozen during the port;
3. complete the seven real-device/browser/touch/Web Audio acceptance checks as migration/cutover evidence for the preserved Studio behaviors;
2. fix only concrete Studio regressions found by that acceptance while keeping the Search-root rollback available;
3. preserve Serving-v1 and the accepted Phrase/English/Entity/ranking semantics;
4. keep Markov frozen and unlinked until the owner explicitly reopens that work;
5. continue separate pronunciation/data work only under its existing explicit gates.

Authoritative current-state documents:

- `docs/STUDIO_V2_HANDOVER.md`
- `docs/STUDIO_V2_DEVICE_ACCEPTANCE.md`
- `docs/DISTRIBUTION_TIERS.md`
- `docs/INTERNAL_DISTRIBUTION_LAB.md`
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
