# RhymeLab Distribution Tiers

## Status

**Active packaging implementation contract.**

The read-only Master storage/population census is implemented as `npm run distribution:census`. The census from the finalized owner Master has now been reviewed and `distribution-rank-v1-language-normalized-usage-surface` is the frozen first distribution rank. The positive Lite/Standard/Full materializer is implemented behind an explicit read-only plan gate. The size ranges below remain planning budgets until the first real tier files are materialized and vacuumed.

The final distribution workflow must derive all editions reproducibly from one finalized Master/Developer database without rerunning the upstream source pipelines for every edition.

## Critical interpretation

The edition numbers are **total product-entry budgets**, not Word-only targets.

The budget unit is:

```text
1 selected lexical Word surface = 1 entry
1 selected Phrase runtime row    = 1 entry
1 selected Entity identity       = 1 entry
```

Pronunciations, aliases/names, phonetic analyses, retrieval anchors, phrase windows,
runtime keys and indexes are relational closure/storage and do **not** consume extra
product-entry quota.

Therefore:

```text
Lite     =  50,000 total = Words only
Standard = 250,000 total = majority Words + Phrases + Top 1,000 retrievable Entities/category
Full     = 400,000 total = majority Words + Phrases + Top 5,000 retrievable Entities/category
```

Words are always the majority and fill the remaining budget after the edition's
Phrase and Entity populations have been selected.

## Edition contract

| Edition | Total product entries | Composition |
| --- | ---: | --- |
| **Lite** | **50,000** | **50k DE/EN Words** |
| **Standard** | **250,000** | majority DE/EN Words + all accepted Core Phrases + Top **1k** retrievable Entities per active category |
| **Full** | **400,000** | majority DE/EN Words + all accepted Phrases + Top **5k** retrievable Entities per active category |
| **Master / Developer** | complete development population | all build/runtime/provenance material required by development; not a shipping-size target |

### Lite

Lite is intentionally the compact vocabulary/rhyme edition.

```text
LITE = 50,000 TOTAL
└── 50,000 DE/EN Words

NO
├── phrases
├── phrase mosaic windows
├── entities
├── entity anchors
├── Generated-only Word surfaces
└── Markov product capability
```

### Standard

Standard is the balanced default edition.

Selection order:

```text
STANDARD = 250,000 TOTAL
1. all accepted Core Phrase rows
2. Top 1,000 retrievable Entity identities per active category
   (union/deduplicate multi-category entities)
3. highest-ranked DE/EN Core Word surfaces fill the remainder
```

With the current Master census there are **90,089 Core Phrase rows** and the frozen
taxonomy has **13 active Entity categories**. Entity union size is at most 13,000
and normally lower because entities can belong to multiple categories or a category
can contain fewer than 1,000 retrievable identities.

Therefore the current Standard Word budget is bounded by:

```text
250,000 - 90,089 - unique(top 1k/category)
= 159,911 - Entity union

Entity union <= 13,000
Word count >= 146,911
Word share >= 58.76%
```

The exact Word count is resolved by `distribution:plan` against the Master.

### Full

Full is the largest shipping database, still constrained to a 400k total product-entry budget.

Selection order:

```text
FULL = 400,000 TOTAL
1. all accepted Phrase rows (Core + accepted Generated availability)
2. Top 5,000 retrievable Entity identities per active category
   (union/deduplicate multi-category entities)
3. highest-ranked DE/EN Core Word surfaces fill the remainder
```

The current Master contains **98,058 total Phrase rows** and 13 active Entity categories.
The Entity union is therefore at most 65,000 and normally lower.

```text
400,000 - 98,058 - unique(top 5k/category)
= 301,942 - Entity union

Entity union <= 65,000
Word count >= 236,942
Word share >= 59.24%
```

There is **no additive 200k Generated-Word quota**. Full may retain accepted
Generated pronunciation closure for already selected product entries, but
Generated-only Word surfaces do not consume a separate shipping population target.

Markov remains frozen/direct-demo-only and is not counted as a database product entry
or exposed as a shipping capability by this distribution contract.

## Superset invariant

The editions are nested product supersets:

```text
LITE ⊂ STANDARD ⊂ FULL ⊂ MASTER
```

Hard requirements:

- the first 50k Word surfaces retained by Lite remain identical in Standard and Full;
- all Standard Word surfaces remain in Full;
- Standard Core Phrase rows remain in Full;
- every Standard Top-1k/category Entity membership is contained in Full's Top-5k/category cut;
- Phrase and Entity behavior for overlapping retained source data remains semantically identical;
- one canonical Word ranking/selection policy is used for all editions.

The Word cut is dynamic because Standard and Full are **total-budget** editions:

```text
Lite Words       = 50,000
Standard Words   = 250,000 - Core Phrases - unique Top-1k/category Entities
Full Words       = 400,000 - all Phrases  - unique Top-5k/category Entities
```

## Distribution rank v1

Policy id:

```text
distribution-rank-v1-language-normalized-usage-surface
```

The Word portion of each tier counts **lexical product surfaces**, not pronunciation rows. Once a lexical surface is selected, all eligible pronunciation identities required by the selected edition are retained as relational closure.

