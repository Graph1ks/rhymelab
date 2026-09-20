# UI Interaction Contract

Status: active  
Applies to: RhymeLab browser UI and integrated control surfaces

## Purpose

RhymeLab must not treat HTML presence, CSS appearance, JavaScript syntax, or source-pattern assertions as proof that an interactive control works.

A UI control is considered protected only when its event binding and resulting state transition are exercised by runtime regression coverage or by an explicitly documented real-browser acceptance step when simulation is not technically sufficient.

## Incident preserved by this contract

On 2026-09-19, PR #117 introduced an accidental selector-helper typo in three event-binding lines:

    $$$('.ui-lang-option')
    $$$('.basis-option')
    $$$('.scope-option')

The Search form submit handler appeared immediately before those lines and was successfully registered. JavaScript then threw `ReferenceError: $$$ is not defined`.

The resulting product failure was deceptive:

- Search still worked;
- later control handlers were never registered;
- Result Language could still appear synchronized after a search because render/state synchronization code executed through the Search path;
- Query Language, Result Language, Search Scope and other later controls could not be changed;
- bootstrap did not complete;
- syntax checks passed because `$$$` is syntactically valid JavaScript;
- static CSS/source tests also passed.

This exact class of partial-initialization failure must remain covered.

## Required control-binding architecture

The unified UI must:

1. define the complete required single-control and control-group surface;
2. preflight that complete surface before installing handlers;
3. install interactive handlers only after the preflight succeeds;
4. mark successful binding on the root element with:

       data-rhymelab-controls="bound"

5. mark failed initialization with:

       data-rhymelab-controls="failed"

6. show a visible initialization failure message and log the underlying error;
7. never silently leave a partially interactive UI looking healthy.

## Required interaction coverage

At minimum, automated runtime interaction smoke must exercise:

- Query Pronunciation: DE / EN / DE+EN;
- Result Language: DE / EN / DE+EN;
- Search In: All / Words / Phrases / Entities;
- interface language DE / EN;
- result layout List / Compact.

The test must dispatch the real registered event handlers in a simulated DOM and verify the corresponding application state or control value changes.

For a new primary control, the same PR must:

- add it to the required control-surface preflight when its absence would make the UI incomplete;
- add an interaction assertion demonstrating its intended state transition;
- preserve disabled-state behavior when capability-driven.

## CSS interaction rules

- Active-state rules must be scoped to the control family they style.
- Do not group unrelated navigation, language, scope and view controls under a single override merely to make them visually consistent.
- Capability/partial-state styling must not masquerade as selection state.
- Styling changes must not alter pointer-event behavior unless the change explicitly requires it.

## Validation

Every UI change must pass:

    npm run check
    npm test
    npm run public:audit

The test suite includes `tests/ui-control-interaction.test.mjs` for runtime control binding.

A real-browser visual/click smoke remains required when geometry, layering, pointer interception, browser-native controls, scrolling or responsive behavior could differ from the simulated DOM. If no real browser was available during implementation, that limitation must be stated rather than claiming visual interaction acceptance.

## Entity presentation semantics

The cultural-Entity result channel is a retrieval/data concept, not a user-facing item type.

For an individual Entity result:

- never display the generic word `Entity` / `Entität` as its visible item-type badge, primary category, or popularity subtitle;
- display the most specific available accepted taxonomy category instead, for example `Rapper`, `Singer`, `Actor`, `Music Group`, `Character`, `Movie`, `Video Game`, `Album`, `Song`, `Car Brand`, or `Company`;
- when an item has multiple categories, a more specific category must win over broad person buckets such as `Artist` or `Musician`;
- category labels must be rendered through the UI category-label map, not by exposing raw taxonomy codes such as `person.rapper`;
- if a malformed/legacy result has no category at all, use the neutral fallback `Named item` / `Eigenname`, never `Entity` / `Entität`;
- the channel/filter name `Entities` may remain as the name of the result family because it describes the collection rather than an individual result.

Regression coverage must include representative person, group, work, fictional-character and fallback cases.

## Unified surface presentation

The visible product identity is one normalized surface per result language, not one card per source row, pronunciation row, Entity QID, or sound-relation tag.

For an unfiltered unified search:

- the same `language + normalized surface` must appear at most once in the visible result set;
- a lexical Word result is the preferred carrier when the same surface is also present in the Entity channel, preserving the Word/Core pronunciation and Writer score while attaching all observed Entity categories/QIDs as metadata;
- multiple same-name Entity identities collapse to one surface result; distinct QIDs remain available as metadata and must not create duplicate cards;
- alternate pronunciations remain metadata/inspection detail rather than duplicate result cards;
- one result may match several sound relations, but the unfiltered UI renders it only in its primary/default sound section; explicit relation filtering may still select the result by any matching relation;
- Phrase/Mosaic matched-span results remain a separate result kind because their IPA may describe a matched subspan rather than the full lexical surface.

The storage/runtime may retain distinct Entity identities and pronunciations. This rule concerns Product presentation and unified response consolidation, not destructive database deduplication.

## Change discipline

Do not redesign or reparent stable controls merely to achieve visual consistency. Preserve existing behavior first, then make the smallest scoped UI change that satisfies the request.

If a user reports that a control cannot be clicked or changed, investigate runtime initialization/event binding before attempting another styling-only fix.
