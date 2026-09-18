# Unknown Query Pronunciation Fallback

Status: **product/runtime contract candidate — implementation gated by language-specific pronunciation benchmarks**

## Product requirement

A user-entered word must not become unusable merely because it is absent from the local lexicon.

Dictionary/source pronunciation remains preferred truth. Unknown-query handling is a separate runtime fallback that creates an **ephemeral query pronunciation**, not a new lexical fact.

The fallback exists only to analyze the query strongly enough to retrieve known rhyme candidates.

## Query order

For a single-token query:

1. normalize for the selected language;
2. try exact local lexical/pronunciation lookup;
3. if a source-backed pronunciation exists, use it;
4. otherwise enter unknown-query pronunciation fallback;
5. generate a language-specific pronunciation candidate;
6. run the normal language-specific phonology analyzer on that pronunciation;
7. derive syllables, stress and retrieval keys;
8. query the normal indexed database with those keys;
9. mark the query pronunciation as generated/ephemeral in the UI and diagnostics.

Generated pronunciations must never be silently written into the published lexicon or treated as source-backed evidence.

## Language behavior

### DE

If the product language is explicitly `DE`, use only the German fallback profile.

### EN

If the product language is explicitly `EN`, use only the English fallback profile.

### DE+EN

If the surface is known in exactly one language runtime, use that source-backed language pronunciation.

If the surface is unknown in both runtimes, the UI must ask the user which reading to use:

```text
Aussprache:
[ Deutsch ] [ English ]
```

Do not silently infer language from spelling when the result would materially change rhyme retrieval.

If both language runtimes know the surface with materially different pronunciations, expose the language choice rather than flattening them into one reading.

## Pronunciation preview

For a generated query reading, show at least:

- selected language;
- generated IPA/canonical pronunciation;
- syllable split;
- stress position when available;
- a clear generated/fallback provenance marker.

A later product iteration may allow direct pronunciation editing or choosing between multiple generated readings, but the initial implementation must at least allow DE/EN selection in ambiguous combined-language mode.

## Architecture boundary

The existing analyzers are **pronunciation analyzers**, not spelling-to-pronunciation generators:

- German: `scripts/german-ipa.mjs` parses/analyzes German IPA;
- English: `scripts/english-phonology.mjs` parses CMUdict ARPAbet or English IPA.

Therefore unknown-query support requires a separate deterministic grapheme-to-pronunciation layer per language.

Conceptually:

```text
orthography
  -> language-specific query G2P
  -> IPA / canonical pronunciation
  -> existing phonology analyzer
  -> syllables + stress + rhyme keys
  -> indexed retrieval
```

Do not put orthographic heuristics directly into the rhyme scorer.

## Bulk-G2P boundary

This runtime fallback does **not** approve broad G2P materialization into the English or German databases.

The distinction is deliberate:

```text
query-time fallback
  ephemeral
  user-visible provenance
  used only as query anchor
  may be corrected/retried

bulk lexicon G2P
  persistent lexical data
  affects hundreds of thousands of candidate rows
  requires a separate acceptance decision
```

The existing prohibition on broad mass-G2P remains in force.

## Acceptance gate

Before enabling a language fallback in the product:

1. build a held-out test set of source-backed words;
2. hide their dictionary pronunciation;
3. generate pronunciation from spelling only;
4. compare generated syllable count, stress, rhyme tail and retrieval keys against source-backed truth;
5. report error classes by word shape and frequency;
6. protect representative names, slang, compounds, contractions and inflections;
7. require deterministic repeatability;
8. verify that generated query pronunciations never mutate lexical DB fingerprints.

Exact phone-by-phone identity is useful but not the only relevant metric. For RhymeLab the decisive downstream metric is whether the generated query preserves the correct rhyme domain and retrieves the expected candidate families.

## Licensing/runtime note

Any third-party G2P engine must satisfy the local/offline/commercial distribution constraints before adoption.

Do not embed a dependency merely because it can emit IPA. In particular, copyleft/native-runtime licensing and model-inference dependencies must be reviewed against RhymeLab's commercial and deterministic-core boundaries.

## Product failure mode

The final UX must not be:

```text
unknown word -> no results
```

It should be:

```text
unknown word
-> choose/resolve language if needed
-> generate transparent temporary pronunciation
-> show syllables/pronunciation
-> retrieve rhymes using normal phonology
```
