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

The branch began as a writer-reranking prototype but live owner-local testing exposed a retrieval-boundary problem. It now contains an experimental deterministic writer-search stack while the accepted/base endpoint remains unchanged.

### Current policies

```text
writer ranking:    deterministic_writer_utility_v4
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v1
```

### Current implementation

- `src/writer-ranking-policy.mjs` — deterministic writer tiers/utility/family diversity;
- `src/writer-search.mjs` — merges accepted/base results with writer right-edge retrieval, rescoring and morphology evidence;
- `src/writer-morphology.mjs` — deterministic attested right-head lexical-family evidence;
- writer explanation payload per result;
- same-lemma / shared-query-stem suppression without changing phonetic truth;
- right-edge/secondary-stress retrieval and writer scoring;
- result-set diversification by explicit lexical family rather than rhyme suffix spelling;
- browser Recommended mode respects all `deterministic_writer_utility_*` policy versions;
- `?ranking=legacy` remains the comparison/control path.

## Owner-local live findings

### Database verified

Owner-local DB is the accepted v4 data build:

- 838,209 forms;
- 904,836 pronunciations;
- built 2026-09-15;
- `Arbeitsweise` present with IPA `ˈaʁbaɪ̯t͡sˌvaɪ̯zə`, stress `2010`.

### Writer v1/v2 finding

Early lexical novelty reranking removed obvious `Arbeits-*` repetition but overpromoted weak slants. Writer v2 introduced a phonetic tier gate so commonness/novelty could not rescue a worse rhyme tier.

### Retrieval finding

Pair diagnostic for:

```text
Arbeitsweise ↔ Hochzeitsreise
```

showed:

- legacy retrieval: **not retrieved**;
- direct legacy pair score: `slant`, overall `0.7574`;
- writer right-edge retrieval: retrieved through both secondary-anchor-context and secondary-anchor channels;
- writer multi-anchor best match: secondary anchor syllable 3 ↔ 3, two-syllable tail, `multisyllabic_perfect`, score `1`.

This established that the earlier missing creative result was primarily a retrieval/anchor-boundary issue, not only ranking.

`Notfallbleibe` is absent from the current lexicon and is therefore a lexical-coverage case.

### Writer v3 page finding

After suffix-string redundancy was removed, `Arbeitsweise` returned many genuine perfect right-edge rhymes, but the page was dominated by morphological families:

```text
-weise
-reise
-preise
-kreise
-speise
-gleise
```

Examples included `schätzungsweise`, `stellenweise`, `paarweise`, `Sonderpreise`, `Pilgerreise`, `Kirchenkreise`, `Vorspeise`, etc.

This proved that spelling-based diversity should stop and explicit lexical-family evidence was required.

## Writer v4 morphology-family baseline

`src/writer-morphology.mjs` infers a writer-family only when both sides of a possible split have exact lexical evidence in the local `hot` lexicon. It supports conservative German linking-material transformations on the left side. It prefers the rightmost independently attested terminal lexeme for writer-family purposes.

Intended examples:

```text
Arbeits|weise       -> right:weise
schätzungs|weise    -> right:weise
Pilger|reise        -> right:reise
Sonder|preise       -> right:preise
Kirchen|kreise      -> right:kreise
Vor|speise          -> right:speise
Strecken|gleise     -> right:gleise
```

False substring splits such as `Sonderp|reise` are rejected because the left side lacks lexical evidence. Unresolved forms remain explicitly unresolved.

This evidence is **inferred**, not claimed as source-attested morphology. The API exposes provenance and the selected split/evidence.

Writer v4 uses this in two separate ways:

1. Same query family receives a cheap-rhyme writer-tier penalty. `Arbeitsweise` vs `stellenweise` can remain a phonetic perfect rhyme while ranking lower as a writing option.
2. After one result family is selected, more members of the same family receive strong result-set redundancy, rotating other families into the page.

Ordinary rhyme suffix spelling is not itself redundancy.

## Current validation state

Public CI passed after the core v4 morphology/ranking tests were added. The feature remains **draft and not accepted**. Do not advance package/runtime baseline yet.

## Immediate next work

1. Owner pulls current feature branch; do **not** rebuild the local DB.
2. Run `npm run check` and `npm test`.
3. Restart `npm run dev`.
4. Re-run `Arbeitsweise` top-30 with morphology family columns and inspect the actual family rotation.
5. Test several unrelated common queries to detect false morphology splits and runtime latency regressions.
6. Add page-quality metrics: repeated-family rate, same-query-family rate, useful-result recall, rare/unranked intrusion, NDCG@10/20.
7. If v4 behavior is sound, materialize/index validated right-edge and morphology evidence instead of keeping dynamic `LIKE`/lexicon probing in the final mobile/local path.
8. Promote only through a dedicated writer-search acceptance report.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality and its lexical data model are stable.
