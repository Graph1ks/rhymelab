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

## Deferred sources

Possible later additions include UniMorph German, explicitly labeled pronunciation fallback resources, OpenThesaurus, OdeNet and Wikidata Lexemes. Definitions/full senses/semantic graphs/etymology/translations/embeddings remain outside the rhyme hot path until the core engine is strong.

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
