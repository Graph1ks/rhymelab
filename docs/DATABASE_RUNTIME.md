# RhymeLab Canonical Database Runtime

## Canonical/default database

RhymeLab uses one canonical product database by default:

```text
data/local/rhymelab-serving-v1.sqlite
```

Schema family:

```text
rhymelab-serving-v1
```

Normal startup:

```bash
npm run dev
```

and:

```bash
npm start
```

both use this database without an additional runtime flag.

The same Serving-v1 database supplies the runtime data for:

- RhymeLab Writer;
- RhymePad;
- German Words;
- English Words;
- Phrase / Mosaic;
- Entities;
- Generated/Core selection through the Serving-v1 product adapter;
- the source Phrase/Mosaic rows used to materialize the Markov transition model.

The Markov transition SQLite remains a separate compact derived artifact:

```text
data/local/rhymelab-markov-v1.sqlite
```

It is built from Phrase/Mosaic rows in the canonical Serving-v1 database:

```bash
npm run markov:model:build
```

It is not an alternate lexical/rhyme database.

## Runtime rule

The product runtime must not silently fall back from Serving-v1 to an older split database.

If `data/local/rhymelab-serving-v1.sqlite` is absent or fails its product/runtime contract, normal startup fails explicitly.

This is intentional. A missing canonical database must be fixed rather than hidden by an older runtime.

Check/build commands:

```bash
npm run serving:v1:product:status
npm run serving:v1:product:build
```

## Archived predecessor databases

The following files remain relevant to development history, source pipelines, reproducibility, or explicit archival comparison. They are **not the default application runtime**.

| File | Historical role |
| --- | --- |
| `data/local/rhymelab.sqlite` | legacy v4/control rhyme database |
| `data/local/rhymelab-v5.sqlite` | materialized German Writer v5 database |
| `data/local/rhymelab-en-v1.sqlite` | split English Writer database |
| `data/local/rhymelab-phrases-v1.sqlite` | split Phrase/Mosaic database |
| `data/local/rhymelab-entities-v1.sqlite` | split Entity database |
| `data/local/rhymelab-v5-generated-optin.sqlite` | old split Generated German overlay |
| `data/local/rhymelab-en-v1-generated-optin.sqlite` | old split Generated English overlay |
| `data/local/rhymelab-phrases-v1-generated-optin.sqlite` | old split Generated Phrase overlay |
| `data/local/rhymelab-entities-v1-generated-optin.sqlite` | old split Generated Entity overlay |

These names may remain in builders, migration tools, benchmarks, provenance records and historical documentation where they describe how Serving-v1 was produced.

They must not be treated as a normal product fallback.

## Explicit archive runtime

For development-only historical comparison, the old split bundle can still be selected explicitly:

```bash
npm run dev:legacy
```

Equivalent low-level command:

```bash
node src/server.mjs --legacy-runtime
```

This mode exists for regression archaeology, not normal RhymeLab/RhymePad/Markov use.

## Environment overrides

Canonical Serving-v1 path override:

```text
RHYMELAB_SERVING_V1_DB
```

Runtime selection:

```text
RHYMELAB_PRODUCT_RUNTIME=serving-v1
```

is equivalent to the default.

Archive-only values such as:

```text
legacy
legacy-archive
archive
writer-v5
accepted
```

select the old split runtime deliberately.

## Product invariant

```text
RhymeLab
RhymePad
Markov candidate retrieval
Markov transition source
        │
        ▼
data/local/rhymelab-serving-v1.sqlite
```

There is one canonical lexical/phrase/entity product database. Older split databases are provenance/archive inputs only.
