# Phase 12A2 — Entity Source Alternatives Research

Last updated: 2026-09-18

Status: research note / acquisition strategy review. This does **not** replace the accepted 20260914 owner dump or change the frozen German Writer.

## Why this note exists

The accepted owner source bootstrap downloaded the official Wikidata JSON entity dump:

```text
snapshot        20260914
compressed      103,137,817,948 bytes
format          all.json.bz2
official SHA-1  0a985a65262a665fa33808c7d40a1d42ad28d62c
local SHA-256   63f20c9595fc81209c975a96ff5c0a2d6895d94541f258d4092fa0f0ad390888
```

The full staging pass then demonstrated that the acquisition format is much broader than RhymeLab needs. The reviewed Phase 12A taxonomy currently matches only 13 direct P31/P106 target QIDs, and the optimized raw-line prefilter is parsing only a small minority of dump lines as JSON.

Research question: can future builds retrieve only the cultural-entity subset and the fields RhymeLab actually needs instead of downloading/decompressing the whole Wikidata entity dump?

## Bottom line

There is no official Wikimedia download that is already semantically filtered to RhymeLab's exact P31/P106 cultural taxonomy.

The strongest alternative is **QLever selective export**. It can query the live Wikidata RDF graph for exactly the required entity memberships and selected fields, and the Wikidata project itself lists QLever as an available alternative SPARQL endpoint. It should be benchmarked against the already-downloaded official 20260914 dump before any promotion.

The second useful option is the new **Wikimedia Enterprise Wikidata Snapshot API**. It is official, chunked, monthly-free and excludes the scholarly graph, but it is still roughly 105 GB compressed for the Main Graph and therefore does not solve the semantic over-download problem. It may still be a better future full-source transport because it is chunked and gzip/NDJSON rather than one giant bzip2 stream.

Third-party prebuilt subsets can help diagnostics or bootstrap discovery, but each currently loses data RhymeLab wants or imposes a hard relevance floor. They should not silently become the canonical source.

## Option A — QLever selective export

Current public endpoint:

```text
https://qlever.dev/wikidata
backend API: https://qlever.dev/api/wikidata
```

The Wikidata alternative-endpoints documentation currently lists QLever as available, with a much longer query timeout than legacy WDQS and an almost-real-time update path. Wikidata's own 2026 backend-replacement work is also moving toward QLever.

The RDF graph exposes the fields RhymeLab needs:

- direct truthy P31 / P106;
- DE/EN labels via `rdfs:label`;
- aliases via `skos:altLabel`;
- descriptions via `schema:description`;
- sitelink count via `wikibase:sitelinks`;
- statement and identifier counts;
- sitelink article nodes, enough to detect dewiki/enwiki presence;
- direct truthy external-ID properties such as P434/P345/P1953/P1902.

### Proposed extraction layout

Do **not** request one huge Cartesian product query with labels + aliases + all external IDs. Export normalized tables separately:

```text
membership.tsv
  qid
  category
  match_property
  match_target_qid

core.tsv
  qid
  label_de
  label_en
  description_de
  description_en
  sitelink_count
  statement_count
  identifier_count
  has_dewiki
  has_enwiki

aliases.tsv
  qid
  language
  surface

external_ids.tsv
  qid
  property_id
  system
  value
```

Then stage those local files deterministically and join QRank exactly as today.

### Provenance requirements

If implemented, every selective-export build must persist:

- exact SPARQL text;
- endpoint URL;
- retrieval start/end timestamps;
- query result row counts;
- any endpoint freshness metadata available at retrieval time;
- HTTP response metadata where useful;
- SHA-256 of every raw TSV/CSV result;
- taxonomy file SHA-256;
- a semantic fingerprint over the staged result.

The result files stay local/gitignored and become the reproducible input for that build.

### Main risk

QLever is a public query service, not a dated archival snapshot. The graph can advance while multiple exports are being collected. That makes it an acceleration source, not automatically equivalent to the dated 20260914 dump.

### Required promotion gate

Use the current full official dump as the control:

1. finish the in-progress 20260914 owner full staging;
2. run QLever selective export using the exact same taxonomy;
3. compare per-category QID sets;
4. compare DE/EN labels/aliases, sitelink counts/presence and whitelisted external IDs for a deterministic sample plus all protected sentinels;
5. classify differences as source-freshness deltas vs extraction bugs;
6. only promote a QLever acquisition path if differences are zero or explicitly explained and bounded.

Preferred status: **best candidate for a future fast acquisition path; benchmark before promotion**.

## Option B — Wikimedia Enterprise Wikidata Snapshots

Wikimedia Enterprise added Wikidata bulk snapshots/chunks in September 2026.

Important current properties:

```text
Main Graph items       about 76 million records
compressed size        roughly 105 GB
chunks                 close to 300
format                 tar.gz containing NDJSON
free account           monthly snapshot
free chunk allowance   sufficient for the published ~300-item bundle chunks
status                 beta
```

The Main Graph excludes roughly 45 million scholarly items plus lexemes/schemas. Each Wikidata record still carries labels, descriptions, aliases, sitelinks and statements.

Advantages over the classic owner dump:

- official Wikimedia source;
- chunked downloads;
- resumable/retryable per chunk;
- easy bounded parallel processing;
- gzip/NDJSON rather than one giant bzip2 file;
- monthly snapshot available on the free tier;
- Wikidata content remains CC0 and commercially reusable.

