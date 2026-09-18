# RhymeLab — Multilingual Entity Lexicon Plan

Last updated: 2026-09-18

Status: **Phase 12A current architecture gate**

This phase creates a compact local cultural-entity SQLite layer for songwriting, lyrics, rap and creative-language retrieval. It is not a generic mirror of Wikidata and it must not turn RhymeLab into a hosted knowledge graph.

## 1. Product goal

Build a separate local database containing culturally relevant named entities and their source-backed or explicitly generated pronunciations.

Primary use cases:

- search culturally relevant names by spelling;
- filter by category, subtype, genre, origin, year and popularity;
- retrieve entities by rhyme, assonance, slant-rhyme and multisyllabic similarity;
- later use multi-token entity names in Phrase/Mosaic-style retrieval;
- rank names by cultural relevance without flooding results with Wikidata long-tail noise;
- preserve enough provenance to distinguish source-backed pronunciation from generated fallback.

Examples:

```text
luxury_brand + popularity A/B + 2..3 syllables + strong assonance
fictional_character + 3..5 syllables + German relevance + mosaic match
artist + English relevance + 4 syllables + slant rhyme
known entity + similar vowel sequence + no perfect end rhyme
```

## 2. Architectural decision: entities are language-neutral, pronunciations are multilingual

Do **not** design the entity table around flat columns such as:

```text
ipa_native
ipa_de
```

Those are insufficient for real proper names.

One entity may have:

- multiple source-backed names;
- labels and aliases in different languages/scripts;
- multiple accepted pronunciations;
- a native pronunciation plus a German adaptation;
- different English variants;
- stage names, abbreviations and short forms;
- pronunciation variants that apply only to one specific name.

The core entity identity therefore stays language-neutral. Names and pronunciation variants are separate rows.

Initial runtime-relevant pronunciation roles:

```text
native
de-DE
en-US
en-GB        optional when independently attested/useful
other        preserve when explicitly attested; do not mass-generate
```

"native" is a pronunciation role, not a language code. Every pronunciation variant must also carry an explicit locale/language where known.

Do not generate every entity in every language.

## 3. Source boundary

### 3.1 Wikidata item dump — primary entity source

Use the official Wikidata JSON entity dump as the canonical structured entity source.

Required properties of the source pipeline:

- pin snapshot date;
- record source URL and checksum;
- stream the compressed dump;
- never import/store the complete Wikidata graph into SQLite;
- keep only selected categories, fields, identifiers and relations;
- raw dumps remain local/gitignored;
- runtime never requires Wikidata/network access.

Wikidata structured data is CC0 and is eligible for commercial/local product use under the existing project source policy.

The official JSON dump is line-oriented by entity and suitable for streaming.

Practical constraint: there is no official culture-category subset that provides all required labels, aliases, sitelinks and statements. The initial reproducible build therefore still needs to **read a complete Wikidata entity snapshot once**. The compact SQLite output is the subset.

After the first baseline, official add/change dumps may be evaluated for incremental refreshes.

### 3.2 Wikidata QRank — selected global popularity source

Use Wikidata QRank as the primary global popularity signal.

QRank aggregates approximately twelve months of page-view activity across Wikimedia projects/languages and publishes a simple QID-based bulk ranking. Its data is CC0.

Advantages:

- already entity/QID aligned;
- cross-language;
- resilient against one-language bias;
- avoids millions of per-article API calls;
- small enough to join locally;
- directly suited to long-tail filtering.

QRank is a popularity signal, not cultural truth. It must be combined with category-relative ranking and local-language signals.

### 3.3 Wikimedia Analytics pageviews — optional DE/EN/local relevance signal

Wikimedia Analytics data is an optional additive signal.

Prefer bulk data over millions of REST calls.

The current country/project/page dataset includes Wikidata item IDs for mapped pages, so later builds can derive signals such as:

```text
pageviews_dewiki_365d
pageviews_enwiki_365d
pageviews_german_audience_365d
pageviews_recent_30d
```

Caveat: the differentially-private release uses thresholds/noise. Missing rows must not be interpreted as factual zero popularity.

Use pageviews as a ranking/bonus signal, never as the sole inclusion criterion.

### 3.4 MusicBrainz Core — optional music enrichment

MusicBrainz core data is CC0 and is a strong optional enrichment layer for:

- artists;
- groups;
- artist aliases;
- releases/release groups;
- recordings;
- works;
- canonical music identifiers/relationships.

Do **not** ingest MusicBrainz supplementary tags, ratings, derived statistics or other NC-SA supplementary material into the commercial core.

Do not import all MusicBrainz recordings by default. That would defeat the popularity-cut objective. Prefer:

1. entities already retained from Wikidata;
2. direct MusicBrainz/Wikidata identifier joins;
3. later explicitly benchmarked music-category expansion.

### 3.5 GLEIF — optional corporate/legal-name enrichment only

GLEIF data is CC0, but its millions of legal entities are not equivalent to culturally relevant brands.

Do not use GLEIF as a primary candidate generator.

Possible later use:

- legal/canonical company names;
- alternate registered names;
- corporate identity disambiguation.

Only enrich already retained/high-value business entities unless a separate company-specific benchmark justifies broader ingestion.

## 4. Category model

A single `type/subtype` column is too restrictive.

Many relevant entities are inherently multi-category:

- actor + musician;
- rapper + producer;
- company + brand + fashion house;
- film + franchise entry;
- fictional character + game character.

Use:

- one optional `primary_category` for display/default ranking;
- many-to-many `entity_category` rows for retrieval;
- per-category popularity percentile/tier.

Initial category families:

```text
person.artist
person.rapper
person.musician
person.dj
person.producer
person.actor
person.director
person.comedian
person.author
person.fashion_designer
person.internet_personality

group.band
group.music_group

organization.brand
organization.luxury_brand
organization.fashion_house
organization.company
organization.automotive_marque
organization.record_label
organization.sports_team

work.film
work.tv_series
work.video_game
work.album
work.song
work.franchise

fictional.character
fictional.group

optional later:
place.city
place.neighborhood
place.venue
place.landmark
product.vehicle_model
product.fashion_product
product.consumer_product
```

Category taxonomy must be explicit, versioned and reviewed. Do not follow arbitrary `subclass of` chains at runtime.

Create a frozen taxonomy snapshot such as:

```text
sources/entity/wikidata-entity-taxonomy-v1.json
```

It should contain:

- accepted root/subclass QIDs;
- occupation QIDs for human categories;
- property rules;
- exclusions;
- category priority;
- provenance/snapshot metadata.

## 5. Candidate selection and long-tail control

The entity build needs two filters:

### 5.1 Structural relevance gate

An item must first qualify for at least one accepted category using source-backed Wikidata statements.

Examples:

- humans require relevant occupation/category evidence;
- works require accepted work type;
- brands/companies require accepted organization/brand classes;
- fictional characters require explicit fictional-character classification.

Do not keep an item only because it has many statements.

### 5.2 Popularity gate

Apply popularity only *after* category assignment.

Never use one global threshold for every category.

Companies, songs and generic organizations need much stricter cuts than artists, films or culturally relevant fictional characters.

The retained target is a product budget, not a promise:

```text
initial target entity count: approximately 500k..1.2M
preferred v1 working target: approximately 600k..900k
```

Do not lock the final number before the first full diagnostics.

## 6. Popularity model

Store raw evidence and derived values separately so ranking can be retuned without re-importing Wikidata.

### 6.1 Raw signals

Recommended entity-level raw fields:

```text
qrank_12m
wikipedia_sitelink_count
has_dewiki
has_enwiki
wikimedia_sitelink_count_total
external_id_count
external_id_weighted_count
statement_count
pageviews_dewiki_365d       optional
pageviews_enwiki_365d       optional
pageviews_de_audience_365d  optional
pageviews_recent_30d        optional
```

Statement count and external-ID count are weak quality/completeness signals only and must be capped.

### 6.2 Absolute popularity score

Start with a deterministic bounded score built primarily from:

```text
global QRank
Wikipedia sitelinks
DE/EN presence and optional DE/EN pageviews
selected strong external IDs
small capped statement-richness signal
```

Do not allow statement count or identifier spam to dominate page-view/sitelink evidence.

Exact weights are a Phase 12A diagnostic decision, not frozen in this plan.

### 6.3 Category-relative popularity

For every retained category membership calculate:

```text
category_score
category_rank
category_percentile
category_tier = A | B | C
```

