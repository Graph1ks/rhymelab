# Lyric Structure V2

## Purpose

Lyric Structure V2 is the aggregate-only song/section planning layer for the constrained lyric decoder.

It answers questions such as:

- how many lines a verse or hook usually contains;
- how long lines tend to be in tokens;
- how often hooks repeat;
- which section types tend to follow each other;
- which rhyme distances are structurally common.

It does **not** provide word-transition training.

Sentence/phrase language modeling and lyric structure remain separate:

```text
Serving-v1 Phrase/Mosaic + open sentence corpora
  -> lexical/transition evidence

Lyric Structure V2
  -> section/line/repetition/rhyme-distance priors
```

## Privacy/copyright boundary

The local analyzer may read full lyric files, but its serialized output contains aggregates only.

It does not emit:

- raw lyric text;
- titles;
- URLs;
- identifiers;
- source filenames;
- line sequences;
- n-grams;
- text transition sequences.

The committed runtime profile contains only non-reconstructable aggregate distributions.

## Current calibration

The current product-safe profile was calibrated from the supplied structure corpus:

| Language | Source files | Songs seen | Structured songs | Analyzed lyric lines |
| --- | ---: | ---: | ---: | ---: |
| DE | 2 | 210 | 202 | 12,018 |
| EN | 1 | 131 | 128 | 10,507 |

Representative aggregate defaults:

| Language | Section | Median lines | Median tokens/line |
| --- | --- | ---: | ---: |
| DE | Verse/Part | 16 | 9 |
| DE | Hook/Chorus | 8 | 6 |
| EN | Verse/Part | 20 | 9 |
| EN | Hook/Chorus | 8 | 8 |

Song section-count medians:

```text
DE  5
EN  7
```

The committed profile also contains:

- start-section probabilities;
- end-section probabilities;
- section-to-section transition probabilities;
- repeated-line rates;
- hook-occurrence distributions;
- exact repeated-hook song share;
- distance-1 through distance-4 rhyme-structure priors.

Rhyme-distance calibration uses an intentionally coarse orthographic ending proxy during one-time structure analysis. It is a structural prior only. RhymeLab Writer remains authoritative for phonetic rhyme truth.

## Runtime profile

Product-safe constants:

```text
src/markov-lyric-structure-profile.mjs
```

Policy:

```text
rhymelab-lyric-structure-v2
```

The decoder uses this profile when a section does not provide explicit line/token targets.

Examples:

```text
planLyricSection({language:'de', section:'verse'})
-> defaults around 16 lines / 9 tokens

planLyricSection({language:'en', section:'hook'})
-> defaults around 8 lines / 8 tokens
```

Explicit user targets always override the learned defaults.

## Song planning

`planLyricSong()` deterministically samples an abstract section sequence from the aggregate language-specific priors.

It uses:

- start-section weights;
- learned section-transition weights;
- end-section weights for the final section;
- section-specific line counts;
- section-specific token targets;
- language-specific rhyme-distance priors.

No lyric source text is consulted at runtime.

## Local re-analysis

The developer-only analyzer accepts one or more local lyric text files:

```powershell
npm run markov:lyrics:structure:analyze -- \
  --source de=C:\path\to\de-lyrics-1.txt \
  --source de=C:\path\to\de-lyrics-2.txt \
  --source en=C:\path\to\en-lyrics.txt
```

Default output:

```text
data/local/lyric-structure-v2-analysis.json
```

The local report is not a runtime text corpus and is not used as Markov transition input.
