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
7. `docs/BENCHMARK.md`
8. `docs/API.md`
9. `docs/WRITER_RANKING.md` for the current writer-search architecture work

## Public-repository boundary

The public RhymeLab repository is intentionally published from a sanitized root commit. Pre-public private commit identifiers, branches, and pull requests are not part of the public project history.

The private pre-public repository must remain private or be deleted; it must not simply be switched to public because historical PR pages and commit metadata would expose the old development history.

Graph1ks Material uses the public terms in `LICENSE`; third-party material keeps its original license. See `THIRD_PARTY_NOTICES.md` and `DATA_SOURCES.md`.

Never add credentials, personal email addresses, local user/profile paths, private URLs, raw corpora, local databases, benchmark review/reference-label files, or generated reports to Git.

Before public-facing changes, run:

```powershell
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

## Hard runtime boundary

RhymeLab is local-only. Runtime is Node.js + SQLite on `127.0.0.1:3030`. Generated linguistic data, SQLite, benchmark queues/reviews/reference labels, reports, and downloaded raw sources remain local/gitignored.

Core rhyme retrieval, scoring, writer ranking and diversification must be deterministic and locally executable. Do not add LLM inference, machine-learning/neural ranking, hosted ranking/search services, or a network dependency to the core search path.

## Formally accepted German baseline

RhymeLab `v0.10.0` remains the last formally accepted runtime/data baseline:

- status `ok`, 5/5 QA gates;
- accepted tests 58/58 across 20 files;
- DB schema `rhymelab-local-db-v4`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternates;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`.

Pre-public private commit IDs were deliberately removed from the public handover. The factual baseline values above remain the durable acceptance record.

## Accepted ranking state on main

Pure score-band, hybrid v1, and hybrid v2 were rejected. Hybrid v3 passed the isolated experiment and retrieval-aware pre-promotion gate.

Current accepted-source policy:

```text
modern_entity_relative_commonness_1decade_0_05
```

Current main contains:

- `src/runtime-ranking-policy.mjs` — production v3 comparator;
- `src/local-engine.mjs` — normal `type=all`, non-balanced ranked mode uses v3;
- `tests/runtime-ranking-policy.test.mjs` — production-vs-experiment equivalence checks.

Scorer, relation policy, retrieval keys/pool mechanics, and DB schema were not changed by the ranking promotion. `coverage=balanced` and type-specific result modes retain their separate existing ordering.

The old owner-local post-promotion acceptance command remains:

```powershell
npm run benchmark:ranking:runtime-candidate
```

That validates the accepted/base path only.

## Current feature branch — deterministic writer ranking v1

Branch:

```text
feat/deterministic-writer-ranking-v1
```

Draft PR:

```text
#3 — feat: deterministic writer-oriented rhyme ranking v1
```

Implemented:

- `src/writer-ranking-policy.mjs` — deterministic lexical novelty / writer utility / diversity;
- `src/writer-search.mjs` — writer-oriented wrapper over accepted retrieval + phonetic scoring;
- writer explanation payload per result;
- same-lemma and high query-overlap penalties that do not change phonetic truth;
- greedy O(n²) lexical diversification;
- repeated productive surface-construction suppression baseline;
- `Arbeitsweise` synthetic regression tests;
- local API/UI use writer ranking on this branch;
- `?ranking=legacy` retains the accepted/base result path for direct comparison;
- `docs/WRITER_RANKING.md` documents design and limits.

Public CI passed on the initial implementation. This writer policy is **not yet an accepted runtime baseline** and must not be described as such.

## Immediate next work on this feature branch

1. Owner switches local VS Code checkout to the public repository/feature branch.
2. Run `npm install` if needed, then `npm run check` and `npm test`.
3. Start the existing local DB/server and inspect real searches, especially `Arbeitsweise`.
4. Compare writer ranking against `?ranking=legacy` on the same queries.
5. Capture bad page-level patterns that remain.
6. Build deterministic lexical/morphology evidence into the data pipeline rather than indefinitely adding surface string heuristics.
7. Add search/page-quality benchmark metrics and only then decide whether to promote writer ranking.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality and the supporting lexical data model are stable.
