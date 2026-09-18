# Public-facing status

Last updated: 2026-09-18

RhymeLab's public repository is `Graph1ks/rhymelab`. `main` is protected and the required public CI check is `validate`.

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

Compact next-thread handover: `docs/THREAD_HANDOVER_PHASE_11E4F.md`.

Current milestone: **11E4/F runtime integration + final acceptance**. 11E3 phrase-channel diversification is accepted/frozen with diversity fingerprint `ca7e04e91226cd5a3855dbe302a54bffaccce8c6d3a9defff8be049ca6153ef1`; three repeatability runs matched exactly and all protected checks passed.

The 11E4 code integration now provides one Writer product surface and one `/api/writer` contract for single words and Phrase/Mosaic. `All / Words / Phrases-Mosaic` are filters inside the same workspace; the standalone Phrase Explorer product UI has been removed. `/phrases` remains only a backward-compatible alias to the same Writer HTML.

Search-language basis is exposed as `DE / EN / DE+EN`. German is active. English is explicitly capability-gated because no accepted English phonology/runtime exists yet; `DE+EN` therefore runs German with an English-unavailable warning until Phase 12.

Remaining to close Phase 11:

```text
11E4 owner full-data integrated smoke/performance gate
11F integrated structural + provenance + performance + repeatability benchmark
Phase 11 closure
```

11E4 and 11F remain one continuous engineering workstream.
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

The old standalone Phrase Explorer product UI is superseded by the unified Writer. Phrase catalog/detail APIs remain read-only diagnostic/provenance support for the unified result inspector.

`http://127.0.0.1:3030/phrases` now serves the same Writer UI as `/` for backward-compatible bookmarks.

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
