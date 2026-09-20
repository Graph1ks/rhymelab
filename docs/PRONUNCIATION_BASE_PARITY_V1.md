# Generated Pronunciation Base-Parity V1

## Decision

Generated Backfill V2 pronunciations remain **second-class and user-opt-in-only**, but their runtime representation must be **exactly equal to the regular base dataset for the corresponding domain**.

That means:

- no bespoke reduced "secondary" schema;
- no extra metadata model that the regular runtime does not have;
- no missing runtime/search fields;
- no automatic inclusion in default search;
- no mutation of the canonical databases.

Policy:

`canonical-schema-opt-in-generated-overlay-v1`

## Architecture

The materializer builds **augmented copies** of the canonical databases.

Default search keeps using the canonical databases.

A future generated-results checkbox will switch/extend retrieval to the augmented copies. Because each augmented database starts as a byte copy of the canonical base and keeps the exact same SQLite schema, every generated row is represented through the same tables and fields as ordinary data.

Outputs:

```text
data/local/rhymelab-v5-generated-optin.sqlite
data/local/rhymelab-en-v1-generated-optin.sqlite
data/local/rhymelab-phrases-v1-generated-optin.sqlite
data/local/rhymelab-entities-v1-generated-optin.sqlite
data/local/pronunciation-base-parity-v1-report.json
data/local/pronunciation-backfill-v2-deferred.tsv
```

The report hard-fails if any augmented database has a different `sqlite_schema` from its canonical base.

## German Writer parity

Base:

`data/local/rhymelab-v5.sqlite`

Augmented:

`data/local/rhymelab-v5-generated-optin.sqlite`

Generated DE word/token rows use the existing `hot` schema. No generated-only columns are added.

They therefore carry the same runtime fields as regular rows:

- surface / normalized form
- usage rank / score / count / source count
- lemma / POS / gender where source-backed
- lexicon layer / entity kind
- historical flag / lexical tags
- IPA / canonical phonemes
- syllable count / stress / primary stress
- stressed rhyme tail / final tail
- vowel and consonant sequences
- exact key
- multisyllable key
- vowel key
- vowel/rhyme-family key
- coda key / coda class
- rhyme-syllable count
- pronunciation rank / preferred / eligible / evidence / source order
- pronunciation source / tags / raw tags / flags
- locale / dialect / pronunciation register

Source lexical analyses are restored into the existing `form_analysis` table.

After insertion the existing Writer V5 materializer is run on the augmented database, rebuilding the same:

- `writer_anchor`
- `writer_morphology_evidence`

tables and policies used by the canonical Writer runtime.

Existing forms that were present but lacked an accepted pronunciation are overlaid rather than duplicated.

## English Writer parity

Base:

`data/local/rhymelab-en-v1.sqlite`

Augmented:

`data/local/rhymelab-en-v1-generated-optin.sqlite`

Generated EN rows use the existing:

- `en_form`
- `en_pronunciation`

schemas.

The materializer rejoins the pinned English source stack used by the base builder:

- Kaikki/Wiktionary lexical evidence
- wordfreq
- ESDB/SCOWL

and materializes the same form fields:

- surface variants
- POS classes
- lemma candidates
- relation kinds
- lexical tags
- evidence kinds
- current/historical lexical evidence counts
- proper/common lexical evidence counts
- historical-only / proper-name-only
- analyzed en-US / default eligibility / exclusion reasons
- ESDB size/region/POS/archaic/uncommon/invalid evidence
- wordfreq rank / Zipf

The generated pronunciation is stored in the ordinary `en_pronunciation` schema with honest provenance:

- source = generated eSpeak secondary channel
- notation = IPA
- locale = en-US
- generated source tags
- normal analyzed rhyme/search keys
- default-profile eligibility derived by the same lexical eligibility rules

Existing EN forms with no accepted en-US pronunciation are overlaid instead of duplicated.

## Phrase parity

Base:

`data/local/rhymelab-phrases-v1.sqlite`

Augmented:

`data/local/rhymelab-phrases-v1-generated-optin.sqlite`

The phrase database is copied in full so all catalog metadata, attestations, usage evidence, tokens, phrase types, history and existing runtime structures are unchanged.

Generated unresolved phrase tokens are first represented as ordinary rows in the augmented German Writer database. The **existing canonical phrase pronunciation materializer** is then rerun against that augmented Writer DB.

The same canonical phrase structures are rebuilt:

- `phrase_token_pronunciation_resolution`
- `phrase_pronunciation`
- `phrase_pronunciation_token`
- mosaic windows
- v1 retrieval anchors
- v2 vowel-family retrieval anchors

No reduced generated phrase schema exists.

Full-surface phrase eSpeak rows are accepted into the parity bundle only when the corresponding phrase can be represented by the canonical token-composition path after the generated token gaps are filled. The materializer hard-fails if an active generated phrase surface still cannot be represented canonically; it does not invent incomplete token-boundary metadata.

## Entity parity

Base:

`data/local/rhymelab-entities-v1.sqlite`

Augmented:

`data/local/rhymelab-entities-v1-generated-optin.sqlite`

The complete entity catalog is copied, preserving the existing:

- entity metadata
- names and aliases
- categories
- descriptions
- popularity
- external IDs
- source snapshots

Generated name pronunciations are added through the existing canonical tables:

- `entity_pronunciation`
- `entity_phonetic_analysis`
- `entity_rhyme_anchor`

using the same DE/EN analyzers and anchor generator as regular Entity runtime data.

The row remains honestly marked `generated=1` with eSpeak provenance, but there is no separate reduced Entity metadata model.

## What is deliberately *not* added

"Equal to the base dataset" also means **no extra Etymology/Senses sidecar**.

The current regular hot Writer databases do not carry full etymology or full dictionary senses. Therefore the generated opt-in databases do not add those fields either.

If full etymology/sense UI is added in the future, it must be designed for the canonical and generated datasets together rather than making generated rows structurally different.

## Deferred non-eSpeak results

The owner decision remains unchanged:

- Client B: 292
- Client C: 2,161
- Client D: 60
- unresolved U: 25

These 2,538 rows are not reviewed or materialized now.

They remain authoritative in:

`data/local/pronunciation-backfill-v2.sqlite`

and are exported for later work to:

`data/local/pronunciation-backfill-v2-deferred.tsv`

## Owner command

```powershell
git switch main
git pull --ff-only
npm run pronunciation:secondary:materialize
```

The materializer does not mutate any canonical database.

After completion, review only:

`data/local/pronunciation-base-parity-v1-report.json`

The critical acceptance gates are:

- `status = ok`
- exact SQLite schema match for DE, EN, Phrase and Entity
- zero default-search wiring
- canonical databases unchanged
- all active phrase-surface generated rows representable through canonical phrase composition
