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

Do not accept a final build without frozen local acquisition artifacts, exact query/source provenance and checksums. The active QLever path pins local response artifacts even though the public graph itself is not a dated archival snapshot.

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

## Windows fast decompression

The Wikidata JSON dump must be fully decompressed even when only a small subset of entities is retained.

Wikidata recommends `lbzip2` for parallel decompression of these BZip2 dumps on Unix-like systems. RhymeLab therefore prefers the following order on Windows:

```text
1. WSL + lbzip2
2. native 7-Zip
3. native bzip2
```

When WSL and `lbzip2` are available, the staging process automatically converts the Windows input path with `wslpath` and streams:

```text
wsl.exe --exec lbzip2 -dc -n <threads> /mnt/<drive>/...
```

Default thread count is the smaller of 8 and the available CPU parallelism, with a minimum of 2. Override it with:

```powershell
$env:RHYMELAB_LBZIP2_THREADS = "12"
npm run entity:owner:stage
```

Recommended Windows setup when WSL is already installed:

```powershell
wsl --exec sh -lc "sudo apt-get update && sudo apt-get install -y lbzip2"
```

Verify before the full run:

```powershell
wsl --exec sh -lc "lbzip2 --version"
```

At startup the stager prints the selected decompressor, e.g.:

```text
[wikidata-stage] decompressor=wsl:lbzip2:8t ...
```

If WSL or `lbzip2` is unavailable, staging remains correct and falls back to 7-Zip; only throughput changes.

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

## QLever selective fast path

The preferred Phase 12A2 acquisition path is now the build-time QLever selective exporter. It queries only the reviewed cultural taxonomy and the fields required by the existing stage schema.

Owner command:

```powershell
npm run entity:owner:stage:qlever -- --retrieval-label 20260918
```

Equivalent individual steps:

```powershell
npm run entity:sources:qlever -- --retrieval-label 20260918
npm run entity:stage:qlever
npm run entity:stage:qrank -- --input <pinned qrank.csv.gz> --snapshot <label>
npm run entity:cut:diagnose
```

Default QLever raw artifacts:

```text
data/raw/entity/qlever-<retrieval-label>/
  membership.tsv.gz
  core.tsv.gz
  aliases.tsv.gz
  external_ids.tsv.gz
  wikipedia_sitelinks.tsv.gz
```

Default reports:

```text
data/local/entity-qlever-source-v1-report.json
data/local/entity-qlever-stage-v1-report.json
data/local/entity-qrank-stage-v1-report.json
data/local/entity-cut-diagnostics-v1-report.json
```

The exporter freezes exact query text, query SHA-256, source endpoint, retrieval timestamps, row counts, raw result SHA-256 and compressed artifact SHA-256. HTTP 429 responses are retried with bounded backoff. These network calls are build-time acquisition only; runtime remains offline.

Semantic requirements:

- P31/P106 membership uses `p:/ps:` valued statements so it matches the current JSON importer rather than only truthy `wdt:` claims;
- whitelisted P434/P345/P1953/P1902 values likewise use all valued statement ranks;
- DE/EN labels, aliases and descriptions are materialized separately;
- statement count comes from `wikibase:statements`;
- exact Wikipedia sitelink count plus DE/EN presence are reconstructed from `schema:isPartOf / wikibase:wikiGroup "wikipedia"` site pairs.

The classic 20260914 JSON dump is retired from the active Phase 12A2 workflow. The owner may delete it; do not require, redownload, or compare against it. The QLever artifacts plus pinned QRank are the active source inputs.

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
- QRank coverage and missing-QRank count;
- cut floor;
- kept/rejected count;
- retained/rejected counts split by QRank present vs missing;
- retained share among QRank-missing candidates;
- whether the cut falls entirely inside the QRank-present block;
- A/B/C retained counts;
- representative top/tail rows.

The QRank split is decision evidence only. It does not change the current ordering. The v1 diagnostic still places every QRank-present row before every QRank-missing row, then applies Wikipedia sitelinks, DE/EN presence, external IDs, statement count and stable QID ordering. Categories whose retained share is smaller than QRank coverage can therefore cut entirely inside the QRank-present block; those categories require explicit review before the final popularity policy is frozen.

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

Do not keep an uncompressed Wikidata JSON copy. The old compressed `wikidata-20260914-all.json.bz2` bootstrap artifact is no longer a required project input and may be deleted. Do not redownload it unless the owner explicitly reopens the classic-dump path.

The temporary QRank staging DB is intentionally separate and disposable. The downloaded raw `qrank-20260918.csv.gz` artifact is **not** disposable during Phase 12 and must be retained until Phase 12 is complete.

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
7. verify that low/uneven QRank coverage does not make QRank presence an accidental hard gate in category cuts;
8. only then freeze final cut/popularity policy and materialize the large Entity Lexicon.


## Owner source bootstrap — pinned 2026-09-18 gate

The selected Wikidata item snapshot is:

