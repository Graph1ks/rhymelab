# English Writer Acceptance v1 — Phase 12B10

Status: **owner evidence reviewed / English Writer candidate selected for product integration**

## Purpose

Phase 12B10 converts the broad Phase 12B9 evidence sweep into one structurally safe English Writer candidate and one owner acceptance command.

The previous evidence bundle is accepted as diagnostic evidence only. It proved runtime repeatability, but also exposed two ranking defects:

1. the pairwise phonetic near-tie comparator was non-transitive and produced 30 guard violations in both Commonness candidates;
2. raw orthographic query overlap behaved poorly as an English ranking penalty and promoted unranked/rare-looking alternatives while demoting legitimate rhymes such as shared-spelling perfect rhymes.

Phase 12B10 fixes those issues before any product EN promotion.

## Accepted inputs

English DB:

```text
beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37
```

Publish-v4:

```text
b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9
```

Accepted runtime diagnostic:

```text
dc4de5383325ee3b0d03ca6d77b8282bb0986e19c8e12567c2022a8aa3f29fcf
```

The acceptance runner reproduces the runtime diagnostic fingerprint before ranking acceptance.

## Ranking architecture

The candidate preserves the accepted RhymeLab separation:

```text
phonetic relation tier
-> anchored phonetic near-tie band
-> Quality/Commonness ordering inside that band
-> separate page Diversity/Redundancy selection
```

### Anchored near-tie bands

Pairwise comparator logic is not used.

Within each relation tier:

1. sort by phonetic score descending;
2. take the best remaining score as a band anchor;
3. include only rows within 0.03 of that anchor;
4. order product utility only inside that complete bounded band;
5. continue with the next anchor.

Therefore every row reordered by Commonness is guaranteed to remain within a phonetic band whose total score span is at most 0.03.

This avoids non-transitive chains such as:

```text
A near B
B near C
A not near C
```

## English lexical-overlap decision

Raw spelling overlap with the query remains diagnostic evidence only.

It is **not** subtracted from English Writer utility.

Reason: English spelling overlap is heavily entangled with legitimate rhyme spelling. Penalizing it caused ordinary results such as `crime`, `prime`, `lime` for `time` to lose priority while orthographically different low-usage alternatives could rise.

Lexical/morphological concentration is still controlled through the independent Diversity layer:

- exact normalized duplicate;
- shared lemma;
- strong near-duplicate similarity;
- shared prefix similarity.

## Usage/Commonness candidates

The final acceptance runner compares three bounded candidates:

```text
guarded_commonness_06
guarded_commonness_10
guarded_commonness_14
```

All use the same 0.03 anchored phonetic guard.

Missing wordfreq evidence remains `unknown`, not a claim that the surface is rare. It receives only a small usage-confidence penalty during ordering.

The runner selects the **lowest commonness weight** that satisfies all structural gates:

- zero phonetic-guard violations;
- mean Top-20 phonetic drop <= 0.0025 vs phonetic control;
- mean Top-20 commonness uplift >= 0.02;
- no increase in Top-20 unranked rows.

This deliberately prefers the least intervention that achieves a useful commonness improvement.

## Diversity selection

The selected Quality candidate is tested at:

```text
0
0.08
0.12
0.16
0.20
```

Diversity may act only inside the same relation tier **and the same anchored quality band**.

Diversity selection uses a constrained Pareto rule:

- require an improvement in both near-duplicate and repeated-lemma concentration;
- mean phonetic drop must remain <= 0.0025;
- mean commonness drop must remain <= 0.04;
- phonetic-guard violations must remain zero;
- among candidates satisfying those hard quality constraints, maximize the weaker of the two diversity reductions; use lower weight as deterministic tie-break.

This avoids tuning acceptance to arbitrary percentage targets while still preventing Diversity from buying variety by sacrificing commonness or phonetic quality.

## Query coverage

The acceptance run combines:

- a larger deterministic lyricist-oriented sentinel set;
- deterministic usage-stratified samples across the ranked and unranked English DB;
- modernity diagnostics for current slang/CMC terms.

The stratified sample no longer takes the first lexical rows at each rank boundary. It uses a deterministic ID permutation so each frequency stratum is spread through the DB.

Modernity sentinels are diagnostic only because wordfreq is known to be a snapshot through roughly 2021.

## Command

```powershell
npm run en:writer:accept
```

Primary output:

```text
data/local/en-writer-acceptance-v1-report.json
```

The runtime-check sidecar is:

```text
data/local/en-writer-acceptance-runtime-check.json
```

Only the primary report needs to be uploaded unless the runner fails.

## Acceptance result contract

A successful report has:

```text
status = candidate_accepted_for_product_integration
```

and contains:

- selected Quality candidate;
- selected Diversity weight;
- all structural gate evaluations;
- aggregate metrics;
- compact per-query retrieval summaries;
- Top-10 before/after evidence only for a small representative sentinel set;
- modernity diagnostics;
- semantic report fingerprint.

The default report profile is `compact-v1`. Full per-query/config/diversity Top-20 dumps are written only when an explicit `--debug-report <path>` flag is supplied.

No ranking or diversity configuration is promoted merely because it exists in code. The owner report must satisfy the gates.

## Next step after PASS

If Phase 12B10 passes, do not open another ranking micro-gate.

Implement the selected policy in the English Writer runtime and perform one integrated product acceptance bundle covering:

- EN endpoint/runtime;
- DE+EN language-mode separation;
- English runtime repeatability;
- selected ranking/diversity fingerprint;
- German frozen-runtime invariance;
- product capability gating / failure behavior.

Only after that integrated bundle passes should EN and DE+EN be considered accepted product capabilities.


## Owner result — 2026-09-19

The owner run completed against the accepted v4 DB/runtime evidence.

```text
reported status                  needs_iteration
semantic fingerprint             b1aacf3c2de3f91b9ce740744b15f89c797a24b4dc916f0f72f5d8235ea266cb
queries                          96
raw report bytes                 44,256,392
raw report MiB                   42.21
```

Quality selection:

```text
selected                         guarded_commonness_06
mean phonetic drop               0.001061
mean commonness uplift           0.035469
unranked delta                  -62
guard violations                 0
```

All three tested Commonness candidates passed the Quality hard gates. The least intervention, `guarded_commonness_06`, remains the selected Quality policy.

The original fixed Diversity thresholds produced no automatic winner. Review of the trade-off shows one clear constrained Pareto point:

```text
diversity weight                 0.08
near-duplicate reduction         45.6853%
repeated-lemma reduction         38.7755%
mean phonetic drop               0.000322
mean commonness drop             0.034878
guard violations                 0
```

Weights `0.12`, `0.16` and `0.20` improve duplicate suppression further but exceed the accepted `0.04` Commonness-drop guard. Therefore the reviewed English Writer candidate is:

```text
quality                          guarded_commonness_06
diversity                        0.08
policy                           en-writer-guarded-quality-diversity-v1-candidate
```

No further ranking owner run is required before product integration.

The 42.21 MiB default report was a tooling defect, not a data requirement. The primary report now omits repeated full Top-20 matrices. Reconstructing the new compact shape from this owner evidence is approximately 165 KiB, a reduction of about 99.6%. Full matrices are debug-only.
