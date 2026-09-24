# Studio V2 real-device acceptance

Studio V2 implementation parity is source-complete and the automated source/test gate passes. The owner authorized the reversible default-route cutover on 2026-09-21. Seven real-device checks still cannot be honestly certified from source inspection alone and remain required release acceptance evidence.

## React replatform carry-forward

These seven gates are **not superseded** by the React migration. They remain
mandatory behavioral evidence for the new implementation. A React component test,
source assertion or desktop-only browser test cannot substitute for the physical
IME, Web Audio, mobile viewport, touch-target and no-hover checks below.

The current Studio V2 is the baseline implementation. The React cutover may only
reuse an acceptance result when the tested behavior and environment still apply;
otherwise the relevant gate must be rerun against the React surface.

## Live route and rollback

Normal `npm run dev` / `npm start` now serves Studio V2 at `/`.

To temporarily restore the previous Search as the root route for rollback/diagnosis:

~~~bash
npm run dev:search-default
~~~

The previous surfaces remain reachable regardless of the root mode:

~~~text
/search       previous Search
/legacy       previous Search alias
/pad          current RhymePad
/pad-legacy   explicit RhymePad legacy alias
/studio       Studio 02
~~~

The direct `/studio` route remains available in both modes.

## Automated gate

Run the source-only gate first:

~~~bash
npm run studio:v2:cutover:code
~~~

It checks the source-backed parity manifest, mapped evidence, startup controls, critical Studio module routes, persistence/analysis/Perform milestones, regression-suite presence and reversible route wiring.

## Seven real-device gates

Open **Studio → Settings → Real Device Acceptance** on the actual target browser/device. Studio never marks these checks passed automatically.

1. **IME composition input** — compose text with an IME, commit it, Undo once, Redo once, and verify the composed edit behaves as one transaction.
2. **Web Audio metronome** — start/stop playback, change BPM, feel and tempo scale, and verify audible timing follows the current grid.
3. **Mobile bottom navigation** — switch Studio, Results, Library and Saved without losing the active Bar or insertion context.
4. **Single-surface editor/results swap** — open Results from a selected range, insert a result, and verify return to the exact saved target.
5. **Software-keyboard viewport** — edit Bars near the bottom and verify the focused Bar remains reachable above the keyboard.
6. **Primary touch targets** — operate primary controls by touch and verify there are no clipped rails or impractically small targets.
7. **No hover-only primary action** — use Quickstyles, Library actions, result actions and Perform controls with touch only.

Add a short device/browser note where useful. Each passed gate stores the environment used for that check. Reports from multiple browsers/devices can be imported into **Settings → Real Device Acceptance** and merged without overwriting already-passed complementary gates.

## Final gate

Save the exported JSON as:

~~~text
reports/studio-v2-device-acceptance.json
~~~

or pass one or more reports explicitly:

~~~bash
npm run studio:v2:cutover:check -- \
  --device-report /path/to/desktop-acceptance.json \
  --device-report /path/to/mobile-acceptance.json
~~~

The checker merges complementary evidence by gate. The full gate succeeds only when both source parity and all seven explicit real-device gates pass.

The acceptance file contains environment metadata and pass/fail notes only. It does not contain lyric documents, search history, or recovery snapshots.

## Release acceptance

The default-route cutover is active and reversible. Complete the seven real-device gates as post-cutover acceptance evidence before declaring browser/touch/audio acceptance complete. Any material device failure should be fixed on Studio V2 or temporarily mitigated with `npm run dev:search-default`.

The previous Search and RhymePad routes remain available throughout this acceptance period.
