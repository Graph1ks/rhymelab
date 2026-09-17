# AGENTS.md — RhymeLab

This repository is the authoritative engineering/project memory for RhymeLab. Repository state beats chat history.

## Required continuity read

Before changing the project in a fresh thread/session, read:

1. `docs/HANDOVER.md`
2. `STATUS.md`
3. `PROJECT_STATE.json`
4. `ROADMAP.md`
5. `DATA_SOURCES.md`
6. `docs/WRITER_SEARCH_ACCEPTANCE.md`
7. `docs/PHRASE_MOSAIC_PLAN.md`
8. `docs/REPOSITORY_GOVERNANCE.md`
9. `docs/BENCHMARK.md` for rhyme-quality/ranking work
10. `docs/API.md` for local API work

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

- German first; English only after the German writer path, including phrase/mosaic work, is stable enough to freeze.
- Rhyme quality is phonetic/relational, not spelling-based.
- Writer usefulness is a separate deterministic ranking layer; lexical overlap must not corrupt phonetic rhyme truth.
- Page/list diversity is a separate deterministic result-set concern; do not fake diversity by changing phonetic relation labels.
- Primary rhyme classes are exclusive; Assonance/Consonance are independent overlapping relations.
- Usage is an ordering/product signal, not linguistic truth.
- Missing usage rank means unranked/unknown, not automatically rare or obsolete.
- Pronunciation variants are first-class and provenance-bearing.
- Curated modern pronunciations may overlay dictionary forms while dictionary alternatives remain available.
- Historical-only vocabulary is hidden by default and explicitly opt-in.
- Do not invent lexical, pronunciation, phraseological, source, license, or benchmark facts.
- Public web visibility alone does not make a source legally/reproducibly ingestible.
- External-model reference labels are evidence, not human-expert gold.
- Protect accepted exact-rhyme behavior unless strong evidence requires otherwise.
- Ranking changes stay isolated from scorer/relation changes unless the task explicitly requires both.
- Do not optimize benchmark gains that conflict with default lexical/product quality.
- Human Writer NDCG is deliberately deferred until the broader German writer surface is mature and independent human reviewers are available; the owner alone is not an independent gold source.

## Formal control baseline

The formal German control baseline remains RhymeLab `v0.10.0`:

- DB schema `rhymelab-local-db-v4`;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternates;
- protected control path `?ranking=legacy`.

## German single-word writer engineering baseline — accepted / frozen

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

`Arbeitsweise -> Hochzeitsreise` remains a retrieval sentinel only, not a Top-20 guard. Writer v7 remains rejected/rolled back. Do not silently retune the frozen v6/v4 writer baseline; material changes require a new benchmarked candidate.

## Benchmark truth

Current general German benchmark: `de-human-rhyme-v1`.

367/367 reviewed, 0 skipped. Accepted general ranking baseline: NDCG 0.9562 / pairwise 0.8350.

This general relation/ranking benchmark is not a substitute for Writer Page human usefulness labels.

Accepted general ranking policy:

```text
modern_entity_relative_commonness_1decade_0_05
```

## Current project direction — Phase 11

Phase 11 German phrase/mosaic/phraseology is current. Read `docs/PHRASE_MOSAIC_PLAN.md` before implementation.

The first gate is **public-source discovery and licensing**, not runtime code. Research German sources for multi-word phrases/collocations, idioms/Redewendungen, formulaic expressions/proverbs, metaphorical/figurative expressions where structured public data exists, common sentence fragments, and deterministic semantic discovery support.

For each candidate source, verify bulk/reproducible access, license/attribution, redistribution/commercial compatibility, snapshot/version, scale/raw format, provenance keys, and fully offline post-ingestion use. OpenThesaurus and OdeNet are possible semantic ingredients, not assumed complete phraseology sources.

After source selection, design a separate provenance-bearing phrase data model, deterministic phrase pronunciation, indexed cross-word-boundary mosaic retrieval, a separate phrase-ranking policy, and a dedicated Phrase/Mosaic benchmark.

Human Writer NDCG remains `pending_reference` throughout this phase until the German writer surface is mature enough and independent human reviewers exist.
