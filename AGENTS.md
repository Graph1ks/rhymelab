# AGENTS.md — RhymeLab

This repository is the authoritative engineering/project memory for RhymeLab. Repository state beats chat history.

## Required continuity read

Before changing the project in a fresh thread/session, read:

1. `docs/HANDOVER.md`
2. `STATUS.md`
3. `PROJECT_STATE.json`
4. `ROADMAP.md`
5. `DATA_SOURCES.md`
6. `docs/REPOSITORY_GOVERNANCE.md`
7. `docs/BENCHMARK.md` for rhyme-quality/ranking work
8. `docs/API.md` for local API work
9. `docs/WRITER_SEARCH_ACCEPTANCE.md` for the frozen German single-word writer baseline

## Public-repository guardrails

The public repository starts from a sanitized root commit. Do not add references that expose the pre-public private Git history, branches, pull requests, personal email addresses, local user/profile paths, credentials, private URLs, or internal-only artifacts.

Public `main` is governed by `docs/REPOSITORY_GOVERNANCE.md`: changes target pull requests, the required CI job/check is `validate`, and the intended GitHub ruleset blocks force pushes and branch deletion. GitHub-side ruleset activation is tracked in issue #1 until repository-admin enforcement is confirmed.

Run before public-facing changes:

```bash
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

Use a GitHub `noreply` commit identity if personal email privacy matters.

Graph1ks Material is governed by `LICENSE` and `COMMERCIAL_LICENSE.md`. Third-party material is never automatically relicensed by the repository root license. Preserve upstream licenses, attribution, share-alike requirements, provenance, and redistribution boundaries in `THIRD_PARTY_NOTICES.md`, `DATA_SOURCES.md`, and relevant manifests.

All external contributions require explicit CLA acceptance before merge.

## Hard runtime boundary

RhymeLab is local-only. GitHub is source control/project memory, not runtime. Runtime data lives in local SQLite under `data/local/`; generated bulk data, benchmark queues/reviews/reference labels, reports, and downloaded raw source files remain gitignored.

Do not introduce hosted/provider runtime, remote database bindings, telemetry, automatic uploads, advertising, or hidden network behavior without an explicit architecture decision.

RhymeLab core rhyme retrieval, scoring, writer ranking and result diversification must remain deterministic and locally executable on ordinary consumer hardware. Do not introduce LLM inference, machine-learning model inference, neural ranking, hosted ranking/search services, or a network dependency into the core search path. External models may be used only as optional benchmark/reference evidence; they must never be required to build, run, reproduce, or explain core search results.

## Durable product decisions

- German first; English only after German single-word quality is stable.
- Rhyme quality is phonetic/relational, not spelling-based.
- Writer usefulness is a separate deterministic ranking layer; lexical overlap must not corrupt phonetic rhyme truth.
- Page/list diversity is a separate deterministic result-set concern; do not fake diversity by changing phonetic relation labels.
- Primary rhyme classes are exclusive; Assonance/Consonance are independent overlapping relations.
- Usage is an ordering/product signal, not linguistic truth.
- Missing usage rank means unranked/unknown, not automatically rare or obsolete.
- Pronunciation variants are first-class and provenance-bearing.
- Curated modern pronunciations may overlay dictionary forms while dictionary alternatives remain available.
- Historical-only vocabulary is hidden by default and explicitly opt-in.
- Do not invent lexical, pronunciation, source, license, or benchmark facts.
- External-model reference labels are evidence, not human-expert gold.
- Protect accepted exact-rhyme behavior unless strong evidence requires otherwise.
- Ranking changes stay isolated from scorer/relation changes unless the task explicitly requires both.
- Ranking evaluation must inspect live/retrieval-boundary lexical quality, not only reviewed metrics.
- Do not optimize benchmark gains that require promoting words orders of magnitude rarer than the query when that conflicts with default product quality.

## Formally accepted/default baseline

The formally accepted/default German runtime remains RhymeLab `v0.10.0`:

- DB schema `rhymelab-local-db-v4`;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternates;
- accepted/base control remains `?ranking=legacy`.

The German single-word writer engineering acceptance below does **not** silently replace this default runtime.

## German single-word writer engineering baseline — accepted

Engineering acceptance is recorded in `docs/WRITER_SEARCH_ACCEPTANCE.md`.

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

Acceptance evidence includes:

- legacy/control-path invariance: 27/27, zero runtime/policy/protected-order mismatches;
- exact indexed-vs-LIKE right-edge retrieval equivalence: 12/12, zero mismatches;
- compact morphology regressions: 10/10 pass;
- final Writer Page structural gate: pass;
- legacy Tier-0 retention: 685/685;
- final full Writer Page mean: 1103.9 ms vs 1528.8 ms frozen validation mean;
- runtime repeatability: three independent DB opens with identical per-query and suite semantic fingerprints;
- suite fingerprint `c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab`.

Writer Page human NDCG@10/20 remains `pending_reference`; do not invent or substitute a score.

Writer v7 remains rejected/rolled back. Do not silently retune the frozen v6/v4 writer baseline; material changes require a new benchmarked candidate.

## Benchmark truth

Current general German benchmark: `de-human-rhyme-v1`.

367/367 reviewed, 0 skipped. Accepted ranking baseline: NDCG 0.9562 / pairwise 0.8350.

This general relation/ranking benchmark is not a substitute for the still-pending Writer Page human usefulness labels.

Accepted general ranking policy:

```text
modern_entity_relative_commonness_1decade_0_05
```

## Current project direction

PR #3 remains draft until owner review of `docs/WRITER_SEARCH_ACCEPTANCE.md`. Formal/default writer-runtime promotion is a separate explicit decision and has not happened automatically.

After owner acceptance review, German phrase/mosaic rhyme may begin as a separate deterministic architecture/benchmark phase while preserving the accepted single-word evidence. English remains later and requires its own language-specific sources, parsing/scoring, and benchmark.
