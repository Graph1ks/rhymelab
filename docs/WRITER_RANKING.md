# Deterministic writer-oriented rhyme ranking

## Purpose

RhymeLab separates four questions that must not be collapsed into one score:

1. Is a pronunciation pair a rhyme, and how strong is it?
2. Did retrieval expose the useful candidate at all?
3. Is the candidate lexically useful rather than a trivial continuation of the query?
4. Does the returned page contain diverse writing options rather than many variants of the same lexical construction?

The accepted legacy scorer/relation path remains independently reproducible. Writer search adds experimental deterministic retrieval, writer utility and page diversification without requiring network access, LLM inference or machine-learning model inference.

The current feature work is **not** a formally accepted runtime baseline.

## Current feature architecture

Current feature-branch pipeline:

```text
legacy/base retrieval + de-phon-v3
  + deterministic German right-edge retrieval
  -> deterministic multi-anchor writer scoring
  -> attested right-head lexical-family evidence
  -> deterministic writer utility
  -> deterministic family/list diversification
  -> writer-oriented page
```

`?ranking=legacy` bypasses the feature path and retains the accepted/base behavior for comparison.

## Right-edge / multi-anchor retrieval

The live `Arbeitsweise` review demonstrated a retrieval-boundary failure in the legacy path.

`Arbeitsweise`:

```text
ˈaʁbaɪ̯t͡sˌvaɪ̯zə
stress 2010
```

`Hochzeitsreise`:

```text
ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə
stress 2010
```

The legacy indexed retrieval did not return `Hochzeitsreise` in the pool, even though direct `de-phon-v3` scoring produced a usable slant result. The writer path now derives deterministic right-edge vowel signatures from eligible secondary-stress anchors and can retrieve this pair through the suffix signatures corresponding to the final stressed domain.

The experimental writer scorer may compare eligible primary/secondary right-edge anchors while preserving the accepted legacy endpoint unchanged. For the pair above, the secondary-stress domains beginning at syllable 3 match as a two-syllable perfect right-edge rhyme.

This is feature evidence, not yet a replacement for the accepted German phonology baseline. Formal promotion requires dedicated retrieval/scorer acceptance work.

## Writer policy v4

Current policy identifier:

```text
deterministic_writer_utility_v4
```

Pairwise writer evidence includes:

- phonetic tier and score;
- syllable distance;
- query-relative commonness;
- same lemma;
- normalized edit similarity;
- shared initial construction;
- weak long-suffix overlap diagnostics;
- attested right-head lexical-family match;
- lexical status penalties from preserved source tags.

Phonetic truth is not rewritten by lexical penalties. A candidate can remain `multisyllabic_perfect` with score `1` while receiving a lower writer rank because it repeats the query's lexical family.

## Deterministic morphology-family baseline

`src/writer-morphology.mjs` implements policy:

```text
de-attested-right-head-v1
```

This is deliberately narrower than a full morphological parser.

For each German surface form, it considers possible right-edge splits and requires lexical evidence for **both** sides from the existing local `hot` lexicon. Common German linking-material transformations are tested deterministically on the left side (for example `s`, `n`, `en`, `es`, with conservative stem restoration). Among valid analyses it prefers the rightmost independently attested terminal lexeme.

Examples of the intended writer-family evidence:

```text
Arbeits|weise       -> right:weise
schätzungs|weise    -> right:weise
stellen|weise       -> right:weise
Pilger|reise        -> right:reise
Sonder|preise       -> right:preise
Kirchen|kreise      -> right:kreise
Vor|speise          -> right:speise
Strecken|gleise     -> right:gleise
```

A false inner substring such as:

```text
Sonderp|reise
```

is rejected because the left side lacks the required lexical evidence.

Nested compounds are resolved toward the rightmost lexical head for writer-family purposes. For example, when both `Rohstoff` and `Stoffpreise` are attested, `Rohstoff|preise` is preferred over `Roh|stoffpreise` so the writer family remains `right:preise`.

