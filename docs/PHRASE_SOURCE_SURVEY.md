# Phase 11A — German Phrase / Mosaic Source Survey

Last updated: 2026-09-18

Status: **COMPLETE — source stack selected for Phase 11B1**

This document records the Phase 11A public-source and licensing gate for German phrase, mosaic-rhyme and phraseology work. It is a technical/source-governance decision, not legal advice. License statements below are based on publisher/project terms verified on 2026-09-18. If upstream terms change, the pinned local snapshot and its recorded license remain the audit target.

## Decision summary

RhymeLab will **not** look for one universal phrase database. The selected architecture is layered:

| Layer | Selected source(s) | Decision | Phase 11B1 role |
| --- | --- | --- | --- |
| High-precision phraseology | German Wiktionary via raw Kaikki/Wiktextract | USE WITH CONDITIONS | primary source-backed phrase / idiom / proverb / figurative seed records |
| Corpus phrase discovery + commonness | existing Leipzig downloadable German corpora | USE | deterministic n-gram / phrase-attestation / commonness evidence |
| Sentence-fragment diversity | Tatoeba German text export | USE WITH CONDITIONS | schema-ready; ingestion only after author-attribution resolution is proven |
| Semantic support | Wikidata Lexemes | USE | optional stable lexical identity / semantic linking, not phrase truth |
| Semantic support | OpenThesaurus | USE WITH CONDITIONS | optional synonym/association discovery in an isolated license-bearing layer |
| Semantic support | OdeNet | USE WITH CONDITIONS | optional WordNet-style semantic graph in an isolated CC BY-SA layer |
| Domain/register enrichment | ParlaMint-AT 4.1 | USE WITH CONDITIONS | later German/Austrian parliamentary phrase evidence, not general commonness |
| Idiom research evidence | COLF-VID | RESEARCH ONLY | benchmark/phenomenon study only; non-commercial license excludes product ingestion |
| VMWE research evidence | PARSEME 1.3 | RESEARCH ONLY | annotation/design reference until the exact German distribution and license are pinned |
| Proprietary/restricted semantic resource | GermaNet | RESEARCH ONLY | do not ingest without a separately documented commercial redistribution agreement |
| Restricted corpus | DeReKo / COSMAS II | RESEARCH ONLY | research reference only; non-commercial scientific-use terms exclude product ingestion |
| Restricted corpus | DWDS corpus families | RESEARCH ONLY | corpus-specific rights are not assumed suitable for redistributable product data |
| Collocation implementation reference | DWDS Wortprofil software | RESEARCH ONLY | method reference only; do not copy GPL code into RhymeLab by accident |
| Unlicensed public phrase websites | miscellaneous | REJECT | public readability without reproducible bulk access + explicit rights is insufficient |

The **Phase 11B1 production path** is deliberately narrow:

1. pinned raw German Wiktionary/Wiktextract snapshot for source-backed phrases;
2. the already-used Leipzig News 2024 1M + German Wikipedia 2021 1M + German Web 2021 1M corpora for deterministic corpus evidence;
3. no new giant corpus download;
4. no phrase runtime, phonetic mosaic index, or phrase ranking yet.

## Evaluation criteria

Every serious candidate was checked for:

- official project/download location;
- reproducible bulk access;
- API availability where relevant;
- version/snapshot pinning;
- license and attribution;
- share-alike/non-commercial restrictions;
- commercial compatibility;
- redistribution rights;
- raw dataset redistribution implications;
- approximate scale;
- German-language coverage;
- raw format / record structure;
- phrase categories actually represented;
- stable or snapshot-scoped record identity;
- provenance that can survive ingestion;
- known quality/domain limitations;
- offline ingestion;
- fully offline RhymeLab runtime after ingestion.

A source can be useful for research while still being unsuitable as product data.

---

## Source matrix — legal/access

