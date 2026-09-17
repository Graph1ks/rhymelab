# Source data policy

Git stores the recipe, license/provenance metadata, checksums, importers, small fixtures and benchmark samples. It is **not** the warehouse for multi-hundred-megabyte or multi-gigabyte linguistic data.

Raw snapshots stay on the local machine under ignored data directories. The source manifest records the URL, source/version/date, license and checksum needed to reproduce the build.

## German usage seed

The current usage ranking uses three Leipzig German 1M-sentence corpora to reduce single-genre bias:

1. German News 2024
2. German Wikipedia 2021
3. German Web (Germany) 2021

The Leipzig download format contains `*_words.txt` files with `Word_ID<TAB>Word<TAB>Frequency`. The ranking builder normalizes each corpus to per-million frequency and gives the three sources equal weight.

## German dictionary / pronunciation enrichment

German Wiktionary via Kaikki/Wiktextract supplies the primary lexical/pronunciation evidence.

The frequency ranking decides **which surface forms are important**, not their linguistic facts. The dictionary source supplies lemma/POS/form relationships and attested IPA where available.

Derived locally from attested IPA:

1. canonical phonemes
2. syllables and lexical stress
3. rhyme tails and candidate keys
4. phonological similarity features
5. exact/slant/multisyllabic/assonance/consonance scoring

## German phrase catalog

Phase 11B1 uses a separate source registry:

```text
sources/phrase/de-phase11b1-v1.json
```

Source roles are deliberately separate:

- German Wiktionary via raw Kaikki/Wiktextract supplies source-backed multi-word phraseology/lexical attestations;
- the frozen Leipzig News 2024 1M, Wikipedia 2021 1M and Germany Web 2021 1M corpora supply sentence-level attestation/commonness evidence only.

The phrase catalog does not infer idiom/metaphor/proverb status from corpus frequency.

Preferred local bootstrap:

```bash
npm run phrase:catalog:bootstrap
```

Generated outputs remain gitignored:

```text
data/local/rhymelab-phrases-v1.sqlite
data/local/phrase-catalog-v1-report.json
data/work/de-phrase-catalog-v1/
```

The bootstrap reuses the existing Kaikki source cache when available and verifies the frozen Leipzig archive SHA-256 values before extracting sentence files.

## Local build

The standard local source bootstrap is:

```bash
npm run de:core:bootstrap
```

The compact pronunciation-backed dataset is then rebuilt with:

```bash
npm run de:publish:rebuild
```

The final local runtime database is built with:

```bash
npm run local:db
```

## Licensing gate

Before adding a source, confirm the exact snapshot's license and attribution obligations. Raw snapshots are not committed to this repository. Source-specific redistribution requirements must remain explicit in manifests and documentation.
