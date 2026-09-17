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

### Phase 11A source/licensing gate — COMPLETE

Selected initial stack remains:

- raw German Wiktionary via Kaikki/Wiktextract — source-backed phraseology;
- frozen Leipzig News 2024 1M + Wikipedia 2021 1M + Web 2021 1M — phrase attestation/commonness;
- optional/conditional sources remain separated as documented in the source survey.

### Phase 11B1 provenance phrase catalog — IMPLEMENTED / FIXTURE VALIDATED

Implemented schema/policy:

```text
phrase DB schema       rhymelab-phrase-catalog-v1
phrase policy          de-phrase-catalog-v1
Leipzig match policy   leipzig-exact-token-sequence-v1
runtime rewired        false
```

The implementation includes:

- separate source/snapshot/license provenance;
- deterministic phrase/snapshot/attestation identities;
- streamed German Wiktextract multi-word ingestion;
- source-backed phrase types/tags without invented classifications;
- `historical_only`, `mixed`, and current/unmarked state;
- deterministic token boundaries with explicit unresolved lexical state;
- Leipzig exact-token-sequence occurrence/sentence commonness evidence;
- deterministic catalog fingerprinting;
- fixture tests covering all three frozen Leipzig corpus roles and repeat-build fingerprint equality;
- local bootstrap command `npm run phrase:catalog:bootstrap`.

The repository CI fixture gate passes without changing the accepted single-word Writer runtime.

### Immediate next gate — owner-local full phrase catalog build

Run:

```powershell
npm run phrase:catalog:bootstrap
```

This should reuse the existing Kaikki cache when available, verify/download the frozen Leipzig archives, extract their sentence files, and create:

```text
data/local/rhymelab-phrases-v1.sqlite
data/local/phrase-catalog-v1-report.json
```

Review real-data phrase/type/history/commonness distributions, SQLite size/build time, and repeat fingerprint equality before Phase 11C begins.

Do **not** yet implement phrase pronunciation, connected speech, mosaic retrieval/indexing, phrase Writer ranking, API/UI phrase surfacing or Human Writer NDCG.

The accepted German single-word Writer remains frozen and unchanged. English remains deferred until the German phrase/mosaic path is stable enough to freeze.
