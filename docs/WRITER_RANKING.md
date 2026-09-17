# Deterministic writer-oriented rhyme ranking

## Purpose

RhymeLab distinguishes three questions that must not be collapsed into one score:

1. Do two pronunciations rhyme, and how strongly?
2. Is a candidate lexically useful rather than a trivial variant of the query?
3. Does the returned page contain diverse writing options rather than many near-duplicates?

The accepted phonetic scorer answers the first question. Writer ranking answers the second. Result-set diversification answers the third.

The core implementation is deliberately deterministic. No LLM, machine-learning model, neural encoder, hosted ranking service, or network dependency is permitted in the core rhyme search path.

## v1 implementation

`src/writer-ranking-policy.mjs` adds an explainable writer-utility layer over existing rhyme results. It does **not** change:

- IPA parsing;
- phonetic component scores;
- primary rhyme relation;
- Assonance/Consonance relations;
- pronunciation selection;
- database contents.

For every query/candidate pair it derives:

- normalized edit similarity;
- same-lemma evidence;
- shared-prefix length and ratio;
- shared-suffix length and ratio;
- query lexical overlap;
- lexical novelty;
- query-relative commonness;
- explicit rare/archaic/obsolete/dated penalty.

The deterministic writer utility keeps phonetic evidence dominant while applying lexical-overlap penalties only to writer usefulness.

Every writer-ranked result exposes an explanation object:

```json
{
  "writerRank": 1,
  "writer": {
    "policy": "deterministic_writer_utility_v1",
    "utility": 0.91,
    "soundUtility": 0.95,
    "lexicalPenalty": 0.04,
    "lexicalNovelty": 0.87,
    "queryOverlap": 0.13,
    "commonness": 0.92,
    "diversifiedScore": 0.91,
    "redundancyPenalty": 0,
    "maxRedundancy": 0,
    "evidence": {
      "sameLemma": false,
      "surfaceSimilarity": 0.31,
      "sharedPrefixLength": 0,
      "sharedSuffixLength": 4,
      "prefixOverlap": 0,
      "suffixOverlap": 0.33,
      "overlap": 0.13,
      "novelty": 0.87
    }
  }
}
```

The exact numbers above are illustrative; runtime values come from the deterministic formula.

## List diversification

After pairwise writer utility is calculated, RhymeLab applies greedy lexical diversification.

Redundancy is based on lexical/surface evidence, never on rhyme similarity itself:

- identical normalized form;
- same lemma;
- high normalized edit similarity;
- long shared initial construction;
- long shared terminal construction.

A five-character shared terminal construction is considered evidence for productive lexical repetition such as `*-weise`. Four-character endings such as ordinary orthographic `-eise` rhyme material are intentionally not sufficient on their own.

The reranker maintains each remaining candidate's maximum redundancy against the already selected set, so selection needs O(n²) candidate-pair checks rather than O(n³) rescoring. This is compatible with the local/mobile performance goal.

## Arbeitsweise regression intent

`Arbeitsweise` is the first explicit writer-ranking regression case.

The v1 policy is expected to:

- rank a lexically distinct high-quality candidate such as `Hochzeitsreise` above a high-overlap construction such as `Arbeitszweige` when phonetic evidence is comparable;
- heavily demote same-lemma inflectional variants such as `Arbeitsweisen` in writer-oriented ordering without claiming that they rhyme less strongly;
- keep creative weaker candidates available rather than allowing a single `*-weise` construction to consume the page;
- diversify repeated productive terminal constructions.

The synthetic tests in `tests/writer-ranking-policy.test.mjs` encode these invariants without pretending that one exact full ordering is linguistic truth.

## Runtime integration

`src/writer-search.mjs` wraps the accepted `findRhymes` pipeline:

```text
existing candidate retrieval
  -> existing phonetic scorer / relation policy
  -> existing runtime candidate order
  -> deterministic writer utility
  -> deterministic lexical diversification
  -> writer-ranked page
```

The local API/UI use writer ranking on the feature branch. The historical accepted ranking remains available through:

```text
?ranking=legacy
```

This fallback is required while the writer policy is still being benchmarked.

## What v1 deliberately does not claim

The current writer policy is an interpretable baseline, not a final morphological model.

Surface prefix/suffix evidence is useful for obvious repetition but cannot reliably parse German compounds. The next data-model milestone should add explicit deterministic morphology/compound evidence rather than continually adding string heuristics.

Target data architecture:

```text
lexeme
  -> form
  -> pronunciation variants
  -> eligible rhyme anchors / tails

form
  -> lemma / inflection family
  -> deterministic morphology analyses
  -> compound constituents / head
  -> usage / register / lexical status
```

The runtime may still materialize a compact `hot` representation for speed. Normalized build data and runtime materialization do not need to be the same schema.

## Next acceptance work

Before writer ranking can replace the accepted runtime baseline on `main`:

1. run source/tests/public audit;
2. run live local searches over difficult writer queries;
3. add page-quality metrics, especially duplicate/repetition rates;
4. verify exact-rhyme recall and relation labels are unchanged;
5. inspect common-word and unranked-word behavior;
6. add deterministic morphology evidence and compare it against the surface-only v1 baseline;
7. promote only after the new ranking has an explicit acceptance report.
