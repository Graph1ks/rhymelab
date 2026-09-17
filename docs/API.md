# Local API

RhymeLab exposes a localhost-only HTTP API from `src/server.mjs` at `http://127.0.0.1:3030`.

Current local database schema: **`rhymelab-local-db-v4`**.

## Runtime baseline and current source state

The last formally accepted full-data/runtime baseline is RhymeLab `v0.10.0` with:

- language: `de`;
- IPA analyzer: `de-ipa-v2`;
- primary-rhyme scorer: `de-phon-v3`;
- sound-relation policy: `rhyme-relations-v2`;
- DB schema: `rhymelab-local-db-v4`.

The accepted/base ranking remains `modern_entity_relative_commonness_1decade_0_05` and is available through `?ranking=legacy` on the current writer-search feature branch.

Feature branch `feat/deterministic-writer-ranking-v1` adds a separate experimental deterministic writer-search path. It may add right-edge retrieval candidates and experimental writer-anchor scoring, but it does not rewrite the accepted legacy endpoint/scorer/relation path. See `docs/WRITER_RANKING.md`.

The runtime resolves phonology through a language profile. The current profile registry contains German only. English parsing/scoring/data are not implemented and must use a separate language profile rather than German constants.

## `GET /api/health`

Returns local server/database status.

## `GET /api/stats`

Returns build/runtime metadata including schema/language/build timestamp, publish timestamp, pronunciation policy, lexical-history policy, total/base/supplemental forms, historical-form count, usage-ranked forms, pronunciation rows and preferred count.

## `GET /api/search?q=<prefix>&limit=<n>&historical=<mode>`

Prefix/exact surface-form lookup. Historical-only forms are excluded by default; `historical=all` includes them. Missing usage is unranked/unknown.

## `GET /api/word/<word>`

Returns the normalized word entry plus all stored pronunciation variants. Direct lookup does not hide a historical form; it exposes `historical` and `lexicalTags` so UI/debug views can explain the classification.

## `GET /api/rhymes/<word>`

Supported query parameters:

- `limit=<n>` — result limit, maximum 250;
- `pool=<n>` — bounded candidate limit per retrieval channel, maximum 800;
- `variants=all` — allow stored alternate pronunciation variants;
- `historical=all` — include historical-only candidate forms;
- `type=<category>` — one primary rhyme or sound relation, or `all`;
- `coverage=balanced` — legacy/base selection option when `type=all`;
- `coverage_floor=<n>` — requested per-category floor for balanced mode, bounded by result limit and implementation maximum;
- `ranking=legacy` — bypass the feature writer path and return the accepted/base ranking path.

On the writer-search feature branch, omitting `ranking=legacy` uses deterministic writer search. The local browser explicitly requests writer ranking.

### Primary rhyme vs. sound relation

Primary rhyme is exclusive. A result has at most one of these five `primaryType` values:

1. `multisyllabic_perfect`
2. `perfect`
3. `multisyllabic_slant`
4. `family`
5. `slant`

`weak` is an internal scorer outcome meaning there is no primary rhyme strong enough to expose as a primary class.

Assonance and consonance are independent sound relations:

- `assonance`
- `consonance`

A word can therefore be `slant` and `assonance` at the same time. It can also have no primary rhyme while still qualifying for an independent sound relation.

### Accepted v0.10 phonology semantics

`de-phon-v3` keeps exact perfect-rhyme detection stable. Near classes use structural gates in addition to weighted phonetic score. `rhyme-relations-v2` keeps Assonance/Consonance independent of the primary rhyme class.

The accepted/base endpoint behavior is preserved under `ranking=legacy`.

## Result-selection behavior

The base/legacy engine retains existing type-specific and balanced-coverage behavior.

Writer search requests a full base page before applying writer-specific retrieval, scoring, safety and diversification. Pre-interleaving categories would otherwise distort the writer page before list-level decisions are made.

## Ranking contract

The active ranking policy is returned as `rankingPolicy`.

### Deterministic writer search — feature branch default

Current policy identifiers:

```text
rankingPolicy:               deterministic_writer_utility_v6
phonology.writerAnchorPolicy de-right-edge-anchors-v1
writerMorphology.policy      de-attested-right-head-v4
```