This is important because the same person can be:

```text
Tier A actor
Tier C musician
```

A single entity-level percentile cannot represent that correctly.

The entity table may still expose a convenience `popularity_score` and `popularity_tier` based on its primary category/global evidence.

### 6.4 Hard cultural keep guards

Category-relative cuts need explicit guardrails so culturally strong names do not disappear merely because their global rank is below megastars.

Candidate guard signals include combinations such as:

- unusually high Wikipedia language/sitelink count;
- both DE and EN Wikipedia present;
- strong QRank;
- high German-audience or German-Wikipedia views;
- multiple high-value external IDs;
- category Tier A.

Exact thresholds must be benchmarked.

Test sentinel:

```text
Bud Spencer / Q221074
expected: KEEP
expected category: person.actor
expected tier: A for relevant film/actor category
```

This sentinel must remain in the acceptance fixture.

## 7. Bud Spencer rationale

Bud Spencer is a useful anti-US-centric / anti-megastar-only sentinel.

The entity has broad multilingual Wikipedia coverage, including DE and EN, plus strong authority/external-ID coverage.

The popularity model must therefore retain him even if an absolute all-celebrity ranking would place him far below the world's largest current stars.

This demonstrates why the build needs:

- global popularity;
- DE relevance;
- category-relative percentiles;
- hard cultural keep guards.

## 8. Entity schema

Target database:

```text
data/local/rhymelab-entities-v1.sqlite
```

Keep this separate from the frozen German Writer DB and the Phrase/Mosaic DB.

Suggested normalized schema:

```text
entity
  entity_id INTEGER PRIMARY KEY
  qid TEXT UNIQUE NOT NULL
  primary_category TEXT
  description_de TEXT
  description_en TEXT
  popularity_score REAL
  popularity_percentile REAL
  popularity_tier TEXT
  qrank_12m INTEGER
  wikipedia_sitelink_count INTEGER
  has_dewiki INTEGER
  has_enwiki INTEGER
  statement_count INTEGER
  external_id_count INTEGER
  source_snapshot_id INTEGER

entity_category
  entity_id
  category
  subtype
  evidence_property
  evidence_qid
  category_score
  category_rank
  category_percentile
  category_tier

entity_name
  name_id INTEGER PRIMARY KEY
  entity_id
  surface
  normalized
  language
  script
  name_kind
  preferred
  searchable
  source_kind
  source_record

entity_name_token
  name_id
  token_index
  surface
  normalized
  start_char
  end_char

entity_pronunciation
  pronunciation_id INTEGER PRIMARY KEY
  name_id
  locale
  pronunciation_role
  ipa
  preferred
  source_kind
  source_record
  generated
  model_id
  confidence
  review_state

entity_phonetic_analysis
  pronunciation_id
  analyzer_id
  phonemes
  syllables
  syllable_count
  primary_stress
  secondary_stress
  stress_pattern
  vowel_sequence
  consonant_sequence
  rhyme_tail
  rhyme_signature

entity_external_id
  entity_id
  property_id
  system
  value

entity_relation
  entity_id
  predicate
  target_qid
  target_entity_id
  salience

entity_country
  entity_id
  country_qid
  role

entity_genre
  entity_id
  genre_qid

entity_year
  entity_id
  year
  role

entity_source_snapshot
  snapshot_id
  source
  version
  url
  sha256
  license_id
  importer_version
```

## 9. Name and alias policy

Do not store every label/alias in every Wikidata language.

Initial name retention:

- German label + selected German aliases;
- English label + selected English aliases;
- source/native label when distinct and useful;
- source-backed stage names/pseudonyms/short names;
- source-backed MusicBrainz aliases for retained music entities;
- selected transliterations only when source-backed and product-useful.

Deduplicate Unicode-normalized equivalent surfaces.

Do **not** automatically turn every token of a multi-word entity into an alias.

Examples such as:

```text
Kendrick Lamar -> Kendrick
Mercedes-Benz -> Benz
```

must be stored as standalone aliases only when source-backed or produced by an explicit accepted alias policy.

The phonetic layer may still tokenize full names internally for future mosaic matching without claiming each token is a real alias.

## 10. External-ID policy

Count external IDs as a weak popularity/completeness signal, but persist only a category-relevant whitelist.

Potential systems:

- MusicBrainz identifiers;
- IMDb identifier;
- selected TMDB identifiers where present in Wikidata;
- Discogs identifiers;
- Spotify identifiers;
- ISNI/VIAF where useful for identity resolution;
- selected game/film/music databases after source review.

Important boundary:

An external ID stored *from Wikidata* is Wikidata structured data.

That does **not** grant permission to ingest the corresponding external service's metadata. Any later metadata import from IMDb/TMDB/Spotify/etc. needs its own source/license/terms audit.

## 11. Relation policy

Do not copy the Wikidata graph.

Persist only relations that materially improve creative search, disambiguation or graph navigation.

Candidate relation families:

```text
part_of
part_of_series
franchise
creator
director
performer
member_of
record_label
owned_by
manufacturer
character_in
based_on
genre
```

Default retention rule:

- relation predicate is whitelisted;
- source entity is retained;
- target is retained or belongs to a small required identity table;
- high-degree relations get a deterministic cap/salience policy.

Do not allow cast lists, company structures or recording graphs to explode the database without measured product value.

## 12. Pronunciation source hierarchy

Every pronunciation carries provenance.

Preferred source order:

1. RhymeLab reviewed/manual override with explicit provenance;
2. Wikidata IPA transcription (P898) with language/pronunciation qualifiers;
3. trusted pronunciation lexicon exact match;
4. source-audited G2P fallback;
5. unresolved.

Wikidata pronunciation audio may be kept as metadata/reference evidence, but media licensing differs per file. Do not redistribute pronunciation audio by default.

Wikidata P898 supports language/name and pronunciation-variety qualification and should be preserved, not flattened.

## 13. German/English/native pronunciation policy

For each retained name, attempt only useful profiles.

### Native

Create a native variant only when the source language/locale can be resolved with sufficient confidence.

Do not infer "native" merely from the language tag of an English/German Wikidata label.

### German

For `de-DE`:

1. reviewed German entity override;
2. explicitly attested German pronunciation;
3. exact German pronunciation-lexicon match;
4. source-audited German G2P fallback;
5. unresolved.

A native pronunciation is not automatically the German pronunciation.

### English

For Phase 12 English:

1. reviewed English entity override;
2. explicitly attested English pronunciation;
3. exact English lexicon match;
4. source-audited English G2P fallback;
5. unresolved.

Use `en-US` as the initial English runtime profile unless Phase 12 benchmarks justify a different default. Preserve `en-GB` as an alternate when attested/useful.

## 14. G2P policy

G2P output is generated evidence, not pronunciation truth.

Every generated row needs:

```text
generated = 1
model_id
model_version
input_locale
confidence/review_state
```

Tier-A names should be eligible for manual review/override.

### gruut

gruut is a useful offline DE/EN research candidate and its code is permissively licensed, but the upstream repository is archived.

Do not make the long-term production architecture depend solely on gruut.

Evaluate:

- exact lexicon coverage;
- proper-name error rate;
- G2P quality on entity fixture;
- individual language-data licenses;
- reproducible model snapshots.

### CMUdict

CMUdict is a strong permissive English pronunciation lexicon and should be evaluated for the Phase 12 English base pronunciation stack.

It will not solve arbitrary global proper names by itself.

### eSpeak NG

eSpeak NG is GPL-3.0-or-later.

Do not make it a required dependency of a future closed/commercial RhymeLab core without an explicit licensing/architecture decision.

It may remain a benchmark/reference candidate.

## 15. Analyzer boundary

Do not store one universal unversioned `rhyme_tail`.

Derived phonetic features are analyzer/profile dependent.

Examples:

```text
de-ipa-v2
future en-ipa-v1
future cross-language-phone-v1
```

The raw IPA pronunciation is the source pronunciation layer.

The `entity_phonetic_analysis` table stores versioned derived representations.

This allows:

- German scoring against German adaptations;
- English scoring against English pronunciations;
- future Phase 13 cross-language phone-space experiments;
- rebuild of derived rhyme signatures without reimporting entities.

## 16. Multi-word entity names and Mosaic readiness

Entity names such as:

```text
Kendrick Lamar
Mercedes-Benz
Harry Potter
Grand Theft Auto
The Notorious B.I.G.
```

must retain token boundaries in the pronunciation representation.

