# English Writer DB v1 — Phase 12B5

Status: **v4 DB materialization repeatability accepted / multisyllabic retrieval verification patch pending**

## Purpose

Phase 12B5 materializes the verified Phase 12B4 English publish layer into a separate local SQLite database:

```text
data/local/rhymelab-en-v1.sqlite
```

The database is still a candidate runtime. It does not enable English in the product and does not modify the frozen German Writer database.

## Required upstream gate

12B5 refuses to build unless the current English publish layer has passed a second-build repeatability check.

Run:

```powershell
npm run en:publish:repeatability
```

This compares the already generated publish semantic fingerprint with a fresh rebuild from the same source snapshots and fails if they differ.

The repeatability report is:

```text
data/local/en-publish-repeatability-v1-report.json
```

## Storage model

The database keeps lexical identity and pronunciation variants separate.

### `en_form`

One row per normalized published surface:

- surface + normalized form;
- observed surface variants;
- POS;
- lemma/form relationships;
- lexical/register/history tags;
- current vs historical evidence counts;
- proper-name vs common lexical evidence;
- explicit default eligibility + exclusion reasons;
- ESDB evidence;
- wordfreq rank + Zipf score.

### `en_pronunciation`

One row per retained source pronunciation variant:

- source;
- notation;
- raw source pronunciation;
- locale evidence;
- en-US / en-GB / unprofiled flags;
- source tags and evidence count;
- normalized English phonology when analyzable;
- stress/rhyme keys;
- rhoticity;
- per-variant default-profile eligibility.

Unresolved/unsupported source variants remain stored but are not entered into phonological retrieval channels.

## Default profile

The initial default profile is `en-US`.

A pronunciation is `default_profile_eligible` only when:

1. its parent form is Phase 12B4 `default_eligible`;
2. the pronunciation has a successful English phonology analysis;
3. the source explicitly supports `en-US`.

Unqualified Wiktionary IPA remains unprofiled and never becomes en-US implicitly.

## English-specific retrieval indexes

12B5 does not reuse German suffix-anchor policy.

Indexed English retrieval channels are:

- exact stressed rhyme tail;
- multisyllabic stressed rhyme tail;
- vowel sequence;
- English vowel-family + English coda-class bridge;
- exact final coda.

The English coda class is derived from the English consonant place/manner inventory. Voicing stays available to the English scorer rather than fragmenting the coarse retrieval bucket. The class is not copied from German `de-phon-v3`.

The current retrieval policy id is:

```text
en-indexed-rhyme-retrieval-v1-candidate
```

## Determinism and verification

The builder stores the accepted Phase 12B4 publish fingerprint in SQLite metadata.

The DB verifier checks:

- schema + source publish fingerprint;
- form/pronunciation counts;
- duplicate normalized surfaces;
- default-form pronunciation invariants;
- foreign keys;
- query plans using the intended indexes;
- indexed-vs-full-scan retrieval equivalence over deterministic sample keys;
- explicit multi-result indexed-vs-full-scan equivalence for exact, multisyllabic, vowel, family+coda and coda channels;
- deterministic semantic fingerprint over all stored form/pronunciation rows.

The multi-result gate samples only retrieval keys with more than one default-profile pronunciation row and fails if indexed and full-scan result ID sequences differ. This closes the earlier verifier gap where deterministic sample keys were not guaranteed to exercise result sets larger than one row.

The semantic fingerprint intentionally does not depend on build timestamps or physical SQLite page placement.

## Commands

Publish-v4 repeatability is accepted at fingerprint:

```text
b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9
```

The preferred owner gate now runs two complete DB materializations plus verification:

```powershell
npm run en:db:repeatability
```

The runner performs, twice:

```text
build English DB
-> verify schema/counts/index plans
-> verify general indexed/full-scan equivalence
-> verify explicit multi-result indexed/full-scan equivalence
-> verify semantic fingerprint
-> foreign-key check
```

It compares both builds for identical semantic fingerprint, row counts and database bytes, and leaves the second successful build at the normal DB/report paths.

Lower-level commands remain available:

```powershell
npm run en:db
npm run en:db:verify
npm run en:db:rebuild
```

Reports:

```text
data/local/en-publish-repeatability-v1-report.json
data/local/en-writer-db-v1-report.json
data/local/en-writer-db-repeatability-v1-report.json
data/local/en-writer-db-verification-v1-report.json
```

## Explicit non-goals

12B5 does not:

- enable `EN` or `DE+EN` in the UI/API;
- merge English into `rhymelab-v5.sqlite`;
- introduce broad G2P;
- pick one permanent pronunciation variant per word;
- accept English ranking/commonness policy;
- calibrate English scores against German;
- start cross-language rhyme;
- resume Entity/P898 work.

Product/runtime promotion still requires Phase 12B6 benchmark + acceptance.

## Owner v4 materialization result — REPEATABLE

The owner v4 DB repeatability run completed successfully:

```text
source publish fingerprint
b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9

DB semantic fingerprint
beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37

forms                            224,478
default eligible                 123,533
pronunciations                   375,321
analyzed pronunciations          339,987
unresolved pronunciations         35,334
default-profile pronunciations   173,413
SQLite                            181.87 MiB
database bytes                    190,701,568
```

Both DB builds reproduced the same semantic fingerprint, counts and database byte size. The materialization itself is therefore accepted as deterministic.

During review, one verifier-coverage gap was found: `idx_en_pron_multi` existed, but the query-plan sampler only looked at the first exact-key row. If that row had no `multisyllable_key`, the reported multi plan was empty, and the verifier did not include a separate multisyllabic equivalence channel.

The fix is source-only and requires no DB rebuild:

- select a dedicated non-null `multisyllable_key` plan sample;
- require `idx_en_pron_multi`;
- run deterministic indexed-vs-full-scan equivalence for multisyllabic keys;
- run explicit multi-result equivalence for multisyllabic keys;
- persist all verifier evidence to `data/local/en-writer-db-verification-v1-report.json`.

Next owner command after the fix is merged:

```powershell
git pull
npm run en:db:verify
```

This is a read-only verification pass against the already materialized v4 DB.
