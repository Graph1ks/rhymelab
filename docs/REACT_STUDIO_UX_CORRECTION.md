# React Studio UX correction checkpoint

Status: **ROUND 2 IMPLEMENTED / OWNER VISUAL ACCEPTANCE REQUIRED**

This contract records the owner-driven UX correction passes on top of the completed
R7 source port. It does not waive browser/device acceptance and it does not promote
any parity row to `verified`.

Functional Round-2 checkpoint: `b2d16a4ed27e`.

## Shell and navigation

- [x] Retire the desktop sidebar.
- [x] Retire the separate mobile bottom-navigation/settings-drawer shell.
- [x] Use one persistent sticky Topbar on desktop and mobile.
- [x] Keep Studio and Search as primary destinations.
- [x] Put Commands and Settings in the same Topbar hierarchy.
- [x] Keep UI language and quick Light/Dark styles at the right edge.
- [x] Library belongs to Studio and opens in context.
- [x] Saved/Merkliste belongs to Search and opens in context.
- [x] Commands no longer has a duplicate Topbar trigger/icon.
- [x] Commands includes a real Windows/macOS shortcut reference.
- [x] Global app shortcuts do not intercept active text-entry fields.
- [ ] Owner desktop/mobile visual acceptance.

## Typography and framing

- [x] Remove micro-sized primary UI typography.
- [x] Raise metadata, controls and badges to a readable floor.
- [x] Reduce card-within-card/shadow-heavy framing on Studio, Search and Library.
- [ ] Owner visual acceptance at representative 1080p/4K/mobile viewports.

## Studio editor

- [x] Remove Bar Navigator / Jump & structure.
- [x] Keep Revision History.
- [x] Direct Bar-number drag remains the reorder affordance.
- [x] Drag can activate from a clear drag gesture rather than requiring a perfectly still hold.
- [x] Drop preview is an insertion boundary **between** lines rather than a highlighted target row.
- [x] Drag ghost and auto-scroll remain visible/active.
- [x] Bar-number and syllable gutters follow measured editor line heights.
- [x] Replace Local Font Access with a permission-free curated Google Fonts browser.
- [x] Curate exactly 50 families across 10 useful style groups.
- [x] RhymeLab editor default is **Oranienbaum**.
- [x] Search/category browsing is virtualized.
- [x] Fonts are loaded on demand; the app does not request all 50 families at startup.
- [x] Existing legacy/system font preferences migrate safely to the curated default.
- [x] The selected editor font continues through the existing persisted workspace preference.
- [ ] Owner drag/drop acceptance with mouse and touch hardware.
- [ ] Owner visual acceptance of wrapped-line/gutter alignment and the Google Fonts picker.
- [ ] Offline/fallback behavior should be observed once on the target packaged-app path.

## Sound Explorer

- [x] Compact is the only result density; no density picker is shown.
- [x] Remove horizontal toolbar scrolling.
- [x] Filters are collapsed by default.
- [x] Filter deck closes when the mouse leaves it.
- [x] Portaled filter option popups and their owning deck dismiss together.
- [x] Filter UI collapses when result scrolling resumes.
- [x] Result detail opens only after a real result selection.
- [x] Open result detail auto-closes when result scrolling resumes.
- [x] Remove opt-in Auto-scroll; continuous/infinite loading remains.
- [x] Keep Filter + Merkliste without wasting result height.
- [ ] Owner density/viewport acceptance.

## Full Rhyme Search

- [x] Remove the tile/Feld result layout from the user-facing density selector.
- [x] Migrate a stored tile preference to Compact.
- [x] Keep only List and Compact for the full Search page.
- [x] Filters are transient and dismiss on leave/scroll.
- [x] Rhyme/Sound, syllable, sorting, pronunciation and corpus options use styled transient popovers.
- [x] Option rows stay single-line where a single-line label is intended.
- [x] Language route remains the compact 3 × 3 query/result matrix rather than a long dropdown.
- [x] Permanent empty result-detail column remains removed.
- [x] Saved/Merkliste remains Search-owned.
- [ ] Owner desktop/mobile acceptance.

## Library

- [x] Library remains a Studio-owned workspace dialog rather than a primary route.
- [x] Folder add/rename/move/delete controls use explicit SVG icons instead of micro glyphs.
- [x] Folder action hit targets are at least 38 px in the React Library UI.
- [ ] Owner visual acceptance for deep/nested folder structures.

## Analysis

### End-rhyme / canonical view

- [x] Analysis owns the full Studio canvas.
- [x] Rhyme relation types retain distinct semantic colors.
- [x] Rhyme-scheme groups retain stable group colors.
- [x] Explicit rhyme-type legend remains visible.

### All Rhymes / Rhyme Topology

The Round-2 design follows the linked-view principles found in rhyme-visualization
research rather than rendering only a cloud of matching tokens.

