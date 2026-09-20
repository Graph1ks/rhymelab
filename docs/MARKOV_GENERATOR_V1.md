# Markov Generator V1 — lyric-shaped, RhymeLab-trained experimental surface

## Status

**Experimental implementation candidate. Not product-accepted and not yet integrated into RhymePad.**

Development route:

```text
/markov-test
```

Generator policy:

```text
rhymelab-markov-lyric-v1
```

Model schema:

```text
rhymelab-markov-model-v1
```

## Architecture in one sentence

Private owner lyrics contributed only **aggregate songwriting structure**; the actual distributable Markov transition model is built from RhymeLab's existing Phrase/Mosaic catalog.

```text
private lyrics
    ↓ one-time aggregate analysis only
public lyric-shape profile
    +
RhymeLab Phrase/Mosaic catalog
    ↓
forward + reverse transition model
    +
RhymeLab Writer rhyme truth
    ↓
generated lyric-shaped line
```

## Private lyric boundary

Owner-provided lyrics are **not model transition data**.

The repository and shipped model contain none of the following from the private source:

- lyric text;
- titles;
- song IDs;
- URLs;
- private n-grams;
- private transition tables;
- private model SQLite.

The public code contains only aggregate structure in:

```text
src/markov-lyric-profile.mjs
```

Current profile:

```text
policy                rhymelab-lyric-shape-v1
default target        6 tokens
compact line floor    3 tokens
common line ceiling   ~9 tokens
long-line envelope    ~12 tokens
median stanza shape   4 lines
```

Those parameters are intentionally generic and reusable by every RhymeLab installation.

An optional developer-only analyzer remains available for future recalibration:

```bash
npm run markov:lyrics:analyze -- --input /absolute/path/to/private-lyrics.json
```

Its report contains aggregate numbers only and is written to ignored local data.

## Default transition source

The old automatic three-million-Leipzig-sentence build is gone.

The default model source is now the already-materialized RhymeLab German Phrase/Mosaic database:

```text
data/local/rhymelab-phrases-v1.sqlite
```

Eligible source rows are:

```sql
phrase.modern_eligible = 1
AND phrase.token_count BETWEEN 2 AND 16
```

The source wrapper exports a deterministic ignored work file, ordered by stable `phrase_id`, and feeds that into the compact transition builder. Historical-only phrases are excluded.

The export is an intermediate local build artifact, not committed product source.

## Build commands

After pulling the branch:

```bash
npm run markov:model:plan
npm run markov:model:build
npm run markov:model:status
```

If `data/local/rhymelab-phrases-v1.sqlite` is missing:

```bash
npm run phrase:catalog:bootstrap
npm run markov:model:build
npm run markov:model:status
```

The normal user does **not** provide a corpus or private lyric file.

The default build:

1. reads the existing Phrase/Mosaic catalog;
2. exports eligible phrases to `data/work/markov-v1/rhymelab-phrase-lines.txt`;
3. retains two-word and longer phrase transitions;
4. builds/resumes the compact forward/reverse transition SQLite;
5. promotes the final model to `data/local/rhymelab-markov-v1.sqlite`.

For development experiments only, an explicit arbitrary source can still be used through:

```bash
npm run markov:model:build:explicit -- --sentences experiment=/absolute/path/to/lines.txt
```

That is not the default product path.

## Model builder

Current experimental model:

- order 2;
- order-1 backoff;
- forward and reverse transitions;
- minimum sequence length: 2 tokens for the Phrase/Mosaic source;
- minimum token frequency: 1 for the Phrase/Mosaic source;
- up to 300,000 retained order-2 states;
- up to 24 outgoing transitions per state/direction/order;
- resumable 5,000-line checkpoint batches;
- deterministic semantic fingerprint;
- compact final SQLite with build-only census/checkpoint tables removed.

When the Phrase/Mosaic export changes, the wrapper resets the resumable work DB automatically so stale transitions cannot survive a source change.

## Runtime responsibilities

### RhymeLab Writer

Writer remains authoritative for:

- pronunciation;
- rhyme type/family;
- perfect/slant/multisyllabic relations;
- assonance/consonance;
- Phrase/Mosaic candidates;
- Entity candidates;
- usage/popularity evidence.

### Markov transition model

The transition DB provides:

- local word-order evidence;
- backward generation from a rhyme tail;
- forward opener/context validation;
- local support for Phrase/Entity/internal-rhyme splices.

### Public lyric-shape profile

The structure profile provides:

- compact song-line length prior;
- line-length scoring envelope;
- future stanza/repetition/rhyme-distance priors.

It does not contain vocabulary learned from the private lyrics.

## Generation path

```text
rhyme target
    ↓
RhymeLab Writer candidate pool
    ↓
select Writer-backed rhyme tail
    ↓
reverse transition walk from tail
    ↓
forward context validation
    ↓
lyric-shape length prior
    ↓
naturalness + rhyme + length scoring
    ↓
deterministic variants
```

Reverse generation makes the rhyme a hard construction constraint instead of generating arbitrary text and replacing the last word afterward.

## Model availability

The local server exposes model status at:

```text
/api/health → markov_generator
```

If the final transition DB is absent, the UI states:

```text
Markov transition database missing — run npm run markov:model:build.
```

This is deliberately distinct from the lyric-shape profile, which is compiled into the code and is always present.

## Acceptance state

Implemented and covered:

- public aggregate lyric-shape profile;
- private lyric source excluded from model/runtime;
- privacy-safe aggregate analyzer;
- RhymeLab Phrase/Mosaic as the default transition source;
- one-command default model build;
- deterministic phrase export;
- historical-only phrase exclusion;
- two-token phrase support;
- compact forward/reverse model materialization;
- deterministic generation;
- Writer-backed rhyme tails;
- Phrase/Entity context gating;
- explicit missing-model UI command;
- mobile/reduced-motion control coverage.

Still pending product acceptance:

- owner build against the full local Phrase/Mosaic catalog;
- resulting model row counts, bytes and semantic fingerprint;
- generation latency;
- representative human quality review;
- coverage diagnostics for difficult rhyme tails;
- multi-line rhyme-scheme generation;
- RhymePad integration;
- Full-edition packaging.

Until those gates are completed, `/markov-test` remains experimental.
