# PROJECT.md

## Product

**Name:** RhymeLab  
**One-line purpose:** Local-first deterministic phonetic rhyme and songwriting tooling for German and English, with phrase/mosaic and cultural-entity search.  
**Primary users:** Songwriters, lyricists, rappers, and the project owner/developer.  
**Project stage:** Active pre-1.0 development.  
**Current package version:** 0.11.0  
**Target environment:** Local desktop-class systems running Node.js 22.5+ with a browser UI.  
**Versioning/release model:** SemVer-oriented pre-1.0 development.  
**Changelog:** enabled

## Repository mode

**Repository visibility:** public  
**Collaboration mode:** owner-controlled / solo-dev  
**External pull requests:** collaborators-only; unsolicited code contributions are not accepted  
**Issues:** enabled for bug reports, suggestions, and user feedback  
**Projects:** disabled  
**Discussions:** disabled  
**Community inbox behavior:** user-triggered only for AI/agent work  
**Wiki:** disabled  
**Pages:** disabled  
**Fork policy:** allowed / public repository is treated as independently copyable  
**Repository settings verified:** yes  
**Verified on/by:** 2026-09-19 via authenticated repository tooling

Public visibility does not make RhymeLab a community-governed project and does not change its source-available license terms. Development remains controlled by the owner and explicitly authorized collaborators.

The protected integration branch, CI requirement, merge rules, and public-history boundary are defined in docs/REPOSITORY_GOVERNANCE.md.

## Product scope

### In scope

- deterministic phonetic rhyme search;
- client-side pronunciation resolution for unknown or partially unresolved user queries, including arbitrary word chains, with source-backed token pronunciation preferred and generated query anchors kept ephemeral;
- accepted German single-word Writer behavior;
- accepted German phrase/mosaic/phraseology behavior;
- accepted English single-word Writer behavior;
- source-backed multilingual Entity rhyme search;
- local unified Writer UI and RhymePad writing workflow;
- deterministic ranking/diversification backed by versioned acceptance evidence;
- provenance-aware lexical, pronunciation, usage, phrase, and Entity data pipelines;
- local SQLite runtime data and reproducible owner-side materialization/verification workflows.

### Explicitly out of scope unless the owner changes this document

- hosted/SaaS runtime as a requirement;
- telemetry, advertising, tracking, or automatic user-data uploads;
- remote databases required by normal product runtime;
- LLM, neural, or machine-learning inference in canonical core rhyme retrieval/ranking;
- automatic promotion of AI-generated pronunciation evidence into accepted runtime truth;
- community governance or automatic community-roadmap prioritization;
- paid production services required for the core product.

External models and online sources may be used during research, source acquisition, diagnostics, or isolated benchmark/evidence workflows only where the relevant project contract explicitly permits them. They must not silently become runtime dependencies or canonical truth.

## Engineering targets

**Primary quality targets:** phonetic correctness, deterministic behavior, useful writer ranking, provenance, local/offline operation, and resumable engineering state.

**Performance:** measure before optimizing. Accepted milestone-specific performance gates live in their acceptance documents. Entity Writer latency remains an explicit follow-up after the accepted Phase 12C source-backed runtime; do not invent a blanket latency SLA in place of measured gates.

**Determinism:** accepted core behavior must be reproducible from the same code/data inputs and must not depend on randomized runtime ranking.

**Data integrity:** pronunciation variants, source provenance, historical/register state, and accepted fingerprints must remain explicit where the relevant schema/contract requires them.

**Portability:** use project-relative paths. Never hardcode private machine/user paths. The unknown-word pronunciation generator must remain portable across browser, Android/WebView-style packaging, and Electron-style packaging without a host executable.

## Architecture

**Runtime/language:** Node.js ESM, Node.js 22.5+  
**Storage:** local SQLite plus versioned source/manifests and generated local artifacts  
**Product surfaces:** local browser UI, unified Writer API, integrated RhymePad  
**Canonical runtime posture:** local-only, deterministic, no required runtime network

### Architecture constraints

- Preserve accepted/frozen German and English baselines unless a concrete regression or new benchmarked candidate justifies reopening them.
- Keep phonetic relation truth separate from writer utility/ranking and result-set diversity.
- Keep language-specific phonology explicit; do not route English through German phonology or vice versa.
- Keep Entity identity language-neutral and pronunciation variants provenance-bearing.
- AI/LLM pronunciation output is evidence/staging unless a later explicit acceptance gate promotes it.
- Deterministic non-neural pronunciation generation may be used for unresolved **user query anchors, including multi-word chains**. Generation runs in the end-user client (browser-compatible JavaScript), resolves each token from source-backed pronunciation when available, generates only missing token pronunciations locally, and composes one ephemeral query IPA. It must not require Node.js, a local executable, eSpeak-NG, LLM inference, or paid/operator pronunciation compute. Generated query anchors are ephemeral and may not be silently promoted into canonical lexical/Entity/Phrase data. Generated token pronunciations may persist only in a bounded, revision-/policy-gated non-canonical client cache; current DB state must invalidate stale cache entries. The existing database/retrieval/scoring/ranking stack remains authoritative after the client supplies IPA.
- Prefer focused changes over broad rewrites of accepted product surfaces.
- Keep architecture proportional to a solo-developed local product.

