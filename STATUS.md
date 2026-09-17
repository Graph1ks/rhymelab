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

1. `Arbeitsweise` no longer has productive `*-weise` flooding in the top 30; distinct perfect right-edge heads rotate upward.
2. short normal perfect rhymes are no longer marked lexically cheap: `Liebe -> Diebe` is rank 1, `Leben -> neben` rank 2, and `Nacht -> macht` rank 1, all with cheap penalty 0.
3. known false morphology (`Betriebe`, `Bestreben`, `Professoren`, `deutscher`) remains `family=null` / `split=null`.

Ad-hoc writer-ranking/morphology tuning remains frozen at v6/v4.

## Writer v7 diversity experiment — rejected

A targeted v7 experiment softened result-family diversity to try to force more members of the same non-query family upward. Owner-local benchmark evidence rejected that change:

```text
Hochzeitsreise rank                 120 -> 101 only
Top-20 repeated family rows         0 -> 4 for Arbeitsweise
aggregate Top-20 repeated families  4 (gate max 2)
structural benchmark                failed
```

The experiment remains rolled back. Active writer ranking is `deterministic_writer_utility_v6`.

The benchmark contract separates exact-candidate retrieval/classification from family-level Top-20 surfacing:

1. `Hochzeitsreise` is a permanent retrieval/phonetic regression and must remain inside the writer candidate universe with perfect right-edge classification and no cheap-rhyme penalty.
2. At least one `right:reise` result must surface in the first 20 for `Arbeitsweise` while the global repeated-family gate remains enforced.

## Writer Page Benchmark v2 — structural baseline passed

The corrected owner-local v6/v4 run now establishes the first frozen Writer Page Benchmark v2 structural baseline:

```text
status                              structural_ok_reference_pending
queries                             12 / 12
mean writer elapsed                 1528.8 ms
Top-10 repeated family rows         0
Top-20 repeated family rows         0
Top-20 exact duplicates             0
Top-20 near duplicates              0
Top-20 same-lemma rows              0
Top-20 unranked rows                1
Top-20 usage rank >100k rows        25
Top-20 usage rank >250k rows        1
Top-20 explicit rare/historical     0
preferred pronunciation rows        240 / 240
legacy tier-0 retention             685 / 685
```

Permanent regressions passed:

```text
Arbeitsweise -> Hochzeitsreise   rank 120, multisyllabic_perfect, score 1, cheap penalty 0
Arbeitsweise -> right:reise      Weiterreise rank 3
Liebe -> Diebe                   rank 1, multisyllabic_perfect, cheap penalty 0
Leben -> neben                   rank 2, multisyllabic_perfect, cheap penalty 0
Nacht -> macht                   rank 1, perfect, cheap penalty 0
```

All direct productive-`-weise` and previous false-split morphology regressions also passed.

NDCG@10/20 remains deliberately `pending_reference`. It becomes valid only when the relevant current writer cutoff has complete independent human songwriting-usefulness labels. Sparse labels or model judgments must not be substituted.

Decision: **freeze this v6/v4 structural baseline and stop ad-hoc ranking changes.** Human usefulness review may be prepared later, but it is not a reason to block the next engineering gates.

## Legacy invariance — next owner-local gate

The accepted legacy implementation remains isolated from writer search:

```text
ranking=legacy -> findRhymes(...)
writer default -> findWriterRhymes(...)
```

`src/local-engine.mjs` is currently blob-identical between `main` and the feature branch. That is strong source-level evidence that the accepted local-engine path was not changed by writer-search work.

The owner-local runtime gate still needs to be rerun on the current DB:

```powershell
npm run benchmark:ranking:runtime-candidate
```

Require report schema `rhymelab-benchmark-ranking-runtime-candidate-v2`, `status=ok`, zero runtime-candidate mismatches, zero runtime-policy mismatches and zero protected-order mismatches.

## Multi-analysis writer lexical model — design documented

The live morphology work confirmed that DB v4's single selected lemma/POS analysis is not sufficient as the final writer substrate. The source resolver already exposes multiple deterministic source-supported analyses, but `build-de-rhyme-publish.mjs` currently reduces them through `bestAnalysis()` before publish and DB-v4 storage.

The target design is now documented in:

```text
docs/WRITER_LEXICAL_MODEL.md
```

The design requires:

- preserving multiple source-supported lemma/POS analyses with provenance;
- deriving morphology independently per analysis;
- resolving a hard writer family only when supported analyses converge on one family key;
- keeping ambiguous/conflicting families unresolved rather than guessing;
- materializing versioned morphology evidence;
- materializing/indexing validated right-edge anchors;
- preserving the accepted legacy path during migration.

No owner DB rebuild is authorized by this design step.

## Remaining boundary

The feature remains **draft / not accepted**. Current right-edge validation still uses broad suffix `LIKE` lookup and remains too slow for final local/mobile runtime.

Next sequence:

1. run the owner-local legacy invariance gate;
2. optionally prepare independent human usefulness review for future NDCG@10/20;
3. implement multi-analysis publish/storage on fixtures and tests without rebuilding the owner DB;
4. materialize/index validated writer anchors and morphology evidence;
5. rerun Writer Page Benchmark v2 against the materialized runtime;
6. produce an explicit writer-search acceptance report.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality, benchmark evidence, lexical data model and runtime performance are stable.

See `PROJECT_STATE.json`, `docs/HANDOVER.md`, `docs/WRITER_RANKING.md`, `docs/WRITER_LEXICAL_MODEL.md`, `docs/BENCHMARK.md`, and `ROADMAP.md` for the execution boundary.
