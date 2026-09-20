# RhymeLab Serving V1 — Runtime Materialization

## Status

Phase 2 experimental owner-local artifact build. It enriches the accepted Serving-v1 identity/dedupe database with compact retrieval/runtime structures but **does not wire RhymeLab product runtime to Serving-v1 yet**.

Required predecessor:

- `data/local/rhymelab-serving-v1.sqlite`
- Serving-v1 identity report status `ok`
- Core-authority invariants accepted

## Goal

Materialize the expensive static parts of retrieval/ranking once so request-time work can become bounded indexed lookup + scoring rather than repeated reconstruction across four databases.

The enriched artifact remains:

```text
data/local/rhymelab-serving-v1.sqlite
```

There is still one final Serving database.

## Runtime structures

### Pronunciation targets

Every eligible Serving pronunciation receives one runtime target.

For pronunciation targets:

```text
target_id == pronunciation_id
```

No redundant synthetic string identifier is stored for the ~5M pronunciation population.

Phrase/Mosaic windows receive additional integer target IDs only when needed.

### Dictionary-coded unified retrieval keys

Key text is stored once:

```text
runtime_key
  key_id
  language
  channel
  key_value
```

Candidate membership is compact:

```text
runtime_key_member
  key_id
  target_id
```

The membership table is `WITHOUT ROWID`.

This avoids repeating the same potentially long phonetic key for every candidate row.

Current channels preserve existing accepted retrieval semantics:

- DE/EN exact-tail;
- multisyllable;
- vowel;
- vowel-family;
- coda;
- family+coda-class;
- DE Writer right-edge anchors;
- Entity exact/vowel/family/final-nucleus/writer anchors;
- Phrase/Mosaic exact-tail, vowel+coda, vowel, vowel-family+coda-class and final-nucleus+coda-class.

No new rhyme relation or ranking policy is introduced here.

### DE morphology

`runtime_surface_morphology` precomputes the ranking-relevant consensus of the accepted:

```text
de-attested-right-head-v4
```

For each applicable Core DE lexical surface it stores:

- resolved / unresolved / ambiguous status;
- family key;
- construction rule where unambiguous;
- source analysis count;
- stored positive evidence count;
- supported-family count.

The Writer ranking layer only needs the resolved family identity for lexical-family penalties; the rich morphology evidence remains in the source DB.

### Phrase/Mosaic runtime

The runtime copy contains:

- compact phrase identities;
- accepted Mosaic windows;
- accepted retrieval anchor features;
- Core/Generated availability;
- precomputed static ranking evidence.

Static Phrase evidence is materialized once:

- equal-weight Leipzig commonness score;
- matched-corpus count;
- occurrence/sentence totals;
- sorted unique style tags;
- surface-safety class/reasons.

Query-token overlap remains request-time because it depends on the current query.

## Build safety

This workflow follows the repository-wide long-running-job standard in `AGENTS.md`.

### Read-only plan

```powershell
npm run serving:v1:runtime:plan
```

The plan validates source revisions and reports stage sizes. It does **not** create or copy the large work DB.

### Build / resume

```powershell
npm run serving:v1:runtime:build
```

Work is performed in:

```text
data/local/rhymelab-serving-v1.runtime-building.sqlite
```

The initial Serving-v1 file copy is itself resumable by byte offset. A sidecar copy checkpoint binds the partial copy to:

- source path;
- source byte size;
- source mtime;
- Serving-v1 semantic fingerprint.

After the SQLite copy is complete, every materialization stage uses persisted SQLite checkpoints and bounded transactions.

Ordinary rerun resumes.

### Console progress

The builder prints:

- active stage;
- processed / total;
- percent;
- rows/sec;
- batch duration;
- ETA.

The initial large-file copy prints byte progress, MiB/sec and ETA.

### Ctrl+C / SIGTERM

A stop request pauses after the current safe transaction. Work remains reusable.

### Status

```powershell
npm run serving:v1:runtime:status
```

### Reset

```powershell
npm run serving:v1:runtime:build -- --reset
```

Reset deletes only incomplete runtime-materialization work/copy state. It does not delete the promoted Serving-v1 DB or source databases.

### Promotion

The existing Serving-v1 identity DB remains untouched while runtime materialization executes.

Only after:

- all stages complete;
- source inputs are revalidated unchanged;
- runtime invariants pass;
- `PRAGMA quick_check` passes;
- final report/fingerprint is assembled;

does the builder atomically swap:

```text
rhymelab-serving-v1.runtime-building.sqlite
  ->
rhymelab-serving-v1.sqlite
```

The previous identity-only Serving-v1 DB is retained as:

```text
data/local/rhymelab-serving-v1.pre-runtime.sqlite
```

The current RhymeLab product runtime remains unchanged.

## Stages

1. Serving pronunciation targets
2. DE Core retrieval keys
3. DE Generated retrieval keys
4. EN Core retrieval keys
5. EN Generated retrieval keys
6. Core Entity retrieval keys
7. Generated Entity retrieval keys
8. Core Phrase/Mosaic runtime
9. Generated Phrase/Mosaic runtime
10. DE morphology consensus
11. Phrase static ranking evidence
12. integrity / invariants / ANALYZE / report / atomic promotion

Identical Generated pronunciation identities already absorbed by Core in Phase 1 never reappear as Generated targets or Generated retrieval memberships.

## Retrieval-equivalence harness

After a successful runtime materialization:

```powershell
npm run serving:v1:runtime:equivalence
```

Output:

```text
data/local/rhymelab-serving-v1-runtime-equivalence-report.json
```

The harness is read-only. It deterministically samples accepted source retrieval keys and compares exact Serving target membership against the old indexes for:

- DE Writer right-edge;
- EN exact / multisyllable / vowel / coda;
- Entity anchor channels;
- Phrase exact-tail windows;
- Core and genuine Generated-only layers.

This is a **retrieval materialization equivalence gate**, not yet final product equivalence.

Final response/ranking equivalence remains required before any product runtime switch.

## Future runtime selection policy

Owner product decision:

- normal/default Serving runtime: Core + genuine Generated-only pronunciation identities;
- user may disable Generated: Core only;
- optional Generated-only mode remains available;
- Core-equivalent Generated pronunciations do not exist as Generated in Serving-v1 and therefore never receive a Generated badge.

## Deliberately deferred

This phase does not yet:

- change `npm start` database routing;
- remove the existing four runtime DBs;
- change rhyme scoring;
- change Writer/Phrase/Entity ranking;
- claim response/ranking equivalence;
- claim the 80–100 ms latency target.

The next phase is a Serving runtime adapter plus full semantic/ranking/latency equivalence benchmark.
