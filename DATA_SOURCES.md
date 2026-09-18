# RhymeLab Data Sources

This file is the durable source/license/provenance registry. Every importer or supplemental layer must identify its source and preserve enough provenance to reproduce or audit the local build.

## Active German sources

### Leipzig Corpora Collection — News + Wikipedia + Web

Purpose: usage ordering and raw corpus frequency evidence only.

Current mix:

- German News 2024 1M
- German Wikipedia 2021 1M
- German Web 2021 1M

Ranking method: normalize each source to per-million frequency, then take an equal-weight mean. Stored derived fields can include usage rank/score, aggregate count and source count.

**Frequency never supplies linguistic facts.** Missing Leipzig evidence means unranked/unknown. It must not be interpreted as rare, historical, dated or obsolete.

### German Wiktionary via Kaikki / Wiktextract

Primary dictionary/pronunciation/lexical-style source for:

- surface forms;
- lightweight lemma/form-of relationships;
- POS and gender where present;
- attested IPA;
- pronunciation tags/qualifiers;
- lexical style tags/qualifiers where exposed by the source.

Current local snapshot family is German Wiktionary / Kaikki raw Wiktextract data, streamed from the compressed local source file. Wiktionary source licensing applies (CC BY-SA + GFDL); attribution/share-alike boundaries remain explicit.

Pronunciation qualifiers are preserved so standard, regional, colloquial, contextual and connected-speech variants can be distinguished. Preferred/default ordering is a RhymeLab policy derived from source facts, not a new Wiktionary assertion.

### Historical/current lexical policy

RhymeLab schema v4 carries lexical style evidence separately from pronunciation and usage. The current historical tag set is:

- `archaic`
- `obsolete`
- `dated`

A form is classified `historical_only` only when **all available lexical evidence for that form/resolution is historical**. If current/unmarked evidence exists alongside an old sense, the form remains visible by default. This avoids hiding modern homographs because one sense is old.

Other style tags such as `rare`, `poetic`, `regional`, `dialectal`, `slang` or `colloquial` are preserved as lexical metadata when available but are not currently equivalent to the historical-only filter.

Historical-only classification is used by the local API/UI to suppress those forms from default search/rhyme candidates; explicit opt-in restores them. This is a RhymeLab presentation/search policy over source-attested labels.

## Curated modern vocabulary layer

File: `data/supplemental/modern-entities.json`  
Schema: `rhymelab-modern-entities-v1`

Purpose: cover common platforms, brands, companies, products and internet terms used in German-language contexts that are not reliably available with usable pronunciation in the primary dictionary snapshot.

The checked-in seed contains 28 curated entries. Dictionary-backed forms take precedence over supplemental forms. Every supplemental pronunciation must be reviewed/defensible; do not silently scrape/infer additions. Future generated/G2P pronunciations require a distinct inferred/fallback provenance class.

## Derived by RhymeLab

Generated deterministically from IPA: canonical phonemes, syllable/stress representation, rhyme tails, vowel/consonant sequences, exact/multisyllabic/slant/coda candidate keys, `de-phon-v2` primary-rhyme features/scoring, `rhyme-relations-v1` Assonance/Consonance relation evidence, and pronunciation preference/eligibility policy.

Lexical historical/current state is derived only from preserved lexical source qualifiers under the policy above, never from rhyme score or corpus-frequency absence.

The relation layer is language-neutral at the interface level, but its input similarities remain language-specific. German currently supplies the only registered phonology profile.

## Phase 11 phrase / mosaic source decision

Phase 11A source/licensing research is complete. Detailed matrix and evidence:

`docs/PHRASE_SOURCE_SURVEY.md`

The selected source stack is layered rather than treating any single resource as a universal phrase database.

### Selected production inputs

**German Wiktionary via raw Kaikki/Wiktextract — USE WITH CONDITIONS**

Primary high-precision phraseology seed for source-backed phrase entries, idioms/fixed expressions, proverbs and figurative labels where actually present. Pin the deWiktionary dump date, Kaikki extraction date/Wiktextract revision and source-record provenance. Wiktionary CC BY-SA + GFDL obligations remain a separate third-party license boundary.

Verified survey snapshot: Kaikki extraction 2026-09-15 from deWiktionary dump 2026-09-01; raw JSONL 2.8 GB / 289.3 MB gzip; German dictionary view reports 6,209 phrase-POS senses.

**Leipzig Corpora Collection downloadable text corpora — USE**

Reuse the already configured German News 2024 1M, German Wikipedia 2021 1M and German Web 2021 1M packages for deterministic phrase/n-gram attestation and commonness. The Leipzig terms distinguish downloadable text corpora (CC BY) from other site/data/service terms. Only explicitly downloaded, manifested CC-BY corpus packages are eligible production inputs.

