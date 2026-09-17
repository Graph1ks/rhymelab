# Public-facing status

Last updated: 2026-09-17

RhymeLab's public repository is `Graph1ks/rhymelab`. `main` is protected and the required public CI check is `validate`.

## Formally accepted runtime baseline

The formally accepted/default German runtime remains RhymeLab `v0.10.0`:

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

The accepted/base path remains `?ranking=legacy`. The writer branch has not replaced this default runtime.

## German single-word writer engineering baseline — accepted

Feature branch `feat/deterministic-writer-ranking-v1` / draft PR #3 has now passed the engineering acceptance gate documented in `docs/WRITER_SEARCH_ACCEPTANCE.md`.

Accepted writer stack:

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

Writer v7 remains rejected/rolled back. Core search remains deterministic, local-only, and free of LLM/ML inference, hosted ranking, telemetry and runtime network dependencies.

Engineering acceptance does **not** mean default promotion. The formal v4 baseline above remains unchanged until an explicit separate promotion decision.

## Acceptance evidence

Legacy/control-path invariance:

```text
queries                             27 / 27
runtime candidate mismatches        0
runtime policy mismatches           0
protected-order mismatches          0
```

Final compact v5 storage:

```text
DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
form_analysis                       269.48 MiB
hot                                 457.72 MiB
freelist pages                           0
anchor rows                      3,153,639
positive morphology rows          325,724
```

Right-edge equivalence:

```text
queries                             12 / 12
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

Final full Writer Page owner run:

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

Protected result behavior remains stable:

```text
Arbeitsweise -> Hochzeitsreise      rank 116, retrieval sentinel only
Arbeitsweise -> right:reise         Weiterreise rank 3
Liebe -> Diebe                      rank 1
Leben -> neben                      rank 2
Nacht -> macht                      rank 1
```

All 10 morphology regressions pass, including productive `-weise` and the false-split guards for `Verweise`, `Betriebe`, `Bestreben`, `Professoren`, and `deutscher`.

## Runtime repeatability — PASS

Owner report `rhymelab-writer-v5-repeatability-v1`:

```text
status                              ok
independent DB opens                     3
queries per run                          12
suite fingerprints equal              true
mismatches                                0
suite fingerprint
c0bcd4cdebcb43c83cdb8e74f18115f94ce91b8b99a5ca2c60563cf3e5941dab
```

The fingerprint covers the complete semantic `findWriterRhymes()` response; timing and report timestamps are excluded. All per-query and suite fingerprints match across all three runs.

## Human-reference status

Writer Page NDCG@10/20 remains `pending_reference`. Complete independent Writer Page usefulness labels do not yet exist, so no NDCG value is claimed or substituted.

This does not invalidate the engineering acceptance evidence above, but the missing human-reference layer remains an explicit open evidence item.

## Next phase

The German single-word writer engineering baseline is now frozen and accepted. The next separate phase may begin work on German phrase/mosaic rhyme after owner review of the acceptance report.

PR #3 remains draft until that review. Default runtime promotion remains a separate explicit decision. English remains after the German path is stable.
