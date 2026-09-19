# Third-Party Notices

RhymeLab contains or can locally build from third-party linguistic data. The repository's root public license applies only to Graph1ks Material. It does **not** relicense third-party material.

This file is a practical notice registry. `DATA_SOURCES.md` and the source manifests contain the detailed provenance/build policy.

## Included derived Leipzig seed

Paths:

- `data/seeds/de-10000.tsv`
- `data/seeds/de-10000.meta.json`

These files were produced from frequency evidence in the Leipzig Corpora Collection / Deutscher Wortschatz, Leipzig University, using the German News 2024 1M, German Wikipedia 2021 1M, and Germany Web 2021 1M corpora identified in `sources/leipzig/de10k-v1-frozen.json`.

Upstream license recorded by the project: **CC BY**.

Attribution:

> Leipzig Corpora Collection / Deutscher Wortschatz, Leipzig University

Terms/reference:
https://wortschatz.uni-leipzig.de/en/usage

The RhymeLab code and transformation logic around this seed are separate Graph1ks Material; the underlying third-party corpus-derived evidence is not relicensed by RhymeLab's root license.

## German Wiktionary via Kaikki / Wiktextract

RhymeLab's local German build can download German Wiktionary data distributed through Kaikki/Wiktextract.

Source manifest:
`source/de-rhyme-core-v1.json` is not the path; the canonical repository manifest is `sources/de-rhyme-core-v1.json`.

Upstream data source:
https://kaikki.org/dewiktionary/rawdata.html

The project records the underlying Wiktionary licensing as **CC BY-SA + GFDL**. Raw snapshots and generated bulk German data are intentionally not committed to this repository. If such material is redistributed separately, the applicable upstream attribution/share-alike/license requirements must be satisfied independently of RhymeLab's root license.

## Cologne Corpus of Kiezdeutsch

RhymeLab may locally ingest the transcription files from:

Neubauer, Antonia Marie & Catasso, Nicholas (2025), *Kölner Korpus des Kiezdeutschen / Cologne Corpus of Kiezdeutsch*, Zenodo, DOI 10.5281/zenodo.15465769.

License: Creative Commons Attribution 4.0 International (CC BY 4.0).

The RhymeLab bootstrap downloads transcription PDFs only and does not bundle or commit the source transcripts or audio. Derived local register-attestation evidence retains source/snapshot/checksum provenance. Any redistribution of upstream material must preserve the required attribution and indicate transformations where applicable.

## Wikidata entity pronunciation evidence

RhymeLab's Phase 12A3 owner workflow may selectively retrieve Wikidata IPA transcription statements (`P898`) for the accepted cultural Entity taxonomy through the public QLever Wikidata endpoint.

Manifest:
`sources/entity/wikidata-p898-pronunciation-v1.json`

Upstream structured data license recorded by the project: **CC0 1.0**.

The local selective artifact preserves exact query/source provenance and checksums and is not committed to this repository. P898 qualifiers such as language of work or name, pronunciation variety, and applies-to-name are retained as provenance-bearing evidence.

Phase 12A3 does not silently promote generic source language evidence into a regional runtime locale. These rows remain `source_attested_unprofiled` until a separate pronunciation-profile policy explicitly accepts them.

## CMU Pronouncing Dictionary

RhymeLab's Phase 12A3 owner diagnostic may locally download the CMU Pronouncing Dictionary from the `cmusphinx/cmudict` repository.

Pinned manifest:
`sources/entity/cmudict-entity-pronunciation-v1.json`

Pinned revision (abbreviated here; exact values are retained in the source manifest):

```text
commit    74790861f652…
file      cmudict.dict
git blob  2c0411740cce…
```

Copyright: Carnegie Mellon University. The upstream license permits redistribution and use in source and binary forms, with or without modification, subject to its notice/disclaimer conditions. The raw dictionary is downloaded locally and is not committed to this repository.

Phase 12A3 uses this artifact only to measure source-backed North American English token coverage over unresolved Entity names. It is not silently converted into German pronunciation evidence or enabled in the German runtime.


## Phase 12B English Writer source stack

