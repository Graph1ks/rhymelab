# Internal Distribution DB Lab

## Status

**Development-only comparison tooling. Not a shipping product surface.**

Current thread continuation / benchmark-analysis handover:

- `docs/DISTRIBUTION_DB_LAB_V2_HANDOVER.md`

The focused handover records the exact current `main`, accepted physical DB sizes,
expected owner benchmark response, next-thread analysis order and quality/speed
guardrails.

The Internal Distribution DB Lab exists so the owner can compare the canonical
Master/Developer Serving-v1 database against the locally materialized Lite,
Standard and Full editions through the real Studio UI.

It is intentionally separate from the future end-user database-selection setting.

Authoritative distribution composition/packaging contract:

- `docs/DISTRIBUTION_TIERS.md`

Canonical runtime contract:

- `docs/DATABASE_RUNTIME.md`

## Activation

Normal product startup does **not** enable the lab.

Use:

```powershell
npm run dev:distribution-lab
```

Equivalent low-level activation:

```powershell
node src/server.mjs --studio-default --internal-db-switcher
```

Environment activation is also available for local engineering:

```text
RHYMELAB_INTERNAL_DB_SWITCHER=1
```

The feature is only enabled while Serving-v1 is the active runtime.

## Default database paths

```text
Master    data/local/rhymelab-serving-v1.sqlite
Lite      data/local/distribution/rhymelab-serving-v1-lite.sqlite
Standard  data/local/distribution/rhymelab-serving-v1-standard.sqlite
Full      data/local/distribution/rhymelab-serving-v1-full.sqlite
```

The Master path still follows `RHYMELAB_SERVING_V1_DB`.

Development-only edition path overrides:

```text
RHYMELAB_DISTRIBUTION_LITE_DB
RHYMELAB_DISTRIBUTION_STANDARD_DB
RHYMELAB_DISTRIBUTION_FULL_DB
```

Missing or invalid edition files are reported as unavailable and their Studio
buttons remain disabled.

## Routing contract

The lab does **not** mutate one process-global "active DB".

Every relevant Studio request carries an explicit edition selector:

```text
runtime_db=master|lite|standard|full
```

The server resolves that database independently for each request.

This is deliberate. It prevents concurrent requests from crossing database
boundaries while a user switches editions.

The selected DB is propagated through:

- `GET /api/writer`;
- word detail requests;
- Phrase detail requests;
- canonical song/rhyme-scheme analysis;
- `GET /api/health`;
- `GET /api/dataset-stats`;
- source-backed query-pronunciation lookups triggered by Studio.

A Writer response in lab mode includes the resolved `runtimeDb`. Studio rejects
the result if it does not equal the currently selected edition. This is a
fail-closed routing assertion rather than a visual label only.

When the edition changes, Studio:

1. cancels stale Writer/detail/analysis requests;
2. clears detail state/cache;
3. resets current result state;
4. refreshes edition capabilities;
5. disables Generated filters if the selected edition does not support them;
6. reruns the current Writer query against the newly selected database only;
7. reruns song analysis when that surface is active.

The local development selection is stored under:

```text
rhymelab.internal.dbLab.v1
```

This storage key is internal tooling state, not a product preference contract.

## Execution-path rule

For database-to-database comparison, selected lab editions execute Writer search
through the same direct internal comparison path:

```text
direct-internal-db-lab
```

The normal canonical Serving-v1 product path may use persistent parallel Writer
workers. Therefore:

- compare **Master vs Lite vs Standard vs Full** timings collected inside the lab;
- do not treat an internal-lab timing as automatically equivalent to the normal
  production worker-path timing;
- `runtimeExecution` is included in the copied metrics so the two contexts cannot
  be confused silently.

No cross-request search/result/scoring cache is introduced by the lab.

## Studio UI

When enabled, Studio renders a dedicated internal bar with four explicit buttons:

```text
MASTER | LITE | STANDARD | FULL
```

The bar is intentionally direct rather than hidden in a dropdown because its
purpose is repeated engineering comparison.

The bar also exposes:

- **Bench current** — the current effective Writer request against every available
  edition with identical options;