Pipeline:

```text
accepted/base retrieval + accepted legacy scoring
  + deterministic right-edge retrieval
  -> deterministic multi-anchor writer scoring
  -> conservative right-head morphology-family evidence
  -> explicit documented German construction rules
  -> deterministic lexical-safety tier
  -> deterministic structural lexical cheapness
  -> deterministic writer utility
  -> deterministic family/list diversity
```

The feature path does not mutate accepted legacy results in place. `ranking=legacy` remains the control path.

### Writer right-edge fields

Writer responses expose:

- `phonology.writerAnchorPolicy`;
- `writerRetrieval.policy`;
- `writerRetrieval.rightEdgeKeys`;
- `writerRetrieval.baseCandidates`;
- `writerRetrieval.rightEdgeCandidates`;
- `writerRetrieval.mergedCandidates`.

Candidate rows may expose:

- `writerAnchor`;
- `writerAnchorCandidates`;
- `legacyScore` / `legacyPrimaryType` / `legacyRhymeTier` when the candidate was rescored for the writer path.

The right-edge prototype currently uses validation-time suffix lookup against DB v4. It is not the final mobile/local performance design.

### Writer morphology fields

`writerMorphology` uses policy:

```text
de-attested-right-head-v4
```

Ordinary inferred family evidence remains deliberately conservative: noun/adjective right-head analyses require compatible POS, whole-lemma suffix evidence, independently attested left/right evidence, and measured usage on the selected left side. Verbs and proper names remain unresolved until explicit deterministic rules exist.

v4 additionally supports the narrow productive German construction:

```text
de-adverbial-weise-v2
```

A form selected as `adv` or `adj` whose whole lemma ends in `weise`, whose independently attested terminal lexeme is noun `Weise`, and whose left side has measured lexical evidence receives family `right:weise`. The `adj`/`adv` allowance reflects source-attested lexical ambiguity and the current DB-v4 limitation that only one selected lexical analysis is stored per surface form. This is explicit construction evidence, not generic suffix-string matching.

Query and candidate morphology payloads can include:

- `policy`;
- `status` (`attested_right_head_candidate` or `unresolved`);
- `inferred`;
- `familyKey` based on right-head lemma;
- `source`;
- `wholeLemma`;
- `wholePartOfSpeech`;
- `constructionRule` when an explicit construction rule is used;
- `split`;
- `leftEvidence`;
- `rightHead`;
- `checks`, including `explicitConstructionRule` when applicable.

This is inferred writer-search evidence, not source-attested full morphology. A future materialized writer lexical layer should preserve multiple lemma/POS analyses with provenance instead of forcing one analysis per surface form.

### Writer structural cheapness fields

Writer v6 distinguishes lexical cheapness from ordinary rhyme spelling. High edit similarity alone is not sufficient to demote short words such as `Liebe/Diebe`, `Leben/neben` or `Nacht/macht`.

Cheapness evidence can instead come from:

- same lemma;
- same resolved morphology family;
- a long shared initial construction;
- a long very-high-similarity near duplicate;
- a very long shared suffix as weaker evidence.

`writer.evidence` therefore includes diagnostic fields such as `surfaceSimilarity`, `sharedPrefixLength`, `sharedSuffixLength`, `initialConstructionOverlap`, `longNearDuplicateOverlap`, `sameLemma` and `sameMorphologyFamily`. Phonetic rhyme spelling remains distinct from these lexical signals.

### Writer lexical-safety fields

Writer v5 introduced, and writer v6 retains, a default-page safety tier while preserving the underlying phonetic class/score.

Current provisional policy:

```text
measured usage <= 250000                     -> tier penalty 0
unranked / unknown usage                     -> tier penalty 1
measured usage > 250000                      -> tier penalty 1
explicit rare/archaic/obsolete/dated tag     -> tier penalty 2
```

Missing usage remains unknown/unranked; it is not classified as rare.

Each row exposes:

- `writer.lexicalSafetyTierPenalty`;
- `writer.lexicalSafety.state`;
- `writer.lexicalSafety.unranked`;
- `writer.lexicalSafety.veryLowMeasuredUsage`;
- `writer.lexicalSafety.explicitRareOrHistorical`;
- `writer.lexicalSafety.threshold`.

