# German Phrase Pronunciation v1 — Phase 11C1

Last updated: 2026-09-18

## Purpose

Phase 11C1 turns source-backed phrase text into a deterministic phonetic representation suitable for later phrase and mosaic-rhyme retrieval.

It does **not** yet implement mosaic retrieval, phrase ranking, fuzzy phonetic distance, Markov generation, semantic vectors, or connected-speech generation.

The accepted single-word Writer remains frozen.

## Policy identifiers

```text
schema                    rhymelab-phrase-pronunciation-v1
phrase policy             de-phrase-pronunciation-v1
token resolver            writer-v5-preferred-surface-aware-v2
citation composition      preferred-token-citation-composition-v1
boundary policy           explicit-word-boundary-v1
connected speech policy   attested-or-explicit-rule-only-v1
IPA analyzer              de-ipa-v2
writer inventory          rhymelab-local-db-v5
```

## Source of phonetic truth

11C1 does not run a new G2P model and does not guess IPA for unknown tokens.

Every phrase token first retrieves Writer-v5 candidates by normalized surface. Candidate selection is then surface-aware so case-distinct lexical collisions such as `tu` vs `TU` do not collapse:

```text
phrase_token.normalized
  -> Writer candidates with same normalized form
  -> pronunciation_preferred=1
  -> pronunciation_eligible=1
  -> surface-aware deterministic selection
  -> stored IPA + Writer pronunciation id
```

Selection is deterministic. When multiple Writer forms share one normalized surface, the resolver prefers:

1. exact NFKC surface match, including case (`tu` before `TU` for a lowercase token);
2. dictionary + non-entity form;
3. any remaining non-entity form;
4. current over historical;
5. known/lower usage rank;
6. lower stable Writer form/pronunciation ids.

This is lexical collision handling, not contextual POS inference. If no Writer candidate exists, the token remains unresolved.

All source ids and selected Writer ids are retained.

## Why the base phrase catalog is not mutated

The Phase 11B1 semantic fingerprint is an accepted provenance baseline.

11C1 therefore does **not** rewrite:

```text
phrase_token.lexical_state
phrase_token.lexical_form_id
```

Instead it adds separate resolution and pronunciation tables. The builder computes the base catalog fingerprint before and after pronunciation materialization and fails if it changes.

## Storage

### phrase_token_pronunciation_resolution

One row per source phrase token.

Important fields:

- phrase/token identity;
- normalized candidate retrieval plus surface-aware lexical selection;
- resolution status;
- Writer form id;
- Writer pronunciation-row id;
- selected surface and IPA;
- historical/usage evidence;
- number of available Writer pronunciation variants;
- count of same-normalized Writer form candidates;
- pronunciation source/flags.

Current statuses:

```text
resolved_preferred
unresolved_no_writer_form
```

Unknown tokens stay unresolved. They are not guessed.

### phrase_pronunciation

One deterministic preferred citation pronunciation per fully resolved phrase in 11C1.

The v1 row stores:

- complete phrase IPA;
- canonical phoneme stream;
- syllable count;
- citation stress pattern;
- every primary- and secondary-stress syllable position;
- vowel/consonant sequences;
- existing German analyzer tail/vowel/coda keys;
- explicit word-boundary positions in phoneme and syllable coordinates;
- deterministic fingerprint.

The complete IPA joins token citation pronunciations with the explicit boundary marker `‿`.

Example shape:

```text
keine Ahnung
ˈkaɪ̯nə‿ˈaːnʊŋ
```

The boundary is stored as structure, not interpreted as a literal pause.

### phrase_pronunciation_token

Maps each token back into the continuous phrase pronunciation.

It stores:

- Writer form/pronunciation ids;
- token IPA;
- zero-based phoneme [start,end) span;
- zero-based syllable [start,end) span;
- token citation stress pattern;
- source;
- available pronunciation count.

These spans are the basis for later word-boundary-crossing mosaic alignment.

## Stress contract

11C1 does not invent one sentence-level or phrase-level main accent.

It preserves stress markers present in the accepted citation pronunciations and stores **all** primary/secondary stressed syllable positions in the composed phrase.

This is citation-level lexical stress evidence, not inferred sentence prosody.

Later retrieval may derive multiple right-edge or stress anchors from these positions; that is Phase 11D work.

## Variant policy

11C1 deliberately materializes only:

```text
variant_type = citation_preferred
variant_rank = 1
```

If a token has multiple accepted Writer pronunciations, the count is retained, but no Cartesian product is generated.

Therefore:

```text
alternate phrase variants generated = 0
connected-speech variants generated = 0
```

Future alternate phrase pronunciations require an explicit bounded policy.

## Connected speech

11C1 does not generate connected-speech pronunciations from unrelated corpus spelling variation.

Future variants must remain distinguishable, for example:

```text
citation_preferred
attested_surface
rule_derived_connected_speech
```

The connected-speech policy remains:

`attested-or-explicit-rule-only-v1`

## Build

Prerequisites:

```text
data/local/rhymelab-v5.sqlite
data/local/rhymelab-phrases-v1.sqlite
```

Run:

```powershell
npm run phrase:pronunciation
```

Default output:

```text
data/local/phrase-pronunciation-v1-report.json
```

The phrase SQLite database itself is enriched in place with the additive 11C1 tables.

## Required full-data gate

Review at least:

- resolved phrase-token count and token coverage percentage;
- fully pronounceable phrase count and phrase coverage percentage;
- top unresolved token surfaces;
- phrases blocked by unresolved tokens;
- distribution of available token pronunciation variants;
- phrase syllable-count distribution;
- examples of complete IPA and word-boundary positions;
- deterministic repeat fingerprint equality;
- exact preservation of the accepted Phase 11B1 base catalog fingerprint.

## Phrase Explorer

After materialization:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:3030/phrases
```

The explorer exposes:

- an `IPA ready` filter;
- phrase IPA;
- phrase syllable count and citation stress pattern;
- per-token IPA;
- phoneme spans;
- syllable spans;
- available pronunciation counts;
- unresolved token reasons where a phrase is not yet complete.

## Explicitly not implemented in 11C1

- mosaic candidate generation;
- cross-boundary phonetic windows;
- phrase/mosaic ranking;
- PanPhon or another feature-distance engine;
- gruut/G2P fallback;
- RhymePad-derived runtime logic;
- Markov recombination;
- embeddings/vector search;
- semantic reranking;
- phrase-level connected-speech generation.

Those are separate design decisions after pronunciation coverage is measured.