- **Bench suite** — a fixed DE/EN Core comparison suite;
- **Stop** — abort the active benchmark without changing the visible Writer state;
- Metrics open/close;
- Copy all;
- metrics refresh.

## Metrics contract

The lab reports both database/runtime and site/browser measurements.

### Per database

Where available:

- file size;
- SQLite page size;
- page count;
- allocated bytes;
- freelist/free bytes;
- table count;
- index count;
- distribution metadata;
- edition capabilities;
- last Writer query time;
- rolling last-100 Writer mean;
- timing sample count.

### Current Writer/UI path

The lab records the **effective server request**, not only the visible query string.
This includes query/result language, scope, rhyme type, variants, historical,
Generated flags, Entity categories, runtime DB and any explicit query-pronunciation
override. Client-only UI state such as syllable filtering, sorting, hide-used and
density is recorded separately.

The timed request pipeline is split into:

- server DB/search time;
- server post-search/pre-serialization overhead;
- JSON serialization time;
- response bytes;
- client time to response headers;
- response-body read time;
- JSON parse time;
- Studio DTO mapping time;
- total fetch time;
- result DOM render time.

Where Resource Timing is available, the exact Writer request also records its own
transfer/encoded/decoded bytes and request duration. This is distinct from the
page-lifetime browser resource totals.

Result-quality diagnostics include:

- total result count;
- Word/Phrase/Entity counts;
- DE/EN result counts;
- an order-sensitive deterministic result fingerprint;
- the ordered top-result identities used by controlled quality comparisons.

These diagnostics exist to distinguish a genuine result/ordering change from a
filter/request-state difference.

### Browser/site

When the browser exposes the corresponding APIs:

- viewport width/height;
- device-pixel ratio;
- hardware concurrency;
- device-memory hint;
- touch-point count;
- connection effective type;
- connection downlink;
- connection RTT;
- Save-Data state;
- JS heap used/total/limit;
- navigation duration;
- TTFB;
- DOM interactive;
- DOMContentLoaded;
- load event;
- first paint / first contentful paint;
- **page-lifetime** resource counts and byte totals;
- DOM element/result-node counts.

Page-lifetime resource totals are contextual diagnostics only. They are not used as
per-query benchmark transfer measurements; the exact Writer Resource Timing entry is
used for that when the browser exposes it.

### Server/process

- Node version;
- platform / architecture;
- uptime;
- RSS;
- heap total / used;
- external memory;
- ArrayBuffers;
- user/system CPU resource time;
- max RSS;
- filesystem read/write counters when exposed;
- voluntary/involuntary context switches;
- event-loop utilization when exposed.

These are engineering observations. Browser/OS support differs, so absent optional
metrics are represented as unavailable rather than fabricated.

## Controlled benchmark contract

### Bench current

`Bench current` freezes the current effective Writer options and runs that same
request against every locally available edition:

```text
Master → Lite → Standard → Full
```

The default measurement policy is:

```text
1 warmup + 5 measured runs / database
```

Warmups never enter p50/p95/mean statistics.

### Bench suite

`Bench suite` uses a fixed 12-query DE/EN suite with Core-style comparison
settings:

```text
DE: Arbeitsweise, Weihnachten, Reise, Maschine, Geschichte, Liebe
EN: crisis, inflection, motion, generation, fire, time
```

The default suite policy is:

```text
1 warmup + 2 measured runs / query / database
```

Generated, historical and variant expansion are disabled for the fixed suite so the
database-edition comparison has a stable request contract. Edition capability
differences still remain visible: for example Lite intentionally has no Phrase or
Entity population.

### Benchmark statistics

For each database the report exposes at least:

- measured run count;
- server search min / p50 / p95 / max / mean;
- server hotpath profile timing;
- serialization timing;
- client total timing;
- JSON parse timing;
- Studio mapping timing;
- response-byte distribution;
- result-count distribution;
- deterministic-repeat status and offending case IDs;
- mean Top-50 Jaccard overlap against Master;
- exact ordered-result fingerprint matches against Master;
- mean exact ordered prefix against Master.

Each raw benchmark sample also retains the detailed server stage profile/counters
when `profile=1` is enabled.

