# React Studio UX correction checkpoint

Status: **OWNER UX ROUND 7 IMPLEMENTED / VISUAL ACCEPTANCE REQUIRED**

This contract records the owner-driven UX correction passes on top of the completed
R7 source port. It does not waive browser/device acceptance and it does not promote
any parity row to `verified`.

Functional Round-2 checkpoint: `9812a674669c`.
Latest owner-UX checkpoint before this documentation update: `4fbd745be258`.

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

- [x] Add distraction-free Focus mode for Write with `Ctrl/Cmd + Shift + F`; `Escape` exits.
- [x] Focus mode removes shell, Studio mode chrome, assistant search, editor controls and gutters so only the lyric canvas remains.
- [x] Remove Bar Navigator / Jump & structure.
- [x] Keep Revision History.
- [x] Direct Bar-number drag remains the reorder affordance.
- [x] Drag can activate from a clear drag gesture rather than requiring a perfectly still hold.
- [x] Drop preview is an insertion boundary **between** lines rather than a highlighted target row.
- [x] Drag ghost and auto-scroll remain visible/active.
- [x] Bar-number and syllable gutters follow measured editor line heights.
- [x] Replace Local Font Access with a permission-free curated Google Fonts browser.
- [x] Curate exactly 50 families across 10 useful style groups.
- [x] Rhyme Bureau editor default is **Oranienbaum**.
- [x] Search/category browsing is virtualized.
- [x] Fonts are loaded on demand; the app does not request all 50 families at startup.
- [x] Existing legacy/system font preferences migrate safely to the curated default.
- [x] The selected editor font continues through the existing persisted workspace preference.
- [ ] Owner drag/drop acceptance with mouse and touch hardware.
- [ ] Owner visual acceptance of wrapped-line/gutter alignment and the Google Fonts picker.
- [ ] Offline/fallback behavior should be observed once on the target packaged-app path.

## Sound Explorer

- [x] Studio can explicitly pause rhyme search; pausing cancels Writer activity instead of merely hiding results.
- [x] Collapsing Sound Explorer to the right rail unmounts/cancels its search workload.
- [x] Focus mode mounts **no** Studio search experience and therefore issues no Writer requests.
- [x] Studio runtime choice is a compact **Lite / Standard / Full** dropdown; unavailable editions stay disabled.
- [x] Selection-follow search changes are paced before Writer execution to avoid request storms.
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

- [x] Remove the permanent folder-tree pane; Library now browses one directory at a time.
- [x] Explorer bar provides root breadcrumbs plus one-level-up navigation.
- [x] Root-level texts survive DocumentStore migration/reload rather than being coerced into Entwürfe.
- [x] Right-click menus support open, rename, move, cut, copy, paste, trash/delete and folder creation where applicable.
- [x] Keyboard Explorer semantics include Enter, F2, Ctrl/Cmd+C, Ctrl/Cmd+X, Ctrl/Cmd+V and Alt+Up.
- [x] Folder copy/paste recursively duplicates the folder subtree and its live documents with collision-safe names.
- [x] Folder cut/paste moves the subtree while rejecting cycles/collisions.
- [x] Sorting uses a native, deterministic selector backed by tested title/created/bars/updated order.
- [x] Backup & Recovery moved out of the permanent folder chrome into an explicit dialog.
- [x] User-facing Library persistence status says Auto-Save / saved / error instead of exposing IndexedDB authority jargon.
- [x] Library remains a Studio-owned workspace dialog rather than a primary route.
- [x] Folder add/rename/move/delete controls use explicit SVG icons instead of micro glyphs.
- [x] Folder action hit targets are at least 38 px in the React Library UI.
- [ ] Owner visual acceptance for deep/nested folder structures.

## Writer request pacing

- [x] Browser search state is paced (Studio assistant: 220 ms; full Search: 160 ms) and stale/inactive Writer requests are cancelled.
- [x] Window-focus/reconnect does not silently refire Writer searches.
- [x] Server `/api/writer` uses a bounded token bucket per direct socket address.
- [x] Default server envelope is burst **16**, refill **8 requests/s**, configurable by internal environment variables.
- [x] Rate exhaustion returns HTTP 429 with `Retry-After` and rate-limit headers.
- [x] Token-bucket burst, recovery delay and independent-client behavior are covered by regression tests.
- [ ] Reverse-proxy identity/trust policy belongs to the dedicated security pass; forwarded client headers are intentionally not trusted here.

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

- [x] Perform supports the same Focus shortcut, reducing the surface to booth context + essential transport.
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
- [x] Style creation is reduced to **+LIGHT / +DARK / +WILD** plus one **Surprise Me** action.
- [x] Wild styles use the same perceptual color-generation math with deliberately higher chroma while retaining contrast gates.
- [x] User-facing style UI does not expose color-space implementation jargon.
- [x] Built-in Light/Dark remain immutable and can be restored with explicit reset actions; resetting a default never creates a custom copy.
- [x] Random styles use mode-aware lightness/chroma relationships and sRGB gamut mapping.
- [x] Existing Studio preference storage remains the persistence authority; no second settings store is introduced.
- [ ] Owner visual acceptance and random-style quality acceptance.


## Product brand

- [x] User-facing React Studio brand is **RHYME BUREAU**.
- [x] Primary brand line is **Phonetic License to Slay.**
- [x] Logo navigation opens the branded intro/splash surface.
- [x] React document title, shell, Search accessibility label, font copy and Style preview use the new product brand.
- [x] Technical compatibility identifiers (repository/package names, storage keys, DB schemas, events and `data-rhymelab-*` contracts) remain unchanged.

## Unknown-query pronunciation

- [x] Client resolver policy advanced to `client-total-query-pronunciation-v4`.
- [x] Long OOV compounds probe the source-backed **right edge first**, then decompose the prefix where possible.
- [x] Mixed source/generated compounds keep the known final lexical component as the rhyme anchor.
- [x] Long fully generated OOV tokens use a bounded right-edge stress anchor instead of making the entire token one rhyme domain.
- [x] `GROWTHHORMONPRODUCER` is covered in both DE and EN regression tests.
- [x] Resolver-policy bump invalidates stale generated-pronunciation cache entries.

## Deferred search axis — Klangposition Anfang / Ende

This is intentionally documented for a later search-runtime phase rather than being
folded into the current rhyme-type filters.

- [ ] Add a first-class **Klangposition** control: **Ende** / **Anfang**.
- [ ] **Ende** remains the current canonical rhyme-domain search.
- [ ] **Anfang** targets onset / initial-sound similarity for cases such as
      `Resolve / Refrain / Recovery` or `Alter / Altbau / Allgemein`.
- [ ] Do not overload Perfect / Slant / Assonance / Consonance with initial-sound
      semantics; this is an orthogonal search axis.
- [ ] Reuse existing pronunciation/source data; no new lexical source corpus is
      required.
- [ ] Extend Serving/Runtime materialization with dedicated left-edge keys
      (for example onset prefix / initial syllable families) and rebuild
      Lite / Standard / Full runtime artifacts.
- [ ] Keep retrieval indexed. Do not implement the production feature as a broad
      per-query scan over all pronunciations.
- [ ] Document the new axis in the in-product Search Guide when it ships.

## Automated checkpoint

On `9812a674669c`:

- strict TypeScript: PASS
- React tests: **91 / 91 PASS**
- production Vite build: PASS
- reversible preview contract: PASS
- R7 source gate: PASS
- parity source rows: 93 / 93 ported
- React Studio Replatform #288: PASS
- Studio V2 Gate #606: PASS
- RhymeLab CI #1471 including public-readiness: PASS
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
