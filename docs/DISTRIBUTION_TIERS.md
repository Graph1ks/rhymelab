# RhymeLab Distribution Tiers

## Status

**Design contract / planned packaging architecture.**

This document defines the intended shipping tiers derived from the final Serving/Master database. It does **not** mean the distribution builder already exists, and the size ranges below are planning budgets rather than acceptance gates.

The final distribution workflow must derive all editions reproducibly from one finalized Master/Developer database without rerunning the upstream source pipelines for every edition.

## Critical interpretation

The tier numbers describe the retained **Core / Generated word-pronunciation population**, not Entity counts and not raw SQLite row counts.

Do not reinterpret:

```text
50k / 250k / 400k / 200k
```

as Entity population sizes.

Entity inclusion is a feature of Standard and Full, but its final retention policy/population is a separate distribution decision to be measured from the real Master database.

## Edition contract

| Edition | Word / pronunciation population | Features |
| --- | --- | --- |
| **Lite** | **50k Core** | DE/EN Words only |
| **Standard** | **250k Core** | Words + complete Phrase feature + Entity feature |
| **Full** | **400k Core + 200k Generated** | Words + Phrases + Entities + Generated layer + Markov live generator |
| **Master / Developer** | complete development population | all build/runtime/provenance material required by development; not a shipping-size target |

### Lite

Lite is intentionally the compact vocabulary/rhyme edition.

```text
LITE
├── DE words
├── EN words
├── pronunciations
├── analyses
└── word retrieval indexes

NO
├── phrases
├── phrase mosaic windows
├── entities
├── entity anchors
├── generated layer
└── Markov generator
```

### Standard

Standard adds the full non-generative songwriting/search feature set.

```text
STANDARD
├── 250k Core word/pronunciation population
├── DE + EN Words
├── Phrase / Mosaic runtime
└── Entity runtime

NO
├── Generated word layer
└── Markov generator
```

The `250k` number applies to the Core word/pronunciation population. It does **not** specify that Standard contains 250k Entities.

### Full

Full is the complete shipping edition.

```text
FULL
├── 400k Core word/pronunciation population
├── 200k Generated word/pronunciation population
├── DE + EN Words
├── Phrase / Mosaic runtime
├── Entity runtime
├── Generated layer
└── Markov live generator
```

The Generated population is additive product coverage. Core-equivalent Generated pronunciation identities remain subject to the existing Serving identity/absorption rules rather than being counted as duplicate product value.

## Markov contract

Markov is a **live phrase generator**, not a pre-rendered phrase database.

The Full edition should ship the compact model state required for generation, for example:

```text
vocabulary
+ n-gram / transition state
+ counts / weights
+ start/end-state metadata
```

It must not materialize millions of generated phrases ahead of time.

Generated token sequences should reuse the existing lexical/pronunciation/phrase phonology path:

```text
Markov text
    ↓
token lookup
    ↓
best available pronunciation per token
    ↓
phrase phonology
    ↓
mosaic / rhyme scoring
```

This avoids creating a second large phonological store solely for Markov output.

## Superset invariant

The editions are nested product supersets:

```text
LITE ⊂ STANDARD ⊂ FULL ⊂ MASTER
```

Hard requirements:

- every Core word/pronunciation retained by Lite is retained identically by Standard and Full;
- every Core word/pronunciation retained by Standard is retained identically by Full;
- Phrase and Entity behavior present in Standard must remain semantically identical in Full for the same retained source data;
- Full may add Generated and Markov behavior without changing the meaning/ranking of overlapping Core data;
- one canonical ranking/selection policy is used for all edition cuts rather than separate per-edition ranking algorithms.

A planned representation is:

```text
Core distribution rank
1 ..  50,000   → Lite + Standard + Full
1 .. 250,000   → Standard + Full
1 .. 400,000   → Full

Generated distribution rank
1 .. 200,000   → Full only
```

The exact ranking policy must be versioned and deterministic before the builder is accepted.

## Schema and capability contract

All editions should belong to the same Serving schema family and runtime codebase.

Feature availability must be explicit rather than inferred from file size or table accidents. Each distribution should expose an edition/capability manifest equivalent to:

### Lite

```json
{
  "edition": "lite",
  "features": {
    "words_de": true,
    "words_en": true,
    "phrases": false,
    "entities": false,
    "generated": false,
    "markov": false
  }
}
```

### Standard

```json
{
  "edition": "standard",
  "features": {
    "words_de": true,
    "words_en": true,
    "phrases": true,
    "entities": true,
    "generated": false,
    "markov": false
  }
}
```

### Full

```json
{
  "edition": "full",
  "features": {
    "words_de": true,
    "words_en": true,
    "phrases": true,
    "entities": true,
    "generated": true,
    "markov": true
  }
}
```

