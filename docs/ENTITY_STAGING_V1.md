# RhymeLab — Entity Staging v1

Last updated: 2026-09-18

Status: **Phase 12A2 implementation / CI gate**

This layer prepares the full Wikidata + QRank build without importing either source into the final Entity Lexicon wholesale.

## Accepted Phase 12A1 fixture gate

Owner-local fixture report:

```text
schema                  rhymelab-entity-lexicon-fixture-report-v1
status                  ok
entity schema           rhymelab-entity-catalog-v1
popularity policy       category-relative-popularity-v1
input items             10
structural candidates    9
retained entities        7
structural rejected      1
popularity rejected      2
all sentinels pass       true
Bud Spencer              person.actor / Tier A
fixture DB bytes         122,880
semantic fingerprint
23e668d7a327982ba7367c875749d17d19697466cfa438a67df7a2d7ed9f4bba
```

The fixture popularity values are synthetic deterministic scales and are not live QRank/pageview measurements.

## Goal of 12A2

Build a reproducible disk-bounded staging pipeline:

```text
Wikidata JSON .bz2/.gz
  -> streaming structural category filter
  -> compact cultural-candidate staging SQLite
  -> no final FTS / no pronunciations / no full graph

QRank .csv.gz
  -> temporary QRank SQLite
  -> indexed local join into candidate staging DB

candidate staging + QRank
  -> category-relative cut diagnostics
  -> protected sentinel checks
  -> full-build decision
```

No accepted German runtime is modified.

## Source registry

```text
sources/entity/phase12a-sources-v1.json
```

The production full build must use a dated/pinned Wikidata snapshot and a pinned QRank snapshot/checksum.

Do not accept a final build whose provenance is only `latest`.

## Wikidata staging schema

Schema:

```text
rhymelab-entity-stage-v1
```

Policy:

```text
wikidata-cultural-stage-v1
```

Default database:

```text
data/work/entity/wikidata-cultural-stage-v1.sqlite
```

Only entities matching the reviewed taxonomy are written.

Persisted staging data is deliberately bounded to:

- QID;
- primary and all accepted categories;
- selected DE/EN descriptions;
- selected DE/EN labels/aliases;
- Wikipedia sitelink count;
- DE/EN Wikipedia presence;
- statement count;
- selected external IDs;
- source ordinal;
- joined QRank later.

No arbitrary Wikidata statements or relations are copied into staging.

## Streaming compressed Wikidata

The importer supports:

- plain line-oriented JSON;
- gzip directly through Node;
- bzip2 through a streaming external decompressor;
- stdin.

For `.bz2`, auto-detection order is:

Windows:

```text
7z
7zz
bzip2
```

Unix-like:

```text
lbzip2
bzip2
7zz
7z
```

Override:

```text
RHYMELAB_BZIP2_CMD
```

The bzip2 file is decompressed to stdout and parsed incrementally. The importer does **not** create an uncompressed Wikidata copy.

## Wikidata staging command

After a dated source snapshot has been pinned:

```powershell
npm run entity:stage:wikidata -- --input "D:\path\wikidata-YYYYMMDD-all.json.bz2" --snapshot YYYYMMDD --input-sha256 <official-checksum>
```

Default outputs:

```text
data/work/entity/wikidata-cultural-stage-v1.sqlite
data/local/entity-wikidata-stage-v1-report.json
```

## QRank staging

Schema:

```text
rhymelab-qrank-stage-v1
```

Default DB:

```text
data/work/entity/qrank-stage-v1.sqlite
```

QRank is kept separate because the full source covers far more QIDs than RhymeLab needs.

The pipeline first loads the bulk CSV into a compact temporary table, then creates the QID index once after bulk insertion.

Command after pinning the QRank snapshot:

```powershell
npm run entity:stage:qrank -- --input "D:\path\qrank.csv.gz" --snapshot <label> --input-sha256 <checksum>
```

Default report:

```text
data/local/entity-qrank-stage-v1-report.json
```

The QRank staging DB is build-time data and may be deleted after an accepted entity build.

## Category-relative cut diagnostics

Command:

```powershell
npm run entity:cut:diagnose
```

Default report:

```text
data/local/entity-cut-diagnostics-v1-report.json
```

Current v1 diagnostic order inside each category:

1. QRank present before QRank-missing;
2. QRank descending;
3. Wikipedia sitelink count descending;
4. DE + EN Wikipedia presence;
5. selected external-ID count;
6. statement count;
7. QID stable tie-break.

This is a **cut diagnostic ordering**, not the final popularity-score contract.

The final popularity model may add pinned DE/EN Wikimedia pageview evidence after the global/category distributions are measured.

## Category cuts

The reviewed taxonomy currently supplies one `retention_percentile_floor` per category.

The cut diagnostic computes category-relative percentiles and reports:

- candidate count;
- QRank coverage;
- cut floor;
- kept/rejected count;
- A/B/C retained counts;
- representative top/tail rows.

Protected sentinels are never silently removed by the cut.

## Current protected sentinel

```text
Bud Spencer
Q221074
required category: person.actor
structural candidate: required
```

The fixture-level Tier-A expectation is already accepted.

At full-data scale, the next diagnostic must confirm that the real QRank/category distribution also produces an appropriate high cultural-relevance position before final thresholds are frozen.

## Space policy

Raw inputs:

```text
data/raw/
```

Temporary staging:

```text
data/work/entity/
```

Accepted runtime/report artifacts:

```text
data/local/
```

All remain gitignored.

Do not keep an uncompressed Wikidata JSON copy.

The temporary QRank staging DB is intentionally separate and disposable.

## 12A2 acceptance gate

Before downloading/running the full owner snapshot, CI must confirm:

- actual Wikibase mainsnak QID parsing;
- JSON array framing / trailing-comma handling;
- structural category filtering;
- QRank CSV parsing;
- indexed QRank attach/join;
- category-relative cut behavior;
- protected sentinel presence;
- no German runtime rewiring.

After CI passes, the next owner gate is:

1. pin actual dated Wikidata/QRank snapshots and checksums;
2. download to `D:\rhymelab\data\raw\entity\`;
3. stage Wikidata;
4. stage QRank;
5. run cut diagnostics;
6. review counts, QRank coverage, size, category tails and Bud Spencer;
7. only then freeze final cut/popularity policy and materialize the large Entity Lexicon.
