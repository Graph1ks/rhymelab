# RhymeLab — Thread Handover

Last updated: 2026-09-17

Repository state is authoritative. Do not reconstruct project state from prior chats.

## Start here

Read in order:

1. `AGENTS.md`
2. this file
3. `STATUS.md`
4. `PROJECT_STATE.json`
5. `ROADMAP.md`
6. `DATA_SOURCES.md`
7. `docs/BENCHMARK.md`
8. `docs/API.md`
9. `docs/WRITER_RANKING.md`

## Public-repository boundary

The public RhymeLab repository was published from a sanitized parentless root commit. Pre-public private commit identifiers, branches, pull requests, personal commit metadata, private paths/URLs and private-development history must remain outside the public repository.

Generated linguistic data, SQLite, benchmark queues/reviews/reference labels, reports and downloaded raw sources remain local/gitignored.

Before public-facing changes run:

```powershell
npm run check
npm test
node scripts/public-readiness-audit.mjs
```

`main` is protected; changes reach it through pull requests and required check `validate` must pass.

## Hard runtime boundary

RhymeLab is local-only. Core retrieval, scoring, writer ranking and diversification must remain deterministic and locally executable. Do not add LLM inference, ML/neural ranking, hosted search/ranking, telemetry, hidden uploads or runtime network dependencies.

## Formally accepted baseline

The last formally accepted German baseline remains RhymeLab `v0.10.0`:

- DB schema `rhymelab-local-db-v4`;
- 838,209 forms / 904,836 pronunciations;
- 838,209 preferred / 66,627 alternate pronunciations;
- 1,038 historical-only forms;
- 260,450 usage-ranked forms;
- analyzer `de-ipa-v2`;
- scorer `de-phon-v3`;
- relation policy `rhyme-relations-v2`;
- accepted ranking `modern_entity_relative_commonness_1decade_0_05`;
- accepted report `ok`, 5/5 QA gates.

The accepted/base path is preserved through `?ranking=legacy` on the feature branch.

## Current feature branch

Branch:

```text
feat/deterministic-writer-ranking-v1
```

Draft PR:

```text
#3
```

Current experimental policies:

```text
writer ranking:    deterministic_writer_utility_v5
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v2
```

Current implementation:

- `src/writer-ranking-policy.mjs` — deterministic phonetic tier, lexical cheapness, lexical safety and family diversity;
- `src/writer-search.mjs` — merges accepted/base results with right-edge retrieval, multi-anchor writer scoring and morphology evidence;
- `src/writer-morphology.mjs` — conservative inferred noun/adjective right-head family evidence;
- `scripts/diagnose-rhyme-pair.mjs` — known-pair retrieval/scoring diagnosis;
- `scripts/diagnose-writer-pages.mjs` — multi-query writer-page generalization audit;
- browser Recommended mode respects all `deterministic_writer_utility_*` versions;
- `?ranking=legacy` remains the comparison/control path.

The package version and accepted baseline are intentionally unchanged.

## Live finding 1 — retrieval boundary

Owner-local pair diagnosis for:

```text
Arbeitsweise ↔ Hochzeitsreise
```

established:

- legacy retrieval: **not retrieved**;
- direct legacy pair score: `slant`, overall `0.7574`;
- writer right-edge retrieval: found through secondary-anchor-context and secondary-anchor channels;
- best writer anchor: secondary syllable 3 ↔ 3, two-syllable tail, `multisyllabic_perfect`, score `1`.

This proved that the missing creative result was primarily a retrieval/anchor-boundary issue rather than only a ranking problem.

`Notfallbleibe` is absent from the current lexicon and is a lexical-coverage case.

## Live finding 2 — lexical-family page repetition

After suffix-string redundancy was removed, `Arbeitsweise` produced many genuine right-edge perfect rhymes but repeated lexical heads such as:

```text
-weise
-reise
-preise
-kreise
-speise
-gleise
```

Writer v4 introduced right-head family evidence and successfully rotated the top page across families. The owner-local v4 `Arbeitsweise` top included `Sonderpreise`, `Pilgerreise`, `Kirchenkreise`, `Vorspeise`, `Streckengleise`, etc. instead of being consumed by `*-weise` rows.

This solved the original page-repetition problem but exposed that the first morphology rule was too permissive beyond this query.

## Live finding 3 — 12-query generalization audit

Command:

```powershell
npm run diagnose:writer-pages
```

Default battery:

