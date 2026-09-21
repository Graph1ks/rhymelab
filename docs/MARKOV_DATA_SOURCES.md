# Markov V2 Data Source Contract

## Purpose

The constrained lyric decoder deliberately separates three source roles. They teach different things and must not be merged into one undifferentiated corpus.

| Kind | Teaches | Must not be treated as |
| --- | --- | --- |
| `phrase` | attested chunks, idioms, local word-order evidence | complete sentence/line grammar |
| `sentence` | complete syntax, function-word structure, longer transition continuity | song/section/rhyme structure |
| `lyric` | line shape, cadence proxy, repetition/section/rhyme-distance structure when available | general-language truth |

The canonical Serving-v1 Phrase/Mosaic export is always classified as `phrase`.

## Builder interface

The V2 builder supports explicit typed and weighted inputs:

```text
--source kind:code[:weight]=/absolute/path/to/line-oriented-source.txt
```

Supported kinds:

```text
phrase
sentence
lyric
```

Weight is an integer from 1 through 16. It multiplies transition/token/shape evidence deterministically. It does not duplicate files or alter accepted-line counts.

Example:

```powershell
npm run markov:model:build -- \
  --source sentence:de_sentences:2=C:\data\de-sentences.txt \
  --source lyric:de_lyric_lines:3=C:\data\de-lyric-lines.txt
```

The wrapper also injects the canonical Serving-v1 Phrase/Mosaic source at weight 1.

Legacy `--sentences code=path` remains accepted and maps to `kind=sentence, weight=1`.

## Source-role semantics

### Phrase

Phrase/Mosaic rows:

- contribute token frequency;
- contribute variable-order transitions;
- contribute typed source-window hashes;
- may increase attested-phrase support during decoding;
- participate in anti-copy diagnostics as Phrase evidence;
- do **not** populate `shape_pattern`.

A known phrase is allowed to appear inside a generated line. It is not automatically considered source-text regurgitation.

### Sentence

Complete sentence rows:

- contribute token frequency;
- contribute variable-order transitions;
- populate learned line/sentence shape patterns;
- populate strict anti-copy sequence/window evidence;
- are used as syntax/fluency evidence.

Long direct runs copied from a sentence source are blocked by the decoder.

### Lyric

Full lyric lines:

- contribute token frequency;
- contribute variable-order transitions;
- populate learned line-shape patterns;
- populate strict anti-copy sequence/window evidence.

A production lyric source must preserve line boundaries. If section/stanza metadata is available, it should be retained in the acquisition/staging layer for future section-model materialization rather than flattened away.

## Production-source requirements

A source intended for a distributable RhymeLab model should have:

- explicit provenance;
- license/redistribution/model-training review compatible with the intended product;
- stable source fingerprint;
- language identity;
- deterministic line extraction;
- duplicate control;
- no secrets/private owner material;
- documented cleaning rules;
- train/holdout separation at document/song level where document identity exists.

Raw local corpora and bulk text remain outside Git.

## Quality requirements

Prefer corpus diversity over sheer row count.

Avoid:

- one artist, site, publisher, genre, or template dominating counts;
- repeated hooks/choruses multiplying transitions without a cap;
- duplicate or near-duplicate sentences;
- machine-generated text silently mixed with source-backed text;
- sentence fragments mislabeled as complete sentences;
- bag-of-words data for sequence generation.

For lyric sources, repeated lines within the same song should be capped or down-weighted during staging. The model should learn that repetition exists without turning one chorus into a transition-frequency magnet.

## V2 evidence stored in the model

The compact model stores:

- order 1–4 forward transitions;
- order 1–4 reverse transitions;
- token support;
- source-kind-aware full-sequence hashes;
- source-kind-aware 4–8-token window hashes;
- learned coarse shape patterns from `sentence` and `lyric` only;
- a source-role profile with accepted row counts and deterministic weights.

It does not ship the original source text.

## Privacy boundary

Owner-private lyrics remain calibration/benchmark material only.

They are not an implicit `lyric` source and are never consumed by the production wrapper unless the owner deliberately supplies them to the low-level builder for a private local experiment. Such a private model must not be distributed or committed.

The public aggregate lyric-shape profile remains separate from all corpus text.
