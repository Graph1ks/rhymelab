# Distribution Runtime Selector and DB Diagnostics

## Status

The old Master/Lite/Standard/Full development switcher has been promoted to the
shipping runtime-selection primitive, but the selectable runtime set is now
strictly limited to:

```text
LITE | STANDARD | FULL
```

Master/Developer is no longer an application runtime.

Authoritative contracts:

- `docs/DATABASE_RUNTIME.md`
- `docs/DISTRIBUTION_TIERS.md`

## Runtime editions

Default paths:

```text
Lite      data/local/distribution/rhymelab-serving-v1-lite.sqlite
Standard  data/local/distribution/rhymelab-serving-v1-standard.sqlite
Full      data/local/distribution/rhymelab-serving-v1-full.sqlite
```

STANDARD is the default application database.

Per-edition development/package overrides:

```text
RHYMELAB_DISTRIBUTION_LITE_DB
RHYMELAB_DISTRIBUTION_STANDARD_DB
RHYMELAB_DISTRIBUTION_FULL_DB
```

Every opened file is validated against its `distribution_edition` metadata.
Master/Developer or mismatched edition files are rejected.

## Product selection

Normal startup enables request-scoped selection among installed shipping editions:

```bash
npm run dev
npm start
```

The selected edition is stored locally under the existing preference key:

```text
rhymelab.internal.dbLab.v1
```

The key name is retained for compatibility; valid values are now only:

```text
lite
standard
full
```

Old `master` values normalize to `standard`.

The request selector is:

```text
runtime_db=lite|standard|full
```

It is propagated through Writer, detail, analysis, health, dataset stats and
source-backed query-pronunciation requests.

No request may select `master`.

## Standard execution path

STANDARD is the canonical default runtime and continues to use the normal
persistent Serving-v1 parallel Writer execution path.

LITE and FULL may be routed through the direct selected-edition runtime path when
explicitly selected.

This avoids changing normal STANDARD performance merely because the user-facing
database selector is enabled.

## Settings UI

User Settings exposes exactly three database cards:

```text
LITE
STANDARD
FULL
```

Unavailable local files remain visible but disabled.

No Master/Developer card, 20-GB source label or hidden Master fallback may appear.

## Diagnostics and benchmark

The existing database diagnostics remain useful for engineering comparison among
the three shipping editions.

Controlled benchmark order:

```text
Lite -> Standard -> Full
```

FULL is the quality/coverage reference for cross-edition benchmark overlap.

Reports compare:

- server search p50/p95;
- client total time;
- serialization / parse / mapping;
- response bytes;
- deterministic result fingerprints;
- Top-50 overlap and ordered prefix against FULL.

The benchmark does not make the Master database available to the app.

## Master/Developer boundary

The approximately 20-GB source database:

```text
data/local/rhymelab-serving-v1.sqlite
```

remains build-only.

It may be read by distribution census, planning and materialization commands
because the shipping editions are derived from it:

```text
LITE subset STANDARD subset FULL subset MASTER
```

This provenance/nesting relationship must not be confused with runtime
availability.

## Fixed-package mode

A package that intentionally ships only STANDARD can disable edition switching:

```text
RHYMELAB_DISTRIBUTION_SWITCHER=0
```

or:

```text
--no-distribution-switcher
```

That mode remains STANDARD-only. It does not enable Master or archived split
runtimes.

## Regression coverage

Relevant tests include:

```text
tests/internal-distribution-switcher.test.mjs
tests/studio-internal-db-routing.test.mjs
tests/internal-db-benchmark.test.mjs
tests/server-runtime-mode.test.mjs
tests/studio-v2-source.test.mjs
tests/local-ui-source.test.mjs
```
