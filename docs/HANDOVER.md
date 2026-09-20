# CURRENT BRANCH HANDOVER — Phase 12C runtime + AI staging

Durable project identity, solo-dev repository mode, architecture boundaries, cost/licensing/contribution policy, and QA expectations now live in `PROJECT.md`. Read it immediately after `AGENTS.md`; current technical continuation remains in the focused Phase 12C handover below.

Current UI/API follow-up: query-pronunciation language and result language are now separate contracts. A source-backed DE query may request EN word results by re-analyzing the resolved source pronunciation under the accepted English target phonology and then using the existing indexed English retrieval/scoring/ranking stack; accepted same-language paths are unchanged. Entity category filters are populated from runtime capabilities. Standard unfiltered browsing uses per-section More buttons, while endless scrolling is limited to an explicitly selected rhyme/sound relation. Individual result inspectors no longer repeat source labels; the UI has one alphabetized Sources dialog. EN -> DE word bridging remains intentionally unimplemented pending an explicit target-pronunciation adaptation policy.

Current unknown-query boundary: missing pronunciation may occur in a single word **or anywhere inside a multi-word user query**. Only query spelling/token -> IPA generation runs in the end-user client via `src/ui/query-pronunciation-client.mjs`. Existing DB pronunciation is used token-by-token when available; only missing token pronunciations are generated, then the browser composes an ephemeral phrase/word IPA and submits it to `/api/writer`. Existing Word/Phrase/Entity retrieval, scoring, ranking and result behavior remain authoritative. eSpeak-NG is benchmark/development-only under `scripts/`. Regression sentinel: `heute abend große gangbang party`. Manual browser flow: `/query-pronunciation-test`. Generated OOV token pronunciations now use a bounded revision-gated IndexedDB cache: the normal initial `/api/health` request supplies `query_pronunciation_revision`; cache reuse is allowed only when DB revision and resolver policy still match. Source-backed pronunciation remains authoritative. Focused continuation: `docs/QUERY_PRONUNCIATION_CLIENT_HANDOVER.md`.

Current owner-only bulk cleanup: `docs/PRONUNCIATION_BACKFILL_V2.md` is authoritative. The owner-local inventory has been consumed: Backfill V2 no longer depends on the absent `data/de/core/` stage and now reconstructs the DE source universe from `data/de/usage/de-usage.tsv` plus the original German Kaikki snapshot, while English uses the existing publish lexical-candidate functions over the pinned raw Kaikki source. Phrase/Entity remain pronunciation-independent catalog diffs. Use `npm run pronunciation:backfill:plan` for a no-write source preflight before collection.

Backfill V2 collection has completed locally with 6,033,818 unique pending items / 6,200,338 source refs. The audit and 1000-case eSpeak-vs-client calibration are complete. eSpeak is the stronger primary generator against held-out source-backed controls; the client remains analyzer-rejection fallback. The next owner gate is now `npm run pronunciation:backfill:admit`, which materializes the resumable source-aware admission/noise policy without recollecting. Review `data/local/pronunciation-backfill-v2-admission-report.json`, then run `npm run pronunciation:backfill:highspeed:test`. The current owner direction is fixed at 4 eSpeak workers; the v2 test measures stable batch sizes instead of increasing process concurrency. The eSpeak phase now also defaults to 4 persistent IPA analyzer worker threads; benchmark with `--analyzer-workers 0` only as the main-thread control. If a resumed full run enters complex Entity/Phrase surfaces, framed batches preserve one-row ownership even when eSpeak emits multiple IPA lines; watch `recent=.../s` and process-mode counts for regressions. Current framing policy is `shape-aware-sparse-boundary-v2`: plain lexical rows are unframed; complex rows use sparse 16-row markers; only ambiguous sparse groups enter `dense_framed_rescue`. Use `npm run pronunciation:backfill:framing:test` before another resume after pulling this change. The admitted population then runs through `npm run pronunciation:backfill:espeak -- --workers 4 --espeak-batch-size <measured stable value> --analyzer-workers 4`. Admission integrity must show `work_items == admission_decisions`; legacy no-source rows are review-only and do not require recollection.



