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

Ad-hoc writer-ranking/morphology tuning remains frozen at v6/v4. Writer v7 remains rejected and rolled back.

## Writer Page Benchmark v2 — structural baseline passed

The corrected owner-local v6/v4 run establishes the frozen structural baseline:

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

All direct productive-`-weise` and previous false-split morphology regressions passed. NDCG@10/20 remains deliberately `pending_reference` until the relevant current writer cutoff has complete independent human songwriting-usefulness labels.

## Legacy/runtime invariance — passed

The accepted path remains isolated from writer search:

```text
ranking=legacy -> findRhymes(...)
writer default -> findWriterRhymes(...)
```

The owner-local retrieval-aware runtime gate passed on the current accepted DB:

```text
schema                              rhymelab-benchmark-ranking-runtime-candidate-v2
status                              ok
queries                             27 / 27
missing_queries                     []
runtime_candidate_mismatch_queries []
runtime_policy_mismatch_queries    []
protected_order_mismatch_queries   []
reference evidence                 unavailable_invariance_only
```

The historical local refresh queue/review files are not present in this checkout, so NDCG/pairwise values are correctly unavailable for this run. That does not weaken the runtime-order, policy-ID or protected-order invariance gate.

Safety of newly surfaced candidates also passed:

```text
new Top-20 candidates               14
new Top-250 candidates              141
without usage rank                  0
explicit rare                       0
usage rank >100k                    0
usage rank >500k                    0
outside relative 1-decade horizon   0
unknown relative horizon            0
```

Only `Spotify` changed Top-20 membership. Top-250 membership changed for `Spotify`, `Twitter`, `TikTok`, and `Instagram`.

Decision: Phase 9A legacy/runtime invariance is complete. Do not invent another competing legacy benchmark.

## Multi-analysis writer lexical model — Phase 9B implementation active

DB v4's single selected lemma/POS analysis is not sufficient as the final writer substrate. Source entries can legitimately expose multiple analyses, so writer morphology must preserve those analyses and their provenance instead of promoting one deterministic selection to semantic truth.

Design and pure core:

```text
docs/WRITER_LEXICAL_MODEL.md
scripts/writer-lexical-model-core.mjs
tests/writer-lexical-model.test.mjs
```

Experimental migration contracts are now implemented:

```text
publish schema: rhymelab-de-publish-v3
DB schema:      rhymelab-local-db-v5
```

Relevant implementation/tests:

```text
scripts/writer-lexical-publish-v3-core.mjs
scripts/writer-lexical-storage-v5-core.mjs
tests/fixtures/writer-lexical-v3-options.json
tests/writer-lexical-publish-storage.test.mjs
tests/local-db-writer-lexical-v5.test.mjs
```

The v3 publish representation preserves every merged source-supported analysis under compact `a[]`, including analysis identity, lemma/POS, homograph, confidence, source-record keys, match kinds, style/form tags and candidate IPA provenance. Legacy `l/p/g` fields remain only as a deterministic compatibility projection.

The v5 storage representation materializes one normalized `form_analysis` row per `(form_id, analysis_key)` and retains the old `hot` compatibility columns for migration comparison.

Builder integration is opt-in and non-destructive:

- normal `build-de-rhyme-publish.mjs` remains publish v2;
- `--writer-lexical-v3` selects publish v3 and defaults to a separate `data/de/publish-v3` output;
- normal v2 input to `build-local-db.mjs` still produces DB v4;
- publish-v3 input produces DB v5 and, unless explicitly overridden, uses separate local DB/report filenames.

Fixtures cover equal-confidence adjective/adverb analyses, deterministic provenance merging, input-order independence, compatibility projection, normalized SQLite storage, duplicate analysis rejection, and end-to-end publish-v3 -> DB-v5 construction.

No owner DB rebuild has been performed or authorized by this fixture/migration step.

## Remaining performance boundary — Phase 9C next

Right-edge validation still uses broad suffix `LIKE` retrieval against DB v4. `Arbeitsweise` remains roughly eight seconds on the frozen owner benchmark and produces 1,353 right-edge / 1,580 merged candidates. That path is validation-only and not acceptable final local/mobile architecture.

Next engineering work:

1. keep accepted v2/v4 defaults untouched;
2. materialize/index validated `de-right-edge-anchors-v1` signatures per pronunciation in the experimental v5 path;
3. materialize/version `de-attested-right-head-v4` morphology evidence per source-supported analysis;
4. query writer anchors by indexed keys instead of broad suffix `LIKE` scans;
5. require candidate/regression equivalence with the frozen Writer Page Benchmark v2 baseline;
6. record SQLite size delta, query plans, per-query runtime and deterministic repeatability;
7. rerun Writer Page Benchmark v2 against the materialized runtime;
8. produce an explicit writer-search acceptance report before changing the accepted/base default.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality, provenance model, benchmark evidence and runtime performance are stable.

See `PROJECT_STATE.json`, `docs/HANDOVER.md`, `docs/WRITER_RANKING.md`, `docs/WRITER_LEXICAL_MODEL.md`, `docs/BENCHMARK.md`, and `ROADMAP.md` for the execution boundary.
