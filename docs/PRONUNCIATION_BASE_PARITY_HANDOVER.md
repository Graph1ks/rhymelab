# Pronunciation Base-Parity Owner-Run Handover

## Scope

This handover is the authoritative continuation point for the completed Pronunciation Backfill V2 and the current **Generated Pronunciation Base-Parity V1** owner materialization.

Read first:

- `docs/PRONUNCIATION_BASE_PARITY_V1.md`
- `docs/PRONUNCIATION_BACKFILL_V2.md`
- `STATUS.md`

Current accepted implementation landed via PR #145:

`574e7f9821606281c111b117e78239a596f8351e`

Required CI job remains:

`validate`

## Owner decision

Generated pronunciation rows are:

- second-class because the pronunciation is generated rather than source-attested;
- excluded from default search;
- eligible only behind a future explicit user checkbox/opt-in;
- **otherwise required to be structurally and functionally equal to the regular base dataset for the corresponding domain**.

Do not reintroduce a bespoke reduced secondary schema.

Do not add metadata that the canonical base dataset itself does not contain merely because it exists in raw sources.

The correct model is:

```text
canonical base DB
  -> transactional SQLite clone
  -> add/rebuild generated rows through canonical tables/materializers
  -> exact persistent sqlite_schema parity
  -> opt-in augmented DB
```

## Backfill result

Pronunciation Backfill V2 is complete.

Admitted:

`3,368,352`

Resolved:

`3,368,327`

Unresolved:

`25`

Active Generated Base-Parity V1 population:

`3,365,814` eSpeak A/B rows

Deferred and intentionally not reviewed now:

```text
Client B      292
Client C    2,161
Client D       60
U              25
-----------------
total        2,538
```

The deferred population remains authoritative in:

`data/local/pronunciation-backfill-v2.sqlite`

and is exported to:

`data/local/pronunciation-backfill-v2-deferred.tsv`

Do not promote, delete, silently fold in, or spend review time on those 2,538 rows unless the owner explicitly reopens that work later.

## Current owner action

The owner has started:

```powershell
git switch main
git pull --ff-only
npm run pronunciation:secondary:materialize
```

Do not ask the owner to restart this command merely because a new thread was opened.

Wait for the result or for an error/log excerpt.

Primary acceptance artifact:

`data/local/pronunciation-base-parity-v1-report.json`

## Expected outputs

```text
data/local/rhymelab-v5-generated-optin.sqlite
data/local/rhymelab-en-v1-generated-optin.sqlite
data/local/rhymelab-phrases-v1-generated-optin.sqlite
data/local/rhymelab-entities-v1-generated-optin.sqlite
data/local/pronunciation-base-parity-v1-report.json
data/local/pronunciation-backfill-v2-deferred.tsv
```

Canonical databases must remain untouched:

```text
data/local/rhymelab-v5.sqlite
data/local/rhymelab-en-v1.sqlite
data/local/rhymelab-phrases-v1.sqlite
data/local/rhymelab-entities-v1.sqlite
```

## What PR #145 does

### German Writer

The augmented German DB starts from the canonical Writer V5 database.

Generated DE word/token rows are represented through the existing:

- `hot`
- `form_analysis`

schemas.

The materializer rejoins the same DE usage ranking and Kaikki lexical evidence used by the regular build.

It materializes the ordinary runtime fields, including:

- surface / normalized
- usage rank / score / count / source count
- lemma / POS / gender
- lexicon layer / entity kind
- historical / lexical tags
- IPA / canonical phonemes
- syllable count / stress / primary stress
- rhyme tail / final tail
- vowel / consonant sequence
- exact key
- multisyllable key
- vowel key
- vowel/rhyme-family key
- coda key / coda class
- rhyme-syllable count
- pronunciation rank / preferred / eligible / evidence
- source order / source / tags / raw tags / flags
- locale / dialect / pronunciation register

Existing forms are overlaid instead of duplicated where appropriate.

Then the existing Writer V5 materializer is run against the augmented DB, rebuilding the canonical:

- `writer_anchor`
- `writer_morphology_evidence`

structures.

### English Writer

The augmented EN DB starts from the canonical English Writer database.

Generated rows use the existing:

- `en_form`
- `en_pronunciation`

schemas.

The materializer rejoins the same pinned source stack:

- Kaikki/Wiktionary
- wordfreq
- ESDB/SCOWL

and fills the same lexical/commonness/eligibility fields used by the regular EN database.

Existing forms lacking the accepted generated pronunciation are overlaid rather than duplicated.

### Phrase

The complete canonical Phrase DB is cloned.

Generated unresolved phrase tokens first enter through the augmented German Writer DB.

The existing canonical Phrase materializers are then rerun:

