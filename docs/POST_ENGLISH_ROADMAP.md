# RhymeLab — Post-English Ranking, Entity and Performance Roadmap

Last updated: 2026-09-19

Status: **DOCUMENTED EXECUTION ORDER — English v4 DB storage/indexed retrieval accepted; runtime diagnostic is the active gate**

## 1. Why this document exists

The remaining work after the current English publish/coverage gate must preserve the product behavior that made the accepted German Writer useful to lyricists:

1. phonetic/rhyme quality must stay dominant;
2. results must not collapse into dozens of lexical/morphological near-duplicates;
3. commonness/prominence is an ordering signal, not a substitute for phonetic quality;
4. Entity pronunciation and ranking must reuse the accepted DE/EN phonology stacks rather than inventing a separate incompatible model;
5. performance optimization must happen after DE + EN + Entity query semantics are sufficiently frozen, so the hot path is optimized once against final result-quality contracts.

## 2. German single-word Writer: accepted quality + diversity architecture

The accepted German single-word Writer ranking policy is:

```text
deterministic_writer_utility_v6
```

This is the mechanism the English Writer should conceptually reproduce.

### 2.1 Quality / Writer utility

For each candidate, the current Writer utility combines:

```text
soundUtility
  = 0.72 * phonetic score
  + 0.16 * syllable utility
  + 0.12 * commonness utility

utility
  = soundUtility
  - 0.16 * lexical overlap
  - rare/historical penalty
```

The candidate also carries tier penalties for lexical cheapness/safety:

- same lemma;
- same morphology family;
- strong lexical/orthographic overlap;
- explicit rare/historical tags;
- unranked or very-low-usage forms.

This prevents commonness or spelling similarity from overriding rhyme truth.

### 2.2 Diversity / novelty

The second dimension is not another phonetic score. It is a page-selection diversification layer.

Current constant:

```text
DEFAULT_DIVERSITY_WEIGHT = 0.18
```

After each selected result, every remaining candidate receives a `maxRedundancy` against the already-selected page prefix.

Redundancy evidence includes:

- identical surface;
- same lemma;
- same Writer morphology family;
- strong shared initial construction;
- near-duplicate edit similarity.

Current greedy page score:

```text
diversifiedScore
  = writer.utility
  - 0.18 * maxRedundancy
```

Redundancy also raises an effective tier:

```text
maxRedundancy >= 0.58  -> diversity tier penalty +1
maxRedundancy >= 0.88  -> diversity tier penalty +2
```

This is the important product behavior: a candidate can be individually strong, but repeated variants of the same lexical/morphological family lose page priority after one representative has already been selected.

The system therefore separates:

```text
QUALITY / usefulness of this result
from
DIVERSITY / novelty relative to results already selected
```

Do not reduce this to one global score.

### 2.3 Phrase/Mosaic precedent

The accepted Phrase/Mosaic channel applies an even harder deterministic concentration control after ranking:

```text
exact canonical cap    1
normalized cap         1
phrase-id/family cap   1
lexical frame cap      3
```

That phase reduced, for example, a representative Top-20 lexical-frame concentration from 13 to 3 while preserving protected #1 results.

This is additional evidence that Writer-page usefulness requires explicit diversity/concentration control, not only phonetic scoring.

## 3. English ranking plan

Do not blindly copy German numeric weights.

Reuse the same **architecture**:

```text
English phonetic/rhyme quality
+ English syllable/stress fit
+ English commonness
- lexical cheapness/safety
= EN Writer utility

then

EN Writer utility
- calibrated redundancy/diversity penalty
= diversified EN page
```

English needs its own benchmark and calibration for:

- English rhyme relation thresholds;
- English scorer weights;
- English commonness behavior;
- English rare/historical safety;
- morphology-family redundancy;
- lexical near-duplicate thresholds;
- diversity weight;
- any query-relative commonness horizon / score-band policy used in the normal runtime.

The accepted German values are controls, not assumed English truth.

Acceptance must compare result quality and result-set diversity. Do not declare EN ranking complete merely because top-1 phonetic scores look plausible.

## 4. Entity work after initial English runtime acceptance

Entity Phase 12A remains frozen until the English single-word runtime is accepted far enough to reuse its phonology.

Resume from:

```text
docs/ENTITY_PHASE_12A_DEFERRED_CHECKPOINT.md
```

Accepted retained population remains:

```text
1,077,644 entities
Hybrid-v2 fingerprint
337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201
```

### 4.1 Entity pronunciation order

For each retained Entity name/alias, preserve provenance and attempt useful language profiles in this order:

1. reviewed/manual pronunciation;
2. qualified Wikidata P898 source IPA;
3. exact accepted DE Writer pronunciation / token composition where appropriate;
4. exact accepted EN Writer / CMUdict pronunciation;
5. bounded DE/EN token composition;
6. source-audited locale-specific G2P only after a dedicated proper-name benchmark;
7. unresolved.