The threshold is provisional and requires page-quality acceptance evidence before promotion.

### Other writer explanation fields

Each writer-ranked row also exposes:

- `writerRank`;
- `writer.policy`;
- `writer.utility`;
- `writer.soundUtility`;
- `writer.lexicalPenalty`;
- `writer.lexicalNovelty`;
- `writer.queryOverlap`;
- `writer.commonness`;
- `writer.baseTier`;
- `writer.cheapRhymeTierPenalty`;
- `writer.writerTier`;
- `writer.effectiveTier`;
- `writer.diversityTierPenalty`;
- `writer.diversifiedScore`;
- `writer.redundancyPenalty`;
- `writer.maxRedundancy`;
- `writer.evidence`.

Phonetic `score`, `primaryType` and accepted relation semantics remain distinct from these writer fields.

### Legacy/base normal all-result ranked mode

Request:

```text
?ranking=legacy
```

For normal accepted/base `type=all` ranking, the policy remains:

```text
modern_entity_relative_commonness_1decade_0_05
```

The existing query-relative commonness horizon, protected exact/relation behavior and conservative missing-usage handling remain as documented by the accepted runtime-ranking work and benchmark reports.

### Legacy balanced coverage and type-specific modes

The base engine's `type=all&coverage=balanced` and type-specific ordering retain their pre-existing accepted/base behavior. Writer-specific behavior is bypassed with `ranking=legacy`.

## Response fields

Base rhyme responses include:

- `language`;
- `phonology`;
- `query`;
- `variantMode`;
- `historicalMode`;
- `requestedType`;
- `selection`;
- `rankingPolicy`;
- `ranking`;
- flat `results`;
- overlapping `groups`.

Writer responses additionally expose the writer retrieval, morphology, safety and explanation fields described above.

## Browser behavior

On the feature branch, the browser explicitly requests `ranking=writer` and respects `writerRank` for Recommended sort. It skips legacy all-type interleaving for any `deterministic_writer_utility_*` response so client rendering does not undo server-side writer ordering.

Other sort choices (`Most common`, `Closest rhyme`, `A–Z`) remain explicit user overrides.

Hover/focus detail still shows primary rhyme and sound relations separately. Continuous rendering, historical vocabulary filtering, pronunciation modes and bilingual visible metadata remain unchanged.

Visible localization is presentation-only. Canonical lexical tags/source strings remain unchanged in storage/API data.

## Writer page diagnostic

Local command:

```powershell
npm run diagnose:writer-pages
```

Current report schema:

```text
rhymelab-writer-page-diagnostic-v2
```

Default report path:

```text
reports/writer-page-diagnostic.json
```

It records per-query runtime, retrieval size, morphology resolution/family repetition, unranked rows, usage-rank thresholds, explicit rare/historical rows, writer safety-tier counts, compact result rows and split-review evidence.

This is an engineering diagnostic, not a formal benchmark.

## Benchmark review API

The optional local German benchmark UI is served at:

```text
GET /benchmark
```

The queue must first be generated with `npm run benchmark:prepare` or through `npm run benchmark:run`. Generated queue/review files stay under `data/local/benchmark/` and are gitignored.

### `GET /api/benchmark/state`

Returns the local benchmark queue, existing reviews, non-evaluative progress summary and the next unreviewed task.

### `POST /api/benchmark/review`

Stores or replaces one local manual review. Browser-origin writes are accepted only from loopback localhost on the active RhymeLab port.

## Accepted-ranking acceptance report

Current accepted-policy owner-local command:

```powershell
npm run benchmark:ranking:runtime-candidate
```

That report validates the accepted/base `findRhymes` path, not the experimental writer path. Writer search requires a separate page-quality acceptance path before promotion.

## Report/audit

`npm run report --silent` writes `reports/rhymelab-report.json` and includes the rhyme-type audit. The audit checks primary-rhyme coverage, independent Assonance/Consonance coverage, category starvation and explicit relation regressions.

## Runtime safety

The server binds to `127.0.0.1` by default. `RHYMELAB_HOST`, `RHYMELAB_PORT` and `RHYMELAB_DB` are explicit local-development overrides. There is no hosted/public API contract.
