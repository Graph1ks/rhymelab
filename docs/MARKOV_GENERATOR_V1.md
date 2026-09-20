# Markov Generator V1 — Experimental Test Surface

## Status

**Experimental implementation candidate. Not product-accepted and not yet integrated into RhymePad.**

The current implementation exists to exercise the generator contract, controls, phonetic modes and UI behavior before the corpus-trained Markov model is materialized.

Development route:

```text
/markov-test
```

Runtime policy:

```text
rhymelab-markov-bootstrap-v1
```

## Boundary

Markov remains a live local generator. It does not materialize a giant database of generated sentences.

The experimental V1 uses two distinct layers:

1. a compact deterministic order-2 bootstrap transition model for sentence structure;
2. live RhymeLab Writer candidates as the lexical material inserted into those structures.

The lexical pool comes from the existing unified Writer runtime and therefore may contain, subject to the UI controls:

- Words;
- Phrase/Mosaic results;
- Entities;
- the existing Generated layer when the active runtime exposes it.

The bootstrap structural model is intentionally temporary. It proves the generator/runtime/UI surface without pretending that the final natural-language model has already been trained.

## Runtime flow

```text
opener / rhyme target / settings / seed
              ↓
RhymeLab unified Writer candidate pool
              ↓
bootstrap Markov transition path
              ↓
typed slot materialization
Word / Phrase / Entity / rhyme slot
              ↓
mode-aware phonetic candidate selection
              ↓
naturalness + rhyme + length reranking
              ↓
deterministic variants
              ↓
animated Markov Lab presentation
```

Unknown rhyme targets reuse the accepted client-side total query-pronunciation resolver. Generated query pronunciation remains an ephemeral query anchor and does not become lexical truth.

## Determinism

For a fixed:

- generator policy;
- model;
- candidate input rows;
- language;
- opener;
- rhyme target;
- controls;
- numeric seed;

the generated candidate order is deterministic.

The UI may create a new random seed, but the resulting numeric seed is exposed so a generation can be reproduced.

## Controls

The experimental surface exposes:

- DE / EN;
- opener / seed text;
- rhyme target;
- target token length;
- rhyme pressure;
- naturalness pressure;
- weirdness / shortlist depth;
- deterministic seed;
- Word material;
- optional Phrase material;
- optional Entity material;
- optional Generated material when available.

Rhyme modes:

- Balanced;
- End rhyme;
- Multisyllabic;
- Mosaic;
- Slant;
- Assonance;
- Assonance chain;
- Consonance;
- Internal rhyme.

The modes are generator-selection/reranking controls. They do not redefine the accepted Word/Phrase/Entity relation truth.

## Current scoring surface

The test UI keeps major signals visible rather than hiding them behind one unexplained score:

- generator utility;
- transition/lexical naturalness;
- rhyme score;
- assonance-chain score;
- internal-rhyme density proxy;
- target-length fit.

The current naturalness score is a bootstrap combination of transition probability and available source-backed lexical/commonness/popularity evidence. It is **not** acceptance evidence for sentence naturalness.

## UI contract

The Markov Lab is isolated from the main Writer and RhymePad.

Primary controls use a full control-surface preflight before handlers are installed. Initialization failure is visible and marks the page control state as failed.

The result stage intentionally uses a playful generation sequence:

1. a short "MARKOV IS COOKING" candidate shuffle;
2. staggered token materialization;
3. source-aware token styling;
4. score diagnostics and alternate deterministic variants.

Mobile behavior stacks the output before the controls, avoids nested scrolling containers, keeps the primary Generate control reachable and respects `prefers-reduced-motion`.

## Non-goals of this V1

This implementation does **not** claim:

- that the final corpus Markov model exists;
- sentence-naturalness acceptance;
- a finalized n-gram order;
- finalized corpus selection or weighting;
- syntax/POS-slot acceptance;
- Entity-context acceptance;
- Phrase splice acceptance;
- RhymePad integration;
- Full distribution packaging;
- a product latency gate.

## Next engineering phase

Replace the bootstrap transition model with a reproducibly built, compact transition model trained from legally compatible attested language material.

The build must follow the repository long-running-job standard where applicable and should preserve the same generator-facing contract so UI/Rhymepad integration does not depend on model-storage details.

The corpus phase should measure at least:

- sentence-start/end quality;
- transition coverage;
- model bytes;
- generation latency;
- duplicate/repetition rate;
- naturalness;
- grammatical breakage;
- Phrase splice quality;
- Entity insertion quality;
- rhyme-pressure tradeoff curves;
- assonance-chain behavior;
- deterministic repeatability.

Only after that evidence should the generator be considered for RhymePad integration and Full-edition packaging.
