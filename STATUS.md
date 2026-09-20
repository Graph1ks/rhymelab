# Public-facing status

Last updated: 2026-09-20

RhymeLab's public repository is `Graph1ks/rhymelab`. `main` is protected and the required public CI check is `validate`.

## Immediate owner gate — Generated opt-in runtime acceptance

PR #149 is merged on `main` at `900219ac`. Base-Parity V1 already passed locally; the next and only pending owner action for this track is the **local runtime acceptance**, not another Backfill/materialization run.

Focused continuation: `docs/GENERATED_OPTIN_RUNTIME_ACCEPTANCE_HANDOVER.md`.

Run after pulling current `main`:

```powershell
git switch main
git pull --ff-only
npm run pronunciation:secondary:runtime:accept
```

The owner has **not run this command yet**. On success it writes `data/local/generated-optin-runtime-acceptance-v1-report.json` plus the fail-closed enablement marker `data/local/generated-optin-runtime-enabled-v1.json`. Only then should `npm start` expose the Generated Data checkbox as available; it remains default OFF and non-persistent. Do not reopen Client B/C/D/U or the 103 parity-deferred phrase surfaces unless explicitly requested.

Current UI/API follow-up separates query-pronunciation language from result language, exposes exact Entity-category filters from runtime capabilities, consolidates source display into one Sources dialog, reports bounded search-pool counts, and uses per-category More controls for standard browsing. DE source-backed input may target EN word results through the accepted English target phonology; same-language accepted ranking/retrieval behavior remains unchanged.

Primary unified-search controls now have an explicit runtime interaction regression gate. A prior partial-initialization bug caused Search to remain bound while later buttons were dead; control binding now preflights the full surface, marks successful binding, fails visibly, and is exercised by simulated click tests before merge.

Entity result presentation now treats `entity` as an internal result-family concept only. Individual Entity cards/detail panels must show the concrete accepted taxonomy subtype (for example Rapper, Actor, Music Group, Movie, Video Game or Character); raw category paths and generic `Entity` labels are not valid item-type presentation.

Client Total Query Pronunciation now covers **single words and arbitrary word chains**. Source-backed query/word pronunciation remains first priority; for a partially unresolved chain the browser resolves each token from the existing DB when possible and generates only missing token IPA locally, then composes one ephemeral DE/EN query anchor. The accepted analyzer validates that anchor and the existing Word/Phrase/Entity retrieval, scoring and ranking paths continue unchanged. The client generator has no Node/`child_process`/host-executable/eSpeak dependency. Regression sentinel: `heute abend große gangbang party`.

Generated OOV token pronunciations are now persisted in a bounded IndexedDB performance cache. The normal app initialization still queries `/api/health` once and receives a SHA-256 `query_pronunciation_revision` derived from the active DB files plus their metadata. A cached pronunciation is reused only when language, normalized spelling, resolver policy and current DB revision all match; DB/resolver changes invalidate stale entries. Exact source-backed pronunciations are never stored as generated cache truth. Cache schema: `rhymelab-query-pronunciation-cache-v1`, max 10,000 rows.

The prior 1000-case eSpeak-NG run remains **development/reference evidence only**. Its normalized v2 report fingerprint is `facd6d15…ff1e5` with 1012 / 1014 analyzer-compatible outputs (99.80%), but eSpeak-NG is not part of the end-user query runtime and lives only under `scripts/`. The current end-user pronunciation implementation is `src/ui/query-pronunciation-client.mjs`; its real browser flow is exercised at `/query-pronunciation-test`. Canonical bulk Entity pronunciation promotion remains a separate gated problem; the owner has now explicitly authorized a staging-only all-database generated-pronunciation cleanup pass.

Owner-only **Pronunciation Backfill V2** now supersedes the initial V1 collector. The owner-local inventory has been consumed and the source map is closed against the files actually present locally: DE usage TSV + raw German Kaikki, raw English Kaikki through the existing lexical-candidate policy, and the pronunciation-independent Phrase/Entity catalogs. The absent `data/de/core/` stage is no longer required. `npm run pronunciation:backfill:plan` performs a no-write path/preflight check before collection.

Owner full-data Backfill V2 collection is complete: 6,033,818 unique language+normalized work items from 6,200,338 source refs. Scope refs: DE listed forms 2,684,371; DE usage 1,255,600; EN lexical candidates 885,993; Entity EN 705,050; Entity DE 626,716; DE Wiktionary headwords 28,299; phrase surfaces 8,415; phrase unresolved tokens 5,894. The 1000-case held-out generator calibration selected eSpeak-NG as primary bulk generator evidence: overall exact rhyme tail 54.95% vs 20.64% for the client resolver, syllable count 91.19% vs 80.46%, stress pattern 67.17% vs 29.86%, and mean rhyme score 0.871748 vs 0.684212. The client remains fallback after eSpeak analyzer rejection. Before any full generator run, materialize `source-aware-pronunciation-admission-v1` with `npm run pronunciation:backfill:admit`, inspect the admission report, then run the read-only local eSpeak batch-size ladder with `npm run pronunciation:backfill:highspeed:test`. Bulk eSpeak now defaults to four bounded batch workers (512 rows/worker), eliminating per-row process launch for normal admitted rows; review/noise rows remain preserved in the workset and are not generated unattended. Complex/multiline outputs are now explicitly boundary-framed; a line-count mismatch no longer recursively fans out into a per-row spawn cascade, and live progress exposes recent throughput plus process modes. Framing V2 further removes the per-row boundary cost: complex shapes use 16-row sparse boundary groups by default, and only ambiguous groups are re-run through dense per-row framing. IPA normalization/analysis is now moved off the Node main thread into four persistent `worker_threads` by default, while SQLite checkpoint/write semantics remain on the owner process; `--analyzer-workers 0` remains a main-thread control, and live progress exposes analyzer queue/restart telemetry. Admission coverage is now fail-closed over every work item: legacy rows without surviving source provenance are retained as `review:no_source_scope`, and future source-key collisions cannot leave orphan work items.




## Serving-v1 performance candidate

The owner-preview path `npm run dev:serving` now targets the one-file `data/local/rhymelab-serving-v1.sqlite` Product adapter. Expensive unified-search channels execute through five persistent `worker_threads` (DE Words, EN Words, DE Phrase/Mosaic, DE Entities, EN Entities), each with its own read-only connection. Worker creation/DB opening happens before measured requests; workers are reused across requests.

The synchronous `searchUnifiedWriter()` implementation remains the semantic reference. CI fixture coverage requires the parallel Serving response to deep-equal the serial response for the same request. The Serving hotpath benchmark and Product Acceptance timing now measure the parallel path; the benchmark retains `--serial` as a diagnostic control.

This step deliberately adds **no cross-request search/result/scoring/analysis cache**. Caching is deferred until the already-planned Serving-v1 and worker-parallelization work is finished and measured.

Unified Product presentation now follows Serving-v1 surface identity: one visible `language + normalized surface` result, with Word/Core pronunciation preferred when a lexical result exists and same-name Entity categories/QIDs merged onto that surface. Multiple matching sound relations remain metadata/filterable relations and no longer duplicate the same card across unfiltered sections.

## Current product/runtime baseline — v0.11.0

The normal local UI/API now uses the accepted materialized German Writer runtime by default:

```text
package               v0.11.0
writer DB             data/local/rhymelab-v5.sqlite
writer DB schema      rhymelab-local-db-v5
writer runtime        materialized-writer-v5-v1
writer ranking        deterministic_writer_utility_v6
right-edge anchor     de-right-edge-anchors-v1
anchor storage        compact-primary-key-v2
candidate basis       legacy-vowel-key-string-suffix-v1
morphology            de-attested-right-head-v4
construction          de-adverbial-weise-v2
morphology storage    positive-evidence-compact-v2
```

`npm run dev` uses this Writer v5 path.

## Legacy/control baseline — preserved

The previous v0.10.0 / DB-v4 runtime remains the protected regression/control path only:

```text
control DB            data/local/rhymelab.sqlite
control DB schema     rhymelab-local-db-v4
analyzer              de-ipa-v2
scorer                de-phon-v3
relation              rhyme-relations-v2
ranking               modern_entity_relative_commonness_1decade_0_05
request               ?ranking=legacy
```

The v4 DB is optional for normal v0.11 Writer use. If it is absent, the normal Writer UI still starts; only explicit `?ranking=legacy` requests are unavailable.

## German single-word Writer — ACCEPTED / PROMOTED

Acceptance document: `docs/WRITER_SEARCH_ACCEPTANCE.md`.

Final engineering evidence before promotion:

```text
legacy invariance queries             27 / 27
runtime candidate mismatches               0
runtime policy mismatches                  0
protected-order mismatches                 0

DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
anchor rows                      3,153,639
positive morphology rows          325,724
freelist pages                           0

retrieval equivalence queries         12 / 12
retrieval mismatch queries                 0
morphology regressions                10 / 10
retrieval-only speedup                  14.12x

Writer Page runtime contract          12 / 12
Writer Page structural gate              PASS
mean writer elapsed                  1103.9 ms
frozen validation mean               1528.8 ms
mean improvement                       27.8%
legacy Tier-0 retention              685 / 685
Top-20 exact duplicates                    0
Top-20 near duplicates                     0
Top-20 same-lemma rows                     0
Top-20 repeated family rows                0
preferred pronunciation rows          240 / 240

repeatability independent DB opens          3
repeatability suite fingerprints equal   true
repeatability mismatches                    0
suite fingerprint
c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab
```

Protected behavior remains:

- `Arbeitsweise -> Hochzeitsreise`: retrieval sentinel only, rank 116;
- `Arbeitsweise -> right:reise`: `Weiterreise` rank 3;
- `Liebe -> Diebe`: rank 1;
- `Leben -> neben`: rank 2;
- `Nacht -> macht`: rank 1;
- all 10 productive-`-weise` / false-split morphology regressions pass.

Writer v7 remains rejected and rolled back. Material changes to the frozen single-word Writer policies require a new benchmarked candidate.

## Human Writer NDCG policy

Writer Page NDCG@10/20 remains `pending_reference` by explicit project decision.

It will not be collected from the project owner alone. Independent human usefulness evaluation is deferred until the broader German Writer system — including phrase/mosaic/phraseology — is mature enough to evaluate coherently and independent reviewers are available.

## Current checkpoint

Phase 11 German phrase/mosaic/phraseology is **COMPLETE / ACCEPTED / FROZEN**.

Acceptance: `docs/PHASE_11_ACCEPTANCE.md`.

Final integrated owner evidence:

```text
report schema                     rhymelab-unified-writer-acceptance-v1
status                            ok
runs                              3
protected checks                  PASS
structural checks                 PASS
frozen Word Writer equivalent     PASS
11E2-v2 fingerprint reproduced    PASS
11E3 fingerprint reproduced       PASS
combined overhead ratio           1.0417
performance maximum               1.5000
repeatability                     PASS
semantic fingerprint
9c5ea5fcd67d74c58393cb25da854c3ed7a7ef2d6ea658d26614a194dd745694
```

The product surface is now only the main Writer UI at `/`. There is no separate Phrase Explorer route requirement. Phrase catalog/detail APIs remain internal read-only support for unified result inspection and diagnostics.

Search-language basis remains `DE / EN / DE+EN`. German is active and frozen; English remains capability-gated until an accepted English runtime exists.

Current active milestone: **Phase 12C — source-backed multilingual Entity runtime + isolated AI pronunciation staging acceptance**.

Source/architecture contract: `docs/ENGLISH_WRITER_SOURCE_PLAN.md`.

Selected Phase 12B source roles:

```text
primary lexical/forms/POS/IPA     English Wiktionary via raw Kaikki/Wiktextract
primary exact en-US pronunciation CMUdict
dialect/spelling/inflection guard ESDB / SCOWL v2
usage/commonness candidate         wordfreq
```

Current English-source research snapshot:

```text
Kaikki English distinct word forms    1,390,507
Kaikki English senses                 1,787,236
enwiktionary dump                     2026-09-02
Kaikki extraction                     2026-09-16
raw enwiktionary JSONL                23.5 GB
raw gzip                               2.7 GB
```

The >1M figure is a raw word-form universe, not a final default Writer count. Phase 12B diagnostics must measure current/historical, proper-name, multi-word, pronunciation and usage coverage before a final runtime population is selected.

wordfreq is selected only as the initial commonness candidate. Its maintainer states that the underlying frequency snapshot runs through about 2021 and is unlikely to be updated again, so modern songwriting/rap vocabulary must be benchmarked before final acceptance.

The Phase 12A Entity checkpoint remains frozen historical evidence. Phase 12C has resumed Entity work after English product acceptance, without reopening the accepted Hybrid-v2 population or DE runtime baseline.

Entity deferred checkpoint: `docs/ENTITY_PHASE_12A_DEFERRED_CHECKPOINT.md`.

Frozen Entity evidence:

```text
retained entities                       1,077,644
Hybrid-v2 fingerprint
337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201

DE Entity names considered                716,940
runtime-ready                              90,224 / 12.58%
DE Entity runtime fingerprint
38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3

CMUdict full unresolved matches           261,833 / 41.78%
preferred probe-only ceiling               52.18%
coverage diagnostic fingerprint
69e6ec4d14091d22c5a76ca5869d38908f09f95fcac248b2e6791f329ad99bfa
```

PR #70 implemented selective qualified Wikidata P898 source evidence, but the owner explicitly did **not** run the new P898 owner workflow. No full-data P898 result is accepted or claimed. Do not execute that deferred Entity gate before Phase 12B.

Phase 12B owner source result + 12B3 candidate:

```text
entries                         1,492,835
headwords                       1,355,827
Writer candidates               1,084,050
combined pronunciation             13.77%
ESDB overlap                       22.19%
wordfreq overlap                   17.92%
12B3 fixture                    22 entries / 19 checks / PASS
English runtime                 still capability-gated
broad G2P                       disabled
```

Phase 12B1/12B2 tooling checkpoint:

```text
source registry        sources/en/phase12b-sources-v1.json
bootstrap              npm run en:sources:bootstrap
diagnostics            npm run en:sources:diagnose
bootstrap report       data/local/en-source-bootstrap-v1-report.json
diagnostic report      data/local/en-source-diagnostics-v1.json
```

The owner-local source bootstrap and 12B2 diagnostic are complete, and the 12B3 owner phonology fixture is **PASS** (22 entries / 19 checks / 0 failures).

Phase 12B4 owner full build + verification is **PASS**:

```text
schema                         rhymelab-en-publish-v1
published surfaces             147,904
default eligible                72,946
analyzed en-US                 111,574
pronunciation variants         274,819
unresolved variants             35,000
semantic fingerprint
4087cc8a41eff75a24e5cf33c25da1db0760bae658c7eb979a482c68acd56124
verify                         PASS
```

The publish cut still requires one independent unchanged-source rebuild before freeze. The repository now provides `npm run en:publish:repeatability`.

Phase 12B5 owner build + verification is now **PASS**:

```text
database schema                  rhymelab-en-writer-db-v1-candidate
forms                            147,904
default eligible                  72,946
pronunciations                   274,819
analyzed pronunciations          239,819
unresolved pronunciations         35,000
default-profile pronunciations   101,330
SQLite                            115.57 MiB
semantic fingerprint
fa078705ff6f4ae157b88301f6dea84933008590ff3f8c376832c684a1baca0b
indexed-vs-scan mismatches              0 / 80
```

12B4 publish repeatability also passed with the unchanged `4087cc…6124` fingerprint.

The Phase 12B6 coverage-funnel owner baseline is now complete and confirms that the small English DB is primarily a population-cut issue, not a compression anomaly.

```text
English published forms             147,904
English ranked / unranked     106,779 / 41,125
English ranked share                 72.19%

German forms                        838,209
German ranked / unranked      260,450 / 577,759
German ranked share                  31.07%

Top-10k  publish / default      98.56% / 89.03%
Top-50k  publish / default      88.34% / 72.00%
Top-100k publish / default      69.75% / 50.46%
```

Top-100k dominant losses are 17,667 without source-backed pronunciation, 12,469 without an eligible Wiktionary lexical candidate, 11,772 explicit-proper-name-only rows, 3,705 published without analyzed en-US pronunciation, and 2,670 historical-only rows.

A concrete history-classification defect was identified: record tags and all sense tags were flattened before history classification, so one archaic/obsolete/dated sense could classify an otherwise current entry as historical evidence. The candidate fix uses sense-aware `historical_only` semantics and versions the publish policy as `en-source-backed-publish-v2-candidate`.

The history-fix owner A/B is now PASS and repeatable. Published surface count stayed at 147,904, while default-eligible surfaces rose from 72,946 to 75,695 (+2,749) and ranked-default surfaces rose by 2,503. Top-10k default coverage improved from 89.03% to 94.38%; Top-100k improved from 50.46% to 52.52%. Historical-only losses collapsed from 567 to 1 in Top-10k and from 2,670 to 208 in Top-100k.

The rerun exposed a second analogous defect: sense-level `proper-noun` / `proper-name` tags were being flattened into record-level proper-name evidence. This can exclude common lexical records such as `college`. Candidate publish policy `en-source-backed-publish-v3-candidate` fixes proper-name evidence to use POS or record-level tags only.

