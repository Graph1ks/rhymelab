# Changelog

This file records meaningful user-visible, behavioral, compatibility, security, data/provenance, and release changes.

Git remains the complete technical history. This changelog is intentionally curated rather than commit-by-commit.

## Unreleased

### Added

- Started the P0 behavior-preserving React Studio replatform with an isolated React 19.3 + TypeScript + Vite + Base UI + Motion + TanStack Query + Zustand + TanStack Virtual application, machine-readable parity inventory, hard cutover checker and dedicated CI. The existing Studio V2 remains unchanged as the shipping golden master and rollback surface.
- Completed React Studio R1 typed bridging across 18 existing Search, pronunciation, document, editor, Perform, analysis/detail, diagnostics and device-acceptance modules. The React-facing functions directly reuse the existing implementations, with strict TypeScript contracts, implementation-identity tests and representative semantic parity coverage.
- Completed React Studio R2 shell/design-system foundations: semantic theme tokens with existing Light/Dark and saved custom-slot compatibility, responsive full-sidebar/rail/mobile navigation, topbar, Base UI overlay/control primitives, persistent DE/EN appearance state, ranked command palette, reduced-motion handling, VisualViewport wiring and single normal content-scroll ownership. Domain feature behavior remains in the Studio V2 golden master until its dedicated port phase.
- Completed React Studio R3 Search/Writer port: one shared persisted SearchState across Search and the Studio Sound Explorer, live existing Writer/query-pronunciation/detail/capability/runtime-edition paths through the R1 boundary, complete direct filter/preset controls, Compact/List/Tiles, continuous virtualized results, opt-in auto-scroll, Hide-used from the existing read-only DocumentStore context, Saved results and runtime-database visibility. Safe result insertion and selection-follow remain explicitly deferred to the R5 editor port rather than bypassing Selection Proof semantics.
- Completed React Studio R4 Library/persistence/recovery port: the existing IndexedDB DocumentStore remains authoritative behind a React orchestration provider, with serialized 180-ms autosave and lifecycle flush, LocalStorage fallback, hierarchical Library CRUD/move/search/sort, Trash/Restore, conditional pre-delete Recovery, manual Recovery points, verified restore, and the existing portable backup/import schema including pre-import Recovery plus preference/SearchState rehydration. No R1 bridge, shipping Studio V2, backend or Serving-v1 implementation was replaced.
- Completed React Studio R5 unified-editor port on the R4 persistence path: one textarea document with stable Bar IDs, tracked/free rows, bracket metadata exclusion, Selection Proof Writer insertion, native split/merge/multiline paste, IME transaction boundaries, typing-burst undo/redo, revision compare/restore, Bar actions/Navigator, hold-drag, section long-press and the mobile Editor/Rhymes swap. Existing editor-session/history/revision semantics remain authoritative through R1.
- Completed React Studio R6 Analysis + Perform port: canonical end/all-rhyme analysis, IPA/stress, Word Laboratory, rhyme-chain/Section/Bar projections and Bar Inspector reuse the existing analysis adapter; stable-Bar-ID cues, accessible/drag cue movement, grid/feel/tempo/pause controls, Auto-Map, review invalidation, performance metrics and Web Audio metronome reuse the existing performance session. Perform mutations reuse the R5 history/revision boundary and R4 persistence.
- Completed the React Studio R7 source-parity layer: all 93 mandatory rows are now implemented/ported; Search keyboard actions are deterministically tested; startup bindings fail closed; Settings exposes diagnostics plus the existing seven-gate physical acceptance model with report merge/export/import; the mobile Settings drawer has one explicit touch scroll owner; CI runs a dedicated R7 source gate; and an opt-in `/studio-react` preview can temporarily become root while `/studio` and `/studio-legacy` retain the Studio V2 golden master. No row is promoted to verified without required browser/device evidence.

