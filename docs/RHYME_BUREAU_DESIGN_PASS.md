# Rhyme Bureau — Studio design pass

Status: implemented · automated checks passed · browser/owner acceptance pending · 2026-09-24
Branch: `design/rhyme-bureau-studio-pass`
Baseline: `main@0e29e21f8a23` (React merge #205)

## Intent

Restore the character of a carefully art-directed writing application while
preserving every capability in the merged React implementation. The owner has
explicitly authorized this presentation pass. The feature freeze, domain contracts,
93-row parity gate and physical-device acceptance requirements remain in force.

Direction: **a contemporary phonetic bureau**. Warm paper, Bordeaux night mode,
editorial type, precise rules, compact instrument controls and occasional stamped
details. The existing RHYME BUREAU / Phonetic License to Slay identity leads.
Personality belongs around the writing, never over it.

## Audit findings

- React has the correct domain boundaries and controls; keep those components and
  their handlers rather than rebuilding functionality in a visual prototype.
- The CSS contains multiple historical presentation passes. Scope edits by feature;
  do not globally restyle unrelated active controls.
- Components reference `--rl-surface`, `--rl-text`, `--rl-accent-contrast` and
  `--rl-font` without a shared definition. Complete those semantic aliases so
  foregrounds and surfaces behave consistently with every saved palette.
- Primary tools currently share too much visual weight. Separate workspace modes,
  document actions and search utilities through type, rules and surface treatment.
- Intro decoration uses a generic orbit. Replace it with an original typographic
  sound specimen that belongs to the Bureau identity, without pretending to be
  live search data or adding an interactive control.
- Several small accent labels lack comfortable contrast in the warm Light palette.
  Use ink for reading and accent for markers/fills; preserve exact built-in palettes.

## Planned changes, in implementation order

| Area | Intended treatment | Protected behavior |
| --- | --- | --- |
| Tokens | Complete semantic aliases; shared editorial/mono/UI type roles; quieter elevation, consistent radii and focus | Built-in and custom colors, theme slots, saved preferences |
| Topbar | Sharper monogram, stacked wordmark, restrained navigation indicators, same compact height | Home, Studio, Search, Commands, Settings, DE/EN, quick Light/Dark and Quickstyles |
| Studio frame | Clear mode strip and readable utility actions; paper writing plane against a quiet desk; responsive spacing | Write/Analyze/Perform, Library, Focus, search pause and assistant collapse |
| Editor | Editorial document title, calmer toolbar, precise gutter borders and footer | Native textarea, font/size preferences, measured wrapping, Bar IDs, drag/drop, selection proofs, undo/redo, revisions and autosave |
| Search | Strong query typography, disciplined anchor treatment, readable result selection and relation badges | All filters/routes/scopes, runtime editions, compact/list, continuous loading, detail, saved results, safe insertion and request cancellation |
| Library | File-cabinet character through typography, rules and active-document treatment | Directory navigation, context menus, keyboard actions, sorting, moves/copies, Trash and recovery |
| Analysis | Consistent editorial header, flatter metric surfaces, readable panels | Canonical relations, group/type color separation, linked topology, language and relation controls |
| Perform | Strong rehearsal text hierarchy and coherent transport/tool surfaces | Timing, cues, BPM/grid/feel/count-in/loop, review invalidation, Web Audio and Focus |
| Settings | Cohesive style workbench and data-safety surfaces; replace visible migration badge with product copy | Color generation/edit/save/apply/delete, defaults/reset, contrast report, backup/import/recovery |
| Intro | Editorial poster composition and static sound specimen; retain existing copy and navigation actions | All entry points, language variants, reduced motion |
| Responsive | Keep the 800px Editor/Rhymes swap and viewport ownership; wrap controls rather than clip them; coarse-pointer targets | No sidebar return, no new nested page scroll, no hover-only action |
| Page transitions | Full-viewport Bureau transitions below the persistent topbar: case sheet (Home), drafting shutters (Studio), phonetic scan (Search), archive drawer (Library), evidence cards (Saved), calibration grid (Settings) | Surface state, providers, scroll ownership, pointer input, dialogs/popovers and `prefers-reduced-motion` |

## No-capability-loss contract

1. No changes to backend, Serving-v1, ranking, pronunciation, analysis algorithms,
   persistence providers, editor-session logic, search state or R1 legacy bridges.
2. No removal/reparenting of stable controls, handlers, shortcuts, labels, disabled
   states, confirmation steps or accessible names to make screenshots cleaner.
3. Preserve the existing textarea/measurement geometry together. Do not independently
   change line height, padding, font or gutter offsets in the design pass.
4. Preserve result virtualizer sizing and scroll containers. Do not animate result
   row geometry or add decorative overlays that intercept pointer input.
5. Keep DE/EN, Light/Dark, custom themes, reduced motion and visible keyboard focus. Page-transition overlays must be decorative (`aria-hidden`), `pointer-events: none`, remain below the topbar, and disappear entirely for reduced-motion users.
6. Legacy Studio and the default-route/cutover contract remain intact. No parity row
   is promoted to verified merely because the design or automated checks pass.
7. The attached music prompt data is unrelated to this UI pass and is not imported
   into the repository or runtime.

## Verification plan

- `npm run studio:react:verify` (inventory, types, all React tests, production build).
- `npm run studio:react:r7:gate` and reversible-preview tests.
- `npm run check`, `npm test`, `node scripts/public-readiness-audit.mjs`.
- Review the final diff for unchanged handlers/providers/legacy/backend and compare
  JSX interaction attributes against the baseline.
- Browser acceptance: 1920×1080, 3840×2160, 1366×768, 800px, 390px and 320px;
  Light/Dark/custom; Studio/Search/Library/Analysis/Perform/Settings/Intro; keyboard
  focus, transient popovers, continuous results, wrapping/gutters and mobile swap.
- Transition acceptance: topbar remains stationary; all six shell surfaces have distinct motion; rapid navigation cannot strand a curtain; overlays never intercept pointer input; Studio mode/search-assistant state survives leaving and returning to Studio; reduced-motion shows no curtain/body animation.
- Physical IME, touch/software keyboard and audible metronome remain separate gates.

The provided cloud browser rejected the local development URL with
`net::ERR_BLOCKED_BY_CLIENT`. Visual/browser acceptance is therefore pending unless
a supported preview becomes available. Do not present source checks as screenshot
or real-device evidence. Full-data local Writer acceptance also requires the owner's
shipping SQLite distributions, which are not checked into this repository.

## Deliberately excluded

No new search features, onboarding steps, navigation hierarchy, remote fonts/assets,
paid services, dependencies, storage formats, runtime deployment or route cutover.
No change to the owner's selected editor font or saved color palettes.

## Implementation evidence

The plan was committed before implementation. All planned presentation areas have
received the first pass. No new controls, feature dependencies or shipped assets were
introduced. TSX edits remain presentation-scoped: decorative branding/icons, the intro
specimen, Settings product copy and the shell transition wrapper. The transition
wrapper does not key or remount `SurfaceContentBody`; local Studio UI state therefore
survives navigation exactly as before.

| Check | Result |
| --- | --- |
| React parity inventory | 93/93 present; statuses unchanged |
| Strict TypeScript | PASS |
| React Vitest | 103/103 PASS across 8 files |
| Production Vite build | PASS |
| R7 source gate | PASS; still 0/93 browser/device verified |
| Reversible preview tests | 4/4 PASS |
| Repository source check | 470 JavaScript files PASS |
| Repository tests | 690/690 PASS |
| Public-readiness audit | PASS |
| Diff whitespace check | PASS |
| JSX contract comparison | All 65 event/accessibility/control attributes preserved across the three changed UI components; decorative aria-hidden additions excluded |
| Protected paths | No backend, legacy bridge, provider, state-store or parity-inventory changes |
| Semantic CSS references | No undefined --rl-* references remain in React CSS |
| Visual/browser and real-device acceptance | PENDING; local preview inaccessible to supplied cloud browser |
| Full-data Writer exercise | PENDING; owner-local SQLite distributions required |

The page-transition layer was added after the first design pass as a presentation-only shell layer. It does not alter navigation state, editor/search providers or domain code; only the keyed decorative curtain remounts beneath the persistent topbar; the workspace subtree stays mounted and the body animation restarts through a surface-specific CSS animation name.

The AST comparison is a source-preservation check, not runtime interaction evidence.
The existing runtime/domain tests remain intact; no gate or test was weakened.

### Review locally

After checking out this branch with the owner's existing local distributions:

```bash
npm run studio:react:install
npm run studio:react:r7:preview
```

The existing preview command builds React and serves the candidate through the
local runtime. The legacy Studio routes remain available. Review all viewports and
flows in the verification plan before merging; keep the PR in draft until that
geometry/interaction pass is complete.
