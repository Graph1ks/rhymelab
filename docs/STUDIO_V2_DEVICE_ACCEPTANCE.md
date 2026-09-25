# R10 archival note

Studio V2 and its rollback browser routes are removed by the R10 destructive
Legacy Exit candidate. The manual device-report model below is retained only as
historical/optional smoke-test documentation; it is not a shipping product surface
and is not the R10 release blocker.

The authoritative blocking behavior gate is
`docs/R10_AUTOMATED_BROWSER_ACCEPTANCE.md`.

---

# Studio device acceptance history and R10 policy

This file originally described the seven manual real-device gates used during the
Studio V2 cutover. That manual mechanism remains useful as optional diagnostic
evidence, but it is **not the blocking R10 Legacy Exit gate anymore**.

Current policy is documented in:

`docs/R10_AUTOMATED_BROWSER_ACCEPTANCE.md`

## Current React product routes

Normal `npm run dev` / `npm start` serves React Studio:

```text
/              React Studio
/studio        React Studio
/studio-react  React alias
```

Historical rollback surfaces remain temporarily reachable during R10:

```text
/studio-legacy old Studio V2
/search        old standalone Search
/legacy        old Search alias
/pad           RhymePad
/pad-legacy    RhymePad legacy alias
```

## Seven behavior gates

The behavior IDs are retained so historical evidence and current automated
coverage refer to the same requirements:

1. `editor.ime` — composition commit behaves as one Undo/Redo transaction.
2. `perform.metronome` — Web Audio transport starts/stops and timing configuration is honored.
3. `mobile.navigation` — product navigation does not lose editor/insertion state.
4. `mobile.swap` — single-surface editor/results switching preserves the exact target context.
5. `mobile.keyboard` — mobile visual viewport contraction is propagated correctly while editing.
6. `mobile.touch` — primary touch targets remain comfortably tappable.
7. `mobile.no-hover` — primary actions remain available without hover.

R10 proves these through the Playwright browser suite plus the existing
Shared-Core/React regression tests. The browser suite runs with a real Chromium
engine and a touch/mobile emulation profile.

## What CI does not claim

CI does not claim that:

- a specific phone speaker emitted audible sound;
- Gboard, Samsung Keyboard, iOS Keyboard or another vendor IME has no vendor-specific bug;
- every physical safe-area/device combination has been sampled.

Those are hardware smoke observations. A reported hardware failure is still a
bug, but the lack of a manual report no longer keeps old rollback UI alive.

## Historical manual report tooling

The existing device-acceptance schema/import/export helpers may remain until the
final R10 cleanup because they can still collect optional device notes. Historical
reports use:

```text
reports/studio-v2-device-acceptance.json
```

and can be merged with:

```bash
npm run studio:v2:acceptance:merge
```

The old `studio:v2:cutover:check` full mode still understands those reports for
historical cutover verification. It is not the authoritative R10 deletion gate.

## R10 blocking gate

The authoritative R10 browser acceptance is:

```text
apps/studio-react/browser-acceptance/r10-browser-acceptance.pw.ts
```

and is executed by:

```text
.github/workflows/react-studio.yml
```

Destructive Legacy Exit requires that workflow and the normal repository gates
to be green.
