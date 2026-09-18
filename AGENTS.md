# AGENTS.md — RhymeLab

This repository is the authoritative engineering/project memory for RhymeLab. Repository state beats chat history.

## Required continuity read

Before changing the project in a fresh thread/session, read:

1. `docs/HANDOVER.md`
2. `docs/PHASE_11_ACCEPTANCE.md`
3. `STATUS.md`
4. `PROJECT_STATE.json`
5. `ROADMAP.md`
6. `DATA_SOURCES.md`
7. `docs/WRITER_SEARCH_ACCEPTANCE.md`
8. `docs/PHRASE_MOSAIC_PLAN.md`
9. `docs/FUTURE_NATURAL_LANGUAGE_RHYME_RETRIEVAL.md`
10. `docs/REPOSITORY_GOVERNANCE.md`
11. `docs/BENCHMARK.md` for rhyme-quality/ranking work
12. `docs/API.md` for local API work
13. `docs/ENTITY_SOURCE_ALTERNATIVES_2026-09-18.md` for Phase 12A source-acquisition work
14. `docs/ENTITY_LEXICON_PLAN.md` and `docs/ENTITY_STAGING_V1.md` for Phase 12A entity/popularity work
15. `docs/ENTITY_CUT_HYBRID_V1.md` and `docs/ENTITY_CUT_HYBRID_V2.md` while the Phase 12A2 popularity-cut candidate review is active

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

## Hard runtime boundary

RhymeLab is local-only. GitHub is source control/project memory, not runtime. Runtime data lives in local SQLite under `data/local/`; generated bulk data, benchmark queues/reviews/reference labels, reports, and downloaded raw source files remain gitignored.

Do not introduce hosted/provider runtime, remote database bindings, telemetry, automatic uploads, advertising, or hidden network behavior without an explicit architecture decision.

RhymeLab core rhyme retrieval, scoring, writer ranking and result diversification must remain deterministic and locally executable on ordinary consumer hardware. Do not introduce LLM inference, machine-learning model inference, neural ranking, hosted ranking/search services, or a network dependency into the core search path. External models may be used only as optional benchmark/reference evidence; they must never be required to build, run, reproduce, or explain core search results.

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
- Public web visibility alone does not make a source legally/reproducibly ingestible.
- External-model reference labels are evidence, not human-expert gold.
- Protect accepted exact-rhyme behavior unless strong evidence requires otherwise.
- Ranking changes stay isolated from scorer/relation changes unless the task explicitly requires both.
- Do not optimize benchmark gains that conflict with default lexical/product quality.
- Human Writer NDCG is deliberately deferred until the broader German writer surface is mature and independent human reviewers are available; the owner alone is not an independent gold source.

## Current default runtime — v0.11.0

The accepted German single-word Writer runtime is now the normal `npm run dev` / UI / API path:

```text
package               v0.11.0
default DB            data/local/rhymelab-v5.sqlite
default DB schema     rhymelab-local-db-v5
writer runtime        materialized-writer-v5-v1
writer ranking        deterministic_writer_utility_v6
right-edge anchor     de-right-edge-anchors-v1
anchor storage        compact-primary-key-v2
candidate basis       legacy-vowel-key-string-suffix-v1
morphology            de-attested-right-head-v4
construction          de-adverbial-weise-v2
morphology storage    positive-evidence-compact-v2
```

Normal startup requires the v5 Writer DB. The v4 DB is optional and must not be treated as the product default again without an explicit rollback decision.

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

The accepted product path is one unified Writer UI at `/` and `GET /api/writer`. There is no separate `/phrases` product route. Phrase catalog/detail APIs remain internal read-only support for result inspection and diagnostics.

Frozen product rules:

- single-word Writer v5/v6 remains unchanged;
- 11D4 retrieval, 11E2-v2 ranking and 11E3 diversity remain frozen;
- no Phrase/Mosaic quota or forced visibility;
- no invented cross-channel score calibration;
- zero Phrase/Mosaic results remain valid;
- no guessed/G2P pronunciation for unresolved multi-word input;
- `DE / EN / DE+EN` remains the unified language-basis contract;
- English stays capability-gated until Phase 12 supplies a real accepted English runtime.

Current milestone: **Phase 12A — multilingual cultural Entity Lexicon**. Read `docs/ENTITY_LEXICON_PLAN.md` before entity/popularity/pronunciation work.

Current implementation gate is the deterministic fixture/prototype:

- `sources/entity/wikidata-entity-taxonomy-v1.json`;
- `fixtures/entity/wikidata-cultural-v1.json`;
- `scripts/entity-lexicon-core.mjs`;
- `scripts/build-entity-fixture.mjs`;
- `npm run entity:fixture`.

Phase 12A1 fixture CI and the owner-local report gate are accepted. Accepted semantic fingerprint:

```text
23e668d7a327982ba7367c875749d17d19697466cfa438a67df7a2d7ed9f4bba
```

Current work is **12A2 Wikidata + QRank staging / final popularity-cut review**. Read `docs/ENTITY_STAGING_V1.md`, `docs/ENTITY_CUT_HYBRID_V1.md`, and `docs/ENTITY_CUT_HYBRID_V2.md`. The original QRank-present-first cut and Hybrid-v1 are retained as controls; Hybrid-v1 owner fingerprint `e770c1cfc655764e9e0f26e033c53fba0f1e1af4e2ca3b7ac82adf4eabde1e04` is rejected for freeze because `organization.company` still has zero missing-QRank retention. Hybrid-v2 geometric missing-evidence normalization is the active owner A/B gate.

The classic 20260914 full-dump path is retired. The owner explicitly rejected further staging/comparison against the 103 GB dump and may delete it. Do not redownload it, require it, benchmark against it, or spend more time on BZip2/WSL/full-dump throughput. The only active Phase 12A2 acquisition path is the implemented build-time QLever selective exporter/stager.

Read `docs/ENTITY_SOURCE_ALTERNATIVES_2026-09-18.md` before changing source acquisition. Live 2026-09-18 probes verified and the repository now implements QLever selective export as the preferred Phase 12A2 fast path. Final exact measured artifacts including Wikipedia site pairs total 94,050,660 gzip bytes (~89.7 MiB) / 753,947,040 raw bytes for roughly 1.838M all-statement candidates, versus the 103.1 GB classic dump. Match the current JSON importer with `p:/ps:` all-statement P31/P106 semantics, not only `wdt:` truthy relations. Use `npm run entity:owner:stage:qlever -- --retrieval-label 20260918`; it freezes all remote artifacts before offline staging/QRank join/cut diagnostics.

Owner source bootstrap history is accepted, but only the downloaded QRank artifact remains required. The classic Wikidata 20260914 dump is no longer part of the active contract and may be deleted. QRank retrieval date 2026-09-18 is not its data vintage; the accepted response carried a 2024-03-16 Last-Modified timestamp.

Owner source acquisition is now the QLever fast path:

```text
npm run entity:owner:stage:qlever -- --retrieval-label 20260918
```

The selected Wikidata item snapshot is 20260914 with official SHA-1 `0a985a65262a665fa33808c7d40a1d42ad28d62c`. QRank is pinned by retaining the downloaded 2026-09-18 raw artifact plus local SHA-256/headers. Do not replace this with an unversioned latest-only acceptance claim.

Do not materialize the final large Entity Lexicon yet. First run the QLever owner staging/cut diagnostics on D:, then review category distributions and size. Fixture popularity values remain synthetic test scales only, never live QRank/pageview facts.

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
