# External comparison: d-rhyme / `Arbeitsweise`

Date: 2026-09-17

This document is an **external product spot-check**, not benchmark gold and not a source of linguistic truth. It records a manually reviewed public d-rhyme result for the query `Arbeitsweise` and compares the visible product behavior with the current experimental RhymeLab writer-search branch.

Source reviewed:

- public site: `https://www.d-rhyme.de/`
- owner-provided screenshot of the `Arbeitsweise` result page
- public site description states that automatic results are primarily oriented around syllable count and that words, many phrases, acronyms, product names and proper names can be queried.

The screenshot itself is not committed to the repository. Therefore this document records only robust qualitative observations, not a machine-extracted exhaustive word list.

## Visible d-rhyme result structure

For `Arbeitsweise`, d-rhyme presents three distinct sections:

1. **Exakte Reime** — a large multi-column grid with many right-edge rhyme families.
2. **Ähnliche Klangstruktur** — a much smaller set of looser phonetic matches.
3. **Verwandte Reime und Wörter** — a very large expansion set with substantially looser lexical/phonetic relation.

The exact-rhyme grid visibly includes `Hochzeitsreise` and many members from productive right-edge families corresponding to endings such as `-weise`, `-reise`, `-preise`, `-kreise`, `-speise` and `-gleise`.

Do **not** infer that d-rhyme's label `Exakte Reime` is definitionally equivalent to RhymeLab `perfect` / `multisyllabic_perfect`; d-rhyme's internal relation/scoring rules are not exposed by the reviewed public page.

## Comparison with current RhymeLab writer search

Current experimental policies:

```text
writer ranking:    deterministic_writer_utility_v6
right-edge anchor: de-right-edge-anchors-v1
morphology family: de-attested-right-head-v4
construction:      de-adverbial-weise-v2
```

### Where RhymeLab is already competitive

- **Right-edge coverage:** after adding secondary-stress/right-edge retrieval, RhymeLab also retrieves strong `Arbeitsweise` rhyme families that were absent from legacy retrieval.
- **`Hochzeitsreise` phonetic classification:** RhymeLab retrieves it through right-edge channels and scores the secondary-anchor match as `multisyllabic_perfect`, score `1`.
- **Family breadth:** owner-local pages contain distinct heads such as `-preis`, `-reise`, `-kreis`, `-speise`, `-gleis`, `-nachweis`, etc., rather than only `*-weise` constructions.
- **Explainability:** every RhymeLab result can expose IPA, stress, rhyme type, score, anchor, usage evidence, lexical-safety evidence, morphology-family evidence and writer penalties. The reviewed d-rhyme page presents results but does not expose an equivalent scoring/provenance explanation.
- **Lexical safety:** RhymeLab explicitly protects the default writer page against unranked / very-low-use / explicit rare-historical intrusion while preserving those forms in the database where appropriate.
- **Determinism/locality:** RhymeLab's core path is local, deterministic and reproducible with no hosted ranking dependency.

### Where d-rhyme is currently stronger

- **Immediate breadth/discovery:** d-rhyme exposes a very large exact-rhyme inventory at once. This is useful when the user wants to browse many variants rather than a highly curated first page.
- **Visible `Hochzeitsreise` surfacing:** the screenshot shows `Hochzeitsreise` directly in the exact-rhyme grid. RhymeLab v6 correctly retrieves and classifies it but strong result-family diversification can place that exact surface form far below the first page after another `right:reise` member has already surfaced.
- **Mature latency/UX:** d-rhyme returns the page interactively. RhymeLab's current validation-only right-edge implementation still uses broad suffix `LIKE` scans and `Arbeitsweise` has measured multi-second latency; this is explicitly not the intended final runtime architecture.
- **Phrase/name support today:** d-rhyme publicly supports many phrases, acronyms, product names and proper names. RhymeLab deliberately postpones phrase/mosaic rhyme until German single-word writer search is stable.

## Important product conclusion

The d-rhyme screenshot does **not** justify forcing one specific candidate such as `Hochzeitsreise` into RhymeLab Top 20. The stronger invariant is:

```text
1. desired right-edge family must be retrieved;
2. phonetic relation must be classified correctly;
3. at least one strong member of a useful family should surface early;
4. the first page should not be flooded by repeated members of that family;
5. exact candidate surfacing beyond that is a usefulness/ranking question requiring broader evidence.
```

This is why the rejected writer-v7 experiment remains rejected: it moved `Hochzeitsreise` only from rank 120 to 101 while degrading Top-20 family diversity. Benchmark v2 now separates exact-candidate retrieval/classification from family-level Top-20 surfacing.

## Current competitive assessment

For the single `Arbeitsweise` spot-check:

- **phonetic/right-edge coverage:** broadly competitive after the multi-anchor fix;
- **first-page curation and explainability:** RhymeLab has a stronger explicit architecture, but its usefulness still needs human benchmark evidence;
- **raw browse breadth:** d-rhyme is stronger today;
- **specific `Hochzeitsreise` visibility:** d-rhyme is stronger today;
- **latency/product maturity:** d-rhyme is stronger today;
- **provenance, deterministic ranking explanation and lexical safety:** RhymeLab is stronger by design.

No claim that RhymeLab is globally better or worse than d-rhyme should be made from one query. A defensible comparative benchmark would need a multi-query sample, normalized candidate definitions and preferably independent human usefulness judgments.

## Follow-up after current German writer-page benchmark

If an external-competitor benchmark is desired later, build it as a separate evidence layer:

- fixed query set;
- captured candidate lists from each product at a dated snapshot;
- normalized word forms and rank/section positions;
- overlap / unique-candidate coverage metrics;
- independent human usefulness judgments on a blind union of candidates;
- do not use competitor labels as phonological ground truth.
