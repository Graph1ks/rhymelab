# Phase 12C — Entity Runtime + AI Staging Acceptance

Status: **CANDIDATE / NOT MERGE-READY**

Branch: `phase12c-entity-runtime-ai-staging`

## Scope

This gate covers two deliberately independent deliverables:

1. source-backed multilingual DE+EN Entity pronunciation/runtime and unified Writer Entity channel;
2. isolated external-LLM pronunciation evidence staging for unresolved English Entity names.

The second deliverable is not a generated runtime fallback.

## Frozen controls

- DE Entity runtime fingerprint: `38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3`.
- accepted English Writer product remains frozen;
- source-backed English Entity expansion baseline remains 710,561 ready / 704,989 unresolved;
- MFA and forced-neural g2p-en runtime fallback remain rejected;
- accepted EN Entity runtime rows must remain source-backed with `generated=0`;
- AI staging promotion remains disabled.

## Repository implementation gate

Implemented:

- source-backed en-US Entity pronunciation materialization, English phonetic analyses and rhyme anchors;
- verifier that preserves the frozen DE fingerprint and rejects generated accepted EN runtime rows;
- multilingual DE+EN Entity Writer channel and Entity UI scope;
- deterministic unresolved-name AI queue with local-only temporary ID bridge;
- strict result importer with five-column ARPAbet validation;
- strict manifest SHA/range/sequential-ID/C-A-U/error-counter reconciliation;
- idempotent identical artifact re-import;
- separate staging SQLite with `runtime_promoted=0`; 
- aggregate staging diagnostics across confidence, category, orthography, source-gap reason, popularity tier and problem populations;
- LLM benchmark evaluator with confidence strata;
- benchmark-v3 explicit review gate that does not rewrite pending gold.

Durable staging contract: `docs/ENTITY_AI_PRONUNCIATION_STAGING_V1.md`.

## Acceptance interpretation

The staging audit may measure retention/selectivity at multiple confidence thresholds, but it does not prove correctness and does not preselect a promotion threshold. Model confidence is supplementary evidence only.

Benchmark-v3 remains `review_pending`. The six flagged context/homograph cases must be resolved from independent review evidence; model output must not be promoted into gold. The generated v2 control lives under `data/local/` and is intentionally not tracked, so the tracked review file alone is insufficient to reconstruct every original context/reference (notably `To`).

## Repository checks

Required pull-request validation:

```powershell
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

GitHub required check: `validate`.

Validation evidence:

- Draft PR: #112.
- GitHub Actions `validate` run 514 / run ID `35442290540` passed on Git SHA-1 `11135c8fd192eeee9ac9a6307103f193985a60c2`.
- `npm run check`: PASS.
- `npm test`: PASS — 364 tests / 364 passed / 0 failed.
- `node scripts/public-readiness-audit.mjs`: PASS.
- The PR check on the final branch head remains the canonical merge gate; documentation-only evidence commits must also receive green `validate`.

Current state: **repository CI gate passed; benchmark-v3 review still blocks merge-readiness**.

## Remaining blockers

1. complete benchmark-v3 context-gold review with actual evidence;
2. keep GitHub `validate` green on the final branch head;
3. squash-merge only after benchmark-v3 review is complete and the branch is genuinely ready.

Owner full-data runtime commands remain withheld until merge. AI staging results are not required to finish or operate the source-backed runtime path.
