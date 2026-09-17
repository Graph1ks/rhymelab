# Public-facing status

RhymeLab's clean public repository is live at `Graph1ks/rhymelab`. The public workflow's required check is `validate`; `main` is protected and changes reach it through pull requests.

The formally accepted German runtime baseline remains v0.10.0 with DB schema `rhymelab-local-db-v4`, analyzer `de-ipa-v2`, scorer `de-phon-v3`, relation policy `rhyme-relations-v2`, and accepted ranking `modern_entity_relative_commonness_1decade_0_05`. The accepted/base path remains available through `?ranking=legacy`.

Feature branch `feat/deterministic-writer-ranking-v1` / draft PR #3 contains the experimental deterministic writer-search stack:

- writer policy `deterministic_writer_utility_v6`;
- German right-edge/secondary-stress retrieval `de-right-edge-anchors-v1`;
- morphology-family policy `de-attested-right-head-v4`;
- productive `-weise` construction rule `de-adverbial-weise-v2`;
- deterministic lexical-safety tiers and family diversification;
- no LLM, ML/neural ranking, hosted ranker, telemetry or runtime-network dependency.

## Owner-local v6 / morphology-v4 validation — passed

The 12-query / 360-top-row diagnostic on the existing local DB reported:

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

The three required gates passed:

1. `Arbeitsweise` no longer has productive `*-weise` flooding in the top 30; distinct perfect right-edge heads rotate upward (`Verweise`, `Eintrittspreise`, `Weiterreise`, `Kirchenkreise`, `Vorspeise`, `Abstellgleise`, `Impfnachweise`, `Nebengleise`, etc.).
2. short normal perfect rhymes are no longer marked lexically cheap: `Liebe -> Diebe` is rank 1 with cheap penalty 0, `Leben -> neben` rank 2 with cheap penalty 0, and `Nacht -> macht` rank 1 with cheap penalty 0.
3. known false morphology stays rejected: `Betriebe`, `Bestreben`, `Professoren` and `deutscher` remain `family=null` / `split=null`.

Lexical safety also improved slightly versus the preceding v5/v3 run: top-30 rows over usage rank 100k fell from 50 to 45 while unranked, >250k and explicit rare/historical counts remained controlled.

Ad-hoc writer-ranking/morphology tuning is therefore frozen at v6/v4 pending formal page-quality evidence.

## Writer v7 diversity experiment — rejected

Benchmark v2 exposed an over-specific acceptance condition around `Arbeitsweise -> Hochzeitsreise`. The candidate is correctly retrieved and scored as `multisyllabic_perfect` / `1.0`, but v6 places the specific `right:reise` member outside the first page after another member of the same family has already been selected.

An experimental v7 softened result-family diversity to try to force more members of the same non-query family upward. Owner-local benchmark evidence rejected that change:

```text
Hochzeitsreise rank                 120 -> 101 only
Top-20 repeated family rows         0 -> 4 for Arbeitsweise
aggregate Top-20 repeated families  4 (gate max 2)
structural benchmark                failed
```

The experiment is rolled back. Active writer ranking is again `deterministic_writer_utility_v6`.

The benchmark contract is now corrected to separate two requirements:

1. `Hochzeitsreise` remains a permanent **retrieval/phonetic** regression and must remain inside the writer candidate universe with perfect right-edge classification and no cheap-rhyme penalty.
2. Top-page writer usefulness is tested at the **family level**: at least one `right:reise` result must surface in the first 20 for `Arbeitsweise` while the global repeated-family gate remains enforced.

This avoids tuning the entire ranking around one arbitrary member of an otherwise valid rhyme family.

## Search-quality benchmark v2 — infrastructure implemented

Phase 8 infrastructure is present:

- `benchmarks/de-writer-v2/plan.json` — query battery, provisional structural gates and permanent regression anchors;
- `scripts/writer-page-benchmark-core.mjs` — deterministic page metrics, candidate/family regression gates and NDCG helpers;
- `scripts/benchmark-writer-page-v2.mjs` — owner-local structural benchmark runner;
- `scripts/prepare-writer-page-benchmark-v2.mjs` — blind human usefulness-review queue;
- `tests/writer-page-benchmark.test.mjs` — metric/regression coverage;
- `npm run benchmark:writer-page:v2`;
- `npm run benchmark:writer-page:prepare`.

Benchmark v2 measures Top-10/20 duplicate/near-duplicate rate, same-lemma rate, repeated morphology-family rate, morphology diversity, unranked/very-low-use/rare intrusion, preferred-pronunciation rate, regression anchors and retention of legacy top-250 tier-0 rhyme candidates.

NDCG@10/20 is deliberately reported as `pending_reference` until the relevant writer cutoff has complete **independent human** songwriting-usefulness labels. The benchmark does not require model-generated reference labels.

## Remaining boundary

The feature remains **draft / not accepted**. DB v4 still stores one selected lemma/POS analysis per surface form; final materialized writer evidence should preserve multiple source-supported analyses with provenance. Right-edge validation still uses broad suffix `LIKE` lookup and remains too slow for final local/mobile runtime.

Next evidence step is to rerun owner-local `npm run benchmark:writer-page:v2` on the restored v6 policy and corrected family-level surfacing gate. After the structural benchmark is stable: verify legacy invariance, design the multi-analysis lexical layer, materialize/index validated writer-search evidence, and produce an explicit writer-search acceptance report.

See `PROJECT_STATE.json`, `docs/HANDOVER.md`, `docs/WRITER_RANKING.md`, `docs/BENCHMARK.md`, and `ROADMAP.md` for the execution boundary.
