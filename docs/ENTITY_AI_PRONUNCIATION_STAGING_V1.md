# Entity AI Pronunciation Staging v1

Status: **EVIDENCE STAGING ONLY / NOT RUNTIME TRUTH**

## Purpose

This contract governs external LLM pronunciation evidence for unresolved English Entity names. It is intentionally separate from the source-backed Entity runtime.

The original staging tooling can represent the historical 704,989-row source-unresolved population, but the accepted forward collection policy is narrower: only unresolved English names attached to the **top 100,000 retained Entities by the accepted Entity popularity ordering** are in scope for the next AI campaign. The exact targeted row count must be measured from the owner-local database before export. The remaining long tail stays unresolved by default.

AI evidence may be collected, imported, analyzed and benchmarked locally. It must not become an accepted `entity_pronunciation` runtime row without a separate explicit promotion decision.

## Hard boundary

- Runtime remains deterministic, local and source-backed.
- `data/local/entity-ai-pronunciation-v1.sqlite` is a separate staging database.
- `runtime_promoted` defaults to `0` and the audit must report zero promoted rows.
- The accepted EN Entity runtime must keep `generated=0` for accepted/reviewed source-backed rows.
- The accepted DE Entity runtime fingerprint remains frozen.
- `AI_ID_MAP_LOCAL_ONLY.tsv` is local bridge data only. It is never runtime/user identity and must never be uploaded or committed.
- No model confidence threshold is accepted by this contract.

## Queue

Command:

```powershell
npm run entity:ai:queue
```

Default local output:

```text
data/local/entity-ai-pronunciation-queue-v1/
  MANIFEST.json
  AI_ID_MAP_LOCAL_ONLY.tsv
  inputs/
    batch_*.tsv
```

Input batch columns are exactly `id`, `name`, `ctx`, `cat`. Temporary AI IDs are sequential and separate from RhymeLab IDs.

The existing full unresolved queue format is retained for reproducibility and importer compatibility, but it is not the approved next campaign scope. A future targeted Top-100k export must use a new manifest/export identity and must not rewrite, renumber or reinterpret already-created historical batch IDs.

## Result artifact contract

`results.tsv` has exactly five columns:

```text
id	arp	q	f	alt
```

`manifest.json` must identify `inputs.zip`, the selected batch, configured start ID, complete/partial status, row counts/ranges, C/A/U counts, duplicate/missing/extra/invalid counts, next unprocessed ID for partial results, and SHA-256 of `results.tsv`.

The importer rejects:

- missing or mismatched result SHA;
- non-contiguous or out-of-range IDs;
- manifest/result row-count mismatches;
- C/A/U count mismatches;
- non-zero duplicate/missing/extra/invalid counters;
- malformed ARPAbet, merged phones, invalid stress, or invalid five-column rows;
- complete artifacts with a non-null next ID;
- partial artifacts unless `--allow-partial` is explicit.

An identical already-imported artifact is idempotent. Replacing a batch with different bytes requires explicit `--replace`.

## Import

```powershell
npm run entity:ai:import -- --artifact <result.zip>
```

The importer resolves temporary AI IDs through the local-only map, derives deterministic English phonological metadata, and writes only to the staging database.

## Audit / candidate diagnostics

```powershell
npm run entity:ai:audit
```

The audit persists aggregate evidence only, including:

- imported coverage and complete/partial batch status;
- C/A/U and alternate-pronunciation distribution;
- fixed confidence buckets;
- cumulative confidence-threshold selectivity at 99/95/90/85/80/75/70/60/50;
- Entity category distribution;
- orthography populations (multiword, non-ASCII, non-Latin, digits, punctuation, long surfaces, etc.);
- unresolved-source reason populations;
- popularity-tier populations;
- problem populations such as unknown, ambiguous, low-confidence, alternate-bearing and orthographically difficult names;
- deterministic staging fingerprint;
- `runtime_promoted_rows` safeguard.

Threshold diagnostics are **selectivity diagnostics only**. They do not establish pronunciation accuracy and do not select a runtime admission threshold.

## Benchmark evidence

`npm run entity:llm:benchmark:evaluate -- --results <tsv> --candidate <id>` evaluates compact LLM output against the existing 600-case control and reports quality by confidence strata. The current v2 control has context-gold review concerns; `proper-name-v3-review.json` remains explicit/pending until reviewed evidence is accepted.

LLM output itself must never be used to manufacture benchmark gold.

## Promotion gate

No promotion path is implemented or authorized by this contract. Any future runtime use of AI evidence requires a separate documented decision that defines reviewed evidence, quality criteria, provenance, reproducibility, rollback behavior and explicit runtime materialization. Until then, AI staging remains evidence only.
