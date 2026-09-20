# Markov Generator V1 — Corpus-backed experimental surface

## Status

**Experimental implementation candidate. Not product-accepted and not yet integrated into RhymePad.**

Development route:

```text
/markov-test
```

Generator policy:

```text
rhymelab-markov-corpus-v1
```

Model schema:

```text
rhymelab-markov-model-v1
```

The hand-written bootstrap sentence templates have been removed. The test surface now requires a materialized local corpus model. If that model is missing, generation is disabled rather than falling back to fabricated structural templates.

## Source corpus

The German V1 model consumes the same frozen Leipzig sentence sources already registered for Phase 11 phrase evidence:

- `deu_news_2024_1M`;
- `deu_wikipedia_2021_1M`;
- `deu-de_web_2021_1M`.

The authoritative source manifest is:

```text
sources/leipzig/de10k-v1-frozen.json
```

Those raw archives and extracted sentence files remain owner-local data and are not committed to Git.

The default builder expects sentence files produced by the existing Phrase bootstrap under:

```text
data/work/de-phrase-catalog-v1/extracted/
```

## Build

Inspect the expected sources and configuration without writing the model:

```bash
npm run markov:model:plan
```

If the Leipzig sentence files are not present locally:

```bash
npm run phrase:catalog:bootstrap
```

Build or resume the model:

```bash
npm run markov:model:build
```

Inspect build/model state:

```bash
npm run markov:model:status
```

The default build is deliberately bounded rather than retaining every observed transition:

- order-2 Markov state;
- order-1 backoff;
- forward and reverse transition indexes;
- minimum lexical token count: 3;
- up to 300,000 retained order-2 states;
- up to 24 outgoing transitions per state / direction / order;
- 5,000 accepted sentences per checkpoint batch.

These are **experimental V1 parameters**, not a frozen product acceptance decision.

## Long-running build contract

The builder is resumable and treats model materialization as a durable local build:

1. vocabulary + order-2 state census;
2. vocabulary/state pruning;
3. forward + reverse transition materialization;
4. per-state top-K pruning;
5. semantic fingerprint;
6. compact validation/promotion.

The work database persists per-source checkpoints for the scan and transition phases.

A build-configuration fingerprint binds the resumable work database to:

- source manifest;
- source file identity metadata;
- model policy/order;
- state and transition caps;
- token-count cutoff;
- optional sentence limit.

If those inputs/options change, the existing work database is rejected until the owner explicitly rebuilds with `--reset`.

Promotion writes a temporary final SQLite, validates it, preserves the previous final artifact during replacement, strips build-only checkpoint/state-census tables, runs `VACUUM`, and only then replaces the active model.

## Runtime architecture

The V1 runtime separates language modeling from rhyme truth:

```text
rhyme target
    ↓
accepted RhymeLab Writer retrieval / scoring
    ↓
Word / Phrase / Entity rhyme candidate pool
    ↓
candidate corpus-support check
    ↓
select a rhyme tail
    ↓
reverse Markov walk from that tail
(order 2 → order 1 backoff)
    ↓
optional opener / seed boundary check
    ↓
optional context-gated internal echo / Phrase / Entity splice
    ↓
transparent naturalness + rhyme + length reranking
    ↓
deterministic generated variants
```

The Markov model does **not** replace accepted RhymeLab phonetic relation truth. Writer remains responsible for supplying and scoring the rhyme material.

### Why reverse transitions exist

For end-rhyme generation, generating a random sentence forward and hoping that its last word rhymes is wasteful and weak.

V1 instead selects a Writer-backed rhyme candidate first and generates the left context backwards from the rhyme tail. The rhyme is therefore a generation constraint, not a decorative post-processing substitution.

Forward transitions remain useful for:

- opener/seed continuity;
- validating generated local context;
- Phrase/Entity/internal-echo splice checks;
- diagnostics.

## Naturalness control

The `Naturalness` slider now changes generation behavior rather than only changing a final display score.

Higher values:

- narrow transition choice toward higher-probability corpus continuations;
- prefer rhyme tails whose tokens are represented in the language model;
- reject unsupported opener-to-generated-text joins;
- reject Phrase/Entity/internal substitutions with weak local transition support;
- reduce exploratory shortlist depth.

Lower values permit progressively less likely but still model-backed transitions.

Naturalness is still a deterministic corpus-likelihood heuristic. It is **not** evidence that a sentence is grammatically or artistically good.

## Phrase and Entity behavior

Phrase and Entity material remains optional.

It is no longer labeled as such merely because a generic slot asked for it. The selected Writer result kind is authoritative.

V1 can use Phrase/Entity material as:

- a Writer-backed rhyme tail;
- an optional internal echo when the surrounding forward corpus transitions provide sufficient support.

At high Naturalness, an Entity or Phrase that has no usable language-model support is not force-inserted merely because it has a high phonetic score.

## Determinism

For fixed:

- model semantic fingerprint;
- Writer candidate rows;
- language;
- opener;
- rhyme target;
- controls;
- numeric seed;

candidate construction and ordering are deterministic.

The UI can generate a new numeric seed, but exposes it for replay.

## Current diagnostics

The result surface exposes separate signals:

- overall utility;
- naturalness;
- rhyme;
- transition likelihood;
- opener/context join;
- tail fit;
- internal echo;
- target-length fit.

Generated output remains visibly distinct from source-backed Phrase results.

## Model availability

The local server exposes model state through `/api/health` under `markov_generator`.

Generation uses the localhost-only:

```text
POST /api/markov/generate
```

The browser sends a compact projection of the already-retrieved Writer candidate pool rather than duplicating Writer retrieval/scoring inside the Markov runtime.

If the model is absent or invalid, the API returns an explicit unavailable error and the UI disables generation. There is no bootstrap-template fallback.

## Language scope

The first corpus-backed model is German only.

The UI disables unsupported languages when the active model reports `language=de`.

English Writer remains accepted independently, but Markov EN generation is not enabled until a reproducible/licensable English corpus/model is selected and materialized under an explicit model policy.

## Non-claims / remaining acceptance work

This code does **not** claim that the full owner corpus model has already passed product acceptance.

The implementation and fixture tests exist, but this development environment does not contain the owner-local three-million-sentence Leipzig inputs. Therefore the following evidence is still pending:

- full 3M-sentence owner model materialization;
- repeat-build semantic fingerprint;
- final model bytes;
- full-model generation latency;
- transition/state counts after real pruning;
- duplicate/repetition diagnostics;
- sentence naturalness/grammatical-breakage review;
- rhyme-pressure vs naturalness tradeoff curves;
- Phrase splice quality;
- Entity insertion quality;
- representative writer review, especially difficult targets such as `Arbeitsweise`;
- RhymePad integration;
- Full-edition packaging.

Until those gates are completed, this remains an experimental test surface rather than accepted product behavior.
