# Phase 12C — Entity Runtime + AI Pronunciation Staging Handover

Status: **SOURCE-BACKED ACCEPTED / MERGED TO MAIN**

Historical implementation branch:

```text
phase12c-entity-runtime-ai-staging
```

Accepted source-backed implementation was squash-merged to `main` via PR #112 at commit `e0ddbfac7cdf7229a7a3049c1426c6fb70783cdf`.

Base when this workstream started (Git SHA-1):

```text
main 963e1571794b1fbac07a48ae03d2297ff04e00f7
```

This document is the first read for a new thread continuing the current Phase 12C branch. Repository state on this branch is authoritative over chat history.

## Purpose

Phase 12C is being split into two independent tracks:

1. ship the already accepted **source-backed English Entity pronunciation/runtime path**;
2. collect ChatGPT/LLM pronunciation annotations for the remaining unresolved English Entity names into a strictly isolated **local evidence/staging layer**.

The second track must never silently become runtime truth. AI evidence may be evaluated later, but runtime promotion requires an explicit acceptance decision.

## Frozen baselines that must remain intact

Do not regress or reopen these without concrete evidence:

- accepted DE Entity runtime fingerprint:
  `38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3`
- accepted English Writer product remains frozen;
- accepted source expansion:
  - English Entity names: 1,415,550
  - source-resolution candidates: 710,561 / 50.20%
  - unresolved after source expansion: 704,989 / 49.80%
  - accepted runtime-analyzable full-data baseline: 710,500 / 50.19%
  - accepted runtime unresolved: 705,050 / 49.81%
- MFA generated-G2P runtime fallback: rejected;
- forced-neural g2p-en runtime fallback: rejected;
- generated pronunciation rows must remain **zero** in the source-backed Entity runtime unless a later explicit acceptance changes that boundary.

The old decision document `docs/ENTITY_G2P_DECISION_V1.md` remains historically correct for MFA/g2p-en. The current branch adds a separate LLM evidence experiment; it does not reinterpret those systems as accepted.

## What is already implemented on this branch

### 1. Source-backed multilingual Entity runtime

Implemented:

- source-backed en-US Entity pronunciation materialization alongside the frozen DE runtime;
- English Entity phonology analysis;
- English Entity rhyme anchors;
- preservation check for the accepted DE Entity runtime fingerprint;
- explicit assertion that accepted English Entity runtime rows are source-backed and `generated=0`;
- multilingual runtime report + verifier.

Primary files:

```text
scripts/entity-english-runtime-core.mjs
scripts/materialize-entity-multilingual-runtime.mjs
scripts/verify-entity-multilingual-runtime.mjs
scripts/entity-pronunciation-core.mjs
scripts/materialize-entity-pronunciations.mjs
```

Commands:

```powershell
npm run entity:runtime:multilingual
npm run entity:runtime:multilingual:verify
```

The branch now provides one reviewed owner gate for the full local data contract:

```powershell
npm run entity:phase12c:owner
```

Use that consolidated gate rather than running full-data materialization steps ad hoc.

### 2. Unified Writer Entity channel

Implemented:

- multilingual Entity search path for DE + EN;
- Entity channel in the unified Writer;
- dedicated `Entities` UI scope;
- English Entity pronunciation/runtime support in the Entity writer;
- RhymePad now uses the already accepted English Writer instead of the obsolete “EN pending” fallback.

Primary files:

```text
src/entity-writer-runtime.mjs
src/unified-writer-search.mjs
src/ui/app.js
src/ui/index.html
src/ui/styles.css
src/pad/app.js
```

The DE Writer, German Phrase/Mosaic behavior and accepted English single-word Writer are frozen controls. New Entity integration must not silently retune them.

### 3. Local AI pronunciation queue

Implemented historical tooling for a deterministic export of the **704,989 source-unresolved English Entity name rows**.

That full-population queue is no longer the planned collection campaign. The accepted forward policy is:

