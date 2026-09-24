# AGENTS.md — RhymeLab

This repository is the authoritative engineering/project memory for RhymeLab. Repository state beats chat history.

## Required continuity read

Before changing the project in a fresh thread/session, read:

1. `PROJECT.md` — durable product identity, repository mode, architecture/cost/license/contribution boundaries
2. `docs/REACT_STUDIO_REPLATFORM.md` — **active P0 continuation and feature-freeze contract**
3. `docs/REACT_STUDIO_PARITY_GATE.md` — hard no-capability-loss cutover gate
4. `docs/DISTRIBUTION_DB_LAB_V2_HANDOVER.md` — preserved database benchmark continuation, currently subordinate to the frontend replatform
5. `docs/STUDIO_V2_HANDOVER.md` — current Studio V2 behavioral golden master and live-cutover checkpoint
4. `docs/STUDIO_V2_DEVICE_ACCEPTANCE.md` — still-pending physical browser/touch/Web Audio acceptance matrix
5. `STATUS.md` — current operational state
6. `PROJECT_STATE.json` — machine-readable current state
7. `docs/HANDOVER.md` — current continuation pointer plus historical chronology
8. `docs/MARKOV_GENERATOR_HANDOVER.md` — frozen Markov demo boundary; do not reopen without explicit owner direction
9. `docs/SERVING_V1.md` and `docs/SERVING_V1_PRODUCT_ADAPTER.md` — canonical Serving-v1 runtime/data contracts
10. `docs/PHASE_11_ACCEPTANCE.md` — accepted/frozen German Phrase/Mosaic behavior
11. `docs/PHASE_12C_ACCEPTANCE.md` and `docs/PHASE_12C_ENTITY_RUNTIME_AI_STAGING_HANDOVER.md` — accepted Entity runtime and isolated AI staging boundary
12. `docs/UI_INTERACTION_CONTRACT.md` and `docs/UI_REDESIGN_PARITY.md` — browser interaction/parity contracts
13. `docs/DISTRIBUTION_TIERS.md` — Lite/Standard/Full packaging contract
14. `docs/INTERNAL_DISTRIBUTION_LAB.md` — internal Master/Lite/Standard/Full comparison and shipping-isolation contract
15. `ROADMAP.md`, `DATA_SOURCES.md`, `docs/API.md`, and subsystem-specific acceptance/benchmark documents when relevant

## Operating model — solo-dev / owner-controlled

RhymeLab is a public **owner-controlled solo-dev project**, not a community-governed development project.

Default engineering behavior:

- make routine, reversible engineering decisions and complete coherent work without artificial approval checkpoints;
- escalate changes that are destructive, expensive to reverse, materially alter product scope, change licensing/security/privacy boundaries, or introduce required external services;
- keep the required production path zero-cost: do not add mandatory paid software, APIs, SaaS, subscriptions, hosted databases, or metered services without an explicit owner decision;
- Issues and Discussions are feedback/inbox channels, not an automatic AI-agent backlog;
- do not proactively scan, triage, reply to, prioritize, close, or implement community Issues/Discussions unless the owner explicitly asks for that work;
- unsolicited external pull requests are not accepted; code/documentation contributions require explicit owner authorization and the existing CLA rules;
- persist durable engineering decisions and project facts, not raw user/AI conversations, private discussions, or unrelated sensitive conversational content;
- prefer focused changes over process ceremony, while preserving the repository's acceptance, provenance, licensing, security, and CI gates.

## Frontend replatform feature freeze — active P0

The owner has frozen new product feature development while the shipping browser frontend is replatformed to React + TypeScript + Vite + Base UI + Motion + TanStack Query + Zustand + TanStack Virtual.

Hard rules:

- `docs/REACT_STUDIO_REPLATFORM.md` is the active implementation plan.
- `docs/REACT_STUDIO_PARITY_GATE.md` is a hard cutover gate, not advisory documentation.
- Every capability currently represented by `src/studio/parity-manifest.mjs`, plus the captured Workflow UX v3 behaviors, must be verified in the React implementation before root-route cutover.
- Do not delete, simplify, redesign away, defer, or silently alter an existing user-facing behavior as part of the port.
- Preserve IndexedDB DocumentStore authority, stable Bar IDs, selection-proof/editor semantics, query-pronunciation behavior, runtime-edition selection, analysis/Perform semantics, recovery guarantees and the accepted Writer/Serving-v1 API behavior.
- Keep the existing Studio V2 implementation intact as the behavioral golden master and rollback surface during migration.
- New feature work is blocked unless the owner explicitly reopens it. Allowed work is migration, parity/regression coverage, migration-required bug fixes, and urgent correctness/security fixes.
- A React control is not considered ported merely because it renders. It must have interaction evidence consistent with `docs/UI_INTERACTION_CONTRACT.md`.
- `npm run studio:react:parity:cutover` is expected to fail until every mandatory row is verified.

