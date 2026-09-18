# Phase 12A2 Entity Cut Hybrid Candidate v2

Last updated: 2026-09-18

Status: **owner A-B accepted / Phase 12A2 materialization baseline frozen**

## Owner acceptance — 2026-09-18

The full-data owner A/B passed the v2 acceptance gate.

```text
status                         ok
semantic fingerprint           337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201
v1 anchor matches              true
all sentinels pass             true
Bud Spencer                    KEEP / Tier A
v1 distinct retained           1,077,669
v2 distinct retained           1,077,644
distinct delta                       -25
v1 -> v2 membership churn           0.41%
hard-gate categories v1        car_brand, company
hard-gate categories v2        none
```

The strict company category now admits a small evidence-backed missing-QRank set rather than treating source coverage as a hard gate. `organization.car_brand` also opens without a quota rule. The sparse-QRank `work.video_game` category changes by only one promoted and one demoted membership, providing a useful stability check.

Decision:

- accept `category-relative-popularity-hybrid-v2-geometric-missing-evidence-candidate` as the Phase 12A2 popularity/cut materialization baseline;
- pin semantic fingerprint `337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201`;
- preserve original control and Hybrid-v1 as diagnostic controls;
- do not refetch or restage sources for the pronunciation/runtime phase;
- the preferred 600k–900k size remains a nonblocking product-budget target, not a reason to alter an accepted ranking policy while pronunciation coverage is being measured.

Any future category-floor tightening is a separate candidate revision and must not silently change this accepted fingerprint.

## Evidence that rejects v1 for freeze

Owner full-data Hybrid-v1 report:

```text
schema                         rhymelab-entity-cut-hybrid-ab-v1
status                         ok
semantic fingerprint           e770c1cfc655764e9e0f26e033c53fba0f1e1af4e2ca3b7ac82adf4eabde1e04
all sentinels pass             true
Bud Spencer                    KEEP / Tier A
control distinct retained      1,077,927
v1 distinct retained           1,077,669
v1 distinct delta                    -258
membership churn                    1.89%
```

The v1 candidate was intentionally conservative and fixed five of the seven categories that had retained zero QRank-missing rows under the original control. It did **not** fix:

```text
organization.car_brand
organization.company
```

The critical failure is `organization.company`:

```text
QRank coverage                    45.68%
QRank missing                    123,357
retained memberships              56,774
v1 kept without QRank                  0
v1 missing-QRank retention          0.00%
```

This is not caused by the original explicit QRank-present-first ordering anymore. It is caused by a score ceiling.

## Why v1 still creates an implicit ceiling

Hybrid-v1 weights:

```text
QRank percentile                 55%
Wikipedia sitelink percentile   25%
DE/EN Wikipedia presence        10%
selected external IDs capped     7%
statement-count percentile       3%
                                ---
                                100%
```

For QRank-missing rows, v1 sets the QRank component to zero. The remaining evidence therefore has a hard raw maximum of:

```text
25 + 10 + 7 + 3 = 45%
```

A category whose retained boundary sits above 45% can still exclude every QRank-missing row even when those rows have excellent non-QRank evidence.

The owner report demonstrates that missing QRank cannot be interpreted as obscurity. Examples among v1-promoted works include recent/highly linked films and albums with both DE and EN Wikipedia presence. The pinned QRank artifact was retrieved in 2026 but carries a 2024-03-16 HTTP Last-Modified timestamp, so source staleness is a known reason for missing coverage.

## Candidate v2 policy

Policy id:

```text
category-relative-popularity-hybrid-v2-geometric-missing-evidence-candidate
```

V2 changes **only** the score treatment for rows whose QRank is missing.

All QRank-present rows retain exactly the Hybrid-v1 score.

### QRank present

```text
v2 score = v1 weighted score
available evidence weight = 100%
```

### QRank missing

First calculate the same v1 zero-filled raw score:

```text
raw_score = weighted structural evidence / 100
maximum raw_score = 45%
```

Then calculate the score normalized only over evidence that is actually available:

```text
available_evidence_score = weighted structural evidence / 45
maximum available_evidence_score = 100%
```

V2 takes the geometric mean:

```text
v2_score = sqrt(raw_score * available_evidence_score)
```

This is a deterministic compromise between two undesirable extremes:

- treating missing QRank as factual zero popularity;
- fully renormalizing missing QRank away as if confidence were unchanged.

With the current weights, the theoretical maximum missing-QRank score becomes:

```text
sqrt(0.45 * 1.00) = 0.670820...
maximum v2 missing-QRank score = 670,820 ppm
```

This raises the v1 450,000-ppm ceiling enough for excellent structural evidence to compete in strict categories while preserving a material completeness discount.

No neutral or median QRank prior is invented. A QRank-missing row with weak structural evidence still receives a weak score.

The implementation uses integer parts-per-million and deterministic integer square root. There is no randomization, ML, neural model, network call or runtime dependency.

## What v2 does not change

V2 does not change:

- the 55/25/10/7/3 evidence weights;
- category taxonomy;
- retention percentile floors;
- QLever source artifacts;
- staged QRank;
- entity-stage data;
- Hybrid-v1 evidence or fingerprint;
- German Writer;
- Phrase/Mosaic;
- runtime databases;
- runtime networking policy.

The only changed variable is missing-QRank score normalization.

## Owner A/B gate

Hybrid-v2 is anchored to the accepted owner Hybrid-v1 report fingerprint:

```text
e770c1cfc655764e9e0f26e033c53fba0f1e1af4e2ca3b7ac82adf4eabde1e04
```

After merge run:

```powershell
cd D:\rhymelab
git pull
npm run entity:cut:diagnose:hybrid-v2
```

No fetch, entity restage, QRank restage or floor change is required.

Default output:

```text
data/local/entity-cut-hybrid-v2-candidate-report.json
```

The v2 diagnostic verifies that the existing v1 report matches the accepted owner fingerprint and that recomputed per-category v1 summaries still match it before evaluating v2.

Terminal output includes:

- v1 and v2 distinct retained entities;
- target/preferred-range status;
- v1->v2 membership churn;
- hard-gate categories before and after v2;
- category-level missing-QRank retention;
- v1/v2 cut scores;
- best missing-QRank rank;
- Bud Spencer v1/v2 rank and tier;
- semantic fingerprint.

The full report also records representative v2-promoted/demoted boundary samples and their raw/available/geometric scores.

## Acceptance criteria

V2 may be promoted only if owner full-data evidence shows:

1. Hybrid-v1 owner fingerprint anchor matches;
2. Bud Spencer remains KEEP / Tier A;
3. distinct retained entities remain in the allowed 500k–1.2M envelope;
4. `organization.company` no longer has a structural 0% missing-QRank hard gate;
5. no category shows implausibly large v1->v2 churn;
6. representative newly promoted missing-QRank rows have meaningful structural evidence;
7. low-evidence missing-QRank rows do not receive a neutral popularity boost;
8. `work.video_game` remains stable enough that already-working sparse-QRank behavior is not disrupted;
9. `organization.car_brand` is reviewed diagnostically rather than forced to retain missing-QRank rows merely to satisfy a quota.

Do not change category floors until the ranking policy is accepted.

If v2 is accepted and the retained distinct population is still above the preferred 600k–900k range, only then evaluate category-floor tightening as a separate candidate revision.
