# RhymeLab — Thread Handover

Last updated: 2026-09-18

Repository state is authoritative. Do not reconstruct project state from prior chats.

## Active milestone

**Phase 12B — English single-word Writer database + real English phonology/profile/benchmark. 12B3 candidate is current.**

Read first:

1. `AGENTS.md`
2. `docs/ENGLISH_WRITER_SOURCE_PLAN.md`
3. `docs/WRITER_SEARCH_ACCEPTANCE.md`
4. `docs/PHASE_11_ACCEPTANCE.md`
5. `DATA_SOURCES.md`
6. `ROADMAP.md`
7. `PROJECT_STATE.json`
8. `docs/ENTITY_PHASE_12A_DEFERRED_CHECKPOINT.md` only for the frozen Entity boundary

## Frozen German baseline

Phase 11 German Word + Phrase/Mosaic is **COMPLETE / ACCEPTED / FROZEN**.

Normal German single-word runtime:

```text
package               v0.11.0
DB                    data/local/rhymelab-v5.sqlite
schema                rhymelab-local-db-v5
runtime               materialized-writer-v5-v1
ranking               deterministic_writer_utility_v6
analyzer              de-ipa-v2
writer anchor         de-right-edge-anchors-v1
morphology            de-attested-right-head-v4
construction          de-adverbial-weise-v2
```

Accepted German single-word evidence includes:

```text
forms                          838,209
pronunciations                 904,836
DB                             819.77 MiB
retrieval equivalence          PASS
morphology regressions         10/10
repeatability                  PASS
suite fingerprint
c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab
```

Phase 11 Phrase/Mosaic final integrated acceptance:

```text
status                         ok
protected checks               PASS
frozen Word equivalence        PASS
performance gate               PASS
repeatability                  PASS
semantic fingerprint
9c5ea5fcd67d74c58393cb25da854c3ed7a7ef2d6ea658d26614a194dd745694
```

Do not retune the German Writer/Phrase stack while building English.

## English 12B owner gate / current candidate

Owner bootstrap and full 12B2 summary completed on 2026-09-18:

```text
English entries                         1,492,835
distinct headwords                      1,355,827
Writer candidate surfaces               1,084,050
Wiktionary IPA coverage                     7.29%
CMUdict candidate coverage                  8.77%
combined pronunciation coverage            13.77%
ESDB candidate coverage                    22.19%
wordfreq candidate coverage                17.92%
```

12B3 candidate now provides deterministic CMUdict ARPAbet + Wiktionary IPA normalization, English-specific rhyme features/scoring, US/UK and rhotic/non-rhotic fixture coverage, and a 22-entry / 19-check fixture command: `npm run en:phonology:fixture`.

English remains candidate-gated; no English runtime DB or broad G2P is accepted yet. Next engineering stage after fixture review is 12B4 source-backed publish materialization.

## Product contract

The accepted product surface is the unified Writer/RhymePad workspace.

Language basis remains:

```text
DE
EN
DE+EN
```

German is active. English is capability-gated until Phase 12B supplies a real accepted English runtime.

Do not redesign the product surface for Phase 12B. Add the English capability behind the existing contract.

## Entity work — deferred / frozen checkpoint

Phase 12A Entity work is intentionally paused while the English single-word Writer is built.

Authoritative deferred checkpoint:

`docs/ENTITY_PHASE_12A_DEFERRED_CHECKPOINT.md`

Accepted Entity population baseline:

```text
Hybrid-v2 fingerprint
337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201

retained entities
1,077,644

Bud Spencer / Q221074
KEEP / Tier A
```

Last owner-run conservative DE Entity pronunciation evidence:

```text
DE names considered        716,940
runtime-ready               90,224 / 12.58%
unresolved                 626,716
analyses                    90,224
anchors                    569,995
runtime fingerprint
38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3
```

Completed Entity source-coverage diagnostic:

```text
preferred runtime coverage                12.78%
CMUdict full unresolved matches          261,833 / 41.78%
CMUdict partial unresolved matches       233,283 / 37.22%
CMUdict no-token unresolved matches      131,600 / 21.00%
preferred CMUdict full-token matches     227,428
probe-only preferred ceiling               52.18%
diagnostic fingerprint
69e6ec4d14091d22c5a76ca5869d38908f09f95fcac248b2e6791f329ad99bfa
```

PR #70 added a qualified Wikidata P898 source-evidence pipeline, but the owner explicitly **has not run** the new P898 owner workflow.

Therefore:

- do not claim owner P898 coverage;
- do not run Entity enrichment as the first step of the next thread;
- do not restage QLever/QRank;
- do not mass-G2P Entity names;
- resume Entity work only after a real English phonology/runtime exists.

## Phase 12B source decision

Contract:

`docs/ENGLISH_WRITER_SOURCE_PLAN.md`

The selected architecture is layered rather than one giant unqualified word list.

### Primary lexical source — English Wiktionary via Kaikki/Wiktextract

Current research snapshot:

```text
English distinct word forms       1,390,507
English senses                    1,787,236
enwiktionary dump                 2026-09-02
Kaikki extraction                 2026-09-16
raw enwiktionary JSONL            23.5 GB
raw gzip                           2.7 GB
```

Use the raw Wiktextract stream and filter `lang_code === "en"`.

It provides lexical forms, POS, inflections, form-of/alt-of relations, IPA, pronunciation tags, register/history tags and other source evidence.

License boundary: Wiktionary-derived data remains under Wiktionary CC BY-SA + GFDL terms. Keep third-party-derived data/provenance separate from Graph1ks Material exactly as with the German source stack.

### Primary en-US pronunciation overlay — CMUdict

Use exact CMUdict pronunciations as the strong en-US overlay/control.

RhymeLab already has a checksum-pinned CMUdict artifact for Entity diagnostics in `sources/entity/cmudict-entity-pronunciation-v1.json`.


CMUdict commercial use is unrestricted; preserve acknowledgment.

Do not treat ARPAbet as IPA. Build a deterministic English phone normalization layer.

### Secondary lexical/dialect evidence — ESDB / SCOWL v2

Use as independent evidence for:

- US/GB/CA/AU spelling;
- variants;
- inflection;
- basic POS;
- archaic/uncommon/invalid classes;
- spellchecker-quality lexical sanity.

It is not pronunciation truth and not fine-grained usage truth.

### Usage/commonness candidate — wordfreq

Use initially as ranking/commonness evidence only.

Important:

```text
English large list available
multiple text domains
frequency data snapshot through ~2021
data unlikely to receive new language-frequency updates
```

Do not make wordfreq lexical truth. Benchmark modern songwriting/rap vocabulary before final acceptance; add a separate modernity overlay later if required.

## English scale interpretation

The answer to “does English have about a million words?” depends on what is counted.

For the selected current machine-readable source, **yes: there are about 1.39M distinct English word forms**.

That is not equivalent to 1.39M normal modern songwriting words.

The raw source includes inflections, specialist vocabulary, archaic/obsolete forms, dialects, proper names, abbreviations and variants. The default Writer population must be determined from diagnostics, not a preselected count.

Do not quote the 10M+ total English-Wiktionary edition entry count as “English words”; that edition contains thousands of languages.

## Phase 12B hard boundaries

- English gets its own analyzer/scorer/profile.
- Do not emulate English through German phonology.
- Preserve pronunciation variants and source dialect tags.
- en-US is the initial default profile; preserve useful source-backed en-GB variants.
- Frequency/commonness is ordering evidence, not lexical truth.
- Historical/obsolete forms are hidden by default, not deleted.
- No broad G2P before source-coverage diagnostics.
- Core search remains deterministic/local/offline.
- No LLM/ML/neural inference in core retrieval/ranking.
- Keep English DB separate from frozen German DB during development.
- Do not start Phase 13 cross-language rhyme during Phase 12B.

Proposed English DB target:

```text
data/local/rhymelab-en-v1.sqlite
```

## Phase 12B1/12B2 implementation checkpoint

The source-workflow tooling is now implemented:

```text
registry              sources/en/phase12b-sources-v1.json
bootstrap             npm run en:sources:bootstrap
diagnostics           npm run en:sources:diagnose
bootstrap report      data/local/en-source-bootstrap-v1-report.json
diagnostic report     data/local/en-source-diagnostics-v1.json
```

Pinned static artifacts are CMUdict `74790861…`, ESDB/SCOWL v2 `1e5b7d3a…`, and wordfreq `912caf64…`. The moving Kaikki raw URL is guarded against the selected 2026-09-02 Wiktionary dump / 2026-09-16 extraction metadata before a fresh download, then locally pinned by SHA-256.

The full owner-local bootstrap/diagnostic has **not** been executed at this checkpoint. Do not invent 12B2 coverage numbers and do not freeze the final Writer row count from the research-scale 1.39M figure.

## Next-thread execution order

Continue with the **owner 12B1 bootstrap + 12B2 diagnostic review**, not UI work.

1. run `npm run en:sources:bootstrap`;
2. run `npm run en:sources:diagnose`;
3. inspect lexical/form/proper-name/history/pronunciation coverage;
4. inspect CMUdict exact matches, ESDB disagreements and wordfreq ranked coverage;
5. only after that evidence is understood, design the English phonology fixture/analyzer/scorer;
6. materialize the first English Writer candidate DB only after the source diagnostic is accepted.

Required diagnostics are specified in `docs/ENGLISH_WRITER_SOURCE_PLAN.md`.

## Repository workflow

Public `main` is authoritative.

Changes go:

```text
branch
-> PR
-> required validate check
-> merge
```

Required check/job:

`validate`

Before public-facing merge:

```bash
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

Runtime remains local-only. Bulk source data, generated DBs and generated reports stay gitignored/local.

## Immediate next action

In the new thread, run/review the implemented **Phase 12B1 owner source bootstrap and Phase 12B2 full source diagnostics** from `docs/ENGLISH_WRITER_SOURCE_PLAN.md` before starting 12B3.

Do not ask the owner to execute the deferred Entity P898 workflow first.