For the accepted Phase 12C state on current `main`, read this focused handover **before the historical material below**:

```text
docs/PHASE_12C_ENTITY_RUNTIME_AI_STAGING_HANDOVER.md
```

Current status: the **source-backed Phase 12C owner full-data gate is accepted and merged to `main` via PR #112**. The full local run passed materialization, multilingual verification and Entity Writer acceptance with 710,500 EN runtime-ready names, 705,050 unresolved names, 3,552,500 EN rhyme anchors, preserved DE fingerprint, deterministic ranking/repeatability and no generated/LLM runtime promotion. EN runtime fingerprint: `3f2c520ce99868eda81991e6247c6c93bdf8c78f7805d7ceef2cc2ebd85bb6d8`. Entity Writer latency remains follow-up work because the owner sample is still hundreds of milliseconds p50 and >1s p95. AI pronunciation work is explicitly **Top-100k targeted only**: future annotation covers runtime-unresolved English names attached to the 100,000 highest-priority retained Entities under accepted popularity ordering; the remaining long tail stays unresolved by default. Historical 704,989-row queue artifacts remain immutable evidence rather than the forward campaign. Benchmark-v3 context-gold review remains pending for the separate AI-evidence track only. Never promote AI staging into runtime without a later explicit gate.

Current acceptance documents:

- `docs/PHASE_12C_ACCEPTANCE.md`
- `docs/ENTITY_AI_PRONUNCIATION_STAGING_V1.md`

---

# Historical thread handover material

The material below is preserved for chronology. The current Phase 12C block above and its linked documents override stale milestone wording below.

Last updated: 2026-09-18

Repository state is authoritative. Do not reconstruct project state from prior chats.

## Active milestone

**Phase 12B11 — English product integration acceptance. English Writer ranking candidate is selected; product EN is still gated.**

Read first:

1. `AGENTS.md`
2. `docs/ENGLISH_WRITER_SOURCE_PLAN.md`
3. `docs/WRITER_SEARCH_ACCEPTANCE.md`
4. `docs/PHASE_11_ACCEPTANCE.md`
5. `DATA_SOURCES.md`
6. `ROADMAP.md`
7. `PROJECT_STATE.json`
8. `docs/ENTITY_PHASE_12A_DEFERRED_CHECKPOINT.md` only for the frozen Entity boundary

## Current checkpoint — 2026-09-19

English Product Phase 12B11 is **accepted and frozen**.

```text
product runtime                    en-writer-product-v1-candidate
product policy                     en-writer-guarded-quality-diversity-v1-candidate
Quality                            guarded_commonness_06
Diversity                          0.08
retrieval profile                  en-product-retrieval-reservoir-v1
product acceptance fingerprint     c889adf2253f3b149d6363f2063b40717b79a4f0cf24a06c953a599a66613ca6
repeatability suite fingerprint    26a6e97ddf3f17fcf6721e4487f136badd4838edce13b2020d376dbacc48115d
enablement marker                  data/local/en-product-enabled-v1.json
```

All integrated checks passed, including frozen German direct-vs-unified equivalence, EN language isolation, `time -> rhyme`, `nation -> station`, `record` stress variants, `route` alternates, DE+EN composition, unknown-query no-fake-pronunciation behavior, and independent-open repeatability.

Do not reopen English acceptance. Phase 12C Entity work is now active.

The next step is deliberately consolidated rather than split into P898 / CMUdict / EN / token-composition micro-gates:

```text
command  npm run entity:multilingual:evidence
report   data/local/entity-multilingual-pronunciation-evidence-v1-report.json
```

That one command:

1. runs the existing Entity pronunciation owner workflow;
2. preserves the accepted 1,077,644-entity Hybrid-v2 population;
3. requires DE Entity runtime fingerprint `38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3`;
4. materializes Wikidata P898 as source evidence only;
5. validates the accepted English DB/enablement marker/profile;
6. audits every searchable English Entity name for exact accepted en-US pronunciation;
7. attempts bounded source-backed token composition up to 6 tokens;
8. emits aggregate coverage/source/unresolved diagnostics only.

It does **not** promote English Entity runtime rows, does not promote generic P898 language evidence to a regional locale, does not use broad G2P, and does not retune Entity popularity.

After merge, run exactly:

```powershell
git pull
npm run entity:multilingual:evidence
```

Upload only the compact primary report. If it is `evidence_ready`, the next implementation step is one source-backed multilingual Entity runtime pass rather than another coverage micro-gate.

## Active Phase 12C — proper-name token G2P benchmark v2

The first 600-case benchmark preparation was **rejected before running any G2P model**.

```text
v1 fingerprint             e9b6e47cc91cee2e9410136f1e40de97c979679532b1a8eda62f26974eb62d7c
cases                      600
single-word Entity surface 599
multi-word Entity surface    1
CMUdict-backed cases       592
distinct normalized        578
duplicate normalized        22
G2P executed                no
```

Problem: v1 sampled whole Entity surfaces and mostly measured ordinary CMUdict-like spellings. The generated fallback actually needs to solve the **unknown token** that blocks deterministic Entity-name composition.

v2 is implemented around that real unit:

- unique normalized Entity-name tokens;
- token must occur in a preferred searchable English Entity name;
- explicit en-US Kaikki/Wiktionary proper-name IPA is the benchmark gold;
- CMUdict is not benchmark gold;
- duplicate normalized controls are forbidden;
- Entity category/popularity context remains attached.

Read `docs/ENTITY_G2P_PROPER_NAME_BENCHMARK_V2.md`.

After merge, there is no separate v2 upload gate. Run the owner command inside the **Miniforge Prompt with `(rhymelab-mfa)` visibly active**. Install/activate the pinned MFA environment once if needed, then run one owner command. It rebuilds benchmark v2 first and refuses to continue if the v2 invariants fail:

```powershell
git pull
npm run entity:g2p:benchmark:mfa
```

Upload only the final compact evaluation:

```text
data/local/entity-g2p-mfa-en-us-arpa-evaluation-v2.json
```

Primary MFA target is public release `english_us_arpa` v2.0.0a (ARPA / Pynini / CC BY 4.0), chosen because its output is directly compatible with the accepted RhymeLab English analyzer. The runner validates Pynini + the complete 69-phone ARPA inventory and records MFA's internal inspect version/fingerprint; it does not require the internal archive version string to equal the public release label.

## MFA v2 owner rerun required — input normalization fix

The first MFA execution must **not** be interpreted as a model benchmark:

```text
benchmark cases       600
prediction rows        13
evaluated              13
missing               587
partial exact-tail   76.92%
partial rhyme score 0.923103
model verdict          none
```

Cause: MFA's word-list generator removes graphemes not present in the G2P model. The ARPA model has lowercase `a-z` plus apostrophe; the runner fed display-case Proper Names. The resulting cleaned spellings could not be mapped back to most benchmark tokens.

The fixed runner now creates explicit model inputs from the benchmark normalized token:

```text
Toyota     -> toyota
Céline     -> celine   (recorded diacritic fold)
O’Connor   -> o'connor
```

Unsupported residual graphemes are marked model-ineligible rather than silently removed. The owner run hard-fails if either model-input eligibility or prediction coverage over eligible cases falls below 95%.

Run **inside Miniforge Prompt with `(rhymelab-mfa)` visibly active**:

```powershell
cd D:\rhymelab
git pull
npm run entity:g2p:benchmark:mfa
```

Upload only the new `data/local/entity-g2p-mfa-en-us-arpa-evaluation-v2.json`.

## Phase 12C — generated proper-name G2P closed; source-backed runtime next

Generated proper-name G2P is **closed with no runtime promotion**.

