# R10 Automated Browser Acceptance

Date: 2026-09-25  
Phase: R10 Public Legacy Exit

## Decision

R10 no longer requires the repository owner to manually click seven acceptance
checkboxes before historical browser UI can be removed.

The release blocker is now **automated behavioral acceptance in a real browser
engine**. Physical-device smoke checks remain useful, but they are supplemental
evidence rather than a destructive-cleanup blocker.

This does not pretend that CI is physical hardware. CI proves browser-visible
behavior; hardware-only facts such as speaker output or a vendor-specific
software keyboard remain outside that claim.

## Blocking automated gates

The Playwright suite lives at:

```text
apps/studio-react/browser-acceptance/
  playwright.config.ts
  r10-browser-acceptance.pw.ts
```

It runs in the `React Studio Replatform` workflow and is required to pass with
the rest of the React gate.

| Gate | Automated evidence |
| --- | --- |
| `editor.ime` | Chromium composition events -> commit -> Undo -> Redo, asserting one coherent transaction |
| `perform.metronome` | Real browser `AudioContext` transport start/stop after tempo-scale change; deterministic timing semantics remain covered by Shared Core/React tests |
| `mobile.navigation` | Touch/mobile browser emulation switches product surfaces and Library while preserving editor state |
| `mobile.swap` | Touch/mobile editor -> Results -> editor swap preserves the exact selection range; safe insertion remains guarded by the existing selection-proof contract |
| `mobile.keyboard` | Mobile viewport contraction propagates through `visualViewport` into the shell's authoritative viewport CSS state while editor focus is retained |
| `mobile.touch` | Primary mobile controls are measured in-browser at >= 44 CSS px and exercised with `tap()` |
| `mobile.no-hover` | Mobile context asserts `hover: hover` is false / coarse pointer is true and completes primary Library/Perform/Write actions by tap only |

## Accepted evidence

The first green blocking run is:

```text
React Studio Replatform workflow: 36132861083
tested head: f986c6bd4f9424ba2202a05b45cd6f60ae3955a5
Playwright: 7 passed / 0 failed
cross-project skips: 7
React Vitest: 104 passed
```

Desktop Chromium executed `editor.ime` and `perform.metronome`. Mobile Chromium
with the iPhone 13 touch/mobile profile executed the five mobile gates. The seven
skips are the deliberately inapplicable mirror cases from the other project, not
unexecuted behavior gates.

The same head passed RhymeLab CI, Security Gates and CodeQL.

## Hardware smoke evidence

Physical-device checks may still be recorded when useful. They are intentionally
classified separately:

- audible speaker output;
- vendor/OS IME quirks;
- Gboard/Samsung Keyboard/iOS software-keyboard behavior;
- device-specific safe-area or WebKit defects.

A physical smoke failure is still a product bug and should be fixed. The
difference is that absence of a manual smoke report does not by itself keep
obsolete rollback UI alive indefinitely.

## CI execution

The React workflow installs Playwright only for the verification job. Playwright
is not a shipping dependency and does not enter the product bundle.

The CI sequence is:

```text
locked React dependencies
-> typecheck
-> Vitest
-> build
-> React source/parity gates
-> temporary Playwright test dependency
-> Chromium browser install
-> R10 automated browser acceptance
```

The browser suite starts the React Vite dev surface on loopback and tests the
actual React application.

## Legacy Exit trigger

R10 destructive Legacy Exit may proceed when:

1. repository/source tests are green;
2. React typecheck/Vitest/build/parity/boundary checks are green;
3. R10 automated browser acceptance is green;
4. no known material hardware smoke regression is open.

No manual seven-checkbox ceremony is required.
