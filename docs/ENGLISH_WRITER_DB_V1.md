# English Writer DB v1 — Phase 12B5

Status: **candidate implementation / owner materialization pending**

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

The English coda class is derived from the English consonant feature inventory, including voicing distinctions. It is not copied from German `de-phon-v3`.

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
- deterministic semantic fingerprint over all stored form/pronunciation rows.

The semantic fingerprint intentionally does not depend on build timestamps or physical SQLite page placement.

## Commands

```powershell
npm run en:publish:repeatability
npm run en:db
npm run en:db:verify
```

Reports:

```text
data/local/en-publish-repeatability-v1-report.json
data/local/en-writer-db-v1-report.json
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