- consider only the **top 100,000 retained Entities** under the accepted Entity popularity ordering;
- within that population, target only English names that still lack a runtime-valid pronunciation;
- analyzer-rejected source candidates are eligible if their Entity is inside the same top-100k population;
- measure the exact target count locally before generating new batches;
- leave the long tail unresolved by default.

Important design:

- temporary sequential AI IDs are separate from all RhymeLab runtime/database identities;
- historical queue artifacts remain immutable evidence and are not renumbered;
- any new Top-100k campaign must use a new manifest/export identity;
- local maps preserve the bridge back to RhymeLab IDs;
- local ID maps must never be treated as user-facing/runtime identity.

Primary file:

```text
scripts/export-entity-ai-pronunciation-batches.mjs
```

Command:

```powershell
npm run entity:ai:queue
```

Expected conceptual output:

```text
data/local/entity-ai-pronunciation-queue-v1/
  MANIFEST.json
  AI_ID_MAP_LOCAL_ONLY.tsv
  inputs/
    batch_0001_0000001-0010000.tsv
    ...
```

Do not continue a blanket 704,989-row annotation campaign. Future LLM pronunciation collection is limited to the unresolved portion of the accepted Top-100k Entity population unless the owner explicitly changes that policy.

### 4. AI result importer + isolated staging DB

Implemented:

- ZIP/result import;
- manifest checks;
- result SHA verification;
- local AI-ID to Entity/name mapping;
- strict ARPAbet syntax validation;
- explicit protection against merged-phone mistakes such as `MIY1`;
- C/A/U decision handling;
- optional alternate ARPAbet;
- partial and complete batch support;
- deterministic ARPAbet analysis;
- derived IPA / canonical phones / syllable count / stress / primary stress / rhyme tail / exact key;
- separate staging database;
- no automatic runtime promotion.

Primary files:

```text
scripts/entity-ai-pronunciation-core.mjs
scripts/import-entity-ai-pronunciation-result.mjs
scripts/audit-entity-ai-pronunciation.mjs
tests/entity-ai-pronunciation.test.mjs
```

Commands:

```powershell
npm run entity:ai:import -- <result-or-zip arguments>
npm run entity:ai:audit
```

Local staging target:

```text
data/local/entity-ai-pronunciation-v1.sqlite
```

Critical invariant:

```text
AI staging != runtime truth
runtime_promoted must remain 0
```

The audit records coverage, C/A/U distribution, confidence buckets, categories, imported batch ranges and a deterministic staging fingerprint.

### 5. ARPAbet analysis edge case already fixed

A late branch fix corrected the validation/analyzer contract for multiword names:

- a complete non-unknown pronunciation must contain primary stress somewhere;
- individual function words inside a multiword name may legitimately contain only unstressed vowels, e.g. `of` / `the` with `AH0`;
- do not incorrectly require every pipe-delimited word to contain stress `1`.

Keep this regression covered.

### 6. LLM benchmark evaluator

Implemented an evaluator for compact LLM result TSVs against the existing 600-case proper-name control.

Primary file:

```text
scripts/evaluate-entity-llm-benchmark.mjs
```

Command:

```powershell
npm run entity:llm:benchmark:evaluate -- --results <tsv> --candidate <id>
```

It reports:

- exact canonical phones;
- exact stressed rhyme tail;
- syllable count;
- stress pattern;
- primary-stress position;
- mean RhymeLab rhyme score;
- confidence threshold strata;
- C/A status quality;
- missing / invalid rows.

### 7. Benchmark-v3 review gate

The current 600-case v2 benchmark contains context/homograph gold labels that are suspicious for the exact Entity context being evaluated.

Observed examples from the owner benchmark session include:

```text
Side    context: The Dark Side of the Moon
Nice    context: The Nice Guys
Worms   context: the game Worms
To      title-context function word
Mobile  context: T-Mobile
Kerr    context: Deborah Kerr
```

Do **not** silently replace these labels.

Implemented instead:

```text
benchmarks/entity-g2p/proper-name-v3-review.json
scripts/build-entity-g2p-benchmark-v3.mjs
```

