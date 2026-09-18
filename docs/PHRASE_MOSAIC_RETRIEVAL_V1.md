# German Phrase Mosaic Retrieval v1 — Phase 11D1

Last updated: 2026-09-18

## Purpose

Phase 11D1 introduces the deterministic phonetic window substrate for mosaic-rhyme retrieval.

A mosaic candidate window is a syllable-aligned span inside a fully pronounced phrase whose interior crosses at least one stored word boundary. The window may begin or end inside a multi-syllable token; this is necessary for matches where the query aligns to a suffix of one word plus one or more following words.

11D1 does **not** yet rank phrase candidates or implement approximate/slant retrieval.

## Preconditions

11D1 consumes only accepted Phase 11C1 output:

```text
phrase pronunciation schema   rhymelab-phrase-pronunciation-v1
source fingerprint             stored phrase_pronunciation_fingerprint
word boundaries                explicit syllable coordinates
token spans                    stored syllable [start,end) coordinates
```

The accepted Phase 11C1 owner fingerprint is:

```text
fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
```

The single-word Writer remains frozen and is not rewritten.

## Policy

```text
mosaic schema             rhymelab-phrase-mosaic-v1
window policy             de-cross-word-syllable-windows-v1
default minimum           2 syllables
default maximum           6 syllables
boundary requirement      >= 1 strict interior word boundary
coordinate system         zero-based [start,end)
```

A one-syllable span cannot cross a word boundary between two pronounced tokens, so the materialized cross-word substrate starts at two syllables.

The maximum is a materialization bound, not a linguistic claim. It can be changed explicitly in a later benchmarked architecture revision.

## Window identity

For each eligible phrase pronunciation, 11D1 enumerates every syllable interval within the configured length range.

A boundary at absolute syllable position `b` counts as crossed only when:

```text
window_start < b < window_end
```

A window that merely starts or ends at the boundary does not cross it.

Every retained window stores:

- phrase pronunciation id and phrase id;
- syllable `[start,end)` and count;
- phoneme `[start,end)` and count;
- overlapping token start/end indexes;
- count of crossed word boundaries;
- crossed boundary offsets relative to the window;
- whether the start/end lies inside a token;
- exact canonical phoneme sequence;
- exact nucleus/vowel sequence;
- citation stress pattern within the window;
- final coda key;
- deterministic row fingerprint.

The window id is stable over:

```text
phrase pronunciation id
+ syllable start
+ syllable end
+ window policy
```

## Storage and indexes

Table:

```text
phrase_mosaic_window
```

Materialized indexes:

```text
idx_phrase_mosaic_window_exact
  (phoneme_key, syllable_count, crossed_word_boundaries)

idx_phrase_mosaic_window_vowel
  (vowel_key, syllable_count, crossed_word_boundaries)

idx_phrase_mosaic_window_phrase
  (phrase_id, syllable_start, syllable_end)
```

This is the first no-full-scan retrieval substrate. Exact phoneme and exact nucleus-sequence candidate lookup can use SQLite indexes directly.

11D2 will define bounded candidate generation for broader rhyme/slant relations. It must not fall back to scanning every phrase window per query.

## Determinism

The materializer deletes/rebuilds only `phrase_mosaic_window`, then hashes rows in stable `window_id` order.

It does not mutate:

- phrase catalog truth;
- phrase pronunciation rows;
- Writer-v5;
- single-word ranking/scoring;
- phrase ranking.

## Build

Prerequisite:

```powershell
npm run phrase:pronunciation
```

Materialize the default 2–6-syllable cross-word substrate:

```powershell
npm run phrase:mosaic:windows
```

Generated report:

```text
data/local/phrase-mosaic-windows-v1-report.json
```

Optional explicit bounds:

```powershell
node --no-warnings scripts/materialize-de-phrase-mosaic-windows.mjs --min-syllables 2 --max-syllables 6
```

## Owner full-data gate

Review:

- source phrase-pronunciation fingerprint;
- number of fully pronounced phrases scanned;
- phrases producing at least one cross-word window;
- total materialized window count;
- syllable-count distribution;
- crossed-boundary-count distribution;
- resulting SQLite size;
- deterministic repeat window fingerprint.

First owner full-data materialization:

```text
pronunciations scanned   90,089
phrases with windows     90,089
window count            356,693
database size           510.09 MiB
window fingerprint      24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
```

Distribution:

```text
2 syllables   97,867
3 syllables  119,848
4 syllables   74,036
5 syllables   41,563
6 syllables   23,379

1 boundary   327,828
2 boundaries  19,941
3 boundaries   7,397
4 boundaries   1,438
5 boundaries      89
```

Repeat owner materialization produced the identical window fingerprint:

```text
24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
```

Counts, distributions and database size were also identical. **Phase 11D1 is accepted and frozen.**

Phase 11D2 contract: `docs/PHRASE_MOSAIC_RETRIEVAL_V2.md`.

## Explicitly deferred to 11D2 / 11E

11D1 does not implement:

- fuzzy phonetic distance;
- PanPhon/feature distance;
- scorer/relation classification over windows;
- query-side mosaic search API;
- phrase usefulness/commonness ranking;
- duplicate/template diversity;
- Markov/template recombination;
- semantic/vector retrieval;
- UI integration.

The next 11D milestone is indexed candidate retrieval over this substrate, not phrase ranking.