The coverage audit now also quantifies three rescue channels before ranking: independent ESDB+CMUdict evidence for non-Wiktionary lexical gaps, regular-inflection-shape candidates whose lemma already has analyzed en-US pronunciation, and locale-only pronunciation gaps (en-GB / unprofiled / unresolved).

Proposed English DB target:

`data/local/rhymelab-en-v1.sqlite`

German Word/Phrase behavior remains frozen throughout.

Owner source bootstrap is now **ACCEPTED**:

```text
Wikidata snapshot      20260914
bytes                  103,137,817,948
official SHA-1         0a985a65262a665fa33808c7d40a1d42ad28d62c
local SHA-256          63f20c9595fc81209c975a96ff5c0a2d6895d94541f258d4092fa0f0ad390888
transport              ACC/Umeå mirror
QRank bytes            105,533,721
QRank SHA-256          daf93ed3eaeeb7d9d88237118db44e34880680921e5e8eb3353626e4e76ed4dd
QRank Last-Modified    2024-03-16
```

The classic 103 GB Wikidata raw dump is retired from the active workflow and may be deleted. It must not be redownloaded or required for comparison. The QRank raw artifact remains retained locally/gitignored for the active Phase 12A2 path. QRank's 2026-09-18 label is retrieval provenance only; server metadata reports a 2024 last-modified timestamp, so do not describe it as a 2026-generated popularity snapshot.

The pinned owner-source bootstrap is implemented:

```text
command             npm run entity:sources:bootstrap
raw dir             data/raw/entity/phase12a-20260918
Wikidata snapshot   20260914
Wikidata .bz2       103,137,817,948 bytes
official SHA-1      0a985a65262a665fa33808c7d40a1d42ad28d62c
QRank policy        local 2026-09-18 artifact + SHA-256 + HTTP headers
full staging        npm run entity:owner:stage
```

The bootstrap is resumable for the static Wikidata URL, requires a streaming bzip2 decompressor, checks free space, verifies Wikimedia's published SHA-1 and records local SHA-256 fingerprints.

Contract: `docs/ENTITY_STAGING_V1.md`.

The classic 20260914 full-dump stage was stopped manually after QLever viability was proven. Its partial staging SQLite was deleted. This path is abandoned: no full-dump control comparison is required, and no further BZip2/WSL/full-dump tuning should be done.

Source-acquisition alternatives are documented in `docs/ENTITY_SOURCE_ALTERNATIVES_2026-09-18.md`.

**QLever selective acquisition is now live-verified.** The 2026-09-18 probe against the public Wikidata backend produced:

```text
truthy distinct candidates       1,836,982
all-statement distinct           1,838,292
all-vs-truthy delta                  1,309 (~0.071%)

membership.tsv.gz                6.46 MB
core.tsv.gz                     52.75 MB
aliases.tsv.gz                   8.25 MB
external_ids.tsv.gz             13.37 MB
QLever selective total          ~80.8 MB compressed
with pinned QRank               ~186.4 MB compressed
classic Wikidata dump           103.1 GB compressed
```

Measured remote export times were approximately 5.7 s membership, 20.3 s core, 5.6 s DE/EN aliases and 6.7 s external IDs. Required fields and the Bud Spencer sentinel surface were confirmed.

The current JSON importer reads all valued P31/P106 claim statements regardless of rank, so the QLever implementation must use `p:/ps:` all-statement membership semantics rather than only `wdt:` truthy relations.

The multi-hour 20260914 full-dump stage is retired. The owner explicitly does not want to retain or compare against the 103 GB dump; it may be deleted and must not be redownloaded.

The real build-time QLever path is now implemented. After merge:

```powershell
npm run entity:owner:stage:qlever -- --retrieval-label 20260918
```

Final exact live-probe set including all-rank membership/external IDs and exact Wikipedia site pairs:

```text
membership.tsv.gz             7,012,309 bytes
core.tsv.gz                  49,198,431 bytes
aliases.tsv.gz                8,268,118 bytes
external_ids.tsv.gz          12,860,016 bytes
wikipedia_sitelinks.tsv.gz   16,711,786 bytes
TOTAL                        94,050,660 bytes (~89.7 MiB)
raw result bytes            753,947,040
summed export wall time           114.2 s
```

The first owner-local QLever fast-path run is now **PASS**. The source export, local entity stage, QRank join and category cut diagnostic all completed and returned cleanly to PowerShell; the sentinel gate therefore passed.

Owner source evidence:

```text
membership rows              1,875,219
core rows                    1,838,448
aliases                        630,965
external IDs                   993,926
Wikipedia sitelinks          4,491,472
total selective rows         9,830,030
raw bytes                  783,845,729
gzip bytes                  93,454,429
```

Visible cut evidence confirms that QRank coverage is category-dependent rather than uniformly high: examples include films 81.55%, albums 89.78%, actors 62.17%, companies 45.68% and video games 22.24%. Therefore QRank remains evidence, not the sole popularity truth; the existing deterministic fallback ordering by Wikipedia sitelinks, DE/EN presence, external IDs and statement count remains material.

The first distinct-retained recount is now owner-confirmed:

```text
total kept category memberships  1,109,302
distinct retained entities       1,077,927
retained membership overlap         31,375
memberships per retained entity      1.029107
Bud Spencer sentinel                   PASS
```

This is inside the allowed 500k–1.2M target but above the preferred 600k–900k working range. The overlap is small enough that multi-category duplication is not the reason for the high retained population.

The owner fallback review now confirms that the v1 control policy is **not freeze-ready**. Seven of thirteen categories retain zero QRank-missing rows: `group.music_group`, `organization.car_brand`, `organization.company`, `organization.fashion_house`, `work.album`, `work.film` and `work.song`. The defect is strongest for companies (45.68% QRank coverage) and fashion houses (41.01%), where QRank presence is functioning as a hard admission gate. By contrast, `work.video_game` has only 22.24% QRank coverage and retains 67.85% of QRank-missing candidates through structural fallback evidence.

Hybrid-v1 owner A/B is now complete and **rejected for freeze**. The full-data report fingerprint is `e770c1cfc655764e9e0f26e033c53fba0f1e1af4e2ca3b7ac82adf4eabde1e04`; all sentinels pass and Bud Spencer remains KEEP / Tier A. Distinct retained entities change only from 1,077,927 to 1,077,669 and membership churn is 1.89%, so the candidate is globally conservative.

Hybrid-v1 opens five of the seven categories that were completely QRank-gated under the original control, but `organization.car_brand` and `organization.company` still retain zero QRank-missing rows. The company case is the decisive blocker: QRank coverage is only 45.68%, 123,357 company candidates are QRank-missing, and v1 still retains none of them.

Root cause: Hybrid-v1 reserves 55% of the score for QRank and assigns zero to that component when QRank is missing, so every missing-QRank row has a hard 45% score ceiling. This is still an implicit source-coverage gate in strict categories even though the explicit present-first ordering is gone.

Decision: keep Hybrid-v1 as accepted evidence/control only and evaluate `category-relative-popularity-hybrid-v2-geometric-missing-evidence-candidate`, documented in `docs/ENTITY_CUT_HYBRID_V2.md`. V2 preserves every QRank-present v1 score exactly and changes only missing-QRank normalization using the geometric mean of zero-filled score and available-evidence-normalized score. With current weights the missing-QRank ceiling becomes 670,820 ppm rather than 450,000 ppm, while weak missing rows still receive weak scores.

After the v2 candidate PR merges, run only `npm run entity:cut:diagnose:hybrid-v2`. It requires the accepted v1 owner report locally and uses the existing staged DB; no QLever fetch, entity restage, QRank restage, floor change or final materialization is required. Do not alter category floors until the ranking policy itself is accepted.

The implementation streams the compressed Wikidata dump without creating an uncompressed copy, stores only structurally relevant cultural candidates in `data/work/entity/`, stages QRank separately, joins QRank locally, and reports category-relative cut distributions before any final 500k+ Entity Lexicon is materialized.

Plan: `docs/ENTITY_LEXICON_PLAN.md`.

The new entity layer is separate from the frozen Writer/Phrase databases and is designed around:

- Wikidata CC0 structured entity snapshots;
- category-relative popularity cuts;
- QRank as global popularity evidence;
- selected DE/EN Wikimedia relevance signals;
- source-backed labels/aliases;
- provenance-bearing native / de-DE / en-US pronunciation variants;
- versioned analyzer-specific phonetic features;
- optional MusicBrainz Core enrichment;
- Bud Spencer / Q221074 as a protected cultural-relevance sentinel.

