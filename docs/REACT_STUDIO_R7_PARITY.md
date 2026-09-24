# React Studio R7 — automated parity + real-device acceptance

Status: **AUTOMATED SOURCE PARITY COMPLETE / PHYSICAL ACCEPTANCE PENDING**

Tested functional code checkpoint: `c9725ed3312b`

R7 closes the implementation/source side of the behavior-preserving React Studio
replatform and turns the remaining cutover work into explicit evidence gates.

It does **not** declare the migration cutover-ready. Every mandatory capability is
now implemented in the React tree, but no row is promoted to `verified` merely
because source, unit tests or a simulated environment exists.

## R7 invariant

```text
implemented / source-ported != browser verified != physical device verified
```

Current matrix:

```text
ported       93
in_progress   0
pending       0
verified      0
total        93
```

The R8 cutover rule remains **93 / 93 verified**.

## What R7 adds

### Search keyboard interaction contract

The live Results list keeps its registered keyboard handler but now routes behavior
through one deterministic tested action model:

- Arrow Down / Up selects the next/previous row with bounded indices;
- Enter inserts the selected row only when a valid editor insertion path exists;
- Space toggles the Saved state;
- unsupported keys are left alone.

The UI still calls the real result selection, insertion and Saved handlers. The
helper is not a parallel interaction implementation; it only makes the key mapping
independently testable.

### Startup binding guard

React no longer declares controls bound unconditionally.

The Shell marks required interaction families and runs a post-render startup
preflight. It fails closed when a required mounted control is absent and surfaces a
visible alert instead of silently claiming a healthy startup.

Global required controls:

- main navigation;
- DE/EN language switch;
- Quickstyles trigger.

When Search is mounted the preflight additionally requires:

- language route controls;
- scope/filter controls;
- result-layout controls.

### Diagnostics

React Settings now exposes the existing R1 diagnostics model and augments it with
the React startup-preflight result.

The diagnostics surface reports:

- current viewport/environment;
- Web Audio availability;
- VisualViewport availability;
- IndexedDB / DocumentStore authority state;
- Writer capability state;
- startup-control binding state;
- current saved device-acceptance summary.

Diagnostics can be exported as JSON using the existing diagnostics filename/schema
contract.

### Seven-gate physical acceptance

The existing Studio V2 device-acceptance model remains authoritative. React Settings
now provides a UI for the same seven gates:

1. `editor.ime`
2. `perform.metronome`
3. `mobile.navigation`
4. `mobile.swap`
5. `mobile.keyboard`
6. `mobile.touch`
7. `mobile.no-hover`

A gate can be marked manually passed only when the current environment satisfies
the gate requirements. Source tests cannot auto-pass it.

The Settings surface supports:

- per-gate instructions;
- environment eligibility;
- short evidence notes;
- explicit manual pass/fail;
- JSON export;
- multi-report import;
- deterministic merge using the existing device-acceptance implementation.

This allows desktop IME/Web Audio evidence and mobile/touch evidence to come from
different physical environments without discarding either.

### Mobile drawer scroll ownership

The mobile Settings drawer now declares one explicit content scroll owner.

```text
Drawer viewport / popup
  -> popup clips overflow
  -> Drawer.Content owns overflow-y
  -> pan-y remains enabled for touch
```

The shell does not add an independent nested scroll owner for the same drawer.

### Reversible React preview route

R7 adds a **preview-only** server adapter for the Vite build.

Normal server behavior is unchanged.

Available explicit modes:

```bash
# Build + make React the temporary root preview.
npm run studio:react:r7:preview

# Equivalent server flag after a build:
node src/server.mjs --react-studio-preview-default
```

Preview route contract:

```text
/studio-react     React Vite build when preview mode is enabled
/                 React only with --react-studio-preview-default
/studio           shipping Studio V2 golden master
/studio-legacy    explicit Studio V2 rollback alias
/search           existing Search
/legacy           existing Search alias
/pad              existing RhymePad
/pad-legacy       existing RhymePad alias
```

If the React Vite build is missing, preview mode fails closed and tells the owner to
build it first.

This is **not R8 cutover**. It is only the reversible acceptance path required to
test the React candidate against the golden master.

## Deterministic R7 gate

R7 adds:

```bash
npm run studio:react:r7
npm run studio:react:r7:gate
npm run studio:react:r7:cutover
```

### `studio:react:r7`

Runs the focused automated bundle:

- strict TypeScript;
- R1–R7 Vitest suites;
- production Vite build;
- reversible preview Node tests;
- R7 code/source gate.

### `studio:react:r7:gate`

Code-only gate. It checks:

- 93/93 rows are at least `ported`;
- IDs are unique;
- R7 system files exist;
- startup markers are present;
- Search keyboard wiring uses the tested contract;
- R7 Settings acceptance UI is present;
- mobile drawer has one explicit scroll owner;
- reversible preview/rollback routes exist.

This gate does not pretend that physical device work has happened.

### `studio:react:r7:cutover`

Full gate.

It additionally requires:

- a valid merged seven-gate device report;
- 7/7 physical gates passed;
- 93/93 parity rows actually promoted to `verified`.

With the current repository state this command is expected to fail. That failure is
the correct cutover behavior.

Default device-report path:

```text
reports/react-studio-device-acceptance.json
```

Alternative reports may be passed with repeated `--device-report <file>` arguments
or through `RHYMELAB_REACT_STUDIO_DEVICE_ACCEPTANCE`.

## Automated evidence

Functional checkpoint `c9725ed3312b`:

```text
Strict TypeScript                         PASS
Parity inventory                         PASS
Vitest files                         8 / 8 PASS
Vitest tests                       82 / 82 PASS
R7 focused contracts                11 / 11 PASS
Production Vite build                     PASS
Reversible preview Node tests          4 / 4 PASS
R7 source parity                   93 / 93 PORTED
```

GitHub Actions on the same functional checkpoint:

```text
React Studio Replatform #182             PASS
Studio V2 Gate #500                      PASS
RhymeLab CI #1365                        PASS
```

The React workflow itself now runs the reversible-preview contract and R7 source
gate after the production build.

## What remains physical/browser evidence

The repository cannot truthfully self-certify these observations from source:

- IME composition on a real browser/input method;
- audible Web Audio timing and resume behavior;
- mobile bottom-navigation state preservation;
- mobile Editor/Results exact selection/insertion return;
- software-keyboard VisualViewport reachability;
- comfortable physical touch targets;
- touch-only completion of primary workflows with no hover dependency.

Additionally, any parity row whose interaction semantics require real browser
geometry/layering/focus/scroll evidence must remain below `verified` until that
evidence is captured according to `docs/UI_INTERACTION_CONTRACT.md`.

## Promotion rule

A future acceptance pass may update `apps/studio-react/parity-coverage.json` from
`ported` to `verified` only when the row's required evidence is present.

Do not bulk-promote 93 rows because the code-only gate is green.

## R8 boundary

R8 may begin the reversible default-route cutover only after:

```text
automated/source gate       PASS
browser interaction gates   PASS where required
physical device gates       7 / 7 PASS
parity matrix               93 / 93 VERIFIED
full cutover gate           PASS
```

Until then Studio V2 remains the shipping behavioral golden master and rollback
implementation.
