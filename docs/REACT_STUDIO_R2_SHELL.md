# React Studio R2 — shell and design-system foundation

Status: **IMPLEMENTED / AUTOMATED VERIFIED / REAL-DEVICE ACCEPTANCE DEFERRED**  
Parent plan: `docs/REACT_STUDIO_REPLATFORM.md`  
R1 boundary: `docs/REACT_STUDIO_R1_TYPED_BRIDGE.md`  
Machine-readable inventory: `apps/studio-react/r2-shell-manifest.json`

## Purpose

R2 replaces the temporary migration dashboard with the actual React application
shell while preserving the migration boundary established in R1.

R2 owns presentation infrastructure only:

- application chrome;
- semantic design tokens;
- responsive layout geometry;
- navigation state;
- appearance state;
- command-palette shell;
- focus/overlay behavior;
- mobile viewport wiring.

R2 does **not** own Writer results, document state, editor semantics, Library data,
analysis, Perform state or persistence authority.

## Implemented structure

```text
apps/studio-react/src/
  app/
    App.tsx
  design-system/
    primitives.ts
    theme.ts
  legacy/
    shell.ts
  shell/
    Shell.tsx
    Shell.module.css
    CommandPalette.tsx
    ThemeControls.tsx
    SettingsPanel.tsx
    SurfaceContent.tsx
    icons.tsx
    navigation.ts
    r2-shell.test.ts
  state/
    uiStore.ts
  styles/
    tokens.css
```

The old temporary migration-dashboard stylesheet was removed after the shell became
the actual React root content.

## Design-system contract

### Semantic tokens

Components consume `--rl-*` semantic variables rather than hard-coded product
colors:

- background;
- panel/surface;
- foreground text;
- muted text;
- borders;
- primary/secondary accent;
- signal/status;
- navigation;
- tint;
- readable on-accent foreground.

Spacing, radii, shadows, focus rings, timings and shell geometry are also tokenized.

### Existing Light/Dark behavior

The React theme layer preserves the current Studio built-in palettes:

```text
Light
  bg       #EAE7DC
  panel    #F4F0E6
  ink      #272727
  accent   #E85A4F
  accent2  #E98074

Dark
  bg       #272727
  panel    #303030
  ink      #F5F4EC
  accent   #FFE400
  accent2  #FF652F
```

The one-click Light/Dark action resolves the active theme first and then changes to
the opposite configured slot, matching the existing Studio concept.

Existing `themeSlots.light`, `themeSlots.dark` and `customThemes` preferences are
read from the current Studio preference store. A custom theme assigned to a Light or
Dark slot therefore replaces that slot in the React shell without introducing a new
persistence format.

R2 consumes and applies existing saved custom themes. The full create/edit/delete
theme-builder UI is intentionally not claimed complete yet; the broader
`editor.theme` parity row remains `in_progress`.

## Base UI boundary

`design-system/primitives.ts` establishes the approved Base UI primitive families:

- Button;
- Dialog;
- Drawer;
- Menu;
- Popover;
- Select;
- Tooltip.

R2 already uses:

- Dialog for the command palette;
- Drawer for mobile More/settings;
- Popover for Quickstyles;
- Select for the settings language selector;
- Button for shell actions.

Menu and Tooltip are available through the same design-system boundary for later
feature surfaces instead of importing Base UI ad hoc throughout R3–R6.

## Navigation

The canonical product destinations remain:

```text
Studio
Rhyme search
My texts
Saved
```

Settings remains a secondary navigation destination rather than replacing a primary
product destination.

Desktop uses the sidebar. Mobile uses the bottom navigation with an explicit More
action for appearance/settings.

The React shell does not invent alternate Writer, Library or editor state for these
destinations. Until their migration phases land, the target areas render explicit
migration placeholders rather than fake functionality.

## Responsive geometry

R2 keeps the existing Studio breakpoint intent:

| Range | Shell behavior |
| --- | --- |
| > 1150 px | full 184 px desktop sidebar |
| <= 1150 px | 72 px navigation rail |
| <= 800 px | sidebar removed, mobile bottom navigation, single-column active surface |
| <= 560 px | compact topbar/header treatment |

The canonical mobile breakpoint is shared with the existing
`src/studio/mobile-viewport.mjs` value of **800 CSS px**.