Phase 12B is the actual English phonology/single-word Writer benchmark. Phase 12C materializes the full retained entity set and adds the entity channel.

UI polish, ergonomic refinement and database/query micro-optimization are intentionally deferred until the broader databases and search/display algorithms are complete.
## Current phase — Phase 11 German phrase / mosaic / phraseology

Execution plan: `docs/PHRASE_MOSAIC_PLAN.md`. Phrase catalog contract: `docs/PHRASE_CATALOG_V1.md`. Pronunciation contract: `docs/PHRASE_PRONUNCIATION_V1.md`.

### Phase 11B1 — full phrase catalog build complete

```text
catalog fingerprint       f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
SQLite size               153.74 MiB
phrases                    98,504
modern eligible            97,400
historical only             1,104
mixed historical              148
attestations               99,357
phrase tokens             205,957
Leipzig evidence rows      28,799
```

Phase 11B2 diagnostics found 15,449 modern-eligible phrases with Leipzig evidence (15.86%); 6,782 occur in one corpus, 3,984 in two and 4,683 in all three. The raw source catalog is intentionally broad and lexeme-heavy: 92,967 `multiword_lexeme` rows and 93,863 two-token rows. Abbreviation/surface aliases remain a known cleanup/ranking concern.

### Phase 11B3 — phrase detail/catalog diagnostics

The old standalone Phrase Explorer product UI and route are retired. Phrase catalog/detail APIs remain read-only diagnostic/provenance support for the unified result inspector.

Cologne Kiezdeutsch remains optional additive register evidence; automated Zenodo PDF 403 behavior is nonblocking because owner-local files may be supplied directly.

### Phase 11C1 — deterministic phrase pronunciation — ACCEPTED / COMPLETE

11C1 now reuses the accepted Writer-v5 pronunciation inventory and creates a separate additive pronunciation layer.

```text
schema                  rhymelab-phrase-pronunciation-v1
policy                  de-phrase-pronunciation-v1
token resolver          writer-v5-preferred-surface-aware-v2
composition             preferred-token-citation-composition-v1
boundary policy         explicit-word-boundary-v1
connected speech        attested-or-explicit-rule-only-v1
IPA analyzer            de-ipa-v2
G2P fallback            none
phrase variants         preferred citation only
```

For every phrase token, 11C1 retrieves preferred eligible Writer-v5 candidates by normalized form and resolves collisions deterministically using exact surface/case first, then dictionary/non-entity, currentness, usage and stable ids. Unknown tokens remain explicitly unresolved.

For fully resolved phrases it stores:

- complete IPA with explicit word boundaries;
- canonical phoneme stream;
- syllable count;
- citation stress pattern and every primary/secondary stress position;
- vowel/consonant and existing German analyzer keys;
- word-boundary positions in both phoneme and syllable coordinates;
- per-token Writer form/pronunciation provenance;
- per-token phoneme and syllable spans.

11C1 deliberately generates **zero** alternate phrase combinations and **zero** automatic connected-speech variants. The accepted Phase 11B1 base tables are not mutated, and materialization fails if the base catalog fingerprint changes.

The Phrase Explorer now shows an `IPA ready` filter, phrase IPA, stress/syllable diagnostics, token IPA and token boundary spans.

### Confirmed owner full-data build

The owner-local 11C1 materialization completed successfully with the accepted Phase 11B1 catalog preserved:

```text
phrase DB after pronunciation       350.37 MiB
base catalog fingerprint            f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
base fingerprint matches stored     true
pronunciation fingerprint           fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
phrase tokens                       205,957
resolved tokens                     195,490
unresolved tokens                    10,467
token coverage                        94.92%
phrases                              98,504
ready phrases                        90,089
ready modern phrases                 89,865
phrase coverage                       91.46%
blocked by unresolved token           8,415
```

This confirms the full-data build and base-catalog preservation. The complete 11C1 owner gate is still pending because deterministic repeat fingerprint equality has not yet been recorded and the unresolved-token impact triage still needs the dedicated coverage report.
### Coverage triage — COMPLETE / DIRECT 11D SELECTED

The dedicated read-only coverage report confirms that phrase pronunciation is already broad enough to stop treating lexical-gap cleanup as a prerequisite for mosaic retrieval:

```text
modern phrase coverage                 92.26%
unresolved token occurrences          10,467
distinct unresolved normalized forms   5,894
blocked modern phrases                 7,535
one-distinct-blocker modern phrases    5,663

Top-1  unlock upper bound                317 modern phrases / 92.59% projected coverage
Top-20 unlock upper bound                624 modern phrases / 92.90% projected coverage
Top-100 unlock upper bound             1,036 modern phrases / 93.33% projected coverage
Top-250 unlock upper bound             1,532 modern phrases / 93.84% projected coverage
```

`zurecht` is an unusually high-leverage ordinary-German gap (317 single-blocker modern phrases), followed by much smaller useful candidates such as `inne` (40) and `überein` (28). The ranking then mixes quickly with abbreviations/numbers (`St`, `1`, `2`), names/foreign material (`East`, `River`, `New`, `Street`) and specialist/historical forms.

Decision: **do not create a blocking 11C2 pronunciation campaign**. Preserve a small source-backed lexical-gap backlog for later quality work, but proceed directly to Phase 11D once deterministic 11C1 repeatability is confirmed. No broad G2P fallback and no Writer-v5 mutation are authorized.
### 11C1 deterministic repeatability — PASS

A second independent owner-local pronunciation materialization produced the identical semantic fingerprint:

```text
first fingerprint    fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
repeat fingerprint   fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
fingerprints equal   true
base catalog match   true
coverage equal       true
```

Phase 11C1 is therefore accepted and closed. The nonblocking lexical-gap backlog remains separate.

### Phase 11D1 — cross-word mosaic window substrate — ACCEPTED / COMPLETE

11D1 materializes deterministic syllable-aligned windows only when the span strictly crosses at least one stored word boundary.

```text
schema                 rhymelab-phrase-mosaic-v1
window policy          de-cross-word-syllable-windows-v1
default window length  2–6 syllables
coordinate system      zero-based [start,end)
exact phoneme index    yes
exact vowel index      yes
fuzzy retrieval        not yet
phrase ranking         not yet
Writer runtime rewired no
```

Contract: `docs/PHRASE_MOSAIC_RETRIEVAL_V1.md`.
Confirmed owner full-data 11D1 evidence:

```text
source pronunciation fp    fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
base catalog fp             f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
phrase DB after windows     510.09 MiB
pronunciations scanned      90,089
phrases with windows        90,089
mosaic windows             356,693
window fingerprint         24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
```

Window-length distribution:

```text
2 syllables   97,867
3 syllables  119,848
4 syllables   74,036
5 syllables   41,563
6 syllables   23,379
```

Boundary-crossing distribution:

```text
1 boundary   327,828
2 boundaries  19,941
3 boundaries   7,397
4 boundaries   1,438
5 boundaries      89
```

The substrate is structurally healthy: every IPA-ready phrase yields at least one true cross-word window, the corpus remains dominated by short 2–4-syllable spans, and exact indexed retrieval is ready. 11D1 is not accepted yet; one identical repeat window fingerprint is still required.
11D1 repeatability gate: **PASS**.

```text
first window fingerprint   24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
repeat window fingerprint  24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
window count               356,693 / 356,693
database bytes             534,872,064 / 534,872,064
distributions equal        true
```

Phase 11D1 is accepted and frozen as the mosaic-window substrate.

### Phase 11D2 — bounded indexed candidate retrieval — ACCEPTED / COMPLETE

11D2 keeps 11D1 immutable and adds a separate retrieval-anchor table because the raw 11D1 phoneme key includes the first-syllable onset while accepted German rhyme truth does not.

```text
schema              rhymelab-phrase-mosaic-retrieval-v1
retrieval policy    de-bounded-indexed-mosaic-retrieval-v1
anchor policy       de-mosaic-rhyme-anchors-v1
scorer              de-phon-v3
per-channel limit   128
max candidates      512
full scan fallback  no
phrase ranking      no
```

Indexed channels: exact rhyme tail; full vowel sequence + exact final coda; full vowel sequence; final nucleus + coarse coda class with ±1 syllable.

Contract: `docs/PHRASE_MOSAIC_RETRIEVAL_V2.md`.
Confirmed owner full-data 11D2 evidence:

```text
source window fp                    24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
source pronunciation fp             fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
base catalog fp                     f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
phrase DB after retrieval anchors    686.76 MiB
anchor rows                         356,693
distinct exact-tail keys            181,548
distinct vowel keys                  52,174
distinct final nucleus/coda classes     772
anchor fingerprint                  55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
window fingerprint unchanged        yes
```