This avoids cutting alternate accepted pronunciations merely to hit an arbitrary row count.

Ranking is deterministic:

1. select DE and EN lexical surfaces with an eligible Word pronunciation in the requested layer;
2. within each language, surfaces with a real `surface.usage_rank` sort before fallback-only surfaces;
3. ranked surfaces sort by their language-local usage rank;
4. fallback surfaces use the accepted language-local evidence already materialized in the Product layer (`usage_score` for DE, `en_wordfreq_zipf` for EN), then historical state, usage count and stable lexical identity;
5. convert each language/class ordering to a language-local ordinal percentile;
6. merge DE and EN by that normalized percentile with stable language/identity tie-breaks.

This deliberately does **not** pretend that the raw DE and EN rank numbers share one numeric scale.

All ranked DE/EN surfaces are therefore consumed before unranked fallback surfaces. The computed Standard/Full Word remainder determines where that common Word ranking is cut.

There is no separate Generated-only Word-surface quota. Full may retain Generated pronunciation closure attached to selected entries where the accepted Serving availability policy permits it.

## Entity distribution policy

The distribution builder does not invent a new Entity popularity model. It starts
from the owner-accepted/frozen Phase 12A2 Hybrid-v2 population:

```text
category-relative-popularity-hybrid-v2-geometric-missing-evidence-candidate
distinct retained entities: 1,077,644
```

The active frozen taxonomy currently contains **13 categories**.

Shipping cuts are category-relative:

```text
Standard: Top 1,000 retrievable retained identities per category
Full:     Top 5,000 retrievable retained identities per category
```

For each edition, candidates are ordered by the already materialized category rank
with deterministic score/identity tie-breaks. Only identities with at least one
pronunciation reachable in the edition are eligible. The resulting memberships are
then unioned by `entity_id`, so an actor/musician counts once against the total
product-entry budget even if it is selected in both categories.

Categories with fewer than the requested quota contribute all retrievable retained
identities they have. The builder never pads a category with rejected entities.

Any change to the underlying Hybrid-v2 popularity/cut policy remains a separate
Entity candidate revision and owner-acceptance task.

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
    "markov": false
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

Before fixing final size gates or Entity retention policy, run the implemented storage census against the finalized Master database:

```powershell
npm run distribution:census
```

Machine-readable output is written to:

```text
data/local/distribution/distribution-census-v1.json
```

Optional explicit source/output paths:

```powershell
npm run distribution:census -- --db data/local/rhymelab-serving-v1.sqlite --output data/local/distribution/distribution-census-v1.json
```

The census is read-only and fails closed unless the Serving-v1 runtime and Product adapter are both complete. It deliberately reports the tier projection as blocked until the cross-language distribution rank is versioned; it does not silently compare DE and EN native usage ranks as though they were one common scale.

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
- Markov remains outside the shipping database capability contract while its demo is frozen/unlinked;
- distribution filtering does not change accepted scorer/ranking semantics.

Each resulting database should also be run through the Serving-v1 report benchmark so edition size and latency can be compared using the same workload.

## Materialization workflow

The implementation order is:

```text
1. finalize/freeze Master runtime — **DONE**
2. distribution storage census / analyzer — **DONE**
3. review real Master populations/storage — **DONE**
4. freeze canonical distribution rank v1 — **DONE**
5. run `npm run distribution:plan` for exact edition selection/closure counts
6. positive materialization of Lite / Standard / Full
7. integrity + nesting/semantic acceptance
8. `VACUUM` + exact file/storage report
9. Serving performance benchmark per edition
```

`distribution:census` is implemented and the first rank policy is frozen. Use `npm run distribution:plan` before any build. Materialization commands are `distribution:build:lite`, `distribution:build:standard`, `distribution:build:full`, or `distribution:build` for all three. Existing outputs are never replaced without explicit `--replace`.

## Owner commands

Read-only plan:

```powershell
npm run distribution:plan
```

Build all three editions:

```powershell
npm run distribution:build
```

Or build individually:

```powershell
npm run distribution:build:lite
npm run distribution:build:standard
npm run distribution:build:full
```

Status:

```powershell
npm run distribution:status
```

Safe reset of incomplete work only:

```powershell
npm run distribution:build -- --reset
```

Intentional replacement of existing finished tier files:

```powershell
npm run distribution:build -- --replace
```

Outputs:

```text
data/local/distribution/rhymelab-serving-v1-lite.sqlite
data/local/distribution/rhymelab-serving-v1-standard.sqlite
data/local/distribution/rhymelab-serving-v1-full.sqlite
```

The builder creates positive materializations from an empty schema, keeps the Master read-only by policy, copies full selected relational closure, builds explicit secondary indexes after bulk copy, checks foreign keys and `PRAGMA quick_check`, runs `ANALYZE` / `PRAGMA optimize`, vacuums, writes a report, and promotes the completed work file atomically.

## Non-goals

The distribution work must not:

- mutate the Master database while creating editions;
- rerun all source pipelines independently for each edition;
- maintain three unrelated schemas or ranking policies;
- reinterpret tier word counts as Entity counts;
- pre-render a large corpus of Markov-generated phrases;
- sacrifice accepted overlapping Core semantics merely to hit a file-size target.
