# German Phrase / Mosaic Rhyme — Phase 11 Plan

Last updated: 2026-09-17

## Goal

Extend the accepted German single-word writer baseline into deterministic multi-word writer search: phrase rhyme, mosaic rhyme, and phraseological continuations that can match a query phonetically across word boundaries while remaining useful to lyricists.

The single-word writer baseline is frozen reference evidence. Phase 11 must not silently retune `deterministic_writer_utility_v6`, `de-right-edge-anchors-v1`, `de-attested-right-head-v4`, or the accepted single-word regression set.

## Hard boundaries

Core runtime remains local-only and deterministic. Do not introduce LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads, or runtime network dependencies.

Phrase/mosaic output must be source-backed or deterministically generated from source-backed phrase material. Do not fabricate idioms, quotations, metaphors, collocations, or phrase frequency claims.

## Human-reference timing

Independent Writer Page human NDCG is deliberately deferred until the German writer system is feature-complete enough to evaluate as one coherent product surface. The current owner is not treated as an independent human-reference source.

Until an independent reviewer pool or other defensible human-reference process exists, NDCG@10/20 remains `pending_reference`. Structural, regression, provenance, lexical-safety, determinism, and performance gates continue to be required during development.

## Phase 11A — public-source survey and licensing gate

Before runtime implementation, identify publicly obtainable sources that can legally and reproducibly support at least these layers:

1. multi-word phrases and common n-grams / collocations;
2. idioms and fixed expressions / Redewendungen;
3. metaphorical or figurative expressions where source licensing and structure permit deterministic ingestion;
4. common sentence fragments / formulaic language useful for lyric continuation;
5. lexical-semantic relations useful for phrase discovery without becoming an ML ranking dependency.

For every candidate source record:

- source/project name;
- public download/API location;
- license and redistribution obligations;
- language/snapshot/version;
- downloadable raw format;
- approximate scale;
- whether phrase text is available directly or must be derived;
- provenance key that can survive into local data;
- whether commercial redistribution is compatible with RhymeLab's distribution model;
- whether attribution/share-alike boundaries require separate artifacts;
- whether runtime can operate fully offline after ingestion.

No source is accepted merely because it is publicly viewable. License compatibility and reproducible bulk access are required.

## Phase 11B — phrase data model

Design a separate local phrase layer rather than overloading the single-word `hot` table. Minimum conceptual fields should cover:

- canonical phrase text;
- normalized tokens;
- source/provenance;
- phrase type(s): free phrase, collocation, idiom, fixed expression, proverb/formulaic expression, figurative expression, other source-backed class;
- lexical/register/style tags where attested;
- usage/commonness evidence where available;
- token-level lexical identities when available;
- phrase-level pronunciation sequence derived from attested/accepted token pronunciations;
- word-boundary positions;
- syllable/stress/nucleus sequence across boundaries;
- historical/current eligibility;
- deterministic eligibility reason when a phrase cannot be pronounced reliably.

Phraseology must remain separate from phonetic truth: an expression being an idiom or metaphor affects usefulness/filtering, not whether the sound relation is real.

## Phase 11C — deterministic phrase pronunciation

Construct phrase pronunciations from the accepted local pronunciation inventory. Preserve token pronunciation provenance and do not silently replace unknown tokens with guessed pronunciations.

Connected-speech variants may be added only when backed by explicit deterministic rules or attested source evidence and must remain distinguishable from lexical citation pronunciations.

Required diagnostics include:

- token coverage rate;
- phrase coverage rate;
- alternate-pronunciation explosion;
- unknown-token reasons;
- boundary/stress preservation;
- deterministic reconstruction tests.

## Phase 11D — mosaic retrieval architecture

A mosaic rhyme is a phonetic match whose aligned rhyme span can cross one or more word boundaries in the candidate phrase.

The first architecture should reuse the accepted German phonology/scorer primitives where possible while introducing explicit phrase-span alignment. Candidate generation must avoid scanning every phrase at query time; design materialized/indexed right-edge phrase anchors or an equivalent deterministic local index.

Keep separate evidence for:

- whole phrase pronunciation;
- matched phrase suffix/span;
- token boundaries crossed by the match;
- primary/secondary stress anchors;
- number of syllables/nuclei matched;
- relation class and score;
- lexical/phrase usefulness signals.

## Phase 11E — writer-oriented phrase ranking

Phrase ranking is a new policy and must not mutate the accepted single-word writer policy in place.

Candidate signals may include, when source-backed and deterministic:

- phonetic relation strength;
- matched span length;
- stress alignment;
- number of word boundaries crossed;
- phrase/commonness evidence;
- lexical novelty relative to the query;
- phraseological type;
- register/style safety;
- duplicate / near-duplicate / same-template diversity.

Do not promote a phrase merely because it is semantically interesting if its phonetic match is weak. Do not promote a phonetically strong phrase that is source-unsupported garbage merely to fill a page.

## Phase 11F — benchmark

Create a dedicated German phrase/mosaic benchmark rather than reusing the single-word benchmark as if it were equivalent.

Initial structural/regression gates should cover:

- exact multi-word rhymes;
- strong mosaic matches crossing one boundary;
- matches crossing multiple boundaries;
- secondary-stress cases;
- short-query false positives;
- common-vs-obscure phrase safety;
- idiom/fixed-expression provenance;
- duplicate and template diversity;
- pronunciation ambiguity;
- historical/dated phrase filtering;
- performance on large phrase pools;
- deterministic repeatability.

Human usefulness NDCG should be collected only when the combined German writer surface is mature enough and independent reviewers are available.

## Immediate next action

Begin with Phase 11A only: research and document candidate public German phrase/phraseology datasets, their licenses, bulk-access methods, scale, and likely role. Produce a source decision before implementing the phrase database or runtime.