| Source | Official bulk location | Snapshot / scale verified | License | Commercial use | Raw/derived redistribution | Offline after ingest | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| German Wiktionary via Kaikki/Wiktextract | https://kaikki.org/dewiktionary/rawdata.html and Wikimedia dumps | 2026-09-15 extraction from 2026-09-01 deWiktionary dump; raw JSONL 2.8 GB / 289.3 MB gzip | Wiktionary CC BY-SA + GFDL | yes, subject to license duties | yes with attribution/share-alike/GFDL boundary as applicable | yes | USE WITH CONDITIONS |
| Leipzig Corpora Collection downloadable text corpora | https://wortschatz-leipzig.de/ and download catalog | existing project snapshots: News 2024 1M, Wikipedia 2021 1M, Web 2021 1M | downloadable text corpora: CC BY; other site data/services have different terms | yes for the explicitly downloadable CC-BY text corpora | attribution required; keep package/source manifest | yes | USE |
| Tatoeba text corpus | https://tatoeba.org/en/downloads | weekly exports; German selectable; sentence export has sentence ID, language, text | text: CC BY 2.0 FR; some records may have compatible alternate status | yes with attribution | yes only with author attribution resolved/preserved | yes | USE WITH CONDITIONS |
| OpenThesaurus | https://www.openthesaurus.de/about/download/api | 2026-09-16 text 1.61 MB zip; MySQL 6.40 MB | choice of CC BY-SA 4.0 or GNU LGPL | yes | yes under selected license + source/link obligations | yes | USE WITH CONDITIONS |
| OdeNet | https://github.com/hdaSprachtechnologie/odenet and WN package | release family includes v1.4 | data CC BY-SA 4.0; code MIT | yes | yes under CC BY-SA conditions | yes | USE WITH CONDITIONS |
| Wikidata Lexemes | https://www.wikidata.org/wiki/Wikidata:Database_download | current full/incremental JSON/RDF dumps; very large | structured Main/Property/Lexeme/EntitySchema data: CC0 | yes | yes | yes | USE |
| ParlaMint-AT 4.1 | http://hdl.handle.net/11356/1912 | 2024-06-03; AT package 315.2 MB; release-wide 1.231B words | CC BY 4.0 | yes | yes with attribution | yes | USE WITH CONDITIONS |
| COLF-VID | https://github.com/rafehr/COLF-VID | 34 German verbal-idiom types in v1.x; v2 WIP | CC BY-NC-SA 4.0 | **no** | non-commercial/share-alike only | yes technically | RESEARCH ONLY |
| PARSEME VMWE corpus 1.3 | official PARSEME/LINDAT release | multilingual VMWE release 1.3 | release/per-language terms must be pinned for German before use | not assumed | not assumed | yes technically | RESEARCH ONLY |
| GermaNet | University of Tübingen GermaNet distribution | release 20.0, Nov 2025 | separate academic, R&D and commercial agreements | only under suitable commercial agreement | derived-product distribution rights depend on agreement | yes technically | RESEARCH ONLY |
| DeReKo / COSMAS II | IDS Mannheim | current continuously maintained corpus archive | access agreement restricts content to scientific, non-commercial use | **no** under normal access | corpus not a redistributable product source | runtime product use rejected | RESEARCH ONLY |
| DWDS corpora | https://www.dwds.de/ | corpus-specific access/licenses | heterogeneous / often academic or corpus-specific | not assumed | not assumed | technically possible only where terms permit | RESEARCH ONLY |
| DWDS Wortprofil software | https://github.com/zentrum-lexikographie/wordprofile | software repository; collocation/MWE extraction backend | GPL-3.0 software | GPL permits commercial use, but creates copyleft obligations for copied/derived code | software obligations apply; corpus rights are separate | yes | RESEARCH ONLY |

### Important license boundary: Leipzig

Wortschatz Leipzig distinguishes the general site/data/service terms from the **downloadable text corpora**. The latter are explicitly offered under CC BY. RhymeLab therefore only treats a specifically downloaded, manifested text-corpus package as eligible production input. It does **not** generalize that permission to arbitrary Leipzig API/service data.

### Important license boundary: COLF-VID

The COLF-VID repository README explicitly states **CC BY-NC-SA 4.0** and notes that the associated paper mistakenly reported CC BY-SA. The repository license statement therefore controls this survey decision. COLF-VID is valuable research evidence but cannot become a RhymeLab commercial-compatible phrase source under the current terms.

### Important license boundary: Tatoeba

The sentence export supplies a stable numeric sentence ID, language and text, but CC BY requires author attribution. Phase 11B must not redistribute Tatoeba-derived phrase text until the chosen export/metadata path can deterministically resolve and preserve the required author attribution for every retained record.

---

## Source matrix — linguistic/technical utility

