# Data attribution

RhymeLab can optionally build its local Markov V2 transition model from third-party sentence corpora.

## Leipzig Corpora Collection

The default acquisition registry includes the downloadable German News 2024 300K corpus from the Leipzig Corpora Collection.

- Source: Leipzig Corpora Collection, German news corpus based on material from 2024.
- Corpus ID: `deu_news_2024_300K`
- Upstream corpus: `deu_news_2024`
- License declaration for downloadable text corpora: Creative Commons Attribution (CC BY).
- Project terms: https://wortschatz-leipzig.de/de/usage
- Corpus information: https://dict.wortschatz-leipzig.de?corpusId=deu_news_2024

The upstream project states that downloaded text corpora are distributed as randomized sentence lists rather than reconstructable source documents.

## Tatoeba

The default acquisition registry also includes the German detailed weekly Tatoeba sentence export.

- Source: Tatoeba — https://tatoeba.org
- Text license: Creative Commons Attribution 2.0 France (CC BY 2.0 FR).
- License: https://creativecommons.org/licenses/by/2.0/fr/
- Download source: https://downloads.tatoeba.org/exports/per_language/deu/
- Tatoeba attribution guidance: https://en.wiki.tatoeba.org/articles/show/faq

Tatoeba requests attribution for reused textual data. RhymeLab therefore retains source/provenance metadata in the local acquisition manifest and documents the source here.

## Local artifacts

Raw archives, staged sentence files, acquisition manifests, checksums, and generated Markov databases live below ignored `data/raw/`, `data/work/`, and `data/local/` paths. They are not committed to the RhymeLab source repository.

The compact Markov model stores transition counts and source-copy hashes, not the raw corpus text.