## Long-running local data/build job standard

Any owner-local workflow that may process large datasets, run for more than a trivial interactive duration, or create a materialized/runtime artifact must be designed as a resumable build pipeline by default.

Hard requirements:

- provide a read-only plan/preflight mode when the job can materially affect time, disk usage, or downstream artifacts;
- split work into deterministic named stages and bounded transactional batches;
- persist checkpoints in machine-readable local state, normally SQLite, so a crash, process exit, reboot, or ordinary rerun does not discard completed work;
- rerunning the normal build command must resume safely from the last committed checkpoint without requiring special recovery steps;
- handle SIGINT/SIGTERM cooperatively: finish or roll back the current transaction, persist a paused/error state, close databases, and retain reusable work;
- print useful console progress for active stages: stage name, processed/total rows where known, percentage, throughput, batch duration, and ETA when meaningful;
- expose a status/inspection command for incomplete work;
- fingerprint or otherwise bind the work state to its source inputs and build semantics; refuse to combine changed inputs or changed build logic with stale checkpoints;
- write expensive/incomplete output to a distinct work artifact and promote only after validation; prefer atomic rename/swap for final promotion;
- never destroy the last known-good promoted artifact implicitly; replacement/reset/destructive operations require explicit flags and should preserve or restore the previous artifact when practical;
- run integrity/invariant checks before promotion and emit a machine-readable final report with source/build fingerprints, stage status, counts, timing, and safety invariants;
- keep source-of-truth databases immutable unless the workflow's explicit accepted contract says otherwise;
- make reset semantics narrow: resetting an incomplete build must not delete canonical/source inputs or an already promoted artifact;
- test pause/resume, stale-checkpoint rejection, invariants, and promotion behavior on small fixtures in CI whenever the workflow is part of repository tooling.

For genuinely small one-shot scripts where checkpointing would add more complexity than the entire job, keep the implementation simple; the burden is on the change to establish that the workflow is trivial rather than silently omitting resumability from a large-data job.

## Public-repository guardrails

The public repository starts from a sanitized root commit. Do not add references that expose the pre-public private Git history, branches, pull requests, personal email addresses, local user/profile paths, credentials, private URLs, or internal-only artifacts.

Public `main` is governed by `docs/REPOSITORY_GOVERNANCE.md`: changes target pull requests, the required CI job/check is `validate`, and the intended GitHub ruleset blocks force pushes and branch deletion.

Run before public-facing changes:

```bash
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

Use a GitHub `noreply` commit identity if personal email privacy matters.

Graph1ks Material is governed by `LICENSE` and `COMMERCIAL_LICENSE.md`. Third-party material is never automatically relicensed by the repository root license. Preserve upstream licenses, attribution, share-alike requirements, provenance, and redistribution boundaries in `THIRD_PARTY_NOTICES.md`, `DATA_SOURCES.md`, and relevant manifests.

All external contributions require explicit CLA acceptance before merge.

## UI interaction regression gate

For browser UI work, `docs/UI_INTERACTION_CONTRACT.md` is authoritative.

Hard requirements:

- syntax/source/CSS assertions alone do **not** prove that a control is interactive;
- primary controls must have a runtime interaction smoke test that installs handlers and exercises state changes;
- control binding must preflight required DOM nodes/groups before installing handlers, so initialization cannot silently stop halfway through;
- UI initialization failures must be visible in the product and console; do not leave a partially bound interface that looks functional;
- every newly added primary button/segmented control/filter must be added to the control-surface preflight and interaction regression test in the same change;
- do not use broad CSS active-state selectors that override unrelated control families;
- after user-reported interaction regressions, preserve the exact failure mode in regression coverage before merge.

## Hard runtime boundary

RhymeLab is local-only. GitHub is source control/project memory, not runtime. Runtime data lives in local SQLite under `data/local/`; generated bulk data, benchmark queues/reviews/reference labels, reports, and downloaded raw source files remain gitignored.

Do not introduce hosted/provider runtime, remote database bindings, telemetry, automatic uploads, advertising, or hidden network behavior without an explicit architecture decision.

RhymeLab core rhyme retrieval, scoring, writer ranking and result diversification must remain deterministic and locally executable on ordinary consumer hardware. Do not introduce LLM inference, machine-learning model inference, neural ranking, hosted ranking/search services, or a network dependency into the core search path. External models may be used only as optional benchmark/reference evidence; they must never be required to build, run, reproduce, or explain core search results.

A narrow pronunciation exception is active for **user query anchors**: when source-backed lookup cannot fully pronounce the query, deterministic non-neural pronunciation generation runs in the **end-user client** and may create ephemeral DE/EN query IPA for one word or an arbitrary word chain. Each token may use source-backed DB/API pronunciation when available; only missing token pronunciations are generated locally. Generated token pronunciations may be retained only in the revision-gated non-canonical IndexedDB cache defined by `docs/QUERY_PRONUNCIATION_CLIENT_HANDOVER.md`; current source-backed DB state and resolver policy must invalidate stale cache entries. The client generator must not depend on Node.js, `child_process`, a host executable, eSpeak-NG, an LLM, or a paid/runtime pronunciation service. The supplied IPA is validated by the existing accepted analyzer and then enters the unchanged retrieval/scoring/ranking path. eSpeak-NG remains an owner/development host tool under `scripts/` only. The owner has additionally authorized `docs/PRONUNCIATION_BACKFILL_V2.md`: a separate offline, resumable source/stage → accepted pronunciation-gap pass that may run eSpeak-NG and then the client resolver, including unresolved retained Entity names. That staging workflow must not mutate or auto-promote canonical Writer/Phrase/Entity databases. End-user query fallback must never affect candidate ranking or silently become lexical truth.

## Durable product decisions

- German first; English only after the German writer path, including phrase/mosaic work, is stable enough to freeze.
- Rhyme quality is phonetic/relational, not spelling-based.
- Writer usefulness is a separate deterministic ranking layer; lexical overlap must not corrupt phonetic rhyme truth.
- Page/list diversity is a separate deterministic result-set concern; do not fake diversity by changing phonetic relation labels.
- Primary rhyme classes are exclusive; Assonance/Consonance are independent overlapping relations.
- Usage is an ordering/product signal, not linguistic truth.
- Missing usage rank means unranked/unknown, not automatically rare or obsolete.
- Pronunciation variants are first-class and provenance-bearing.
- Curated modern pronunciations may overlay dictionary forms while dictionary alternatives remain available.
- Historical-only vocabulary is hidden by default and explicitly opt-in.
- Do not invent lexical, pronunciation, phraseological, source, license, or benchmark facts.
- Unknown or partially unresolved **user queries, including multi-word chains**, use client Total Query Pronunciation: source-backed query/token pronunciation is preferred, missing token pronunciations are generated deterministically in the end-user client, and the resulting ephemeral DE/EN phrase/word anchor re-enters the existing RhymeLab database/retrieval/ranking path. Generated token pronunciation may persist only as revision-/policy-gated non-canonical performance cache; generated query anchors are not lexical facts and must never be silently promoted into accepted data.
- Owner-only bulk pronunciation cleanup is now allowed only through corrected Backfill V2: collect source/stage → accepted gaps into a separate local staging DB, run the existing eSpeak-NG adapter first, run `client-total-query-pronunciation-v2` only for eSpeak analyzer-rejections, preserve A/B/C/D/U generated-quality classes, resume from SQLite checkpoints, and require a later explicit promotion/audit decision before any generated row can enter canonical runtime data.
- After Backfill V2 collection, run the structural audit plus the deterministic 1000-case eSpeak/client comparison before any multi-million-row generator execution. Unresolved-row agreement is not lexical gold; use the held-out source-backed control sample for generator quality calibration. Benchmark scripts must remain read-only with respect to the work DB and canonical runtime DBs.
- Bulk Backfill V2 generation additionally requires `source-aware-pronunciation-admission-v1`: only `admit` rows may enter unattended eSpeak generation; `review` and `reject_noise` rows remain preserved and ungenerated. Bulk eSpeak defaults to four batch workers; use the read-only v2 high-speed test to select a stable batch size rather than increasing worker concurrency. Worker/batch tuning may change throughput only, never admission, analyzer, quality-tier, checkpoint, or promotion policy. IPA normalization/analyzer execution may be parallelized with the owner-only persistent `worker_threads` pool (default 4); the analyzer implementation and accepted phonology profiles themselves must remain unchanged.
- Bulk eSpeak framing policy is `shape-aware-sparse-boundary-v2`: keep clean/joined lexical rows on plain batches; use sparse boundary groups for complex shapes; only ambiguous groups may be re-run with dense per-row framing. Do not reintroduce recursive per-row process fan-out as a normal recovery path.
- The owner-local inventory has now been consumed for Backfill V2. Current mapped defaults are `data/de/usage/de-usage.tsv`, `data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz`, the pinned English Kaikki source under `data/raw/en/phase12b-20260918/`, and the existing Phrase/Entity catalogs. Re-run `npm run data:inventory` only if the local data layout changes; do not reintroduce the absent `data/de/core/` dependency.
- Public web visibility alone does not make a source legally/reproducibly ingestible.
- External-model reference labels are evidence, not human-expert gold.
- Protect accepted exact-rhyme behavior unless strong evidence requires otherwise.
- Ranking changes stay isolated from scorer/relation changes unless the task explicitly requires both.
- Do not optimize benchmark gains that conflict with default lexical/product quality.
- Human Writer NDCG is deliberately deferred until the broader German writer surface is mature and independent human reviewers are available; the owner alone is not an independent gold source.

## Current default runtime — v0.11.0 / Serving-v1

Normal `npm run dev` / UI / API startup uses the canonical single-file Serving-v1
product runtime:

```text
package               v0.11.0
default DB            data/local/rhymelab-serving-v1.sqlite
schema family         rhymelab-serving-v1
product adapter       rhymelab-serving-v1-product-adapter-v1
runtime               serving-v1-single-db-product-candidate
channels              DE/EN Words + Phrase/Mosaic + Entities
generated policy      edition-capability driven; default on when available
```

The accepted German single-word Writer semantics remain the frozen Writer-v5/v6
baseline inside Serving-v1:

```text
writer ranking        deterministic_writer_utility_v6
right-edge anchor     de-right-edge-anchors-v1
anchor storage        compact-primary-key-v2
candidate basis       legacy-vowel-key-string-suffix-v1
morphology            de-attested-right-head-v4
construction          de-adverbial-weise-v2
morphology storage    positive-evidence-compact-v2
```

Writer-v5 and the older split databases remain source/provenance/regression inputs,
not the normal runtime. The v4 control DB remains optional for explicit legacy
comparison.

For development-only Master/Lite/Standard/Full UI comparison, use
`npm run dev:distribution-lab` and read
`docs/INTERNAL_DISTRIBUTION_LAB.md`. The internal selector must remain
request-scoped and must not become a normal shipping UI accidentally.

## Legacy/control baseline — preserved

The previous RhymeLab `v0.10.0` / DB-v4 runtime remains the protected regression/control path:

- DB schema `rhymelab-local-db-v4`;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternates;
- explicit request `?ranking=legacy`.

The control DB defaults to `data/local/rhymelab.sqlite`. If it is absent, the promoted Writer runtime still starts; only explicit legacy requests are unavailable.

## German single-word Writer baseline — accepted / promoted / frozen

Engineering acceptance is recorded in `docs/WRITER_SEARCH_ACCEPTANCE.md`.

Acceptance evidence includes:

- legacy/control-path invariance: 27/27, zero runtime/policy/protected-order mismatches;
- exact indexed-vs-LIKE right-edge retrieval equivalence: 12/12, zero mismatches;
- compact morphology regressions: 10/10 pass;
- final Writer Page structural gate: pass;
- legacy Tier-0 retention: 685/685;
- final full Writer Page mean: 1103.9 ms vs 1528.8 ms frozen validation mean;
- runtime repeatability: three independent DB opens with identical per-query and suite semantic fingerprints;
- suite fingerprint `c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab`.

`Arbeitsweise -> Hochzeitsreise` remains a retrieval sentinel only, not a Top-20 guard. Writer v7 remains rejected/rolled back. Do not silently retune the frozen v6/v4 writer baseline; material changes require a new benchmarked candidate.

## Benchmark truth

Current general German benchmark: `de-human-rhyme-v1`.

367/367 reviewed, 0 skipped. Accepted general ranking baseline: NDCG 0.9562 / pairwise 0.8350.

This general relation/ranking benchmark is not a substitute for Writer Page human usefulness labels.

Accepted general ranking policy for the legacy/control engine:

```text
modern_entity_relative_commonness_1decade_0_05
```

## Current engineering checkpoint

Phase 11 German phrase/mosaic/phraseology is **complete, accepted and frozen**. Read `docs/PHASE_11_ACCEPTANCE.md` before changing any accepted German Phrase/Mosaic behavior.

The accepted product shell is Studio V2 at `/`, backed by the canonical `GET /api/writer` pipeline. The previous unified Search is retained at `/search` and `/legacy` as a regression/fallback surface; RhymePad remains at `/pad`. There is no separate `/phrases` product route. Phrase catalog/detail APIs remain internal read-only support for result inspection and diagnostics.

Frozen product rules:

- single-word Writer v5/v6 remains unchanged;
- 11D4 retrieval, 11E2-v2 ranking and 11E3 diversity remain frozen;
- no Phrase/Mosaic quota or forced visibility;
- no invented cross-channel score calibration;
- zero Phrase/Mosaic results remain valid;
- accepted Phrase/Mosaic catalog pronunciations remain source-backed/frozen; however ad-hoc **user query text** may use client-generated token/phrase IPA when source-backed query resolution is incomplete. This changes only the query anchor, never Phrase/Mosaic candidate pronunciation data;
- `DE / EN / DE+EN` remains the unified language-basis contract;
- English stays capability-gated until Phase 12 supplies a real accepted English runtime.

Current active milestone: **P0 React Studio behavior-preserving replatform**. New product feature work is frozen. Studio V2 remains the behavioral golden master; its seven real-device gates remain required parity/cutover evidence. Markov / Constrained Lyric Decoder V2 is frozen, demo-only and must remain unlinked from product surfaces.

Read `docs/PHASE_12C_ENTITY_RUNTIME_AI_STAGING_HANDOVER.md`, `docs/PHASE_12C_ACCEPTANCE.md`, and `docs/ENTITY_AI_PRONUNCIATION_STAGING_V1.md` before changing Entity runtime, AI staging, benchmark-review, or promotion boundaries.

The Phase 12A deferred checkpoint remains frozen historical evidence; Phase 12C has resumed Entity work only within the current source-backed/runtime and isolated-staging contracts.

Frozen Entity facts:

- Hybrid-v2 retained population: 1,077,644;
- Hybrid-v2 fingerprint: `337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201`;
- conservative DE Entity runtime: 90,224 / 716,940 names (12.58%);
- DE Entity runtime fingerprint: `38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3`;
- completed CMUdict source-coverage diagnostic fingerprint: `69e6ec4d14091d22c5a76ca5869d38908f09f95fcac248b2e6791f329ad99bfa`;
- PR #70 P898 source-evidence code exists, but the owner has **not run** its new full-data owner workflow;
- do not claim P898 owner coverage;
- do not run Entity enrichment as the first step of Phase 12B;
- do not refetch/restage Entity/QRank inputs;
- do not mass-G2P Entity names.

Phase 12B selected source roles:

- **English Wiktionary via raw Kaikki/Wiktextract**: primary lexical/form/POS/register/IPA source;
- **CMUdict**: primary exact en-US pronunciation overlay/control;
- **ESDB / SCOWL v2**: secondary spelling/dialect/variant/inflection/lexical-quality evidence;
- **wordfreq**: initial usage/commonness candidate only, never lexical truth; data snapshot is only through about 2021 and must be benchmarked for modern songwriting vocabulary.

Current Kaikki English research snapshot reports 1,390,507 distinct English word forms and 1,787,236 English senses from the enwiktionary 2026-09-02 dump (Kaikki extraction 2026-09-16). This is a raw source universe, not the promised default Writer row count.

English implementation rules:

- keep the English DB separate from frozen German Writer during development;
- proposed target `data/local/rhymelab-en-v1.sqlite`;
- build a real versioned English phonology/analyzer/scorer;
- initial product pronunciation profile is en-US; preserve source-backed en-GB variants;
- do not pass English through `de-ipa-v2`;
- preserve pronunciation variants and source provenance;
- usage/commonness affects ordering, not lexical truth;
- historical/obsolete forms remain provenance-bearing and hidden by default;
- no broad G2P before source-coverage diagnostics;
- core runtime remains deterministic/local/offline;
- do not start Phase 13 cross-language rhyme during Phase 12B.

Phase 12B11 English Product is **ACCEPTED / FROZEN**. Owner integrated acceptance passed with semantic fingerprint `c889adf2253f3b149d6363f2063b40717b79a4f0cf24a06c953a599a66613ca6`; all checks passed, German direct-vs-unified Writer invariance passed, `nation -> station` is preserved as multisyllabic-perfect, independent-open repeatability passed, and the local `data/local/en-product-enabled-v1.json` marker was written. The accepted English product uses `guarded_commonness_06`, Diversity `0.08`, and retrieval profile `en-product-retrieval-reservoir-v1`. Do not reopen English ranking/retrieval micro-gates without a concrete regression.

The current implementation gate on candidate branch `phase12c-entity-runtime-ai-staging` is **Phase 12C source-backed multilingual Entity runtime + isolated AI pronunciation staging acceptance**. The branch implements source-backed EN Entity runtime/anchors, multilingual Entity Writer integration, AI queue/export/import/audit staging, strict artifact-contract validation, aggregate candidate diagnostics, LLM benchmark tooling and a benchmark-v3 review gate. It is **not merge-ready yet**: benchmark-v3 context-gold review remains pending. Draft PR #112 has a green `validate` gate; keep that check green on the final head. AI staging rows must not become runtime truth automatically; source-backed EN runtime must remain independently usable; the accepted DE Entity fingerprint must remain unchanged; generated rows in accepted EN runtime remain zero.

The classic 20260914 full-dump path is retired. The owner explicitly rejected further staging/comparison against the 103 GB dump and may delete it. Do not redownload it, require it, benchmark against it, or spend more time on BZip2/WSL/full-dump throughput. The only active Phase 12A2 acquisition path is the implemented build-time QLever selective exporter/stager.

Read `docs/ENTITY_SOURCE_ALTERNATIVES_2026-09-18.md` before changing source acquisition. Live 2026-09-18 probes verified and the repository now implements QLever selective export as the preferred Phase 12A2 fast path. Final exact measured artifacts including Wikipedia site pairs total 94,050,660 gzip bytes (~89.7 MiB) / 753,947,040 raw bytes for roughly 1.838M all-statement candidates, versus the 103.1 GB classic dump. Match the current JSON importer with `p:/ps:` all-statement P31/P106 semantics, not only `wdt:` truthy relations. Use `npm run entity:owner:stage:qlever -- --retrieval-label 20260918`; it freezes all remote artifacts before offline staging/QRank join/cut diagnostics.

Owner source bootstrap history is accepted, but only the downloaded QRank artifact remains required. The classic Wikidata 20260914 dump is no longer part of the active contract and may be deleted. QRank retrieval date 2026-09-18 is not its data vintage; the accepted response carried a 2024-03-16 Last-Modified timestamp.

Owner source acquisition is now the QLever fast path:

```text
npm run entity:owner:stage:qlever -- --retrieval-label 20260918
```

The selected Wikidata item snapshot is 20260914 with official SHA-1 `0a985a65262a665fa33808c7d40a1d42ad28d62c`. QRank is pinned by retaining the downloaded 2026-09-18 raw artifact plus local SHA-256/headers. Do not replace this with an unversioned latest-only acceptance claim.

The Phase 12A2 QLever owner staging/cut gate is complete. The accepted Hybrid-v2 retained set may now be materialized locally for the Phase 12A3 pronunciation/runtime gate. Fixture popularity values remain synthetic test scales only, never live QRank/pageview facts.

Phase 12 sequence is now:

1. 12A multilingual cultural Entity Lexicon architecture + fixture/prototype;
2. 12B English phonology + single-word Writer profile + benchmark;
3. 12C full entity pronunciation materialization + unified Writer entity channel;
4. 12D English phrase/mosaic expansion when justified.

Entity identity is language-neutral. Pronunciations are provenance-bearing variant rows such as native / de-DE / en-US, never one flattened IPA field. QRank is the selected global popularity signal; all retention cuts are category-relative. Bud Spencer / Q221074 is a protected cultural-relevance sentinel. Never invent standalone aliases by splitting arbitrary name tokens.

Do not spend the current data/algorithm phase on cosmetic UI polish or database micro-optimization. Visual/UX refinement, SQLite size/layout optimization, caching and final latency tuning are deferred until the broader databases and search/display algorithms are complete. Human NDCG remains nonblocking `pending_reference` until independent reviewers exist.

## Current project direction — Phase 11

Phase 11 German phrase/mosaic/phraseology is accepted/frozen; the next roadmap milestone is Phase 12 English. Read `docs/PHRASE_MOSAIC_PLAN.md`, `docs/PHRASE_SOURCE_SURVEY.md`, `docs/PHRASE_CATALOG_V1.md`, and `docs/PHRASE_PRONUNCIATION_V1.md`.

The owner-local Phase 11B1 full build is complete:

```text
schema                 rhymelab-phrase-catalog-v1
catalog fingerprint    f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
phrases                98,504
modern eligible        97,400
SQLite                 153.74 MiB
single-word rewired    no
```

Phase 11C pronunciation, Phase 11D retrieval, 11E2 ranking, 11E3 diversification and 11E4/F integration/acceptance are accepted/frozen. Cologne Kiezdeutsch is allowed as an additive CC BY 4.0 youth/urban/spoken signal; it must not be treated as representative German commonness or as automatic phrase/candidate generation. The bootstrap downloads transcript PDFs only, not audio.


Phase 11B2 diagnostics are complete: 15,449 modern-eligible phrases have Leipzig evidence (15.86%); the raw 98,504-row catalog is intentionally dominated by two-token multiword lexemes and contains abbreviation/surface-alias noise. Do not equate all catalog rows with songwriting phrases.

Phase 11C1 deterministic phrase pronunciation is accepted and closed after two identical owner full-data materializations.

```text
schema                  rhymelab-phrase-pronunciation-v1
policy                  de-phrase-pronunciation-v1
token resolver          writer-v5-preferred-surface-aware-v2
composition             preferred-token-citation-composition-v1
boundary policy         explicit-word-boundary-v1
IPA analyzer            de-ipa-v2
G2P fallback            none
alternate phrase IPA    none in 11C1
connected speech        none in 11C1
```

11C1 retrieves phrase-token candidates by normalized form and resolves same-normalized collisions with deterministic surface-aware priority (exact surface/case, dictionary non-entity, non-entity, current, usage, stable ids) against the accepted Writer-v5 preferred eligible pronunciation inventory. Unknown tokens remain unresolved. It stores phrase IPA, all citation stress markers, phoneme/syllable word-boundary coordinates and per-token spans without mutating the Phase 11B1 base tables/fingerprint.

Current owner full-data evidence:

```text
pronunciation fingerprint   fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
resolved tokens             195,490 / 205,957 (94.92%)
ready phrases               90,089 / 98,504 (91.46%)
ready modern phrases        89,865
base catalog unchanged      yes
```

The coverage-impact triage is now complete. Modern phrase coverage is 92.26%; 5,894 distinct unresolved normalized forms block 7,535 modern phrases. `zurecht` is a high-impact outlier (317 single-blocker modern phrases), but the remaining ranked tail becomes diffuse and mixed/noisy quickly.

Decision: do **not** block Phase 11D on a manual 11C2 lexical-gap campaign. Keep any future lexical-gap additions source-backed, optional and separate from the frozen Writer-v5 runtime. Broad G2P remains disallowed.

The repeatability gate passed: two owner full-data runs produced the identical pronunciation fingerprint `fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548`. Phase 11C1 is accepted and closed.

Phases 11D1 and 11D2 are accepted/frozen after exact owner repeatability. Phase 11D3 owner diagnostics are complete. Phase 11D4, 11E2-v2, 11E3 and the integrated 11E4/F surface are accepted/frozen. Read `docs/PHASE_11_ACCEPTANCE.md` before changing the German integrated Writer path.
Phase 11D1 owner repeatability is accepted:

```text
window fingerprint   24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
repeat equal         true
windows              356,693
```

11D2 adds a separate retrieval-anchor table; do not mutate/fold these keys back into the accepted 11D1 window fingerprint. The exact rhyme-tail key must exclude the first rhyme-syllable onset to stay consistent with `de-phon-v3`.

Phase 11D2 owner repeatability is accepted:

```text
anchor fingerprint   55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
repeat equal         true
anchors              356,693
```

11D3 owner diagnostic evidence:

```text
9/12 queries with mosaic anchors
1,771 returned candidates
989 weak candidates (55.84%)
final_nucleus_coda_class assignments 1,280 / 1,940
semantic fingerprint 294a26d670e0202a0b5171d51c16d6059eff3f03620dd5b57369a04b4a87625c
```

Decision: do **not** start 11E yet. 11D4 must stay additive over the frozen 11D2 control and address three evidence-backed issues only: full-surface multi-syllable query domains, an intermediate vowel-family retrieval channel, and removal of weak/no-relation candidates from the default returned pool. Do not retune the single-word scorer or introduce phrase ranking to solve these retrieval problems.

11D4 candidate commands:

```powershell
npm run phrase:mosaic:retrieval:v2
npm run phrase:mosaic:diagnose:v2
```

The A/B runner must reproduce accepted 11D3 semantic fingerprint `294a26d670e0202a0b5171d51c16d6059eff3f03620dd5b57369a04b4a87625c` before candidate comparisons are trusted. The accepted 11D2 fingerprint must remain unchanged.

First owner full-data 11D4 A/B quality gate passed:

```text
candidate anchor fingerprint  9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059
candidate semantic fingerprint 4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd
queries with anchors           9 -> 10
weak share                    55.84% -> 3.40%
final fallback share          65.98% -> 31.01%
```

Interpretation: remaining lexical/commonness/diversity quality is Phase 11E territory. Do not reopen 11D retrieval solely because product-poor lexical surfaces can still rank high. The repeat passed: candidate anchor fingerprint `9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059` and candidate semantic fingerprint `4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd` reproduced exactly, as did semantic aggregate counts and DB bytes.

Phase 11D is now accepted/frozen. Phase 11E phrase Writer ranking is current. Read `docs/PHRASE_MOSAIC_RANKING_V1.md`. Do not reopen 11D retrieval to solve lexical/commonness/diversity issues without new retrieval-specific evidence.

11E1 owner evidence is now complete. Suite fingerprint: `04ecde26f0a59b7615d6b2a192e7cffed26aefe86ebac07e388e546210d58845`. Only 25.22% of the 1,237 frozen candidates have Leipzig evidence; 98.54% are surface-safe; only four are marked; query-token overlap is zero.

11E2-v1 owner A/B is complete. Policy `de-phrase-writer-utility-v1-candidate` is **rejected for promotion but retained as control**. Ranking fingerprint: `593142fc70cc1e7b760d6bca3d94ea233c0bcaaf295f6f47f7659ccc7e805de4`.

Reason: safety demotion works, but commonness may outrank materially stronger same-type phonetics and `Leben` still exposes a lone weak row. Current work is 11E2-v2: commonness/type may reorder only within same safety class + relation type + conservative 0.02 phonetic near-tie band. Weak/restricted rows remain diagnostic but default Writer-page ineligible. No page diversification yet.

11E2-v2 is accepted. Accepted suite ranking fingerprint: `1d07ad486bdff8b167a7a394dafa687a60178cb43bd5a48da19044715d33d3a0`; owner A/B had zero phonetic-guard violations. Keep the 0.02 guard, Writer-page eligibility and v1 control unchanged unless new evidence justifies a revision.

11E3 phrase-channel diversity is accepted/frozen. Product rule: no phrase quota and no forced Phrase/Mosaic visibility. Word and Phrase/Mosaic channels share one UI but retain their accepted internal order because their numeric scores are not globally calibrated. Diagnostic-only/weak rows remain explicit diagnostics only.

Phrase ranking remains deferred to 11E. 
The accepted single-word Writer baseline remains frozen.


## Deferred future architecture — preserve, do not implement prematurely

After Phase 11C/11D/11E, revisit `docs/FUTURE_NATURAL_LANGUAGE_RHYME_RETRIEVAL.md`.

The preserved direction is retrieval-first natural-language rhyme generation:

```text
attested phrase/chunk data
  -> cross-word phonetic retrieval
  -> naturalness/register/context filtering
  -> optional deterministic Markov/template recombination
  -> phonetic/naturalness reranking