| Source | Actual useful content | Record/provenance key | Main weakness | Intended RhymeLab role |
| --- | --- | --- | --- | --- |
| German Wiktionary / Kaikki | phrase POS entries, idioms/fixed expressions, proverbs, figurative tags, IPA on some phrase entries, definitions/labels | snapshot + normalized page/entry identity; mint RhymeLab snapshot-scoped source-record IDs where no immutable sense ID exists | editorial coverage is uneven; phrase taxonomy/tags are incomplete and community-authored | high-precision source-backed phrase catalog |
| Leipzig corpora | natural sentences, token/word frequencies and corpus evidence from News/Web/Wikipedia packages | corpus package ID + snapshot + sentence/row ID | not a phrase dictionary; web/news bias; sentence randomization destroys document coherence | derive n-grams, collocations, attestation and commonness only |
| Tatoeba | human-contributed sentences and fragments, translations, modern conversational constructions | stable sentence ID + contributor attribution | not a representative frequency corpus; quality/register varies | phrase/fragments diversity, never commonness truth |
| OpenThesaurus | German synonyms and associations, including multiword lexicalizations | snapshot + thesaurus synset/entry identity | not an idiom/commonness corpus; overlaps semantically with OdeNet | optional deterministic semantic expansion |
| OdeNet | WordNet-style German synsets/relations, multiword lexemes | versioned WordNet synset/lexeme identity | automatically created portions and uneven manual review; not commonness/phraseology truth | optional semantic graph |
| Wikidata Lexemes | lexeme identity, senses/forms and structured links | stable L-IDs plus Q/P entity IDs | sparse/inconsistent lexeme coverage for phraseology; full dump huge | stable optional identity/semantic support |
| ParlaMint-AT | German parliamentary utterances, TEI and annotated formats | release + document/utterance XML IDs | domain- and Austria-skewed; formal/political register | later register/domain phrase evidence |
| COLF-VID | sentence contexts labeled literal vs figurative for 34 German verbal idiom types | version/file/instance identity | tiny focused inventory; NC license | figurativity/benchmark research |
| PARSEME | annotated verbal MWEs and detailed VMWE categories | release + sentence/token/VMWE IDs | verbal-MWE scope only; exact German release/license must be pinned | taxonomy + benchmark design reference |
| GermaNet | large curated German semantic network | release-specific synset/lexical-unit IDs | restricted licensing and not specifically phrase-focused | semantic research reference only |
| DeReKo | very large contemporary German corpus | service/corpus internal IDs | non-commercial scientific access; no product redistribution | research sanity checks only |
| DWDS corpora | high-quality historical/current German corpora | corpus-specific IDs | heterogeneous rights/access | research sanity checks only |
| DWDS Wortprofil | dependency-based collocation extraction, logDice, MWE chaining implementation | software revision | GPL code + ML annotation dependencies + no corpus data rights bundled | algorithmic reference, not copied runtime code |

---

## Detailed source notes

### 1. German Wiktionary via raw Kaikki/Wiktextract — USE WITH CONDITIONS

**Official locations**

- raw extraction: https://kaikki.org/dewiktionary/rawdata.html
- machine-readable German overview: https://kaikki.org/dewiktionary/Deutsch/index.html
- original dumps: https://dumps.wikimedia.org/dewiktionary/
- Wiktextract format/code: https://github.com/tatuylonen/wiktextract

**Current verified snapshot**

Kaikki reports a 2026-09-15 structured extraction from the deWiktionary dump dated 2026-09-01. The raw output is JSONL, one object per line, 2.8 GB uncompressed / 289.3 MB gzip. The German dictionary view reports **6,209 phrase-POS senses** in this snapshot family.

**Coverage**

The source directly exposes phrase entries and source labels/tags that can identify fixed expressions, idioms, proverbs and figurative uses when editors have encoded them. It also sometimes supplies phrase-level IPA, but RhymeLab Phase 11C will still prefer its accepted local token-pronunciation composition policy rather than silently treating coverage as complete.

**Provenance policy**

Pin the original dump date, Kaikki extraction date, Wiktextract revisions/hashes where supplied, and the raw-record identity. Because Wiktionary senses can be edited/reordered and are not guaranteed to have immutable cross-snapshot sense IDs, RhymeLab should create a deterministic **snapshot-scoped source_record_id** from source identity + normalized entry coordinates rather than pretending a permanent sense ID exists.

**Quality limitations**

Community lexicography is broad but uneven. A phrase tagged figurative is useful evidence; the absence of such a tag is not proof of literalness. Phrase type must remain source-backed or explicitly `unknown`.

### 2. Leipzig Corpora Collection — USE

