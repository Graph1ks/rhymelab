# German Single-Word Writer Search — Engineering Acceptance

Last updated: 2026-09-17

## Decision

**Engineering acceptance: PASS.**

The deterministic German single-word writer-search architecture is accepted as the validated experimental writer baseline on DB schema `rhymelab-local-db-v5` with runtime `materialized-writer-v5-v1`.

This acceptance means the implementation has passed the defined engineering gates for deterministic single-word writer retrieval, ranking, lexical/morphology handling, structural page quality, protected regressions, runtime performance, legacy preservation, and reproducibility.

It does **not** mean the formally accepted/default RhymeLab runtime has been replaced. The accepted/base runtime remains package `v0.10.0` with DB schema `rhymelab-local-db-v4` and the protected `?ranking=legacy` control path. Promotion of the writer runtime to the default is a separate product/runtime decision and has not occurred in this branch.

Independent Writer Page human usefulness labels are not complete. Writer NDCG@10/20 therefore remains `pending_reference`; no human-reference score is claimed here.

## Accepted writer policies

```text
writer ranking:       deterministic_writer_utility_v6
right-edge anchor:    de-right-edge-anchors-v1
anchor storage:       compact-primary-key-v2
anchor candidate basis:
                      legacy-vowel-key-string-suffix-v1
morphology family:    de-attested-right-head-v4
construction:         de-adverbial-weise-v2
morphology storage:   positive-evidence-compact-v2
runtime:              materialized-writer-v5-v1
DB schema:            rhymelab-local-db-v5
```

Writer v7 remains rejected and rolled back. The accepted writer ranking/morphology policies remain frozen at v6/v4 for this acceptance.

## Scope and hard boundaries

Accepted scope:

- German single-word writer search;
- deterministic local retrieval and ranking;
- pronunciation-backed phonetic scoring;
- writer-specific lexical novelty/commonness utility;
- deterministic family/result diversity;
- right-edge secondary-stress retrieval;
- source-supported multi-analysis morphology;
- local SQLite runtime only.

Not included in this acceptance:

- phrase or mosaic rhyme;
- English;
- cross-language rhyme;
- hosted search/ranking;
- LLM, ML, or neural inference in the core runtime;
- completion of independent Writer Page human usefulness labels;
- promotion to the accepted/default v4 runtime path.

## Evidence summary

### 1. Accepted legacy/control-path invariance — PASS

Phase 9A verified the existing accepted control path before writer-runtime changes:

```text
queries                             27 / 27
missing queries                     0
runtime candidate mismatches        0
runtime policy mismatches           0
protected-order mismatches          0
```

The accepted `findRhymes()` / `ranking=legacy` behavior was not changed by the writer migration.

### 2. Multi-analysis lexical model — PASS

Experimental publish/DB migration:

```text
publish schema                      rhymelab-de-publish-v3
DB schema                           rhymelab-local-db-v5
DB forms                            838,209
DB pronunciations                   904,836
lexical analysis rows               967,931
forms with multiple analyses        101,315
```

All source-supported lexical analyses are preserved in `form_analysis`; compact runtime morphology stores only positive evidence while unresolved analyses remain represented by absence of positive evidence.

### 3. Compact writer materialization — PASS

The first correct writer materialization was rejected for storage efficiency at 1,904.67 MiB final DB size. The compact representation retained the same semantics and reduced the final owner DB to:

```text
DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
form_analysis                       269.48 MiB
hot                                 457.72 MiB
freelist pages                           0
anchor pronunciations             904,836
anchor rows                      3,153,639
positive morphology rows          325,724
```

The anchor lookup uses `PRIMARY KEY(anchor_key=?)`.

### 4. Old-LIKE vs indexed retrieval equivalence — PASS

Phase 9D compared the previous validation suffix-`LIKE` candidate retrieval with compact indexed anchors across every right-edge channel in the frozen Writer Page plan:

```text
queries                             12 / 12
missing queries                     0
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
sample anchor plan                  PRIMARY KEY(anchor_key=?)
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

The indexed candidate universe is therefore an exact ordered replacement for the validated right-edge suffix retrieval on the frozen gate.

`Arbeitsweise -> Hochzeitsreise` is retained only as a retrieval sentinel with `max_rank: 250`; it is not a Top-20 surfacing requirement.

### 5. Materialized Writer Page structural quality — PASS

Final owner Writer Page v5 run after the prefix-stable performance refinement:

```text
status                              structural_ok_reference_pending
runtime contract                    12 / 12
queries                             12 / 12
mean writer elapsed                 1103.9 ms
frozen validation mean              1528.8 ms
mean improvement                     27.8%
Top-10 exact duplicates                  0
Top-10 near duplicates                   0
Top-10 same-lemma rows                   0
Top-10 repeated family rows              0
Top-20 exact duplicates                  0
Top-20 near duplicates                   0
Top-20 same-lemma rows                   0
Top-20 repeated family rows              0
Top-20 unranked rows                     1
Top-20 usage rank >100k rows            25
Top-20 usage rank >250k rows              1
Top-20 explicit rare/historical           0
preferred pronunciation rows        240 / 240
legacy Tier-0 retention             685 / 685
```

The performance refinement stops greedy diversity selection after the requested page prefix. A dedicated prefix-stability test verifies that early stopping returns the same selected prefix as ranking the full candidate tail. No score, rhyme tier, writer policy, morphology policy, or diversity rule changed.

The main previous outlier improved as follows:

```text
Arbeitsweise before refinement      7105.7 ms
Arbeitsweise after refinement       3021.8 ms
improvement                            57.5%
merged candidate universe              1,580
```

The candidate universe was not reduced to obtain this speedup.

### 6. Protected writer regressions — PASS

Final protected page behavior includes:

```text
Arbeitsweise -> Hochzeitsreise      rank 116
role                                retrieval sentinel only
primary type                        multisyllabic_perfect
score                               1
cheap-tier penalty                  0
family                              right:reise

Arbeitsweise -> right:reise         Weiterreise rank 3
Liebe -> Diebe                      rank 1
Leben -> neben                      rank 2
Nacht -> macht                      rank 1
```

All five protected page regressions pass.

All 10 protected morphology regressions also pass:

- `Arbeitsweise -> right:weise`;
- productive `stufenweise`, `ausnahmsweise`, `abschnittsweise`, `auszugsweise` use `de-adverbial-weise-v2`;
- `Verweise` does not become `right:weise`;
- `Betriebe`, `Bestreben`, `Professoren`, and `deutscher` remain unresolved rather than receiving false splits.

### 7. Runtime repeatability — PASS

Owner repeatability report schema:

```text
rhymelab-writer-v5-repeatability-v1
status                              ok
independent DB opens                     3
queries per run                          12
suite fingerprints equal              true
query fingerprint mismatches              0
suite fingerprint
c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab
```

The fingerprint covers the complete semantic `findWriterRhymes()` response for each frozen query; report timestamps and timing measurements are excluded. All 12 per-query fingerprints and the aggregate suite fingerprint are identical across all three independent database opens.

This establishes deterministic runtime reproducibility for the accepted writer gate on the owner dataset.

## Human-reference status

Writer Page NDCG@10 and NDCG@20 remain:

```text
pending_reference
```

No complete independent usefulness labels currently cover the Writer Page cutoffs, so this report does not invent or substitute an NDCG value. Structural quality, protected regressions, lexical safety, legacy retention, equivalence, and repeatability are the available acceptance evidence.

The existing `de-human-rhyme-v1` NDCG/pairwise benchmark remains evidence for the accepted general rhyme relation/ranking baseline; it is not treated as a substitute for Writer Page usefulness labels.

## Acceptance outcome

The German **single-word writer-search engineering baseline is accepted** with the policies and v5 runtime contract listed above.

Consequences:

1. Writer v6 / morphology v4 / materialized v5 become the frozen reference for subsequent German writer work.
2. The accepted/default v4 runtime remains untouched until an explicit promotion decision is made.
3. Independent Writer Page NDCG remains an open evidence item and must stay labeled `pending_reference` until real labels exist.
4. Further writer tuning must not silently change this accepted baseline; material policy changes require a new benchmarked candidate.
5. German phrase/mosaic rhyme work may now begin as a separate phase without changing the accepted single-word control evidence.
6. English remains deferred until the German path is stable.

## Evidence artifacts

Owner-local generated evidence remains gitignored. Relevant report paths are:

```text
data/local/writer-v5-storage-report.json
data/local/writer-v5-equivalence-report.json
reports/de-writer-page-benchmark-v5-materialized.json
data/local/writer-v5-repeatability-report.json
```

Public repository documents record only the non-sensitive aggregate evidence required for project continuity.