```

Research leads to evaluate later include RhymePad as an architecture reference, PanPhon-style feature distance, gruut as a possible pronunciation fallback benchmark, FTS5, and optional/non-core vector semantics. None are accepted production dependencies now.

Do not introduce embeddings, LLMs or ML/neural inference into the deterministic core search path without an explicit architecture decision.


## Generated pronunciation base-parity invariant

Read `docs/PRONUNCIATION_BASE_PARITY_V1.md` before changing Backfill V2 promotion/runtime behavior. eSpeak A/B generated rows are second-class and **must remain excluded from default search**, but when materialized they must use the exact same persistent schema/tables and derived runtime structures as the regular base dataset for their domain. Do not introduce a reduced generated-only schema or extra generated-only metadata model. A future runtime may expose augmented DBs only behind explicit user opt-in. Client B/C/D and unresolved U rows remain deferred and preserved. Canonical DE/EN/Phrase/Entity DB files must not be mutated.


## Generated pronunciation opt-in runtime invariant

Read `docs/GENERATED_OPTIN_RUNTIME_V1.md` before changing generated-runtime routing. Canonical Writer behavior is the default and must remain unchanged when generated opt-in is false. Generated augmented DE/EN/Phrase/Entity databases may be selected only after the Base-Parity report passes and `data/local/generated-optin-runtime-enabled-v1.json` is present and bound to that report fingerprint. The UI checkbox is explicit, default-off and not persisted. Do not create separate generated ranking/scoring logic. Generated overlay query references must remain marked generated rather than being relabeled source-backed. Client B/C/D/U remain outside runtime.