Command:

```powershell
npm run entity:g2p:benchmark:v3
```

The v3 builder:

- preserves v2 untouched;
- applies only explicitly accepted reviewed replacements;
- leaves unresolved review candidates pending;
- refuses to present a pending draft as a prepared/accepted benchmark;
- never uses LLM model output itself as gold.

The review file still requires explicit evidence/review completion before benchmark-v3 can become authoritative.

## Owner-session LLM benchmark evidence

These results were produced during the owner session before this handover. They are useful engineering evidence but should be reproduced/persisted before being treated as repository acceptance evidence.

### ChatGPT Instant

```text
evaluated                 600 / 600
invalid                     0
exact phones              82.33%
exact stressed tail       79.67%
syllable count            97.50%
stress pattern            88.83%
primary stress            97.50%
mean rhyme score        ~0.947136
```

### ChatGPT Medium

```text
evaluated                 600 / 600
invalid                     0
exact phones              82.33%
exact stressed tail       79.67%
syllable count            97.50%
stress pattern            88.67%
primary stress            97.67%
mean rhyme score        ~0.946595
```

### ChatGPT High

```text
evaluated                 599 / 600
invalid                     1
exact phones              81.30%
exact stressed tail       78.96%
syllable count            96.99%
stress pattern            90.48%
primary stress            97.33%
mean rhyme score        ~0.942839
```

High's invalid row was an ARPAbet formatting defect of the `MIY1` class, which motivated/validated the strict importer protection.

Engineering interpretation from the session:

- LLM-only pronunciation materially outperformed MFA/g2p-en on the current v2 control;
- Instant and Medium were effectively tied;
- more reasoning did not improve exact-tail quality;
- model-provided confidence is not yet accepted as a runtime admission signal;
- the v2 gold itself must be repaired/context-reviewed before final LLM acceptance conclusions.

Do not convert these observations into automatic promotion thresholds.

## Current external AI annotation campaign

The owner has prepared ChatGPT Project-source `inputs.zip` containing the 10k TSV batches.

The annotation system instruction:

- selects one batch by configured start ID;
- works internally in 1,000-row chunks;
- pronunciation decisions must be LLM-only;
- no web, CMUdict, G2P, phonemizer, external lookup or pronunciation tool;
- local code is allowed only for file handling / bookkeeping / syntax validation / ZIP creation;
- compact output is:
  `id<TAB>arp<TAB>q<TAB>f<TAB>alt`
- multiword boundaries use ` | `;
- result is returned as a ZIP with `results.tsv` + `manifest.json`.

The campaign is asynchronous to repository development. The repository must remain functional without any AI batch result.

## New npm commands currently present on the branch

```text
entity:runtime:multilingual
entity:runtime:multilingual:verify
entity:ai:queue
entity:ai:import
entity:ai:audit
entity:llm:benchmark:evaluate
entity:g2p:benchmark:v3
```

Review their exact CLI arguments in `package.json` and the corresponding scripts before giving owner commands.

## Current branch delta

At handover time the branch is approximately 22 commits ahead of `main` and includes the implementation files above plus UI/runtime integration.

This branch has **not** completed the final documentation/acceptance/CI gate.

## Continuation progress after this handover

The repository acceptance pass subsequently tightened the AI staging boundary:

- result manifests now require a valid `results.tsv` SHA-256;
- complete/partial batch ranges, sequential IDs, C/A/U counts and zero-error counters are cross-checked against the actual result rows;
- identical result re-imports are idempotent instead of falling through to a duplicate batch insert;
- staging audit now persists threshold selectivity, category, orthography, unresolved-reason, popularity-tier and problem-population aggregates;
- no runtime promotion threshold is selected by those diagnostics;
- durable contracts now live in `docs/ENTITY_AI_PRONUNCIATION_STAGING_V1.md` and `docs/PHASE_12C_ACCEPTANCE.md`;
- Entity ranking now uses guarded 0.02 phonetic neighborhoods before prominence, with syllable distance preserved ahead of popularity;
- Entity result diversity deduplicates QIDs and caps repeated normalized surfaces;
- Entity category metadata is loaded in batches instead of one SQL query per candidate;
- `npm run entity:phase12c:owner` now materializes, verifies and evaluates the full owner-local source-backed runtime and emits one compact acceptance report.

