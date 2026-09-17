# German Phrase Catalog v1 — Phase 11B1

Last updated: 2026-09-18

Status: **implementation complete at fixture scale; full owner-local source build pending**

## Purpose

`rhymelab-phrase-catalog-v1` is the first separate provenance-bearing storage layer for German phrase/mosaic work.

It intentionally does **not** alter the accepted single-word Writer DB/runtime. It also does not yet generate phrase pronunciation, mosaic retrieval indexes, phrase ranking, or API/UI results.

## Source roles

### German Wiktionary via raw Kaikki/Wiktextract

Role: source-backed multi-word lexical/phraseological attestations.

The importer:

- streams raw JSONL or JSONL.gz;
- keeps German entries only;
- requires at least two lexical tokens;
- preserves source POS/tags/categories as attestation evidence;
- derives normalized phrase-type labels only from explicit source markers;
- preserves `historical_only`, `mixed`, or `current_or_unmarked` state;
- excludes only `historical_only` phrases from the default Leipzig commonness matcher;
- does not invent pronunciation, lexical identity, idiom status, or modernity.

### Leipzig Corpora Collection

Role: deterministic phrase attestation/commonness evidence.

The v1 matcher:

- scans `*_sentences.txt`;
- tokenizes deterministically;
- matches exact normalized lexical-token sequences against modern-eligible catalog phrases;
- records occurrence count, sentence count, per-million-token rate and per-million-sentence rate per corpus;
- never promotes corpus frequency into an idiom/metaphor/proverb classification.

Current frozen inputs remain:

- `deu_news_2024_1M`;
- `deu_wikipedia_2021_1M`;
- `deu-de_web_2021_1M`.

## Storage schema

### `phrase_source`

One row per legal/provenance source family.

Important fields:

- `source_id`;
- role;
- homepage;
- license ID / URL;
- attribution;
- redistribution policy.

### `phrase_snapshot`

One row per exact locally ingested snapshot/artifact.

Important fields:

- deterministic `snapshot_id`;
- source ID;
- snapshot label;
- local artifact SHA-256;
- upstream URL;
- corpus year/genre/country where applicable;
- source-specific metadata.

The local artifact path is audit metadata and is deliberately excluded from the semantic catalog fingerprint.

### `phrase`

One canonical catalog identity.

Important fields:

- deterministic `phrase_id`;
- canonical and normalized surface;
- normalized lexical token key;
- token count;
- source-backed normalized phrase-type set;
- historical state;
- `modern_eligible`;
- identity fingerprint.

Phrase identity is based on normalized phrase text. Punctuation is preserved in canonical/normalized text while the separate token key supports corpus matching.

### `phrase_attestation`

One source-backed phrase attestation.

Important fields:

- deterministic attestation ID;
- phrase ID;
- snapshot ID;
- source record ID;
- source POS;
- normalized phrase types;
- source style/raw tags/categories;
- historical state;
- mapping-policy provenance.

Repeated identical source records are idempotent.

### `phrase_token`

Deterministic token boundaries for every phrase.

Important fields:

- phrase ID;
- zero-based token index;
- surface and normalized token;
- character start/end;
- lexical resolution state;
- optional future lexical form link.

11B1 stores tokens as `unresolved` unless an explicit lexical resolver later links them. It does not guess.

### `phrase_usage_evidence`

Per-corpus usage evidence.

Important fields:

- phrase ID;
- snapshot ID;
- policy ID;
- occurrence count;
- sentence count;
- corpus token/sentence totals;
- per-million token/sentence rates;
- corpus evidence metadata.

Policy:

`leipzig-exact-token-sequence-v1`

### `phrase_semantic_link`

Reserved optional linkage for later semantic sources. No semantic source is required for the 11B1 build.

## Determinism

The builder computes a semantic `catalog_fingerprint` from sorted rows across source, snapshot, phrase, attestation, token and usage-evidence tables.

The fingerprint excludes:

- build timestamp;
- output DB path;
- local source artifact path.

Therefore identical source bytes + snapshot labels + source policy produce the same semantic fingerprint across independent builds.

## Commands

### Normal explicit build

```powershell
npm run phrase:catalog -- --wiktextract <path-to-jsonl-or-jsonl.gz> --wiktionary-snapshot "<snapshot label>" --leipzig-sentences deu_news_2024_1M=<news-sentences.txt> --leipzig-sentences deu_wikipedia_2021_1M=<wiki-sentences.txt> --leipzig-sentences deu-de_web_2021_1M=<web-sentences.txt>
```

Default outputs:

```text
data/local/rhymelab-phrases-v1.sqlite
data/local/phrase-catalog-v1-report.json
```

### Owner-local bootstrap

Preferred next trigger:

```powershell
npm run phrase:catalog:bootstrap
```

The bootstrap:

1. reuses `data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz` when present;
2. otherwise downloads the configured Kaikki source;
3. downloads the three frozen Leipzig archives and verifies their recorded SHA-256 values;
4. extracts only `*_sentences.txt`;
5. builds the phrase catalog;
6. keeps all generated DB/report/raw material under gitignored local paths.

Optional:

```powershell
npm run phrase:catalog:bootstrap -- --refresh-kaikki
```

This deliberately changes the Wiktionary snapshot and therefore requires reviewing the new build report/fingerprint as new evidence.

## Fixture acceptance

The checked-in fixture gate covers:

- German vs non-German filtering;
- single-word rejection;
- multi-word lexical entries;
- idiom / figurative / proverb source markers;
- duplicate source-record idempotency;
- historical-only exclusion from default commonness matching;
- mixed historical/current evidence remaining modern-eligible;
- stable token boundaries;
- unresolved-token preservation;
- all three Leipzig corpus roles;
- exact token-sequence occurrence/sentence counts;
- deterministic semantic fingerprint across independent builds;
- explicit proof that runtime, phrase pronunciation, mosaic indexing and phrase ranking remain untouched.

## Next acceptance gate

Before Phase 11C phrase pronunciation begins, run the owner-local full source build and inspect at minimum:

- total phrases and attestations;
- phrase-type distribution;
- historical/mixed/current distribution;
- token-count distribution;
- unresolved-token count;
- per-source Leipzig match coverage;
- phrases with evidence from 1/2/3 corpora;
- top common phrases by each corpus and aggregate view;
- obvious source-noise classes;
- SQLite size/build time;
- repeat build fingerprint equality.

No human NDCG is required at this stage.