RhymeLab already uses three German downloadable text-corpus snapshots:

- German News 2024 1M;
- German Wikipedia 2021 1M;
- German Web 2021 1M.

Do not add a new giant corpus for 11B1. Reuse these locally pinned packages first.

The Leipzig FAQ explains that source documents are split into sentences and randomized because original web documents may be copyrighted; original document structure is removed. That is acceptable for local n-gram/collocation extraction but means the corpus cannot support discourse/document-level phrase claims.

**Derived evidence only**

Leipzig evidence may establish:

- phrase/n-gram attestation count;
- source count across the three corpora;
- normalized per-million frequency;
- deterministic association scores such as PMI/logDice if later selected and documented;
- an aggregate phrase-commonness signal.

It must **not** manufacture an “idiom”, “metaphor” or “proverb” label.

### 3. Tatoeba — USE WITH CONDITIONS

Official downloads are weekly and the simple sentence file has:

`Sentence id [tab] Lang [tab] Text`

Tatoeba textual sentences are under CC BY 2.0 France and require author attribution. The stable sentence ID is excellent provenance, but the simple sentence export by itself is not enough if author identity cannot be resolved from the chosen bulk metadata.

**11B rule:** implement the source registry/schema first. Only enable real Tatoeba ingestion after a deterministic attribution join is demonstrated and fixture-tested. Tatoeba can supply useful conversational/common fragments, but its contribution counts are **not** a general German usage-frequency model.

### 4. OpenThesaurus — USE WITH CONDITIONS

OpenThesaurus offers direct bulk text and MySQL downloads plus an API. On 2026-09-18 the download page exposed a 2026-09-16 text archive (1.61 MB) and MySQL dump (6.40 MB). Data may be used under either CC BY-SA 4.0 or GNU LGPL according to the project.

RhymeLab should keep any OpenThesaurus-derived layer physically/logically separate with the chosen license and attribution recorded. It is a **semantic discovery source**, not evidence that a multiword string is a common idiom.

### 5. OdeNet — USE WITH CONDITIONS

OdeNet is an open German WordNet built initially from OpenThesaurus and English WordNet mappings. The data license is CC BY-SA 4.0; the Python code is MIT. It includes multiword lexemes and WordNet-style concept relations.

Use only as an optional semantic graph. Because OdeNet partly derives from OpenThesaurus, RhymeLab must not double-count their overlapping evidence as independent confirmation.

### 6. Wikidata Lexemes — USE

Wikidata's structured Main/Property/Lexeme/EntitySchema namespaces are CC0, and official JSON/RDF dumps support commercial and offline use.

The full dump is too large to justify downloading during 11A or 11B1. If needed later, use a pinned dump date and ingest only the German Lexeme subset required for stable lexical identity/semantic links. Stable `L...` Lexeme IDs are useful cross-source references. Wikidata does not become a phrase-commonness oracle.

### 7. ParlaMint-AT 4.1 — USE WITH CONDITIONS / LATER

ParlaMint 4.1 was published 2024-06-03 under CC BY 4.0. The Austrian package is 315.2 MB and the release provides parliamentary text with structured TEI/annotation artifacts.

This is a valuable later source for **German-language** repeated/formulaic parliamentary constructions and register metadata. It is not selected for 11B1 because:

- parliamentary language is domain-skewed;
- Austrian usage is regionally skewed relative to a general German writer;
- the current three-source Leipzig layer is sufficient to prove the initial phrase-data architecture without another large input.

Do not treat ParlaMint-AT frequency as general German commonness.

### 8. COLF-VID — RESEARCH ONLY

COLF-VID contains literal/figurative/undecidable/both annotations for occurrences of 34 German verbal idiom types. That makes it excellent for designing figurativity and idiom benchmark cases.

Its repository states **CC BY-NC-SA 4.0**. Therefore:

- no production ingestion;
- no redistributed phrase catalog derived from it;
- no use as a commercial-compatible runtime source;
- research/benchmark methodology only unless a separate permission is obtained.

### 9. PARSEME VMWE 1.3 — RESEARCH ONLY UNTIL PINNED

PARSEME provides a mature taxonomy and annotations for verbal multiword expressions. The 1.3 guidelines are useful for distinguishing verbal idioms, light-verb constructions and other VMWE classes.

The project has released multilingual corpora under language/release-specific terms. This survey did **not** establish an exact, current German 1.3 artifact + license pair strongly enough to satisfy RhymeLab's ingestion gate. Therefore the conservative decision is RESEARCH ONLY.

