# German Single-Word Writer Search — Engineering Acceptance

Last updated: 2026-09-17

## Decision

**Engineering acceptance: PASS.**

The deterministic German single-word Writer architecture is the accepted Writer baseline on DB schema `rhymelab-local-db-v5` with runtime `materialized-writer-v5-v1`.

After owner review and the completed engineering gates, this accepted Writer baseline is promoted as the normal local/UI/API runtime in RhymeLab **v0.11.0**.

The previous v0.10.0 / DB-v4 engine is preserved only as the explicit regression/control path through `?ranking=legacy` when its local database is available.

## Human-reference policy

Independent Writer Page human usefulness NDCG is deliberately deferred until the German Writer system is mature enough to evaluate as one coherent product surface, including Phase 11 phrase/mosaic/phraseology.

The project owner alone is not treated as independent human gold. Writer NDCG@10/20 therefore remains `pending_reference` until independent reviewers or another defensible human-reference process exist.

This is an evidence-timing decision, not a failed engineering gate.

## Promoted Writer stack

```text
package                 v0.11.0
writer ranking          deterministic_writer_utility_v6
right-edge anchor       de-right-edge-anchors-v1
anchor storage          compact-primary-key-v2
candidate basis         legacy-vowel-key-string-suffix-v1
morphology family       de-attested-right-head-v4
construction            de-adverbial-weise-v2
morphology storage      positive-evidence-compact-v2
runtime                 materialized-writer-v5-v1
DB schema               rhymelab-local-db-v5
```

Writer v7 remains rejected and rolled back. Material changes to the frozen single-word policies require a new benchmarked candidate.

## Scope

Accepted/promoted scope:

- German single-word Writer search;
- deterministic local retrieval and ranking;
- pronunciation-backed phonetic scoring;
- deterministic Writer lexical/commonness utility;
- deterministic family/result diversity;
- indexed right-edge secondary-stress retrieval;
- source-supported multi-analysis morphology;
- local SQLite runtime only.

Not included:

- phrase/mosaic rhyme;
- phraseology / idioms / metaphors / formulaic expressions;
- English or cross-language rhyme;
- hosted search/ranking;
- LLM/ML/neural inference in core runtime;
- completed independent Writer Page human usefulness labels.

## Engineering evidence

### Legacy/control invariance — PASS

```text
queries                             27 / 27
missing queries                     0
runtime candidate mismatches        0
runtime policy mismatches           0
protected-order mismatches          0
```

### Multi-analysis lexical model — PASS

```text
publish schema                      rhymelab-de-publish-v3
DB schema                           rhymelab-local-db-v5
DB forms                            838,209
DB pronunciations                   904,836
lexical analysis rows               967,931
forms with multiple analyses        101,315
```

### Compact Writer materialization — PASS

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

### Old-LIKE vs indexed retrieval equivalence — PASS

```text
queries                             12 / 12
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

The indexed candidate universe exactly reproduces the validated right-edge suffix retrieval on the frozen gate.

`Arbeitsweise -> Hochzeitsreise` is a retrieval sentinel only (`max_rank: 250`), not a Top-20 requirement.

### Final Writer Page structural/runtime gate — PASS

```text
status                              structural_ok_reference_pending
runtime contract                    12 / 12
queries                             12 / 12
mean writer elapsed                 1103.9 ms
frozen validation mean              1528.8 ms
mean improvement                     27.8%
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

Prefix-stable early stopping reduced the main outlier without changing the candidate universe or ranking semantics:

```text
Arbeitsweise before                 7105.7 ms
Arbeitsweise after                  3021.8 ms
improvement                            57.5%
merged candidate universe              1,580
```

### Protected regressions — PASS

```text
Arbeitsweise -> Hochzeitsreise      rank 116, retrieval sentinel only
Arbeitsweise -> right:reise         Weiterreise rank 3
Liebe -> Diebe                      rank 1
Leben -> neben                      rank 2
Nacht -> macht                      rank 1
```

All 10 protected morphology regressions pass, including productive `-weise` and false-split guards for `Verweise`, `Betriebe`, `Bestreben`, `Professoren`, and `deutscher`.

### Runtime repeatability — PASS

```text
schema                              rhymelab-writer-v5-repeatability-v1
status                              ok
independent DB opens                     3
queries per run                          12
suite fingerprints equal              true
query fingerprint mismatches              0
suite fingerprint
c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab
```

## Promotion outcome

RhymeLab v0.11.0 uses Writer v5 as the normal runtime:

- `npm run dev` opens `data/local/rhymelab-v5.sqlite` for normal UI/search/rhyme requests;
- the v5 storage contract is validated on open;
- `data/local/rhymelab.sqlite` / DB-v4 is optional and used only for explicit `?ranking=legacy` control requests;
- absence of the legacy DB does not block normal v0.11 startup;
- the control path remains available for regression evidence when its DB exists.

## Next phase

Phase 11 German phrase/mosaic/phraseology proceeds separately. It starts with public-data source/licensing research before phrase database/runtime implementation.

Human Writer NDCG remains `pending_reference` until the broader German Writer surface is mature and independent human review is available.

## Evidence artifacts

Owner-local generated evidence remains gitignored:

```text
data/local/writer-v5-storage-report.json
data/local/writer-v5-equivalence-report.json
reports/de-writer-page-benchmark-v5-materialized.json
data/local/writer-v5-repeatability-report.json
```
