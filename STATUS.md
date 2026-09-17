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

Execution plan: `docs/PHRASE_MOSAIC_PLAN.md`. Source decision: `docs/PHRASE_SOURCE_SURVEY.md`. Phrase catalog contract: `docs/PHRASE_CATALOG_V1.md`.

### Phase 11B1 provenance phrase catalog — FULL OWNER BUILD COMPLETE

The fixture-validated `rhymelab-phrase-catalog-v1` implementation has now been built successfully over the owner-local full source snapshots.

```text
catalog fingerprint       f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
SQLite size               161,210,368 bytes / 153.74 MiB
phrases                    98,504
modern eligible            97,400
historical only             1,104
mixed historical              148
attestations               99,357
phrase tokens             205,957
Leipzig evidence rows      28,799
Wiktionary malformed rows       4
runtime rewired             false
```

The three frozen Leipzig inputs each completed at exactly 1,000,000 sentences with zero malformed sentence rows. This establishes the first real-data phrase-catalog build; data-quality diagnostics and an independent repeat full-build fingerprint remain required before Phase 11C.

### Phase 11B2 — lightweight modern register evidence

**Cologne Corpus of Kiezdeutsch 2025 v2 — selected.** It is a small CC BY 4.0 corpus of 2023 informal Cologne youth speech. RhymeLab downloads only the three transcription PDFs (~970 KiB total), never the ~158 MiB audio bundle. Cologne evidence is stored separately as youth/urban/spoken/register evidence and is not treated as representative general-German frequency.

```text
register schema        rhymelab-phrase-register-evidence-v1
Cologne policy         cologne-kiezdeutsch-register-exact-token-sequence-v1
candidate generation   false
general commonness     false
audio download         false
```

**RUEG 1.0 — very useful but deferred.** The official current corpora ZIP is 4.4 GB before audio. Do not add it to the normal bootstrap unless a reproducible slim German-only distribution/export becomes available.

### Immediate owner gate

After this branch is merged:

```powershell
git switch main
git pull --ff-only
npm run phrase:register:cologne:bootstrap
npm run phrase:catalog:diagnose
```

Expected generated reports:

```text
data/local/cologne-kiezdeutsch-register-report.json
data/local/phrase-catalog-v1-diagnostics.json
```

Review transcript-cleaning coverage, Cologne matched phrases, Leipzig 1/2/3-corpus coverage, phrase-type/token/history distributions and anomaly samples. Then repeat the full phrase build once to require the same catalog fingerprint before Phase 11C phrase pronunciation begins.

The accepted German single-word Writer remains frozen and unchanged. Human Writer NDCG remains pending.
