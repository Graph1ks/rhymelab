# Phase 12B — English Single-Word Writer Source Plan

Last updated: 2026-09-18

Status: **ACTIVE / 12B4 REPEATABILITY PASS / 12B5 OWNER DB BUILD+VERIFY PASS / 12B6 COVERAGE AUDIT IMPLEMENTED**


## Implementation checkpoint — 2026-09-18

Implemented in the Phase 12B1/12B2 source-workflow slice:

- versioned registry: `sources/en/phase12b-sources-v1.json`;
- owner bootstrap: `npm run en:sources:bootstrap`;
- source diagnostics: `npm run en:sources:diagnose`;
- deterministic source parsers/normalization helpers with unit coverage;
- pinned CMUdict, ESDB/SCOWL v2 and wordfreq artifacts;
- Kaikki moving-URL guard against the selected 2026-09-02 Wiktionary dump / 2026-09-16 extraction metadata;
- local SHA-256/source-size reporting for every downloaded artifact.

Owner source gate completed on 2026-09-18:

```text
English entries                         1,492,835
distinct headwords                      1,355,827
Writer candidate surfaces               1,084,050
Wiktionary IPA headword coverage            7.29%
CMUdict candidate coverage                  8.77%
combined pronunciation coverage            13.77%
ESDB candidate coverage                    22.19%
wordfreq candidate coverage                17.92%
Kaikki raw gzip                        2,900,609,279 bytes
```

This is enough to start 12B3, but not enough to freeze a final runtime population or approve broad G2P. The measured pronunciation coverage is over the raw long-tail candidate universe, not a frequency-qualified Writer cut.

12B3 candidate implementation now exists:

- `fixtures/en/phonology-v1.json` — 22 reviewable pronunciation entries;
- `scripts/english-phonology.mjs` — deterministic CMUdict ARPAbet + Wiktionary IPA normalization into one English canonical phone representation;
- `scripts/english-rhyme-features.mjs` — English-specific feature/scoring candidate;
- `npm run en:phonology:fixture` — 19 deterministic fixture checks;
- owner fixture result: 22 entries / 19 checks / 0 failures;
- English remains candidate-gated and is not added to the accepted runtime language list;
- G2P remains disabled.

12B4 source-backed publish implementation now exists:

- contract: `docs/ENGLISH_PUBLISH_V1.md`;
- builder: `npm run en:publish`;
- verifier: `npm run en:publish:verify`;
- output: `data/local/en-publish-v1/`;
- lexical cut requires Wiktionary lexical evidence plus a source-backed Wiktionary IPA or exact CMUdict pronunciation;
- unqualified Wiktionary IPA is preserved as `source_attested_unprofiled`, never silently promoted to en-US;
- default eligibility requires analyzed en-US pronunciation, current lexical evidence, non-proper-name-only status and no ESDB invalid marker;
- proper-name/common-word homographs remain eligible through ordinary lexical evidence;
- final Writer row count remains unfrozen and no runtime DB is created in 12B4.

Owner 12B4 full-data build + verifier result:

```text
published surfaces                 147,904
default-eligible surfaces           72,946
analyzed en-US surfaces            111,574
pronunciation variants             274,819
unresolved pronunciation variants   35,000
semantic fingerprint
4087cc8a41eff75a24e5cf33c25da1db0760bae658c7eb979a482c68acd56124
verify                              PASS
```

The remaining 12B4 freeze requirement is an independent second build from the unchanged sources. `npm run en:publish:repeatability` now performs that gate and writes `data/local/en-publish-repeatability-v1-report.json`.


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

RhymeLab already pins one CMUdict revision for the Entity coverage probe in `sources/entity/cmudict-entity-pronunciation-v1.json`.

Phase 12B may reuse that pinned artifact initially or intentionally pin a newer revision after an explicit source diff. Do not silently move the source.

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

### 12B4 — English publish layer — IMPLEMENTED / OWNER FULL BUILD PENDING

Contract: `docs/ENGLISH_PUBLISH_V1.md`.

Materialize source-backed lexical rows with:

- surface + strict publish normalization;
- lemma/form relationships from Wiktionary source evidence;
- POS and register/style/history evidence;
- source-backed pronunciation variants;
- CMUdict exact ARPAbet as en-US;
- Wiktionary IPA with en-US/en-GB qualifiers preserved;
- unqualified IPA preserved as source-attested/unprofiled;
- wordfreq rank/Zipf evidence without using it as lexical truth;
- ESDB size/region/POS/archaic/uncommon/invalid evidence;
- explicit default-eligibility reasons.

The source-backed publish cut requires Wiktionary lexical evidence plus at least one Wiktionary or exact-CMUdict pronunciation. Unsupported source IPA remains stored as unresolved source evidence; it is not guessed.

Owner build + verify passed. Freeze still requires one unchanged-source rebuild with the same semantic fingerprint:

```powershell
npm run en:publish:repeatability
```

No final English Writer row count or broad G2P policy is accepted in 12B4.

### 12B5 — English Writer DB — OWNER BUILD + VERIFY PASS

Contract: `docs/ENGLISH_WRITER_DB_V1.md`.

Materialize indexed local SQLite:

```text
data/local/rhymelab-en-v1.sqlite
```

The DB stores all source pronunciation variants separately. Unsupported/unresolved variants remain provenance rows but do not enter phonological retrieval indexes.

English-specific indexed channels:

- exact stressed tail;
- multisyllabic stressed tail;
- vowel sequence;
- English vowel-family + coarse coda;
- exact final coda.

The coarse coda bridge is English place/manner based and deliberately voicing-neutral so consonant-family slants such as /t/ ~ /d/ are not split before scoring. Exact coda remains a separate index.

12B5 refuses to build without a passing 12B4 repeatability report. The owner gate has now passed.

```text
forms                            147,904
default eligible                  72,946
pronunciations                   274,819
analyzed pronunciations          239,819
unresolved pronunciations         35,000
default-profile pronunciations   101,330
SQLite                            115.57 MiB
semantic fingerprint
fa078705ff6f4ae157b88301f6dea84933008590ff3f8c376832c684a1baca0b
retrieval equivalence            80 / 80 exact
```

No UI/API rewiring occurs in 12B5.

### 12B6 — coverage audit + benchmark + acceptance

Before ranking work, run the lexical/pronunciation funnel audit:

```powershell
npm run en:coverage:audit
```

Contract: `docs/ENGLISH_COVERAGE_AUDIT_V1.md`.

This is a blocking diagnostic gate because the 115.57 MiB English candidate DB is much smaller than the mature German Writer DB. The audit must determine whether that difference is explained by healthy source compaction/materialization differences or by excessive loss of common English lexical surfaces.

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

Then continue with the **12B6 coverage-funnel audit** before English ranking/benchmark acceptance.

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