Quality comparison is descriptive. A smaller edition is expected to have different
coverage; the lab reports the concrete differences rather than assigning an
automatic winner.

The benchmark uses a dedicated Studio search client and does not replace or mutate
the currently visible Writer result set.

## Studio transport optimization

Studio marks its Writer requests with:

```text
studio=1
```

The server then projects the full unified Writer response onto
`studio-writer-compact-v1`: only fields used by Studio result rendering, filtering,
detail/provenance presentation, capabilities and benchmark diagnostics are sent.

Important invariants:

- result ordering is unchanged;
- result IDs are unchanged;
- scores/relation types used by Studio are unchanged;
- detail-relevant Phrase/Entity metadata is preserved;
- ranking/scoring/retrieval semantics are unchanged;
- normal `/api/writer` consumers without `studio=1` still receive the full Writer
  payload.

This reduces JSON serialization, localhost transfer, browser parse cost and heap
pressure without changing Writer quality.

## Copy-all payload

The Studio Copy-all action first refreshes
`/api/internal/distribution-dbs`, then writes a JSON snapshot to the clipboard.
Server uptime/RSS/CPU/event-loop values are therefore captured at copy time rather
than reused from the initial page load.

Schema:

```text
rhymelab-internal-db-lab-copy-v2
```

The payload includes:

- `internalOnly: true`;
- `shipping: false`;
- active DB;
- exact effective Writer request;
- client-only search/UI state;
- result-quality fingerprint and composition;
- detailed server/transport/browser timings and per-query response bytes;
- browser/site context;
- freshly refreshed server/process metrics;
- all four database summaries;
- the latest controlled benchmark report, when one exists.

This payload is intended for benchmark/debug comparison and issue reproduction. It
is not telemetry and is not uploaded automatically.

## Shipping isolation

The internal lab must not become a normal shipping UI accidentally.

Without `--internal-db-switcher` / `RHYMELAB_INTERNAL_DB_SWITCHER=1`:

1. `GET /api/internal/distribution-dbs` returns 404;
2. the Internal DB Lab HTML block is removed from the served Studio document;
3. no Master/Lite/Standard/Full engineering switch bar appears in the product UI;
4. ordinary requests follow the canonical runtime path and ignore the internal lab
   because the internal selector is disabled.

This is stronger than a CSS-only `display:none` gate.

Relevant implementation:

```text
src/internal-distribution-switcher.mjs
src/studio/internal-db-lab.mjs
src/studio/internal-db-benchmark.mjs
src/studio-writer-payload.mjs
src/server.mjs
src/studio/index.html
src/studio/app.js
```

Regression coverage:

```text
tests/internal-distribution-switcher.test.mjs
tests/studio-internal-db-routing.test.mjs
tests/internal-db-benchmark.test.mjs
tests/studio-writer-payload.test.mjs
tests/studio-v2-source.test.mjs
```

## Future user Settings migration

The product direction is that a user may choose among database editions actually
available to that installation/device. The choice belongs to the user.

The reusable architectural primitive is the request-scoped edition selection, not
the internal diagnostics UI.

A later user-facing implementation should:

- live in normal User Settings;
- enumerate only installed/available editions;
- preserve the selected edition as a real product preference;
- keep request-scoped routing so concurrent requests cannot mix editions;
- expose edition capabilities clearly;
- degrade unavailable feature controls cleanly;
- avoid exposing Master/Developer unless that build explicitly provides it;
- omit internal process/SQLite debugging diagnostics unless separately enabled for
  support/developer use.

That later Settings work requires its own product/UX acceptance. The current
Internal DB Lab must not be treated as already-shipped user Settings.

## Operational sequence

After the distribution files have been built:

```powershell
git switch main
git pull --ff-only
npm run dev:distribution-lab
```

For ad-hoc diagnosis, switch editions manually and use Copy all. For a controlled
comparison prefer **Bench current** or **Bench suite**, then use Copy all once the
benchmark completes; the copied v2 payload contains the benchmark samples and
summary.

For physical distribution acceptance, continue to use the structural/nesting gates
from `docs/DISTRIBUTION_TIERS.md`; the UI lab complements those gates but does not
replace them.
