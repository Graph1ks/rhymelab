# Phase 12C — Entity Runtime + AI Staging Acceptance

Status: **SOURCE-BACKED OWNER FULL-DATA ACCEPTED — PR FINALIZATION**

Branch: `phase12c-entity-runtime-ai-staging`

## Scope

Phase 12C has two deliberately independent tracks:

1. source-backed multilingual DE+EN Entity pronunciation/runtime plus the unified Writer Entity channel;
2. isolated external-LLM pronunciation evidence staging for unresolved English Entity names.

The second track is evidence staging only. It is not runtime truth and it is not a prerequisite for accepting or operating the source-backed runtime.

## Frozen controls

- DE Entity runtime fingerprint: `38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3`.
- accepted English Writer product remains frozen;
- source-backed English Entity source-resolution baseline was 710,561 candidate-ready / 704,989 unresolved; the accepted runtime-analyzable full-data baseline is 710,500 ready / 705,050 unresolved;
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

## Accepted owner full-data evidence — 2026-09-19

The consolidated owner gate completed successfully on the full local databases:

```text
schema                         rhymelab-phase12c-owner-acceptance-v1
status                         ok
materialize runtime            PASS
verify runtime                 PASS
accept Entity Writer           PASS

English names considered       1,415,550
English runtime-ready            710,500 / 50.19%
English unresolved               705,050 / 49.81%
English phonetic analyses        710,500
English rhyme anchors          3,552,500
English runtime fingerprint
3f2c520ce99868eda81991e6247c6c93bdf8c78f7805d7ceef2cc2ebd85bb6d8

DE runtime fingerprint
38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3
```

The 61-row difference from the earlier 710,561 source-resolution count is intentional: a source-backed pronunciation is not runtime-ready unless the accepted English runtime analyzer can also analyze it. Invalid/unanalysable source rows remain unresolved rather than being forced into runtime.

Entity Writer full-data acceptance also passed:

```text
DE query resolved fraction      1.00
DE nonempty Entity fraction     1.00
EN query resolved fraction      1.00
EN nonempty Entity fraction     1.00
ranking policy                  entity-writer-ranking-v2-phonetic-band-prominence-v1
repeatability                   PASS
Writer semantic fingerprint
76ac9a32e62fd7b253515569294599012010e9be758db24227a910d893141ae7
```

Performance was measured but was not an acceptance gate for this source-backed correctness/ranking pass. The owner run observed roughly 384–403 ms p50 and 1.15–1.22 s p95 across the 22-query acceptance sample. Runtime latency optimization therefore remains explicit follow-up work; these measurements must not be presented as meeting the separate ~100 ms product target.

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

### AI scope decision after source-runtime acceptance

The earlier 704,989-row source-unresolved export remains valid tooling/evidence, but it is **not** the planned production annotation campaign anymore.

Future AI pronunciation work is deliberately bounded:

- rank retained Entities by the accepted Entity popularity ordering;
- take only the **top 100,000 Entities**;
- target only English names in that population that still lack a runtime-valid pronunciation;
- include analyzer-rejected source candidates when they fall inside that top-100k population;
- measure the exact targeted row count from the owner-local database before export;
- leave the remaining long-tail unresolved population unresolved by default.

Do not renumber or mutate already-created historical AI batches. Any new campaign should use a new targeted manifest/export identity so old staging evidence remains reproducible.

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

The source-backed owner gate is accepted. Remaining PR-finalization steps are:

1. keep GitHub `validate` green on the final documentation head;
2. mark PR #112 ready for review;
3. squash-merge the source-backed Phase 12C branch when the repository finalization step is authorized.

Entity Writer latency optimization remains follow-up work and does not alter the accepted source/provenance/ranking boundary.

AI evidence can arrive days later and continues through its separate staging/benchmark gate without reopening the accepted source-backed runtime boundary.