```text
snapshot    20260914
file        wikidata-20260914-all.json.bz2
bytes       103137817948
SHA-1       0a985a65262a665fa33808c7d40a1d42ad28d62c
```

The official dated Wikimedia URL and checksum are recorded in:

```text
sources/entity/phase12a-sources-v1.json
```

QRank exposes a periodically updated latest artifact rather than a stable dated historical URL. The owner bootstrap therefore downloads it once to a dated local filename, preserves the raw artifact, captures response headers and records a local SHA-256. Do not pretend that the provider guarantees historical retrieval of that exact artifact.

The accepted owner retrieval on 2026-09-18 returned `Last-Modified: Sat, 16 Mar 2024 11:36:47 GMT` and ETag `"79e65d73b0795eacb6e366964099ce77-7"`. Therefore `retrieved-2026-09-18` is a **retrieval label only**, not a claim that the underlying QRank data was generated in 2026. Effective data freshness is currently unknown beyond the server-provided 2024 last-modified metadata.

### Preflight

The bootstrap requires:

- `curl`;
- one streaming bzip2 decompressor (`7z`, `7zz`, `bzip2`, or `lbzip2`);
- approximately the Wikidata compressed size plus 40 GiB safety headroom before the initial source download.

The default owner raw directory is:

```text
data/raw/entity/phase12a-20260918/
```

On the owner's moved repository this resolves under `D:\rhymelab\data\raw\...`.

### Parallel Wikidata download

The ~96 GiB Wikidata artifact is downloaded with `aria2c`, not single-stream curl.

Default:

```text
8 requested parallel HTTP range connections
continue/resume enabled
no file pre-allocation
transport order:
  1. ACC/Umeå mirror
  2. Your.org mirror
  3. Wikimedia origin
same pinned 20260914 bytes
same byte-count/SHA-1/SHA-256 acceptance gates
```

The mirrors are transport alternatives only. The canonical source remains the pinned Wikimedia snapshot, and a mirror-delivered file is accepted only if its exact byte count and Wikimedia-published SHA-1 match before the local SHA-256 is recorded.

Owner benchmark on 2026-09-18 measured the ACC/Umeå mirror at 8,093,983 bytes/s (~64.8 Mbit/s), materially faster than the observed Wikimedia-origin path.

Windows install:

```powershell
winget install --id aria2.aria2 -e --accept-package-agreements --accept-source-agreements
```

The Microsoft WinGet repository exposes package identifier `aria2.aria2` with the `aria2c` command alias.

The bootstrap also checks the normal WinGet command-link location, so a newly installed aria2 can be discovered even before a terminal PATH refresh.

Existing partial Wikidata downloads created by curl are deliberately retained. aria2 is invoked with `--continue=true` and continues the same output file.

Connection count can be changed without editing code:

```powershell
$env:RHYMELAB_ARIA2_CONNECTIONS = "12"
npm run entity:sources:bootstrap
```

or:

```powershell
npm run entity:sources:bootstrap -- --aria2-connections 12
```

The bootstrap clamps the value to 2–16. Start with 8; increasing it beyond the point where the local 100 Mbit/s link is saturated has no benefit.

To point at a non-standard aria2 executable:

```powershell
$env:RHYMELAB_ARIA2_CMD = "D:\\tools\\aria2c.exe"
```

### Download + pin sources

```powershell
npm run entity:sources:bootstrap
```

Default report:

```text
data/local/entity-source-bootstrap-v1-report.json
```

The command:

1. refuses to start if no bzip2 streaming decompressor is available;
2. checks free space;
3. downloads/resumes the static Wikidata dated snapshot through ACC/Umeå -> Your.org -> Wikimedia-origin fallback order;
4. validates the exact expected byte count;
5. validates Wikimedia's published SHA-1;
6. records a local SHA-256;
7. downloads QRank atomically to `qrank-20260918.csv.gz`;
8. records QRank SHA-256, size and HTTP headers.

The large Wikidata SHA-1/SHA-256 validation requires sequential reads of the compressed artifact. This costs time but avoids accepting a corrupt 96 GiB input.

### Raw-source retention policy

Retain the pinned QRank raw input locally through Phase 12:

```text
data/raw/entity/phase12a-20260918/qrank-20260918.csv.gz
```

The old 103 GB Wikidata `.bz2` is explicitly retired and may be deleted. QLever selective artifacts under `data/raw/entity/qlever-<retrieval-label>/` are the reproducible Wikidata-side build inputs for the active path. Temporary derived staging SQLite databases may be deleted when no longer needed.

### Run complete owner staging

After the bootstrap report has status `ok`:

```powershell
npm run entity:owner:stage
```

This executes in order:

```text
stage-wikidata-entities
stage-qrank
diagnose-entity-cut
```

Expected reports:

```text
data/local/entity-wikidata-stage-v1-report.json
data/local/entity-qrank-stage-v1-report.json
data/local/entity-cut-diagnostics-v1-report.json
```

Upload/review those three reports before final cut thresholds or final Entity Lexicon materialization are accepted.
