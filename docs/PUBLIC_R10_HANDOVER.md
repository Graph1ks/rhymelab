# Public RhymeLab — R10 continuation handover

Date: 2026-09-25

## Start here

The active product continuation is now the **public/free RhymeLab**. Premium/AI implementation and product assembly are intentionally deferred until the public product is structurally finished.

Current accepted `main` checkpoint:

```text
c77cfae6f4dc
```

This is the merged R9 Shared Core checkpoint.

Read in this order:

1. `AGENTS.md`
2. `PROJECT.md`
3. `docs/PUBLIC_R10_HANDOVER.md`
4. `docs/SHARED_CORE_ARCHITECTURE.md`
5. `docs/REACT_STUDIO_REPLATFORM.md`
6. `PROJECT_STATE.json`
7. `STATUS.md`

Repository state is authoritative. Do not reconstruct current architecture from old chat history.

---

## What is complete

### R8 — React default runtime cutover

React Studio is the normal product UI:

- `/` -> React
- `/studio` -> React
- `/studio-react` -> React alias
- `/studio-legacy` -> old Studio rollback surface

The cutover is owner-authorized and reversible.

### R9 — Shared Core extraction

R9 is **complete and merged**.

Architecture:

```text
apps/studio-react
       |
       v
apps/studio-react/src/core
       |
       +--> packages/shared-core
       |
       +--> packages/platform-web
```

`packages/shared-core` owns framework-independent product behavior.

`packages/platform-web` owns browser-specific persistence/environment adapters.

`apps/studio-react/src/core` is the typed React-facing composition boundary.

The old React legacy bridge was removed.

Production React must not import:

- `apps/studio-react/src/legacy`
- `src/studio`
- `src/ui`

The boundary is enforced by:

```bash
npm run studio:react:core-boundary
```

Old Studio/Search/RhymePad code is no longer architectural authority. Remaining old browser surfaces exist only for rollback/reference until R10 automated browser acceptance is green.

---

# Active continuation — R10 Public Legacy Exit

## Goal

Finish the public React product sufficiently that historical browser surfaces can be deleted without losing behavior.

Do **not** begin Premium AI implementation, licensing backend implementation, Electron product assembly, or private release integration yet.

The immediate task is:

1. make the seven outstanding behavior gates executable in automated browser CI;
2. fix only observed regressions;
3. audit remaining old UI/runtime compatibility dependencies;
4. delete obsolete rollback surfaces once acceptance allows it;
5. verify that Shared Core / Platform Web remain the only retained authorities;
6. leave the public Free/Lite product independently buildable and useful.

## Seven automated behavioral acceptance gates

R10 now requires these behaviors to pass in the browser gate:

```text
editor.ime
perform.metronome
mobile.navigation
mobile.swap
mobile.keyboard
mobile.touch
mobile.no-hover
```

Source assertions alone are still insufficient. The blocking evidence is the
Playwright browser suite in `apps/studio-react/browser-acceptance/`, executed
by the React Studio CI workflow.

Physical-device smoke checks remain useful for hardware-only facts, but absence
of a manual device report no longer blocks deletion of obsolete rollback UI.

References:

- `docs/R10_AUTOMATED_BROWSER_ACCEPTANCE.md`
- `docs/STUDIO_V2_DEVICE_ACCEPTANCE.md`

## Legacy-removal rule

After physical acceptance, classify remaining historical code before deletion.

Retain/promote only code that is:

1. current authoritative domain behavior;
2. required for serialized-data migration compatibility;
3. a defined replaceable platform adapter;
4. parity-proven semantics still needed by the React product.

Delete rather than preserve:

- old DOM orchestration;
- obsolete browser UI helpers;
- duplicate domain implementations;
- debug-only browser paths that are not product requirements;
- compatibility wrappers that only exist for deleted rollback surfaces.

Do not re-create a `legacy` bridge in React.


## R10 pre-gate audit / cleanup checkpoint

The first R10 source audit is recorded in:

`docs/PUBLIC_R10_LEGACY_AUDIT.md`

It confirms:

- production React has no dependency on `src/studio`, `src/ui` or a React legacy bridge;
- migration/data compatibility in Shared Core / Platform Web is current authority and must survive Legacy Exit;
- normal Serving-v1 startup does not require the archived DB-v4 control database;
- the remaining old Studio/Search/RhymePad code is rollback/reference UI, compatibility wrappers or engineering-only tooling rather than frontend domain authority.

One cleanup was safe before browser acceptance and is already implemented on R10: historical Studio/Search/RhymePad plus debug/lab static assets are request-lazy instead of being synchronously read during normal server startup. The current React build remains eagerly loaded and fail-closed.

