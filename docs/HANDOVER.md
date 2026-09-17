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

Current implementation includes deterministic right-edge retrieval, multi-anchor writer scoring, lexical-safety tiers, conservative morphology-family evidence, structural cheapness and greedy family/list diversification. Package version and accepted baseline are unchanged.

## Established live findings

### Retrieval boundary

`Arbeitsweise -> Hochzeitsreise` established that writer quality required a retrieval fix, not only reranking:

- legacy retrieval omitted `Hochzeitsreise`;
- direct legacy pair score was usable slant `0.7574`;
- writer right-edge retrieval finds it through secondary-stress channels;
- best writer anchor is a two-syllable `multisyllabic_perfect` match with score `1`.

`Notfallbleibe` is absent from the current lexicon and remains a lexical-coverage case.

### Early morphology false positives

The first family splitter admitted coincidental analyses such as:

```text
Betriebe     -> bet|riebe
Bestreben    -> best|reben
Professoren  -> profes|soren
deutscher    -> deut|scher
```

Morphology v2 introduced conservative lemma/POS/head/left-usage gates and removed those cases.

### Lexical safety

Writer v5 introduced default-page safety tiers:

```text
measured usage <= 250000                     -> +0
unranked / unknown usage                     -> +1
measured usage > 250000                      -> +1
explicit rare/archaic/obsolete/dated tag     -> +2
```

Missing usage remains `unranked_unknown`, not linguistic rarity.

### Morphology v3 failure and data-model finding

An `adv`-only productive `-weise` rule failed on the owner DB because DB v4 stores one selected lemma/POS analysis per form while the source may support several equal-confidence analyses. Productive forms such as `stufenweise` can legitimately have adjective and adverb analyses; the stored selected POS may therefore be `adj`.

Morphology v4 (`de-attested-right-head-v4`) narrows the exception to the source-supported `adj`/`adv` ambiguity for productive `-weise`, still requiring terminal noun `Weise`, whole-lemma suffix agreement and measured left lexical evidence.

This also established a future schema requirement: final materialized writer evidence should preserve multiple source-supported lexical analyses with provenance instead of forcing one semantic POS/lemma.

### Writer v6 cheapness correction

Writer v5 falsely used generic edit similarity as enough evidence to demote short normal rhymes such as:

```text
Liebe -> Diebe
Leben -> neben
Nacht -> macht
```

Writer v6 removes short rhyme spelling as standalone cheapness evidence. Cheapness now requires stronger independent structure: same lemma, same morphology family, long shared initial construction, or genuinely long near-duplicate evidence.

## Owner-local writer-v6 / morphology-v4 diagnostic — passed

Command:

```powershell
npm run diagnose:writer-pages
```

Observed report:

```text
schema                              rhymelab-writer-page-diagnostic-v2
queries found                       12 / 12
mean elapsed                        1502.8 ms
repeated family rows                0
unranked top-30 rows                2
usage rank > 100k rows              45
usage rank > 250k rows              2
explicit rare/historical rows       0
writer-safety-tier penalized rows   4
Arbeitsweise elapsed                7926.5 ms
Arbeitsweise right-edge             1353
Arbeitsweise merged                 1580
```

All three validation gates passed:

1. `Arbeitsweise` no longer shows productive `*-weise` flooding in Top 30; distinct perfect right-edge heads occupy the top page.
2. `Liebe -> Diebe` is rank 1, `Leben -> neben` rank 2, `Nacht -> macht` rank 1, all with cheap-tier penalty 0 and perfect-class status.
3. `Betriebe`, `Bestreben`, `Professoren` and `deutscher` remain `family=null` / `split=null`.

Safety remains strong and the >100k top-30 count improved from 50 in the preceding v5/v3 audit to 45.

Decision: **freeze ad-hoc writer-ranking/morphology tuning at v6/v4.** Do not keep adjusting weights or morphology rules without benchmark evidence.

## Rejected writer-v7 family-diversity experiment

