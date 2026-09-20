# Markov Generator V1 — lyric-calibrated experimental surface

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

The generator is a constrained Markov line generator. RhymeLab Writer remains the authority for rhyme candidates and phonetic scores; the Markov model supplies local word-order evidence.

## Privacy boundary: owner lyrics are calibration only

Owner-provided lyrics are **not product training data**.

Hard rules:

- no private lyric JSON in Git;
- no lyric lines, titles, IDs or URLs in tests/docs/runtime assets;
- no n-grams or transition tables derived from the private lyric file in a shipped model;
- no distributable SQLite model trained from that private file;
- no private source path in committed artifacts.

The optional local analyzer is:

```bash
npm run markov:lyrics:analyze -- --input /absolute/path/to/private-lyrics.json
```

It writes only aggregate numeric/statistical output to the ignored local data area. The analyzer intentionally emits no raw text, identifiers, titles, URLs or transition sequences.

The runtime contains only the product-safe aggregate line-shape profile:

```text
rhymelab-lyric-shape-v1

default target       6 tokens
compact line floor   3 tokens
common line ceiling  ~9 tokens
long-line envelope   ~12 tokens
median stanza shape  4 lines
```

Those numbers calibrate line-length scoring and UI defaults. They do not permit reconstruction of any source lyric.

## No implicit three-million-sentence build

The previous experimental builder defaulted to the three Leipzig 1M sentence corpora. That behavior is removed.

```bash
npm run markov:model:plan
```

with no source now reports `ready:false` and exits non-zero. A model source must be explicit.

Examples:

```bash
npm run markov:model:build -- --sentences approved=/absolute/path/to/approved-lines.txt
```

or, for an explicitly selected registered manifest:

```bash
npm run markov:model:build -- \
  --manifest /absolute/path/to/manifest.json \
  --phrase-work /absolute/path/to/extracted
```

The owner-private lyric file is not an approved distributable model source.

## Model builder

The builder remains resumable and compact:

1. vocabulary + order-2 state census;
2. vocabulary/state pruning;
3. forward + reverse transition materialization;
4. per-state top-K pruning;
5. semantic fingerprint;
6. compact validation/promotion.

Current experimental defaults:

- order-2 model with order-1 backoff;
- forward and reverse transitions;
- minimum lexical token count: 3;
- up to 300,000 retained order-2 states;
- up to 24 outgoing transitions per state/direction/order;
- 5,000 accepted source lines per checkpoint batch.

These are implementation defaults, not frozen product acceptance criteria.

## Runtime architecture

```text
rhyme target
    ↓
accepted RhymeLab Writer retrieval/scoring
    ↓
Word / Phrase / Entity rhyme candidates
    ↓
select Writer-backed rhyme tail
    ↓
reverse Markov walk toward the left context
    ↓
forward context checks for opener and optional splice
    ↓
lyric-shape length scoring
    ↓
naturalness + rhyme + length reranking
    ↓
deterministic generated line variants
```

### Separation of responsibilities

**RhymeLab Writer**

- pronunciation;
- rhyme family/type;
- multisyllabic/slant/assonance/consonance evidence;
- Phrase/Mosaic;
- Entity rhyme candidates;
- usage/popularity evidence.

**Markov transition model**

- local word-order likelihood;
- forward context joins;
- reverse construction from a rhyme ending;
- context support for Phrase/Entity/internal-rhyme substitutions.

**Lyric shape profile**

- compact song-line length prior;
- line-length scoring envelope;
- future multi-line rhyme-distance/stanza priors.

The Markov model does not become a second phonetic truth store.

## Why reverse generation exists

For end-rhyme generation, a forward random walk followed by a rhyme replacement is structurally weak.

V1 instead chooses a real Writer-backed rhyme tail first and generates the preceding context backwards. The rhyme is therefore a generation constraint rather than a post-processing decoration.

Forward transitions remain useful for opener continuity and splice validation.

## Naturalness

The `Naturalness` control affects generation, not only display scoring.

Higher values:

- favor higher-probability transitions;
- require stronger model support for rhyme tails;
- reject unsupported opener joins;
- reject weak Phrase/Entity/internal substitutions;
- reduce exploratory shortlist depth.

Lower values permit less likely model-backed continuations.

This is still a statistical heuristic, not a grammar guarantee.

## Determinism

For a fixed model fingerprint, Writer candidate set, language, opener, rhyme target, controls and numeric seed, result construction and ordering are deterministic.

## Model availability

The local server exposes the active model through `/api/health` under `markov_generator`.

Generation uses:

```text
POST /api/markov/generate
```

If no explicit model has been materialized, generation is disabled. There is no hand-written template fallback and no implicit corpus bootstrap.

## Current acceptance state

Implemented and covered:

- private-input ignore rules;
- privacy-safe aggregate analyzer;
- no implicit 3M corpus selection;
- explicit-source model builds;
- compact forward/reverse model materialization;
- deterministic generation;
- aggregate lyric-line length calibration;
- Writer-backed rhyme tails;
- Phrase/Entity context gating;
- mobile/reduced-motion control coverage.

Still pending:

- selection of the distributable/licensed lyric-like training source;
- full-size model build from that approved source;
- repeat-build fingerprint evidence;
- final DB size and runtime latency;
- human review of lyric naturalness and rhyme quality;
- multi-line stanza/rhyme-scheme generation;
- RhymePad integration;
- Full-edition packaging.

Until those gates are complete, `/markov-test` remains an experimental surface.