Accepted 600-case control fingerprint:

```text
02e0e3a330434676164bb6837793774a3edf69fdb7683b6035fa2cdf979b172a
```

Final candidate comparison:

```text
                              MFA         g2p-en neural
model-input eligible            599/600     596/600
eligible prediction coverage    100%        100%
evaluated                       597         596
exact phones                    70.35%      64.60%
exact stressed rhyme tail       71.19%      64.26%
syllable count                  95.98%      93.62%
stress pattern                  80.57%      81.88%
primary stress                  94.14%      91.95%
mean rhyme score                0.913040    0.891655
```

MFA confidence gating was already insufficient:

```text
best 10% exact-tail                 86.67%
retention at >=90% exact-tail       1.68%
retention at >=85% exact-tail      21.94%
```

The independent `g2p-en` benchmark forced `G2p.predict()` and bypassed CMUdict, homograph and POS lookup. Its owner report fingerprint is:

```text
5511c6e2c83550b753692a64a1485302c88b61b5bc4acecf4a3a8e29937061b6
```

Its `confidence_calibration` block is not accepted evidence because the model emits no confidence and the evaluator converted `null` to `0`. Primary metrics are unaffected; the evaluator is fixed and no rerun is required.

Decision:

- reject MFA runtime fallback;
- reject g2p-en runtime fallback;
- do not benchmark/model-stack a third G2P candidate;
- do not mass-generate the remaining 704,989 unresolved English Entity names;
- keep unresolved names unresolved;
- use only accepted source-backed pronunciation evidence at runtime.

Read `docs/ENTITY_G2P_DECISION_V1.md`.

### Next Phase 12C gate

Continue with **source-backed Entity pronunciation/runtime integration** using the already accepted source-expansion evidence. Generated G2P is out of scope unless a future explicit decision reopens it.

No Miniforge/G2P owner command is pending.

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

12B3 now has an owner-confirmed fixture PASS: 22 entries / 19 checks / 0 failures. It provides deterministic CMUdict ARPAbet + Wiktionary IPA normalization, English-specific rhyme features/scoring, and US/UK plus rhotic/non-rhotic coverage.

12B4 full-data build + verify passed:

```text
published surfaces                 147,904
default eligible                    72,946
analyzed en-US                     111,574
pronunciation variants             274,819
unresolved variants                 35,000
publish semantic fingerprint
4087cc8a41eff75a24e5cf33c25da1db0760bae658c7eb979a482c68acd56124
```

One independent rebuild is still required before freezing 12B4. Run `npm run en:publish:repeatability`.

12B5 owner build + verify passed. Contract: `docs/ENGLISH_WRITER_DB_V1.md`.

```text
forms                            147,904
default eligible                  72,946
pronunciations                   274,819
analyzed pronunciations          239,819
unresolved pronunciations         35,000
default-profile pronunciations   101,330
SQLite                            115.57 MiB
DB semantic fingerprint
fa078705ff6f4ae157b88301f6dea84933008590ff3f8c376832c684a1baca0b
retrieval equivalence            80 samples / 0 mismatches
```

The first full coverage audit is complete. It confirms a heavily frequency-skewed English population: only 41,125 published EN forms are unranked versus 577,759 unranked DE forms. Top-100k coverage falls to 69.75% published / 50.46% default.

A confirmed bug in the old publish policy marks a whole entry historical when any flattened sense tag is archaic/obsolete/historical/dated. Candidate policy `en-source-backed-publish-v2-candidate` fixes this by requiring no current sense before historical-only exclusion.

The history-fix rebuild is complete and repeatable: default eligible 75,695 (+2,749), Top-10k default 94.38%, Top-100k default 52.52%, and historical-only losses collapsed to 1 / 67 / 208 at Top-10k / 50k / 100k.

A second confirmed classifier defect remains: sense-level proper-name tags can poison a common record. `college` is the protected example. Candidate policy `en-source-backed-publish-v3-candidate` fixes this.

