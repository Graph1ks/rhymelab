# English Acceptance Bundle v1 — Phase 12B9

Status: **candidate evidence bundle / owner run pending**

## Why this exists

The English Writer work no longer advances through one local command per small gate.

This bundle combines the next cheap, logically related evidence steps into one owner run:

1. English retrieval runtime repeatability across independent DB opens;
2. deterministic query sampling across commonness/rarity strata;
3. several Quality/Commonness ranking candidates evaluated on the same retrieved pools;
4. several Diversity/Redundancy strengths evaluated on the same ranked pools.

The goal is to reduce iteration latency without weakening gate quality.

## Command

```powershell
npm run en:acceptance:bundle
```

Output:

```text
data/local/en-acceptance-bundle-v1-report.json
```

The bundle also writes per-run runtime reports under:

```text
data/local/en-runtime-repeatability-v1/
```

Those are diagnostic intermediates. The bundle report is the primary handoff artifact.

## Accepted inputs

The bundle refuses to treat a different DB/source snapshot as the current candidate.

Required English DB fingerprint:

```text
beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37
```

Required publish-v4 fingerprint:

```text
b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9
```

## Runtime repeatability

Default:

```text
3 independent DB opens / runtime diagnostic runs
```

All runs must reproduce the same runtime diagnostic semantic fingerprint and preserve the accepted DB/publish fingerprints.

## Query sample

The bundle uses:

- explicit runtime sentinels already exercised in Phase 12B8;
- deterministic default-eligible ASCII single-word queries selected across ranked usage strata;
- an unranked/default-eligible stratum.

This is engineering evidence, not human rhyme gold.

## Quality/Commonness candidate sweep

The first bundle does not promote a ranking policy.

It compares:

```text
phonetic_control
de_architecture_control
conservative_commonness
```

The German architecture control exists to measure transfer behavior, not to assume German weights are correct for English.

All non-control candidates keep a phonetic near-tie guard so commonness cannot reorder candidates across materially different phonetic quality.

Evidence includes:

- Top-20 mean phonetic quality;
- Top-20 bounded commonness;
- unranked-row concentration;
- query lexical-overlap concentration;
- near-duplicate concentration;
- same-lemma concentration;
- phonetic-guard violations.

## Diversity sweep

For every Quality candidate the same retrieved/ranked pools are tested at:

```text
0
0.10
0.18
0.26
```

The German accepted `0.18` value is one control point only.

The bundle records:

- change in near-duplicate rows;
- change in repeated-lemma rows;
- mean redundancy;
- phonetic-quality delta;
- commonness delta.

Diversity selection is restricted to the current relation tier and phonetic near-tie band. It cannot use novelty to promote a materially worse rhyme tier.

## Interpretation

This bundle is **evidence-only**.

It deliberately does not automatically select a winner because there is not yet an accepted English human Writer benchmark.

A successful bundle means:

- runtime is repeatable;
- the ranking/diversity evidence is reproducible and ready for one consolidated review.

The next engineering step should choose or adjust a candidate from the report, then run one focused acceptance pass rather than another sequence of micro-diagnostics.

## Safeguards

The bundle remains:

- local/offline;
- read-only against the English DB;
- product-EN disabled;
- API/UI unmodified;
- German DB/runtime untouched;
- broad G2P disabled;
- ranking not promoted;
- diversity not promoted.