Disadvantages:

- still essentially a whole-graph acquisition;
- approximately the same compressed byte scale as the existing 96 GiB bzip2 dump;
- no semantic P31/P106 filter at snapshot-download time;
- endpoints are beta and explicitly not covered by a production SLA.

Preferred status: **future full-source transport candidate, not a solution to semantic over-download**.

## Option C — WDumper custom partial RDF dumps

Wikidata's official database-download page still points to WDumper as a third-party mechanism for creating custom partial RDF dumps where entities/statements can be filtered.

This is conceptually almost exactly what RhymeLab wants: have the server process the full dump once and download only the subset.

Concerns:

- the public service could not be independently verified as a dependable 2026 production dependency in this research;
- the upstream repository shows little recent maintenance compared with QLever;
- historical issue reports document confusing/incorrect filter outcomes for large class selections;
- output is RDF rather than the current JSON shape.

Preferred status: **interesting experiment only; do not make it a required build dependency**.

## Option D — prebuilt derived Wikidata datasets

### Somnia/depesche-wd-index

Snapshot: July 2026.

Useful properties:

```text
notable items              14,213,939
hard floor                 >= 2 sitelinks
license                    CC0-1.0
resolve languages          34, including de + en
full published index       ~32 GB
P31/P106 postings          present
raw P31/P279/P131 edges    present
multilingual aliases       present in index/warm data
sitelink counts            present
```

The full package contains vector/ANN artifacts that RhymeLab does not need and must not import into the deterministic core. Individual non-vector artifacts can be downloaded separately.

Why it is promising:

- strong cultural/notability prefilter;
- DE/EN aliases already materialized;
- P31/P106 lookup is already indexed;
- much smaller than the official full dump.

Why it is not canonical:

- hard `>=2 sitelinks` floor can remove niche but valid cultural entities before RhymeLab's own category-relative policy gets a chance to decide;
- snapshot is older than the accepted 20260914 dump;
- published thin-claim/index layout is not guaranteed to contain all whitelisted external-ID evidence RhymeLab wants;
- binary format introduces another reader dependency.

Preferred status: **good diagnostic/acceleration benchmark, especially for estimating how much a sitelink floor changes recall; not a drop-in source replacement**.

### RichardDelome/wikidata_truthy Parquet

Snapshot: 2026-03-26.

Published scale:

```text
statements.parquet   7.6 GB
labels.parquet       3.4 GB
items.parquet        2.1 GB
descriptions         340 MB
total                ~14.2 GB
license              CC0-1.0
```

It is excellent for fast DuckDB-based P31/P106 discovery, but it does not provide the complete DE/EN alias/sitelink surface required by the current RhymeLab entity schema.

Preferred status: **QID/category discovery benchmark only**.

### Wikidata5M

Approximately 4.6M entities / 20.6M triples, derived from July 2019 Wikidata/Wikipedia.

It is small and convenient, but too old and intentionally incomplete for a 2026 cultural entity catalog.

Preferred status: **reject for production**.

### philippesaade/wikidata

May 2026, Wikipedia-connected entities, all multilingual labels/descriptions/aliases/sitelinks/claims, CC0 — but the currently published dataset is roughly **959 GB**.

Preferred status: **reject for this use case; materially larger than the official owner dump**.

### DBpedia Databus Wikidata extracts

DBpedia provides downloadable Wikidata-derived artifacts and class/type datasets, but using them would add DBpedia mapping semantics and potentially different licensing/attribution obligations. They are not a cleaner path to the exact raw P31/P106 + DE/EN alias contract than QLever or Wikidata itself.

Preferred status: **not selected**.

## Option E — QLever QID discovery + official entity API enrichment

A hybrid design is also viable:

1. QLever exports only the matching QIDs/category memberships.
2. Official Wikidata `wbgetentities` fetches the selected entities in batches.
3. Store the fetched raw entity JSON locally and never require network at runtime.

Anonymous `wbgetentities` usage is normally limited to 50 IDs/request; accounts with the high-limits/bot capability can use 500 IDs/request. For 600k retained/candidate entities that is approximately:

```text
50 IDs/request   ~12,000 requests
500 IDs/request  ~1,200 requests
```

This avoids 100+ GB acquisition but introduces many remote calls and API throttling/retry concerns.

Preferred status: **fallback enrichment strategy; QLever direct field exports are simpler if they prove complete enough**.

## Recommended next experiment

Do **not** abort the current full owner stage. The accepted 20260914 dump is valuable precisely because it gives us a local, dated, checksum-verified control against which every faster method can be proven.

After the current owner stage completes and its three reports are reviewed:

1. implement a read-only `entity:source:qlever:diagnose` experiment;
2. export only category membership first;
3. compare category counts/QID sets against the 20260914 stage;
4. if that passes, export core names/sitelink metrics;
5. then aliases;
6. then external IDs;
7. measure total transferred bytes, query wall time and semantic equivalence;
8. decide whether QLever becomes the preferred future acquisition path while the full dated dump remains the validation/control path.

This sequence gives RhymeLab a realistic chance to turn a multi-hour 100-GB full scan into a much smaller selective acquisition without sacrificing provenance or silently changing entity coverage.
