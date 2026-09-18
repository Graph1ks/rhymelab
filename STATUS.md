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

### Phase 11B3 — local Phrase Explorer

The read-only Phrase Explorer remains available for source, Leipzig, pronunciation and optional generic register evidence.

Cologne Kiezdeutsch remains optional additive register evidence; automated Zenodo PDF 403 behavior is nonblocking because owner-local files may be supplied directly.

The read-only Phrase Explorer is available at:

```text
http://127.0.0.1:3030/phrases
```

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

### Phase 11D2 — bounded indexed candidate retrieval — OWNER FULL-DATA BUILD COMPLETE / REPEATABILITY PENDING

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
### Immediate owner gate

After merge:

```powershell
git switch main
git pull --ff-only
npm run phrase:mosaic:retrieval
```

Generated report:

```text
data/local/phrase-mosaic-retrieval-v1-report.json
```

Review token coverage, phrase coverage, unresolved surfaces, syllable distribution, pronunciation-alternative counts and representative IPA/boundary samples. Run `npm run phrase:pronunciation` a second time and require the same pronunciation fingerprint.

The read-only coverage analyzer ranks unresolved normalized tokens by actual phrase-blocking impact and reports cumulative Top-N resolution-unblock upper bounds. Use it to decide whether a small reviewed 11C2 lexical-gap pass has enough leverage to justify itself before 11D; it does not approve pronunciations or introduce G2P.

The base catalog fingerprint must remain:

```text
f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
```

Only after this gate should Phase 11D mosaic/cross-word retrieval begin. The accepted single-word Writer remains frozen and unchanged. Human Writer NDCG remains pending.
