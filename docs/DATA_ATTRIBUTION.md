# Data attribution

RhymeLab can optionally build its local Markov V2 transition model from third-party sentence corpora.

## Leipzig Corpora Collection

The default acquisition registries include downloadable German News 2024 and English News 2023 1M norm corpora from the Leipzig Corpora Collection.

- Source: Leipzig Corpora Collection, German news corpus based on material from 2024.
- German corpus ID: `deu_news_2024_300K`
- German upstream corpus: `deu_news_2024`
- English corpus ID: `eng_news_2023_1M`
- License declaration for downloadable text corpora: Creative Commons Attribution (CC BY).
- Project terms: https://wortschatz-leipzig.de/de/usage
- Corpus information: https://dict.wortschatz-leipzig.de?corpusId=deu_news_2024

The upstream project states that downloaded text corpora are distributed as randomized sentence lists rather than reconstructable source documents.

## Tatoeba

The default acquisition registries also include the German and English detailed weekly Tatoeba sentence exports.

- Source: Tatoeba — https://tatoeba.org
- Text license: Creative Commons Attribution 2.0 France (CC BY 2.0 FR).
- License: https://creativecommons.org/licenses/by/2.0/fr/
- German download source: https://downloads.tatoeba.org/exports/per_language/deu/
- English download source: https://downloads.tatoeba.org/exports/per_language/eng/
- Tatoeba attribution guidance: https://en.wiki.tatoeba.org/articles/show/faq

Tatoeba requests attribution for reused textual data. RhymeLab therefore retains source/provenance metadata in the local acquisition manifest and documents the source here.

## Local artifacts

Raw archives, staged sentence files, acquisition manifests, checksums, and generated Markov databases live below ignored `data/raw/`, `data/work/`, and `data/local/` paths. They are not committed to the RhymeLab source repository.

The compact Markov model stores transition counts and source-copy hashes, not the raw corpus text.
