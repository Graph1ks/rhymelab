# Distribution DB Lab v2 — Thread Handover

> **Historical handover notice (2026-09-23):** the runtime contract described below
> has been superseded. The application no longer exposes or uses the
> Master/Developer database. Product runtime is now restricted to
> **LITE / STANDARD / FULL**, with **STANDARD** as default. Master remains only
> the build/materialization source. See `docs/DATABASE_RUNTIME.md` and
> `docs/INTERNAL_DISTRIBUTION_LAB.md`.


**Status:** active continuation  
**Last updated:** 2026-09-22  
**Canonical repository:** `Graph1ks/rhymelab`  
**Current accepted main merge:** `51853e523e55` (PR #197)  
**Post-merge CI:** RhymeLab CI #924 — PASS  
**Studio V2 pre-merge gate:** PASS

This document is the focused continuation point for the next thread working on
Master/Lite/Standard/Full database quality, coverage and performance.

Do **not** reconstruct this state from prior chats. Read this document, then
`docs/INTERNAL_DISTRIBUTION_LAB.md`, then inspect current `main` only as needed.

---

## 1. Immediate next-thread instruction

The owner is expected to reply in the new thread with the output of the newly
implemented DB Lab v2 benchmark workflow, normally:

1. `Bench current` for a representative query such as `Arbeitsweise`;
2. `Bench suite`;
3. `Copy all` JSON after the benchmark.

The next thread should treat that owner response as the primary new evidence.

### When the owner provides the benchmark/Copy-all payload

Do **not** ask the owner to restate the setup or rerun old build/planning work.

Immediately:

1. verify the payload schema/version;
2. verify all available DBs were measured with the same effective request;
3. inspect repeat-run determinism before comparing quality;
4. compare Master/Lite/Standard/Full performance;
5. compare result coverage/quality against Master descriptively;
6. inspect detailed server hotpath stages for the slow editions/queries;
7. separate DB/search cost from transport/parse/render cost;
8. identify concrete optimization candidates;
9. preserve quality/ranking semantics unless evidence justifies a new candidate;
10. implement the highest-value safe optimizations in a new branch/PR with tests.

Do not give a vague "looks faster" answer. Quantify p50/p95/max, response bytes,
quality overlap, deterministic behavior and the dominant runtime stages.

---

## 2. Product/runtime baseline

Studio V2 is the default product shell.

Serving-v1 is the canonical product runtime:

```text
Master DB
data/local/rhymelab-serving-v1.sqlite

schema family
rhymelab-serving-v1

product adapter
rhymelab-serving-v1-product-adapter-v1
```

Normal product startup remains separate from the internal comparison lab.

Markov / Constrained Lyric Decoder V2 remains frozen/on ice.

Current capability contract:

```text
Master    markov=false
Lite      markov=false
Standard  markov=false
Full      markov=false
```

Do not resume/promote/expose Markov unless the owner explicitly reopens it.

---

## 3. Distribution contract

Authoritative contract:

`docs/DISTRIBUTION_TIERS.md`

Budgets are **total product-entry budgets**, not word-only budgets.

```text
LITE
50,000 total
= 50,000 ranked Core Words

STANDARD
250,000 total
= majority ranked Core Words
+ accepted Core Phrases
+ Top 1,000 retrievable accepted Entity memberships/category
  unioned/deduped by entity_id for total budget

FULL
400,000 total
= majority ranked Core Words
+ accepted Phrases
+ up to 5,000 retrievable accepted Entity memberships/category
  with every Standard Top-1,000/category membership reserved inside that 5,000
+ accepted Generated pronunciation/phrase closure where supported
```

There is **no additive 200k Generated-only Word quota**.

Hard identity invariant:

```text
LITE ⊂ STANDARD ⊂ FULL ⊂ MASTER
```

The physical cross-edition nesting verifier is part of the release gate:

```powershell
npm run distribution:verify:nesting
```

### Full Entity quota invariant

A documentation/code audit found and fixed the previous incorrect pattern:

```text
Full Top-5000/category
UNION Standard Top-1000/category
```

which could exceed 5,000 memberships/category.

Current accepted rule:

1. reserve every Standard Core Top-1,000/category membership **inside** Full;
2. fill only the remaining Full slots from the broader Full-eligible ranking;
3. fail closed if a category exceeds the configured Full quota.

Regression coverage exists for the displacement case.

---

## 4. Accepted physical SQLite evidence

The owner completed/vacuumed the real databases and DB Lab reported the following
physical sizes on 2026-09-22:

```text
Master    20,160,811,008 B   18.776 GiB   freelist pages 0
Lite         154,152,960 B      147.0 MiB freelist pages 0
Standard   1,109,385,216 B      1.033 GiB freelist pages 0
Full       2,147,987,456 B      2.000 GiB freelist pages 0
```

These are accepted owner-local physical observations, not estimates.

They are also recorded in:

- `STATUS.md`
- `PROJECT_STATE.json`

Do not overwrite these values with projections.

---

## 5. Internal DB Lab activation

The comparison lab is development-only.

Start:

```powershell
git switch main
git pull --ff-only
npm run dev:distribution-lab
```

Then hard-reload Studio if needed.

Default paths:

```text
Master    data/local/rhymelab-serving-v1.sqlite
Lite      data/local/distribution/rhymelab-serving-v1-lite.sqlite
Standard  data/local/distribution/rhymelab-serving-v1-standard.sqlite
Full      data/local/distribution/rhymelab-serving-v1-full.sqlite
```

Optional development path overrides:

```text
RHYMELAB_DISTRIBUTION_LITE_DB
RHYMELAB_DISTRIBUTION_STANDARD_DB
RHYMELAB_DISTRIBUTION_FULL_DB
```

### Shipping isolation

Without the explicit internal switcher:

- `GET /api/internal/distribution-dbs` returns 404;
- the internal DB Lab HTML is removed before Studio is served;
- no Master/Lite/Standard/Full engineering switcher appears in normal product UI.

Do not weaken this boundary.

The future user-facing database choice is a separate User Settings product task.
The reusable primitive is request-scoped edition routing, not this diagnostics UI.

---

## 6. Request-scoped DB routing

There is no mutable server-global active DB.

Every relevant internal Studio request uses:

```text
runtime_db=master|lite|standard|full
```

The selector follows:

- Writer search;
- word detail;
- Phrase detail;
- canonical song/rhyme analysis;
- capability/health checks;
- dataset stats;
- source-backed query-pronunciation lookups.

Studio fails closed if a Writer response identifies a DB different from the
currently selected one.

Changing DB cancels stale work, clears relevant result/detail/analysis state,
refreshes capabilities and reruns the active query.

---

## 7. DB Lab v2 observability

Authoritative contract:

`docs/INTERNAL_DISTRIBUTION_LAB.md`

Current Copy-all schema:

```text
rhymelab-internal-db-lab-copy-v2
```

Current benchmark schema:

```text
rhymelab-internal-db-benchmark-v1
```

### Exact effective request

The v2 snapshot records the actual Writer request, including server-effective
query options such as:

- query text;
- query language basis;
- result language;
- scope;
- rhyme type;
- variants;
- historical mode;
- Generated flags;
- Entity categories;
- selected runtime DB;
- query-pronunciation override/revision when present.

Client-only UI state is stored separately.

This distinction is mandatory when investigating different result counts.

---

## 8. Result-quality diagnostics

Each measured result set records:

- total result count;
- Word/Phrase/Entity counts;
- DE/EN counts;
- order-sensitive deterministic result fingerprint;
- ordered top-result identities.

Controlled comparisons against Master report:

- result-count delta;
- Top-50 overlap count;
- Top-50 Jaccard;
- exact ordered prefix;
- exact fingerprint match;
- repeat-run determinism.

Do not treat smaller-edition coverage differences as automatic failures. Lite,
Standard and Full intentionally contain different populations.

Quality analysis must be descriptive and tied to the actual edition contract.

---

## 9. Performance pipeline

DB Lab v2 splits the old monolithic "roundtrip" into:

```text
DB / Search
→ post-search server work
→ JSON serialization
→ response bytes
→ client headers
→ body read
→ JSON parse
→ Studio DTO mapping
→ DOM render
```

Per-query diagnostics include, where available:

- `serverSearchMs`;
- server post-search overhead;
- `serverSerializeMs`;
- response bytes;
- client time to headers;
- body-read time;
- JSON-parse time;
- DTO-map time;
- total client fetch;
- query-specific Resource Timing;
- DOM result-render time.

Browser page-lifetime resource totals are context only. They are not per-query
benchmark transfer measurements.

Copy-all refreshes the internal DB endpoint before capture, so server uptime, RSS,
CPU and event-loop data are live rather than stale from page initialization.

---

## 10. Controlled benchmark modes

### Bench current

Purpose: exact apples-to-apples comparison of the current effective Writer request.

Default policy:

```text
databases: all locally available Master/Lite/Standard/Full
warmup:    1 / DB
measured:  5 / DB
```

Warmups are excluded from p50/p95/mean.

Use this first for a representative problematic query such as `Arbeitsweise`.

### Bench suite

Fixed Core-style suite:

```text
DE
Arbeitsweise
Weihnachten
Reise
Maschine
Geschichte
Liebe

EN
crisis
inflection
motion
generation
fire
time
```

Default policy:

```text
warmup:    1 / query / DB
measured:  2 / query / DB
```

The suite disables Generated, historical and variant expansion to stabilize the
cross-edition request contract.

With all four DBs available this is 144 total requests including warmups.

Benchmark execution uses an isolated Studio search client and does not mutate the
visible Writer result set.

A Stop control aborts the benchmark.

---

## 11. Benchmark statistics to inspect first

For each DB:

- measured run count;
- search min/p50/p95/max/mean;
- client total min/p50/p95/max/mean;
- serialization distribution;
- parse distribution;
- map distribution;
- response-byte distribution;
- result-count distribution;
- determinism status;
- nondeterministic case IDs.

Quality vs Master:

- number of comparisons;
- mean Top-50 Jaccard;
- exact fingerprint matches;
- mean exact ordered prefix.

Raw samples retain detailed server hotpath profile data when profiling is enabled.

### If a DB is slow

Inspect hotpath stage timings/counters before proposing an optimization.

Do not guess based only on total milliseconds.

Likely classes to distinguish:

- candidate lookup;
- candidate hydration;
- analysis feature preparation;
- phonetic scoring;
- ranking selection;
- result construction;
- Phrase retrieval/ranking/enrichment;
- Entity retrieval/anchor/scoring;
- JSON transport overhead.

---

## 12. Studio Writer transport optimization

Studio now marks Writer requests with:

```text
studio=1
```

Only those responses use the compact projection:

```text
studio-writer-compact-v1
```

The projection preserves Studio-visible semantics:

- result order;
- result IDs;
- scores;
- rhyme/relation types;
- syllable information;
- usage fields;
- Generated/provenance fields;
- POS / lexical tags / historical state;
- Phrase metadata;
- Entity QID/categories/popularity;
- detail-relevant metadata;
- query pronunciation;
- capabilities;
- benchmark profile.

Heavy backend/channel debug structures unused by Studio are omitted.

Normal `/api/writer` clients without `studio=1` retain the full API payload.

No ranking/scoring/retrieval semantics were intentionally changed by this transport
projection.

Regression tests cover compact-payload semantic parity for Studio mapping/detail.

---

## 13. Previously observed performance evidence

Before v2 instrumentation, owner snapshots already showed a large edition effect,
but those rolling samples were not a controlled benchmark.

Representative observations included:

```text
Arbeitsweise / Master
server search   ~1267 ms
client roundtrip ~1443 ms
results          633

Arbeitsweise / Full
server search    ~367 ms
client roundtrip ~533 ms
results          801
```

Rolling means from mixed prior samples were approximately:

```text
Master     ~491.5 ms
Lite        ~86.0 ms
Standard   ~172.9 ms
Full       ~116.7 ms
```

These values motivated DB Lab v2 but are **not** a controlled final benchmark.

Do not compare these old mixed-query rolling means as if they were p50/p95
cross-edition acceptance results.

---

## 14. What the next owner response should contain

Preferred flow:

```text
1. pull main
2. npm run dev:distribution-lab
3. hard reload
4. Bench current on Arbeitsweise
5. Bench suite
6. Copy all
7. paste/upload the resulting JSON to the next thread
```

The next thread should accept either:

- the full Copy-all v2 JSON;
- benchmark JSON embedded in the Copy-all payload;
- screenshots plus JSON;
- a pasted benchmark summary if that is all the owner has.

If only partial evidence arrives, analyze what is present and identify the precise
missing acceptance evidence. Do not make the owner rerun everything by default.

---

## 15. Next-thread analysis template

When the benchmark arrives, report in this order.

### A. Integrity

- schema/version;
- DB availability;
- benchmark completeness;
- deterministic repeat status;
- effective-request equality.

### B. Speed

Table:

```text
DB | Search p50 | Search p95 | Total p50 | Total p95 | Serialize | Parse | Map | Response bytes
```

Then identify the dominant stage per edition.

### C. Quality / coverage

Table:

```text
DB | result count | Word/Phrase/Entity mix | Top-50 Jaccard vs Master | exact prefix | fingerprint matches
```

Call out expected edition-driven coverage loss separately from suspicious
same-edition nondeterminism or ranking drift.

### D. Size / speed / quality tradeoff

Use the accepted physical sizes:

```text
Master    18.776 GiB
Lite       147.0 MiB
Standard     1.033 GiB
Full         2.000 GiB
```

Describe the concrete tradeoff. Do not rank political/product choices for the user;
for this engineering choice, give evidence and implementation implications.

### E. Hotpath action plan

Only after the evidence above:

1. name the exact slow stage(s);
2. estimate whether the gain is DB/runtime or transport-side;
3. identify indexes/query/data-layout/code candidates;
4. define semantic invariants/tests;
5. implement the highest-value safe candidate;
6. rerun the same controlled benchmark.

---

## 16. Quality guardrails

The priority is:

```text
QUALITY
+ SPEED
+ deterministic behavior
+ ergonomic Studio UX
```

Speed work must not silently change accepted Writer semantics.

Preserve unless a separately benchmarked candidate is explicitly accepted:

- German Writer-v5/v6 semantics;
- accepted English Writer semantics;
- Phrase/Mosaic accepted ranking/diversity policy;
- accepted Entity population/taxonomy;
- exact distribution budgets/nesting;
- result determinism;
- source/provenance boundaries.

Do not "optimize" by:

- reducing result quality without measuring it;
- silently shrinking candidate pools;
- changing ranking weights;
- dropping detail/provenance fields Studio actually uses;
- adding caches that alter freshness/determinism without an explicit contract;
- enabling generated/Markov behavior outside accepted capabilities.

---

## 17. Important recent PR chronology

Distribution/runtime work relevant to this continuation:

```text
#186  Distribution Master census
#187  Lite/Standard/Full materializer
#188  total-entry budget contract
#189  hard edition nesting
#190  observable/resumable distribution build
#191  Entity selection hotpath + resumable availability cache
#192  bounded/visible finalization; remove unqualified ANALYZE
#193  Windows-safe WAL finalization
#194  internal Master/Lite/Standard/Full Studio DB Lab
#195  repo docs/runtime source-of-truth audit + Full 5k quota fix
#196  Studio shared SearchState browser-module route fix
#197  DB Lab quality/speed v2 + compact Studio Writer transport
```

Current accepted main after #197:

```text
51853e523e55
```

---

## 18. Files to read before editing

Required:

1. `AGENTS.md`
2. `PROJECT.md`
3. `docs/DISTRIBUTION_DB_LAB_V2_HANDOVER.md`
4. `docs/INTERNAL_DISTRIBUTION_LAB.md`
5. `docs/DISTRIBUTION_TIERS.md`
6. `docs/DATABASE_RUNTIME.md`
7. `STATUS.md`
8. `PROJECT_STATE.json`

Implementation hot files:

```text
src/server.mjs
src/internal-distribution-switcher.mjs
src/serving-v1-product-runtime.mjs
src/studio/app.js
src/studio/search-adapter.mjs
src/studio/internal-db-lab.mjs
src/studio/internal-db-benchmark.mjs
src/studio-writer-payload.mjs
src/studio/detail-adapter.mjs
src/studio/analysis-adapter.mjs
```

Regression tests:

```text
tests/internal-distribution-switcher.test.mjs
tests/studio-internal-db-routing.test.mjs
tests/internal-db-benchmark.test.mjs
tests/studio-writer-payload.test.mjs
tests/studio-v2-source.test.mjs
tests/serving-v1-product-runtime.test.mjs
tests/distribution-materializer.test.mjs
tests/distribution-tiers.test.mjs
```

---

## 19. Real-device acceptance remains separate

Do not confuse DB benchmark acceptance with Studio V2 real-device acceptance.

Still pending until the owner verifies on real devices:

- IME + undo/redo;
- Web Audio metronome;
- mobile bottom nav;
- editor/results selection swap/restore;
- software-keyboard viewport;
- touch targets;
- no hover-only primary action.

Fallback Search/RhymePad routes must not be removed until that acceptance is done.

---

## 20. End state for this handover

The implementation work requested in the previous thread is complete and merged.

The next thread is **evidence-driven continuation**.

The first new information should be the owner's benchmark/Copy-all response.

Start from that evidence. Do not redo the distribution build, do not reopen old
accepted ranking gates, and do not ask the owner to explain the project again.
