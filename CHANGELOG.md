# Changelog

This file records meaningful user-visible, behavioral, compatibility, security, data/provenance, and release changes.

Git remains the complete technical history. This changelog is intentionally curated rather than commit-by-commit.

## Unreleased

### Added

- Added a bounded IndexedDB cache for generated client query pronunciations, keyed by language/spelling and gated by resolver policy plus the current active-database revision.
- Added `docs/QUERY_PRONUNCIATION_CLIENT_HANDOVER.md` as the focused fresh-thread continuation contract for client query pronunciation, cache revalidation and browser verification.
- Added a deterministic 1000-case source-backed DE/EN query-pronunciation gold-control benchmark, balanced by language and syllable-count bucket, to measure eSpeak-NG pronunciation quality separately from structural analyzer compatibility.
- Added browser/client Total Query Pronunciation for unknown words and partially unresolved multi-word queries. Word chains are resolved token-by-token from source-backed DB pronunciation plus local deterministic fallback and recomposed into one ephemeral query IPA.
- Added `/query-pronunciation-test`, which exercises browser IPA generation followed by the unchanged Writer/Phrase/Entity search pipeline.
- Added a deterministic 1000-case unresolved-data sampler, local eSpeak-NG structural/latency benchmark runner, and a separate opt-in-only generated-pronunciation staging SQLite path.
- Added independent result-language targeting so a source-resolved German query can request German, English, or combined results without treating the German spelling as an English lexeme.
- Added runtime-driven Entity category filtering, an alphabetized Sources dialog, bounded search-pool counts, and per-relation More controls for standard browsing.
- Added a runtime UI interaction smoke and durable UI interaction contract for primary browser controls.
- Added PROJECT.md as the durable source for RhymeLab's solo-dev/owner-controlled repository model, architecture boundaries, zero-cost policy, licensing/contribution posture, QA gate, and continuity responsibilities.
- Added repository-wide editor and Git attribute defaults for predictable text formatting and line endings.

### Fixed

- Normalized eSpeak-NG IPA adapter output before frozen DE/EN analysis: Unicode format joiners are removed and observed eSpeak-specific long-vowel variants are mapped into existing accepted analyzer inventories.
- Prevented the first 1000-case eSpeak report format from being staged after the benchmark exposed adapter-induced false rejects and corrupted diphthong/syllable analysis.
- Restored primary unified-search control interaction after PR #117 accidentally used an undefined `$$$` selector helper in three event-binding lines, causing partial UI initialization after the Search submit handler.
- Corrected the required control-group preflight to use the multi-element selector helper so missing button groups fail initialization visibly instead of passing the preflight.
- Entity result cards and detail panels now display concrete taxonomy types such as Rapper, Actor, Music Group, Movie, Video Game, Character, Album or Song instead of the generic Entity label.

### Changed

- Query pronunciation cache reuse now requires the once-per-session `/api/health` database revision; DB or resolver updates invalidate stale generated pronunciations while source-backed database pronunciation remains authoritative.
- Accepted the normalized eSpeak OOV v2 run as structural compatibility evidence at 1012 / 1014 analyzer-compatible cases (99.80%); lexical correctness remains a separate quality gate.
- eSpeak OOV benchmark evidence is now schema v2 and records raw IPA, normalized IPA, normalization changes, all failures, and exact analyzer errors for forensic review.
- DE+EN queries now resolve independent missing DE and EN pronunciation anchors in the end-user client for both single words and word chains; source-backed phrase/token pronunciation remains preferred and candidate pronunciation data stays frozen.
- eSpeak-NG moved out of `src/` and is benchmark/development-only under `scripts/`; end-user query pronunciation has no host-executable dependency.
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
