# Phase 11E3 — Phrase-Channel Diversification Acceptance

Last updated: 2026-09-18

## Decision

Phase 11E3 is **ACCEPTED / FROZEN**.

The accepted diversification layer operates only on the accepted 11E2-v2 Phrase/Mosaic Writer-page candidate set. It does not modify single-word Writer retrieval/ranking, phonetic relation truth, phrase eligibility, or cross-channel ordering.

## Accepted policy

```text
schema                 rhymelab-phrase-mosaic-diversity-candidate-v1
policy                 de-phrase-channel-diversity-v1-candidate
exact canonical cap    1
normalized cap         1
phrase-id/family cap   1
lexical frame cap      3
lexical head cap       none
randomization          none
```

Retained candidates preserve accepted 11E2-v2 order. Suppressed rows retain deterministic suppression provenance.

## Frozen input controls

```text
11D4 anchor fingerprint
9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059

11E2-v2 suite ranking fingerprint
1d07ad486bdff8b167a7a394dafa687a60178cb43bd5a48da19044715d33d3a0

11E3 read-only diagnostic baseline fingerprint
61e10fc5ab4a434f4668e5ee14c5b9ba721269ee1b4bd705d79cc5941cb44f96

accepted diversity suite fingerprint
ca7e04e91226cd5a3855dbe302a54bffaccce8c6d3a9defff8be049ca6153ef1
```

## Owner A/B evidence

```text
Writer-page candidates          1,182
retained after diversity          749
suppressed                        433
lexical-frame suppressions        429
exact canonical duplicates          4
queries with changed Top-20          6 / 12
original Top-20 suppressed          33
promoted into Top-20                21
```

The intended concentration control is visible on representative problem queries. For example, the maximum Top-20 lexical-frame group for `Arbeitsweise` fell from 13 to 3 while the protected Writer top remained rank 1.

## Protected cases

All protected checks pass:

- `Liebe` multi-syllable perfect remains rank 1;
- `Freiheit -> dabei seid` remains rank 1;
- `Gedanken` Writer top remains rank 1;
- `Arbeitsweise` Writer top remains rank 1;
- `hitzefrei` Writer top remains rank 1;
- `Musik -> K.-o.-Siegen` remains outside Top-20;
- `Leben` remains empty on the default phrase Writer page.

## Repeatability

Three independent owner runs produced:

- identical accepted 11E2-v2 suite fingerprint;
- identical 11E3 diagnostic baseline fingerprint;
- identical diversity suite fingerprint;
- zero mismatches;
- all protected checks passing.

Repeatability: **PASS**.

## Product boundary

Phrase/Mosaic remains an optional channel, not a quota.

Do not:

- reserve phrase slots in the default result list;
- promote phrases above better single-word results merely for visibility;
- invent a phrase result when the channel is empty;
- treat phrase and single-word internal scores as globally calibrated.

## Next milestone

```text
PHASE_11E4F_RUNTIME_INTEGRATION_FINAL_ACCEPTANCE
```

11E4 and 11F are managed as one continuous engineering milestone with two internal gates:

1. **Integration gate (11E4):** local runtime/API/UI integration, explicit Phrase/Mosaic filter, regression-safe single-word path, provenance preservation, local performance measurement.
2. **Final acceptance gate (11F):** dedicated structural/provenance/lexical-safety/performance/repeatability benchmark over the integrated surface.

The final benchmark still depends on the integrated runtime; combining the workstream does not remove that dependency.