Corpus evidence may supply counts/commonness/association evidence. It must not manufacture idiom, metaphor, proverb or fixed-expression labels.

### Selected conditional/optional layers

- **Tatoeba German text — USE WITH CONDITIONS:** sentence/fragment diversity only after contributor attribution can be deterministically resolved and preserved for every retained record; never use Tatoeba contribution counts as general German commonness.
- **Wikidata Lexemes — USE:** optional CC0 lexical identity/semantic support; no need to download the full dump for Phase 11B1.
- **OpenThesaurus — USE WITH CONDITIONS:** optional synonym/association layer under a deliberately selected CC BY-SA 4.0 or LGPL boundary; not phraseological truth/commonness.
- **OdeNet — USE WITH CONDITIONS:** optional CC BY-SA WordNet-style semantic graph; avoid double-counting evidence inherited from OpenThesaurus.
- **ParlaMint-AT 4.1 — USE WITH CONDITIONS / LATER:** CC BY 4.0 German/Austrian parliamentary corpus for later register/formulaic enrichment, not general commonness.

### Research-only / rejected product inputs

- **COLF-VID — RESEARCH ONLY:** repository states CC BY-NC-SA 4.0; useful literal/figurative idiom evidence but not commercial-compatible product ingestion.
- **PARSEME VMWE 1.3 — RESEARCH ONLY:** useful taxonomy/benchmark reference; do not ingest until the exact current German artifact and its text/license chain are pinned.
- **GermaNet — RESEARCH ONLY:** use requires the appropriate agreement; no production ingestion without a separately recorded commercial redistribution license.
- **DeReKo / COSMAS II — RESEARCH ONLY:** normal access is explicitly scientific/non-commercial.
- **DWDS corpus families — RESEARCH ONLY:** corpus-specific rights are heterogeneous and are not assumed product-compatible.
- **DWDS Wortprofil code — RESEARCH ONLY method reference:** GPL-3.0 collocation/MWE extraction implementation; useful algorithmic reference, not copied into RhymeLab by accident.
- **Unlicensed public phrase websites — REJECT:** public readability without reproducible bulk access and explicit ingestion/redistribution rights is insufficient.

### Phase 11B1 implementation boundary

The fixture-validated implementation is now:

```text
schema                 rhymelab-phrase-catalog-v1
catalog policy         de-phrase-catalog-v1
Leipzig match policy   leipzig-exact-token-sequence-v1
contract               docs/PHRASE_CATALOG_V1.md
```

It preserves source/snapshot/license provenance, source-backed phrase types/tags, deterministic token boundaries, historical/current state, and per-corpus Leipzig occurrence/commonness evidence.

The next gate is an owner-local full source build:

```powershell
npm run phrase:catalog:bootstrap
```

No phrase pronunciation, mosaic index, phrase ranking or runtime/API integration is part of 11B1. Generated DB/report/raw data remain local and gitignored.

## Modern informal/register evidence

### Cologne Corpus of Kiezdeutsch 2025 v2 — USE

Purpose: a **small high-quality youth/urban/spoken register sensor**, not representative general German frequency.

Source record: `sources/phrase/cologne-kiezdeutsch-2025-v2.json`.

The 2023 Cologne recordings contain informal in-group conversations among 17–20-year-old male vocational-school students in monolingual, multilingual and mixed groups. The corpus reports 33,019 tokens / 3,721 turn-takes and is published under CC BY 4.0.

RhymeLab deliberately downloads only the three transcription PDFs (about 970 KiB combined). Audio is not downloaded. Derived evidence is stored separately under `rhymelab-phrase-register-evidence-v1` and may only support source-backed register signals such as youth / urban / spoken / Kiezdeutsch. It does not create a phrase type, candidate, or general commonness claim.

Policy: `cologne-kiezdeutsch-register-exact-token-sequence-v1`.

### RUEG German via DAKODA — REJECTED / REMOVED

The slim RUEG German subcorpora were evaluated locally. Inspection of the real EXB/metadata archives showed that their primary value is ordinary learner/register utterance evidence, not targeted phraseology, idioms, proverbs, metaphors, or formulaic songwriting material. The source was therefore removed from the production pipeline to avoid storage, schema, UI and maintenance cost without sufficient product value.

## Deferred sources

Possible later additions include UniMorph German, explicitly labeled pronunciation fallback resources, OpenThesaurus, OdeNet and Wikidata Lexemes. Definitions/full senses/semantic graphs/etymology/translations/embeddings remain outside the single-word rhyme hot path unless a later writer phase explicitly validates their use.

## Phase 12A multilingual cultural entity sources

Detailed architecture: `docs/ENTITY_LEXICON_PLAN.md`.

