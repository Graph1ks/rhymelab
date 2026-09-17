# German Rhyme Quality Benchmark v1

RhymeLab uses a blind reference benchmark to tune German single-word rhyme quality. It evaluates **primary rhyme class**, **Assonance**, **Consonance**, and **songwriting usefulness** separately.

The last formally accepted German runtime baseline is v0.10.0 / local DB v4 with `de-ipa-v2` + `de-phon-v3` + `rhyme-relations-v2`. Generated queues, blind exports, imported reference labels, local reviews and reports stay gitignored.

The current main branch contains the validated v3 ranking source promotion. Formal baseline/version acceptance is still pending the post-promotion owner-local check described below.

## Reference-label provenance

The default evaluator workflow uses **external model reference labels**, not human-expert gold.

The external evaluator sees a blind package containing only stable task ID, query/candidate words, IPA and the canonical rubric. Engine prediction, scores, rank, usage rank, sampling category and phenomenon hints are omitted. Imported labels preserve evaluator identity, confidence, ambiguity and queue fingerprint. Ambiguous rows are skipped rather than force-labeled.

Model-produced reference labels are engineering evidence, not epistemically perfect ground truth. Ranking usefulness labels also do not override explicit product requirements such as keeping very uncommon vocabulary from dominating default search.

## Benchmark truth

Current refreshed fingerprint:

```text
4cae68d85b92a6ba8146307fc7a27dbf6877f1d69ced1a9f3480623a80612623
```

Current universe:

- 367 reviewed / 0 skipped;
- evaluator GPT-5.6 Sol;
- label source `external_model_reference`;
- confidence 100 high / 258 medium / 9 low.

Formally accepted v0.10 metrics:

- primary exact accuracy **0.7629**;
- binary rhyme precision **0.9726**;
- sample rhyme recall **1.0000**;
- multisyllabic-perfect F1 **1.0000**;
- perfect F1 **1.0000**;
- multisyllabic-slant F1 **0.5618**;
- family F1 **0.6854**;
- slant F1 **0.7212**;
- Assonance F1 **0.9340**;
- Consonance F1 **0.9277**;
- ranking mean NDCG **0.9562**;
- ranking mean pairwise concordance **0.8350**.

Task diagnostics show no evidence for a broad `de-phon-v3` or `rhyme-relations-v2` retune.

## Blind workflow

Build/export the blind handoff:

```powershell
npm run benchmark:handoff
```

Import returned labels/report:

```powershell
npm run benchmark:ingest
```

When accepted pronunciation selection, parsing or retrieval changes, use the refresh path rather than relabeling everything:

```powershell
npm run benchmark:refresh
npm run benchmark:refresh:ingest
```

## Ranking experiment history

### Pure score band — rejected

`score_band_0_05` produced the strongest reviewed-sample result but failed live lexical safety. Netflix/TikTok could promote rare or unranked dictionary forms into top results; hitzefrei also regressed.

### Hybrid v1 — rejected

`lexical_hybrid_decade_rare_guard_0_05` removed the original rare-word flooding but was too conservative and still regressed hitzefrei.

### Hybrid v2 — rejected

Best policy `modern_entity_log_commonness_0_04` recovered much of Spotify but still admitted substantially rarer Netflix/TikTok candidates. The report also established that the large pure-score-band YouTube gain was heavily driven by promoting `Toeloop` at usage rank 982,321; that reviewer gain is not a mandatory product goal when it conflicts with default commonness.

## Hybrid v3 — isolated experiment passed

Policy:

```text
modern_entity_relative_commonness_1decade_0_05
```

Mechanics:

- activates only for modern-query provenance with measured query usage rank;
- dictionary queries fall back exactly to accepted usage-first ordering;
- primary tier 0 and relation-only rows remain protected;
- ranked candidates are score-band-reorderable only when:

```text
candidate_usage_rank <= query_usage_rank * 10
```

- the 10× boundary is one query-relative base-10 order of magnitude, not a global frequency cutoff;
- inside that horizon, apply the existing 0.05 phonetic score band then usage rank;
- outside that horizon, keep usage-first order;
- missing query/candidate usage falls back conservatively;
- explicit source lexical tag `rare` remains a negative signal.

Owner-local v3 result:

- sample **0.9613 NDCG / 0.8640 pairwise**;
- live reviewed **0.9610 / 0.8382**;
- live delta vs engine **+0.0051 NDCG / +0.0283 pairwise**;
- 14 new top-20 candidates, all usage-ranked, 0 >100k, 0 outside the query-relative horizon;
- only Spotify changes top-20 membership;
- no reconstruction mismatches;
- no protected-order mismatches.