The v3 owner rerun is complete. Proper-name classifier impact was only +2 default rows; the remaining proper-name block is mostly real name/place material. The current gate is **not ranking yet**: rerun the improved coverage audit once to materialize the full 311,685-row review sidecar and stratified random sample, then review representative losses across rank bands before changing lexical admission or pronunciation policy.

English remains candidate-gated; no product EN runtime and no broad G2P is accepted yet.

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

The owner bootstrap and 12B2 diagnostics are complete. The 12B3 owner fixture also passes. Do not regress these gates or reinterpret the raw 1.39M research scale as a final Writer population.

## Next-thread execution order

Continue with the **12B6 proper-name fix + rescue audit**, not UI work and not Entity work.

1. run `npm run en:publish`;
2. run `npm run en:publish:verify`;
3. run `npm run en:publish:repeatability`;
4. run `npm run en:db` and `npm run en:db:verify`;
5. run `npm run en:coverage:audit`;
6. inspect proper-name Top-N deltas plus `esdb_plus_cmudict_non_wiktionary`, regular-inflection-shape, orthographic-variant, and published-no-en-US locale breakdowns;
7. do not inherit arbitrary `form_of` pronunciation blindly; examples such as `ii -> second` prove semantic/form relations are not phonological rules;
8. only then select the next controlled coverage expansion before ranking.

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


### Unknown-query product requirement

Read `docs/UNKNOWN_QUERY_PRONUNCIATION_FALLBACK.md`.

Unknown user input must not terminate as "word not found". After source-backed lookup fails, the eventual runtime must support a deterministic, local, language-specific **ephemeral query pronunciation** path:

```text
surface -> DE/EN resolution -> query G2P -> IPA/pronunciation analyzer -> syllables/stress/rhyme keys -> normal indexed retrieval
```

Generated query pronunciation is never silently persisted as lexical truth. In `DE+EN`, if the language cannot be resolved from a source-backed match, ask the user whether the intended reading is German or English.


### 12B6 stratified coverage review result

The owner stratified sample has been reviewed across the full ranked range.

Strong immediate candidates:
- 4,036 exact-CMUdict possessive surfaces with an analyzed en-US base;
- 168 punctuation-only aliases to analyzed en-US lemmas.

Large gated candidates:
- 13,454 regular-inflection-shape rows, but abbreviation/contraction noise proves morphology must be tag-gated;
- 14,821 published rows without analyzed en-US, with review samples dominated by already analyzed unprofiled IPA;
- 52,864 no-source-pronunciation rows, including many initialisms/abbreviations and genuine lexical items;
- 26,264 proper-name-only rows, which belong to a separate searchable channel/product policy rather than being treated as ordinary common words.

Run the two cheap diagnostics next; neither restreams Kaikki:

```powershell
npm run en:coverage:rescue
npm run en:pronunciation:fallback:diagnose
```

Use their exact counts/agreement rates to define publish v4. Do not broad-G2P the tail.


### 12B6 exact rescue + fallback owner results

The cheap owner diagnostics are now complete:

```text
Tier A immediate candidates                  4,204
Tier A + Tier B candidates                 27,435
strict morphology                          12,406
analyzed unprofiled IPA                    10,662
proper-name review                         26,264
```

Current locale fallback is not safe to relabel as en-US:

```text
unprofiled vs en-US exact tail              62.86%
en-GB vs en-US exact tail                   48.64%
```

But the diagnostic uncovered a likely exact-key/syllabification artifact. Identical canonical phone sequences can have different exact keys solely because explicit IPA and deterministic CMUdict syllabification place an intervocalic consonant on different sides of a boundary. The enhanced fallback diagnostic now measures a boundary-insensitive rhyme-tail control before any production phonology change.

The owner's 1,000-word rarity-stratified stress list should be evaluated with:

```powershell
npm run en:coverage:wordlist -- --input <path-to-list>
npm run en:pronunciation:fallback:diagnose
```

