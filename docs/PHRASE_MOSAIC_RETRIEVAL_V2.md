# German Phrase Mosaic Candidate Retrieval v1 — Phase 11D2

Last updated: 2026-09-18

## Purpose

Phase 11D2 turns the accepted 11D1 cross-word window substrate into bounded, index-backed mosaic-rhyme candidate retrieval.

11D2 is still a **phonetic candidate layer**. It does not decide which phrase is most useful to a lyricist. Phrase commonness, phrase type, register, lexical novelty, duplicate/template diversity and final Writer ordering remain Phase 11E concerns.

## Preconditions

Accepted inputs:

```text
11C1 pronunciation fingerprint
fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548

11D1 window fingerprint
24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
```

11D2 must not mutate either accepted substrate.

## Why a separate retrieval-anchor table exists

The 11D1 `phoneme_key` stores every phoneme in the window, including the onset of its first syllable.

German rhyme truth in the accepted `de-phon-v3` scorer deliberately ignores the onset of the first rhyme-domain syllable. Therefore using the raw 11D1 phoneme key as an exact-rhyme key would incorrectly reject valid pairs that differ only in that onset.

11D2 keeps 11D1 frozen and adds:

```text
phrase_mosaic_retrieval_anchor
```

with keys derived in the same rhyme domain used by the accepted scorer.

## Policy identifiers

```text
schema          rhymelab-phrase-mosaic-retrieval-v1
retrieval       de-bounded-indexed-mosaic-retrieval-v1
anchor policy   de-mosaic-rhyme-anchors-v1
scorer          de-phon-v3
```

## Materialized anchor keys

One retrieval-anchor row exists per accepted 11D1 window.

Stored keys:

- `exact_tail_key`: full aligned rhyme-domain phoneme tail with the first onset excluded;
- `vowel_key`: complete nucleus sequence across the window;
- `final_nucleus`;
- `final_coda_key`;
- `final_coda_class`: existing deterministic German coarse coda class;
- syllable count;
- citation stress pattern;
- stable row fingerprint.

Indexes:

```text
idx_phrase_mosaic_retrieval_exact
  (exact_tail_key, syllable_count, window_id)

idx_phrase_mosaic_retrieval_vowel_coda
  (vowel_key, final_coda_key, syllable_count, window_id)

idx_phrase_mosaic_retrieval_vowel
  (vowel_key, syllable_count, window_id)

idx_phrase_mosaic_retrieval_final
  (final_nucleus, final_coda_class, syllable_count, window_id)
```

## Query anchors

The query reuses the accepted German right-edge anchor policy:

- primary stressed rhyme domain;
- eligible later secondary-stress anchors;
- only tails between 2 and 6 syllables for the current 11D1 substrate.

No new phonological truth model is introduced.

## Candidate channels

For each eligible query anchor, 11D2 performs four indexed lookups:

1. **exact_tail** — exact rhyme-domain tail and equal syllable count;
2. **vowel_coda** — exact full vowel sequence + exact final coda + equal syllable count;
3. **vowel** — exact full vowel sequence + equal syllable count;
4. **final_nucleus_coda_class** — exact final nucleus + coarse coda class with candidate length within ±1 syllable.

Every SQL channel has a hard `LIMIT`.

Defaults:

```text
per channel / query anchor   128
maximum returned candidates  512
```

The broadest possible raw row budget is therefore explicit and calculable from the number of query anchors. There is no fallback full-table scan.

## Phonetic scoring

Retrieved windows are reconstructed from their stored phrase pronunciation and syllable span.

The query anchor is then scored against the candidate span with the existing:

```text
scoreGermanRhymeAnalyses
de-phon-v3
```

The result carries the normal primary type, overall/vowel/coda/stress components, Assonance/Consonance relations and retrieval-channel evidence.

The output order is a deterministic **phonetic candidate order**, not Phase 11E Writer ranking.

## Determinism and immutability

The anchor materializer:

1. records the current 11D1 window fingerprint;
2. rebuilds only `phrase_mosaic_retrieval_anchor`;
3. computes a deterministic anchor fingerprint;
4. recomputes the 11D1 window fingerprint;
5. fails if the accepted window rows changed.

## Build

Prerequisite:

```powershell
npm run phrase:mosaic:windows
```

Materialize the 11D2 anchors:

```powershell
npm run phrase:mosaic:retrieval
```

Generated report:

```text
data/local/phrase-mosaic-retrieval-v1-report.json
```

## Fixture gate

Tests require:

- accepted 11D1 window fingerprint is unchanged by anchor materialization;
- repeat anchor materialization has an identical anchor fingerprint;
- first-onset differences still retrieve as exact rhyme-domain matches;
- candidate scoring reuses `de-phon-v3`;
- every retrieval channel uses an explicit SQLite index under `EXPLAIN QUERY PLAN`;
- per-channel and final candidate limits are hard bounds.

## Owner full-data gate

After merge:

```powershell
npm run phrase:mosaic:retrieval
```

Review:

- anchor count versus 356,693 accepted windows;
- distinct exact-tail keys;
- distinct full-vowel keys;
- distinct final-nucleus/coda-class keys;
- database-size growth;
- anchor fingerprint;
- unchanged source window fingerprint.

First owner full-data materialization:

```text
anchor rows                 356,693
distinct exact-tail keys    181,548
distinct vowel keys          52,174
distinct final keys              772
database size               686.76 MiB
anchor fingerprint
55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
```

The source 11D1 window fingerprint remained unchanged. Repeat once and require the identical anchor fingerprint before moving from substrate/retrieval engineering into representative query evaluation.

## Explicitly deferred

11D2 does not implement:

- phrase usefulness ranking;
- phrase/commonness weighting;
- register weighting;
- lexical novelty;
- duplicate/template diversity;
- Markov/template recombination;
- semantic/vector retrieval;
- UI/API integration.

Those are separate milestones. 11E remains the first phrase Writer-ranking phase.