## Retrieval-aware pre-promotion validation — passed

Command used:

```powershell
npm run benchmark:ranking:runtime-candidate
```

Owner-local report schema/status:

```text
rhymelab-benchmark-ranking-runtime-candidate-v1
status=ok
```

The v1 runner reconstructed the full current local-engine retrieval/scoring set using the existing retrieval keys and pool limit 800, verified accepted top-250 reconstruction, and applied v3 to the full retrieved candidate set before the top-250 cutoff.

Aggregate result:

- 27 queries, 0 missing;
- 0 engine reconstruction mismatches;
- 0 protected-order mismatches;
- usage-first reference **0.9559 NDCG / 0.8099 pairwise**;
- v3 candidate **0.9610 / 0.8366**;
- delta **+0.0051 / +0.0267**.

Safety result:

- 14 new top-20 candidates;
- 0 without usage rank;
- 0 explicit `rare`;
- 0 worse than usage rank 100,000;
- 0 outside the query-relative one-decade horizon;
- 141 new top-250 members with the same safety properties;
- top-20 membership changes only for Spotify;
- top-250 membership changes only for Spotify, Twitter, TikTok and Instagram;
- Netflix and YouTube top-250 membership remain unchanged;
- hitzefrei remains exact engine order.

Focus metrics:

- Spotify: `0.8170 / 0.2083` → **`0.9521 / 0.8750`**;
- YouTube: `0.8389 / 0.6545` → **`0.8418 / 0.7091`**, no membership change;
- Netflix unchanged **`0.9767 / 0.6667`**;
- TikTok top-20 unchanged; top-250 reviewed subset shrinks from 13 to 11 after two usefulness-1 reviewed rows leave the top-250 universe, giving **`0.9594 / 0.7097`**;
- hitzefrei unchanged **`0.9872 / 0.8400`**.

Decision: **retrieval-aware pre-promotion gate passed**.

## Runtime source promotion — wired

Production source now contains the validated policy:

- `src/runtime-ranking-policy.mjs` — production comparator;
- `src/local-engine.mjs` — normal `type=all`, non-balanced ranked mode uses it;
- `tests/runtime-ranking-policy.test.mjs` — checks production-vs-experiment equivalence for the critical policy behaviors.

Scorer, relation policy, retrieval keys/pool mechanics and DB schema are unchanged.

Type-specific result modes and `coverage=balanced` intentionally retain their previous ordering. They were not part of this promotion gate and must not be described as using v3 until separately validated.

## Post-promotion runtime acceptance — current gate

The same command now runs a **v2 post-promotion acceptance report**:

```powershell
npm run benchmark:ranking:runtime-candidate
```

It first runs:

```text
npm run check && npm test
```

Then writes:

```text
reports/de-rhyme-benchmark-ranking-runtime-candidate.json
```

Expected schema:

```text
rhymelab-benchmark-ranking-runtime-candidate-v2
```

The v2 runner:

- treats the independently reconstructed usage-first retrieval order as the historical reference baseline;
- derives the validated v3 expected order from the full retrieved set before top-250 truncation;
- runs live `findRhymes` and requires exact ordering equality with that expected candidate;
- requires the runtime response to report the correct `rankingPolicy`;
- rechecks protected-order integrity, reviewed metrics, top-20 safety and top-250 membership changes.

Formal promotion requires all of the following:

- `status=ok`;
- zero `runtime_candidate_mismatch_queries`;
- zero `runtime_policy_mismatch_queries`;
- zero protected-order mismatches;
- live runtime metrics and safety reproduce the already-passed v1 candidate evidence;
- source checks and the current full test suite pass in the owner-local environment.

Only after this report passes should the formal accepted runtime baseline/version be advanced.

## Metrics rule

Reports keep separate:

- exact primary-class agreement;
- per-class precision/recall/F1;
- binary primary-rhyme precision;
- sample recall only, not full-database recall;
- Assonance/Consonance metrics;
- usefulness ranking via NDCG + pairwise concordance;
- phenomenon/query breakdowns;
- evaluator/confidence provenance;
- live/retrieval-boundary lexical safety.

Reviewed metrics alone are never sufficient evidence for runtime ranking quality.

## Optional local review UI

```powershell
npm run benchmark:run
```

Then open `http://127.0.0.1:3030/benchmark`.

The owner is not required to classify phonology manually. Use the UI only for spot checks, subjective product taste or future human/expert adjudication.

## Future English

Benchmark transport, fingerprinting, provenance/confidence policy, refresh drift and metrics are reusable. English still needs its own source pipeline, IPA/canonicalization, phoneme similarities, scorer thresholds, pronunciation policy and language-specific benchmark.
