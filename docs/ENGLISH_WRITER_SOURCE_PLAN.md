# Phase 12B — English Single-Word Writer Source Plan

Last updated: 2026-09-18

Status: **NEXT ACTIVE MILESTONE / SOURCE STACK RESEARCH COMPLETE / IMPLEMENTATION NOT STARTED**

## Decision

Phase 12B now takes priority over further Entity enrichment.

The target is an English single-word Writer database/runtime built with the same engineering principles as the accepted German Writer, but with a **real English phonology and English-specific source stack**.

Do not emulate English with `de-ipa-v2`, reuse German rhyme rules mechanically, or merge English rows into the frozen German Writer DB.

The existing product contract remains:

```text
DE
EN
DE+EN
```

Phase 12B supplies the previously capability-gated `EN` side.

## Key scale finding

The current Kaikki machine-readable English dictionary, extracted from the English Wiktionary edition, reports:

```text
English distinct word forms   1,390,507
English senses                1,787,236
enwiktionary dump date        2026-09-02
Kaikki extraction             2026-09-16
```

This confirms that an English raw lexical universe above one million word forms is realistic.

It does **not** mean RhymeLab should expose 1.39M forms equally in the default Writer.

That raw universe includes classes such as:

- inflected forms;
- archaic/obsolete vocabulary;
- rare technical terms;
- dialectal forms;
- spelling variants;
- proper names;
- abbreviations;
- compounds and multi-word material;
- forms useful only as source evidence.

The final default-eligible English Writer population must be measured after source-backed filtering and ranking. Do not preselect an arbitrary target count.

The full English-language Wiktionary edition itself has over ten million entries across thousands of languages; that number is **not** an English-word count.

## Selected source architecture

There is no single source that provides lexical identity, morphology, pronunciation variants, dialect evidence and trustworthy commonness perfectly.

Use a layered stack.

### 1. English Wiktionary via Kaikki/Wiktextract — PRIMARY LEXICAL SOURCE

Role:

- canonical lexical inventory;
- lemmas and parts of speech;
- inflected/listed forms;
- `form_of` / `alt_of` relations;
- lexical/register/style tags;
- historical/obsolete evidence;
- IPA pronunciations;
- pronunciation dialect/region tags;
- spelling and pronunciation variants;
- source-backed lexical relationships useful for later diagnostics.

Current source evidence:

```text
landing page
https://kaikki.org/dictionary/

raw source page
https://kaikki.org/dictionary/rawdata.html

current raw enwiktionary extract
dump 2026-09-02
JSONL 23.5 GB uncompressed
gzip 2.7 GB
updated regularly, usually at least weekly
```

Wiktextract specifically expands Wiktionary templates/Lua and extracts senses, inflected forms, IPA, pronunciation tags, linkages and form relationships. This is materially better for RhymeLab than a flat word list.

License boundary:

- Wiktextract **software**: MIT;
- extracted Wiktionary data: Wiktionary source licenses, currently CC BY-SA + GFDL;
- commercial use is possible, but attribution/share-alike/redistribution obligations must remain isolated and documented exactly as for the existing German Wiktionary-derived layer.

Decision:

**Selected as the Phase 12B primary lexical source.**

Use the raw Wiktextract JSONL path, not the Kaikki postprocessed language download, because Kaikki marks the postprocessed downloads as deprecated. Stream the raw gzip and keep only `lang_code === "en"` records required by RhymeLab.

The owner bootstrap must pin:

- source URL;
- Wiktionary dump date;
- retrieval timestamp;
- HTTP metadata where useful;
- local byte size;
- local SHA-256;
- Wiktextract/extraction revision reported by Kaikki.

### 2. CMU Pronouncing Dictionary — PRIMARY en-US PRONUNCIATION OVERLAY

Role:

- exact-source en-US pronunciation;
- alternate pronunciations;
- lexical stress;
- clean ARPAbet phone sequences;
- strong bootstrap/control source for English phonology validation.

Upstream:

```text
https://github.com/cmusphinx/cmudict
```

License statement:

CMU explicitly permits use of the dictionary for research or commercial purposes without restriction and requests acknowledgment of origin.

RhymeLab already pins one CMUdict revision for the Entity coverage probe:

```text
commit
74790861f652b15e4ac49015a90074ad62a27690

cmudict.dict Git blob
2c0411740cce3e2026a80b90b650d5f6a7258164
```

Phase 12B may reuse that artifact initially or intentionally pin a newer revision after an explicit source diff. Do not silently move the source.

Decision:

**Selected as the primary exact en-US pronunciation overlay, not as the lexical universe.**

Important implementation rule:

CMUdict uses ARPAbet with stress. Build a deterministic English phone normalization layer. Do not simply treat ARPAbet strings as IPA, and do not force Wiktionary UK/US IPA variants through a German analyzer.

### 3. English Speller Database (ESDB / SCOWL v2) — SECONDARY LEXICAL/DIALECT GUARD

Upstream:

```text
https://github.com/en-wl/wordlist
```

Useful evidence:

- US / GB / CA / AU spelling distinctions;
- variant levels;
- basic POS;
- lemma/inflection structure;
- commonness/size classes;
- explicit archaic/uncommon/invalid variant classes;
- high-quality spellchecker-oriented lexical vetting.

The 2026 ESDB/SCOWL v2 README describes the default size 60 set as vetted for errors and size 70 as usable, while the broader database remains a work in progress.

License:

- combined ESDB work is available under an MIT-like permissive license;
- included source notices must be preserved;
- some output/source combinations carry additional notice requirements documented in ESDB's `Copyright` file.

Decision:

**Selected as a secondary quality/dialect/inflection evidence source.**

Do not use ESDB as:

- pronunciation truth;
- fine-grained frequency truth;
- the sole lexical universe.

Its main value is deterministic disagreement/quality evidence against noisy long-tail Wiktionary surfaces.

### 4. wordfreq — USAGE / COMMONNESS CANDIDATE, NOT LEXICAL TRUTH

Upstream:

```text
https://github.com/rspeer/wordfreq
```

Strengths:

- combines multiple domains instead of one corpus;
- English has the large wordlist;
- large lists include frequencies down to approximately 1 occurrence per 100 million tokens;
- convenient Zipf/commonness scale;
- sources include Wikipedia, subtitles, news, books, web, Twitter and Reddit.

Important limitation:

The maintainer states that the frequency data are a snapshot through about **2021** and are unlikely to be updated again.

License boundary:

- code: Apache;
- included data files may be redistributed under CC BY-SA 4.0 and carry source attribution obligations.

Decision:

**Use as the first Phase 12B usage/commonness candidate and benchmark signal, not as accepted final modern-English truth.**

It should play the same conceptual role as German usage evidence:

```text
frequency/commonness = ordering evidence
frequency/commonness != lexical fact
```

Before final English Writer acceptance, measure whether its 2021 cutoff materially hurts modern songwriting/rap vocabulary. If so, add a separate source-backed modernity overlay rather than corrupting phonetic or lexical truth.

### 5. WordNet — OPTIONAL SEMANTIC/POS SUPPORT ONLY

WordNet has permissive redistribution terms with required notices and useful semantic/POS relations.

It is not selected as the primary RhymeLab English lexicon because it is not designed to provide:

- broad inflected-form coverage;
- pronunciation;
- current slang;
- exhaustive dialect spelling;
- usage/commonness.

Potential later uses:

- semantic family evidence;
- POS cross-checking;
- lemma relationships.

No Phase 12B core dependency is required initially.

## Rejected primary-source approaches

Do not build the English Writer primarily from:

### Random GitHub million-word lists

Reason:

- weak provenance;
- no pronunciation;
- no lexical status;
- no historical/register tags;
- unknown licensing;
- misspellings/names/noise often mixed with words.

Raw count is not product quality.

### CMUdict alone

Reason:

- excellent pronunciation source;
- far too small/narrow to be the English lexical universe;
- strongly en-US;
- limited lexical/morphological metadata.

### ESDB/SCOWL alone

Reason:

- excellent spelling/dialect/inflection sanity source;
- no pronunciation layer;
- commonness levels are not a full Writer frequency ranking;
- current v2 database is still evolving.

### WordNet alone

Reason:

- semantic dictionary, not a pronunciation/frequency/inflected-form Writer inventory.

### Direct COCA as the core downloadable dataset

Reason:

- not a straightforward freely redistributable bulk source for this architecture;
- avoid building the commercial core around a source whose direct redistribution contract is not as clean as the selected stack.

### Google Books Ngrams alone

Reason:

- very large historical/book-biased frequency evidence;
- no lexical truth;
- no pronunciation;
- poor fit as sole current songwriter commonness signal.

## Proposed source precedence

For lexical existence/status:

```text
1. English Wiktionary / Wiktextract
2. ESDB corroboration / dialect / variant evidence
3. explicitly curated RhymeLab override with provenance
```

For en-US pronunciation:

```text
1. reviewed RhymeLab override with provenance
2. exact CMUdict pronunciation
3. explicitly US-tagged Wiktionary IPA
4. unqualified English Wiktionary IPA retained as source evidence
5. audited G2P fallback only after source-coverage diagnostics
6. unresolved
```

For en-GB pronunciation:

```text
1. reviewed source-backed override
2. explicitly UK/GB-tagged Wiktionary IPA
3. other source-audited UK lexicon if later justified
4. audited G2P only after benchmark
5. unresolved
```

For commonness:

```text
1. wordfreq candidate score/rank
2. ESDB size/commonness class as independent lexical-quality evidence
3. later modernity evidence if benchmark shows the 2021 wordfreq cutoff is insufficient
```

Do not collapse these independent evidence types into one magic source score.

## English pronunciation architecture requirements

English needs a new versioned phonology profile.

Requirements:

- preserve primary and secondary lexical stress;
- preserve pronunciation variants;
- distinguish at least en-US and en-GB when source evidence does;
- normalize CMUdict ARPAbet deterministically;
- normalize Wiktionary IPA deterministically;
- map both source types into one versioned English canonical phone representation;
- keep raw source pronunciation alongside normalized analysis;
- derive rhyme tail from the last relevant stressed syllable, not spelling suffix;
- support perfect, multisyllabic, slant/family, assonance and consonance through English-specific feature rules;
- benchmark rhotic/non-rhotic differences instead of flattening them accidentally;
- do not use German vowel/coda feature assumptions unchanged.

Default product profile remains **en-US** unless benchmark evidence changes that decision. Preserve source-backed en-GB variants as alternates.

## Database boundary

Target English runtime should remain separate from the frozen German DB during development.

Proposed local target:

```text
data/local/rhymelab-en-v1.sqlite
```

Do not mutate:

```text
data/local/rhymelab-v5.sqlite
```

The unified API/UI should open the English DB optionally and capability-gate `EN` / `DE+EN` until the English runtime reaches acceptance.

## Phase 12B implementation sequence for the next thread

### 12B1 — source contracts + bootstrap

Create versioned source manifests for:

- Kaikki raw English Wiktionary/Wiktextract;
- CMUdict;
- ESDB;
- wordfreq usage candidate.

Bootstrap locally with checksums and no committed bulk data.

### 12B2 — source diagnostics

Before building the production DB, measure:

- raw English Wiktionary entries;
- distinct headwords;
- distinct listed/inflected forms;
- single-token eligible surfaces;
- multi-word surfaces;
- proper-name share;
- historical/obsolete/archaic share;
- pronunciation coverage;
- US-tagged / UK-tagged / unqualified IPA coverage;
- CMUdict exact-match coverage;
- Wiktionary + CMUdict combined pronunciation coverage;
- ESDB overlap and disagreements;
- wordfreq overlap and ranked coverage;
- source sizes.

Do not freeze a final English row count before these diagnostics.

### 12B3 — English phonology fixture

Build a small, reviewable fixture containing:

- perfect rhymes;
- multisyllabic rhymes;
- stress-shift homographs;
- alternate pronunciations;
- US/UK variants;
- rhotic/non-rhotic cases;
- consonant-family slants;
- vowel-family slants;
- assonance;
- consonance;
- false orthographic friends.

Define the English analyzer/scorer from this fixture and benchmark, not by transliterating German policy names.

### 12B4 — English publish layer

Materialize source-backed lexical rows with:

- surface;
- normalized surface;
- lemma;
- POS;
- form/lemma relationships;
- register/style/history evidence;
- pronunciation variants;
- pronunciation source + locale tags;
- usage evidence;
- ESDB corroboration/variant evidence.

Unresolved pronunciations remain unresolved unless an explicitly accepted fallback policy exists.

### 12B5 — English Writer DB

Materialize indexed local SQLite:

```text
data/local/rhymelab-en-v1.sqlite
```

Build retrieval indexes for the accepted English phonology rather than reusing German suffix keys blindly.

### 12B6 — benchmark + acceptance

Require:

- deterministic source fingerprints;
- pronunciation coverage diagnostics;
- protected exact-rhyme cases;
- slant/family relation review;
- spelling-vs-sound false-friend cases;
- alternate-pronunciation behavior;
- usage/commonness sanity;
- long-tail lexical safety;
- duplicate/family diversity;
- indexed retrieval equivalence;
- repeated DB-open fingerprint stability;
- unchanged frozen German Writer/Phrase behavior.

### 12B7 — product integration

Only after the English runtime gate is credible:

- enable `EN`;
- enable `DE+EN`;
- keep channels/languages distinguishable;
- do not invent cross-language numeric score calibration;
- do not start Phase 13 cross-language rhyme merely because two monolingual runtimes exist.

## Next-thread starting point

A new thread should begin by reading:

1. `AGENTS.md`
2. `docs/HANDOVER.md`
3. `docs/ENGLISH_WRITER_SOURCE_PLAN.md`
4. `docs/WRITER_SEARCH_ACCEPTANCE.md`
5. `DATA_SOURCES.md`
6. `ROADMAP.md`
7. `PROJECT_STATE.json`

Then start **12B1 source manifests/bootstrap + 12B2 diagnostics**.

Do not reopen Entity work first.

## Research sources reviewed 2026-09-18

Primary references:

- Kaikki English dictionary: https://kaikki.org/dictionary/English/index.html
- Kaikki English-edition raw downloads: https://kaikki.org/dictionary/rawdata.html
- Wiktextract project and data format: https://github.com/tatuylonen/wiktextract
- English Wiktionary copyright terms: https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- CMUdict: https://github.com/cmusphinx/cmudict
- English Speller Database / SCOWL v2: https://github.com/en-wl/wordlist
- ESDB copyright/redistribution terms: https://github.com/en-wl/wordlist/blob/v2/Copyright
- wordfreq: https://github.com/rspeer/wordfreq

The source architecture above is the project decision. Exact artifact versions/checksums are pinned during 12B1 rather than invented in this planning document.