Do not implement publish v4 until both outputs are reviewed. The wordlist audit distinguishes DB presence, default selection, pronunciation availability, wordfreq-sidecar status and exclusion/recovery reason per word and per rarity tier.


### 12B6 1,000-word stress probe + IPA provenance follow-up

Corrected stress-list totals after removing three prose metadata lines accidentally parsed as words:

```text
1,000 actual words
882 in DB
676 default-selected
206 published non-default
118 missing from DB
756 present in ranked wordfreq sidecar
859 with any analyzed pronunciation
682 with analyzed en-US pronunciation
```

Coverage is perfect through rarity 4, >91% default through rarity 7, then drops sharply at rarity 8-10. The stress list is not lexical gold; its own metadata says it was not selected from an external dictionary/corpus/list.

The 206 non-default words are dominated by pronunciation-profile gating:
- 189 no-en-US only;
- 11 historical + no-en-US;
- 6 historical-only with en-US.

The corrected 118 missing rows split into:
- 98 absent from both DB and ranked sidecar;
- 18 no-source-backed-pronunciation;
- 1 strict morphology candidate;
- 1 form-of without analyzed lemma.

A separate provenance defect was found in the fallback benchmark: all no-US/GB IPA had been grouped as `unprofiled`, including other regional/profile-tagged IPA and visibly partial IPA such as `/-vʊlf/`.

Current branch work separates:
- true unqualified full-word IPA;
- other-profiled IPA;
- partial IPA;
- en-GB.

No eligibility expansion is accepted yet. Run the corrected wordlist audit and segmented fallback diagnostic after merge; no Kaikki restream is needed.


### 12B6 strict tagless pronunciation gate

The owner reran the corrected 1,000-word audit successfully: 1,000 rows exactly, 882 in DB, 676 default, 206 published non-default and 118 missing.

Fallback diagnostic v2 showed:

```text
all no-locale boundary-insensitive tail      65.61%
v2 unqualified_fullword                      70.38%
other-profiled                               13.70%
partial                                       3.78%
```

Do **not** accept 70.38% as General-English truth. The v2 `unqualified_fullword` mismatch sample still contains source-tagged variants including `new-zealand`, `general-south-african`, `new-york-city`, `philadelphia` and `cot-caught-merger`.

Current code therefore defines unqualified much more strictly: **zero source tags + no mapped locale + full-word IPA**. Any tagged no-locale pronunciation is preserved separately as recognized `other_profiled_fullword` or conservative `tagged_unmapped_fullword`; partial IPA remains `unmapped_partial`.

Candidate source-provenance policy: `en-source-backed-publish-v3.2-candidate`. Default eligibility is unchanged.

Next owner command:

```powershell
git pull
npm run en:pronunciation:fallback:diagnose
```

No Kaikki restream, publish rebuild or DB rebuild is required for this diagnostic.


### 12B7 publish-v4 Tier-A + morphology benchmark gate

Strict tagless pronunciation owner diagnostic v3 is complete.

```text
strict tagless vs en-US surfaces                 17,427
exact tail                                        73.27%
boundary-insensitive tail                         76.52%
full phone sequence                               71.46%
syllable count                                    97.34%
stress pattern                                    82.94%
```

Decision: tagless Wiktionary IPA remains provenance-bearing General-English/unprofiled evidence and is **not** promoted or relabeled to en-US.

Candidate publish policy is now:

```text
en-source-backed-publish-v4-tier-a-candidate
```

Implemented Tier-A channels:

- exact CMUdict apostrophe possessive + analyzed en-US base;
- explicit punctuation-only Wiktionary `alt_of` + exactly one analyzed en-US lemma.

Regular morphology is still disabled in production. A deterministic allomorph composer and CMUdict control diagnostic are implemented, but owner evidence is required before admission:

```powershell
git pull
npm run en:pronunciation:inflection:diagnose
```