The first full 11D2 build therefore covers every accepted 11D1 window one-to-one and preserves the frozen substrate. 11D2 is not accepted yet; one identical repeat anchor fingerprint is still required.
11D2 repeatability gate: **PASS**.

```text
first anchor fingerprint   55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
repeat anchor fingerprint  55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
anchor rows                 356,693 / 356,693
database bytes             720,117,760 / 720,117,760
distinct key counts equal  true
```

Phase 11D2 is accepted/frozen as the bounded indexed candidate-retrieval substrate.

### Phase 11D3 — representative query diagnostics — OWNER RUN COMPLETE / STRUCTURAL REVISION REQUIRED

11D3 reuses the existing 12-query Writer Page v2 suite and Writer-v5 preferred IPA resolution. It records candidate volume, channel/type mix, latency, top candidate windows and deterministic semantic fingerprints without introducing phrase ranking.

Queries with no eligible 2–6-syllable stressed rhyme domain are reported explicitly rather than silently treated as empty retrieval.

Contract: `docs/PHRASE_MOSAIC_QUERY_DIAGNOSTICS_V1.md`.
Owner 11D3 full-data diagnostic:

```text
queries                          12
queries with mosaic anchors       9
no-anchor queries                 3
mean elapsed                    33.6 ms
returned candidates            1,771
weak candidates                  989 (55.84%)
slant                            720
family                            60
multisyllabic slant                1
multisyllabic perfect              1
final fallback assignments      1,280 / 1,940 (65.98%)
semantic fingerprint
294a26d670e0202a0b5171d51c16d6059eff3f03620dd5b57369a04b4a87625c
```

Positive retrieval evidence exists: `Arbeitsweise` surfaces family candidates, `Liebe` has a multisyllabic-perfect candidate, and `Freiheit` has a high-scoring multisyllabic-slant candidate.

But the gate does **not** authorize 11E. `Leben`, `Feuer`, and `Gedanken` are saturated by the broad final-nucleus/coda-class channel with weak top rows; `Musik` has no mosaic anchor despite being multisyllabic because the reused single-word stressed rhyme domain is only one syllable.

Decision: preserve 11D1/11D2 and open **11D4** as an additive retrieval revision before phrase ranking.
### Phase 11D4 — mosaic query-domain + candidate-quality revision — ACCEPTED / FROZEN

11D4 is a candidate layer over frozen 11D1/11D2 controls.

Implemented:

- additive `phrase_mosaic_retrieval_v2_anchor` storage;
- indexed `vowel_family_coda_class` bridge using the existing deterministic German vowel-family map;
- `full_surface` query domain for distinct 2–6-syllable surfaces;
- default phonetic gate that removes `weak` candidates with no Assonance/Consonance relation;
- same-process A/B diagnostic that reruns the accepted 11D3 baseline and requires semantic fingerprint `294a26d6…625c` before comparing the candidate.

No phrase ranking, commonness weighting, diversity or Writer runtime integration is included.

Contract: `docs/PHRASE_MOSAIC_RETRIEVAL_V3_CANDIDATE.md`.
Owner full-data 11D4 A/B quality gate: **PASS**.

```text
baseline semantic fp        294a26d670e0202a0b5171d51c16d6059eff3f03620dd5b57369a04b4a87625c
candidate semantic fp       4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd
candidate anchor fp         9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059
queries with anchors        9 -> 10
weak share                 55.84% -> 3.40%
final fallback share       65.98% -> 31.01%
vowel-family assignments  375
mean elapsed               31.0 -> 35.9 ms
```

`Musik` now participates through `full_surface`; `Zeit` and `Nacht` remain intentionally outside the current 2+-syllable mosaic model. Known strong tops for `Arbeitsweise`, `Liebe`, `Freiheit`, and `hitzefrei` remain intact.

The vowel-family bridge is not merely duplicating strict vowel retrieval: `Arbeitsweise -> nahm beiseite` is a family-class candidate retrieved through `vowel_family_coda_class` alone.

Remaining awkward lexical surfaces such as `Musik -> K.-o.-Siegen` and useful-but-not-necessarily-songwriting phrases such as `Gedanken -> notleidende Banken` are now **11E ranking/product-quality problems**, not evidence for another retrieval rewrite.

One deterministic repeat is still required before 11D4 is accepted/frozen.
Repeatability gate: **PASS**.

```text
candidate anchor fp       9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059
repeat equal              true
candidate semantic fp    4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd
repeat equal              true
database bytes           837,390,336 -> 837,390,336
anchors                  356,693 -> 356,693
family+coda keys         66,904 -> 66,904
returned candidates      1,237 -> 1,237
weak candidates          42 -> 42
final fallback assigns   575 -> 575
vowel-family assigns     375 -> 375
```

Owner latency moved from 35.9 ms to 37.6 ms; latency is observational and excluded from the semantic fingerprint. All deterministic semantic evidence is identical.

Phase 11D retrieval is now frozen. Current milestone is **Phase 11E writer-oriented phrase ranking**. Retrieval/scorer changes require new evidence and must not be used to solve phrase commonness, lexical safety, or diversity problems.
### Phase 11E1 — ranking evidence enrichment — OWNER EVIDENCE COMPLETE

The first 11E implementation is evidence-only. It does **not** reorder candidates yet.

Implemented signals:

- equal-weight Leipzig commonness over the three frozen corpora using `log1p(per_million_sentences)`;
- Leipzig corpus breadth, occurrence and sentence totals kept separately;
- source-backed phrase types and style tags;
- deterministic surface-safety classification for abbreviation/digit/punctuation/historical patterns;
- deterministic normalized query-token overlap;
- stable per-query evidence fingerprints;
- hard assertion that the frozen 11D4 diagnostic semantic fingerprint is unchanged.

Command after fixture CI passes:

```powershell
npm run phrase:mosaic:rank:evidence
```

No phrase-utility weights or page diversification are accepted yet.

Owner evidence:

```text
suite evidence fp       04ecde26f0a59b7615d6b2a192e7cffed26aefe86ebac07e388e546210d58845
candidates              1,237
with Leipzig evidence     312 (25.22%)
without Leipzig evidence  925 (74.78%)
surface safe            1,219 (98.54%)
surface restricted         14 (1.13%)
surface marked              4 (0.32%)
query-token overlap         0
```

Interpretation: Leipzig commonness is a bounded bonus, not an eligibility requirement; surface safety is a sparse high-precision demotion signal; query overlap remains diagnostic only; phrase-type prior must remain small/capped.

### Phase 11E2 — phrase utility candidate — IMPLEMENTED / CI PENDING

Candidate policy `de-phrase-writer-utility-v1-candidate` is explicit and inspectable. Phonetic type + score dominate, Leipzig commonness contributes at most +0.10, phrase type at most +0.025, marked surfaces receive -0.35 and restricted surfaces -0.50. No page diversification is included.

Owner command after fixture CI:

```powershell
npm run phrase:mosaic:rank:v1
```

### Phase 11E2 v1 — owner A/B complete / NOT ACCEPTED

The first phrase-utility candidate is useful as a control but is not safe to promote.

```text
suite ranking fp          593142fc70cc1e7b760d6bca3d94ea233c0bcaaf295f6f47f7659ccc7e805de4
queries                   12
candidates                1,237
top changed               6
marked raw top            1 -> ranked 0
marked raw top20          4 -> ranked 0
Leipzig-backed top20     48 -> 100
```

PASS: `Liebe` perfect remains #1; `Freiheit -> dabei seid` remains #1; `Musik -> K.-o.-Siegen` falls from raw #1 to rank 120.