The shell installs the existing VisualViewport controller directly. This keeps
`--visual-viewport-height` and the mobile-keyboard signal available without
reimplementing keyboard heuristics.

Actual software-keyboard acceptance on the future React editor remains a real-device
gate and is not claimed by R2.

## Scroll ownership

The app root is fixed to the current visual viewport and does not page-scroll.

Normal product surfaces use one active scroll owner:

```text
fixed app shell
  sidebar / topbar
  contentViewport  <-- normal active-surface scroll owner
  mobile nav
```

Dialog/Drawer popup contents may own their bounded overlay scroll while open. R2
does not create nested editor/result scroll regions before those actual feature
surfaces are ported.

## DE / EN UI

The R2 shell directly reuses:

- `normalizeStudioUiLanguage()`;
- `translateStudioUiText()`.

The same existing Studio preferences key persists the interface language. React does
not introduce a second language preference.

The topbar retains a one-click DE/EN switch. Settings exposes the same state through
a Base UI Select.

## Command palette

The React command palette directly reuses the existing normalization/ranking
functions from `src/studio/command-palette.mjs`.

R2 commands cover only currently meaningful shell actions:

- Studio;
- Search;
- Library;
- Saved;
- Settings;
- Light/Dark;
- DE/EN.

Commands whose underlying feature surfaces are not ported are not faked. Additional
Writer/editor/Library/Perform commands join the same registry in their migration
phases.

Global `Ctrl/Command + K`, arrow selection, Enter execution and Escape dismissal
are implemented. The palette explicitly restores focus to the previously focused
control when closed.

## Motion

Motion remains restrained:

- shell/surface entrance only;
- popup/drawer transitions;
- small navigation feedback;
- no decorative motion that changes interaction semantics.

Both Motion's reduced-motion hook and the global
`prefers-reduced-motion: reduce` CSS guard are active.

## Mobile / touch

R2 establishes:

- bottom navigation;
- explicit touch Quickstyles trigger;
- mobile More/settings Drawer;
- >=44 CSS px primary mobile targets;
- safe-area padding;
- VisualViewport shell height integration.

The following are deliberately **not** marked cutover-verified:

- mobile navigation real-device behavior;
- software-keyboard editor reachability;
- full product touch-target matrix;
- no-hover behavior across later Library/Search/Perform surfaces.

Those remain part of the existing seven-gate device acceptance matrix.

## R2 automated verification

`apps/studio-react/src/shell/r2-shell.test.ts` verifies:

1. i18n, command and viewport functions are identity re-exports of the current
   implementation;
2. the canonical 800 px mobile and 1150 px rail boundaries;
3. exact built-in Light/Dark palette baselines;
4. existing custom Light/Dark slot replacement;
5. semantic CSS-variable application only;
6. real Zustand shell action state transitions for navigation, language, theme,
   command palette, Quickstyles and mobile settings;
7. product navigation vocabulary;
8. accepted command ranking;
9. availability of all required Base UI primitive families.

The dedicated React CI additionally requires:

- parity inventory check;
- locked install;
- strict TypeScript;
- all Vitest tests including R1 and R2;
- production Vite build.

Focused local verification:

```bash
npm run studio:react:r2
```

## R2 parity status policy

R2-related rows are moved to `ported` or `in_progress`, not `verified`.

That is intentional. Automated implementation evidence is not substituted for the
later browser/device acceptance required by the cutover contract.

No R2 change reduces the **93/93 VERIFIED** requirement.

## R2 exit

- [x] real React app shell replaces the temporary migration dashboard;
- [x] semantic design tokens established;
- [x] full desktop sidebar established;
- [x] compact desktop navigation rail established;
- [x] mobile bottom navigation established;
- [x] topbar established;
- [x] existing Light/Dark slots preserved;
- [x] existing saved custom theme slots consumed;
- [x] DE/EN shell state preserved through the existing preference store;
- [x] ranked command palette implemented from the existing matcher;
- [x] Base UI primitive boundary established;
- [x] command/drawer focus restoration implemented;
- [x] reduced-motion handling implemented;
- [x] canonical 1150/800/560 responsive geometry implemented;
- [x] single normal content-scroll ownership established;
- [x] existing VisualViewport controller wired;
- [x] strict TypeScript/tests/production build pass;
- [x] no R1/domain implementation changed.

Next phase: **R3 — Search / Writer**.