- Expanded the development-only Distribution DB Lab to a quality/speed v2: exact effective Writer requests, deterministic result fingerprints, per-query response bytes, Search/serialize/read/parse/map/render timing, live server-metric refresh on Copy-all, and controlled Master/Lite/Standard/Full benchmark modes with warmups, p50/p95 and repeatability/Top-50 overlap reporting.
- Added the development-only Studio Distribution DB Lab for explicit Master/Lite/Standard/Full switching, strict request-scoped `runtime_db` routing and copyable SQLite/Writer/browser/server performance metrics. Normal startup strips the internal UI and disables its endpoint; the future user-facing database choice remains a separate Settings task.
- Added Studio V2 as the production songwriting shell with live Writer/Search, IndexedDB document authority, recovery/portable backup, hierarchical Library, Perform sequencing, canonical song analysis, DE/EN UI, mobile viewport engineering, diagnostics and command-palette workflows.
- Added a regression contract that keeps the frozen Markov V2 implementation direct-demo-only and prevents `/markov-test` from being linked by Studio, Search or RhymePad product surfaces.
- Added `docs/DISTRIBUTION_TIERS.md` as the durable Lite/Standard/Full packaging contract: 50k total for Lite, 250k total for Standard and 400k total for Full. Standard/Full spend their total budget on majority ranked Core Words plus their Phrase/Entity populations; Full has no additive Generated-only Word quota and Markov is outside the shipping database capability contract.
- Added a report-grade Serving-v1 steady-state performance benchmark with discarded warmup rounds, deterministic interleaved repeats, per-language/per-query percentiles, semantic repeatability checks, environment/DB fingerprints, and companion JSON + Markdown reports. Performance target misses are reported without turning a completed measurement into a command failure.
- Added persistent Serving-v1 channel workers for DE Words, EN Words, Phrase/Mosaic, DE Entities and EN Entities. The real preview UI, hotpath benchmark and Product Acceptance latency path now execute eligible channels concurrently with one long-lived read-only SQLite connection per worker and no cross-request search caching.
- Promoted the one-file Serving-v1 Product runtime to the normal RhymeLab browser UI/API path and retained older split databases only for explicit engineering/archive/control use.
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

- Fixed Full Entity distribution selection so Standard Top-1k/category memberships are reserved inside the Full 5k/category ceiling before remaining Full-eligible slots are filled; nesting can no longer inflate a category beyond its shipping quota.
- Removed stale distribution-census/test metadata that still described the rejected 400k Core + 200k Generated + Markov Full model after the total-budget contract had changed.
- Fixed systematic Entity pronunciation-language leakage: Wikidata label locale is no longer treated as sufficient pronunciation-language evidence. If the same Entity has the same normalized searchable name as both DE and EN labels, derived German/English pronunciation sources are suppressed while direct/source-backed pronunciation evidence remains eligible. This covers people, films, games, groups and other Entity categories without name-specific exceptions.
- Fixed DE -> EN compound rhyme bridging so German-only phones before the right edge no longer zero the English channel; `Arbeitsweise` now uses the same relevant stressed rhyme-tail neighborhood as `Weise`.
- Unified result presentation now collapses duplicate Word/Entity surfaces into one visible answer per language. Core/Word pronunciation wins when available, same-name Entity identities contribute their taxonomy tags/QIDs, alternate pronunciations remain metadata, and unfiltered sound-relation sections no longer render the same result card repeatedly.
- Normalized eSpeak-NG IPA adapter output before frozen DE/EN analysis: Unicode format joiners are removed and observed eSpeak-specific long-vowel variants are mapped into existing accepted analyzer inventories.
- Prevented the first 1000-case eSpeak report format from being staged after the benchmark exposed adapter-induced false rejects and corrupted diphthong/syllable analysis.
- Restored primary unified-search control interaction after PR #117 accidentally used an undefined `$$$` selector helper in three event-binding lines, causing partial UI initialization after the Search submit handler.
- Corrected the required control-group preflight to use the multi-element selector helper so missing button groups fail initialization visibly instead of passing the preflight.
- Entity result cards and detail panels now display concrete taxonomy types such as Rapper, Actor, Music Group, Movie, Video Game, Character, Album or Song instead of the generic Entity label.

### Changed

- Froze new product feature development while the React Studio replatform is active. Cutover is blocked until every existing Studio parity capability plus the captured Workflow UX v3 behaviors is verified; no functional simplification is authorized.

- Studio Writer requests now use the compact `studio-writer-compact-v1` transport projection while preserving result order, IDs, scoring/relation metadata and detail-relevant fields; non-Studio `/api/writer` clients retain the full response. JSON API responses are serialized compactly and expose measured response-size/serialization headers.
- Serving-v1 Master no longer advertises frozen Markov infrastructure as an active product/distribution capability.
- Studio V2 is now the default `/` route for normal `npm run dev` / `npm start`; the previous Search remains available at `/search` and `/legacy`, RhymePad at `/pad`, and `npm run dev:search-default` provides an explicit reversible root-route fallback.
- Markov / Constrained Lyric Decoder V2 remains frozen. It may ship as isolated demo infrastructure but is not part of RhymeLab product navigation or promotion.
- Generated data is now included by default whenever the generated-capable runtime is available; the existing checkbox is an opt-out and `generated=0` is the explicit Core-only API mode.
- Added a fail-closed German scorer upper-bound prefilter that skips expensive feature/full-score work only for provably impossible matches; retrieval populations and accepted result semantics remain unchanged and are guarded by optimized-vs-full response parity tests.
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
