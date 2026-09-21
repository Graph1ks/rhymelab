# Markov / Constrained Lyric Decoder V2 — Pause / Resume Handover

## Status

**PAUSED intentionally. Do not continue this work unless the owner explicitly reopens it. The current implementation may ship only as frozen demo infrastructure; it must not be linked or promoted from the RhymeLab product UI.**

This document is the authoritative restart point for the Markov / constrained lyric generation work.

Pause checkpoint:

~~~text
date        2026-09-21
branch      feature/markov-generator-testpage-v1
draft PR    #184
head        033b64d
CI          #872 PASS
~~~

CI at this checkpoint:

~~~text
Source check             PASS
Test suite               PASS
Public-readiness audit   PASS
~~~

The owner authorized PR #184 to ship as technical release infrastructure on 2026-09-21. This authorization does not reopen Markov development: keep the demo route isolated and unlinked from RhymeLab.

## Read first when resuming

1. AGENTS.md
2. PROJECT.md
3. this file
4. docs/MARKOV_GENERATOR_V1.md
5. docs/MARKOV_DATA_SOURCES.md
6. docs/LYRIC_STRUCTURE_V2.md
7. docs/DISTRIBUTION_TIERS.md

Repository state is authoritative. Do not reconstruct the design from old chat history.

---

## Product boundary

RhymeLab remains a deterministic, local-first rhyme/songwriting system.

Frozen constraints:

- RhymeLab Writer remains authoritative for pronunciation and rhyme truth.
- Markov generation must not replace phonetic/rhyme scoring.
- canonical core runtime has no mandatory hosted service;
- no LLM/neural dependency in canonical generation/ranking;
- no telemetry requirement;
- no giant pre-rendered generated phrase corpus;
- generated output remains distinct from source-backed Phrase/Mosaic data;
- accepted German Writer, English Writer, Phrase/Mosaic and Entity semantics remain frozen unless explicitly reopened.

---

## Canonical databases

Canonical Serving runtime:

~~~text
data/local/rhymelab-serving-v1.sqlite
~~~

Markov V2 databases:

~~~text
DE  data/local/rhymelab-markov-v2.sqlite
EN  data/local/rhymelab-markov-en-v2.sqlite
~~~

The owner completed both DE and EN local model builds before this pause.

Recent UI/entity/lyric-structure changes do **not** require rebuilding those model databases.

Canonical development route:

~~~text
http://127.0.0.1:3030/markov-test
~~~

Decoder/model identities:

~~~text
decoder policy   rhymelab-constrained-lyric-decoder-v2
runtime          rhymelab-constrained-lyric-runtime-v2
model schema     rhymelab-markov-model-v2
structure policy rhymelab-lyric-structure-v2
order            1 → 4 variable-order
~~~

---

## Current language/source model

### DE

Owner-local DE model is built from:

~~~text
Serving-v1 Phrase/Mosaic   role=phrase
Leipzig sentence corpus    role=sentence
Tatoeba DE                 role=sentence
~~~

### EN

Owner-local EN model is built from:

~~~text
Leipzig English corpus     role=sentence
Tatoeba EN                 role=sentence
~~~

EN does not require a separate Phrase/Mosaic source to operate. Writer remains responsible for English rhyme-tail candidates.

Source acquisition/build commands are documented in docs/MARKOV_DATA_SOURCES.md.

Useful status commands:

~~~powershell
npm run markov:sources:status
npm run markov:sources:status:en
npm run markov:model:status
npm run markov:model:status:en
~~~

Full bootstrap exists but should not be rerun merely to resume UI/decoder work:

~~~powershell
npm run markov:data:bootstrap
~~~

---

## V2 architecture implemented

### Transition model

Implemented:

- forward + reverse transition evidence;
- variable context order 4 → 3 → 2 → 1;
- deterministic high-order backoff;
- exact requested target-token count;
- reverse beam search;
- fixed-opener bidirectional bridge completion;
- token support and source-profile diagnostics;
- complete-sequence and 4–8-token novelty hashes;
- coarse line-shape evidence from complete sentence/lyric roles only.

### Rhyme-tail selection

Implemented:

- Writer-provided rhyme candidates remain authoritative;
- larger quality-qualified tail reservoir;
- deterministic temperature/exploration;
- Naturalness acts as a quality floor/support signal rather than pure maximum probability;
- exact-tail, final-token and rhyme-family reuse penalties;
- result-set diversification.

### Anti-copy/source behavior

Typed source roles:

~~~text
phrase
sentence
lyric
~~~

Rules:

- strict anti-copy applies to complete sentence and lyric sources;
- long copied source runs are blocked;
- attested Phrase/Mosaic overlap is support evidence, not automatically plagiarism;
- Phrase/Mosaic fragments do not populate complete-line shape patterns;
- original source text is not stored in novelty tables.