ITERATION REQUIRED: commonness can jump materially weaker phonetics (`verloren` 0.700 -> 0.622 at #1), `Gedanken` raw 0.912747 falls to rank 17, and `Leben` still exposes its lone `weak` candidate.

Decision: keep v1 as a deterministic control; do not promote it. 11E2-v2 must add a conservative phonetic near-tie guard and default Writer-page eligibility that excludes `weak`/restricted rows without deleting them from diagnostics.
### Phase 11E2 v2 — conservative phonetic-guard ranking — ACCEPTED

v2 keeps v1's evidence components but changes **where they are allowed to act**:

1. diagnostic vs Writer-page eligibility;
2. surface-safety class;
3. primary phonetic relation type;
4. 0.02 phonetic near-tie band;
5. only then v1 product utility/commonness/type evidence.

`weak`, restricted and non-modern rows remain in diagnostics but are not default Writer-page eligible. Marked rows such as abbreviations remain eligible but are demoted behind safe rows rather than deleted.

The v2 owner runner must reproduce both frozen 11E1 evidence and the v1 control ranking fingerprint before reporting v2 deltas.

Command after fixture CI:

```powershell
npm run phrase:mosaic:rank:v2
```
11E2-v2 owner A/B: **PASS / ACCEPTED**.

```text
suite ranking fp          1d07ad486bdff8b167a7a394dafa687a60178cb43bd5a48da19044715d33d3a0
diagnostic candidates     1,237
Writer-page candidates   1,182
diagnostic-only             55
weak excluded               42
restricted excluded         14
guard violations             0
Leipzig-backed Top-20   48 raw -> 100 v1 -> 68 v2
marked Top-20            4 raw -> 0 v1 -> 0 v2
```

Protected behavior passes: `Liebe` perfect and `Freiheit -> dabei seid` remain #1; `Leben` correctly has an empty Writer phrase page; `Gedanken` restores the strongest phonetic top; `verloren` keeps the 0.700 phonetic top; `Musik` abbreviation noise is demoted only through the explicit marked-surface safety exemption.

Product decision: phrase/mosaic results are **not quota-filled into the default result list** and do not outrank better single-word results merely to stay visible. Phrase/Mosaic gets an explicit filter/channel; empty phrase results are valid. 11E3 diversity operates only inside the phrase/mosaic channel.
### Immediate owner gate

After merge:

```powershell
git switch main
git pull --ff-only
npm run phrase:mosaic:diagnose
```

Generated report:

```text
data/local/phrase-mosaic-query-diagnostics-v1-report.json
```

Review token coverage, phrase coverage, unresolved surfaces, syllable distribution, pronunciation-alternative counts and representative IPA/boundary samples. Run `npm run phrase:pronunciation` a second time and require the same pronunciation fingerprint.

The read-only coverage analyzer ranks unresolved normalized tokens by actual phrase-blocking impact and reports cumulative Top-N resolution-unblock upper bounds. Use it to decide whether a small reviewed 11C2 lexical-gap pass has enough leverage to justify itself before 11D; it does not approve pronunciations or introduce G2P.

The base catalog fingerprint must remain:

```text
f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
```

Only after this gate should Phase 11D mosaic/cross-word retrieval begin. The accepted single-word Writer remains frozen and unchanged. Human Writer NDCG remains pending.


Current 12B6 focus: stratified English long-tail coverage review. See docs/ENGLISH_COVERAGE_AUDIT_V1.md and docs/UNKNOWN_QUERY_PRONUNCIATION_FALLBACK.md.


Phase 12B6 stratified long-tail review is complete. Current gate is two cheap local diagnostics over existing artifacts: exact rescue-tier counts from the 311k classified sidecar and unprofiled/en-GB vs en-US rhyme-domain agreement from the current publish shards. No Kaikki restream is required. Publish v4 must be based on those results, with exact-CMUdict possessives and punctuation-only aliases as the strongest immediate candidates.


Phase 12B6 exact rescue counts are complete: 4,204 Tier-A immediate candidates and 27,435 Tier-A+B candidates, including 12,406 strict morphology rows. Locale fallback cannot yet be promoted to en-US (62.86% unprofiled exact-tail agreement; 48.64% en-GB), and mismatch review exposed exact-key sensitivity to syllable-boundary placement. Current gate: enhanced boundary-insensitive fallback diagnostic plus the owner's 1,000-word rarity-stratified DB/default-selection audit.


Phase 12B6 1,000-word stress probe reviewed. Corrected actual-word coverage is 882/1000 in DB and 676/1000 default; coverage is perfect through rarity 4 and drops materially only in the rare tail. A provenance bug was found in the previous no-locale IPA bucket: other regional/profile-tagged and partial IPA were mixed with true unqualified full-word IPA. Current gate is the segmented fallback rerun before any General-English fallback or publish-v4 eligibility expansion.


Phase 12B6 segmented fallback v2 rerun completed. Corrected 1,000-word probe is confirmed at 882/1000 DB coverage and 676/1000 default. The v2 `unqualified_fullword` bucket improved to 70.38% boundary-insensitive tail agreement but is still contaminated by tagged pronunciations. Current gate is diagnostic v3: only tagless full-word no-locale IPA counts as unqualified; tagged-unmapped, other-profiled and partial IPA are separated. No publish-v4 eligibility expansion yet.


Phase 12B7: strict tagless IPA owner benchmark closed the locale shortcut (76.52% boundary-insensitive tail / 71.46% full-phone agreement vs en-US), so no General-English -> en-US promotion. Publish-v4 Tier-A candidate now implements exact-CMUdict possessives and explicit punctuation-only aliases. Regular inflection composition remains production-disabled behind `npm run en:pronunciation:inflection:diagnose`.


Phase 12B7 inflection control v1 complete: 19,993 controls, 94.42% full-phone and 94.97% boundary-insensitive rhyme-tail agreement. Weakness is concentrated in epenthetic `-es/-ed` reduced-vowel transcription. Diagnostic v2 now preserves `/ɪ~ə/` suffix variants; production morphology remains disabled pending owner rerun.


Phase 12B7 morphology v2 benchmark PASSED for bounded source-backed composition: 95.46% full-phone / 96.02% boundary-insensitive tail across 19,993 controls; weak epenthetic rules now reach 95-97% tail agreement. Publish policy candidate advanced to `en-source-backed-publish-v4-candidate` with strict one-hop `derived_inflection` provenance. Next gate: full publish-v4 build/verify + coverage A/B; English DB rebuild remains deferred.


Post-English execution order is now documented in `docs/POST_ENGLISH_ROADMAP.md`: English must receive the same two-dimensional Writer concept as German — quality/utility plus greedy diversity/redundancy suppression — with English-specific calibration. After EN runtime/ranking acceptance, resume Entity pronunciation + prominence/diversity ranking, then optimize the final DE+EN+Entity hot path toward <100 ms warm p95 while preserving accepted result fingerprints.

Phase 12B7 publish-v4 owner full build + coverage A/B reviewed: 224,478 published surfaces (+76,574 vs v3), 123,533 default eligible (+47,836), 188,148 analyzed en-US (+76,574), 124,285 ranked published (+17,506) and 80,579 ranked default (+15,416). The build recovered 2,104 punctuation aliases, 5,127 exact-CMUdict possessives and 69,343 strict inflections with 99,727 `derived_inflection` pronunciation variants; 176 ambiguous and 278,099 unresolved morphology bases remain rejected. Top-1k is unchanged; gains grow into the tail (Top-100k +5,745 published / +5,067 default). Historical-only, proper-name-only and ESDB-invalid default exclusions remain active, and no General-English/unprofiled -> en-US promotion was introduced. Current publish fingerprint: `b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9`. The remaining freeze gate is unchanged-source `npm run en:publish:repeatability`; only after that passes should the English SQLite be rebuilt and verified.

Phase 12B7 publish-v4 repeatability PASSED exactly: both unchanged-source runs reproduced `b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9`, with published 224,478 -> 224,478 and default eligible 123,533 -> 123,533. Publish-v4 is accepted as the source snapshot for English SQLite materialization. The English DB verifier now explicitly exercises multi-result retrieval keys for exact/vowel/family+coda/coda channels, and `npm run en:db:repeatability` performs two full DB builds + verification and compares semantic fingerprint, counts and DB bytes. Current gate: owner DB repeatability before English ranking.

Phase 12B7 English v4 DB repeatability PASSED: both materializations produced semantic fingerprint `beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37`, identical counts and identical 190,701,568-byte SQLite output. Final v4 DB: 224,478 forms, 123,533 default eligible, 375,321 pronunciations, 339,987 analyzed, 35,334 unresolved, 173,413 default-profile pronunciations, 181.87 MiB. Review found one verifier-only gap: `idx_en_pron_multi` existed but the old query-plan/equivalence gate did not independently exercise `multisyllable_key`. The patch now requires the multi index and both general + multi-result equivalence and writes `data/local/en-writer-db-verification-v1-report.json`. Current owner gate after merge: `npm run en:db:verify`; no DB rebuild required.

Phase 12B8 full English DB retrieval verification PASSED: all five dedicated channels (`exact`, `multi`, `vowel`, `family_coda`, `coda`) use their intended indexes; each passed 20 deterministic general samples plus 20 explicit multi-result indexed-vs-full-scan samples with zero mismatches. Max observed multi-result sizes were 1,430 / 1,430 / 4,043 / 1,593 / 28,690 respectively; foreign-key violations are zero and DB fingerprint remains `beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37`. DB storage/indexed retrieval is closed. Current gate: owner `npm run en:runtime:diagnose` for the read-only bounded English retrieval runtime; product EN remains disabled and ranking is not yet accepted.

Phase 12B8 English retrieval runtime diagnostic PASSED: report status `ok`, semantic fingerprint `dc4de5383325ee3b0d03ca6d77b8282bb0986e19c8e12567c2022a8aa3f29fcf`, all five runtime index plans pass, 200 stored default-profile pronunciations reanalyze with zero mismatches, boundedness/default-profile leakage/same-open repeatability all pass, `time -> rhyme` and `nation -> station` pass, `record`/`route` variants pass, and 20 derived-inflection samples reanalyze with zero mismatches. To reduce owner iteration latency, the next step is now a single `npm run en:acceptance:bundle` run combining independent-open runtime repeatability, deterministic usage-stratified query sampling, Quality/Commonness candidate sweep and Diversity sweep. Primary output: `data/local/en-acceptance-bundle-v1-report.json`.

Phase 12B9 English acceptance bundle evidence reviewed: `status=evidence_ready`, semantic fingerprint `d68ae5f883c9b4d007811573e94493d0bfe389a5c08144da3e63bb9195769c14`, runtime repeatability 3/3 PASS with fingerprint `dc4de5383325ee3b0d03ca6d77b8282bb0986e19c8e12567c2022a8aa3f29fcf`. The sweep exposed two defects rather than an acceptable promotion candidate: both Commonness variants produced 30 phonetic-guard violations due to a non-transitive pairwise near-tie comparator, and raw English query-spelling overlap penalty increased unranked Top-20 rows (119 phonetic control vs 197 DE-architecture control vs 218 conservative-commonness). Phase 12B10 fixes both structurally with anchored <=0.03 phonetic bands, spelling overlap diagnostic-only, bounded unknown-usage confidence penalty, and one consolidated `npm run en:writer:accept` command that selects the lowest safe Commonness candidate plus the lowest effective Diversity weight. Product EN remains disabled.

Phase 12B10 English Writer owner evidence reviewed. Owner report `b1aacf3c2de3f91b9ce740744b15f89c797a24b4dc916f0f72f5d8235ea266cb` selected `guarded_commonness_06` as the least-intervention Quality candidate (phonetic drop 0.001061, Commonness uplift 0.035469, unranked delta -62, zero guard violations). Diversity review selects weight `0.08` as the constrained Pareto point: near-duplicates -45.6853%, repeated-lemma rows -38.7755%, phonetic drop 0.000322, Commonness drop 0.034878, zero guard violations; weights >=0.12 breach the <=0.04 Commonness-drop guard. No further ranking owner run is required. The 42.21 MiB report size was a serialization defect; default acceptance output is now compact (~165 KiB when reconstructed from the same evidence), with full matrices debug-only. Active gate: Phase 12B11 integrated EN / DE+EN product acceptance with frozen German invariance.

Phase 12B11 English product integration candidate implemented. The selected `guarded_commonness_06 + Diversity 0.08` policy now runs through a dedicated source-backed EN product runtime and the existing unified `DE / EN / DE+EN` Writer contract. The normal server remains gated: it opens `data/local/rhymelab-en-v1.sqlite` only when `data/local/en-product-enabled-v1.json` is present and valid. One owner command, `npm run en:product:accept`, performs German frozen-runtime equivalence, EN sentinels, DE+EN composition, no-language-leakage, no-fake-unknown-pronunciation, explicit EN Phrase/Mosaic unavailability, and two independent-open repeatability. PASS writes the enablement marker automatically. Primary report: `data/local/en-product-acceptance-v1-report.json`.

Phase 12B11 owner integrated product acceptance run 1 was deterministic and passed every gate except `english_multisyllabic_nation_station`. DB/publish/runtime fingerprints, German frozen Writer invariance, EN language isolation, `time -> rhyme`, `record`/ `route` variants, DE+EN composition, explicit EN Phrase/Mosaic unavailability, unknown-query safety and independent-open repeatability all passed. Root cause: the Product runtime inherited the low-level diagnostic default of 128 candidates per channel; the earlier runtime diagnostic had intentionally used a larger reservoir for the `nation -> station` control. Product retrieval candidate now uses profile `en-product-retrieval-reservoir-v1`: exact=1536, multi=1536, vowel=128, family_coda=128, coda=128, merged max=3072. This covers the accepted DB's measured max exact/multi bucket of 1430 without exploding broad coda channels. Owner reruns the same `npm run en:product:accept` command after merge.

Phase 12B11 English Product integration is **ACCEPTED / FROZEN**. Owner rerun status is `ok`; accepted report semantic fingerprint is `c889adf2253f3b149d6363f2063b40717b79a4f0cf24a06c953a599a66613ca6`, independent-open suite fingerprint is `26a6e97ddf3f17fcf6721e4487f136badd4838edce13b2020d376dbacc48115d`, all integrated checks pass, German Writer invariance is preserved, and `data/local/en-product-enabled-v1.json` was written. Accepted EN product profile: Quality `guarded_commonness_06`, Diversity `0.08`, retrieval `en-product-retrieval-reservoir-v1` (exact/multi 1536; broader channels 128; merged max 3072).

Phase 12C Entity work is resumed. To avoid micro-gates, the next owner action is one consolidated command: `npm run entity:multilingual:evidence`. It includes the previously deferred P898 owner workflow, verifies frozen DE Entity runtime fingerprint invariance, validates the accepted English product DB/profile, and measures source-backed English Entity-name recovery using exact accepted EN pronunciations plus bounded <=6-token composition. It is evidence-only: no English Entity runtime promotion, no P898 runtime promotion, no broad G2P, no population retune. Output is the compact `data/local/entity-multilingual-pronunciation-evidence-v1-report.json`.

Phase 12C consolidated multilingual Entity evidence is complete: status `evidence_ready`, fingerprint `1861f29aaf0b029d3ac69c1cd6511a0c0b573c47e325efea75e0a9f42b1ec88a`. Current EN Entity coverage is 459,728 / 1,415,550 names (32.48%); 955,822 remain unresolved. P898 contributed 27 evidence rows and did not mutate runtime.

The next block is implemented as `npm run entity:pronunciation:expand`. It reuses the existing raw Kaikki English file and pinned CMUdict directly for Entity names/tokens, adds conservative hyphen/title/numeral composition, supports optional Moby raw evidence, writes a separate local sidecar, and measures the residual unresolved population before any G2P. Proper-name G2P benchmark preparation/evaluation commands are implemented for MFA / DeepPhonemizer / Charsiu candidates; no model is run or promoted by the expansion gate.

Phase 12C Entity pronunciation source expansion owner run is **ACCEPTED**. The compact report status is `evidence_ready`; semantic fingerprint `fdabce67cc53ef7028402b7a92b6538a61663477a41adf81905c80218f0b949d`. English Entity readiness improved from 459,728 / 1,415,550 (32.48%) to 710,561 / 1,415,550 (50.20%), a gain of 250,833 names. Preferred-name readiness improved to 558,036 / 1,062,694 (52.51%), +175,690. Direct raw-source recovery added 10,255 names; improved deterministic composition added 240,578. The residual unresolved population is 704,989 names, including 504,658 preferred names. Moby was not present and is not promoted to a blocking owner gate. No generated G2P was used.

The next gate is the real proper-name G2P benchmark already implemented by `npm run entity:g2p:benchmark:prepare`. Benchmark MFA first; use DeepPhonemizer only as an independent comparison. Charsiu remains research-only pending clean model/data licensing. Do not generate pronunciations for the 704,989 residual names until the proper-name benchmark establishes an acceptable fallback policy.

Phase 12C G2P benchmark v1 preparation is **REJECTED AS A CONTROL-SET DESIGN DEFECT BEFORE MODEL EXECUTION**. The 600-case file was popularity-first over whole Entity surfaces: 599/600 were single-word surfaces, 592/600 had CMUdict references, and only 578 normalized surfaces were distinct. This would overstate ordinary-English/CMUdict performance and does not match the unknown-token fallback unit. No G2P model was run.

Benchmark v2 is implemented around unique Entity-name tokens with explicit en-US Kaikki/Wiktionary proper-name IPA as gold; CMUdict is excluded as gold and duplicate normalized controls are forbidden. The primary MFA target is now pinned `english_us_arpa` v2.0.0a (ARPA, Pynini, CC BY 4.0), which avoids a phone-set conversion layer. The normal owner gate is bundled: `npm run entity:g2p:benchmark:mfa` rebuilds v2, validates it, runs MFA, and writes `data/local/entity-g2p-mfa-en-us-arpa-evaluation-v2.json`.

First MFA v2 owner execution is **REJECTED AS A RUNNER INPUT/MAPPING DEFECT, NOT A MODEL RESULT**. The benchmark itself remained the accepted 600 unique-token control (`02e0e3a3…`), but only 13 predictions were mapped/evaluated and 587 were missing. The partial 13-case metrics (76.92% exact-tail, mean rhyme score 0.923103) are not acceptance evidence. Root cause: MFA's word-list generator cleans graphemes outside the model inventory; the runner supplied display-case Proper Names while the selected ARPA model exposes lowercase a-z + apostrophe graphemes. The runner now supplies explicit lowercase model inputs, records conservative combining-mark folding, refuses unsupported residual graphemes instead of silently deleting them, and hard-fails below 95% model-eligible prediction coverage.

Phase 12C proper-name MFA benchmark v2 now has a valid full-coverage owner result. Of 600 controls, 599 were model-input eligible, all 599 received an MFA prediction, 597 were evaluable, two predictions were phonologically invalid, and one control was model-ineligible. Quality: exact phones 70.35%, exact stressed rhyme tail 71.19%, syllable count 95.98%, stress pattern 80.57%, primary stress 94.14%, mean rhyme score 0.913040. Evaluation fingerprint: `b6c3943f90a90a2938bcd3ce74ccecc95eedc67712fe751a6dda0266b2c91b5a`.

Decision: **do not promote MFA as an unconditional fallback for the remaining 704,989 unresolved Entity names**. Tail error remains too high for blind rhyme-anchor generation. Before benchmarking another model, run one cheap calibration gate using MFA's own exported Pynini path score. The runner now writes scores into predictions and the evaluator reports quality/retention points at 10/25/50/75/90/100% plus the maximum retained set that reaches 90% and 85% exact-tail. If the score does not materially separate good from bad proper-name pronunciations, MFA runtime fallback is rejected.

Phase 12C MFA confidence calibration is **COMPLETE / REJECTED FOR RUNTIME FALLBACK**. The calibrated owner evaluation fingerprint is `9bc00102d46af55352505389c03fe048083cdd81c966007ab86924d9df233488`. The best 10% by MFA/Pynini score reach only 86.67% exact-tail. Requiring >=90% exact-tail retains just 10 / 597 scored controls (1.68%); >=85% exact-tail retains 131 / 597 (21.94%). This is not enough useful high-confidence coverage to justify generated Entity pronunciation promotion.

The next and final planned independent candidate is forced-neural `g2p-en` 2.1.0. Its Apache-2.0 package includes `checkpoint20.npz`, outputs stressed ARPAbet, and documents CMUdict as the training basis. The benchmark calls `G2p.predict()` directly so CMUdict/homograph/POS lookup cannot inflate the result. DeepPhonemizer is deferred because its code license is clear but the pretrained checkpoint license is not separately explicit enough for the intended commercial runtime path.

Phase 12C generated proper-name G2P campaign is **CLOSED / NO RUNTIME PROMOTION**.

Independent forced-neural `g2p-en` 2.1.0 owner evidence completed on the same accepted 600-case proper-name token benchmark. The run forced `G2p.predict()`, bypassed CMUdict/homograph/POS lookup, covered 596/596 model-eligible cases, evaluated all 596 predictions and produced zero invalid pronunciations. Quality: exact phones 64.60%, exact stressed rhyme tail 64.26%, syllable count 93.62%, stress pattern 81.88%, primary stress 91.95%, mean rhyme score 0.891655. Owner report fingerprint: `5511c6e2c83550b753692a64a1485302c88b61b5bc4acecf4a3a8e29937061b6`.

This is materially worse than MFA on the product-critical exact stressed rhyme tail (64.26% vs 71.19%, -6.93pp). MFA was already rejected because confidence gating retained only 1.68% of controls at >=90% exact-tail and 21.94% at >=85%. Therefore no third generated-pronunciation model will be added. The remaining 704,989 unresolved English Entity names stay unresolved.

The g2p-en owner report's `confidence_calibration` block is invalid reporting noise: the candidate has no confidence score and the evaluator coerced `null` to zero before calibration. Primary metrics are unaffected. The evaluator now treats missing confidence as unscored; no owner rerun is required.

Authoritative decision: `docs/ENTITY_G2P_DECISION_V1.md`. Next Phase 12C gate is source-backed Entity pronunciation/runtime integration only.

## Phase 12C accepted main checkpoint — runtime + targeted AI staging

Accepted via PR #112; squash-merged to `main` at `e0ddbfac`. The old branch is historical.

Focused continuation document: `docs/PHASE_12C_ENTITY_RUNTIME_AI_STAGING_HANDOVER.md`.

Implemented on the branch: source-backed EN Entity runtime and rhyme anchors, DE+EN Entity Writer channel/UI integration, guarded phonetic-first Entity ranking, deterministic QID/surface diversity, batched category metadata, a full-data Entity Writer acceptance suite, one consolidated owner runner, historical full-unresolved AI queue tooling, ZIP importer/staging SQLite/audit, strict ARPAbet and manifest/batch validation, idempotent identical-result imports, aggregate confidence/category/orthography/problem-population diagnostics, LLM benchmark evaluator, benchmark-v3 explicit review gate, and multilingual runtime verification preserving the frozen DE fingerprint with zero generated accepted EN runtime rows.

Acceptance contracts: `docs/PHASE_12C_ACCEPTANCE.md` and `docs/ENTITY_AI_PRONUNCIATION_STAGING_V1.md`.

Current source-backed gate: **OWNER FULL-DATA ACCEPTED**.

```text
owner report                     rhymelab-phase12c-owner-acceptance-v1 / ok
EN names considered              1,415,550
EN runtime-ready                   710,500 / 50.19%
EN unresolved                      705,050 / 49.81%
EN analyses                        710,500
EN anchors                       3,552,500
EN runtime fingerprint
3f2c520ce99868eda81991e6247c6c93bdf8c78f7805d7ceef2cc2ebd85bb6d8
DE fingerprint                   preserved
DE/EN acceptance coverage        100% / 100%
ranking repeatability            PASS
Writer semantic fingerprint
76ac9a32e62fd7b253515569294599012010e9be758db24227a910d893141ae7
```

The previous 710,561 figure is retained as source-resolution evidence; 710,500 is the accepted runtime-analyzable baseline. Performance is not yet product-target quality: the owner acceptance sample measured roughly 384–403 ms p50 and 1.15–1.22 s p95, so Entity Writer latency optimization remains explicit follow-up work.

No source-backed Phase 12C merge work remains. Current engineering follow-up is Entity Writer performance optimization plus a separate targeted Top-100k unresolved-Entity pronunciation campaign.

Benchmark-v3 context-gold review and AI pronunciation evidence belong to the separate AI-evidence track. They do **not** block source-backed runtime acceptance or merge. AI staging remains non-runtime evidence, `runtime_promoted=0`, and no confidence threshold is preselected for promotion.

Updated AI collection policy: do **not** annotate the complete 704,989/705,050 unresolved long tail. The next campaign is limited to runtime-unresolved English names attached to the **top 100,000 retained Entities by accepted popularity ordering**. The exact target count must be measured locally before export; historical bulk queue IDs remain immutable. Everything outside that Top-100k scope stays unresolved unless the owner later changes the policy.



## Pronunciation Backfill V2 — base-parity opt-in decision

Owner result is complete: 3,365,814 eSpeak A/B rows form the active generated population. They remain **second-class, user-opt-in-only** and must never enter default search automatically. Client B (292), Client C (2,161), Client D (60), and U (25) remain explicitly deferred for later review.

The earlier bespoke Secondary V1 sidecar is superseded. Generated rows must now be represented with **exactly the same persistent SQLite schema as the regular base dataset for their domain — no reduced schema and no extra Etymology/Senses sidecar**. The materializer builds augmented copies of the canonical DE Writer, EN Writer, Phrase and Entity databases, inserts/rebuilds generated data through their existing tables/materializers, and hard-fails on any persistent schema mismatch. Canonical DBs remain untouched. See `docs/PRONUNCIATION_BASE_PARITY_V1.md`.


Generated Pronunciation Base-Parity V1 owner materialization is **ACCEPTED**: status `ok`, 3,365,814 active eSpeak A/B rows, zero unclassified active rows, exact persistent SQLite schema parity for DE/EN/Phrase/Entity, 7,967 / 8,070 generated phrase surfaces represented by canonical composition and 103 dependency-blocked phrase surfaces parity-deferred. The runtime/UI opt-in integration is now implemented behind an additional local acceptance marker. Default Writer search remains canonical-only. Before the checkbox can enable locally, run `npm run pronunciation:secondary:runtime:accept`; only a passing run writes `data/local/generated-optin-runtime-enabled-v1.json`. Runtime contract: `docs/GENERATED_OPTIN_RUNTIME_V1.md`.