The Phase 12B English Writer source registry is:

`sources/en/phase12b-sources-v1.json`

Raw source artifacts and generated diagnostics are owner-local and are not committed to this repository.

### English Wiktionary via Kaikki / Wiktextract

RhymeLab may locally download the raw English-Wiktionary Wiktextract JSONL artifact distributed through Kaikki and stream-filter records with `lang_code === "en"`.

The project records the extracted Wiktionary data licensing as **CC BY-SA + GFDL**. Wiktextract software is separate from the extracted Wiktionary content. Redistribution of source-derived data must satisfy the applicable Wiktionary attribution/share-alike/GFDL obligations.

### CMU Pronouncing Dictionary

Phase 12B deliberately reuses the already documented pinned CMUdict revision above as an exact en-US pronunciation overlay/control. The Phase 12B registry carries the same commit and Git blob identifiers; it does not silently move the source.

### English Speller Database / SCOWL v2

RhymeLab may locally use the English Speller Database / SCOWL v2 source master from `en-wl/wordlist` as secondary spelling, dialect, variant, inflection and lexical-quality evidence.

The Phase 12B registry pins a specific upstream commit and records the upstream `Copyright` notice location. The combined ESDB work is distributed under permissive terms with source/component notices that must be preserved as required. RhymeLab does not treat this source as pronunciation or fine-grained frequency truth.

### wordfreq English data

RhymeLab may locally use the pinned English large wordfreq data artifact as commonness/ranking evidence only.

The wordfreq project code is Apache-2.0; its bundled frequency data carries separate attribution/share-alike obligations documented upstream, including **CC BY-SA 4.0** for redistributed data. RhymeLab does not relicense that data under the repository's root license and does not add wordfreq as a runtime dependency.


## Phase 12C Entity pronunciation expansion

Registry:
`sources/entity/entity-pronunciation-expansion-v1.json`

The primary expansion reuses the already documented raw English Wiktionary/Kaikki snapshot and pinned CMUdict revision. Those source/license boundaries remain unchanged.

### Moby Pronunciator II

Moby Pronunciator II is supported as an optional owner-local secondary pronunciation source. Its documentation states that the documentation, software and database are Public Domain material by grant from the author, January 2001.

RhymeLab does not bundle Moby data in Git. The Phase 12C implementation stores legacy Moby ASCII phone strings as raw evidence only; it does not automatically convert or promote them into the accepted English runtime.

### Montreal Forced Aligner English (US) G2P model

The Phase 12C benchmark plan identifies English (US) MFA G2P model v2.2.1 as the primary generated-pronunciation candidate. The upstream model documentation records license **CC BY 4.0** and architecture Phonetisaurus.

The model is not bundled in this repository and is not a runtime dependency. If later used for generated Entity pronunciations, attribution and exact model-version provenance must be preserved.

### DeepPhonemizer and CharsiuG2P

Neither project nor pretrained weights are bundled by RhymeLab.

DeepPhonemizer code is recorded as MIT and is benchmark-only until the exact pretrained checkpoint/license is pinned.

CharsiuG2P code is recorded as MIT, but upstream notes that some collected pronunciation datasets have unspecified licenses. Charsiu therefore remains research-only and may not enter the commercial production pipeline without an exact model/data license audit.

## Trademarks and named entities

`data/supplemental/modern-entities.json` contains names of third-party brands, platforms, companies, products, and services for linguistic/pronunciation purposes. Their inclusion does not claim ownership of those names or marks and does not imply affiliation, sponsorship, or endorsement.

The curated RhymeLab-specific pronunciation annotations and surrounding file structure are Graph1ks Material to the extent copyright or similar rights apply; third-party trademark and other rights remain unaffected.

## Not bundled

Downloaded raw corpora, raw Wiktionary/Kaikki snapshots, generated German bulk datasets, local SQLite databases, benchmark review/reference-label files, and generated reports are not intended to be committed to Git.

## Adding new third-party material

Any future third-party code or data must have its source, license, attribution, version/snapshot, and redistribution boundary documented before it is committed. A commercial license from Graph1ks never overrides third-party terms.

