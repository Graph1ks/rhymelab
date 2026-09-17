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

## Formally accepted baseline

The last formally accepted German baseline is RhymeLab `v0.10.0`:

- DB schema `rhymelab-local-db-v4`;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternates;
- accepted report `ok`, 5/5 QA gates;
- accepted tests 58/58 across 20 files.

Pre-public private commit IDs are intentionally not part of public project memory.

## Benchmark truth

Current German benchmark: `de-human-rhyme-v1`.

367/367 reviewed, 0 skipped. Accepted ranking baseline: NDCG 0.9562 / pairwise 0.8350.

Pure `score_band_0_05`, hybrid v1, and hybrid v2 were rejected. Hybrid v3 policy:

```text
modern_entity_relative_commonness_1decade_0_05
```

passed the isolated experiment and retrieval-aware pre-promotion gate.

## Current runtime-promotion state

Source promotion is wired:

- `src/runtime-ranking-policy.mjs` contains the production v3 comparator;
- `src/local-engine.mjs` uses it for normal `type=all`, non-balanced ranked results;
- dictionary queries, missing-usage cases, exact tier-0 rows, and relation-only rows retain conservative fallback behavior;
- type-specific and `coverage=balanced` modes retain their separate pre-existing ordering;
- scorer, relation policy, retrieval keys, pool limits, and DB schema are unchanged.

The final owner-local gate is:

```bash
npm run benchmark:ranking:runtime-candidate
```

Require schema `rhymelab-benchmark-ranking-runtime-candidate-v2`, `status=ok`, zero runtime-candidate mismatches, zero runtime-policy mismatches, zero protected-order mismatches, and reproduction of the validated retrieval-aware metrics/safety.

The next ranking architecture is deterministic writer utility plus lexical diversity. It must remain independently explainable from phonetic scoring and must be benchmarked before replacing the accepted runtime policy.

After ranking isolation, continue pronunciation/lexical-quality diagnostics, then phrase/mosaic rhyme. English remains separate.
