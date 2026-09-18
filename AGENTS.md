# AGENTS.md — RhymeLab

This repository is the authoritative engineering/project memory for RhymeLab. Repository state beats chat history.

## Required continuity read

Before changing the project in a fresh thread/session, read:

1. `docs/HANDOVER.md`
2. `STATUS.md`
3. `PROJECT_STATE.json`
4. `ROADMAP.md`
5. `DATA_SOURCES.md`
6. `docs/WRITER_SEARCH_ACCEPTANCE.md`
7. `docs/PHRASE_MOSAIC_PLAN.md`
8. `docs/FUTURE_NATURAL_LANGUAGE_RHYME_RETRIEVAL.md`
9. `docs/REPOSITORY_GOVERNANCE.md`
10. `docs/BENCHMARK.md` for rhyme-quality/ranking work
11. `docs/API.md` for local API work

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

## Current project direction — Phase 11

Phase 11 German phrase/mosaic/phraseology is current. Read `docs/PHRASE_MOSAIC_PLAN.md`, `docs/PHRASE_SOURCE_SURVEY.md`, `docs/PHRASE_CATALOG_V1.md`, and `docs/PHRASE_PRONUNCIATION_V1.md`.

The owner-local Phase 11B1 full build is complete:

```text
schema                 rhymelab-phrase-catalog-v1
catalog fingerprint    f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
phrases                98,504
modern eligible        97,400
SQLite                 153.74 MiB
single-word rewired    no
```

Current work is Phase 11C phrase-pronunciation quality plus phrase-data diagnostics. Cologne Kiezdeutsch is allowed as an additive CC BY 4.0 youth/urban/spoken signal; it must not be treated as representative German commonness or as automatic phrase/candidate generation. The bootstrap downloads transcript PDFs only, not audio.


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

Phase 11D1 is accepted/frozen after two identical full-data window fingerprints. Current milestone is Phase 11D2 bounded indexed candidate retrieval. Read both `docs/PHRASE_MOSAIC_RETRIEVAL_V1.md` and `docs/PHRASE_MOSAIC_RETRIEVAL_V2.md` before changing mosaic code.
Phase 11D1 owner repeatability is accepted:

```text
window fingerprint   24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
repeat equal         true
windows              356,693
```

11D2 adds a separate retrieval-anchor table; do not mutate/fold these keys back into the accepted 11D1 window fingerprint. The exact rhyme-tail key must exclude the first rhyme-syllable onset to stay consistent with `de-phon-v3`.

The first owner full-data 11D2 build is complete:

```text
anchor rows             356,693
exact-tail keys         181,548
vowel keys               52,174
final class keys             772
anchor fingerprint      55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
```

Current owner gate:

```powershell
npm run phrase:mosaic:retrieval
```

Repeat once more and require the identical anchor fingerprint before representative query diagnostics. Phrase ranking remains deferred to 11E. 
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
