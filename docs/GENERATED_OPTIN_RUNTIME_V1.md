# Generated Opt-In Runtime V1

## Status

Generated Pronunciation Base-Parity V1 has passed its owner materialization gate.

Accepted materialization facts:

- status: `ok`
- active eSpeak A/B population: 3,365,814
- unclassified active rows: 0
- exact persistent SQLite schema parity: DE / EN / Phrase / Entity
- Phrase surfaces: 8,070 total
  - 7,967 represented through canonical token composition
  - 103 parity-deferred because canonical composition depends only on intentionally non-active token rows
- deferred Backfill rows remain:
  - Client B: 292
  - Client C: 2,161
  - Client D: 60
  - U: 25

This closes the database-shape gate and opens the runtime integration gate.

## Product contract

Generated data remains second-class by provenance, **not by schema or ranking implementation**.

Default:

```text
generated checkbox OFF
-> canonical DE Writer
-> canonical EN Writer
-> canonical Phrase DB
-> canonical Entity DB
```

Explicit opt-in:

```text
generated checkbox ON
-> generated-opt-in DE augmented DB
-> generated-opt-in EN augmented DB
-> generated-opt-in Phrase augmented DB
-> generated-opt-in Entity augmented DB
```

The same Writer / Phrase / Entity search and ranking code paths are used in both modes.

There is no separate generated ranking policy.

## Runtime safety gate

The server does not enable the checkbox merely because the augmented SQLite files exist.

Two local artifacts are required:

1. accepted Base-Parity report:
   `data/local/pronunciation-base-parity-v1-report.json`
2. accepted Runtime marker:
   `data/local/generated-optin-runtime-enabled-v1.json`

The runtime marker is written only by:

```powershell
npm run pronunciation:secondary:runtime:accept
```

That acceptance command validates the parity report, opens all canonical and augmented DBs, checks that default routing remains canonical, confirms generated-only markers/coverage exist only in the augmented bundle, verifies representative DE/EN/Phrase/Entity runtime queries, and applies a bounded query-latency gate.

Primary output:

`data/local/generated-optin-runtime-acceptance-v1-report.json`

A failed acceptance run does not write an enablement marker.

The marker is bound to the Base-Parity report semantic fingerprint. A new/rebuilt parity report therefore invalidates a stale marker.

## UI behavior

The Writer UI contains an explicit generated-data checkbox.

Invariants:

- unchecked by default on every new app session;
- not persisted to `localStorage`;
- disabled when the local generated runtime has not passed acceptance;
- search requests use `generated=1` only when the user checks it;
- detail/query-reference requests follow the same selected DB bundle;
- toggling the checkbox does not alter rhyme scoring/ranking configuration.

The normal URL does not silently opt the user in.

## Query pronunciation

Canonical and generated bundles have separate query-pronunciation cache revisions.

When opt-in is OFF, existing cache behavior remains tied to the canonical DB revision.

When opt-in is ON, the cache is tied to the augmented DB revision.

A generated overlay pronunciation used as a query reference is **not** relabeled as source-backed truth. Client query composition records it as a generated overlay reference.

## Result provenance

Generated rows retain their normal base-schema provenance:

- DE: generated pronunciation flags/source in `hot`
- EN: generated source/tags in `en_pronunciation`
- Phrase: generated token pronunciation source in canonical phrase token composition
- Entity: `generated=1` plus eSpeak source/model provenance

The UI surfaces a Generated badge when the selected result pronunciation depends on this generated overlay.

Canonical OFF-mode result objects do not receive new false-valued provenance fields, preserving canonical response fingerprints.

## Deferred populations

The following remain outside the generated runtime:

```text
Client B      292
Client C    2,161
Client D       60
U              25
```

Authoritative source:

`data/local/pronunciation-backfill-v2.sqlite`

Export:

`data/local/pronunciation-backfill-v2-deferred.tsv`

Phrase surfaces blocked by intentionally non-active token dependencies remain separately preserved in:

`data/local/pronunciation-base-parity-v1-deferred-phrases.tsv`

Do not review/promote these populations unless the owner explicitly reopens them later.

## Owner sequence

After merging the runtime integration:

```powershell
git switch main
git pull --ff-only

npm run pronunciation:secondary:runtime:accept
npm start
```

Then open the Writer UI.

Expected startup behavior after acceptance:

```text
Generated opt-in runtime: available (default OFF)
```

The checkbox should be enabled but unchecked.

If the acceptance command fails, provide:

`data/local/generated-optin-runtime-acceptance-v1-report.json`

or the terminal error. Do not manually create the enablement marker.
