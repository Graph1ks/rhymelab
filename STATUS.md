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

### Phase 11C1 — deterministic phrase pronunciation — IMPLEMENTED / OWNER FULL-DATA GATE PENDING

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

### Immediate owner gate

After merge:

```powershell
git switch main
git pull --ff-only
npm run phrase:pronunciation
npm run phrase:pronunciation:coverage
npm run dev
```

Generated report:

```text
data/local/phrase-pronunciation-v1-report.json
data/local/phrase-pronunciation-coverage-v1-report.json
```

Review token coverage, phrase coverage, unresolved surfaces, syllable distribution, pronunciation-alternative counts and representative IPA/boundary samples. Run `npm run phrase:pronunciation` a second time and require the same pronunciation fingerprint.

The read-only coverage analyzer ranks unresolved normalized tokens by actual phrase-blocking impact and reports cumulative Top-N resolution-unblock upper bounds. Use it to decide whether a small reviewed 11C2 lexical-gap pass has enough leverage to justify itself before 11D; it does not approve pronunciations or introduce G2P.

The base catalog fingerprint must remain:

```text
f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
```

Only after this gate should Phase 11D mosaic/cross-word retrieval begin. The accepted single-word Writer remains frozen and unchanged. Human Writer NDCG remains pending.
