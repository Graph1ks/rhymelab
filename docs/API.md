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

The current main branch contains the validated v3 ranking source promotion for normal all-result ranked requests. Formal baseline/version advancement remains pending the owner-local post-promotion acceptance report. Scorer, relation policy, retrieval strategy and DB schema were not changed by this ranking promotion.

The `feat/deterministic-writer-ranking-v1` feature branch adds a separate deterministic writer-oriented ranking layer. It does not alter phonetic scores or relation labels. See `docs/WRITER_RANKING.md`.

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
- `pool=<n>` — bounded candidate limit per indexed retrieval bucket, maximum 800;
- `variants=all` — allow stored alternate pronunciation variants;
- `historical=all` — include historical-only candidate forms;
- `type=<category>` — one primary rhyme or sound relation, or `all`;
- `coverage=balanced` — legacy/base selection option when `type=all`;
- `coverage_floor=<n>` — requested per-category floor for balanced mode, bounded by result limit and implementation maximum;
- `ranking=legacy` — bypass feature-branch writer ranking and return the accepted/base ranking path.

On the writer-ranking feature branch, omitting `ranking=legacy` uses deterministic writer ranking. The local browser explicitly requests writer ranking.

### Primary rhyme vs. sound relation

Primary rhyme is exclusive. A result has at most one of these five `primaryType` values:

1. `multisyllabic_perfect`
2. `perfect`
3. `multisyllabic_slant`
4. `family`
5. `slant`

`weak` is an internal scorer outcome meaning there is no primary rhyme strong enough to expose as a primary class.

Assonance and consonance are **independent sound relations**, not fallback rhyme classes:

- `assonance`
- `consonance`

A word can therefore be `slant` and `assonance` at the same time. A word can also have no primary rhyme (`type=weak`, `primaryType=null`) but still qualify as an assonance or consonance relation.

Exact/perfect rhymes do not receive duplicate assonance/consonance labels merely because their complete rhyme tails match.

### v0.10 phonology semantics

`de-phon-v3` keeps exact perfect-rhyme detection stable. Near classes use structural gates in addition to the weighted phonetic score:

- multisyllabic slant/family require multisyllabic rhyme domains;
- Family outside that explicit multisyllabic path requires sufficient vowel similarity and an exact consonantal coda anchor;
- Slant requires a minimum vowel relationship so consonant similarity alone cannot create a primary rhyme;
- aligned post-stress German reduced nuclei receive conservative equivalence handling.

`rhyme-relations-v2` works inside the stressed rhyme domain and keeps Assonance/Consonance independent of primary rhyme classification.

Each matched relation is returned in `relations` with `type`, `strength` (`strong` or `partial`), relation-specific `score`, and components. `relationTypes` is the compact list of matched relation names.

## Result-selection behavior

The base/legacy engine retains the existing selection modes.

`type=<single primary class>` dedicates the base result budget to that primary class.

`type=assonance` or `type=consonance` dedicates the base result budget to that relation membership. Relation results rank by relation strength/score before deterministic tie-break inputs.

`type=all&coverage=balanced` is a base-engine coverage policy. Writer search deliberately requests a full base ranked candidate page before applying list-level writer utility/diversification, because pre-interleaving categories would distort the page before diversity can act.

## Ranking contract

The active ranking policy is returned as `rankingPolicy`.

### Deterministic writer ranking — feature branch default

Policy identifier:

```text
deterministic_writer_utility_v1
```

Pipeline:

```text
accepted retrieval / phonetic scoring / relation policy
  -> deterministic writer utility
  -> deterministic lexical diversity reranking
```

Writer utility derives explicit lexical/query evidence, commonness and lexical-status penalties while keeping phonetic evidence dominant. It does not modify `score`, `primaryType`, `relations`, or phonology metadata.

Each writer-ranked row adds:

- `writerRank`;
- `writer.policy`;
- `writer.utility`;
- `writer.soundUtility`;
- `writer.lexicalPenalty`;
- `writer.lexicalNovelty`;
- `writer.queryOverlap`;
- `writer.commonness`;
- `writer.diversifiedScore`;
- `writer.redundancyPenalty`;
- `writer.maxRedundancy`;
- `writer.evidence` with same-lemma/string/prefix/suffix diagnostics.