Do not materialize a massive all-window table before measuring storage and retrieval value.

Phase 12A stores:

- complete pronunciation;
- token boundaries;
- syllables/stress;
- whole-name vowel sequence;
- whole-name/rhyme-tail keys.

A later benchmark may materialize bounded cross-token phonetic windows for Tier A/B or other selected subsets if Phrase/Mosaic retrieval demonstrates value.

## 17. FTS/search indexes

Use SQLite FTS5 over selected `entity_name` surfaces.

Search ranking is separate from phonetic ranking.

Suggested indexes:

```text
FTS: entity names / aliases
category + tier + score
category + percentile
locale + syllable_count
locale + rhyme_signature
locale + vowel_sequence
entity external-id system/value
relation source/predicate
relation target/predicate
```

The final hot-path index design is deferred until real row counts exist.

## 18. Size budget

The user's proposed 1–3 GB is plausible at the lower/middle end only with disciplined retention.

At approximately 500k–900k entities, selected aliases, bounded relations and selective pronunciation variants, a low-single-digit-GB SQLite target is realistic.

At approximately 1.2M entities with many aliases, multiple pronunciations per alias, FTS duplication and broad relation storage, 1–3 GB may be too optimistic.

Therefore acceptance must measure:

- entity rows;
- name rows;
- pronunciation rows;
- FTS bytes;
- relation rows;
- index bytes;
- total DB bytes;
- bytes/entity;
- bytes/searchable-name.

Do not optimize SQLite layout before taxonomy/popularity/pronunciation correctness is established.

## 19. Build pipeline

Proposed deterministic build:

```text
A. pin entity taxonomy + source manifests
B. acquire QRank snapshot
C. stream Wikidata JSON snapshot
D. retain structurally relevant candidate entities only
E. normalize selected names / aliases / facts / IDs
F. assign categories
G. join QRank and cheap structural popularity signals
H. compute initial category-relative cut
I. optionally aggregate DE/EN Wikimedia popularity
J. recompute/finalize category cut and tiers
K. optional MusicBrainz Core enrichment
L. materialize pronunciation candidates
M. apply pronunciation source hierarchy / overrides
N. derive versioned DE/EN phonetic analyses
O. build FTS + bounded indexes
P. VACUUM/ANALYZE only for final benchmark snapshot
Q. write deterministic report + fingerprints
```

Runtime remains fully offline/read-only.

## 20. Acceptance gates

Phase 12A is accepted only after:

- source/license registry complete;
- category taxonomy fixture passes;
- popularity model is deterministic;
- Bud Spencer sentinel retained/Tier A;
- category-tail diagnostics reviewed;
- duplicate/name-noise diagnostics reviewed;
- pronunciation provenance represented correctly;
- generated vs attested pronunciation is distinguishable;
- no automatic alias invention;
- FTS works on labels/aliases;
- entity DB remains separate/read-only;
- size extrapolation is measured, not guessed;
- two independent builds produce the same semantic fingerprint on the fixture/prototype.

Full 500k+ materialization is a later owner-local gate.

## 21. Phase sequencing

Revised Phase 12 sequence:

```text
12A  multilingual cultural Entity Lexicon
     - source/license contract
     - taxonomy
     - popularity/cut
     - multilingual pronunciation schema
     - fixture/prototype

12B  English phonology + single-word Writer profile + benchmark
     - real English analyzer/scorer/database
     - no German-phonology emulation

12C  full entity pronunciation materialization + unified Writer entity channel
     - DE/EN/native entity pronunciations
     - phonetic entity retrieval
     - category/popularity filters
     - protected entity benchmark

12D  English phrase/mosaic expansion as justified by Phase 12B/C evidence
```

Phase 13 remains cross-language rhyme after German and English profiles are individually strong.

## 22. Non-goals for Phase 12A

Do not:

- redesign/polish the UI;
- tune the frozen German Writer;
- merge entity rows into the German Writer DB;
- import the entire Wikidata graph;
- ingest all MusicBrainz recordings;
- ingest all GLEIF companies;
- use one global popularity threshold;
- fabricate aliases from arbitrary name tokens;
- treat G2P output as attested truth;
- redistribute pronunciation audio without per-media license handling;
- fetch millions of entity records from public APIs at runtime;
- add hosted search or network dependency.