Whether unavailable feature tables are omitted or present empty is an implementation detail. The runtime must rely on explicit capabilities and the accepted schema/version contract, not on ad-hoc table probing.

## Build architecture

Do **not** rebuild the upstream linguistic/source pipelines three times.

Target architecture:

```text
FINAL MASTER / DEVELOPER DB
          │
          ▼
distribution analyzer
          │
          ├── canonical Core rank
          ├── canonical Generated rank
          ├── feature/closure census
          └── projected storage report
          │
          ▼
distribution builder
          │
          ├── Lite
          ├── Standard
          └── Full
```

The Master database is treated as read-only input.

### Positive materialization

Do not copy the full Master DB and delete most rows.

Preferred process:

1. create an empty target schema;
2. select the edition population;
3. copy the complete relational/runtime closure of the selected population;
4. create large secondary indexes after bulk copy;
5. run integrity checks;
6. `ANALYZE`;
7. `PRAGMA optimize`;
8. `VACUUM`;
9. measure final storage with `dbstat`.

This avoids carrying free pages and makes the final distribution size representative of the actual shipped dataset.

## Relational closure

A distribution cut must preserve every dependent row required by the retained product identities.

For Entities this includes, where applicable:

```text
entity
→ entity_category
→ entity_name
→ surface
→ pronunciation
→ runtime_entity_pronunciation
→ runtime_entity_analysis
→ runtime_entity_anchor_occurrence
→ runtime_entity_anchor_ranked
→ runtime_entity_writer_anchor
```

The builder must also preserve/prune shared Serving structures needed by surviving lexical, Phrase and Entity roles, including relevant Surface/Pronunciation roles and runtime key/member/target structures.

A valid tier is not merely a smaller set of business rows. It must remain a complete and internally consistent hotpath database.

## Storage census before builder implementation

Before fixing final size gates or Entity retention policy, run a storage census against the finalized Master database.

The analyzer should report at least:

```text
object / table / index             bytes
----------------------------------------
surface
pronunciation
runtime_de_*
runtime_en_*
runtime_phrase_*
runtime_entity_*
indexes
other

logical groups:
Core Words
Generated Words
Phrases
Entities
Indexes
Other
```

Markov model storage is reported separately from the Serving phrase population.

The analyzer should also calculate closure row counts and projected sizes for Lite, Standard and Full.

`dbstat` can report exact storage usage of the current Master objects, but projected tier file sizes remain estimates until the target B-trees have actually been materialized and vacuumed.

## Initial size budgets

These are **planning expectations**, not frozen acceptance gates:

| Edition | Initial expectation |
| --- | ---: |
| **Lite** | roughly **100–250 MB** |
| **Standard** | roughly **2–4 GB** |
| **Full** | roughly **3–6 GB** with Markov treated as a compact live model |
| **Master / Developer** | current planning reference around **20 GB** |

The final budgets must be revised from the real storage census and the first materialized editions.

The dominant uncertainty is expected to be Phrase/Entity closure and indexes, not merely the additional word count.

## Distribution acceptance

Every built edition must pass structural and semantic verification.

Minimum structural checks:

```text
PRAGMA quick_check               PASS
PRAGMA foreign_key_check         0 violations
runtime/product state            available
dangling selected references     0
excluded-population leakage      0
edition manifest                 valid
```

Required nesting checks:

```text
Lite Core IDs      ⊂ Standard Core IDs
Standard Core IDs  ⊂ Full Core IDs
```

Semantic checks should verify:

- overlapping Word results/ranking are identical across Lite, Standard and Full;
- Phrase/Entity results in Standard are identical to Full for the same retained non-Generated data;
- Lite cleanly reports Phrase/Entity capability as unavailable rather than failing;
- Generated-only behavior exists only where the edition declares it;
- Markov exists only where the edition declares it;
- distribution filtering does not change accepted scorer/ranking semantics.

Each resulting database should also be run through the Serving-v1 report benchmark so edition size and latency can be compared using the same workload.

## Planned workflow

The intended implementation order is:

```text
1. finalize/freeze Master runtime
2. distribution storage census / analyzer
3. review projected populations + sizes
4. canonical distribution rank
5. one-pass selection / closure computation
6. positive materialization of Lite / Standard / Full
7. integrity + semantic acceptance
8. VACUUM + exact dbstat report
9. Serving performance benchmark per edition
```

Possible future command names are intentionally **not** repository promises until implemented. Do not document planned commands as if they already exist.

## Non-goals

The distribution work must not:

- mutate the Master database while creating editions;
- rerun all source pipelines independently for each edition;
- maintain three unrelated schemas or ranking policies;
- reinterpret tier word counts as Entity counts;
- pre-render a large corpus of Markov-generated phrases;
- sacrifice accepted overlapping Core semantics merely to hit a file-size target.