This command only reads existing publish shards. Do not run the expensive Kaikki publish rebuild until this diagnostic is reviewed unless specifically needed to validate Tier-A counts.


### 12B7 inflection composition benchmark v1

Owner report:

```text
control surfaces                         19,993
phoneme-sequence match                    94.42%
boundary-insensitive stressed-tail        94.97%
syllable-count match                      99.36%
stress-pattern match                      96.93%
```

CMUdict-base-only boundary-insensitive tail is 95.12%.

The low global exact-key score (70.46%) is dominated by source/analyzer syllable-boundary placement and is not the acceptance metric. Progressive `-ing` is the clearest example: 14.60% exact-key vs 95.73% boundary-insensitive tail.

The only materially weak allomorph classes are epenthetic `-es` and `-ed` after /t,d/. Mismatch review shows a systematic reduced-vowel transcription choice: composer `/ɪz, ɪd/` vs frequent CMUdict `/əz, əd/`.

Diagnostic v2 now preserves both common reduced-vowel variants and measures best-set agreement. Production morphology remains disabled.

Next owner command:

```powershell
git pull
npm run en:pronunciation:inflection:diagnose
```

Expected output:
`data/local/en-inflection-composition-diagnostic-v2-report.json`.


### 12B7 morphology benchmark v2 accepted / publish-v4 full build next

Owner v2 control:

```text
controls                               19,993
phoneme sequence                        95.46%
boundary-insensitive stressed tail      96.02%
syllable count                          99.36%
stress pattern                          96.92%

CMUdict-base tail                       96.17%
-ed after /t,d/ tail                    97.06%
-es after sibilant tail                 95.47%
```

Decision: bounded deterministic morphology composition is accepted for the strict source-backed relation class.

Production candidate implementation now requires:

- explicit `form_of` / `listed_form_of`;
- exactly one regular lemma+shape;
- allowed morphology tags;
- analyzed en-US source-backed lemma pronunciation;
- no morphology-on-morphology chaining;
- explicit `derived_inflection` pronunciation provenance;
- ambiguity/unresolved-base rejection.

Candidate policy:

```text
en-source-backed-publish-v4-candidate
```

Next owner commands after CI/merge:

```powershell
git pull
npm run en:publish:rebuild
npm run en:coverage:audit
```

Upload:
- `data/local/en-publish-v1/manifest.json`
- `data/local/en-coverage-audit-v1-report.json`

Do not rebuild the English SQLite until publish-v4 counts/coverage are reviewed.


## Post-English roadmap — ranking diversity, Entity, performance

Authoritative roadmap:

`docs/POST_ENGLISH_ROADMAP.md`

Important correction: the German Writer behavior that must be conceptually carried into English is **not just phonetic/commonness score tuning**. The accepted single-word Writer uses two distinct page-quality dimensions.

### German Writer quality layer

Policy:

```text
deterministic_writer_utility_v6
```

Current utility:

```text
soundUtility
  = 0.72 * phonetic score
  + 0.16 * syllable utility
  + 0.12 * commonness utility

utility
  = soundUtility
  - 0.16 * lexical overlap
  - rare/historical penalty
```

Lexical/morphology overlap and low-confidence usage also affect effective Writer tier.

### German Writer diversity / novelty layer

Current diversity constant:

```text
DEFAULT_DIVERSITY_WEIGHT = 0.18
```

Greedy page selection tracks maximum redundancy against already-selected rows:

```text
diversifiedScore
  = writer.utility
  - 0.18 * maxRedundancy
```

Redundancy includes same lemma, same Writer morphology family and strong near-duplicate/initial-construction similarity.

It also affects effective tier:

```text
maxRedundancy >= 0.58 -> +1 diversity tier
maxRedundancy >= 0.88 -> +2 diversity tiers
```

This is the mechanism that prevents the Writer page from filling with many versions of effectively the same answer.

English must reuse this **quality + diversity** architecture, but English-specific weights/thresholds must be benchmarked rather than copied blindly.