Never:

- relabel CMUdict as German;
- relabel generic English evidence as en-US without policy support;
- feed English pronunciation through the German analyzer;
- mass-G2P all unresolved international names;
- hide generated pronunciation provenance.

Every generated pronunciation must carry source/model/rule/version/review-state metadata.

### 4.2 Entity prominence and ranking

Entity popularity is important, but it must act **inside phonetic quality constraints**.

Current Entity runtime conceptually orders by:

1. phonetic relation tier;
2. phonetic score;
3. syllable distance;
4. selected category percentile;
5. entity popularity score;
6. stable surface/QID tie-break.

Future Entity ranking should preserve this ordering principle and add a calibrated Writer-like near-tie policy rather than allowing fame to override poor rhyme quality.

Recommended architecture:

```text
phonetic tier
-> phonetic near-tie band / quality guard
-> category-relative prominence
-> preferred-name/source quality
-> diversity / duplicate suppression
-> stable tie-break
```

Prominence should strongly reorder entities that are phonetically near-equivalent. It should not move a materially worse rhyme above a materially better one.

Entity result diversity also needs explicit controls for:

- aliases of the same QID;
- multiple names of the same entity;
- same franchise/series clusters where they flood a page;
- artist/group/work concentration where useful;
- category diversity only when it does not violate phonetic quality.

## 5. Performance phase

Do not optimize the final SQLite/query architecture until:

- German behavior remains frozen;
- English inventory/phonology/ranking is accepted;
- Entity pronunciation/ranking/query contracts are accepted enough to know the real hot path.

Then open a dedicated performance phase with result-equivalence gates.

Target:

```text
warm local query p50     < 50 ms
warm local query p95     < 100 ms
warm local query p99     < 150-200 ms

cold-start latency       measured separately
```

Current multi-second queries are not acceptable final product behavior.

Optimization order:

1. instrument end-to-end query timing by stage;
2. record `EXPLAIN QUERY PLAN` for each hot query;
3. eliminate full scans;
4. eliminate N+1 metadata/category lookups;
5. use bounded indexed candidate retrieval;
6. batch metadata/category fetches;
7. materialize/precompute stable ranking features where justified;
8. add covering/composite indexes from measured query plans;
9. reduce JSON parsing on hot rows;
10. reuse prepared statements;
11. bound JS sorting/diversity candidate pools;
12. benchmark WAL/page/cache/mmap/pragmas only after query-shape fixes;
13. run VACUUM/ANALYZE for final benchmark snapshots where appropriate.

Known future hotspot: the current Entity runtime calls category lookup per candidate; this should be replaced by batched/materialized category evidence when the Entity query contract is frozen.

Performance changes must reproduce accepted Top-N ordering/result fingerprints. Do not buy latency by silently changing ranking quality or coverage.

## 6. Execution order from current checkpoint

```text
CURRENT
English v4 DB storage/indexed retrieval accepted
        |
        v
English read-only retrieval runtime diagnostic
        |
        v
English runtime repeatability / acceptance
        |
        v
English ranking benchmark
  - phonetic thresholds
  - commonness
  - QUALITY utility
  - DIVERSITY / redundancy
        |
        v
Product EN capability acceptance
        |
        v
Resume Entity
  - P898 owner gate
  - DE/EN source-backed pronunciation
  - exact CMUdict through EN analyzer
  - bounded token composition
  - proper-name G2P benchmark if still needed
  - Entity phonetic + prominence + diversity ranking
        |
        v
DE + EN + Entity integrated product acceptance
        |
        v
Dedicated DB/runtime performance phase
  3s+ -> target ~100 ms p95 warm
```

Do not begin final DB-layout optimization before the above ranking/query contracts are sufficiently stable.

## 7. Current v4 DB checkpoint

The accepted publish-v4 source fingerprint is:

```text
b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9
```

The owner v4 DB repeatability gate produced two identical materializations:

```text
semantic fingerprint             beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37
forms                             224,478
default eligible                  123,533
pronunciations                    375,321
analyzed pronunciations           339,987
unresolved pronunciations          35,334
default-profile pronunciations    173,413
database bytes                     190,701,568
database MiB                       181.87
fingerprints equal                 true
snapshots equal                    true
```

Materialization determinism is accepted. The subsequent persisted verifier pass also closed the multisyllabic gap: all five channels use their dedicated indexes, each passed 20 deterministic general and 20 explicit multi-result indexed-vs-full-scan samples with zero mismatches, and foreign-key violations are zero. DB storage/indexed retrieval is therefore closed.

The active gate is now the read-only runtime candidate layer in `docs/ENGLISH_RETRIEVAL_RUNTIME_V1.md`. Run `npm run en:runtime:diagnose`; do not enable product EN or begin final Writer ranking until runtime diagnostic and independent-open repeatability are accepted.
