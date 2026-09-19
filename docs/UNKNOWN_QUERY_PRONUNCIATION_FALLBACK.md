# Unknown Query Pronunciation Fallback

Status: **active product/runtime contract — Total Query Pronunciation v1**

The implementation contract is detailed in `docs/QUERY_PRONUNCIATION_TOTAL_V1.md`.

## Product invariant

A normalized single-token user query must not become unusable merely because its spelling is absent from the local lexical databases.

For an available query language:

```text
unknown single-token spelling
-> one deterministic DE and/or EN query pronunciation
-> analyzer-compatible IPA
-> syllables + stress + rhyme keys
-> normal indexed Writer / Phrase-Mosaic / Entity retrieval
```

For a single-token query, `query_pronunciation_unresolved` and `query_not_found` are not acceptable merely because source-backed pronunciation is missing.

Source-backed pronunciation remains preferred lexical truth. Generated query pronunciation is ephemeral query state and is never silently promoted into a canonical lexicon.

## Resolution order

For each requested query-pronunciation language:

1. normalize the query surface;
2. try exact local source-backed lexical/pronunciation lookup;
3. if source-backed pronunciation exists, use it unchanged;
4. otherwise enter Total Query Pronunciation v1;
5. try an externally installed local eSpeak-NG executable when available;
6. accept its output only if the existing language analyzer accepts the resulting IPA;
7. otherwise use RhymeLab's deterministic language-specific grapheme rules;
8. if those rules still cannot yield an analyzable pronunciation, use the deterministic grapheme fallback;
9. analyze the generated IPA through the existing DE/EN phonology profile;
10. use the existing indexed retrieval/scoring/ranking pipeline.

No generated query pronunciation receives a lexical confidence score. The runtime chooses exactly one deterministic reading for each selected language.

## Language behavior

### DE

`Query Pronunciation = DE` resolves only the German query anchor.

### EN

`Query Pronunciation = EN` resolves only the English query anchor.

### DE+EN

`Query Pronunciation = DE+EN` resolves both language anchors independently.

If a source-backed pronunciation exists in one language but not the other, the known language remains source-backed and the missing language receives a generated temporary query pronunciation.

The product does not stop and ask the user to resolve spelling ambiguity for single-token queries. Language choice itself is the explicit product control.

## Multi-word boundary

This contract changes **single-token unknown-query behavior only**.

Existing accepted Phrase/Mosaic and source-composition rules for multi-word input remain frozen. In particular, this change does not mass-G2P unresolved phrase tokens into the accepted Phrase/Mosaic catalog.

## Query provenance

Generated query details must expose:

- selected language;
- generated IPA;
- syllable count;
- stress position/pattern;
- `generatedPronunciation=true`;
- generation method;
- engine/policy version;
- `ephemeral=true`;
- `persisted=false`;
- `canonicalLexicalFact=false`.

The browser shows **Generated pronunciation / Generierte Aussprache**. It must not show `uncertain` as a query-resolution state.

## eSpeak-NG boundary

eSpeak-NG is an optional externally installed host tool.

- It is not bundled with RhymeLab.
- It is not a network service.
- It is not an LLM or neural ranking/search model.
- Its generated pronunciation is not source-backed lexical truth.
- Its output must pass the existing RhymeLab language analyzer before use.
- If it is absent or rejected by the analyzer, deterministic RhymeLab rules provide the total fallback.
- `RHYMELAB_ESPEAK_COMMAND` may point at an explicit local executable.

Upstream eSpeak-NG is GPL-3.0-or-later. Any future decision to bundle or redistribute it with RhymeLab requires a separate licensing/distribution decision. This contract only approves invocation of a separately installed host executable.

## Bulk generated-pronunciation boundary

Query-time fallback does not automatically promote generated pronunciations into the accepted databases.

The repository now provides a separate staging path:

```text
real unresolved RhymeLab rows
-> deterministic 1000-case sample
-> optional local eSpeak-NG run
-> analyzer-compatible generated rows
-> generated pronunciation staging SQLite
-> generated_unreviewed
-> consumer_policy = opt_in_only
```

The staging schema is designed so a later product version can expose an explicit user checkbox for generated/unclear-spelling candidate rows.

That candidate-overlay checkbox is not promoted into the product until the generated dataset and retrieval semantics have passed their own acceptance gate.

## 1000-case unresolved benchmark

The default sample is exactly 1000 unique unresolved rows from local RhymeLab databases:

- 200 German unresolved Phrase/Mosaic tokens;
- 200 German preferred unresolved Entity names;
- 200 English preferred unresolved Entity names;
- 200 German unresolved Entity aliases;
- 200 English unresolved Entity aliases.

The selection is deterministic from a versioned seed and receives a semantic fingerprint.

Product sentinels are evaluated in addition to the 1000 database rows:

- Vulkanschnecken
- Glutamat
- Winterwolf
- Holladio
- Dragonspawn
- Ironworm
- Baladur

Each sentinel is tested under both DE and EN pronunciation profiles.

## Owner workflow

Build the real local unresolved sample:

```bash
npm run query:oov:sample
```

Run the optional local eSpeak-NG structural benchmark:

```bash
npm run query:oov:espeak
```

Or both:

```bash
npm run query:oov:benchmark
```

Materialize the generated opt-in staging database:

```bash
npm run query:oov:stage -- --replace
```

Default outputs stay under `data/local/` and remain outside Git.

## Acceptance metrics

The 1000 unresolved rows do not have source-backed gold by definition, so their first role is structural/product validation:

- resolution coverage;
- analyzer-compatible IPA coverage;
- valid syllable count;
- valid stress;
- valid rhyme-tail/retrieval keys;
- deterministic repeatability;
- p50 / p95 host latency;
- failure distribution by source stratum.

Quality acceptance still requires held-out source-backed controls where dictionary pronunciation is hidden and generated output is compared against source truth.

For RhymeLab, the decisive quality metrics include:

- exact/near phone agreement;
- syllable-count agreement;
- stress agreement;
- rhyme-tail agreement;
- retrieval-family agreement.

## Non-goals

This contract does not:

- mutate accepted DE/EN lexical database fingerprints;
- mass-promote generated Entity pronunciations;
- treat generated output as source evidence;
- introduce LLM inference;
- introduce neural ranking;
- introduce a runtime network dependency;
- reopen accepted scorer/ranking policies.
