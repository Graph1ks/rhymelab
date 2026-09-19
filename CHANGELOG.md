# Changelog

This file records meaningful user-visible, behavioral, compatibility, security, data/provenance, and release changes.

Git remains the complete technical history. This changelog is intentionally curated rather than commit-by-commit.

## Unreleased

### Added

- Added Total Query Pronunciation v1: unknown normalized single-token queries now receive analyzer-compatible ephemeral DE/EN pronunciation anchors instead of failing solely because their spelling is absent from the lexicon.
- Added an optional local eSpeak-NG host adapter plus deterministic in-repository DE/EN fallback rules; generated query pronunciations are never canonical lexical facts.
- Added a deterministic 1000-case unresolved-data sampler, local eSpeak-NG structural/latency benchmark runner, and a separate opt-in-only generated-pronunciation staging SQLite path.
- Added independent result-language targeting so a source-resolved German query can request German, English, or combined results without treating the German spelling as an English lexeme.
- Added runtime-driven Entity category filtering, an alphabetized Sources dialog, bounded search-pool counts, and per-relation More controls for standard browsing.
- Added a runtime UI interaction smoke and durable UI interaction contract for primary browser controls.
- Added PROJECT.md as the durable source for RhymeLab's solo-dev/owner-controlled repository model, architecture boundaries, zero-cost policy, licensing/contribution posture, QA gate, and continuity responsibilities.
- Added repository-wide editor and Git attribute defaults for predictable text formatting and line endings.

### Fixed

- Restored primary unified-search control interaction after PR #117 accidentally used an undefined `$$$` selector helper in three event-binding lines, causing partial UI initialization after the Search submit handler.
- Corrected the required control-group preflight to use the multi-element selector helper so missing button groups fail initialization visibly instead of passing the preflight.
- Entity result cards and detail panels now display concrete taxonomy types such as Rapper, Actor, Music Group, Movie, Video Game, Character, Album or Song instead of the generic Entity label.

### Changed

- DE+EN unknown single-token queries now resolve independent DE and EN pronunciation anchors rather than stopping for spelling ambiguity; multi-word Phrase/Mosaic pronunciation rules remain frozen.
- Generated query pronunciation is visibly marked in the search inspector and uses the existing accepted language-specific retrieval/scoring/ranking paths.
- Standard unfiltered search now uses explicit per-category More controls; automatic progressive/endless scrolling is reserved for a selected rhyme/sound relation.
- Entity category dropdown labels are rendered as readable localized subtype names instead of raw taxonomy paths.
- Active segmented controls, dropdowns, and vertical/horizontal scrollbars use one consistent styled UI treatment; the old partial-capability underline on buttons is removed.
- Per-result Source fields were removed from inspectors in favor of the consolidated Sources dialog.
- Aligned public contribution guidance with the actual owner-controlled, collaborators-only GitHub configuration.
- Updated repository continuity guidance to separate durable project policy from current status/handover state.
- Updated README project-state guidance to reflect accepted Phase 11, accepted/frozen English Phase 12B, and accepted source-backed Phase 12C.
- Extended the existing Node public-readiness audit with lightweight governance-file and unresolved-template-placeholder checks.
- Expanded local ignore rules for common editor, temporary, log, OS, and credential-container artifacts.

## Changelog baseline

Changelog tracking begins on 2026-09-19.

Earlier accepted product and engineering history remains authoritative in Git plus the existing acceptance, roadmap, status, handover, source/provenance, and project-state documents. It is not reconstructed here retroactively.
