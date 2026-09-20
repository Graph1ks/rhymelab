# Pronunciation Secondary Catalog V1

## Decision

Pronunciation Backfill V2 generated rows are **not canonical first-class search data**.

The active generated population is a second-class catalog:

- it is excluded from default search;
- it may only be queried when the user explicitly enables the generated/secondary-results checkbox;
- it never outranks or silently replaces source-backed canonical pronunciation rows;
- there is no automatic promotion into the canonical DE/EN/phrase/entity databases.

Policy ID:

`opt-in-generated-pronunciation-secondary-v1`

The active V1 population is restricted to rows resolved by **eSpeak-NG** with quality tier **A or B**.

Owner backfill snapshot `8b6d5cb9e9edc7b21fd23e95e4e182b48ca2add710f6007f138184964bf801c3`:

| Population | Rows | V1 handling |
| --- | ---: | --- |
| eSpeak A | 635,863 | active secondary |
| eSpeak B | 2,729,951 | active secondary |
| Client B | 292 | deferred |
| Client C | 2,161 | deferred |
| Client D | 60 | deferred |
| U unresolved | 25 | deferred |
| **Active secondary total** | **3,365,814** | opt-in only |
| **Deferred total** | **2,538** | preserved, no current review |

The 2,538 deferred rows are intentionally **not being reviewed now**. They are preserved for a later explicit owner phase and must not disappear from the workflow.

## Where the deferred rows live

Authoritative source:

`data/local/pronunciation-backfill-v2.sqlite`

Relevant tables/columns:

- `work_item.final_status`
- `work_item.quality_tier`
- `work_item.final_method`
- `work_item.client_status`
- `work_item.last_error`
- `attempt`

After secondary materialization they are also copied to:

- database table: `data/local/pronunciation-secondary-v1.sqlite :: deferred_generated_result`
- flat review/export file: `data/local/pronunciation-backfill-v2-deferred.tsv`

The deferred table uses explicit buckets:

- `client_B_source_backed`
- `client_C_rules`
- `client_D_grapheme`
- `U_unresolved`

These rows are not eligible for the V1 secondary search channel.

## Metadata parity

The generated pronunciation work database originally stored only the pronunciation fields needed to finish Backfill V2:

- IPA
- syllable count
- primary stress
- stress pattern
- exact-tail key
- vowel key
- coda key
- source provenance

That is not enough to behave like the existing Writer datasets.

Secondary V1 therefore materializes a separate sidecar database:

`data/local/pronunciation-secondary-v1.sqlite`

### Search/rhyme parity

Every active secondary pronunciation is re-analyzed from its stored accepted IPA and materialized with the same search-class phonetic fields used by the canonical runtime:

- canonical phonemes
- syllable count
- stress pattern
- primary-stress syllable
- stressed rhyme tail
- final tail
- vowel sequence
- consonant sequence
- exact key
- multisyllable key
- vowel key
- **vowel/rhyme-family key**
- coda key
- coda class
- rhyme-syllable count
- EN rhotic flag where applicable

The sidecar has dedicated exact/multisyllable/vowel/family+coda/coda indexes. This makes the generated row phonologically queryable without changing canonical databases.

### Lexical/source parity

German rows are rejoined to the pinned DE Kaikki source and the merged usage ranking. Source-backed lexical analyses preserve:

- lemma / normalized lemma
- POS
- homograph/etymology number
- confidence
- gender
- proper-name evidence
- obsolete/historical evidence
- style/register tags
- grammatical form features
- match kinds
- usage rank / score / count / source count

English rows are rejoined to the pinned EN Kaikki, wordfreq and ESDB/SCOWL snapshots and preserve:

- lexical POS
- lemma/relation evidence
- lexical tags
- historical/proper-name evidence
- evidence kind
- wordfreq rank + Zipf
- ESDB/SCOWL evidence

Phrase/entity backfill rows retain their original `source_ref.context_json`, including phrase eligibility/count context and entity QID/category/popularity evidence.

### Etymology and senses: important distinction

The **current canonical hot Writer search database does not contain etymology or full senses**. The existing DE build explicitly omits full senses and etymology from the hot runtime dataset to keep the search layer compact.

The raw Kaikki source does contain this information. Because these secondary rows are being rebuilt from the original source anyway, Secondary V1 preserves it separately as source metadata:

`secondary_source_record`

Fields include:

- source-record key
- source headword
- POS
- etymology number
- `etymology_text`
- entry tags
- compact senses/glosses
- form/alternative relations
- sense-level synonyms/antonyms when present

This metadata is preserved for parity/provenance and future UI use. **It does not affect current rhyme ranking.**

## Database contract

### `secondary_form`

One active eSpeak-generated A/B form per normalized language key.

Hard invariants:

`second_class = 1`

`default_search_eligible = 0`

`user_opt_in_eligible = 1`

A future runtime integration must require an explicit user opt-in before reading this channel.

### `secondary_pronunciation`

Full phonetic/rhyme retrieval materialization for each active secondary form.

### `secondary_lexical_analysis`

Source-backed lexical analyses. Multiple analyses/homographs are preserved rather than flattened away.

### `secondary_source_record`

Compact original Kaikki metadata, including etymology and sense/gloss provenance.

### `secondary_source_ref`

Exact Backfill V2 source provenance copied from the work database.

### `deferred_generated_result`

The 292 + 2,161 + 60 + 25 deferred rows.

## Owner command

After Backfill V2 is complete:

```powershell
git switch main
git pull --ff-only
npm run pronunciation:secondary:materialize
```

Outputs:

```text
data/local/pronunciation-secondary-v1.sqlite
data/local/pronunciation-secondary-v1-report.json
data/local/pronunciation-backfill-v2-deferred.tsv
```

The materializer is staging-only. It does **not** mutate:

- `data/local/rhymelab-v5.sqlite`
- `data/local/rhymelab-en-v1.sqlite`
- `data/local/rhymelab-phrases-v1.sqlite`
- `data/local/rhymelab-entities-v1.sqlite`

## Future runtime integration

Runtime/UI work is deliberately separate from materialization.

When integrated, the secondary database must be opened as a separate channel and queried only when the user enables the generated-results checkbox. Default Writer requests must remain canonical-only.

The deferred Client B/C/D/U populations stay outside that channel until the owner explicitly reopens their review.