A future promotion requires:

1. exact German release artifact URL;
2. exact license attached to that artifact;
3. original-source text redistribution compatibility;
4. stable release checksum/version;
5. recorded provenance model.

### 10. GermaNet 20.0 — RESEARCH ONLY

GermaNet release 20.0 was announced for November 2025. It is a large, curated German semantic network.

The normal academic license is not a product license, and non-academic R&D terms are not a blanket redistribution grant. A commercial agreement is a separate path and may provide derived-product/service distribution rights.

RhymeLab therefore does not ingest GermaNet unless the project owner later obtains and records a suitable commercial license. OdeNet/Wikidata/OpenThesaurus provide an open semantic path meanwhile.

### 11. DeReKo / COSMAS II — RESEARCH ONLY

The IDS COSMAS II access agreement explicitly limits corpus contents to purely scientific and non-commercial purposes. This fails the Phase 11 production-source gate despite DeReKo's linguistic value.

Use only for external research/sanity checks where its terms permit. Do not export DeReKo-derived phrase text into the RhymeLab distributable phrase database.

### 12. DWDS corpora — RESEARCH ONLY

DWDS exposes multiple corpora with different rights. There is no single blanket license that can be safely generalized to every corpus.

RhymeLab must therefore treat DWDS corpus evidence as RESEARCH ONLY unless one specifically identified corpus is later audited with a commercial-compatible bulk license and redistribution policy.

### 13. DWDS Wortprofil software — RESEARCH ONLY METHOD REFERENCE

The public `zentrum-lexikographie/wordprofile` repository implements dependency-based collocation extraction, logDice statistics and optional chaining of overlapping collocations into MWEs. The software is GPL-3.0 and relies on a preprocessing stack that includes custom spaCy models.

Useful ideas:

- association strength should be separate from raw frequency;
- dependency-aware collocations can outperform naive adjacency for some phrase classes;
- overlapping collocation chains can generate MWE candidates.

RhymeLab should implement any chosen deterministic statistics independently over its licensed source data. Do not copy GPL implementation code into the existing project without an explicit licensing decision, and do not introduce a neural model dependency into the core runtime.

---

## Selected Phase 11 architecture

### Layer A — source-backed phraseology

**Input:** German Wiktionary raw Wiktextract.

Produces phrase records only when source evidence exists. Source tags/categories remain evidence, not normalized “truth” unless a deterministic mapping is documented.

Expected classes:

- phrase / fixed expression;
- idiom / Redewendung when source-backed;
- proverb when source-backed;
- figurative/metaphorical when source-backed;
- other phrase;
- unknown/unspecified.

### Layer B — corpus phrase discovery and commonness

**Input:** existing Leipzig News/Web/Wikipedia snapshots.

Deterministically derive n-grams/collocations and commonness evidence. Corpus-derived candidates are not automatically idioms. Keep at least:

- per-source occurrence count;
- per-million rate;
- number of source corpora attesting the phrase;
- chosen deterministic association metrics and policy version;
- sentence-level source IDs where available;
- normalization/tokenization policy version.

### Layer C — sentence-fragment diversity

**Input candidate:** Tatoeba German.

Only activates after contributor attribution can be preserved end-to-end. Used for phrase/formulaic fragments and diversity, not frequency.

### Layer D — semantic support

Optional and separable:

- Wikidata Lexeme IDs: open identity/support;
- OpenThesaurus: synonym/association support under chosen license;
- OdeNet: WordNet graph under CC BY-SA.

Semantic relatedness can help **discover** or group candidates. It cannot override phonetic quality and cannot create a source-free phrase.

### Layer E — later domain/register enrichment

ParlaMint-AT may provide parliamentary/formulaic German data with explicit Austrian/parliamentary register. It stays separate from general commonness.

---

## Phase 11B1 — concrete next milestone

Milestone name:

`PHASE_11B1_PROVENANCE_PHRASE_CATALOG`

### Scope

Build the **data model and deterministic ingestion skeleton only**. Do not add phrase search, pronunciation composition, mosaic indexing, phrase writer ranking, or UI surfacing yet.

### Required local tables / logical entities

1. `phrase_source`
   - source code/name;
   - homepage/download URL;
   - license identifier + license URL;
   - attribution text/requirements;
   - redistribution/share-alike flags;
   - source-role classification.