```text
Arbeitsweise
Liebe
Leben
Zeit
Nacht
Feuer
verloren
Gedanken
Freiheit
Musik
Spotify
hitzefrei
```

Owner-local v1 diagnostic:

```text
schema                         rhymelab-writer-page-diagnostic-v1
queries found                  12 / 12
mean elapsed                   1583.4 ms
repeated family rows           0
unranked top-30 rows           69
usage rank > 100k rows         60
explicit rare/historical rows  2
Arbeitsweise elapsed           8342.6 ms
Arbeitsweise merged candidates 1580
```

The report established two system-level defects.

### Morphology v1 false positives

Requiring only that both substring pieces existed in the lexicon allowed accidental analyses such as:

```text
Betriebe     -> bet|riebe
Bestreben    -> best|reben
Professoren  -> profes|soren
deutscher    -> deut|scher
```

Other verb-prefix and proper-name cases were also unreliable. These are writer-ranking hazards because a false family actively changes list order.

### Lexical-safety intrusion

Across 360 audited top-page rows, 69 had no usage rank and 60 had usage rank >100k. `Liebe` alone had 14 unranked rows in its top 30.

Missing usage is still **unknown/unranked, not rare**. However, the default writer page needs a conservative product signal so unknown or extremely low-measured-use forms do not consume the top exact-rhyme region solely because their sound match is perfect.

## Current v5 / morphology v2 response

### `de-attested-right-head-v2`

Morphology is now deliberately more conservative.

A writer family is accepted only when:

- complete-word lemma/POS evidence exists;
- right side is independently attested;
- noun→noun or adjective→adjective head POS agrees;
- complete lemma ends in the right-head lemma;
- left side or a conservative linking-material variant is independently attested;
- selected left evidence has measured usage.

Family keys use the right-head lemma (`right:preis`, `right:kreis`, `right:gleis`, etc.).

Verbs and proper names remain unresolved until explicit deterministic rules are implemented. This is intentional: unresolved is safer than a false family.

Regression tests now cover `Betriebe`, `Bestreben`, verb prefixes and proper names as unresolved cases while preserving intended examples such as `Arbeitsweise`, `Sonderpreise` and `deutschlandweite`.

### `deterministic_writer_utility_v5`

Writer v5 adds a separate lexical-safety tier without altering phonetic truth:

```text
measured usage <= 250000                     -> +0
unranked / unknown usage                     -> +1
measured usage > 250000                      -> +1
explicit rare/archaic/obsolete/dated tag     -> +2
```

The state for missing usage is explicitly `unranked_unknown`; do not describe it as linguistic rarity.

The threshold is provisional product-ranking policy and must be checked in the next owner-local page audit and the later page-quality benchmark.

## Performance state

The writer right-edge prototype still uses suffix `LIKE` retrieval against DB v4. This is validation-time code, not the intended final mobile/local implementation.

`Arbeitsweise` took ~8.3 seconds in the v1 diagnostic because two broad right-edge channels returned 1,353 unique right-edge candidates and 1,580 merged candidates.

Do **not** optimize the DB schema before the next v5/v2 quality rerun. Once the validated key set is stable, materialize/index it during the local build and remove broad runtime suffix scans/dynamic morphology probing.

## Current validation state

The v5/v2 source tests are green in public CI. PR #3 remains draft and the writer feature remains **not accepted**.

The diagnostic script now writes schema:

```text
rhymelab-writer-page-diagnostic-v2
```

and records:

- existing family/latency/unranked/>100k metrics;
- usage rank >250k;
- per-row lexical-safety state;
- per-row lexical-safety tier penalty;
- aggregate count of safety-tier-demoted rows.

## Immediate next work

1. Owner pulls current feature branch; **do not rebuild the DB**.
2. Run `npm run check` and `npm test`.
3. Run `npm run diagnose:writer-pages`.
4. Compare v2 diagnostic against the v1 evidence above:
   - morphology false splits should collapse substantially;
   - repeated family rows should remain controlled;
   - unranked/very-low-use top-page intrusion should drop;
   - useful common exact rhymes must not be unnecessarily displaced;
   - runtime latency is measured but not yet optimized.
5. Inspect remaining false splits and safety-gate mistakes from the v2 JSON.
6. Build formal page-quality benchmark v2 only after this deterministic generalization pass is credible.
7. Then materialize/index validated right-edge and morphology evidence for local/mobile performance.
8. Promote only through an explicit writer-search acceptance report.

Do not return to query-specific `Arbeitsweise` weight tweaking unless a regression is demonstrated. Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality and its lexical data model are stable.
