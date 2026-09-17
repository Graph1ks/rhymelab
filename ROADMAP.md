# RhymeLab Roadmap

Last updated: 2026-09-17

## Phase 0 — German phonology + source pipeline — complete

German IPA/feature models, Leipzig usage ranking, Kaikki resolver, deterministic local shard pipeline and compact pronunciation-backed publish data are implemented.

## Phase 1 — Local runtime/product foundation — accepted through v0.10

Accepted baseline:

```text
package         v0.10.0
DB schema       rhymelab-local-db-v4
forms           838,209
pronunciations  904,836
preferred       838,209
alternate       66,627
historical      1,038
usage-ranked    260,450
SQLite          457.68 MiB
analyzer        de-ipa-v2
scorer          de-phon-v3
relation        rhyme-relations-v2
ranking         modern_entity_relative_commonness_1decade_0_05
```

## Phase 2 — German blind relation/reference benchmark — complete

Refreshed `de-human-rhyme-v1` is complete: 367/367 reviewed with ranking NDCG 0.9562 / pairwise 0.8350. This remains the relation/scorer baseline, not the writer-page benchmark.

## Phase 3 — Benchmark-informed German refinement — accepted first pass

Accepted improvements include `de-ipa-v2`, `de-phon-v3`, `rhyme-relations-v2`, curated-modern pronunciation overlay and provenance-aware pronunciation integrity policy.

## Phase 4 — Runtime ranking isolation — accepted control path

Accepted/base ranking is `modern_entity_relative_commonness_1decade_0_05`. `?ranking=legacy` remains the protected control path while writer search is experimental.

## Phase 5 — Pronunciation coverage + lexical quality — open background work

After writer-search acceptance: cluster remaining IPA failures, prioritize common-word failures, investigate poor preferred defaults, expand reviewed modern vocabulary/provenance, and add fallback/G2P only if attested coverage proves insufficient.

## Phase 6 — Deterministic writer-oriented search — structural validation passed, not promoted

Current policies:

```text
writer ranking:    deterministic_writer_utility_v6
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v4
construction:      de-adverbial-weise-v2
```

No LLM/ML/neural inference, hosted ranking or runtime network dependency is allowed in core retrieval/ranking. Writer v7 remains rejected and rolled back. Ad-hoc writer ranking/morphology tuning is frozen at v6/v4.

## Phase 7 — Multi-analysis lexical/morphology model — owner build complete

Experimental migration:

```text
publish  rhymelab-de-publish-v3
DB       rhymelab-local-db-v5
```

Real-data owner build is complete. Publish-v3 preserves all source-supported lexical analyses/provenance; DB-v5 stores normalized `form_analysis` rows. Real DB-v5 before writer materialization is 727.21 MiB with 967,931 lexical-analysis rows and the accepted 838,209 / 904,836 form/pronunciation population after the existing supplemental overlay.

Accepted v2/v4 outputs remain unchanged.

## Phase 8 — Writer Page Benchmark v2 — structural baseline passed / human reference pending

Frozen owner-local validation baseline:

```text
status                              structural_ok_reference_pending
queries                             12 / 12
mean writer elapsed                 1528.8 ms
Top-10 repeated family rows         0
Top-20 repeated family rows         0
Top-20 exact duplicates             0
Top-20 near duplicates              0
Top-20 same-lemma rows              0
Top-20 unranked rows                1
Top-20 usage rank >100k rows        25
Top-20 usage rank >250k rows        1
Top-20 explicit rare/historical     0
preferred pronunciation rows        240 / 240
legacy tier-0 retention             685 / 685
```

`Arbeitsweise -> Hochzeitsreise` is a retrieval sentinel with `max_rank: 250`, not a Top-20 surfacing guard. `Arbeitsweise -> right:reise` is the Top-20 family surfacing gate. `Liebe -> Diebe`, `Leben -> neben` and `Nacht -> macht` remain protected.

NDCG@10/20 remains `pending_reference` until complete independent human usefulness labels cover the relevant writer cutoffs.

## Phase 9 — Legacy invariance + materialized writer runtime — current execution phase

### 9A. Accepted legacy control-path invariance — complete

Owner-local runtime gate passed 27/27 queries with no missing queries, runtime candidate mismatches, runtime-policy mismatches or protected-order mismatches. Historical reference assets were unavailable, so reference metrics are intentionally absent.

### 9B. Multi-analysis publish/storage — complete

Publish-v3 / DB-v5 builder migration is complete and real-data counts are internally consistent. Accepted v2/v4 defaults remain unchanged.

### 9C. Compact right-edge + morphology materialization — complete

The first correct materialization was storage-rejected at 1,904.67 MiB. Compact storage now uses:

```text
anchor storage      compact-primary-key-v2
anchor candidate    legacy-vowel-key-string-suffix-v1
anchor PK           (anchor_key, pronunciation_id) WITHOUT ROWID
morphology storage  positive-evidence-compact-v2
morphology PK       (form_id, analysis_key) WITHOUT ROWID
```

Final owner result after exact legacy string-suffix rematerialization:

```text
DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
anchor pronunciations             904,836
anchor rows                      3,153,639
positive morphology rows          325,724
freelist pages                           0
```

The real lookup plan uses `PRIMARY KEY(anchor_key=?)`.

### 9D. Real-data retrieval/morphology equivalence — complete / PASS

Owner gate result:

```text
status                              ok
queries                             12 / 12
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
Hochzeitsreise retrieval sentinel   retained
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

This proves exact ordered candidate equality for every frozen right-edge channel. The speedup is retrieval-only.

### 9E. Materialized v5 writer runtime benchmark — current gate

Opt-in experimental runtime:

```text
runtime id          materialized-writer-v5-v1
anchor retrieval    writer_anchor
morphology          form_analysis + writer_morphology_evidence
```

The default v4 writer path remains unchanged. The experimental v5 opener refuses incomplete storage contracts. Multi-analysis runtime reconstruction explicitly preserves converged, unresolved and ambiguous-conflict states.

CI run #168 is green.

Run:

```text
npm run benchmark:writer-page:v5
```

Required checks before promotion:

1. all 12 queries actually report `materialized-writer-v5-v1`;
2. structural gate passes;
3. Top-10/20 duplicate/family/safety metrics do not regress beyond the frozen gates;
4. all page and morphology regressions pass;
5. legacy Tier-0 retention remains acceptable;
6. full end-to-end mean Writer Page latency is compared with 1528.8 ms;
7. NDCG remains pending unless complete independent human labels exist.

Do not modify accepted `findRhymes()` / `ranking=legacy` during this phase.

## Phase 10 — Writer-search acceptance + German single-word stabilization

Acceptance report must combine Writer Page structural evidence, independent human NDCG when available, legacy invariance, lexical/morphology provenance integrity, compact materialized runtime performance and deterministic reproducibility. Only then may writer search replace the accepted/base default.

## Phase 11 — Phrase / mosaic rhyme

Only after German single-word writer search is accepted.

## Phase 12 — English profile + benchmark

Separate language-specific sources, parser, scorer and benchmark required.

## Phase 13 — Cross-language rhyme

Only after German and English are individually strong.

## Hosted runtime

Not part of the current roadmap. Core search remains locally executable for desktop, web packaging and later mobile use.
