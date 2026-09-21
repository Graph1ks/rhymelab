# Markov V2 Data Source Contract

## Purpose

The constrained lyric decoder deliberately separates three source roles. They teach different things and must not be merged into one undifferentiated corpus.

| Kind | Teaches | Must not be treated as |
| --- | --- | --- |
| `phrase` | attested chunks, idioms, local word-order evidence | complete sentence/line grammar |
| `sentence` | complete syntax, function-word structure, longer transition continuity | song/section/rhyme structure |
| `lyric` | line shape, cadence proxy, repetition/section/rhyme-distance structure when available | general-language truth |

The canonical Serving-v1 Phrase/Mosaic export is always classified as `phrase`.

## Builder interface

The V2 builder supports explicit typed and weighted inputs:

```text
--source kind:code[:weight]=/absolute/path/to/line-oriented-source.txt
```

Supported kinds:

```text
phrase
sentence
lyric
```

Weight is an integer from 1 through 16. It multiplies transition/token/shape evidence deterministically. It does not duplicate files or alter accepted-line counts.

Example:

```powershell
npm run markov:model:build -- \
  --source sentence:de_sentences:2=C:\data\de-sentences.txt \
  --source lyric:de_lyric_lines:3=C:\data\de-lyric-lines.txt
```

The wrapper also injects the canonical Serving-v1 Phrase/Mosaic source at weight 1.

Legacy `--sentences code=path` remains accepted and maps to `kind=sentence, weight=1`.

## Source-role semantics

### Phrase

Phrase/Mosaic rows:

- contribute token frequency;
- contribute variable-order transitions;
- contribute typed source-window hashes;
- may increase attested-phrase support during decoding;
- participate in anti-copy diagnostics as Phrase evidence;
- do **not** populate `shape_pattern`.

A known phrase is allowed to appear inside a generated line. It is not automatically considered source-text regurgitation.

### Sentence

Complete sentence rows:

- contribute token frequency;
- contribute variable-order transitions;
- populate learned line/sentence shape patterns;
- populate strict anti-copy sequence/window evidence;
- are used as syntax/fluency evidence.

Long direct runs copied from a sentence source are blocked by the decoder.

### Lyric

Full lyric lines:

- contribute token frequency;
- contribute variable-order transitions;
- populate learned line-shape patterns;
- populate strict anti-copy sequence/window evidence.

A production lyric source must preserve line boundaries. If section/stanza metadata is available, it should be retained in the acquisition/staging layer for future section-model materialization rather than flattened away.

## Production-source requirements

A source intended for a distributable RhymeLab model should have:

- explicit provenance;
- license/redistribution/model-training review compatible with the intended product;
- stable source fingerprint;
- language identity;
- deterministic line extraction;
- duplicate control;
- no secrets/private owner material;
- documented cleaning rules;
- train/holdout separation at document/song level where document identity exists.

Raw local corpora and bulk text remain outside Git.

## Quality requirements

Prefer corpus diversity over sheer row count.

Avoid:

- one artist, site, publisher, genre, or template dominating counts;
- repeated hooks/choruses multiplying transitions without a cap;
- duplicate or near-duplicate sentences;
- machine-generated text silently mixed with source-backed text;
- sentence fragments mislabeled as complete sentences;
- bag-of-words data for sequence generation.

For lyric sources, repeated lines within the same song should be capped or down-weighted during staging. The model should learn that repetition exists without turning one chorus into a transition-frequency magnet.

## V2 evidence stored in the model

The compact model stores:

- order 1–4 forward transitions;
- order 1–4 reverse transitions;
- token support;
- source-kind-aware full-sequence hashes;
- source-kind-aware 4–8-token window hashes;
- learned coarse shape patterns from `sentence` and `lyric` only;
- a source-role profile with accepted row counts and deterministic weights.

It does not ship the original source text.

## Privacy boundary

Owner-private lyrics remain calibration/benchmark material only.

They are not an implicit `lyric` source and are never consumed by the production wrapper unless the owner deliberately supplies them to the low-level builder for a private local experiment. Such a private model must not be distributed or committed.

The public aggregate lyric-shape profile remains separate from all corpus text.


## Default acquisition pipeline

The repository now includes a deterministic acquisition registry:

```text
sources/markov-sentence-sources-v1.json
```

The initial production-oriented German sentence mix is intentionally small and modern:

| Code | Source | Era | Role | Initial weight |
| --- | --- | ---: | --- | ---: |
| `leipzig_news_2024_300k` | Leipzig German News 2024, 300K sentence package | 2024 | `sentence` | 1 |
| `tatoeba_deu` | Tatoeba weekly German detailed export | contemporary/community | `sentence` | 1 |