### Wikidata JSON entity dump — USE

Primary structured entity source.

- License: CC0 structured data.
- Access: official weekly JSON entity dump.
- Build policy: stream compressed snapshot; retain only selected cultural categories/fields/IDs/relations.
- Do not import the complete graph into product SQLite.
- Pin dump date, URL and checksum.
- Runtime remains offline.

The initial reproducible build still needs to read a full entity snapshot because there is no official category-specific dump containing all required labels, aliases, sitelinks and statements. Raw dump stays local/gitignored.

### Wikidata QRank — USE

Primary global popularity signal.

- Data license: CC0.
- Bulk QID-aligned ranking.
- Aggregates roughly twelve months of Wikimedia pageview activity across projects/languages.
- Use as global popularity evidence, not cultural truth.
- Combine with category-relative percentiles and DE/EN relevance signals.

### Wikimedia Analytics pageviews — OPTIONAL USE

Optional additive DE/EN/local-audience popularity evidence.

Prefer bulk datasets over per-entity REST calls. Current country/project/page releases include Wikidata item IDs for mapped pages.

Potential signals:

- German Wikipedia pageviews;
- English Wikipedia pageviews;
- German-audience pageviews;
- recent pageview momentum.

Differentially-private/thresholded releases must be treated as noisy/partial evidence. Missing rows are not factual zero popularity.

### MusicBrainz Core — USE / OPTIONAL ENRICHMENT

MusicBrainz core database data is CC0.

Allowed Phase 12A uses include retained artist/group/release/recording/work identity, aliases and relationships where the exact source table belongs to Core.

Do **not** ingest supplementary tags, ratings, derived statistics or other CC BY-NC-SA supplementary data into the commercial core.

Do not bulk-import the entire recording universe by default; prefer joins/enrichment for already retained or independently popular entities.

### GLEIF — OPTIONAL / DEFERRED

GLEIF legal-entity data is CC0.

Use only for later corporate/legal-name enrichment or disambiguation of retained business entities.

Do not use the multi-million-record LEI population as a primary company/brand generator: legal entities are not equivalent to culturally relevant brands and would undermine the popularity-cut objective.

### Wikidata IPA transcription / pronunciation metadata — USE

Wikidata IPA transcription (P898) is preferred source-backed entity pronunciation evidence where present.

Preserve qualifying language/name and pronunciation-variety context. Do not flatten multiple pronunciations into one entity-level IPA field.

Pronunciation audio metadata may be retained for evidence/review, but audio media itself has file-specific licensing and is not redistributed by default.

### CMU Pronouncing Dictionary — USE CANDIDATE FOR ENGLISH

CMUdict is permissively available for commercial use under its BSD-style terms and is a strong English lexicon candidate.

It does not provide reliable coverage of arbitrary global proper names by itself.

### gruut — RESEARCH / FALLBACK CANDIDATE

gruut provides offline DE/EN lexicons and G2P functionality under permissive code licensing, but the upstream repository is archived.

Evaluate as a reproducible fallback/benchmark, not as an unquestioned long-term dependency. Pin and audit individual language-data/model licenses before production use.

### eSpeak NG — RESEARCH ONLY FOR CURRENT COMMERCIAL CORE

eSpeak NG is GPL-3.0-or-later.

Do not make it a required dependency of a future closed/commercial RhymeLab core without an explicit licensing/architecture decision.

### External service identifiers

Wikidata external IDs may be stored as Wikidata structured data.

This does **not** authorize ingestion of the corresponding provider's metadata. IMDb/TMDB/Spotify/Discogs/etc. metadata needs a separate source/license/terms review before ingestion.

## Future English sources

English begins only after German is stable. Candidate source families include:

- English Wiktionary via Kaikki/Wiktextract for lexical/pronunciation provenance and qualifiers;
- CMU Pronouncing Dictionary as an additional pronunciation source where licensing/provenance rules are satisfied;
- reviewed English usage corpora for commonness ordering;
- optional English morphology resources where they materially improve form handling.

Source selection is not implementation. English must get its own local source snapshot/provenance registry, pronunciation policy, IPA/canonicalization pipeline, phonology profile and benchmark before it is enabled in the runtime.

## Provenance policy

Track source name/code, source URL when applicable, license/attribution requirements, snapshot/version, checksums for local third-party artifacts, importer/Git version, source record key where possible, pronunciation source/tags, lexical style tags, preferred/alternate/default-eligibility policy, locale/dialect/register, and whether pronunciation is attested, curated or generated/fallback.

## Storage policy

Git stores code, source manifests/licenses/checksums, small fixtures/benchmarks, tests/build logic and the small curated modern vocabulary file. Raw downloaded snapshots, generated language datasets, runtime SQLite and generated reports stay local/gitignored.