## Accepted full-data checkpoint — 2026-09-19

The consolidated owner gate is **PASS** across materialization, multilingual verification and Entity Writer acceptance.

Accepted evidence:

- EN Entity names considered: 1,415,550;
- EN runtime-ready/analyzed: 710,500;
- EN unresolved: 705,050;
- EN rhyme anchors: 3,552,500;
- EN runtime fingerprint: `3f2c520ce99868eda81991e6247c6c93bdf8c78f7805d7ceef2cc2ebd85bb6d8`;
- DE fingerprint preserved exactly;
- generated G2P used: false;
- LLM annotation used: false;
- AI staging runtime promoted: false;
- DE/EN Entity query coverage: 100% resolved and 100% nonempty in the acceptance plan;
- ranking policy `entity-writer-ranking-v2-phonetic-band-prominence-v1` accepted and repeatable;
- Writer semantic fingerprint: `76ac9a32e62fd7b253515569294599012010e9be758db24227a910d893141ae7`.

The earlier 710,561 figure remains source-resolution evidence, not the accepted runtime-ready count. Sixty-one source-backed candidates do not satisfy the runtime analyzer and therefore remain unresolved.

Measured Entity Writer latency is still follow-up work: the owner acceptance sample observed approximately 384–403 ms p50 and 1.15–1.22 s p95. Do not describe Phase 12C as having met the separate ~100 ms product latency target.

Source-backed repository finalization is complete: PR #112 was squash-merged to `main`. No source-backed Phase 12C merge blocker remains.

Benchmark-v3 context-gold review is still required before AI pronunciation evidence can be accepted, but it does not block the independent source-backed runtime merge. The tracked repository intentionally does not contain `data/local/entity-g2p-proper-name-benchmark-v2.json`; do not guess replacement gold from the surface string.

Post-merge AI policy: do not spend annotation effort on the full long tail. Build a fresh targeted export for runtime-unresolved English names belonging to the accepted Top-100k Entity population, preserving historical bulk batches only as reproducible evidence.

## Immediate next-thread starting procedure

A new thread should:

1. start from current `main`; treat `phase12c-entity-runtime-ai-staging` as historical implementation context only;
2. read this document;
3. read current branch versions of:
   - `AGENTS.md`
   - `docs/HANDOVER.md`
   - `PROJECT_STATE.json`
   - `STATUS.md`
   - `docs/ENTITY_G2P_DECISION_V1.md`
4. compare branch against current `main`;
5. inspect the new scripts/tests listed above;
6. continue from the unfinished acceptance/docs/CI work;
7. do not redo the MFA/g2p-en campaign;
8. do not ask the owner to rerun already accepted source acquisition;
9. run the consolidated local owner gate when full-data evidence is requested; do not wait for external AI batches;
10. benchmark-v3 review blocks AI evidence acceptance, not source-backed runtime acceptance;
11. never promote AI staging rows without a separate explicit acceptance gate.

## Hard boundaries for the next thread

- GitHub `main` is authoritative for the accepted Phase 12C source-backed state; the old Phase 12C branch is historical.
- Local bulk data and AI results stay gitignored.
- Do not commit generated 700k annotation data.
- Do not upload or expose `AI_ID_MAP_LOCAL_ONLY.tsv`.
- AI results are external-model reference evidence until explicitly accepted.
- Source-backed Entity runtime must work independently of AI staging.
- DE Entity fingerprint must remain unchanged.
- English accepted runtime must contain no generated rows.
- Do not reintroduce hosted/network inference into runtime.
- Do not tune frozen German Writer/Phrase or accepted English Writer to accommodate Entity work.
- Do not claim benchmark-v3 gold repair complete while review rows remain pending.
