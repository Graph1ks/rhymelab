# RhymeLab — Thread Handover

Last updated: 2026-09-18

Repository state is authoritative. Do not reconstruct project state from prior chats.

## Start here

Read in order:

1. `AGENTS.md`
2. this file
3. `STATUS.md`
4. `PROJECT_STATE.json`
5. `ROADMAP.md`
6. `DATA_SOURCES.md`
7. `docs/WRITER_SEARCH_ACCEPTANCE.md`
8. `docs/PHRASE_MOSAIC_PLAN.md`
9. `docs/FUTURE_NATURAL_LANGUAGE_RHYME_RETRIEVAL.md`
10. `docs/BENCHMARK.md`
11. `docs/API.md`
12. `docs/WRITER_RANKING.md`
13. `docs/WRITER_LEXICAL_MODEL.md`
14. `docs/EXTERNAL_COMPARISON_D_RHYME.md`

## Hard boundary

RhymeLab core search stays deterministic and local-only. Do not add LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads or runtime network dependencies. Generated linguistic data, SQLite, benchmark queues/reviews/reference labels, reports and downloaded raw sources remain local/gitignored.

Do not invent source, license, phraseology, pronunciation, or benchmark facts. Public web visibility alone is not sufficient for ingestion/redistribution.

## Current runtime — v0.11.0

The accepted German single-word Writer runtime is now the normal product/dev runtime.

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

`npm run dev` uses v5 by default.

The previous v0.10 / DB-v4 runtime is retained only as an optional regression/control path:

```text
control DB            data/local/rhymelab.sqlite
control DB schema     rhymelab-local-db-v4
request               ?ranking=legacy
```

Normal startup requires only the v5 Writer DB. If v4 is absent, only explicit legacy requests are unavailable.

Build/rebuild the v5 Writer database with:

```powershell
npm run writer:v5:rebuild
```

or individual steps:

```powershell
npm run de:publish:v3
npm run local:db:v5
npm run writer:v5:materialize
```

## German single-word Writer baseline — ACCEPTED / PROMOTED / FROZEN

Acceptance report: `docs/WRITER_SEARCH_ACCEPTANCE.md`.

Final owner evidence:

```text
legacy invariance                    27 / 27
runtime candidate mismatches              0
runtime policy mismatches                 0
protected-order mismatches                0

DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
anchor rows                      3,153,639
positive morphology rows          325,724
freelist pages                           0

retrieval equivalence                12 / 12
retrieval mismatch queries                0
morphology regressions               10 / 10
retrieval-only speedup                 14.12x

Writer Page runtime contract         12 / 12
structural gate                          PASS
final mean writer elapsed            1103.9 ms
frozen validation mean               1528.8 ms
mean improvement                       27.8%
Arbeitsweise final                   3021.8 ms
Arbeitsweise previous                7105.7 ms
Arbeitsweise improvement               57.5%
legacy Tier-0 retention              685 / 685
Top-20 exact duplicates                    0
Top-20 near duplicates                     0
Top-20 same-lemma rows                     0
Top-20 repeated family rows                0
preferred pronunciation              240 / 240

repeatability independent opens            3
suite fingerprints equal                true
repeatability mismatches                   0
suite fingerprint
c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab
```

Protected semantics:

- `Arbeitsweise -> Hochzeitsreise` is only a retrieval sentinel (`max_rank: 250`), not a Top-20 guard; final rank 116.
- `Arbeitsweise -> right:reise` is the family surfacing guard; `Weiterreise` rank 3.
- `Liebe -> Diebe` rank 1.
- `Leben -> neben` rank 2.
- `Nacht -> macht` rank 1.
- all 10 productive-`-weise` / false-split morphology regressions pass.

Writer v7 remains rejected and rolled back. Do not reopen ad-hoc v6/v4 tuning without a new benchmarked candidate.

## Human Writer NDCG — deliberately deferred

Do **not** run or fabricate Human Writer NDCG now.

Writer Page human usefulness NDCG@10/20 stays `pending_reference` until the broader German Writer system is sufficiently feature-complete — including phrase/mosaic/phraseology — and independent human reviewers exist. The project owner alone is not an independent reference source.

During Phase 11 use structural, provenance, regression, lexical-safety, deterministic-repeatability, and performance gates.

## Current phase — Phase 11 German phrase / mosaic / phraseology

Plan: `docs/PHRASE_MOSAIC_PLAN.md`. Source survey: `docs/PHRASE_SOURCE_SURVEY.md`. Phrase catalog contract: `docs/PHRASE_CATALOG_V1.md`.

### Phase 11B1 — FULL OWNER BUILD COMPLETE

The full owner-local Wiktionary + Leipzig phrase catalog build succeeded:

```text
schema                    rhymelab-phrase-catalog-v1
fingerprint               f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
SQLite                    153.74 MiB
phrases                   98,504
modern eligible           97,400
historical only            1,104
mixed historical             148
attestations              99,357
Leipzig usage rows        28,799
runtime rewired            false
```

All three frozen Leipzig corpora completed with 1,000,000 sentences and zero malformed sentence rows. A second independent full build is still required before 11C to confirm the same semantic fingerprint.

### Phase 11B2 — modern register evidence / diagnostics

Cologne Kiezdeutsch 2025 v2 is selected as a lightweight CC BY 4.0 youth/urban/spoken register sensor. Only the three transcription PDFs are downloaded (~970 KiB total); audio is deliberately excluded. Register evidence is additive and cannot create phrase types, candidates, or general commonness claims.


Phase 11B2 diagnostics completed successfully. Key result: 15,449 modern-eligible phrases have Leipzig evidence (15.86%); 4,683 occur in all three frozen Leipzig corpora. The raw catalog is lexeme-heavy (92,967 `multiword_lexeme`; 93,863 two-token rows), so abbreviation aliases and generic lexical combinations must remain visible as lower-quality/noise classes rather than being mistaken for phraseology.

Phase 11C1 implementation is now present. It reuses the accepted Writer-v5 pronunciation inventory instead of introducing a second G2P source.

```text
schema                    rhymelab-phrase-pronunciation-v1
policy                    de-phrase-pronunciation-v1
resolver                  writer-v5-preferred-surface-aware-v2
composition               preferred-token-citation-composition-v1
boundaries                explicit-word-boundary-v1
analyzer                  de-ipa-v2
connected speech          attested-or-explicit-rule-only-v1
```

11C1 materializes exactly one preferred citation pronunciation per fully resolved phrase. Token alternatives are counted but not cross-product-expanded. Unknown tokens remain unresolved; no G2P guessing occurs. Phrase IPA retains word boundaries plus per-token phoneme/syllable spans and all citation stress positions.

The Phase 11B1 catalog fingerprint is explicitly checked before/after materialization and must remain unchanged.


The owner-local full-data 11C1 build has now completed successfully:

```text
pronunciation fingerprint   fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
resolved tokens             195,490 / 205,957
token coverage              94.92%
ready phrases               90,089 / 98,504
ready modern phrases        89,865
phrase coverage             91.46%
unresolved tokens           10,467
blocked phrases              8,415
base fingerprint match      true
```

This closes the full-data-build portion of the owner gate. The owner gate itself remains open until a repeat materialization produces the same pronunciation fingerprint and the dedicated coverage-impact report is reviewed for the 11C2-vs-11D decision.
Owner commands after merge:

```powershell
npm run phrase:pronunciation
npm run phrase:pronunciation:coverage
npm run dev
```

Review `data/local/phrase-pronunciation-v1-report.json` and the IPA section in `http://127.0.0.1:3030/phrases`. Then run the pronunciation materializer again and require an identical pronunciation fingerprint. Phase 11D mosaic retrieval remains blocked until this full-data gate is accepted.

Use `data/local/phrase-pronunciation-coverage-v1-report.json` to measure whether the unresolved coverage is concentrated enough for a small reviewed 11C2 lexical-gap pass. The coverage analyzer is diagnostic/read-only and reports phrase-blocker and cumulative Top-N unlock upper bounds; it does not authorize G2P or automatic lexical additions.

Single-word Writer remains frozen; Human Writer NDCG remains pending.


## Phase 11C1 repeatability — PASS / PHASE CLOSED

The second owner-local pronunciation materialization exactly reproduced the accepted fingerprint:

```text
first   fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
repeat  fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
equal   true
```

The base catalog fingerprint remained `f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d`, database size and coverage counts were unchanged. Phase 11C1 is accepted and closed.

## Phase 11D1 owner full-data build — COMPLETE / REPEATABILITY PENDING

The first full owner-local mosaic-window materialization succeeded:

```text
source pronunciation fingerprint
fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548

base catalog fingerprint
f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d

pronunciations scanned    90,089
phrases with windows      90,089
windows                  356,693
SQLite                   510.09 MiB
window fingerprint
24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
```

2–4-syllable windows account for 291,751 / 356,693 windows (~81.79%). 327,828 windows cross exactly one word boundary; multi-boundary windows are present up to five boundaries.

Interpretation: the 11D1 substrate has useful scale without exploding combinatorially. Exact indexed lookup is ready; fuzzy candidate retrieval and phrase ranking remain intentionally deferred.

Remaining 11D1 gate: rerun `npm run phrase:mosaic:windows` and require the same window fingerprint before 11D2.
## Phase 11D1 repeatability — PASS / PHASE CLOSED

Second owner-local materialization reproduced the accepted window substrate exactly:

```text
first   24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
repeat  24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
equal   true
```

Counts, distributions, source pronunciation fingerprint, base catalog fingerprint and 534,872,064-byte DB size were unchanged. 11D1 is accepted/frozen.

## Phase 11D2 owner full-data build — COMPLETE / REPEATABILITY PENDING

The first full owner-local retrieval-anchor materialization succeeded:

```text
anchor rows                 356,693
distinct exact-tail keys    181,548
distinct vowel keys          52,174
distinct final keys              772
SQLite                     686.76 MiB
anchor fingerprint
55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
```

The accepted 11D1 source window fingerprint remained exactly `24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac`, confirming that the 11D2 layer is additive and non-mutating.

Remaining 11D2 gate: rerun `npm run phrase:mosaic:retrieval` and require the same anchor fingerprint before representative query diagnostics.
## Phase 11D2 repeatability — PASS / PHASE CLOSED

Second owner-local retrieval-anchor materialization reproduced the accepted substrate exactly:

```text
first   55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
repeat  55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
equal   true
```

Anchor count, all distinct-key counts, source fingerprints and 720,117,760-byte DB size were unchanged. 11D2 is accepted/frozen.

## Phase 11D3 owner full-data diagnostic — COMPLETE

The first full diagnostic over the established 12-query Writer v2 suite completed successfully:

```text
ok queries                      9 / 12
mean elapsed                    33.6 ms
returned candidates            1,771
weak                           989 (55.84%)
slant                          720
family                          60
multisyllabic slant              1
multisyllabic perfect            1
final fallback channel         1,280 assignments
semantic fingerprint
294a26d670e0202a0b5171d51c16d6059eff3f03620dd5b57369a04b4a87625c
```

`Arbeitsweise`, `Liebe`, `Freiheit`, and `hitzefrei` demonstrate that the accepted substrate can return useful multiword phonetic candidates. However, `Leben`, `Feuer`, and `Gedanken` are dominated by weak final-fallback candidates, while `Musik` receives no mosaic anchor because its accepted stressed rhyme domain is one syllable even though the full word is two syllables.

Decision: **do not proceed to 11E yet**. Keep 11D1 and 11D2 frozen and introduce a separate 11D4 candidate-retrieval revision with a full-surface multi-syllable query domain, a vowel-family bridge channel, and default rejection of weak candidates with no matched sound relation.
## Phase 11D3 — current

Contract: `docs/PHRASE_MOSAIC_QUERY_DIAGNOSTICS_V1.md`.

Fixture gate passed in required `validate` CI (run 253): source check, full tests including semantic-repeatability/no-anchor cases, and public-readiness audit all passed.

The diagnostic runner uses the existing `benchmarks/de-writer-v2/plan.json` 12-query suite and Writer-v5 preferred pronunciations through `getWord()`. It records structural retrieval behavior only; there is still no phrase usefulness ranking.

Important diagnostic distinction:

- one-syllable query -> `query_below_2_syllable_mosaic_minimum`;
- multi-syllable word whose stressed rhyme domain is only one syllable -> `accepted_rhyme_domain_below_2_syllable_mosaic_minimum`.

Owner command after merge:

```powershell
npm run phrase:mosaic:diagnose
```

Upload `data/local/phrase-mosaic-query-diagnostics-v1-report.json`. Review retrieval coverage, candidate volumes, channel dominance, representative top candidates and latency before any 11E ranking design.
## Phase 11D2 — current

Contract: `docs/PHRASE_MOSAIC_RETRIEVAL_V2.md`.

Fixture gate passed in required `validate` CI (run 248): source check, full test suite including SQLite query-plan assertions, and public-readiness audit all passed.

Fixture implementation adds an additive `phrase_mosaic_retrieval_anchor` table and four bounded indexed channels:

- exact rhyme-domain tail;
- full vowel sequence + exact final coda;
- full vowel sequence;
- final nucleus + coarse coda class within ±1 syllable.

The exact-tail anchor deliberately excludes the first onset to match `de-phon-v3`; do not replace it with raw 11D1 `phoneme_key` equality.

All channels have hard SQL limits, no full-scan fallback, and candidates are scored by the existing German scorer. This is phonetic candidate ordering only, not phrase Writer ranking.

Owner command after merge:

```powershell
npm run phrase:mosaic:retrieval
```

Review `data/local/phrase-mosaic-retrieval-v1-report.json`, then repeat once and require an identical anchor fingerprint before representative query diagnostics.
## Phase 11D1 — current

Contract: `docs/PHRASE_MOSAIC_RETRIEVAL_V1.md`.

Implemented fixture/code substrate:

- deterministic 2–6-syllable windows over accepted phrase pronunciation;
- only spans with at least one strict interior word boundary are retained;
- syllable, phoneme and token coordinates are stored;
- windows may start/end inside multi-syllable tokens;
- exact phoneme and exact vowel indexes are materialized;
- stable per-window and whole-index fingerprints;
- no fuzzy retrieval, phrase ranking, generation or Writer runtime rewiring.

Owner command after merge:

```powershell
npm run phrase:mosaic:windows
```

Review `data/local/phrase-mosaic-windows-v1-report.json`, then run the materializer again and require the same window fingerprint before 11D2 candidate retrieval.
## Phase 11C coverage triage — COMPLETE

The owner-local coverage-impact report has been reviewed. Current modern phrase coverage is 92.26%; 7,535 modern phrases remain blocked by 5,894 distinct unresolved normalized forms.

Cumulative resolution-only upper bounds:

```text
Top-1     317 modern phrases -> 92.59% projected modern coverage
Top-20    624 modern phrases -> 92.90%
Top-100 1,036 modern phrases -> 93.33%
Top-250 1,532 modern phrases -> 93.84%
```

`zurecht` dominates the clean high-impact tail at 317 single-blocker modern phrases; `inne` has 40 and `überein` 28. After the first few candidates the list rapidly becomes mixed/noisy: abbreviations and numerals, entities/foreign place-name components, specialist lexemes and historical forms.

Decision: **skip a blocking 11C2 pass**. Keep selected ordinary-German lexical gaps as a nonblocking, source-backed backlog only. Do not add broad G2P and do not mutate the frozen Writer-v5 runtime for phrase coverage. After the outstanding repeatability check, proceed to 11D deterministic cross-word phonetic windows / mosaic retrieval.
## Latest owner observation — Phrase Explorer / 11C1

The simplified Phrase Explorer works after RUEG removal.

A representative unresolved coverage case is:

```text
auf Hochtouren

auf         resolved_preferred
hochtouren  unresolved_no_writer_form
```

This is not a phrase-parser failure. The complete phrase pronunciation is blocked because Writer-v5 currently has no accepted pronunciation row for `hochtouren`.

Treat this as a useful 11C coverage class. Before adding any broad G2P fallback, classify unresolved phrase tokens into:

- useful ordinary German lexical gaps;
- historical spellings;
- names/entities;
- foreign-language material;
- source/noise artifacts.

The confirmed full-data pronunciation run resolved 195,490 / 205,957 tokens (94.92%) and produced 90,089 / 98,504 fully pronounceable phrases (91.46%). The corrected surface-aware resolver and base-fingerprint contract are already in main. Do not infer that every remaining unresolved token deserves automatic pronunciation.

## Deferred high-value direction — retrieval-first generation

The owner explicitly wants the Markov / natural-language-retrieval direction preserved for later work.

Authoritative design note:

`docs/FUTURE_NATURAL_LANGUAGE_RHYME_RETRIEVAL.md`

Key idea:

```text
RhymeLab word + phrase DB
  -> IPA / syllable / stress / phoneme windows across word boundaries
  -> retrieve hundreds of attested natural chunks
  -> constrain by naturalness / usage / register / syntax
  -> deterministic Markov or template/phrase-splice recombination
  -> rerank by rhyme / assonance / stress / naturalness / novelty
```

Preserve separate component scores rather than one opaque score.

Research leads from the earlier discussion that must not be forgotten:

- RhymePad: architecture/reference for phoneme and mosaic handling; English-oriented; verify independently before any adoption.
- PanPhon: possible articulatory-feature edit distance for slant/assonance.
- gruut: possible German/English pronunciation fallback/comparison; not part of current pronunciation truth.
- SQLite FTS5: local lexical/context retrieval.
- sqlite-vec / embeddings: optional research only; conflicts with current no-ML core boundary unless explicitly isolated by a future architecture decision.
- Markov: particularly interesting as a deterministic recombination layer **after** source-backed phonetic retrieval.
- LLM generation: only optional/downstream if ever explored; never core rhyme truth or required runtime.

Do not implement these before current phrase IPA and deterministic mosaic retrieval are stable.

## Immediate next-thread starting point

1. Treat GitHub main as authoritative and read the required continuity files.
2. Keep the single-word Writer frozen.
3. RUEG is removed/rejected; do not revive it.
4. Phrase Catalog + Leipzig + IPA Explorer are the active phrase foundation.
5. Coverage triage is complete: a blocking 11C2 pass is rejected; selected lexical gaps remain nonblocking/source-backed backlog only.
6. 11C1 repeatability is confirmed and Phase 11C is closed.
7. 11D1 is accepted. Current milestone is 11D2 bounded indexed candidate retrieval.
8. Only after 11D1 passes, design bounded 11D2 candidate retrieval without full-corpus scans.
9. Preserve the future Markov/retrieval-first design note for the later generation phase.