### Provenance boundary

The returned evidence explicitly states that it is **inferred from local exact-surface lexical evidence**. It is not presented as a source-attested compound analysis.

Current result/query payloads expose `writerMorphology` including:

- policy;
- resolution status;
- family key;
- split position;
- raw left side;
- selected left lexical evidence and linking transformation;
- selected right-head lexical evidence;
- local evidence source.

Unresolved words stay unresolved; the engine does not invent a split.

## Query cheapness vs page diversity

Two separate effects use morphology families.

### Query-family penalty

If query and candidate resolve to the same right-head family, the candidate receives a writer-tier penalty. Example:

```text
Arbeitsweise -> right:weise
stellenweise -> right:weise
```

The rhyme may still be phonetically perfect; it is merely considered a cheaper writing continuation.

### Result-set family diversity

After one member of a morphology family is selected, further members of that same family receive strong redundancy evidence. This encourages rotation among families such as:

```text
-reise
-preise
-kreise
-speise
-gleise
-weise
```

rather than filling the top page with many compounds sharing one lexical head.

Ordinary rhyme spelling by itself is **not** redundancy. `Hochzeitsreise`, `Sonderpreise` and `Vorspeise` must not be collapsed merely because their orthography shares the rhyme ending.

The greedy reranker maintains each remaining candidate's maximum redundancy against the selected set, keeping the list-level stage deterministic and bounded.

## Explanation fields

Writer-ranked rows include:

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
- `writer.evidence`, including morphology-family comparison diagnostics;
- `writerMorphology` for the candidate;
- `writerAnchor` / `writerAnchorCandidates` when writer multi-anchor scoring is used.

The response also exposes summary objects `writerRetrieval` and `writerMorphology`.

## Arbeitsweise regression evidence

Owner-local live testing established the following sequence:

1. Legacy retrieval omitted `Hochzeitsreise` from the current pool.
2. Direct legacy phonetic scoring of the known pair was `slant`, overall `0.7574`.
3. Right-edge retrieval found `Hochzeitsreise` through both secondary-anchor-context and secondary-anchor suffix channels.
4. Writer multi-anchor scoring found the secondary-stress domains at syllable 3 as `multisyllabic_perfect`, score `1`.
5. Removing suffix-string redundancy exposed a page dominated by true perfect right-edge families such as `-weise`, `-reise`, `-preise`, `-kreise`, `-speise` and `-gleise`.
6. That live result motivated the current explicit morphology-family layer rather than further spelling heuristics.

`Notfallbleibe`, an earlier illustrative example, is not present in the current local lexicon. It therefore represents a lexical-coverage issue, not a ranking or retrieval regression in the present database.

## What remains provisional

The current morphology layer is an auditable writer-family baseline, not final German morphology.

A future normalized build model should support ambiguous analyses and provenance explicitly:

```text
lexeme
  -> form
  -> pronunciation variants
  -> eligible rhyme anchors / tails

form
  -> lemma / inflection family
  -> morphology analyses
  -> compound constituents / head
  -> lexical status / register / usage
```

Potential future source-supported morphology work may use additional licensed resources only after provenance/licensing review. Runtime performance should eventually use materialized/indexed fields rather than the current validation-time dynamic lexical lookup and right-edge `LIKE` retrieval.

## Acceptance work before promotion

Before writer search can replace the accepted runtime baseline:

1. run source checks, tests and public-readiness audit;
2. review live German writer queries beyond `Arbeitsweise`;
3. measure retrieval recall and page-quality metrics;
4. verify protected exact-rhyme and relation behavior on the accepted path;
5. benchmark query-family and repeated-family suppression;
6. measure rare/unranked intrusion and common-word quality;
7. materialize validated right-edge/morphology lookup evidence for local/mobile performance;
8. produce an explicit writer-search acceptance report;
9. promote only after owner acceptance.
