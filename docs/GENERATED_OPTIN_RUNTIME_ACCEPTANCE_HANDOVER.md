# Generated Opt-In Runtime Acceptance Handover

## Scope

This is the authoritative continuation point after the generated-pronunciation Base-Parity materialization and the merged explicit opt-in runtime integration.

Read first:

- `AGENTS.md`
- `docs/PRONUNCIATION_BASE_PARITY_V1.md`
- `docs/PRONUNCIATION_BASE_PARITY_HANDOVER.md`
- this file

Current implementation checkpoint on `main`:

```text
PR #149
Add explicit generated-pronunciation opt-in runtime

merge commit
900219a
```

The repository implementation is finished for this gate.

**The owner has NOT yet run the local generated-runtime acceptance command after PR #149.**

Do not reconstruct or rerun Pronunciation Backfill V2.
Do not rerun Base-Parity materialization.
Do not ask the owner to rebuild the four augmented databases unless the acceptance output proves a local artifact is missing or invalid.

## Accepted Base-Parity input

The owner Base-Parity report already passed.

```text
schema                         rhymelab-generated-base-parity-v1
policy                         canonical-schema-opt-in-generated-overlay-v1
status                         ok

active eSpeak A/B              3,365,814
unclassified active                     0

de_word                        1,289,105
en_word                          885,172
phrase_surface                     8,070
entity                         1,224,361

deferred total                     2,538
Client B                             292
Client C                           2,161
Client D                              60
U                                     25
```

Phrase parity closed as:

```text
generated phrase surfaces             8,070
canonical composition                 7,967
dependency-deferred                     103
ready phrases                        98,058
mosaic windows                      404,366
retrieval anchors                   404,366
retrieval v2 anchors                404,366
```

The 103 phrase rows are not unexplained defects. They are parity-deferred because canonical composition depends only on intentionally non-active token dependencies.

Dependency counts recorded in the report:

```text
admission_review       169
admission_reject_noise   1
U_unresolved             1
```

A phrase can have more than one blocking token, so dependency counts exceed phrase-row count.

Exact persistent SQLite schema parity passed for all four augmented databases:

```text
DE Writer       true
EN Writer       true
Phrase          true
Entity          true
```

Canonical DBs were not mutated.

Base-Parity report semantic fingerprint:

```text
ea5f0f5721b6a441f1309cb67a2d69beecf6ca1d3f64b6938a6cbd49033f774d
```

## Augmented runtime artifacts already present

The accepted Base-Parity run produced:

```text
data/local/rhymelab-v5-generated-optin.sqlite
data/local/rhymelab-en-v1-generated-optin.sqlite
data/local/rhymelab-phrases-v1-generated-optin.sqlite
data/local/rhymelab-entities-v1-generated-optin.sqlite
data/local/pronunciation-base-parity-v1-report.json
data/local/pronunciation-backfill-v2-deferred.tsv
data/local/pronunciation-base-parity-v1-deferred-phrases.tsv
```

Canonical files remain:

```text
data/local/rhymelab-v5.sqlite
data/local/rhymelab-en-v1.sqlite
data/local/rhymelab-phrases-v1.sqlite
data/local/rhymelab-entities-v1.sqlite
```

## PR #149 runtime contract

Generated data remains:

- second-class by pronunciation provenance/trust;
- default OFF;
- available only after explicit user opt-in;
- represented by the same canonical DB schemas and runtime/ranking paths as normal data.

### OFF

```text
generated checkbox OFF
-> canonical DE Writer DB
-> canonical EN Writer DB
-> canonical Phrase DB
-> canonical Entity DB
```

OFF must preserve canonical routing and response fingerprints.

### ON

```text
generated checkbox ON
-> rhymelab-v5-generated-optin.sqlite
-> rhymelab-en-v1-generated-optin.sqlite
-> rhymelab-phrases-v1-generated-optin.sqlite
-> rhymelab-entities-v1-generated-optin.sqlite
```

There is no separate generated scoring/ranking policy.

The trust distinction comes from provenance and explicit opt-in.

## Fail-closed enablement

The presence of the four augmented databases is **not enough** to make the checkbox usable.

The server requires both:

1. the accepted Base-Parity report;
2. a local generated-runtime acceptance marker bound to that Base-Parity semantic fingerprint.

Marker:

`data/local/generated-optin-runtime-enabled-v1.json`

The marker is written only by a successful owner acceptance run.

Without the marker, the generated runtime remains unavailable and the checkbox stays disabled.

This is intentional.

## Current owner action — NOT YET RUN

The next command is exactly:

```powershell
git switch main
git pull --ff-only

npm run pronunciation:secondary:runtime:accept
```

This command **does not rebuild the millions of pronunciation rows**.

It validates the already-existing canonical and augmented databases and tests runtime routing.

Primary output:

`data/local/generated-optin-runtime-acceptance-v1-report.json`

Successful enablement marker:

`data/local/generated-optin-runtime-enabled-v1.json`

If the acceptance command fails, the marker must not be treated as valid enablement.

## Acceptance gates implemented by PR #149

The acceptance runner verifies:

