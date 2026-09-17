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

## Ranking state

Pure score-band, hybrid v1, and hybrid v2 were rejected. Hybrid v3 passed the isolated experiment and retrieval-aware pre-promotion gate.

Current policy:

```text
modern_entity_relative_commonness_1decade_0_05
```

Current source contains:

- `src/runtime-ranking-policy.mjs` — production v3 comparator;
- `src/local-engine.mjs` — normal `type=all`, non-balanced ranked mode uses v3;
- `tests/runtime-ranking-policy.test.mjs` — production-vs-experiment equivalence checks.

Scorer, relation policy, retrieval keys/pool mechanics, and DB schema were not changed by the ranking promotion. `coverage=balanced` and type-specific result modes retain their separate existing ordering.

## Immediate engineering gate

Run owner-local:

```powershell
npm run benchmark:ranking:runtime-candidate
```

Required post-promotion report:

- schema `rhymelab-benchmark-ranking-runtime-candidate-v2`;
- `status=ok`;
- zero runtime-candidate mismatches;
- zero runtime-policy mismatches;
- zero protected-order mismatches;
- live metrics/safety consistent with the already-passed retrieval-aware candidate evidence.

Only after that should the formal runtime baseline/version be advanced.

## After ranking isolation

Cluster the remaining IPA-normalization failures, prioritize common-word failures and poor preferred defaults, then move to phrase/mosaic rhyme. English remains separate and unimplemented.