The diversity stage is greedy and deterministic. It tracks maximum lexical redundancy against selected results and therefore requires O(n²) candidate-pair checks for a result page.

See `docs/WRITER_RANKING.md` for the exact v1 semantics and limitations.

### Legacy/base normal all-result ranked mode

Request:

```text
?ranking=legacy
```

For `type=all` without `coverage=balanced`, the accepted/base source policy is:

```text
modern_entity_relative_commonness_1decade_0_05
```

Policy behavior:

- rhyme tier remains the first ordering boundary;
- syllable distance remains second;
- only queries from the curated modern layer with a measured query usage rank activate the promoted commonness policy;
- exact tier-0 rows and relation-only rows retain usage-first ordering;
- dictionary queries and missing-query-usage cases retain usage-first ordering;
- candidate comparisons involving missing usage retain usage-first ordering;
- a ranked candidate is inside the reorderable horizon only when:

```text
candidate_usage_rank <= query_usage_rank * 10
```

- candidates outside that one-decade query-relative horizon remain usage-first and cannot leapfrog an in-horizon candidate on phonetic score alone;
- within the horizon, explicit lexical tag `rare` is a negative signal, followed by the 0.05 phonetic score band, then measured usage rank, raw phonetic score and deterministic lexical tie-break.

This source promotion passed isolated and retrieval-aware pre-promotion validation. Formal runtime baseline acceptance still requires the post-promotion owner-local report to pass.

### Legacy balanced coverage mode

The base engine's `type=all&coverage=balanced` retains the previous coverage/usage-first selection behavior. Writer ranking does not use this interleaving before writer reranking.

### Type-specific modes

The base engine retains its type-specific ordering. On the writer feature branch, returned base candidates may then receive writer utility/diversity unless `ranking=legacy` is requested.

## Response fields

Rhyme responses include:

- `language`;
- `phonology` (`analyzer`, `scorer`, `relationPolicy`);
- `query`;
- `variantMode`;
- `historicalMode`;
- `requestedType`;
- `selection` metadata;
- `rankingPolicy` — canonical identifier for the active selection/ranking mode;
- `ranking` — human-readable ranking description;
- flat `results`;
- overlapping `groups` for all five primary rhyme classes plus both sound relations.

Writer-ranked responses additionally expose the `writerRank`/`writer` fields documented above.

## Browser behavior

On the writer-ranking feature branch, the browser explicitly requests `ranking=writer` and respects `writerRank` for the Recommended sort. It also skips the previous all-type interleaving when the response reports `deterministic_writer_utility_v1`, so the list-level diversification is not undone client-side.

Other sort choices (`Most common`, `Closest rhyme`, `A–Z`) remain explicit user overrides.

Hover/focus detail still shows primary rhyme and sound relations separately. Continuous rendering, historical vocabulary filtering, pronunciation modes and bilingual visible metadata remain unchanged.

Visible localization is presentation-only. Canonical lexical tags/source strings stay unchanged in storage/API data and are mapped to English/German labels in the browser.

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

The project owner is not expected to annotate the full benchmark; the preferred workflow is blind external reference handoff/import as documented in `docs/BENCHMARK.md`.

## Ranking acceptance report

Current accepted-policy owner-local command:

```powershell
npm run benchmark:ranking:runtime-candidate
```

After the v3 source promotion, this generates post-promotion schema:

```text
rhymelab-benchmark-ranking-runtime-candidate-v2
```

at:

```text
reports/de-rhyme-benchmark-ranking-runtime-candidate.json
```

That report validates the accepted/base `findRhymes` order, not the new writer layer. Writer ranking requires a separate page-quality acceptance path before promotion.

## Report/audit

`npm run report --silent` writes `reports/rhymelab-report.json` and includes the rhyme-type audit. The audit checks primary-rhyme coverage, independent Assonance/Consonance coverage, category starvation and explicit relation regressions.

## Runtime safety

The server binds to `127.0.0.1` by default. `RHYMELAB_HOST`, `RHYMELAB_PORT` and `RHYMELAB_DB` are explicit local-development overrides. There is no hosted/public API contract.
