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
  -> explicit documented German construction rules
  -> deterministic lexical-safety tier
  -> deterministic writer utility
  -> deterministic family/list diversification
  -> writer-oriented page
```

`?ranking=legacy` bypasses the feature path and retains accepted/base behavior for comparison.

Current feature policies:

```text
writer ranking:    deterministic_writer_utility_v5
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v3
```

## Right-edge / multi-anchor retrieval

The live `Arbeitsweise` review demonstrated a retrieval-boundary failure in the legacy path.

```text
Arbeitsweise       ˈaʁbaɪ̯t͡sˌvaɪ̯zə    stress 2010
Hochzeitsreise     ˈhɔxt͡saɪ̯t͡sˌʁaɪ̯zə  stress 2010
```

Legacy indexed retrieval did not return `Hochzeitsreise` even though direct `de-phon-v3` scoring produced a usable slant. The writer path derives deterministic right-edge vowel signatures from eligible secondary-stress anchors. For this pair, the secondary-stress domains beginning at syllable 3 match as a two-syllable perfect right-edge rhyme.

This remains experimental writer-search evidence; the accepted legacy scorer/relation path is unchanged.

## Writer policy v5

Policy identifier:

```text
deterministic_writer_utility_v5
```

Pairwise writer evidence includes phonetic tier/score, syllable distance, query-relative commonness, same lemma, edit similarity, shared initial construction, explicit morphology-family comparison, lexical status and lexical-safety state.

Phonetic truth is never rewritten by lexical or safety penalties. A candidate can remain `multisyllabic_perfect` with score `1` while receiving a lower writer rank.

### Lexical-safety tier

The multi-query diagnostic showed that phonetic perfection alone can flood writer pages with unknown or extremely low-use forms. v5 adds a deterministic default-page safety tier:

```text
measured usage <= 250000                     -> +0 writer tier
unranked / unknown usage                     -> +1 writer tier
measured usage > 250000                      -> +1 writer tier
explicit rare/archaic/obsolete/dated tag     -> +2 writer tiers
```

This is **not** a linguistic rarity classifier. Missing usage remains `unranked_unknown`; it is simply weaker default-page product evidence.

The threshold is provisional until formal page-quality benchmarking.

## Deterministic morphology-family v3

`src/writer-morphology.mjs` implements:

```text
de-attested-right-head-v3
```

### v1 problem

The initial rule only required both pieces of a split to exist in the lexicon. A 12-query audit exposed false analyses such as:

```text
Betriebe     -> bet|riebe
Bestreben    -> best|reben
Professoren  -> profes|soren
deutscher    -> deut|scher
```

False family evidence is dangerous because it actively changes result order.

### v2 conservative baseline

v2 therefore preferred `unresolved` over speculative morphology. Ordinary right-head family evidence required:

1. complete-word lemma/POS evidence;
2. independently attested right-side surface;
3. noun→noun or adjective→adjective head compatibility;
4. complete lemma ending in the right-head lemma;
5. independently attested left side or conservative linking-material variant;
6. measured usage evidence for the selected left side.

Verbs and proper names remained unresolved until explicit deterministic rules exist.

Family keys use the right-head lemma:

```text
Arbeits|weise       -> right:weise
Pilger|reise        -> right:reise
Sonder|preise       -> right:preis
Kirchen|kreise      -> right:kreis
Vor|speise          -> right:speise
Strecken|gleise     -> right:gleis
deutschland|weite   -> right:weit
```

### v2 blind spot: productive `-weise`

The v5/v2 owner-local rerun removed the known false splits and drastically reduced unranked intrusion, but it also made productive adverbial `-weise` forms unresolved.

For `Arbeitsweise`, rows such as:

```text
schätzungsweise
stellenweise
paarweise
beispielsweise
stufenweise
phasenweise
stundenweise
ausnahmsweise
```

again dominated the top page while carrying no family evidence. `repeatedFamilyRows=0` was therefore formally true but semantically misleading.

### v3 explicit construction rule

v3 retains all conservative v2 gates and adds exactly one narrow productive German construction:

```text
de-adverbial-weise-v1
```

The rule applies only when:

- the whole form is tagged `adv`;
- the terminal independently attested lexeme has lemma `Weise` and POS `noun`;
- the whole lemma ends in `weise`;
- the left side or conservative linking-material variant is independently attested with measured usage.

Such rows receive family:

```text
right:weise
```

This intentionally makes noun compound `Arbeitsweise` and productive adverbial forms such as `schätzungsweise` equivalent for **writer-family cheapness/diversity**, even though their linguistic formation differs.

This is an explicit German construction rule, not a return to generic suffix-string heuristics. `Verweise`, verbs, proper names and the previous false substring cases remain unresolved unless another independently justified deterministic rule is added later.

### Provenance boundary

Morphology evidence is inferred from local lexical/lemma/POS/usage facts plus explicitly documented deterministic construction rules. It is not claimed as source-attested full morphology. Runtime payloads expose the selected split, evidence sides, checks and any `constructionRule` used.

## Query cheapness vs page diversity

Two separate effects consume morphology-family evidence.

### Query-family penalty

If query and candidate resolve to the same family, the candidate receives a writer-tier penalty. Phonetic type and score stay unchanged.

### Result-set family diversity

After one member of a family is selected, later members of that same family receive strong redundancy evidence. This rotates distinct lexical constructions into the page.

Ordinary rhyme spelling alone is **not** redundancy. `Hochzeitsreise`, `Sonderpreise` and `Vorspeise` are distinct families even though they share the phonetic/orthographic rhyme ending.

## Multi-query diagnostic

Run:

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

### v4 / morphology-v1 audit

```text
queries                       12 / 12 found
mean elapsed                  1583.4 ms
repeated morphology rows      0
unranked rows                 69
usage rank > 100k rows        60
explicit rare/historical      2
Arbeitsweise elapsed          8342.6 ms
```

### v5 / morphology-v2 audit

```text
queries                            12 / 12 found
mean elapsed                       1428.3 ms
repeated morphology rows           0
unranked rows                      2
usage rank > 100k rows             51
usage rank > 250k rows             2
explicit rare/historical           0
writer safety tier penalized       4
Arbeitsweise elapsed               7241.1 ms
Arbeitsweise right-edge candidates 1353
Arbeitsweise merged candidates     1580
```

The safety result is strong: unranked top-page intrusion fell from 69 to 2 and known false splits disappeared. The remaining v2 issue was the unresolved productive `-weise` construction, which v3 addresses.

The diagnostic is an engineering audit, not a human-gold quality benchmark.

## Performance boundary

Current right-edge validation uses suffix `LIKE` lookup against DB v4. This remains intentionally temporary and is not acceptable for final local/mobile runtime. `Arbeitsweise` still takes several seconds because right-edge validation merges 1,580 candidates.

Correctness is being frozen first. Once the v3 quality rerun validates right-edge signatures and family behavior, these keys/evidence should be materialized and indexed during the local build so runtime no longer performs broad suffix scans or dynamic morphology probing.

## Explanation fields

Writer-ranked rows expose, among other fields:

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
- `writerMorphology`, including `constructionRule` when applicable;
- `writerAnchor` / `writerAnchorCandidates`.

The response also exposes `writerRetrieval` and `writerMorphology` summaries.

## Acceptance work before promotion

Before writer search can replace the accepted runtime baseline:

1. rerun the multi-query diagnostic on writer v5 / morphology v3;
2. confirm productive `-weise` rows now share `right:weise` and rotate correctly;
3. confirm `Betriebe`, `Bestreben`, `Professoren`, `deutscher`, verb-prefix and proper-name false families stay rejected;
4. confirm lexical-safety gains remain near the v5/v2 audit;
5. build formal page-quality benchmark v2 (NDCG@10/20, useful-result recall, duplicate/family rates, lexical-safety intrusion);
6. verify protected legacy exact-rhyme and relation behavior;
7. materialize/index validated right-edge and morphology evidence for runtime performance;
8. produce an explicit writer-search acceptance report;
9. promote only after owner acceptance.

Do not move to phrase/mosaic rhyme or English until German single-word writer-search quality is stable.