- phrase token pronunciation resolution
- phrase pronunciation
- phrase pronunciation token mapping
- mosaic windows
- v1 retrieval anchors
- v2 vowel-family retrieval anchors

Full generated phrase surfaces are accepted only when the resulting phrase is representable through the canonical token-composition path.

If an active generated phrase surface still cannot be represented canonically, the materializer intentionally fails instead of inventing incomplete phrase metadata.

### Entity

The complete canonical Entity DB is cloned.

Generated Entity name pronunciations use the existing:

- `entity_pronunciation`
- `entity_phonetic_analysis`
- `entity_rhyme_anchor`

tables and the same language-specific analyzers / anchor generation as regular Entity runtime data.

The pronunciation remains honestly marked as generated in the fields already present in the canonical Entity schema.

## Hard acceptance gates

The owner report is acceptable only if all of the following hold:

1. `status = "ok"`
2. `unclassified_active = 0`
3. exact persistent SQLite schema parity passes for:
   - DE Writer
   - EN Writer
   - Phrase
   - Entity
4. all four `exact_schema_match` values are true
5. canonical DB files were not mutated
6. the deferred total remains 2,538 with the expected four buckets
7. all active generated phrase-surface rows are represented by the canonical phrase-composition path
8. there is no generated-only persistent metadata table/schema in any augmented runtime DB

The materializer should hard-fail rather than emit `status=ok` when these invariants are violated.

## Important non-goal

Do **not** bring back the removed Etymology/Senses sidecar.

The regular hot Writer datasets do not carry full etymology or full dictionary senses. Base parity therefore means generated rows should not carry those extra runtime fields either.

If etymology/senses become a product feature later, add them consistently for canonical and generated data in a separate project decision.

## If the owner run fails

Do not immediately redesign the architecture.

First classify the failure:

### Source/path failure

Examples:

- missing DE Kaikki source
- missing EN registry/raw files
- missing canonical DB

Fix path/source resolution only.

### Schema parity failure

Compare canonical and augmented `sqlite_schema`.

Do not waive the gate. Generated DBs must retain exact persistent schema equality.

### DE Writer failure

Inspect:

- target count
- lexical evidence join
- hot/form_analysis insert
- Writer V5 materialization
- writer_anchor
- writer_morphology_evidence

Do not introduce generated-specific Writer tables.

### EN failure

Inspect:

- Kaikki lexical evidence join
- wordfreq rank
- ESDB/SCOWL evidence
- `en_form`
- `en_pronunciation`
- source/provenance values

Do not bypass normal EN eligibility semantics.

### Phrase failure

Most important likely gate:

`generated full-surface phrase is not representable by canonical token composition`

If this occurs, inspect the exact phrase IDs and unresolved token resolution first.

Do not create a second phrase-pronunciation representation solely to make the gate pass.

### Entity failure

Inspect:

- source `name_id`
- locale
- existing source-backed pronunciation
- generated pronunciation analysis
- rhyme-anchor materialization

Keep the canonical Entity schema unchanged.

## Next work only after owner report passes

The next project step is **runtime/UI opt-in integration**, not more pronunciation generation.

Desired behavior:

```text
checkbox OFF
  -> existing canonical databases only
  -> current product behavior unchanged

checkbox ON
  -> augmented generated-opt-in databases
  -> same schemas / same runtime code paths
  -> generated rows become eligible
```

The checkbox should not cause separate ranking/scoring logic merely because the data is generated.

The trust distinction should come from the source/provenance fields and the explicit user opt-in, not from a structurally inferior record format.

Before wiring the checkbox, define a regression acceptance gate proving:

- OFF reproduces current canonical result fingerprints
- ON adds generated coverage
- canonical source-backed rows are not lost
- no accidental default generated visibility
- DE / EN / Phrase / Entity all open and query correctly
- runtime latency remains bounded

Do not begin this runtime/UI work until `pronunciation-base-parity-v1-report.json` has been reviewed.

## New-thread starter

Use this in the next thread:

```text
Read docs/PRONUNCIATION_BASE_PARITY_HANDOVER.md first, then continue from the current owner materialization gate.

The owner has already started:
npm run pronunciation:secondary:materialize

Do not ask me to rerun it unless the output proves that is necessary.

When I provide data/local/pronunciation-base-parity-v1-report.json or an error/log excerpt:
1. verify it against every hard acceptance gate in the handover;
2. diagnose/fix any defect through a fresh branch -> PR -> validate -> squash merge;
3. if the report passes, plan and implement the generated-results checkbox/runtime integration while preserving canonical OFF-mode fingerprints and keeping generated data opt-in-only;
4. keep Client B 292 / C 2161 / D 60 / U 25 deferred for later review;
5. after repo changes, give me the exact local PowerShell commands to continue.
```
