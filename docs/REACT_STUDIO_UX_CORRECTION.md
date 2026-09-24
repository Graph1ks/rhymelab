# React Studio UX correction checkpoint

Status: **IMPLEMENTED / OWNER VISUAL ACCEPTANCE REQUIRED**

This checkpoint captures the owner-requested UX correction round after the first R7
real-browser preview. It supplements the behavior-preserving R7 parity contract; it
does not waive any browser/device acceptance gate.

## Global

- [x] Remove unreadable micro typography from the primary React Studio surfaces.
- [x] Raise badges/metadata/control typography to a readable UI floor.
- [x] Reduce card-within-card framing and shadows on Studio/Search/Library.
- [ ] Owner visual acceptance at desktop and mobile sizes.

## Studio / editor

- [x] Remove the Bar Navigator / "Jump & structure" dock.
- [x] Keep revision history as the only editor dock.
- [x] Restore direct Bar-number drag with visible drag ghost and drop preview.
- [x] Allow clear drag intent to activate reorder without requiring a perfectly still hold.
- [x] Align Bar-number and syllable gutters against measured editor line heights.
- [x] Replace the three-font preset with a searchable local-system-font picker.
- [x] Query local fonts only after explicit picker interaction.
- [x] Virtualize font results so thousands of faces do not create thousands of DOM rows.
- [x] Preserve selected face style/weight (for example SemiBold Italic), not only family.
- [x] Release the large local-font metadata list after the picker closes.
- [ ] Owner visual acceptance of wrapped-line/gutter alignment.
- [ ] Owner drag/drop acceptance with mouse and touch/pointer hardware.
- [ ] Verify Local Font Access behavior in the owner's target Chromium/Brave environment.

## Sound Explorer

- [x] Filters are collapsed by default and exposed through a Filter button.
- [x] Remove opt-in Auto-scroll; continuous/infinite loading remains.
- [x] Remove permanent empty result-detail placeholder.
- [x] Open result detail only after an actual result selection.
- [x] Compress assistant header/runtime/anchor chrome.
- [x] Reclaim the assistant height for the result list.
- [x] Keep result metadata readable rather than micro-sized.
- [x] Saved results open as an in-context dialog.
- [ ] Owner density/viewport acceptance.

## Rhyme search

- [x] Filters are collapsed by default.
- [x] Remove Auto-scroll control; continuous result loading remains.
- [x] Make the result list the dominant page surface.
- [x] Remove permanent empty result-detail column.
- [x] Saved/Merkliste is owned by Search instead of primary navigation.
- [x] Replace the long language-route dropdown with a compact 3 × 3 query/result matrix.
- [x] Constrain and style remaining filter popovers.
- [ ] Owner desktop/mobile acceptance.

## Library / Saved / navigation

- [x] Remove "My texts" from primary navigation.
- [x] Add Library as a Studio action opening an in-context dialog.
- [x] Remove Saved/Merkliste from primary navigation.
- [x] Add Saved/Merkliste inside Search as an in-context dialog.
- [x] Add Commands to primary navigation.
- [x] Remove the duplicate Commands trigger from the top bar.
- [x] Close workflow dialogs on primary navigation so hidden overlays cannot reopen later.
- [x] Replace Alt+1 / Alt+2 global navigation shortcuts.
- [x] Use Ctrl/Cmd + Shift + K for Commands and ignore global app shortcuts while the user is editing text.
- [ ] Owner keyboard workflow acceptance on Windows and macOS.

## Analysis

- [x] Give Analysis the full Studio canvas; hide Sound Explorer outside Write mode.
- [x] Move the main Analysis card flow to one column to stop horizontal squeezing.
- [x] Prevent scheme columns from pushing outside card bounds.
- [x] Give each rhyme relation type a stable, distinct color.
- [x] Give each rhyme-scheme group a stable group color so matching groups are visually traceable.
- [x] Add an explicit rhyme-type legend.
- [ ] Owner visual/content acceptance with representative long songs.

## Perform / booth workflow

- [x] Give Perform the full Studio canvas.
- [x] Promote a booth/rehearsal view over the cue grid.
- [x] Show previous / current / next Bar with a large current lyric.
- [x] Add 0 / 1 / 2 Bar count-in.
- [x] Add Loop-current-Bar and Auto-next-Bar flow modes.
- [x] Keep Web Audio metronome timing on the existing performance-session model.
- [x] Keep stable-Bar-ID cues and existing cue semantics.
- [x] Keep cue mapping available as a secondary editing tool.
- [x] Replace native Perform selects with styled Base UI popovers.
- [ ] Owner decides after real booth-style use whether this is sufficient or whether Perform needs a deeper product redesign.
- [ ] Physical Web Audio acceptance remains required.

## Dropdowns / pickers

- [x] Language route: replace long scroll dropdown with a visual matrix.
- [x] Editor fonts: searchable virtualized picker.
- [x] Perform Bar/pause selects: styled Base UI controls.
- [x] Remaining Search/Library/Settings selects stay on the shared styled Base UI layer.
- [ ] Owner visual acceptance.

## Explicitly not auto-closed by this checkpoint

The following still require real observation rather than source-code claims:

- IME behavior;
- Web Audio timing;
- mobile software keyboard / VisualViewport;
- touch targets;
- no-hover workflows;
- exact responsive layout on the owner's target displays;
- visual quality of long-song Analysis;
- actual booth usefulness of Perform.

R8 route cutover remains blocked until required parity/browser/device evidence is
complete.
