# Shared Core Architecture — R9

## Decision

RhymeLab's React Studio is the product UI. The old Studio/Search/RhymePad browser implementations are rollback references only and are not architectural dependencies.

R9 extracts the proven non-UI behavior into neutral packages so legacy surfaces can be deleted without losing working product semantics.

## Boundaries

### `packages/shared-core`

Owns framework-independent product behavior:

- typed product contracts
- search state, filtering, result mapping and query-pronunciation logic
- document model and portable backup format
- editor/bar identity, history, performance and revision comparison
- analysis/detail client adapters
- command ranking and translation text helpers

Shared Core must not depend on React, Electron, Node filesystem APIs or legacy UI DOM.

### `packages/platform-web`

Owns browser-specific adapters:

- IndexedDB document persistence
- browser/local-storage document compatibility
- IndexedDB pronunciation cache
- VisualViewport/mobile keyboard integration
- browser diagnostics and device-acceptance environment probes

These are replaceable platform adapters, not domain authority.

### `apps/studio-react/src/core`

Owns the typed React-facing adapter surface. It may compose Shared Core and Platform Web but must not contain duplicated domain implementations.

## Exit rule

Production React source must have **zero imports** from:

- `apps/studio-react/src/legacy`
- `src/studio`
- `src/ui`

The remaining old browser UI is temporary rollback evidence only. After the seven physical acceptance gates pass, the old Studio/Search/RhymePad surfaces and compatibility routes can be removed as one deletion step.

## Preservation rule

Code is retained only when one of these is true:

1. it is the current authoritative domain behavior;
2. it is required for data-format compatibility/migration;
3. it is a platform adapter with a defined future Web/Electron/Mobile replacement;
4. it has parity tests proving behavior that must not regress.

Debug-only, duplicated DOM orchestration and obsolete UI helpers do not graduate into Shared Core.

## Cross-platform target

```text
React Studio
    |
    +-- Shared Core
    |     contracts / search / documents / editor / analysis / performance
    |
    +-- Platform Adapter
          web      -> IndexedDB / LocalStorage / VisualViewport / Web Audio
          desktop  -> Electron IPC / filesystem / OS secrets / Node SQLite
          mobile   -> Capacitor/native storage / native SQLite
```

R9 is complete when React consumes these boundaries directly and the old `legacy/` bridge is gone.