This change deliberately did **not** remove any rollback route. R10 now adds a separate automated browser gate before destructive Legacy Exit.

---

# Next continuation after R10 — R11 Platform Contracts

Once Legacy Exit is complete, the next public architecture phase is cross-platform preparation.

Target public contracts should cover at least:

- runtime lifecycle;
- application/data paths;
- storage;
- file import/export;
- secret storage capability;
- database edition installation/selection;
- entitlement capability interfaces;
- AI feature/provider interfaces.

The public repository should define contracts and Free implementations only.

A future desktop architecture is expected to resemble:

```text
Electron Renderer
  React
  nodeIntegration: false
  contextIsolation: true
  sandbox: true
       |
       | narrow typed IPC
       v
Electron Main
       |
       v
RhymeLab Node/SQLite runtime
```

Do not implement Electron packaging inside the public repository merely to complete R11 contracts.

---

# Premium / AI / licensing decision — parked

Two private repositories now exist:

```text
Graph1ks/rhymelab-premium
Graph1ks/rhymelab-build
```

They are intentionally **planning-only** at this stage.

Each currently contains only:

```text
README.md
PLAN.md
```

No private CI, production code, dependencies, secrets or release infrastructure has been added.

## Intended dependency direction

```text
PUBLIC
Graph1ks/rhymelab
       |
       v
PRIVATE
Graph1ks/rhymelab-premium
       |
       v
PRIVATE
Graph1ks/rhymelab-build
```

Public RhymeLab must never depend on the private repositories in order to build or run the Free product.

### `rhymelab-premium`

Planned future ownership:

- premium BYOK AI implementations;
- proprietary AI workflows/prompts/tools;
- supporter-only modules;
- private entitlement-aware feature providers.

Provider API keys remain user credentials and must never be sent to the licensing service.

### `rhymelab-build`

Planned future ownership:

- local/reproducible Public + Premium assembly;
- Electron packaging;
- Free vs Supporter builds;
- Cloudflare entitlement/licensing service;
- protected Standard/Full DB distribution;
- release manifests;
- signing/notarization/updater integration.

Standard/Full database assets should later be physically withheld from unauthorized distributions rather than protected only by a client-side boolean.

## Private CI constraint

Private GitHub Actions minutes are currently intentionally avoided.

The private repositories must remain CI-free until there is actual implementation work worth validating there.

Future assembly should support local builds from pinned public/private commit SHAs before private CI is introduced.

---

# Future entitlement / AI model

The intended public abstraction is capability-based, not Ko-fi-specific:

```text
database.lite
database.standard
database.full
ai
premium.future.*
```

Conceptual public interfaces:

```ts
interface EntitlementProvider {
  has(capability: Capability): Promise<boolean>;
}

interface AiFeatureProvider {
  available(): boolean;
  open(context: AiContext): Promise<void>;
}
```

The public repository may define these contracts later in R11.

It should not contain the future private AI implementation.

Future BYOK AI must preserve the existing security architecture:

- no arbitrary shell;
- no arbitrary filesystem authority;
- no unrestricted browser/network tooling;
- typed allowlisted tools;
- model arguments revalidated outside the model;
- model output treated as untrusted;
- provider API keys never committed/logged;
- desktop persistence only through a trusted OS-secret boundary;
- licensing backend never receives provider API keys.

See `docs/SECURITY_ARCHITECTURE.md`.

---

# Current product priorities

Order of work:

```text
R10  Automated browser acceptance + Legacy Exit
 ↓
R11  Public Platform Contracts
 ↓
     Free/Lite product stabilization
 ↓
     public entitlement + AI extension contracts
 ↓
     desktop/runtime preparation
 ↓
PRIVATE WORK STARTS
     rhymelab-premium
     rhymelab-build
```

Do not let future Premium architecture distract from finishing the public product.

---

# New-thread execution instruction

Start by inspecting current `main`, this handover, `PROJECT_STATE.json`, and the Shared Core boundary.

Then continue **R10 Public Legacy Exit**.

First produce a compact audit of the remaining legacy/rollback surface, grouped into:

1. removable only after the seven automated browser gates;
2. migration/data compatibility code that must survive;
3. old DOM/UI-only implementation;
4. compatibility wrappers;
5. debug/lab-only paths;
6. server/routing/static-serving dependencies;
7. any accidental domain authority still outside Shared Core.

Pay particular attention to whether normal startup still has any hidden dependency on historical control/runtime paths.

Do not delete behavior merely because its file is old.

After the audit, implement safe cleanup, then require the automated browser acceptance workflow before destructive deletion. Keep hardware-smoke claims separate from CI evidence.

All productive React code must continue to pass the Shared Core boundary gate.

No Premium implementation in this continuation.