### Section/song planning

Implemented:

- deterministic rhyme-slot section planning;
- ABAB/AABB/AAAA/ABBA-style slot plans;
- cross-line lexical-overlap penalties;
- exact-tail reuse blocking within rhyme slots;
- rhyme-family continuity/collision handling;
- candidate-set diagnostics;
- deterministic abstract song planner;
- language-specific DE/EN structure defaults.

---

## Lyric Structure V2

The supplied DE/EN lyric files were used **only for aggregate structure calibration**.

Committed runtime profile:

~~~text
src/markov-lyric-structure-profile.mjs
~~~

Local analyzer:

~~~text
scripts/lyric-structure-core.mjs
scripts/analyze-lyric-structure.mjs
~~~

Documentation:

~~~text
docs/LYRIC_STRUCTURE_V2.md
~~~

Calibration totals:

| Language | Source files | Songs seen | Structured songs | Lyric lines |
| --- | ---: | ---: | ---: | ---: |
| DE | 2 | 210 | 202 | 12,018 |
| EN | 1 | 131 | 128 | 10,507 |

Representative defaults:

| Language | Section | Median lines | Median tokens/line |
| --- | --- | ---: | ---: |
| DE | Verse/Part | 16 | 9 |
| DE | Hook/Chorus | 8 | 6 |
| EN | Verse/Part | 20 | 9 |
| EN | Hook/Chorus | 8 | 8 |

Aggregate profile includes:

- section counts/order;
- start/end section probabilities;
- section-to-section transition probabilities;
- line and section lengths;
- repetition/hook profiles;
- rhyme-distance 1–4 structural priors.

### Hard lyric privacy boundary

Never commit or ship:

- raw supplied lyrics;
- lyric lines;
- titles;
- URLs;
- source IDs;
- source filenames;
- lyric-derived n-grams;
- lyric text transitions;
- reconstructable source windows.

Only non-reconstructable aggregate structure is product-safe.

The one-time rhyme-distance calibration proxy is structural only. Writer phonetics remain authoritative.

---

## Markov Lab material controls

Current behavior at the pause checkpoint:

### Phrases

**Phrases are OFF by default.**

When disabled:

- the Phrase channel is not queried;
- phrase results are not added to the generation pool.

This is intentional.

### Entities

Entities remain enabled by default.

When enabled, the UI exposes multi-select category chips based on the reviewed Entity taxonomy:

~~~text
ALL
Rapper
Sänger / Musiker
Schauspieler
Regisseure
Musikgruppen
Automarken
Fashion
Firmen
Filme
Games
Alben
Songs
Figuren
~~~

Canonical category IDs:

~~~text
person.rapper
person.musician
person.actor
person.director
group.music_group
organization.car_brand
organization.fashion_house
organization.company
work.film
work.video_game
work.album
work.song
fictional.character
~~~

Behavior:

- ALL uses the complete Entity pool;
- selecting one or more category chips forms a union of those category-specific Writer pools;
- selected category IDs are also passed to the decoder as a hard filter;
- both legacy object-style and compact string-style entityCategories payloads are normalized.

### Entity placement

Entities are no longer limited to rhyme-tail/end position.

The decoder supports:

~~~text
corpus → ENTITY → corpus → rhyme tail
~~~

Internal Entity placement:

- replaces an equal-sized corpus token span;
- therefore preserves exact requested token count;
- requires transition support;
- is rescored for Naturalness, transition quality, novelty and source-copy constraints;
- gets only a small bounded quality bonus after passing normal gates;
- respects the selected Entity categories.

Entities may still appear as rhyme tails when Writer/rhyme scoring selects them.

---

## Build performance work completed

The original large-data builder was functionally correct but insufficiently optimized.

Implemented improvements:

- child-process progress streams live instead of being buffered;
- long builds report phase, source, processed/total, percentage, throughput, elapsed time, ETA and checkpoint duration;
- download/staging reports live bytes, rate, ETA and row progress;
- Runtime secondary indexes are removed from the bulk-write hot path;
- batch data is staged into TEMP tables;
- SQLite merges are set-based rather than one conflict-upsert per JS map entry;
- state-ranking index is temporary;
- final runtime indexes are materialized after bulk writes/pruning;
- build checkpoints/resume remain intact.

Do not quote a fixed speedup factor without a measured A/B benchmark.

---

## Windows fixture-test bug already fixed

A local test once appeared to keep building after the real DE/EN databases were finished.

Root cause:

tests/markov-rhymelab-source.test.mjs accidentally discovered the owner's real local sentence manifest. The supposedly tiny fixture therefore began processing the full local corpora, hit its 30-second timeout, and could leave a child builder holding a temporary SQLite file on Windows.

Symptoms included:

~~~text
EBUSY ... Temp\rhymelab-markov-serving-source-...\work.sqlite
test duration ~30 seconds
~~~

Fix:

- fixture now supplies its own nonexistent/test-local sentence manifest;
- it cannot ingest owner-local corpora;
- Windows cleanup retries were added.

Do not revert this isolation.

---

## Builder UX contract

Long local jobs must never appear frozen.

Future builders/acquisition jobs should expose, where applicable:

~~~text
phase/stage
source
processed / total
percentage
throughput
elapsed
ETA
checkpoint/batch duration
final completion
~~~

Do not wrap long child jobs with buffered stdout/stderr if live progress is expected.

---

## Current Markov Lab UI state

The Markov Lab is still an **experimental development surface**, not a promoted RhymePad feature.

Implemented UI state includes:

- DE/EN model switching based on actual model health;
- desktop viewport containment for normal browser chrome at common 1080p-class screens;
- mobile stacked responsive behavior;
- no fake generated fallback;
- deterministic seed/reroll;
- rhyme mode;
- Rhyme pressure;
- Naturalness;
- Weirdness;
- exact Target length;
- Phrase toggle default OFF;
- Entity toggle + category multi-select;
- Generated-layer toggle when available;
- candidate source counts;
- score diagnostics;
- eight diversified variants.

Recent desktop containment uses:

~~~text
@media(min-width:1050px) and (max-height:1050px)
@media(min-width:1050px) and (max-height:720px)
~~~

and hard 100dvh containment on desktop.

---

## Known limitations / intentionally unfinished work

This work is paused before product promotion.

Do **not** assume the following are accepted merely because primitives exist:

1. single-line output quality has not received final owner acceptance;
2. source-role/source-weight tuning has not been comprehensively benchmarked;
3. internal Entity insertion is new and needs broader hands-on review against real Entity pools;
4. multi-line/verse generation core exists but has not been promoted to the UI/product;
5. full-song planning is an abstract planner, not yet a finished songwriting workflow;
6. no RhymePad integration yet;
7. no final shipping Full-distribution integration yet;
8. no final quality benchmark corpus/acceptance thresholds have been frozen;
9. EN has sentence-transition data but no dedicated Phrase/Mosaic channel;
10. Phrase toggle being OFF by default is intentional at this checkpoint.

Serving-v1 micro-optimization also remains paused until actual Lite/Standard/Full distributions are materialized and benchmarked.

---

## Resume checklist

When the owner reopens this work:

~~~powershell
git fetch origin
git switch feature/markov-generator-testpage-v1
git pull --ff-only origin feature/markov-generator-testpage-v1

npm install

npm run markov:model:status
npm run markov:model:status:en

npm run check
npm test

npm run dev
~~~

Open:

~~~text
http://127.0.0.1:3030/markov-test
~~~

First hands-on regression pass should cover:

~~~text
DE + EN
Phrases OFF / ON
Entities OFF
Entities ALL
single Entity category
multiple Entity categories
internal Entity placement
Entity as rhyme tail
short/normal/long target lengths
Balanced / End / Multi / Mosaic / Slant / Assonance / Chain / Consonance / Internal
high/low Naturalness
high/low Weirdness
fixed opener
no opener
deterministic seed repeatability
~~~

Do not rebuild the Markov databases unless model/source code or data actually requires it.

---

## Recommended next work when reopened

Order of work:

1. **hands-on quality acceptance** on representative DE/EN rhyme targets;
2. capture bad-output classes rather than tuning individual examples;
3. benchmark generation latency and candidate diversity on the finished DE/EN models;
4. tune source roles/weights only from measured evidence;
5. validate internal Entity placement across all taxonomy categories;
6. expose/test multi-line Verse/Hook generation in the Markov Lab;
7. evaluate complete song-section planning;
8. only then consider RhymePad integration;
9. only after acceptance integrate into the Full shipping tier.

Do not reopen unrelated Serving-v1 micro-optimization while doing this unless a measured shipping-tier bottleneck justifies it.

---

## One-line restart prompt

A future thread can start with:

> Read AGENTS.md, PROJECT.md, and docs/MARKOV_GENERATOR_HANDOVER.md first. Markov / Constrained Lyric Decoder V2 was intentionally paused at draft PR #184 after DE+EN model builds, Lyric Structure V2, Phrase-default-OFF controls, Entity multi-select and internal Entity placement were implemented. Verify the branch/PR/CI state, preserve the frozen boundaries, then continue from the Resume checklist rather than redesigning from scratch.