Benchmark v2 initially contained an over-specific regression requiring exactly `Arbeitsweise -> Hochzeitsreise` to surface in Top 20. Under v6 the candidate is correctly present as `multisyllabic_perfect`, score `1`, cheap penalty `0`, but ranks behind another already selected `right:reise` family member.

A targeted v7 experiment separated family repetition from structural near-duplicate redundancy and softened the second family occurrence. Owner-local evidence rejected it:

```text
Hochzeitsreise rank                 120 -> 101
Arbeitsweise Top-20 repeated rows   0 -> 4
aggregate Top-20 repeated families  4
structural gate                     failed
```

The v7 code is rolled back. Active ranking is again `deterministic_writer_utility_v6`.

Benchmark semantics are corrected instead of continuing to optimize one arbitrary compound:

- `Hochzeitsreise` remains a permanent retrieval/phonetic regression: it must stay inside the writer candidate universe, be perfect-class under the right-edge anchor and carry no cheap-rhyme penalty.
- Top-page surfacing is now family-level: at least one `right:reise` result must appear in Top 20 for `Arbeitsweise`.
- the global repeated-family structural gate remains active, so surfacing one family cannot be achieved by flooding the page with that family.

## Search-quality benchmark v2 — current milestone

Infrastructure is implemented:

```text
benchmarks/de-writer-v2/plan.json
scripts/writer-page-benchmark-core.mjs
scripts/benchmark-writer-page-v2.mjs
scripts/prepare-writer-page-benchmark-v2.mjs
tests/writer-page-benchmark.test.mjs
```

Commands:

```powershell
npm run benchmark:writer-page:v2
npm run benchmark:writer-page:prepare
```

The structural runner measures:

- Top-10 / Top-20 exact duplicate and near-duplicate rate;
- same-lemma rate;
- repeated morphology-family rate;
- morphology-family diversity;
- unranked / >100k / >250k / explicit rare-historical intrusion;
- preferred-pronunciation rate;
- retention of legacy top-250 tier-0 rhyme candidates;
- permanent candidate regressions (`Arbeitsweise/Hochzeitsreise`, `Liebe/Diebe`, `Leben/neben`, `Nacht/macht`);
- family-level Top-20 surfacing for the `Arbeitsweise -> right:reise` phenomenon;
- direct morphology regressions for productive `-weise` and previous false-split cases.

`benchmark:writer-page:prepare` creates a blind human usefulness-review queue from the union of current writer and legacy candidates. NDCG@10/20 is only valid when the relevant writer cutoff is completely covered by independent human 0–4 usefulness labels. Without those labels the report must state `pending_reference`; do not substitute sparse labels or model judgments.

## Performance state

Right-edge validation still uses suffix `LIKE` retrieval against DB v4. `Arbeitsweise` remains ~8–13 s depending on the local run because the current validation path produces 1,353 right-edge candidates / 1,580 merged candidates. This is not acceptable final local/mobile performance.

Correctness is frozen first. After benchmark evidence is stable, design the multi-analysis lexical layer and materialize/index validated right-edge/morphology keys.

## Immediate next work

1. Owner pulls current feature branch; **do not rebuild the DB**.
2. Run:

```powershell
npm run benchmark:writer-page:v2
```

3. Upload `reports/de-writer-page-benchmark-v2.json`.
4. Confirm restored v6 passes both the structural repeated-family gate and the new `right:reise` Top-20 family surfacing regression while retaining `Hochzeitsreise` in the candidate universe.
5. If structural evidence is clean, optionally generate the blind usefulness queue with `npm run benchmark:writer-page:prepare` for future human NDCG@10/20 labels.
6. Verify accepted `ranking=legacy` exact-rhyme/relation invariance.
7. Design multi-analysis lexical storage and materialized/indexed writer-search evidence for local/mobile runtime.
8. Promote only through an explicit writer-search acceptance report.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality, benchmark evidence and lexical data model are stable.
