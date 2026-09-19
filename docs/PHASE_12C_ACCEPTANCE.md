# Phase 12C — Entity Runtime + AI Staging Acceptance

Status: **OWNER FULL-DATA ACCEPTANCE PENDING**

Branch: `phase12c-entity-runtime-ai-staging`

## Scope

Phase 12C has two deliberately independent tracks:

1. source-backed multilingual DE+EN Entity pronunciation/runtime plus the unified Writer Entity channel;
2. isolated external-LLM pronunciation evidence staging for unresolved English Entity names.

The second track is evidence staging only. It is not runtime truth and it is not a prerequisite for accepting or operating the source-backed runtime.

## Frozen controls

- DE Entity runtime fingerprint: `38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3`.
- accepted English Writer product remains frozen;
- source-backed English Entity expansion baseline remains 710,561 ready / 704,989 unresolved;
- MFA and forced-neural g2p-en runtime fallback remain rejected;
- accepted EN Entity runtime rows must remain source-backed with `generated=0`;
- AI staging promotion remains disabled;
- no hosted/network/model inference may enter the core runtime.

## Source-backed repository gate

Implemented:

- source-backed en-US Entity pronunciation materialization, English phonetic analyses and rhyme anchors;
- verifier that preserves the frozen DE fingerprint and rejects generated accepted EN runtime rows;
- multilingual DE+EN Entity Writer channel and Entity UI scope;
- guarded Entity ranking policy `entity-writer-ranking-v2-phonetic-band-prominence-v1`;
- 0.02 phonetic neighborhoods: prominence may reorder only inside the same rhyme tier, phonetic band and syllable distance;
- deterministic QID deduplication and repeated-surface cap;
- batched Entity-category metadata loading instead of one category query per candidate;
- full-data Entity Writer acceptance plan and repeatability/provenance/ranking diagnostics;
- one owner runner that materializes, verifies and evaluates the full local source-backed runtime.

Owner gate:

```powershell
npm run entity:phase12c:owner
```

Primary report:

```text
data/local/phase12c-owner-acceptance-v1-report.json
```

The owner gate is intentionally local because the full Entity, English Writer and source-expansion databases are gitignored.

## AI staging gate

Implemented independently:

- deterministic unresolved-name AI queue with local-only temporary ID bridge;
- strict result importer with five-column ARPAbet validation;
- strict manifest SHA/range/sequential-ID/C-A-U/error-counter reconciliation;
- idempotent identical artifact re-import;
- separate staging SQLite with `runtime_promoted=0`;
- aggregate staging diagnostics across confidence, category, orthography, source-gap reason, popularity tier and problem populations;
- LLM benchmark evaluator with confidence strata;
- benchmark-v3 explicit review gate that does not rewrite pending gold.

Durable staging contract: `docs/ENTITY_AI_PRONUNCIATION_STAGING_V1.md`.

No AI batch result is required for the source-backed owner gate or for source-backed runtime operation.

## Benchmark-v3 interpretation

Benchmark-v3 remains `review_pending`. The six flagged context/homograph cases must eventually be resolved from independent review evidence; model output must not be promoted into gold.

The generated v2 control lives under `data/local/` and is intentionally not tracked, so the tracked review file alone cannot reconstruct every original context/reference safely.

This review now gates **AI pronunciation evidence acceptance only**. It does not block source-backed runtime acceptance or the source-backed runtime merge.

## Entity Writer ranking contract

The Entity channel is phonetic-first.

Ranking order is:

1. rhyme relation tier;
2. deterministic 0.02 phonetic score band;
3. syllable distance;
4. category-relative prominence;
5. global popularity;
6. exact phonetic score and deterministic lexical tie-breakers.

Therefore a famous Entity cannot cross a materially better phonetic band. Popularity is allowed to reorder only phonetically near-equivalent candidates.

The local acceptance report additionally checks:

- zero ranking-guard violations;
- zero generated pronunciation rows in returned pages;
- complete pronunciation provenance;
- no duplicate QIDs per page;
- repeated normalized surface cap;
- deterministic independent-open repeatability;
- DE/EN Entity query coverage;
- no numeric DE/EN cross-language score calibration;
- category metadata query batching;
- representative top results for owner semantic review.

No synthetic human relevance gold is invented by this gate.

## Repository CI

Required pull-request validation:

```powershell
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

GitHub required check: `validate`.

Draft PR: #112.

The final branch head must be green before merge. CI validates the repository/tooling contract; the local owner report validates the full-data contract.

## Merge readiness

Benchmark-v3 and missing AI staging data are **not** merge blockers for the source-backed track.

Remaining source-backed blockers are:

1. run `npm run entity:phase12c:owner` against the owner's full local databases;
2. review the returned compact report and representative Entity pages;
3. keep GitHub `validate` green on the final branch head;
4. mark PR #112 ready and squash-merge once the owner gate is accepted.

AI evidence can arrive days later and continues through its separate staging/benchmark gate without reopening the accepted source-backed runtime boundary.
