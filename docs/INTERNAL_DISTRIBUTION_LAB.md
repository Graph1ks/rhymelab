# Internal Distribution DB Lab

## Status

**Development-only comparison tooling. Not a shipping product surface.**

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

- selected edition;
- Writer state;
- query;
- result count;
- visible result count;
- server search time;
- server rolling last-100 mean;
- client request/JSON roundtrip;
- result-render time;
- execution path.

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
- resource counts and byte totals;
- DOM element/result-node counts.

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

## Copy-all payload

The Studio Copy-all action writes a JSON snapshot to the clipboard.

Schema:

```text
rhymelab-internal-db-lab-copy-v1
```

The payload includes:

- `internalOnly: true`;
- `shipping: false`;
- active DB;
- Studio/Writer timings;
- browser/site metrics;
- server/process metrics;
- all four database summaries.

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
src/server.mjs
src/studio/index.html
src/studio/app.js
```

Regression coverage:

```text
tests/internal-distribution-switcher.test.mjs
tests/studio-internal-db-routing.test.mjs
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

Then run the same representative queries against Master, Lite, Standard and Full
and use Copy all after each relevant comparison state.

For physical distribution acceptance, continue to use the structural/nesting gates
from `docs/DISTRIBUTION_TIERS.md`; the UI lab complements those gates but does not
replace them.