## Cost policy

**Required production cost target:** zero.

The core local product must remain usable without paid software, paid APIs, metered SaaS, subscription-only infrastructure, or mandatory hosted services.

Optional research/development tooling may be evaluated separately, but it must not become a hidden requirement for normal runtime, reproducibility of accepted core behavior, or ordinary user operation.

## Licensing strategy

**Source model:** source-available, not OSI Open Source  
**Commercial model:** separate commercial licensing is available for Graph1ks Material  
**Deployment/distribution:** local-first source/runtime; future packaging may be added without changing the licensing boundary automatically  
**Copyleft posture:** case-by-case for third-party material; provenance and redistribution obligations are reviewed per source/component

### Graph1ks Material

Graph1ks-authored material is governed by:

- LICENSE
- COMMERCIAL_LICENSE.md
- COPYRIGHT

Do not replace or reinterpret those terms through generic template language.

### Third-party data, code, models, fonts, and assets

Third-party material retains its own license and attribution requirements. The repository root license does not automatically relicense third-party content.

Authoritative tracking lives in:

- THIRD_PARTY_NOTICES.md
- DATA_SOURCES.md
- relevant source manifests and domain documentation

Public availability alone is not sufficient evidence of commercial or redistribution compatibility.

### Contribution model

**External contributions accepted:** only when explicitly invited or authorized by the owner  
**Contributor mechanism:** CLA for accepted external code/documentation contributions  
**CLA:** CLA.md

Issues and suggestions may be accepted as feedback without creating any right to submit code or change roadmap priority.

## Dependency policy

Before adding a dependency or externally sourced asset/data/model:

- confirm the existing stack cannot reasonably cover the need;
- confirm zero-cost compatibility with intended use;
- verify license and redistribution obligations;
- evaluate transitive licensing/security implications where relevant;
- prefer maintained, lightweight, removable dependencies;
- document source/provenance obligations for shipped or materialized third-party content.

Do not add dependencies merely for convenience when a small standard-library or existing-stack solution is adequate.

## Data policy

Runtime databases, downloaded raw corpora, generated reports, benchmark review/reference data, temporary staging artifacts, and owner-local bulk data stay out of Git unless a specific repository contract explicitly says otherwise.

Source-backed linguistic/entity facts must retain provenance. Generated/AI evidence must remain distinguishable from accepted source-backed runtime truth.

## Security and privacy

**Sensitive user data handled by normal runtime:** none intended  
**Runtime network exposure:** loopback/local by default  
**Secrets:** none required for normal local runtime  
**Telemetry/uploads:** prohibited unless explicitly redesigned and approved

Never commit secrets, credentials, private URLs, personal email addresses, unnecessary personal identifiers, raw private conversations, or private machine-specific paths.

Security reporting and threat-boundary details live in SECURITY.md.

## QA / merge gate

Minimum public merge checks:

    npm run check
    npm test
    npm run public:audit

GitHub's required status check is validate.

Additional benchmark, source/provenance, migration, or owner acceptance gates apply when the changed subsystem's documentation requires them.

Changes to accepted/frozen ranking, retrieval, phonology, scorer, phrase/mosaic, English product, or Entity acceptance behavior require the corresponding evidence rather than a cosmetic test-only update.

## Continuity and source of truth

Use the files by responsibility:

- PROJECT.md — durable product identity, repository mode, architecture boundaries, cost/license/contribution policy;
- AGENTS.md — operating contract for human/AI engineering work plus project-specific guardrails;
- STATUS.md — current operational state;
- docs/HANDOVER.md and focused phase handovers — continuation context;
- PROJECT_STATE.json — machine-readable project state;
- CHANGELOG.md — curated meaningful product/release history from 2026-09-19 onward;
- acceptance/domain documents — authoritative evidence and frozen technical contracts;
- Git — complete technical history.

Persist decisions and engineering facts, not raw conversations. No continuation-critical fact should exist only in chat.

## Current priorities

1. Exercise and quality-benchmark the browser/client unknown-word IPA resolver independently from bulk Entity pronunciation work.
2. Preserve the accepted Phase 11, Phase 12B, and source-backed Phase 12C baselines while fixing concrete regressions.
3. Improve Entity Writer performance without changing accepted semantics.
4. Keep targeted Top-100k unresolved-Entity AI pronunciation work isolated as evidence until an explicit later promotion gate.
5. Continue product/UI refinement without silently changing canonical retrieval/ranking behavior.
