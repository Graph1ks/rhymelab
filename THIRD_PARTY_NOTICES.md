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

## Trademarks and named entities

`data/supplemental/modern-entities.json` contains names of third-party brands, platforms, companies, products, and services for linguistic/pronunciation purposes. Their inclusion does not claim ownership of those names or marks and does not imply affiliation, sponsorship, or endorsement.

The curated RhymeLab-specific pronunciation annotations and surrounding file structure are Graph1ks Material to the extent copyright or similar rights apply; third-party trademark and other rights remain unaffected.

## Not bundled

Downloaded raw corpora, raw Wiktionary/Kaikki snapshots, generated German bulk datasets, local SQLite databases, benchmark review/reference-label files, and generated reports are not intended to be committed to Git.

## Adding new third-party material

Any future third-party code or data must have its source, license, attribution, version/snapshot, and redistribution boundary documented before it is committed. A commercial license from Graph1ks never overrides third-party terms.