Phrase/Mosaic provides a second concentration-control precedent with exact/family caps and lexical-frame cap 3.

### Required sequence after current English coverage gate

```text
1. English publish-v4 full build + coverage A/B
2. English SQLite rebuild + verify
3. English retrieval/runtime acceptance
4. English ranking calibration:
   - phonetic relation/scorer thresholds
   - commonness behavior
   - Writer utility / quality
   - diversity / redundancy / novelty
5. Product EN acceptance
6. Resume Entity:
   - owner P898 gate
   - DE/EN source-backed pronunciation
   - exact CMUdict through accepted EN analyzer
   - bounded token composition
   - proper-name G2P benchmark only if still required
   - Entity phonetic + prominence + diversity ranking
7. Integrated DE + EN + Entity acceptance
8. Dedicated DB/runtime performance phase
```

Entity prominence must reorder only within sufficiently close phonetic quality. Fame/popularity must not override materially worse rhyme quality.

Final local performance target:

```text
warm p50 < 50 ms
warm p95 < 100 ms
warm p99 < 150-200 ms
cold start measured separately
```

Performance optimization must preserve accepted Top-N/result fingerprints. Eliminate full scans and N+1s before low-level SQLite PRAGMA tuning.

### Current immediate owner gate — consolidated English Writer acceptance

Phase 12B9 bundle evidence passed and was reviewed.

```text
bundle status                 evidence_ready
bundle semantic fingerprint   d68ae5f883c9b4d007811573e94493d0bfe389a5c08144da3e63bb9195769c14
runtime repeatability         3 / 3 PASS
runtime fingerprint           dc4de5383325ee3b0d03ca6d77b8282bb0986e19c8e12567c2022a8aa3f29fcf
```

Important findings:

- both first Commonness candidates produced 30 phonetic-guard violations;
- root cause is a non-transitive pairwise near-tie comparator;
- raw English query-spelling overlap is not safe as a Writer utility penalty;
- Top-20 unranked rows rose from 119 in phonetic control to 197 / 218 in the two Commonness candidates.

Phase 12B10 fixes these issues structurally:

- strict relation tier;
- anchored phonetic bands with full span <= 0.03;
- Commonness only inside those bands;
- raw query spelling overlap diagnostic-only;
- small unknown-usage confidence penalty without treating unranked as rare;
- separate same-lemma/near-duplicate Diversity layer;
- automatic selection of the lowest Commonness weight and lowest Diversity weight that pass structural gates.

Next owner command after merge:

```powershell
git pull
npm run en:writer:accept
```

Upload only:

```text
data/local/en-writer-acceptance-v1-report.json
```

If status is `candidate_accepted_for_product_integration`, implement that selected policy directly and move to one integrated EN / DE+EN product acceptance bundle. Do not reopen separate Commonness or Diversity micro-gates.


## Pronunciation Backfill V2 continuation — exact base parity

Backfill generation is complete. Generated eSpeak A/B rows remain second-class and opt-in-only, but their storage/runtime representation must be **identical to the regular base dataset for each domain**.

The bespoke Secondary V1 sidecar was removed. Authoritative design: `docs/PRONUNCIATION_BASE_PARITY_V1.md`.

The parity materializer creates augmented copies of the canonical DE Writer, EN Writer, Phrase and Entity DBs, then uses the canonical table schemas and existing Writer/Phrase/Entity materializers. It does not add generated-only persistent tables or Etymology/Senses fields. It hard-fails if any output `sqlite_schema` differs from its canonical base.

Client B 292 / C 2,161 / D 60 / U 25 remain deferred in `data/local/pronunciation-backfill-v2.sqlite` and `data/local/pronunciation-backfill-v2-deferred.tsv`.

Next owner command after merge:

```powershell
git switch main
git pull --ff-only
npm run pronunciation:secondary:materialize
```

Expected primary report: `data/local/pronunciation-base-parity-v1-report.json`. Runtime/UI checkbox integration remains a separate step; default search stays canonical-only.
