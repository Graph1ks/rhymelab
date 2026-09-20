# RhymeLab Serving V1 — Identity / Dedupe Foundation

## Status

Experimental owner-local build artifact. **Not wired into the product runtime yet.**

The current canonical DE / EN / Phrase / Entity databases and accepted Generated Opt-in runtime remain authoritative until a later explicit Serving-v1 equivalence/acceptance gate promotes this database.

## Goal

Materialize one compact, deterministic local SQLite serving database from the accepted runtime inputs:

- canonical German Writer;
- canonical English Writer;
- canonical German Phrase/Mosaic;
- canonical multilingual Entity runtime;
- accepted Generated Opt-in overlays for the same four domains.

Output:

```text
data/local/rhymelab-serving-v1.sqlite
```

Incomplete work:

```text
data/local/rhymelab-serving-v1.building.sqlite
```

Build report:

```text
data/local/rhymelab-serving-v1-report.json
```

The rich source/runtime databases remain unchanged and continue to be the source of truth.

## Identity model

### Surface

One searchable spelling/phrase surface per:

```text
language + normalized surface
```

A surface may carry several roles and several real Entity references.

Example:

```text
Metallica
  roles:
    lexical
    group.music_group
    work.album

  entities:
    Q...
    Q...
```

Same-name entities are **not** semantically merged. They share one search surface while retaining separate QIDs.

### Pronunciation

Pronunciations are deduplicated per surface by:

```text
canonical phoneme identity + stress identity
```

This intentionally keeps genuine stress/pronunciation variants separate.

A pronunciation row tracks independent availability in:

- canonical/Core runtime;
- Generated opt-in runtime.

### Core authority

Policy:

```text
surface-pronunciation-core-authority-v1
```

Authority order:

1. Core word pronunciation;
2. Core phrase pronunciation;
3. Core Entity pronunciation;
4. Generated word pronunciation;
5. Generated phrase pronunciation;
6. Generated Entity pronunciation.

Generated data can fill a missing pronunciation or contribute another genuine pronunciation variant, but it cannot replace an existing Core identity.

Hard invariants:

```text
core_never_displaced_by_generated = true
identical_generated_is_absorbed_by_core = true
generated_origins_on_canonical_pronunciations = 0
canonical_pronunciations_marked_generated = 0
```

If Core and Generated provide the same Surface + phoneme/stress identity:

- one serving pronunciation is retained;
- Core owns the serving fields;
- the redundant Generated pronunciation is fully absorbed by Core;
- no Generated availability flag, Generated preferred flag, or Generated pronunciation-origin row is retained on that serving pronunciation.

The rich source/augmented databases remain the place where the historical Generated source record can be audited. Serving-v1 does not duplicate that redundant provenance onto a Core-equivalent runtime identity.

Semantic roles and Entity references are source-backed metadata, not generated pronunciation truth. Therefore a Core-equivalent pronunciation may carry roles such as `person.rapper`, `group.music_group`, or `work.album` without making the serving pronunciation Generated.

## Current Serving-v1 tables

### `surface`

Compact search identity and Core-first display/lexical metadata.

### `pronunciation`

Deduplicated pronunciation identity plus pre-existing analyzed phonetic keys where the source runtime exposes them.

### `surface_role`

Many-to-many role tags such as:

- `lexical`
- `phrase`
- `person.rapper`
- `group.music_group`
- `work.album`
- other accepted Entity taxonomy categories.

### `surface_entity`

Preserves distinct real Entity QIDs for same-name surfaces.

### `pronunciation_origin`

Aggregated provenance by:

```text
pronunciation + layer + domain + source_kind
```

The compact serving DB deliberately does not duplicate the full rich source records. Rich provenance remains in the source-of-truth databases.

### `build_stage`

Persistent resume/checkpoint state.

## Build stages

The current identity foundation runs in this deterministic order:

1. DE Core words
2. EN Core words
3. DE Core phrases
4. Core Entity pronunciations
5. DE Generated words
6. EN Generated words
7. DE Generated phrases
8. Generated Entity pronunciations
9. final invariants / SQLite quick check / ANALYZE / report / promotion

Core is deliberately materialized before Generated.

## Safety / resume behavior

Build policy:

```text
resumable-attached-source-batches-v1
```

The builder works only in:

```text
data/local/rhymelab-serving-v1.building.sqlite
```

