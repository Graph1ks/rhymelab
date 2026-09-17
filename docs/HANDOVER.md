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
9. `docs/WRITER_RANKING.md`
10. `docs/WRITER_LEXICAL_MODEL.md`
11. `docs/EXTERNAL_COMPARISON_D_RHYME.md`

## Hard runtime boundary

RhymeLab is local-only. Core retrieval, scoring, writer ranking and diversification must remain deterministic and locally executable. Do not add LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads or runtime network dependencies.

Generated linguistic data, SQLite, benchmark queues/reviews/reference labels, reports and downloaded raw sources remain local/gitignored. `main` is protected; required public check is `validate`.

## Formally accepted baseline

The last formally accepted German baseline remains RhymeLab `v0.10.0`:

- DB schema `rhymelab-local-db-v4`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternate pronunciations;
- 1,038 historical-only forms;
- 260,450 usage-ranked forms;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- accepted ranking `modern_entity_relative_commonness_1decade_0_05`.

The accepted/base path remains available through `?ranking=legacy`.

## Current feature branch

```text
branch:            feat/deterministic-writer-ranking-v1
draft PR:          #3
writer ranking:    deterministic_writer_utility_v6
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v4
construction:      de-adverbial-weise-v2
```

Writer v7 remains rejected and rolled back. Do not reintroduce it without new benchmark evidence.

Ad-hoc writer-ranking and morphology tuning is frozen at v6/v4.

## Established architecture findings

### `Arbeitsweise -> Hochzeitsreise` was a retrieval/anchor failure

Legacy retrieval omitted `Hochzeitsreise`. Direct legacy phonetics were usable slant (`0.7574`), while writer right-edge retrieval recovers the candidate through secondary-stress keys and the best secondary-anchor domain is `multisyllabic_perfect`, score `1`.

This is a permanent candidate-universe/phonetic regression, not a requirement that the exact surface form appear in Top 20.

### Family-level surfacing, not family flooding

For `Arbeitsweise`, at least one `right:reise` member must surface in Top 20. Repeated-family flooding remains forbidden.

The rejected v7 experiment moved `Hochzeitsreise` only from rank 120 to 101 while creating 4 repeated-family rows in `Arbeitsweise` Top 20 and failing the structural gate.

### Writer v6 cheapness correction

Short normal rhymes must not be demoted merely because rhyme spelling dominates a short word.

Permanent regressions:

```text
Liebe -> Diebe   rank 1, perfect-class, cheap penalty 0
Leben -> neben   rank 2, perfect-class, cheap penalty 0
Nacht -> macht   rank 1, perfect-class, cheap penalty 0
```

### Morphology v4

Known false splits stay rejected:

```text
Betriebe     -> no bet|riebe
Bestreben    -> no best|reben
Professoren  -> no profes|soren
deutscher    -> no deut|scher
```

Productive `-weise` forms use explicit construction rule `de-adverbial-weise-v2` and resolve to `right:weise` when source/lexical gates are satisfied.

### Lexical safety

Current provisional default-page tiers:

```text
measured usage <= 250000                     -> +0
unranked / unknown usage                     -> +1
measured usage > 250000                      -> +1
explicit rare/archaic/obsolete/dated tag     -> +2
```

Missing usage remains unknown/unranked, not linguistic rarity.

## Writer Page Benchmark v2 — structural baseline passed

The corrected owner-local v6/v4 run is now the frozen structural baseline.

Report status:

```text
structural_ok_reference_pending
```

Aggregate result:

```text
queries                             12 / 12
mean writer elapsed                1528.8 ms
Top-10 repeated family rows        0
Top-20 repeated family rows        0
Top-20 exact duplicates            0
Top-20 near duplicates             0
Top-20 same-lemma rows             0
Top-20 unranked rows               1
Top-20 usage rank >100k rows       25
Top-20 usage rank >250k rows       1
Top-20 explicit rare/historical    0
preferred pronunciation            240 / 240
legacy tier-0 retention            685 / 685
```

Permanent page regressions:

```text
Arbeitsweise -> Hochzeitsreise   rank 120, multisyllabic_perfect, score 1, cheap penalty 0
Arbeitsweise -> right:reise      Weiterreise rank 3
Liebe -> Diebe                   rank 1
Leben -> neben                   rank 2
Nacht -> macht                   rank 1
```

All direct productive-`-weise` and previous false-split morphology regressions passed.

NDCG@10/20 remains `pending_reference` until the relevant current writer cutoff is completely covered by independent human 0–4 songwriting-usefulness labels. Sparse labels or model judgments are not valid substitutes.

Human usefulness review is optional at this stage; the structural baseline is sufficient to advance engineering work while keeping final acceptance open.

## Legacy invariance — current owner-local gate

The feature branch keeps accepted/base search isolated:

```text
ranking=legacy -> findRhymes(...)
writer default -> findWriterRhymes(...)
```

`src/local-engine.mjs` is currently blob-identical on `main` and `feat/deterministic-writer-ranking-v1`. That establishes source-level invariance for the accepted local engine without recording private/pre-public commit identifiers in project memory.

The owner-local runtime gate still must be rerun on the current DB:

```powershell
npm run benchmark:ranking:runtime-candidate
```

Require:

```text
schema = rhymelab-benchmark-ranking-runtime-candidate-v2
status = ok
runtime_candidate_mismatch_queries = []
runtime_policy_mismatch_queries = []
protected_order_mismatch_queries = []
```

Do not invent a second competing legacy benchmark; this existing retrieval-aware post-promotion runner is the control-path gate.

## Multi-analysis lexical model — design + first pure core implemented

Live morphology proved that DB v4's single selected lemma/POS analysis is not a sufficient final writer substrate.

The source resolver already exposes multiple source-supported analyses (`resolutionKey`, lemma, normalized lemma, POS, homograph number, confidence, source record keys, match kinds, style/form tags, etc.), but `build-de-rhyme-publish.mjs` currently collapses them through `bestAnalysis()` before writing compact `l/p/g` fields.

Design document:

```text
docs/WRITER_LEXICAL_MODEL.md
```

First DB-free implementation step is present:

```text
scripts/writer-lexical-model-core.mjs
tests/writer-lexical-model.test.mjs
```

The pure core:

- retains multiple equal-confidence analyses;
- deterministically merges provenance for the same resolution key;
- provides a deterministic compatibility projection for old single-analysis consumers;
- resolves a hard writer family only when source-supported analysis evidence converges on one family;
- returns `ambiguous_conflict` rather than guessing when supported analyses imply different families.

The isolated new test set passes 7/7. This code is not wired into runtime or DB v4 yet.

## Performance boundary

Right-edge validation still uses suffix `LIKE` retrieval against DB v4. `Arbeitsweise` remains roughly eight seconds on the current owner benchmark and produces 1,353 right-edge / 1,580 merged candidates.

This is intentionally validation-only and not acceptable final local/mobile performance.

The target is to materialize/index validated right-edge anchors and morphology evidence after the multi-analysis lexical layer is correct.

## Immediate next work

1. Owner updates the local checkout and runs the current legacy invariance gate:

```powershell
git pull --ff-only
npm run benchmark:ranking:runtime-candidate
```

2. Upload `reports/de-rhyme-benchmark-ranking-runtime-candidate.json`.
3. Require `status=ok` and zero runtime/policy/protected-order mismatches.
4. In parallel/after that, continue the multi-analysis implementation on fixtures and publish/storage code without rebuilding the owner DB.
5. Preserve all merged source-supported analyses with provenance; do not make writer semantics depend on an incidental selected POS/lemma.
6. Then materialize/index right-edge anchors and morphology evidence, remove broad suffix `LIKE` from final writer runtime, and rerun Writer Page Benchmark v2.
7. Produce an explicit writer-search acceptance report before changing the accepted/base default.

Optional: `npm run benchmark:writer-page:prepare` may create a blind independent human usefulness queue for future NDCG@10/20.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality, provenance model, benchmark evidence and runtime performance are stable.
