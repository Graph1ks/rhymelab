# Phase 12C — Entity Runtime + AI Pronunciation Staging Handover

Status: **IMPLEMENTATION IN PROGRESS / NOT MERGE-READY**

Branch:

```text
phase12c-entity-runtime-ai-staging
```

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
  - source-backed ready: 710,561 / 50.20%
  - unresolved after source expansion: 704,989 / 49.80%
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

Do **not** give the owner a full-data runtime command until the branch is internally reviewed, documented, tested and CI-clean.

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

Implemented a deterministic local export of the **704,989 unresolved English Entity name rows**.

Important design:

- temporary sequential AI IDs are separate from all RhymeLab runtime/database identities;
- queue ordering prioritizes preferred and popular Entity names first;
- batches are split at 10,000 rows;
- local map preserves the bridge back to RhymeLab IDs;
- the local ID map must never be treated as user-facing/runtime identity.

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

The owner is currently running the LLM annotation campaign externally/in parallel. Do not assume any particular batch is complete unless the owner supplies the result artifact.

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
- durable contracts now live in `docs/ENTITY_AI_PRONUNCIATION_STAGING_V1.md` and `docs/PHASE_12C_ACCEPTANCE.md`.

## What is NOT finished

Do not call this work accepted or merge-ready yet.

Remaining work:

1. complete benchmark-v3 context-gold review evidence against the generated local v2 control; do not invent replacement gold;
2. keep draft PR #112's required `validate` check green on the final head;
3. squash-merge only after benchmark-v3 review is complete and the branch is genuinely ready;
4. only after merge give the owner full-data runtime build commands.

The tracked repository intentionally does not contain `data/local/entity-g2p-proper-name-benchmark-v2.json`. The review file therefore cannot by itself prove the original context/reference for every pending case (notably `To`). Closing that review requires the local generated control/review evidence rather than guessing from the surface string.

## Immediate next-thread starting procedure

A new thread should:

1. switch context to branch `phase12c-entity-runtime-ai-staging`;
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
9. do not wait for all external AI batches before finishing the source-backed runtime path;
10. never promote AI staging rows without a separate explicit acceptance gate.

## Hard boundaries for the next thread

- GitHub `main` remains authoritative for accepted project state; this branch is a candidate until merged.
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