2. `phrase_snapshot`
   - source ID;
   - snapshot/version/date;
   - local artifact checksum;
   - upstream artifact URL;
   - importer version/Git revision.

3. `phrase`
   - phrase ID;
   - canonical surface;
   - normalized surface;
   - token count;
   - phrase type/state;
   - current/historical eligibility state;
   - deterministic identity fingerprint.

4. `phrase_attestation`
   - phrase ID;
   - source/snapshot;
   - source record ID;
   - source-provided tags/categories/register;
   - evidence payload/reference;
   - source-backed type claims only.

5. `phrase_token`
   - phrase ID;
   - token index;
   - surface + normalized token;
   - character boundaries;
   - lexical identity link when resolvable;
   - explicit unresolved state otherwise.

6. `phrase_usage_evidence`
   - phrase ID;
   - corpus source/snapshot;
   - count/per-million/source count;
   - association metric values;
   - policy/version.

7. optional `phrase_semantic_link`
   - phrase/token ID;
   - semantic source;
   - stable external ID;
   - relation type;
   - provenance.

The schema may reserve later pronunciation linkage, but **11B1 does not generate phrase pronunciation**. That is Phase 11C.

### 11B1 ingest work

1. Add a source manifest/registry and migration/build path for a separate phrase database/layer.
2. Implement a **small deterministic fixture importer** for raw German Wiktextract phrase records.
3. Implement source-backed type/tag preservation without inventing missing classifications.
4. Implement deterministic tokenization/boundary storage.
5. Add a Leipzig fixture pipeline that attaches corpus attestation/commonness to phrase candidates without claiming phraseological type.
6. Add Tatoeba schema fixtures only; real ingestion remains gated on attribution resolution.
7. Record fingerprints/checksums so identical inputs produce identical phrase-catalog output.

### 11B1 acceptance gates

- no modifications to frozen single-word Writer policies or ranking;
- no normal API/UI phrase endpoint yet;
- no runtime network dependency;
- source/snapshot/license provenance present for every attestation;
- deterministic rebuild fingerprints;
- idempotent ingestion;
- stable token boundaries;
- duplicate/canonicalization tests;
- unknown phrase type remains unknown rather than guessed;
- unresolved lexical tokens remain explicit;
- source-derived phrase type and corpus commonness remain separate;
- `npm run check`, `npm test`, and public-readiness audit pass;
- generated/raw/bulk data remains gitignored.

Only after this gate should Phase 11C start deterministic phrase pronunciation.

## Deferred decisions

The following are intentionally **not** selected yet:

- final phrase SQLite file/schema version;
- n-gram maximum length and corpus thresholds;
- final association metric/weights;
- connected-speech pronunciation rules;
- cross-word mosaic anchor/index design;
- phrase ranking weights/policy;
- UI presentation;
- human Writer NDCG.

Those require measured data from 11B/11C and dedicated benchmarks rather than guesses.

## Post-survey modern-register addendum — 2026-09-18

Two modern informal German resources were re-evaluated after the initial source decision because the owner prioritized current songwriting/youth-language fit and low local storage cost.

### Cologne Corpus of Kiezdeutsch 2025 v2 — SELECTED / USE

Product role: **high-precision modern youth/urban/spoken register evidence**.

Relevant properties:

- recorded in Cologne in 2023;
- informal peer-group conversations;
- speakers aged 17–20;
- monolingual, multilingual and mixed groups;
- 33,019 reported tokens / 3,721 turn-takes;
- GAT2 transcription;
- CC BY 4.0;
- three transcript PDFs total about 970 KiB;
- audio is unnecessary for the current phrase-attestation role.

Decision: ingest transcript PDFs only. Treat matches as register evidence, never as representative German frequency and never as automatic phraseological type.

Manifest: `sources/phrase/cologne-kiezdeutsch-2025-v2.json`.

### RUEG 1.0 — VERY GOOD LINGUISTIC FIT / DEFERRED FOR SIZE

RUEG remains attractive because it contrasts registers, modalities, age groups and mono-/multilingual speakers. However, the current official `RUEG-1.0_corpora.zip` alone is 4.4 GB; separate audio archives increase the release to 23.9 GB.

Decision: do not add RUEG to the normal RhymeLab source bootstrap at present. Re-evaluate only if a stable German-only text subset/export can be obtained reproducibly without multi-gigabyte download overhead and with a pinned license/provenance chain.

This is a technical/product-cost deferral, not a judgment that the linguistic resource is low quality.
