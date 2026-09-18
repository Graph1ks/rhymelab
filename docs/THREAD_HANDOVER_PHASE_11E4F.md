# RhymeLab — Phase 11E4/F Thread Handover

Last updated: 2026-09-18

Repository state is authoritative.

## Current milestone

```text
PHASE_11E4F_RUNTIME_INTEGRATION_FINAL_ACCEPTANCE
```

11E4 and 11F are one continuous engineering workstream with two ordered internal gates:

1. 11E4 local runtime/API/UI integration.
2. 11F final structural/provenance/performance/repeatability acceptance benchmark over that integrated surface.

Do not run the final 11F acceptance suite against a diagnostic-only path that is not the product integration.

## Read first

1. `AGENTS.md`
2. `docs/HANDOVER.md`
3. this file
4. `PROJECT_STATE.json`
5. `STATUS.md`
6. `ROADMAP.md`
7. `docs/PHRASE_MOSAIC_PLAN.md`
8. `docs/PHRASE_MOSAIC_RANKING_V1.md`
9. `docs/PHRASE_MOSAIC_DIVERSITY_ACCEPTANCE.md`
10. `docs/API.md`

## Hard boundaries

RhymeLab core remains deterministic and local-only.

Do not add:

- LLM inference;
- ML/neural ranking;
- hosted search/ranking;
- runtime network dependencies;
- telemetry or hidden uploads.

The frozen single-word Writer must remain unchanged:

```text
DB schema       rhymelab-local-db-v5
runtime         materialized-writer-v5-v1
ranking         deterministic_writer_utility_v6
anchor policy   de-right-edge-anchors-v1
morphology      de-attested-right-head-v4
construction    de-adverbial-weise-v2
```

## Accepted Phrase/Mosaic stack

### 11D4 retrieval — frozen

```text
anchor fingerprint
9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059

semantic fingerprint
4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd
```

### 11E1 evidence — frozen

```text
suite evidence fingerprint
04ecde26f0a59b7615d6b2a192e7cffed26aefe86ebac07e388e546210d58845
```

### 11E2-v2 ranking — accepted/frozen

```text
schema
rhymelab-phrase-mosaic-ranking-candidate-v2

policy
de-phrase-writer-utility-v2-phonetic-guard-candidate

suite ranking fingerprint
1d07ad486bdff8b167a7a394dafa687a60178cb43bd5a48da19044715d33d3a0
```

### 11E3 diversification — accepted/frozen

```text
schema
rhymelab-phrase-mosaic-diversity-candidate-v1

policy
de-phrase-channel-diversity-v1-candidate

exact canonical cap      1
normalized cap           1
phrase-family cap        1
lexical-frame cap        3
lexical-head cap         none

diagnostic baseline fingerprint
61e10fc5ab4a434f4668e5ee14c5b9ba721269ee1b4bd705d79cc5941cb44f96

accepted diversity suite fingerprint
ca7e04e91226cd5a3855dbe302a54bffaccce8c6d3a9defff8be049ca6153ef1
```

Owner evidence:

```text
Writer-page candidates          1,182
retained                          749
suppressed                        433
lexical-frame suppressions        429
exact duplicates                    4
Top-20 changed queries              6 / 12
repeatability runs                  3
repeatability mismatches             0
all protected checks              PASS
```

## Product rule

Phrase/Mosaic is an optional channel, not a quota.

Required:

- explicit Phrase/Mosaic / Wortgruppen filter;
- better single-word results may remain above all phrase results;
- zero phrase results is valid;
- no globally calibrated comparison of single-word and phrase numeric scores;
- diagnostic provenance remains available for suppressed/ineligible phrase rows.

Forbidden:

- reserved phrase slots;
- forced phrase visibility;
- promotion above better single-word rows merely because a row is multi-word;
- cross-channel score hacks.

## 11E4 integration gate

Integrate the accepted Phrase/Mosaic stack into the local product path.

Required engineering checks:

- local phrase DB opens read-only and remains optional for single-word-only startup where intended;
- API contract for explicit phrase/mosaic requests;
- UI filter named clearly as Phrase/Mosaic or Wortgruppen;
- no default phrase quota;
- zero-result safety;
- accepted ranking/diversity provenance surfaced in diagnostics;
- single-word Writer regression remains byte/semantic equivalent to frozen control;
- protected phrase cases remain intact;
- measure combined request-path latency on owner data;
- no network dependency.

Do not retune retrieval, ranking or diversity while doing integration unless a new integration-specific defect proves the accepted policy cannot be represented correctly.

## 11F final acceptance gate

Immediately after 11E4 is integrated, run the dedicated final suite on that same product path.

Must cover at least:

- exact multi-word rhyme;
- one-boundary and multi-boundary mosaic matches;
- secondary stress;
- short-query false positives;
- common-vs-obscure phrase safety;
- source/idiom/fixed-expression provenance;
- historical/dated filtering;
- empty phrase result;
- marked-surface handling;
- duplicate/template diversity;
- pronunciation ambiguity;
- owner-local performance;
- deterministic repeatability;
- unchanged frozen single-word Writer regression.

Human Writer NDCG may remain `pending_reference`.

## Immediate next action

Inspect the current local Writer API/server/UI contract and implement the smallest additive Phrase/Mosaic product path that reuses the accepted 11D4 -> 11E2-v2 -> 11E3 stack without touching the single-word Writer path.

Use branch/PR + required `validate` CI for every accepted change.