- Base-Parity report is accepted;
- checkbox/OFF selection resolves to the exact canonical database bundle;
- checkbox/ON selection resolves to the augmented database bundle;
- canonical databases contain zero Backfill overlay provenance markers;
- generated overlay markers exist in DE, EN, Phrase and Entity;
- augmented populations expand the corresponding canonical populations;
- generated-only coverage probes exist for DE, EN, Phrase and Entity;
- representative OFF-mode response fingerprints equal direct canonical fingerprints;
- generated-mode representative queries remain below the configured latency bound;
- generated DE Writer is available;
- generated EN Writer is available;
- generated DE Phrase/Mosaic is available;
- generated DE Entity runtime is available;
- generated EN Entity runtime is available.

Representative acceptance queries include:

```text
DE words      Liebe
EN words      time
DE phrases    Freiheit
DE entities   Musik
```

Default query latency ceiling in the acceptance runner:

`5000 ms per representative generated query`

This is a broad correctness/runtime gate, not the final 80–100 ms database-performance target.

## Query-pronunciation provenance invariant

Generated opt-in database pronunciations must never become falsely source-backed query truth.

If a generated overlay pronunciation is reused as a query reference, it remains marked generated.

Do not change this invariant to improve cache hit rates or query coverage.

Canonical source-backed pronunciation remains higher-trust.

## UI behavior after acceptance

After a successful acceptance run:

```powershell
npm start
```

Expected server startup line:

```text
Generated opt-in runtime: available (default OFF)
```

The Writer UI then exposes the Generated Data / Generierte Daten checkbox.

Required behavior:

```text
new app load     checkbox OFF
OFF              canonical only
ON               augmented DB bundle
new app restart  checkbox OFF again
```

The opt-in state is intentionally not persisted in localStorage.

Generated results should expose generated pronunciation provenance without changing canonical result semantics.

## What to upload next

If the acceptance run completes, provide only:

`data/local/generated-optin-runtime-acceptance-v1-report.json`

If it fails before producing an accepted report, provide the terminal error/log excerpt.

The next thread should inspect the actual result before deciding whether any code change is required.

## Failure triage

Do not jump back to Backfill or Base-Parity generation.

Classify the failure first.

### Base-Parity report gate

Examples:

- report missing;
- semantic fingerprint mismatch;
- schema/policy/status mismatch;
- output path mismatch.

Treat these as local artifact/report consistency problems.

### Acceptance marker

The acceptance runner itself bypasses the marker while testing and writes a fresh marker only after all gates pass.

Do not manually fabricate the marker.

### Canonical contamination gate

If any canonical DB contains generated overlay provenance markers, stop.

Do not normalize this away. The owner contract requires default canonical data to remain generated-free.

### Generated overlay missing

If generated markers or generated-only probes are missing in one domain, inspect that augmented DB only.

Do not rebuild unrelated domains until the exact missing artifact is identified.

### OFF fingerprint mismatch

This is a runtime regression.

Do not waive it.

Checkbox OFF must retain the canonical behavior.

### Capability failure

Inspect the specific domain runtime:

- DE Writer
- EN Writer
- DE Phrase/Mosaic
- DE Entity
- EN Entity

Do not introduce generated-only schema/ranking code to make capability checks pass.

### Latency failure

First inspect the query case and runtime path.

The current acceptance ceiling is deliberately generous. A failure here likely indicates a pathological runtime regression, not ordinary optimization work.

Do not retune ranking to solve latency.

## Deferred work still frozen

Keep these rows deferred until the owner explicitly reopens them:

```text
Client B      292
Client C    2,161
Client D       60
U              25
-----------------
total        2,538
```

Also keep the 103 Phrase full-surface rows parity-deferred unless their underlying token dependencies are explicitly revisited later.

Do not silently promote any of these populations through the runtime checkbox.

## After the acceptance report passes

Only after the local runtime acceptance report is actually `status = accepted`:

1. verify every gate in the report;
2. verify the marker fingerprint binds to the accepted Base-Parity report;
3. start the app;
4. confirm startup reports generated runtime available/default OFF;
5. smoke-test checkbox OFF and ON;
6. preserve OFF-mode canonical behavior;
7. inspect generated provenance presentation;
8. then continue with runtime-performance work or product polish as explicitly requested.

Do not treat PR #149 CI as a substitute for this owner-local acceptance. CI does not contain the owner's multi-gigabyte local runtime databases.

## New-thread starter

Paste this into the next thread:

```text
Read docs/GENERATED_OPTIN_RUNTIME_ACCEPTANCE_HANDOVER.md first.

PR #149 is already implemented and merged on main. I have NOT run the local runtime acceptance yet. Do not rebuild Pronunciation Backfill V2 or Base-Parity and do not ask me to rerun the millions-row materializer.

My next local command is:

git switch main
git pull --ff-only
npm run pronunciation:secondary:runtime:accept

When I provide data/local/generated-optin-runtime-acceptance-v1-report.json or a failure log:

1. verify every acceptance gate in the handover;
2. confirm OFF remains canonical-only and ON uses the generated augmented bundle;
3. confirm no generated markers leaked into canonical DBs;
4. confirm DE/EN/Phrase/Entity generated paths open correctly;
5. confirm generated query references remain generated rather than source-backed;
6. if the run fails, fix only the diagnosed defect through fresh branch -> PR -> validate -> squash merge;
7. do not reopen Client B 292 / C 2161 / D 60 / U 25 or the 103 parity-deferred phrases unless I explicitly ask;
8. after repo changes, give me exact local PowerShell commands.

If the acceptance report passes, have me run npm start and verify:
Generated opt-in runtime: available (default OFF)
then continue with the actual product/runtime follow-up.
```
