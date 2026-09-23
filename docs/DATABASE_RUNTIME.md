# RhymeLab Database Runtime

## Product runtime contract

RhymeLab application runtime is restricted to the three materialized shipping
editions:

```text
LITE
STANDARD
FULL
```

The default edition is **STANDARD**.

Default files:

```text
Lite      data/local/distribution/rhymelab-serving-v1-lite.sqlite
Standard  data/local/distribution/rhymelab-serving-v1-standard.sqlite
Full      data/local/distribution/rhymelab-serving-v1-full.sqlite
```

Normal startup:

```bash
npm run dev
npm start
```

opens STANDARD as the canonical runtime and exposes request-scoped selection among
installed LITE / STANDARD / FULL editions.

## Hard runtime boundary

The application server must never use the Master/Developer database as a product
runtime.

The development source database:

```text
data/local/rhymelab-serving-v1.sqlite
```

is approximately 20 GiB and remains a **build/materialization input only**. It is
used by distribution census/planning/build tooling to derive LITE, STANDARD and
FULL. It is not a selectable application database.

The server validates the selected file's
`meta.distribution_edition`. A path that points to a Master database or to the
wrong shipping edition fails the runtime edition check instead of being accepted
silently.

Likewise, archived split-database server modes are disabled. Flags/environment
values that request the old legacy/archive runtime fail explicitly.

## Request-scoped selection

The active edition is selected per request:

```text
runtime_db=lite|standard|full
```

There is no process-global mutable database switch.

STANDARD is the canonical default when no explicit selector is supplied. Studio
and standalone Search persist the user's local edition preference and send it with
Writer/detail/analysis/capability requests.

Changing edition therefore cannot make concurrent requests cross database
boundaries.

## Capabilities

Runtime behavior follows the distribution manifest stored in each database.

### LITE

```text
Words DE/EN: yes
Phrases:     no
Entities:    no
Generated:   no
```

### STANDARD

```text
Words DE/EN: yes
Phrases:     yes
Entities:    yes
Generated:   no
```

### FULL

```text
Words DE/EN: yes
Phrases:     yes
Entities:    yes
Generated:   yes
```

Unavailable channels are exposed through capability state; they must not silently
fall back to another database.

## Runtime file overrides

Development/package-specific paths may be supplied per shipping edition:

```text
RHYMELAB_DISTRIBUTION_LITE_DB
RHYMELAB_DISTRIBUTION_STANDARD_DB
RHYMELAB_DISTRIBUTION_FULL_DB
```

The edition metadata check still applies. Pointing
`RHYMELAB_DISTRIBUTION_STANDARD_DB` at a Master or FULL file is rejected.

The selector can be disabled for a fixed STANDARD-only package with:

```text
RHYMELAB_DISTRIBUTION_SWITCHER=0
```

or:

```text
--no-distribution-switcher
```

Disabling selection does not re-enable Master or legacy runtimes; STANDARD remains
the only application database in that mode.

## Build-only Master workflow

The Master/Developer database remains the authoritative source for reproducible
shipping editions:

```text
Master / Developer source
data/local/rhymelab-serving-v1.sqlite
        |
        +--> LITE
        +--> STANDARD
        +--> FULL
```

Relevant build commands:

```bash
npm run distribution:census
npm run distribution:plan
npm run distribution:build
npm run distribution:verify:nesting
```

The build relationship remains:

```text
LITE subset STANDARD subset FULL subset MASTER
```

That nesting contract describes materialization provenance and identity coverage.
It does **not** make Master a runtime edition.

## Archived databases

Older split databases remain in the repository's development history and may still
be read by builders, migrations or isolated unit/fixture code. They are not
selectable by the application server.

Examples include:

```text
data/local/rhymelab.sqlite
data/local/rhymelab-v5.sqlite
data/local/rhymelab-en-v1.sqlite
data/local/rhymelab-phrases-v1.sqlite
data/local/rhymelab-entities-v1.sqlite
```

There is no supported `npm run dev:legacy` product-runtime command.

## Product invariant

```text
RhymeLab / Studio / Search / RhymePad
                |
                v
      LITE | STANDARD | FULL
                ^
                |
          STANDARD default
```

Master/Developer storage is build-only. Product runtime is shipping-tier-only.
