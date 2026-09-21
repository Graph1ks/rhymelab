# Constrained Lyric Decoder V2

## Status

**Experimental implementation candidate. Not yet promoted into RhymePad or a shipping Full distribution.**

Development route:

```text
/markov-test
```

Decoder policy:

```text
rhymelab-constrained-lyric-decoder-v2
```

Model schema:

```text
rhymelab-markov-model-v2
```

Default model:

```text
data/local/rhymelab-markov-v2.sqlite
```

## Architecture

V2 separates authoritative rhyme truth, language evidence, structure evidence, source novelty, and result-set diversity.

```text
Serving-v1 Writer rhyme candidates
          │
          ▼
large diversified rhyme-tail reservoir
          │
          ▼
variable-order reverse beam search
order 4 → 3 → 2 → 1
          │
          ├── fixed opener: bidirectional bridge check
          ├── exact target length
          ├── transition quality floor
          ├── learned line-shape evidence
          └── source-copy constraints
          │
          ▼
candidate scoring
          │
          ▼
result-set diversification
          │
          ▼
distinct deterministic lyric-line variants
```

RhymeLab Writer remains authoritative for pronunciation and rhyme relations. The decoder never invents a second rhyme truth system.

## Why V2 replaced the original decoder

The first implementation exposed several structural failures:

- a large Writer pool collapsed to a tiny high-probability tail shortlist;
- Naturalness acted too much like maximum-probability selection;
- result dedupe detected exact lines but not near-duplicate endings/path families;
- order-2 transitions over Phrase/Mosaic fragments produced locally plausible but globally weak lines;
- Phrase/Mosaic fragments were incorrectly capable of behaving like complete line-shape examples;
- target length began as a ranking preference instead of a construction constraint.

V2 addresses these at the decoder/model-contract level rather than tuning around individual bad outputs.

## Variable-order model

The V2 model materializes forward and reverse transitions for context lengths 1 through 4.

The decoder prefers stronger higher-order evidence but can back off when a high-order state is sparse or constrained away. A narrow order-4 state can borrow alternatives from lower-order evidence rather than forcing one repeated path.

The model also stores per-token support and retained high-order states.

## Tail reservoir

The Writer candidate pool is no longer collapsed to roughly a handful of tails before generation.

V2 builds a substantially larger quality-qualified reservoir using:

- authoritative Writer phonetic score;
- usage/commonness evidence;
- model support;
- mode-specific evidence.

Sampling then applies temperature and cross-attempt penalties for:

- exact tail reuse;
- final-token reuse;
- tail-family reuse.

Naturalness defines a quality floor and transition support preference. It does not mean "always pick the most frequent path."

## Exact target length

Target token count is a construction constraint.

For V2 generation, the reverse beam is built to the exact requested token count after accounting for:

- fixed opener tokens;
- selected rhyme-tail tokens.

Candidates that miss the target length are not returned.

The aggregate public lyric profile remains a useful default prior but never silently clamps an explicit user target.

## Bidirectional opener bridge

When the user supplies a fixed opener, the final open slot adjacent to that opener is evaluated against both sides:

```text
fixed left context
       ↓
 candidate bridge token
       ↑
already-built right/rhyme context
```

The runtime intersects forward and reverse transition evidence for that bridge instead of relying only on reverse generation.

## Source novelty and attested Phrase support

The model stores source-kind-aware hashes for:

- complete accepted sequences;
- 4–8-token source windows.

Strict anti-copy applies to `sentence` and `lyric` sources.

Known `phrase` evidence is different: an attested phrase/idiom may legitimately appear inside a generated line. Phrase matches therefore provide support rather than being automatically treated as copied source text.

Exact or excessive runs copied from strict sources are rejected.

Original source text is not stored in the compact model.

## Line-shape evidence

V2 materializes coarse deterministic line-shape patterns from complete `sentence` and `lyric` sources.

Phrase/Mosaic rows do not populate this table because a fragment is not a complete grammatical line.

