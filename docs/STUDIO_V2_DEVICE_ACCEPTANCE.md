# Studio 02 real-device acceptance

Studio 02 implementation parity is source-complete. The final default-route cutover remains gated by seven checks that cannot be honestly certified from source inspection alone.

## Preview the cutover safely

Run:

~~~bash
npm run dev:studio-default
~~~

This serves Studio 02 at `/` while keeping the previous surfaces reachable:

~~~text
/search       previous Search
/legacy       previous Search alias
/pad          current RhymePad
/pad-legacy   explicit RhymePad legacy alias
/studio       Studio 02
~~~

The normal `npm run dev` behavior remains unchanged until the cutover gate is accepted.

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

Add a short device/browser note where useful. When all seven are checked, export **Acceptance JSON**.

## Final gate

Save the exported JSON as:

~~~text
reports/studio-v2-device-acceptance.json
~~~

or pass another path explicitly:

~~~bash
npm run studio:v2:cutover:check -- --device-report /path/to/rhymelab-studio-device-acceptance-....json
~~~

The full gate succeeds only when both source parity and all seven explicit real-device gates pass.

The acceptance file contains environment metadata and pass/fail notes only. It does not contain lyric documents, search history, or recovery snapshots.

## Cutover

After the full gate passes, the reversible route mode can be promoted from preview to the default server behavior in the dedicated cutover commit. The previous Search and RhymePad routes remain available during the first production switch.
