# Rhyme Core v1 — German

RhymeLab is a rhyme engine first, not a general-purpose dictionary.

## Hot-path record

The German publish/core data keeps only what materially improves rhyme search:

- surface form and normalized search form
- measured usage rank / score where available
- lightweight lemma + POS + gender where available
- source-backed lexical-history metadata
- attested IPA
- canonical phonemes
- syllable count and stress
- stressed rhyme tail and final tail
- vowel / consonant sequences
- exact / multisyllabic / vowel / slant / coda candidate keys

Definitions, full senses, synonym graphs, antonyms, etymology, translations, embeddings and deep compound analysis are **not part of the v1 hot path**.

## Processing order

`usage_rank` and build order are deliberately different concepts.

1. Surface forms observed in the approved Leipzig News/Wikipedia/Web corpora are ordered by measured usage.
2. German Wiktionary surface forms not observed in those corpora form the dictionary long tail.
3. Long-tail forms keep `usage_rank = NULL`; RhymeLab does not invent a frequency rank.
4. The source/core builder keeps a deterministic processing order and 500-form shard boundaries.

The Leipzig ranking normalizes each corpus to per-million frequency and gives each corpus equal weight.

## Local data flow

```text
Leipzig news + Wikipedia + web
            ↓
equal-weight usage ranking
            ↓
German Wiktionary / Kaikki
            ↓
attested IPA + lightweight lexical/history analysis
            ↓
de-ipa-v1 keys/features
            ↓
500-form core/publish shards on local disk
            ↓
data/local/rhymelab.sqlite
            ↓
indexed bounded candidate retrieval
            ↓
de-phon-v2 primary rhyme scoring
     + rhyme-relations-v1
            ↓
localhost lookup + rhyme search
```

Frequency is a ranking signal only. It never supplies lemma, POS, pronunciation, historical state or rhyme facts.

## Primary rhyme vs. sound relations

`de-phon-v2` produces one exclusive primary rhyme class when strong enough:

- multisyllabic perfect
- perfect
- multisyllabic slant
- family
- slant

`weak` is internal and means no primary rhyme clears the exposure threshold.

`rhyme-relations-v1` independently evaluates:

- Assonance
- Consonance

These relations can overlap a primary rhyme. A candidate may therefore be `slant + assonance`, or may have no primary rhyme and still be a valid consonance relation. Perfect rhymes do not receive redundant relation labels.

The relation layer is deliberately language-neutral: it consumes a common stressed-rhyme-domain feature shape plus language-specific vowel/consonant similarity functions. German supplies those through the current phonology profile; a future English profile must supply its own phonology.

## Shards

Default shard size is 500 surface forms except the final shard.

Generated directories are local and gitignored:

```text
data/de/core/
  manifest.json
  shard-000001.jsonl
  shard-000002.jsonl
  ...

data/de/publish/
  manifest.json
  shard-000001.jsonl
  shard-000002.jsonl
  ...
```

The full core preserves discovery/coverage information. The compact publish dataset includes only forms with usable attested pronunciation and is the input to the local runtime database.

## Local source build

```bash
npm run de:core:bootstrap
```

This command downloads/reuses approved Leipzig archives, verifies source hashes, builds the uncapped equal-weight usage ranking, streams the German Kaikki/Wiktextract snapshot, generates deterministic shards, verifies coverage/order and writes local build reports.

Useful options:

```bash
npm run de:core:bootstrap -- --clean-source
npm run de:core:bootstrap -- --refresh-kaikki
npm run de:core:bootstrap -- --ranked-only
```

The bootstrap needs Node 22+ and a `tar`/`bsdtar` executable.

## Compact publish dataset

```bash
npm run de:publish:rebuild
```

Latest reviewed v4-attempt publish output (2026-09-15, data unchanged from accepted v3 source set):

- 838,199 rhyme-ready dictionary forms
- 260,440 usage-ranked rhyme-ready dictionary forms
- 577,759 dictionary-only rhyme-ready forms
- 904,808 pronunciations
- 1,677 shards
- 17,233 IPA-normalization failures

## Local SQLite projection

```bash
npm run local:db
```

This writes:

```text
data/local/rhymelab.sqlite
data/local/build-report.json
```

The current v4 projection stores one row per attested pronunciation and indexes normalized lookup, usage, exact rhyme, multisyllabic rhyme, vowel sequence/family, slant-family/coda-class and exact coda keys. It also stores historical/current lexical metadata.

The first reviewed v4 attempt measured 838,209 local forms, 904,818 pronunciation rows, 1,038 historical-only forms and 458.90 MiB SQLite. That attempt is **not an accepted baseline** because the relation model and two audit schema guards were subsequently changed.

## Query strategy

```text
word
  ↓
indexed pronunciations
  ↓
exact / multi / vowel / stressed-vowel-family / slant / coda buckets
  ↓
bounded candidate pool
  ↓
de-phon-v2 primary rhyme scoring
  + independent rhyme-relations-v1
  ↓
deduplicate + relation/category selection + usage-aware ordering
```

There is no precomputed all-pairs rhyme graph.

## Future language profiles

Runtime phonology is selected through `scripts/phonology-profiles.mjs`. Only German is registered today. English is intentionally deferred until German quality is stable and must bring its own pronunciation source pipeline, IPA analyzer, phoneme inventory, similarity model, thresholds and benchmark rather than reusing German constants.
