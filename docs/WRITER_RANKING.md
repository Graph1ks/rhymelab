# Deterministic writer-oriented rhyme ranking

## Purpose

RhymeLab separates four questions that must not be collapsed into one score:

1. Is a pronunciation pair a rhyme, and how strong is it?
2. Did retrieval expose the useful candidate at all?
3. Is the candidate lexically useful rather than a trivial continuation of the query?
4. Does the returned page contain diverse, usable writing options rather than many variants of one construction or obscure dictionary forms?

The accepted legacy scorer/relation path remains independently reproducible. Writer search adds experimental deterministic retrieval, writer utility, lexical safety and page diversification without network access, LLM inference or machine-learning model inference.

The current feature work is **not** a formally accepted runtime baseline.

## Current feature architecture

```text
legacy/base retrieval + de-phon-v3
  + deterministic German right-edge retrieval
  -> deterministic multi-anchor writer scoring
  -> conservative lemma/POS right-head family evidence
  -> deterministic lexical-safety tier
  -> deterministic writer utility
  -> deterministic family/list diversification
  -> writer-oriented page
```

`?ranking=legacy` bypasses the feature path and retains the accepted/base behavior for comparison.

Current feature policies:

```text
writer ranking:    deterministic_writer_utility_v5
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v2
```

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

Legacy indexed retrieval did not return `Hochzeitsreise` in the pool even though direct `de-phon-v3` scoring produced a usable slant. The writer path derives deterministic right-edge vowel signatures from eligible secondary-stress anchors and retrieves this pair through the final stressed-domain suffix signatures.

The experimental writer scorer may compare eligible primary/secondary right-edge anchors while preserving the accepted legacy endpoint unchanged. For this pair, the secondary-stress domains beginning at syllable 3 match as a two-syllable perfect right-edge rhyme.

This remains feature evidence, not yet a replacement for the accepted German phonology baseline. Formal promotion requires dedicated retrieval/scorer acceptance work.

## Writer policy v5

Policy identifier:

```text
deterministic_writer_utility_v5
```

Pairwise writer evidence includes:

- phonetic tier and score;
- syllable distance;
- query-relative commonness;
- same lemma;
- normalized edit similarity;
- shared initial construction;
- weak long-suffix overlap diagnostics;
- conservative right-head lexical-family match;
- preserved lexical-status tags;
- explicit writer lexical-safety state.

Phonetic truth is never rewritten by lexical or safety penalties. A candidate can remain `multisyllabic_perfect` with score `1` while receiving a lower writer rank.

### Lexical-safety tier

The multi-query page diagnostic showed that phonetic perfection alone can flood writer pages with unranked or very-low-usage forms. v5 therefore adds a separate deterministic product-safety tier:

```text
measured usage <= 250000                     -> +0 writer tier
unranked / unknown usage                     -> +1 writer tier
measured usage > 250000                      -> +1 writer tier
explicit rare/archaic/obsolete/dated tag     -> +2 writer tiers
```

This is **not** a linguistic rarity classifier. Missing usage remains `unranked_unknown`, exactly as required by the project data policy. The tier only expresses conservative default-page usefulness when stronger usage evidence is absent.

The threshold is a provisional writer-product gate and must be validated by page-quality benchmarks. Users can still access phonetic ordering through explicit alternate sorts / the legacy comparison path during validation.

## Deterministic morphology-family v2

`src/writer-morphology.mjs` implements:

```text
de-attested-right-head-v2
```

v1 required only that both pieces of a possible split existed in the local lexicon. The 12-query page audit proved that this was too permissive. False analyses included patterns equivalent to:

```text
Betriebe     -> bet|riebe
Bestreben    -> best|reben
Professoren  -> profes|soren
deutscher    -> deut|scher
```

v2 therefore prefers **unresolved** over speculative morphology and currently accepts only conservative noun/adjective right-head evidence.

A candidate family is accepted only when all of the following hold:

1. the complete word has lemma and POS evidence;
2. the right-side surface is independently attested in the local `hot` lexicon;
3. noun heads remain noun heads, adjective heads remain adjective heads;
4. the complete lemma ends in the right-head lemma;
5. a left-side candidate or conservative linking-material variant is independently attested;
6. the selected left evidence has measured usage evidence.

Verbs and proper names remain unresolved until explicit deterministic prefix/form-of or name-compound rules are implemented.

Family keys use the right-head **lemma**, not the inflected surface. Intended examples include:

```text
Arbeits|weise       -> right:weise
Pilger|reise        -> right:reise
Sonder|preise       -> right:preis
Kirchen|kreise      -> right:kreis
Vor|speise          -> right:speise
Strecken|gleise     -> right:gleis
deutschland|weite   -> right:weit
```

### Provenance boundary

The evidence remains inferred from local lexical/lemma/POS/usage facts. It is not claimed as source-attested full compound morphology. Runtime payloads expose the selected split, both evidence sides and the deterministic checks.

Unresolved words stay unresolved; the engine does not invent a family merely to diversify a page.

## Query cheapness vs page diversity

Two separate effects use morphology families.

### Query-family penalty

If query and candidate resolve to the same right-head family, the candidate receives a writer-tier penalty. The phonetic class and score stay unchanged.

### Result-set family diversity

After one member of a morphology family is selected, further members of that same family receive strong redundancy evidence. This rotates distinct lexical heads into the page.

Ordinary rhyme spelling is **not** redundancy. `Hochzeitsreise`, `Sonderpreise` and `Vorspeise` must not be collapsed merely because their orthography shares the rhyme ending.

## Multi-query diagnostic

Run:

```powershell
npm run diagnose:writer-pages
```

The default battery currently covers:

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

The v1 owner-local report over 12×Top-30 established:

```text
queries                       12 / 12 found
mean elapsed                  1583.4 ms
repeated morphology rows      0
unranked rows                 69
usage rank > 100k rows        60
explicit rare/historical      2
Arbeitsweise elapsed          8342.6 ms
```

That report triggered v5/v2. The diagnostic schema is now `rhymelab-writer-page-diagnostic-v2` and additionally records writer safety states, >250k usage rows and the number of safety-tier-demoted results.

The diagnostic is an engineering audit, not a quality benchmark or human gold ranking.

## Performance boundary

Current right-edge validation uses suffix `LIKE` lookup against DB v4. This is intentionally temporary and is not acceptable as the final local/mobile implementation: the `Arbeitsweise` live audit took about 8.3 seconds and merged 1,580 candidates.

Correctness is being validated first. Once right-edge signatures and morphology fields are stable, they should be materialized/indexed during the local build so runtime retrieval no longer performs broad suffix scans or dynamic lexical-family probing.

## Explanation fields

Writer-ranked rows include, among other existing fields:

- `writerRank`;
- `writer.policy`;
- `writer.utility`;
- `writer.baseTier`;
- `writer.cheapRhymeTierPenalty`;
- `writer.lexicalSafetyTierPenalty`;
- `writer.lexicalSafety.state`;
- `writer.writerTier`;
- `writer.effectiveTier`;
- `writer.diversityTierPenalty`;
- `writer.maxRedundancy`;
- `writer.evidence`;
- `writerMorphology`;
- `writerAnchor` / `writerAnchorCandidates`.

The response also exposes summary objects `writerRetrieval` and `writerMorphology`.

## Arbeitsweise regression evidence

Owner-local live testing established:

1. legacy retrieval omitted `Hochzeitsreise`;
2. direct legacy scoring was `slant`, `0.7574`;
3. right-edge retrieval found it through secondary-anchor channels;
4. multi-anchor scoring found the two-syllable secondary-stress domain as `multisyllabic_perfect`, score `1`;
5. removing suffix-string redundancy exposed true but repetitive lexical-head families;
6. morphology-family diversification fixed that page-level repetition;
7. the multi-query diagnostic then exposed broader morphology false positives and lexical-safety intrusion, motivating v2/v5 rather than more `Arbeitsweise` tuning.

`Notfallbleibe` is absent from the current local lexicon and remains a lexical-coverage case.

## What remains provisional

The current morphology layer is a conservative writer-family baseline, not final German morphology.

The target build model remains:

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

Future deterministic morphology work should preserve ambiguous analyses and provenance instead of forcing a false single segmentation.

## Acceptance work before promotion

Before writer search can replace the accepted runtime baseline:

1. rerun the multi-query diagnostic on v5/v2 and compare against the v1 page audit;
2. inspect remaining morphology false positives and safety-tier behavior;
3. add formal page-quality benchmark v2 (NDCG@10/20, useful-result recall, duplicate/family rates, lexical-safety intrusion);
4. verify protected legacy exact-rhyme and relation behavior;
5. materialize/index validated right-edge and morphology evidence for runtime performance;
6. produce an explicit writer-search acceptance report;
7. promote only after owner acceptance.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality is stable.
