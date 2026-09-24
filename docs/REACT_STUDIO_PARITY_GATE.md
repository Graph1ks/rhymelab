# React Studio parity gate

Status: **hard cutover gate**

This document defines how RhymeLab prevents capability loss during the React replatform.

## Sources of truth

The migration inventory is the union of:

1. `src/studio/parity-manifest.mjs` — existing Studio parity contract;
2. `docs/UI_REDESIGN_PARITY.md` — detailed Search/RhymePad/Studio behavior;
3. `docs/UI_INTERACTION_CONTRACT.md` — interaction regression rules;
4. `docs/STUDIO_V2_HANDOVER.md` — implemented production-direction features;
5. baseline commit `fbda43a9e4dd915f3bd5c1fa53045cbe2055e919` — Workflow UX v3 additions;
6. `apps/studio-react/parity-coverage.json` — migration execution state.

## Status semantics

- `pending`: inventoried; implementation not started.
- `in_progress`: implementation exists but parity is incomplete.
- `ported`: implementation exists and focused tests pass.
- `verified`: automated parity evidence is complete and required browser/device evidence has passed.
- `blocked`: known blocker.

Only `verified` satisfies cutover.

## Commands

Inventory mode checks that the React migration inventory contains every legacy parity ID and every mandatory Workflow UX v3 item:

```bash
npm run studio:react:parity
```

Cutover mode additionally requires every row to be verified:

```bash
npm run studio:react:parity:cutover
```

The second command is expected to fail throughout most of the migration. That failure is intentional.

## Evidence

A row may move to `ported` only when its `evidence` array names concrete test(s), adapter(s) or browser acceptance artifacts.

A row may move to `verified` only when the evidence demonstrates behavior, not merely source presence.

## Baseline size

The initial inventory contains 82 existing parity IDs plus 11 explicitly captured Workflow UX v3 behaviors, for 93 mandatory migration rows at initiation.

The checker also dynamically reads the legacy manifest, so adding a new capability to the old Studio during the freeze without adding it to the React inventory breaks the inventory gate.
