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
writer ranking:    deterministic_writer_utility_v6
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v4
construction:      de-adverbial-weise-v2
```

Current implementation:

- `src/writer-ranking-policy.mjs` — deterministic writer tiers, lexical safety, structural cheapness and list diversity;
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

Owner-local v5/v2 evidence:

```text
mean elapsed                        1428.3 ms
repeated family rows                0
unranked top-30 rows                2
usage rank > 100k rows              51
usage rank > 250k rows              2
explicit rare/historical rows       0
writer-safety-tier penalized rows   4
Arbeitsweise elapsed                7241.1 ms
```

The safety change was a strong improvement and remains part of the feature.

## Live finding 4 — morphology v3 failed on real lexical ambiguity

Morphology v3 added `de-adverbial-weise-v1`, initially requiring whole POS `adv`.

The owner-local v3 rerun produced:

```text
schema                              rhymelab-writer-page-diagnostic-v2
queries found                       12 / 12
mean elapsed                        1681.5 ms
repeated family rows                0
unranked top-30 rows                2
usage rank > 100k rows              50
usage rank > 250k rows              2
explicit rare/historical rows       0
writer-safety-tier penalized rows   4
Arbeitsweise elapsed                8416.4 ms
Arbeitsweise right-edge             1353
Arbeitsweise merged                 1580
```

Safety remained good, but the intended `-weise` fix did **not** work on the real DB. `Arbeitsweise` still surfaced unresolved rows including:

```text
stufenweise
ausnahmsweise
abschnittsweise
auszugsweise
```

The cause is a data-model limitation, not an orthographic exception. Current publish data store only one selected lemma/POS analysis per surface form. Source entries can legitimately contain multiple analyses; `stufenweise`, for example, has both adjective and adverb analyses. Equal-confidence analysis selection can therefore retain `adj` even though the adverb analysis also exists. An `adv`-only construction gate was unstable.

The same audit exposes this broader lexical-analysis limitation elsewhere: query metadata can retain a semantically incidental homograph analysis (`Liebe` and `Zeit` appear as `name` in the current DB). Do not treat the single stored POS as exhaustive lexical truth.

## Live finding 5 — short perfect rhymes were falsely marked cheap

Writer v5 used normalized edit similarity as direct lexical-overlap evidence. That is unsafe for short rhyming words because most of their spelling naturally belongs to the rhyme tail.

Observed page failures included:

```text
Liebe -> Diebe   exact/multisyllabic perfect but cheap-tier demoted behind slants
Leben -> neben   perfect but cheap-tier demoted
Nacht -> macht   perfect but cheap-tier demoted
Feuer -> neuer   same pattern
```

This is not useful writer diversity. Those are lexically independent rhyme words, not query variants.

## Current response — writer v6 / morphology v4

### Morphology v4

Current policy:

```text
de-attested-right-head-v4
```

Explicit construction:

```text
de-adverbial-weise-v2
```

The `-weise` rule now accepts the source-attested `adv`/`adj` ambiguity while remaining narrow:

- whole selected POS must be `adv` or `adj`;
- independently attested terminal lexeme must have lemma `Weise` and POS `noun`;
- whole lemma must end in `weise`;
- left side or conservative linking-material variant must be independently attested with measured usage;
- family remains `right:weise`;
- noun `Verweise` is still outside the rule;
- v2 false-split protections remain in force.

A regression test now models `stufenweise` with selected POS `adj`, matching the real source ambiguity.

### Writer v6

Current policy:

```text
deterministic_writer_utility_v6
```

Generic edit similarity no longer creates cheapness by itself for short rhyme-shaped words. Query cheapness now relies on independent lexical structure:

- same lemma;
- same morphology family;
- long shared initial construction;
- genuinely long high-similarity near-duplicate form;
- very long shared suffix only as weak evidence.

Regression tests protect `Liebe/Diebe`, `Leben/neben` and `Nacht/macht` from cheap-tier demotion while preserving `Arbeitsweise/Arbeitszweige`, same-lemma and same-family suppression.

Public CI is green for writer v6 / morphology v4.

## Lexical data model requirement before final materialization

Current DB v4 stores one selected lemma/POS analysis per surface form. That is sufficient for the accepted legacy runtime but is not an adequate final morphology substrate for advanced writer ranking.

When writer evidence is materialized, preserve multiple lexical analyses with provenance rather than forcing one semantic POS/lemma. The target remains deterministic and local; this is a schema/data-model change, not ML.

Do not rebuild DB v4 only to patch the current validation run. Validate v6/v4 first against the existing owner-local SQLite, then design the multi-analysis materialized layer once the ranking behavior is stable.

## Performance state

Right-edge validation still uses suffix `LIKE` retrieval against DB v4. `Arbeitsweise` remains several seconds because two broad right-edge channels produce 1,353 right-edge candidates and 1,580 merged candidates.

Do not optimize this validation-time lookup before quality stabilizes. Final local/mobile runtime must materialize/index validated right-edge and morphology evidence.

## Immediate next work

1. Owner pulls current feature branch; do **not** rebuild the DB.
2. Run `npm run check` and `npm test`.
3. Run `npm run diagnose:writer-pages`.
4. Inspect `Arbeitsweise`:
   - `stufenweise`, `ausnahmsweise`, `abschnittsweise`, `auszugsweise` and comparable productive forms should resolve to `right:weise`;
   - same-query-family/list-diversity penalties should rotate distinct lexical heads upward;
   - `Betriebe`, `Bestreben`, `Professoren`, `deutscher` must not regain false families.
5. Inspect short-word regressions:
   - `Liebe -> Diebe` should no longer receive a cheap-tier penalty and should stay above weaker slants;
   - `Leben -> neben/heben/kleben` should remain normal perfect rhymes;
   - `Nacht -> macht/lacht/Pacht/Yacht` should remain normal perfect rhymes.
6. Confirm lexical-safety figures remain near the v5/v2-v3 level.
7. If v6/v4 passes, stop ad-hoc ranking tuning and build formal page-quality benchmark v2.
8. Verify accepted `ranking=legacy` exact-rhyme/relation invariance.
9. Design multi-analysis lexical storage and materialize/index validated writer-search evidence for local/mobile performance.
10. Promote only through an explicit writer-search acceptance report.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality and its lexical data model are stable.
