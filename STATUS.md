# Public-facing status

Last updated: 2026-09-17

RhymeLab's public repository is `Graph1ks/rhymelab`. `main` is protected and the required public CI check is `validate`.

## Formal control baseline

The formally accepted control baseline remains RhymeLab `v0.10.0`:

- DB schema `rhymelab-local-db-v4`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternate pronunciations;
- 1,038 historical-only forms;
- 260,450 usage-ranked forms;
- 457.68 MiB SQLite;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- ranking `modern_entity_relative_commonness_1decade_0_05`.

`?ranking=legacy` remains the protected control path for regression evidence.

## German single-word writer engineering baseline — ACCEPTED

Acceptance document: `docs/WRITER_SEARCH_ACCEPTANCE.md`.

Frozen stack:

```text
writer ranking       deterministic_writer_utility_v6
right-edge anchor    de-right-edge-anchors-v1
anchor storage       compact-primary-key-v2
candidate basis      legacy-vowel-key-string-suffix-v1
morphology family    de-attested-right-head-v4
construction         de-adverbial-weise-v2
morphology storage   positive-evidence-compact-v2
runtime              materialized-writer-v5-v1
DB schema            rhymelab-local-db-v5
```

Writer v7 remains rejected and rolled back. Core search remains deterministic, local-only, and free of LLM/ML/neural runtime inference, hosted ranking, telemetry, hidden uploads, or runtime network dependencies.

## Final single-word engineering evidence

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

## Human Writer NDCG policy

Writer Page NDCG@10/20 remains `pending_reference` **by explicit project decision**.

It will not be collected from the project owner alone. Independent human usefulness evaluation is deferred until the broader German writer system — including Phase 11 phrase/mosaic/phraseology — is mature enough to evaluate coherently and independent reviewers are available.

The existing `de-human-rhyme-v1` benchmark remains separate evidence for general rhyme relation/ranking quality and is not substituted for Writer Page human gold.

## Current phase — Phase 11 German phrase / mosaic / phraseology

Execution plan: `docs/PHRASE_MOSAIC_PLAN.md`.

Immediate next gate is **11A public-source survey**. RhymeLab does not yet have a complete source-backed public phrase database for multi-word rhymes, idioms, Redewendungen, metaphors/figurative expressions, collocations, and useful sentence fragments.

Before implementing the phrase database/runtime, research candidate sources and record:

- bulk/reproducible access;
- license and redistribution/commercial compatibility;
- snapshot/version;
- scale and raw format;
- phrase/idiom/metaphor coverage;
- provenance identifiers;
- ability to ingest once and run fully offline.

OpenThesaurus/OdeNet are possible semantic ingredients, not assumed complete phraseology sources.

After source selection: define the phrase data model, deterministic phrase pronunciation, indexed cross-word-boundary mosaic retrieval, a separate phrase writer-ranking policy, and a dedicated Phrase/Mosaic benchmark.

## Language ordering

German phrase/mosaic work comes next. English remains deferred until the German writer path is stable enough to freeze. Cross-language rhyme remains after both language profiles are independently strong.