- [x] Preserve the complete lyric text in the All Rhymes view.
- [x] Split the lyric map into four-Bar reading blocks to reduce overload.
- [x] Build connected primary rhyme chains from canonical occurrence relations.
- [x] Assign stable chain IDs (A, B, C...) and consistent chain colors.
- [x] Keep rhyme **group** and rhyme **type** as separate visual encodings.
- [x] Chain color identifies which words belong together.
- [x] The token underline identifies the strongest canonical relation type.
- [x] Hovering a grouped rhyme highlights/dims the linked occurrences across the lyric.
- [x] A linked Chain Index summarizes words, Bars and relation count.
- [x] Primary-focus mode can suppress soft-only visual noise.
- [x] Soft relations remain visible without incorrectly merging primary chains.
- [ ] Owner content acceptance on long, rhyme-dense real songs.

## Perform / booth workflow

- [x] Perform owns the full Studio canvas.
- [x] Booth/rehearsal view remains primary over the cue-grid editor.
- [x] Previous/current/next Bar context.
- [x] 0/1/2-Bar count-in.
- [x] Loop current Bar / Auto next Bar.
- [x] Existing Web Audio/performance-session semantics remain authoritative.
- [x] Cue editor remains secondary tooling.
- [x] Perform selects use styled Base UI pickers.
- [ ] Owner booth-usefulness acceptance.
- [ ] Physical Web Audio acceptance.

## Settings / Style Designer

Settings is intentionally narrow now. It does **not** duplicate controls already
owned by the Topbar and it does not expose engineering acceptance tooling.

- [x] Remove duplicate Language settings.
- [x] Remove duplicate Commands settings.
- [x] Remove visible Diagnostics / real-device acceptance UI from Settings.
- [x] Keep Data Safety / backup-recovery.
- [x] Add a full Style Designer.
- [x] Multiple custom styles can be saved.
- [x] Custom styles can be applied immediately.
- [x] A custom Light style and custom Dark style can be assigned as defaults.
- [x] Custom styles can be deleted with an explicit two-click delete action.
- [x] Seven semantic source colors are editable: bg, panel, ink, muted, accent, accent2, signal.
- [x] Derived line/nav/tint/onAccent colors remain automatic.
- [x] Live mini-app preview shows the palette in hierarchy rather than isolated swatches.
- [x] Contrast report shows text/background, text/surface and accent-text ratios.
- [x] Random styles are generated in OKLCH with mode-aware lightness/chroma relationships and sRGB gamut mapping.
- [x] Existing Studio preference storage remains the persistence authority; no second settings store is introduced.
- [ ] Owner visual acceptance and random-style quality acceptance.

## Automated checkpoint

On `b2d16a4ed27e`:

- strict TypeScript: PASS
- React tests: **91 / 91 PASS**
- production Vite build: PASS
- reversible preview contract: PASS
- R7 source gate: PASS
- parity source rows: 93 / 93 ported
- React Studio Replatform #278: PASS
- Studio V2 Gate #596: PASS
- RhymeLab CI #1461 including public-readiness: PASS
- shipping `src/studio/*` modified by this UX round: **0 files**
- React legacy bridge modified by this UX round: **0 files**
- backend/runtime modified by this UX round: **0 files**

## Still not automatically accepted

The following still require observation rather than source-code assertions:

- IME composition behavior;
- audible Web Audio timing;
- software-keyboard / VisualViewport behavior;
- physical touch targets and no-hover operation;
- responsive layout on owner target displays;
- Google Fonts behavior in packaged/offline targets;
- long-song Rhyme Topology readability;
- actual booth usefulness.

Device acceptance remains available as external/manual cutover evidence; it is no
longer an end-user Settings surface.

R8 route cutover remains blocked until the required parity/browser/device evidence is
complete and the parity matrix reaches 93/93 `verified`.


## Research basis for the All Rhymes view

The Round-2 All Rhymes design follows the stronger pattern seen in modern rhyme
visualization work rather than treating every rhyme as an isolated colored badge:

- RapViz (Müller, Panzer & Beck, VISIGRAPP 2025, DOI 10.5220/0013190700003912)
  uses readable lyrics enriched with rhyme-group color plus linked structural views.
- RapViz specifically combines color encoding for rhyme groups with structural
  connections for end-rhyme schemes and a second temporal perspective for internal
  rhyme patterns.
- The Hamilton Algorithm visualization work likewise uses color-coded annotated
  lyrics plus an abstract structural diagram derived from phonetic syllable matches.
- Earlier rap-rhyme work by Hirjee & Brown explicitly models internal and imperfect
  rhyme rather than limiting analysis to line-final perfect rhyme.

RhymeLab therefore keeps the lyric itself primary, encodes connected rhyme chains
with stable group color, encodes relation class separately through underline/type
color, and lets the user isolate one chain across the text. This avoids the previous
failure mode where every rhyme was simply highlighted with the same visual treatment.
