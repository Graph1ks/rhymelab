# Phase 12A2 — Entity Source Alternatives Research

Last updated: 2026-09-18

Status: **live acquisition feasibility verified**. QLever is now the preferred Phase 12A2 fast-acquisition implementation target. The accepted 20260914 dump remains retained locally as an optional dated validation/control source; this does not change the frozen German Writer.

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

The strongest alternative is **QLever selective export**. A live 2026-09-18 probe against `https://qlever.dev/api/wikidata` has now verified that it can return the complete current RhymeLab taxonomy candidate set and every field required by the Phase 12A2 staging contract. The measured selective artifacts are roughly **80.8 MB compressed in total**, versus the 103.1 GB classic Wikidata owner dump. QRank remains a separate ~105.5 MB local input.

This is sufficient to implement the fast acquisition path without waiting for a multi-hour full-dump stage. The already-downloaded 20260914 dump remains valuable as an optional dated validation/control artifact and must not be deleted.

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

### Live feasibility evidence — 2026-09-18

A temporary GitHub Actions probe queried the public QLever Wikidata backend using the exact 13 reviewed Phase 12A taxonomy targets.

Initial `wdt:` truthy candidate counts:

```text
person.rapper                 11,874
person.musician             141,309
person.actor                392,757
person.director             102,090
group.music_group           100,239
organization.car_brand          781
organization.fashion_house      285
organization.company        265,401
work.film                   349,342
work.video_game             178,535
work.album                  309,853
work.song                    16,184
fictional.character           5,007
distinct candidates       1,836,982
```

Field availability over that selective candidate set:

```text
DE label                   753,117   41.00%
EN label                 1,589,808   86.54%
DE alias                   106,646    5.81%
EN alias                   312,332   17.00%
DE description             777,755   42.34%
EN description           1,560,028   84.92%
dewiki presence             217,047   11.82%
enwiki presence             645,901   35.16%
>=1 whitelisted ext ID      750,408   40.85%
```

Full measured exports:

```text
artifact          rows        raw bytes      gzip bytes      QLever wall time
membership.tsv   1,873,657    110,808,092      6,461,848       5.7 s
core.tsv         1,837,356    231,402,225     52,748,272      20.3 s
aliases.tsv        629,114     45,199,372      8,247,092       5.6 s
external_ids.tsv   986,509    101,222,416     13,366,879       6.7 s
TOTAL                           488,632,105     80,824,091
```

The small excess of `core.tsv` rows over distinct truthy candidates means the importer must canonicalize/deduplicate core rows by QID. This is a local deterministic normalization issue, not an acquisition blocker.

Including the already-pinned QRank artifact:

```text
QLever selective artifacts     ~80.8 MB compressed
QRank                           ~105.5 MB compressed
combined working input          ~186.4 MB compressed
classic Wikidata dump alone    ~103.1 GB compressed
```

The selective source path therefore removes roughly 99.8% of the compressed acquisition volume compared with the classic full-dump path.

Protected sentinel proof for Bud Spencer / `Q221074` returned:

- DE label `Bud Spencer`;
- EN label `Bud Spencer`;
- DE and EN descriptions;
- `wikibase:sitelinks = 74`;
- DE alias `Carlo Pedersoli`;
- P1953 Discogs `448484`;
- P345 IMDb `nm0817881`;
- P434 MusicBrainz `bc013c43-e442-4e06-a9fb-30991954d66d`.

This verifies that the source exposes the concrete name, description, structural popularity and whitelisted external-ID data required by the current staging schema.

### Statement-rank parity with the current JSON importer

Important: the existing JSON importer scans all valued rows in `claims[P31]` / `claims[P106]` and does not restrict classification to Wikidata best-rank/truthy statements. A production QLever fast path must therefore **not** use only `wdt:P31` / `wdt:P106`.

A second live probe used the complete RDF statement graph:

```sparql
?item p:P31 ?statement .
?statement ps:P31 wd:Q... .

?item p:P106 ?statement .
?statement ps:P106 wd:Q... .
```

Measured truthy vs all-statement counts:

```text
category                  truthy    all statements   delta
person.rapper              11,874       11,890          +16
person.musician           141,309      141,599         +290
person.actor              392,758      393,212         +454
person.director           102,090      102,325         +235
group.music_group         100,239      100,286          +47
organization.car_brand        781          783           +2
organization.fashion_house    285          285            0
organization.company      265,401      265,732         +331
work.film                 349,342      349,458         +116
work.video_game           178,535      178,568          +33
work.album                309,853      309,867          +14
work.song                  16,184       16,194          +10
fictional.character         5,007        5,013           +6
DISTINCT TOTAL          1,836,983    1,838,292       +1,309
```

The delta is only about 0.071%, and the all-statement total-count query completed in about 8.6 seconds. The fast path should use `p:/ps:` membership semantics so classification remains aligned with the current JSON staging contract.

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

### Implementation / acceptance gate

Live feasibility, field availability and statement-rank compatibility are now verified. The next gate is implementation rather than more source discovery:

1. implement a local build-time QLever acquisition command using `p:/ps:` membership semantics;
2. export the four normalized artifacts independently;
3. persist exact SPARQL, endpoint, retrieval timestamps, taxonomy SHA-256, row counts and artifact SHA-256 values;
4. canonicalize/deduplicate locally and stage into the same deterministic SQLite contract;
5. join the already-pinned QRank artifact locally;
6. run existing sentinel/category-cut diagnostics;
7. where a completed 20260914 full-dump control is available, compare it as additional evidence, but **do not require a multi-hour full-dump pass merely to use the verified fast path**.

Preferred status: **verified fast-acquisition implementation target**.

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

## Next implementation

The feasibility experiment is complete. Build the production-style **build-time-only** selective acquisition path next.

The current multi-hour owner full-dump stage may be stopped if the owner does not need that optional control result immediately. The validated 20260914 raw dump remains retained locally, so a control stage can always be run later without another 103 GB download.

The next implementation should:

1. acquire all-statement category memberships from QLever;
2. acquire core DE/EN labels/descriptions and structural counts;
3. acquire DE/EN aliases;
4. acquire the four whitelisted external-ID properties;
5. freeze all responses locally before any SQLite build;
6. stage and QRank-join entirely offline after acquisition;
7. record a deterministic semantic fingerprint and existing sentinel/cut diagnostics.

Runtime remains fully local and network-free. QLever is a build/source acquisition dependency only.
