# Future Phrase Generation / Natural-Language Rhyme Retrieval

Last updated: 2026-09-18

Status: **deferred design note — preserve for post-11D/11E work**

This document records a future RhymeLab direction discussed during Phase 11. It is intentionally **not** part of the current phrase-pronunciation or mosaic implementation.

The immediate project sequence remains:

```text
11C phrase pronunciation / coverage
        ↓
11D deterministic mosaic retrieval
        ↓
11E phrase Writer ranking
        ↓
then evaluate retrieval-first generation/recombination
```

## Product idea

The long-term target is not just a rhyme dictionary.

RhymeLab should be able to retrieve and eventually recombine **natural, attested language fragments** that satisfy phonetic, rhythmic, register, usage and optionally semantic constraints.

Conceptually:

```text
Natural Language Rhyme Retrieval System
```

Example query:

```text
target: "Leben im Wahn"

requirements:
- 4–6 syllables
- mosaic rhyme
- strong assonance
- no trivial perfect end-rhyme
- colloquial register
- high naturalness / corpus support
- semantic direction: "Kontrollverlust"
- max 20 results
```

The key design principle is **retrieval first, generation second**.

## Why this fits RhymeLab

RhymeLab already owns the expensive linguistic substrate that generic text generators normally lack:

- a large German word database;
- accepted pronunciations / IPA;
- syllable and stress analysis;
- phoneme, vowel and consonant sequences;
- usage/commonness evidence;
- lexical/morphological analyses;
- phrase catalog and source provenance;
- phrase pronunciation and word-boundary coordinates.

That allows phrase generation/recombination to operate over linguistically grounded candidates instead of asking a generator to invent rhymes from scratch.

## Proposed data layers

A future local database may expose four related layers.

### Words

```text
word/form
lemma
IPA
phoneme sequence
syllables
stress
POS / lexical analysis
usage/commonness
style/register
semantic tags where source-backed
```

### Phrases / chunks

```text
text
token span
phoneme sequence
vowel sequence
consonant sequence
stress pattern
syllable count
word-boundary positions
register
corpus/source frequency
provenance
left/right context
optional semantic representation
```

### Utterance context

For sources where licensing/provenance permits:

```text
utterance
preceding context
following context
document/register metadata
```

This is useful for estimating whether a phrase fragment occurs as real language rather than only as a lexical dictionary entry.

### N-grams / phrase fragments

Potentially materialize attested fragments such as:

```text
2-word
3-word
4-word
5-word
6-word
```

from suitable public corpora.

Do **not** treat every raw n-gram as phraseology. Candidate generation needs deterministic quality gates such as frequency, association, boundary quality, punctuation/sentence constraints, lexical quality and source provenance.

## Cross-word phonetic windows

The central future retrieval structure should not be limited to complete phrase pronunciations.

For each attested phrase/chunk, generate phonetic windows across word boundaries, for example:

```text
1 syllable
2 syllables
3 syllables
4 syllables
5 syllables
possibly longer bounded windows
```

A phrase such as:

```text
neben der Bar
```

becomes a continuous phonetic stream while retaining token ownership and boundary coordinates.

The query then becomes:

> Which attested one-or-more-word span has a similar stressed-vowel/coda/phoneme sequence to the target?

The returned result must retain:

- source phrase/chunk;
- matching start/end token;
- matching start/end syllable;
- number of crossed word boundaries;
- source/corpus evidence;
- naturalness/commonness evidence.

This is the core bridge from Phase 11D mosaic retrieval to later phrase recombination.

## Retrieval should remain multi-signal

Do not collapse all usefulness into one opaque number.

Potential components:

```text
rhyme_score
assonance_score
consonance_score
stress_score
syllable_fit
phonetic_distance
naturalness
commonness
register_fit
semantic_score       (optional/non-core)
novelty
lexical_quality
```

The product may later expose controllable tradeoffs such as:

```text
MORE RHYME  <------>  MORE NATURAL
MORE EXACT  <------>  MORE WEIRD
MORE KNOWN  <------>  MORE NOVEL
```

The underlying components should stay inspectable even if a future UI combines them.

## Markov / recombination concept

The interesting Markov use case is **not**:

```text
Markov model -> invent arbitrary lyrics
```

Instead:

```text
phonetic retrieval
        ↓
hundreds of attested natural chunks
        ↓
context / syntax / register constraints
        ↓
Markov or bounded phrase recombination
        ↓
phonetic + naturalness reranking
        ↓
small candidate set
```

Possible deterministic recombination mechanisms:

- n-gram Markov transitions over attested chunks;
- template mutation;
- phrase splice at compatible POS / boundary patterns;
- constrained left/right continuation;
- rhyme-tail-preserving substitution;
- syntax-pattern preserving recombination.

Markov is attractive because it can remain local, deterministic given a fixed model and seed/policy, explainable, and cheap.

Any generated result must be clearly distinguishable from a source-attested phrase.

## Retrieval-first generation pipeline

Example:

```text
input:
"ich komm hier nicht mehr raus"

        ↓

IPA / phonological target

        ↓

mosaic phonetic retrieval

        ↓

attested candidates such as:
"quer durchs Haus"
"mehr daraus"
"schwer voraus"
...

        ↓

natural-language context / n-gram evidence

        ↓

bounded recombination / Markov / template mutation

        ↓

phonetic + usage + register + syntax reranker

        ↓

final writing suggestions
```

This is intentionally stronger than asking a generic generator for a rhyme because candidate material is grounded in RhymeLab's pronunciation and corpus evidence first.

## External projects / packages to evaluate later

These are **research leads**, not accepted dependencies.

### RhymePad

Potential role: architecture/reference implementation for rhyme detection, including multi-word/mosaic handling.

Interesting characteristics from the earlier research discussion:

- phoneme-oriented rhyme detection;
- end/internal/slant/multisyllabic/multi-word concepts;
- engine separated from UI;
- English-oriented pronunciation assumptions.

Do not copy or integrate blindly. Before use, independently verify current code, license, architecture and test behavior. German RhymeLab should keep its own accepted pronunciation inventory and policies.

### PanPhon

Potential role: articulatory-feature-based phonetic distance.

This may improve future:

- slant-rhyme distance;
- vowel similarity;
- consonant similarity;
- feature-aware edit distance.

It should be benchmarked against RhymeLab's existing phonological scorer rather than replacing it by assumption.

### gruut

Potential role: future German/English pronunciation fallback or comparison baseline.

RhymeLab currently does **not** use a G2P fallback in Phase 11C1. Any future use must first pass provenance, license, quality and deterministic coverage benchmarks.

The primary pronunciation truth should remain the accepted RhymeLab inventory unless an explicit later policy supersedes it.

### SQLite FTS5

Potential role: local lexical/context search over attested phrase/chunk text.

This is compatible with the local deterministic architecture.

### sqlite-vec / embeddings

Potential role: experimental semantic similarity over local phrase/chunk vectors.

Important architecture boundary: current RhymeLab core explicitly forbids ML/neural inference in the core search path. Therefore embedding generation/vector semantic search is **not approved core architecture**.

It may only be investigated later as an optional experimental/non-core layer after an explicit architecture decision. Core rhyme retrieval must remain usable, deterministic and reproducible without it.

### LLM recombination

The earlier brainstorming included LLM-assisted phrase recombination after retrieval.

This is **not approved for the RhymeLab core** under current project rules.

If ever explored, it must be optional and downstream of deterministic retrieval, never required for phrase indexing, rhyme truth, ranking reproducibility or local core operation.

## Corpus strategy for future natural chunks

A future phase should explicitly research public/licensable sources for:

- idioms / Redewendungen;
- proverbs;
- metaphors / figurative constructions;
- collocations;
- modern conversational fragments;
- contemporary colloquial phrases;
- sentence fragments suitable for songwriting;
- attested 2–6-token chunks.

Current useful foundations:

- Wiktionary phraseological entries;
- Leipzig corpora for attestation/commonness;
- optional semantic resources already identified in the source survey.

Potential future direction:

- derive bounded 2–6-token candidate fragments from Leipzig or another legally compatible corpus;
- retain source counts and contexts;
- apply deterministic association/naturalness filters;
- never equate raw n-gram frequency with idiom/metaphor status.

RUEG was evaluated against the real local DAKODA archives and removed because its learner/register utterance content did not provide enough direct phraseology/metaphor/idiom value for this goal.

## Current unresolved pronunciation coverage

Phase 11C1 currently resolves most phrase tokens from the accepted Writer-v5 inventory, but some complete phrases remain blocked by missing word forms.

Observed example in the Phrase Explorer:

```text
auf Hochtouren

auf         resolved_preferred
hochtouren  unresolved_no_writer_form
```

This is a useful future coverage class: ordinary phrase components absent from Writer-v5 should be distinguished from historical spellings, proper names, foreign text and noise.

Do not immediately solve these by adding a generic G2P fallback. First classify unresolved phrase tokens by quality/commonness and measure how much phrase coverage a targeted lexical expansion would recover.

## Recommended future sequence

After Phase 11C/11D/11E are stable:

1. classify unresolved phrase-token coverage and add only high-value lexical coverage;
2. materialize cross-word phonetic windows;
3. benchmark exact/slant/mosaic phrase retrieval;
4. investigate corpus-derived 2–6-token natural chunks;
5. add explicit naturalness/register/commonness features;
6. evaluate feature-aware phonetic distance (PanPhon-style or native equivalent);
7. prototype deterministic retrieval-first Markov/template recombination;
8. only then evaluate optional semantic/vector or external-generator layers;
9. keep attested vs generated material visibly separate;
10. benchmark writing usefulness before product promotion.

## Non-goals for the current milestone

Do not let this design note delay or contaminate current 11C/11D work.

Not current work:

- Markov generation;
- phrase-splicing generation;
- embeddings;
- sqlite-vec;
- LLM generation;
- new G2P fallback;
- adoption of RhymePad/PanPhon/gruut as production dependencies.

The current next engineering problem remains deterministic phrase/mosaic retrieval over the pronunciation data already built.
