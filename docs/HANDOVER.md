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

The accepted/base path remains available through `?ranking=legacy`.

## Current feature branch

```text
branch:            feat/deterministic-writer-ranking-v1
draft PR:          #3
writer ranking:    deterministic_writer_utility_v5
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v3
```

Current implementation:

- `src/writer-ranking-policy.mjs` — deterministic writer tiers, lexical safety and list diversity;
- `src/writer-search.mjs` — accepted/base retrieval plus deterministic right-edge retrieval and multi-anchor writer scoring;
- `src/writer-morphology.mjs` — conservative inferred right-head families plus explicit documented German construction rules;
- `scripts/diagnose-rhyme-pair.mjs` — pair retrieval/scoring diagnosis;
- `scripts/diagnose-writer-pages.mjs` — 12-query writer-page generalization audit;
- browser Recommended mode preserves `deterministic_writer_utility_*` ordering;
- `?ranking=legacy` remains the comparison/control path.

The package version and accepted baseline are unchanged.

## Live finding 1 — retrieval boundary

For:

```text
Arbeitsweise ↔ Hochzeitsreise
```

owner-local diagnosis established:

- legacy retrieval: not retrieved;
- direct legacy pair score: `slant`, overall `0.7574`;
- writer right-edge retrieval: retrieved through secondary-anchor-context and secondary-anchor channels;
- best writer anchor: secondary syllable 3 ↔ 3, two-syllable tail, `multisyllabic_perfect`, score `1`.

This established that writer quality required a retrieval-boundary fix, not only reranking.

`Notfallbleibe` is absent from the current lexicon and is a lexical-coverage case.

## Live finding 2 — lexical-family repetition

Writer v4 introduced explicit lexical-family evidence after `Arbeitsweise` pages were dominated by repeated terminal constructions such as `-weise`, `-reise`, `-preise`, `-kreise`, `-speise` and `-gleise`.

The family layer successfully rotated distinct heads, but the first morphology policy was too permissive outside the original query.

## Live finding 3 — v4 12-query generalization audit

Command:

```powershell
npm run diagnose:writer-pages
```

Default query battery:

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

v4 / morphology-v1 evidence:

```text
schema                         rhymelab-writer-page-diagnostic-v1
queries found                  12 / 12
mean elapsed                   1583.4 ms
repeated family rows           0
unranked top-30 rows           69
usage rank > 100k rows         60
explicit rare/historical rows  2
Arbeitsweise elapsed           8342.6 ms
Arbeitsweise right-edge        1353
Arbeitsweise merged            1580
```

False morphology examples included:

```text
Betriebe     -> bet|riebe
Bestreben    -> best|reben
Professoren  -> profes|soren
deutscher    -> deut|scher
```

These were ranking hazards because false family evidence changes page order.

## Writer v5 / morphology v2 response

Writer v5 added an explicit lexical-safety tier:

```text
measured usage <= 250000                     -> +0
unranked / unknown usage                     -> +1
measured usage > 250000                      -> +1
explicit rare/archaic/obsolete/dated tag     -> +2
```

Missing usage remains `unranked_unknown`, not linguistic rarity.

Morphology v2 accepted only conservative noun/adjective right-head analyses where whole lemma/POS, independently attested right side, measured left evidence and lemma suffix evidence agreed. Verbs and proper names stayed unresolved.

## Live finding 4 — v5 / morphology-v2 audit

Owner-local diagnostic v2:

```text
schema                              rhymelab-writer-page-diagnostic-v2
queries found                       12 / 12
mean elapsed                        1428.3 ms
repeated family rows                0
unranked top-30 rows                2
usage rank > 100k rows              51
usage rank > 250k rows              2
explicit rare/historical rows       0
writer-safety-tier penalized rows   4
Arbeitsweise elapsed                7241.1 ms
Arbeitsweise right-edge             1353
Arbeitsweise merged                 1580
```

Compared with v4, unranked top-page intrusion fell from 69 to 2 and the known false splits disappeared. The lexical-safety change therefore remains.

However, morphology v2 became too conservative for a real German productive construction. `Arbeitsweise` again returned many top `*-weise` rows such as `schätzungsweise`, `stellenweise`, `paarweise`, `beispielsweise`, `stufenweise`, etc., but those rows were unresolved. Therefore `repeatedFamilyRows=0` was formally true while the page was semantically repetitive.

## Morphology v3

Current policy:

```text
de-attested-right-head-v3
```

v3 retains all v2 false-split protections and adds one narrow explicit construction rule:

```text
de-adverbial-weise-v1
```

Rule boundary:

- whole form must be tagged `adv`;
- independently attested terminal lexeme must have lemma `Weise` and POS `noun`;
- whole lemma must end in `weise`;
- left side or conservative linking-material variant must be independently attested with measured usage;
- family remains `right:weise` so noun compound `Arbeitsweise` and productive adverbial `schätzungsweise` are writer-family equivalents;
- this is an explicit German construction rule, not generic suffix-string similarity.

Regression tests cover the positive `schätzungsweise` case and preserve `Verweise`, `Betriebe`, `Bestreben`, verbs and proper names as unresolved where appropriate.

Public CI is green for the v3 implementation.

## Performance state

Right-edge validation still uses suffix `LIKE` retrieval against DB v4. `Arbeitsweise` remains several seconds because two broad right-edge channels produce 1,353 right-edge candidates and 1,580 merged candidates.

Do not redesign/materialize the DB until the v3 quality rerun confirms the final key/family behavior. After that, validated right-edge/morphology keys should be materialized/indexed during the local build so runtime no longer performs broad suffix scans/dynamic morphology probing.

## Immediate next work

1. Owner pulls current feature branch; do **not** rebuild the DB.
2. Run `npm run check` and `npm test`.
3. Run `npm run diagnose:writer-pages`.
4. Inspect `Arbeitsweise` specifically:
   - productive adverbial `*-weise` rows should resolve to `right:weise`;
   - they should receive same-query-family/list-diversity penalties;
   - `Sonderpreise`, `Pilgerreise`, `Kirchenkreise`, `Vorspeise`, `Streckengleise`, etc. should rotate back upward;
   - `Betriebe`, `Bestreben`, `Professoren`, `deutscher` must not regain false families.
5. Confirm lexical-safety gains remain near the v5/v2 audit.
6. If v3 passes, stop morphology tuning and build formal page-quality benchmark v2.
7. Verify accepted `ranking=legacy` exact-rhyme/relation invariance.
8. Materialize/index validated writer-search keys for local/mobile performance.
9. Promote only through an explicit writer-search acceptance report.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality and its lexical data model are stable.
