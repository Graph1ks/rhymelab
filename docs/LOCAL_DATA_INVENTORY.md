# Local Data Inventory V1

Status: **implemented; owner inventory consumed**

Purpose: produce one compact, read-only structural report of the owner's actual local `data/` tree before pronunciation-backfill source paths are finalized.

This exists because RhymeLab's local data directory contains heterogeneous historical/source/build/runtime artifacts with different schemas and directory layouts. Backfill code must not guess that every original source still lives at one canonical default path.

## Command

Normal inventory:

```powershell
npm run data:inventory
```

Default output:

```text
data/local/local-data-inventory-v1-report.json
```

This mode is intentionally lightweight:

- recursively lists files below `data/`;
- records relative path, extension, size and modification time;
- classifies a coarse role hint such as original source snapshot / prepublish stage / local runtime;
- inspects SQLite schemas read-only;
- reports SQLite tables, columns, indexes and safe structural metadata keys;
- samples JSON / JSONL / NDJSON / TSV / CSV structures without copying lexical row values into the report;
- samples compressed text/JSONL through streaming decompression;
- does **not** calculate exact SQLite row counts by default;
- does **not** hash every large file by default.

The report uses repository-relative paths. It does not intentionally emit the owner's absolute machine path.

## Full forensic inventory

Only when exact table counts and full-file SHA-256 hashes are needed:

```powershell
npm run data:inventory:full
```

This can take substantially longer on multi-gigabyte source files and large SQLite databases.

Equivalent explicit flags:

```powershell
npm run data:inventory -- --row-counts --hash
```

## Custom root/output

```powershell
npm run data:inventory -- --root data --out data/local/my-data-inventory.json
```

Useful tuning:

```text
--sample-lines 4
--sample-bytes 262144
--progress-every 100
--row-counts
--hash
```

## What the report contains

Top-level blocks:

```text
schema
generated_at
scan_root
options
summary
likely_original_sources
files
```

For SQLite files, `inspection.tables` contains:

- table names;
- column names/types/nullability/primary-key position;
- indexes and indexed columns;
- approximate row count only when SQLite statistics are available;
- exact row count only when `--row-counts` is requested;
- safe `meta` keys and selected schema/policy/version/fingerprint-style values.

For JSON-family files, the report records structural shapes and field names, not sampled lexical values.

For delimited files, it records the header and sampled row widths.

For compressed JSONL/text files, only a bounded decompressed prefix is sampled.

## Pronunciation-backfill workflow

The owner supplied the generated inventory once, and the relevant local source map has now been consumed into Backfill V2. No repeat inventory run is required unless the local `data/` layout changes.

Current source mapping:

```text
DE lexical/usage source:
  data/de/usage/de-usage.tsv
  data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz

EN lexical source:
  data/raw/en/phase12b-20260918/enwiktionary-kaikki-20260916.jsonl.gz

Accepted/runtime comparison DBs:
  data/local/rhymelab-v5.sqlite
  data/local/rhymelab-en-v1.sqlite
  data/local/rhymelab-phrases-v1.sqlite
  data/local/rhymelab-entities-v1.sqlite
```

Use the lightweight no-write preflight before collection:

```powershell
npm run pronunciation:backfill:plan
```

The inventory reporter remains available only for future local-layout changes.