Weights start neutral. They are not tuned until quality/latency benchmarks show a reason to change them.

Verified access/licensing notes:

- Leipzig currently exposes standardized German corpora in 10K/30K/100K/300K/1M sizes; the downloadable text corpora are declared CC BY in the project's terms of use.
- The selected Leipzig upstream corpus is `deu_news_2024`, whose corpus page reports 36,033,067 source sentences and 565,841,855 tokens; RhymeLab deliberately acquires only the normalized 300K download package for the first model.
- Tatoeba publishes weekly per-language exports. The detailed German export contains sentence ID, language, text, contributor username, date added, and date modified. Tatoeba documents its textual corpus as CC BY 2.0 FR and requires attribution.

Attribution contract:

```text
docs/DATA_ATTRIBUTION.md
```

### Commands

Inspect the acquisition plan without downloading:

```powershell
npm run markov:sources:plan
```

Acquire, parse, filter, globally deduplicate, checksum and stage all enabled sources:

```powershell
npm run markov:sources:acquire
```

Force refresh of the upstream archives:

```powershell
npm run markov:sources:refresh
```

Inspect local staged-source state:

```powershell
npm run markov:sources:status
```

Acquire sources and build Markov V2 in one command:

```powershell
npm run markov:data:bootstrap
```

After acquisition, ordinary:

```powershell
npm run markov:model:build
```

automatically discovers `data/local/markov-sources/manifest.json` and includes every staged `sentence` source in addition to the canonical Serving-v1 Phrase/Mosaic source.

### Local data layout

```text
data/raw/markov-sources/
  leipzig_news_2024_300k.tar.gz
  tatoeba_deu.tsv.bz2

data/local/markov-sources/
  manifest.json
  ATTRIBUTION.txt
  leipzig_news_2024_300k.txt
  leipzig_news_2024_300k.meta.json
  tatoeba_deu.txt
  tatoeba_deu.meta.json
```

All of these paths are already covered by repository ignore rules.

### Staging policy

The acquisition stage rejects obvious non-sentence/noise rows using deterministic rules before model building:

- 4–32 lexical tokens;
- 18–320 characters;
- URL rows;
- markup-heavy rows;
- repeated-character garbage;
- low letter-ratio rows;
- extreme all-caps noise;
- obvious non-Latin-script mixtures.

It then hashes normalized sentences and deduplicates **globally across all acquired sources**, not merely within each source. Source order in the registry therefore also defines deterministic duplicate ownership.

The staged sentence files contain one clean sentence per line. Raw contributor metadata and upstream checksums remain in source-specific metadata reports; raw archives remain ignored local data.

### Source-mix invalidation

The Markov wrapper fingerprints:

- the canonical Serving-v1 Phrase/Mosaic export;
- every staged sentence-source SHA256;
- source code, accepted-row count, and deterministic weight.

If that mix changes, the resumable Markov work database is reset automatically before rebuilding. A stale transition model therefore cannot silently survive a changed corpus mix.


## English V2 source/model pipeline

English uses the same source-role contract but is materialized into a completely separate transition database.

Registry:

```text
sources/markov-sentence-sources-en-v1.json
```

Initial enabled English sources:

| Code | Source | Era | Role | Initial weight |
| --- | --- | ---: | --- | ---: |
| `leipzig_eng_news_2024_300k` | Leipzig English News 2024, 300K norm corpus | 2024 | `sentence` | 1 |
| `tatoeba_eng` | Tatoeba weekly English detailed export | contemporary/community | `sentence` | 1 |

The two languages never share transition tables.

```text
DE → data/local/rhymelab-markov-v2.sqlite
EN → data/local/rhymelab-markov-en-v2.sqlite
```

English acquisition:

```powershell
npm run markov:sources:plan:en
npm run markov:sources:acquire:en
npm run markov:sources:status:en
```

English model:

```powershell
npm run markov:model:plan:en
npm run markov:model:build:en
npm run markov:model:status:en
```

Language-specific all-in-one:

```powershell
npm run markov:data:bootstrap:en
```

Both languages:

```powershell
npm run markov:data:bootstrap
```

The bilingual bootstrap acquires DE, acquires EN, builds DE V2, then builds EN V2.

English local acquisition files live below:

```text
data/raw/markov-sources/en/
data/local/markov-sources/en/
```

and remain ignored local artifacts.

The server opens both compact models independently. `/api/markov/generate` selects the model by request language, and `/api/health` exposes both under `markov_generators.de` and `markov_generators.en`.

The Markov Lab language control enables each language only when its corresponding transition model is available.
