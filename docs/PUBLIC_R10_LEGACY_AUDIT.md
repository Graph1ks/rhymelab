# Public RhymeLab — R10 Legacy / Rollback Audit

Date: 2026-09-25  
Phase: R10 Public Legacy Exit  
Baseline: `main` after R9 Shared Core merge  
Acceptance policy: **7 automated browser behavior gates required**

This audit classifies the remaining historical browser/runtime surface after R9. It is a source/architecture audit only. Browser behavior is verified separately by `docs/R10_AUTOMATED_BROWSER_ACCEPTANCE.md`.

Required behavior gates:

```text
editor.ime
perform.metronome
mobile.navigation
mobile.swap
mobile.keyboard
mobile.touch
mobile.no-hover
```

## Executive finding

Production React is already cleanly separated from the old browser implementations:

```text
apps/studio-react
       |
       v
apps/studio-react/src/core
       |
       +--> packages/shared-core
       +--> packages/platform-web
```

No productive React import from `apps/studio-react/src/legacy`, `src/studio` or `src/ui` was found. The CI boundary remains `npm run studio:react:core-boundary`.

The main R10 pre-gate defect was instead in static serving: normal React startup eagerly read/materialized the historical Search, Studio, RhymePad and development-only browser assets. A missing or damaged rollback file could therefore prevent the normal React product from starting even though that route was never requested.

R10 removes that hidden startup dependency by making historical/rollback/lab static bodies request-lazy while keeping the current React build eager and fail-closed. All rollback routes remain available. The subsequent R10 pass moves the seven behavior checks into browser CI without claiming physical-hardware coverage.

The legacy DB-v4 control database is **not** required by normal startup. `resolveServerRuntimeMode()` selects Serving-v1 and rejects archived split-runtime modes. The old control DB is opened only inside the inactive archival branch. The previous project-state flag saying it was non-optional for normal startup was stale.

---

## 1. Removable only after the seven automated browser gates

These surfaces remain rollback/reference evidence until the seven behavior gates pass in automated browser CI. Hardware smoke remains supplemental evidence.

### Historical Studio V2

Primary surface:

- `src/studio/index.html`
- `src/studio/app.js`
- `src/studio/styles.css`

Its supporting modules under `src/studio/` must remain reachable while `/studio-legacy` is a supported rollback route.

Server / command surface that remains acceptance-blocked:

- `/studio-legacy`
- `--legacy-studio-default`
- `RHYMELAB_LEGACY_STUDIO_DEFAULT`
- `npm run dev:legacy-studio-default`
- `studio:v2:*` verification / rollback commands needed by the existing migration evidence

### Historical standalone Search

- `src/ui/index.html`
- `src/ui/app.js`
- `src/ui/styles.css`
- `src/ui/mobile.css`
- `src/ui/custom-select.mjs`
- supporting compatibility modules in `src/ui/`

Routes / fallback:

- `/search`
- `/legacy`
- `--search-default`
- `RHYMELAB_SEARCH_DEFAULT`
- `npm run dev:search-default`

### Historical RhymePad surface

- `src/pad/`
- `src/rhymepad-v14.mjs`
- `/pad`
- `/pad-legacy`

Although React now contains the product writing workflow, RhymePad is still a preserved regression/fallback surface and therefore is not deleted before automated browser acceptance.

### Acceptance-linked source tests

Tests whose purpose is proving the retained rollback/reference surface remain until the final deletion change. They should be removed or rewritten only together with the surface they protect, never ahead of it.

---

## 2. Necessary migration / data-compatibility code

These are **not legacy UI** merely because they understand an old format. They must survive R10 unless a later explicit migration-support decision replaces them.

### Document migration and stable serialized semantics

Authoritative Shared Core:

- `packages/shared-core/src/document/document-model.mjs`
  - legacy Studio state -> current document snapshot migration;
  - stable Song/Bar/revision identity;
  - legacy backup serialization;
  - snapshot validation.
- `packages/shared-core/src/document/backup-portability.mjs`
  - current portable backup contract;
  - import of supported raw document snapshots;
  - bounded validation.

Web platform compatibility:

- `packages/platform-web/src/document-store.mjs`
  - IndexedDB document authority;
  - legacy-state backup before migration;
  - migration verification.
- `packages/platform-web/src/document-adapter.mjs`
  - `rhymelab-studio-concept-v2` LocalStorage compatibility;
  - existing preferences compatibility;
  - conversion between persisted document snapshots and working state.

These modules are current authority and are explicitly protected by the R9 preservation rule.

### Query-pronunciation cache compatibility

`packages/platform-web/src/query-pronunciation-cache.mjs` remains a current browser platform adapter. Its revision/policy-gated persisted records are not part of the old UI rollback implementation.

---

## 3. Old DOM / UI-only implementation

These are historical presentation/orchestration code, not current domain authority.

Representative Studio-only code:

- `src/studio/app.js`
- `src/studio/styles.css`
- `src/studio/index.html`
- `src/studio/studio-core.mjs` — DOM helpers;
- `src/studio/studio-controls.mjs` — DOM/control helpers around shared semantics;
- `src/studio/i18n.mjs` — DOM MutationObserver localizer layered on Shared Core translation;
- `src/studio/dom-acceptance.mjs` — old DOM geometry/source acceptance helper;
- `src/studio/analysis-cache.mjs` — browser cache used by the historical Studio surface.

Standalone Search DOM implementation:

- `src/ui/app.js`
- `src/ui/index.html`
- `src/ui/styles.css`
- `src/ui/mobile.css`
- `src/ui/custom-select.mjs`

RhymePad browser implementation:

- `src/pad/app.js`
- `src/pad/styles.css`
- checksum-pinned historical HTML materialized by `src/rhymepad-v14.mjs`.

These are deletion candidates after acceptance, not candidates for promotion into Shared Core.

---

## 4. Compatibility wrappers

R9 intentionally left thin historical import surfaces so the rollback UI can consume the new authority without duplicating it.

Examples under `src/studio/` include thin re-exports of:

- Shared Core analysis/detail/search/filter/document/editor/performance/revision/command behavior;
- Platform Web document store, document adapter, diagnostics, device acceptance and mobile viewport behavior.

`src/studio/search-adapter.mjs` is a small rollback composition wrapper that combines Shared Core search with the Platform Web pronunciation cache.

Thin `src/ui/` query-pronunciation/search-state wrappers similarly point at the new authority.

These wrappers are not themselves domain authority. Most should disappear with the old browser surfaces after automated browser acceptance. They should not be copied into React or turned into a new `legacy` bridge.

Compatibility aliases also remain in runtime/route code, for example historical React preview naming and explicit rollback flags. They can be retired during the final route deletion once no supported workflow needs them.

---

## 5. Debug / Lab-only paths

These do not define shipping product behavior:

- `src/benchmark-ui/`
- `src/query-pronunciation-test/`
- `src/markov-test/`
- `src/studio/internal-db-lab.mjs`
- `src/studio/internal-db-benchmark.mjs`
- historical diagnostics / DOM acceptance helpers used only for engineering evidence.

The Markov surface remains explicitly demo-only and unlinked.

R10 does **not** delete development tooling merely because it is non-product. The rule is narrower: it must not be a hidden dependency of normal product startup. The pre-gate cleanup now enforces that for its static files.

A later cleanup can decide tool-by-tool whether each development surface still has engineering value.

---

## 6. Server / routing / static-serving dependencies

### Current product routes

- `/` -> React Studio by default;
- `/studio` -> React Studio;
- `/studio-react` -> React asset alias.

The React Vite build remains eagerly loaded and fail-closed at server startup. This is intentional because it is the current product UI.

### Retained rollback routes

- `/studio-legacy` -> Studio V2;
- `/search`, `/legacy` -> standalone Search;
- `/pad`, `/pad-legacy` -> RhymePad.

These remain functional before automated browser acceptance.

### R10 hidden-startup fix

Before this cleanup, `src/server.mjs` synchronously read/materialized the old browser HTML, CSS, JS and demo/lab assets while constructing its static asset table. Therefore normal `npm start` had an unnecessary filesystem dependency on historical UI assets.

After the R10 pre-gate change:

- React dist assets are still loaded at startup;
- old Studio/Search/RhymePad static bodies are loaded only on first request to those routes;
- benchmark, query-pronunciation-test and Markov demo static bodies are also request-lazy;
- the loaded body is cached after first request;
- route names and responses are otherwise unchanged.

This lets later Legacy Exit delete a historical surface without first making unrelated normal startup depend on it.

### Archived control/runtime path

`src/server-runtime-mode.mjs` currently resolves the server to Serving-v1 and rejects explicit archive/legacy split-runtime requests.

The server still contains archival `!servingV1Active` setup code and `src/runtime-db-routing.mjs` still understands the old `ranking=legacy` v4 comparison. Those are compatibility/regression remnants, not normal startup authority.

They are **not removed in this pre-gate pass** because the local API and regression suite still contain historical/control coverage. Their final removal should be a separate, explicit compatibility/API audit, not an incidental UI deletion.

Normal startup does not open or require `data/local/rhymelab.sqlite`.

---

## 7. Accidental domain authority outside Shared Core

### Finding: none in productive React

The productive React boundary imports framework-independent behavior directly from `packages/shared-core` and browser-specific adapters directly from `packages/platform-web`.

The following source families were inspected as part of the R10 audit:

- Search state, Writer result mapping and query pronunciation;
- document model, persistence and migration;
- editor/bar/history/revision semantics;
- performance semantics;
- analysis/detail adapters;
- command ranking / translations;
- mobile viewport, diagnostics and device-environment adapters.

The historical `src/studio` modules that appear domain-like are either thin re-exports/composition wrappers or old UI-specific orchestration/cache/diagnostics. They do not need promotion.

Backend Serving-v1 search/runtime code under `src/` remains intentional server/runtime authority and is outside the narrower R9 frontend Shared Core extraction. R10 must not misclassify it as old DOM legacy. Cross-platform runtime contracts are the subsequent R11 concern.

---

## Pre-gate cleanup status

Safe cleanup implemented in R10:

1. decouple normal React startup from historical rollback/lab static files;
2. keep current React build startup validation unchanged;
3. add regression coverage for the lazy rollback-serving boundary;
4. correct project-state metadata so R10 and legacy-control startup optionality match the actual runtime;
5. document this audit as the deletion map for the post-browser-gate pass;
6. add Playwright browser acceptance for the seven behavior gates and wire it into React CI.

Explicitly **not** done:

- no CI result is represented as a physical-hardware certification;
- no rollback route deleted;
- no old Studio/Search/RhymePad behavior removed;
- no migration compatibility removed;
- no canonical Serving-v1 behavior changed;
- no Premium, AI, entitlement, licensing or Electron implementation added.

## Final deletion trigger

Only after all seven automated browser behavior gates are green, and no known material hardware-smoke regression is open, should R10 perform the destructive browser-surface deletion. At that point, rerun this classification against the then-current tree, remove compatibility routes/wrappers/tests together with their deleted surfaces, and re-run the full repository + React + public-readiness gates before declaring Legacy Exit complete.


---

## Destructive Legacy Exit candidate — 2026-09-25

The audited deletion map has now been applied on
`r10/destructive-legacy-exit`.

Candidate removals:

- all files under `src/studio/`, `src/ui/`, and `src/pad/`;
- `src/rhymepad-v14.mjs`;
- rollback browser routes and default-selection flags;
- `.github/workflows/studio-v2.yml`;
- `scripts/check-studio-v2-cutover.mjs`;
- `scripts/merge-studio-device-acceptance.mjs`;
- the old R7 manual-device source gate;
- tests whose only purpose was the deleted DOM/RhymePad/rollback surface.

Tests covering behavior that remains authoritative were retargeted directly to
`packages/shared-core` or `packages/platform-web` rather than removed.

The R10 source gate now fails if historical browser trees/routes/scripts return or
if parity evidence points back at deleted sources.

The following are intentionally **not** part of this deletion:

- current document migration/backup compatibility;
- IndexedDB/LocalStorage compatibility;
- query-pronunciation cache compatibility;
- Serving-v1 backend behavior;
- `ranking=legacy` / DB-v4 comparison compatibility.

Final R10 completion still requires all candidate CI gates to pass.