The current shape representation is deliberately lightweight and local-first. It distinguishes common function classes and content slots without adding a hosted NLP or neural runtime dependency.

If no complete sentence/lyric source has been materialized yet, missing shape evidence is treated as unavailable/neutral rather than proof that a candidate is bad.

## Result-set diversity

V2 chooses the returned set jointly rather than treating eight independent samples as eight useful alternatives.

Similarity evidence includes:

- lexical token overlap;
- identical final token;
- identical final bigram;
- identical final trigram;
- exact rhyme-tail reuse;
- rhyme-tail family reuse.

Near duplicates can be rejected; remaining candidates receive a result-diversity score and diversity-adjusted selection utility.

This specifically prevents one attractive Markov path from filling the entire result list with superficial prefix variations.

## Section planning primitive

V2 includes a deterministic section planner capable of producing line plans for rhyme-slot schemes such as:

```text
ABAB
AABB
AAAA
ABBA
```

A line plan includes:

- line index;
- rhyme slot;
- target-token count;
- section type;
- repetition policy hint.

This is the planning foundation for future multi-line generation. Single-line quality remains the immediate acceptance gate before RhymePad promotion.

## Typed training sources

Authoritative contract:

```text
docs/MARKOV_DATA_SOURCES.md
```

Supported roles:

```text
phrase
sentence
lyric
```

The default wrapper always injects Serving-v1 Phrase/Mosaic as `phrase` evidence.

Additional complete sources can be supplied without changing the decoder:

```powershell
npm run markov:model:build -- \
  --source sentence:de_sentences:2=C:\data\de-sentences.txt \
  --source lyric:de_lyric_lines:3=C:\data\de-lyric-lines.txt
```

Weights are deterministic integer evidence weights, not probabilistic hidden tuning.

## Private owner lyrics

Private owner lyrics remain calibration-only.

The repo and distributable model contain none of their:

- raw lines;
- titles;
- IDs;
- URLs;
- token sequences;
- private transition tables.

The public aggregate profile remains in:

```text
src/markov-lyric-profile.mjs
```

The optional privacy-safe local analyzer remains available for aggregate recalibration only.

## Default build

The canonical Serving-v1 database is:

```text
data/local/rhymelab-serving-v1.sqlite
```

Default owner flow:

```powershell
npm run markov:model:plan
npm run markov:model:build
npm run markov:model:status
```

This materializes:

```text
data/work/markov-v2/rhymelab-serving-phrase-lines.txt
data/work/markov-v2/rhymelab-markov-v2.build.sqlite
data/local/rhymelab-markov-v2.sqlite
data/local/markov-model-v2-report.json
```

The old local V1 model filename is not used by the V2 runtime.

## Health diagnostics

`/api/health → markov_generator` reports:

- schema/policy/runtime;
- model order;
- transition count;
- novelty sequence/window counts;
- learned shape-pattern count;
- source-role profile;
- semantic fingerprint.

The test UI exposes the materialized source mix as:

```text
P <phrase rows> · S <sentence rows> · L <lyric rows>
```

so a phrase-only development model cannot masquerade as a fully trained syntax/lyric model.

## Current acceptance boundary

Implemented and covered:

- Serving-v1 as canonical rhyme/data runtime;
- order 1–4 forward/reverse model;
- larger tail reservoir;
- deterministic temperature-driven exploration;
- exact target length;
- reverse beam search;
- bidirectional fixed-opener bridge;
- typed weighted data sources;
- strict source-copy detection for sentence/lyric;
- attested Phrase support separated from copy detection;
- learned line-shape evidence from complete sources only;
- result-set diversification;
- deterministic rhyme-slot section planner;
- private owner lyric boundary;
- no fake template fallback.

Still requires owner-local evidence before product promotion:

- rebuild of the V2 model;
- owner review on representative DE targets;
- complete sentence source acquisition;
- distributable full-line lyric source acquisition if available;
- source-weight benchmark;
- latency/DB-size evidence;
- multi-line quality acceptance;
- RhymePad integration;
- Full-distribution packaging.