Each source stage is processed in bounded ID batches. Every completed batch commits:

- last source ID;
- processed source-row count;
- stage timestamp.

If the process crashes, Node exits, Windows restarts, or an individual later batch fails, previous committed batches remain reusable.

### Ctrl+C / SIGTERM

The builder records the stop request, finishes the current transaction, marks the current stage paused, closes cleanly, and retains the work database.

Rerun the same build command to continue.

### Source revision protection

The work database stores a source fingerprint based on all eight input DB states plus the accepted Generated runtime fingerprints.

If any source revision changes, the builder refuses to mix revisions.

Use `--reset` only when intentionally starting a fresh incomplete work database.

`--reset` does **not** delete an already promoted Serving-v1 output.

### Generated acceptance protection

Generated source DBs are accepted only when:

- the Base-Parity report validates;
- the Generated runtime acceptance marker validates;
- the marker is bound to the current Base-Parity fingerprint;
- report output paths match the Generated DBs being ingested.

### Atomic final promotion

The current runtime is never rewired by this builder.

Only after:

- every stage completes;
- `PRAGMA quick_check` succeeds;
- Core-authority invariants succeed;
- the final report is assembled;

is the work DB renamed to:

```text
data/local/rhymelab-serving-v1.sqlite
```

If an existing Serving-v1 output exists, the builder refuses replacement unless `--replace` is explicitly supplied.

With `--replace`, the previous output is first moved to:

```text
data/local/rhymelab-serving-v1.sqlite.previous.sqlite
```

and can be restored if final promotion validation fails.

## Console progress

Every active stage prints:

- stage name;
- processed / total source rows;
- percentage;
- current rows/second;
- latest batch duration;
- estimated remaining duration.

Completed stages print the current serving surface/pronunciation totals.

## Owner commands

### Plan only

Reads all inputs and accepted Generated contracts, then reports stage sizes without building:

```powershell
npm run serving:v1:plan
```

### Build / resume

Runs all stages, automatically reusing completed checkpoints:

```powershell
npm run serving:v1:build
```

Optional larger/smaller batch size:

```powershell
npm run serving:v1:build -- --batch-size 200000
```

### Status

While an incomplete build exists:

```powershell
npm run serving:v1:status
```

After promotion the same command reports the promoted DB when no work DB remains.

### Deliberate fresh incomplete build

```powershell
npm run serving:v1:build -- --reset
```

This removes only the incomplete work DB.

### Deliberate replacement of an existing Serving-v1 output

```powershell
npm run serving:v1:build -- --replace
```

### Developer checkpoint

For controlled validation/testing, a build may stop after one completed stage:

```powershell
npm run serving:v1:build -- --pause-after-stage 04_entity_core
```

Rerun normally to continue.

## Report diagnostics

The final report includes:

- total source pronunciation rows read;
- unique serving surfaces;
- unique serving pronunciations;
- estimated pronunciation rows collapsed by dedupe;
- Core / Generated surface overlap;
- Core / Generated pronunciation overlap;
- Generated-only pronunciations;
- surfaces with multiple roles;
- surfaces shared by multiple real Entity QIDs;
- surfaces retaining multiple pronunciation identities;
- Entity links;
- aggregated pronunciation origins;
- Core-authority invariant results.

These numbers are diagnostic evidence for the next design step. They are not yet a runtime acceptance gate.

## Future runtime default

Serving-v1 itself is mode-neutral: it stores Core pronunciations plus only genuinely additional Generated pronunciation identities.

Owner product decision for the later Serving-v1 runtime switch:

- Generated pronunciation results are **enabled by default**;
- the user can explicitly disable Generated pronunciation results;
- Core-equivalent Generated pronunciations have already been absorbed and therefore never display as Generated;
- disabling Generated removes only pronunciation identities that exist solely through the Generated layer.

This target default does not change the current pre-Serving runtime contract yet and does not affect how Serving-v1 is built.

## Deliberately deferred

Serving-v1 foundation does **not** yet:

- replace the existing runtime databases;
- change Writer ranking/retrieval/scoring;
- change Generated default-OFF behavior;
- materialize the final unified inverted rhyme-key index;
- replace phrase ranking evidence lookups;
- replace runtime morphology reconstruction;
- implement Serving-v1 response equivalence;
- establish the final latency acceptance threshold.

The next phase begins only after the owner-local identity/dedupe report is reviewed.
