# Total Query Pronunciation v1

Status: **browser/client runtime implemented; browser search test available; quality tuning continues**  
Umbrella policy: `total-query-pronunciation-v1`  
Client policy: `client-total-query-pronunciation-v1`

## Product invariant

A normalizable unknown **single-token** user query must receive a pronunciation anchor for every selected query-pronunciation language.

The end-user flow is:

```text
user query
-> existing RhymeLab source-backed lookup/search
-> source pronunciation exists?
   -> yes: use it unchanged
   -> no: resolve only the missing query pronunciation in the end-user client
-> send generated IPA back as an ephemeral query anchor
-> existing RhymeLab analyzer / retrieval / scoring / ranking
```

The unknown-word pronunciation fallback is the only part moved into the end-user client. Word/Phrase/Entity databases, retrieval, scoring, ranking, filtering and result rendering remain on the existing RhymeLab paths.

## End-user execution boundary

The production unknown-word resolver is:

- `src/ui/query-pronunciation-client.mjs`

It is browser-compatible JavaScript and is intended to remain portable to:

- normal web browsers;
- Android/WebView or equivalent app packaging;
- Electron renderer/runtime packaging.

The module must not depend on:

- Node.js;
- `child_process`;
- a local HTTP server;
- an installed executable;
- eSpeak-NG;
- an LLM;
- a neural model;
- a paid/runtime API;
- network access inside the pronunciation generator itself.

The surrounding application may use the existing RhymeLab API/database to check source-backed pronunciations and to perform the normal rhyme search. That lookup/search is not part of the generated-pronunciation compute.

## Source-backed references are allowed

The client is allowed to use RhymeLab's existing source-backed pronunciation data as references.

Current browser behavior:

1. the normal Writer request resolves known query spellings through the existing database;
2. only missing requested-language anchors enter client generation;
3. while resolving an unknown compound-like token, the client may query existing `/api/word/<word>` records for possible source-backed components;
4. if a two-part source-backed composition is found, the client composes those pronunciations;
5. otherwise the deterministic client fallback produces IPA directly from spelling.

This means source-backed data remains preferred while unknown spelling resolution itself remains end-user compute.

## Client methods

### `client_source_reference_compound`

An unknown single token is split into two source-backed lexical components when both components have accepted pronunciations.

Examples of the intended class:

```text
Winter + Wolf
Dragon + spawn
```

This is still an ephemeral pronunciation for the original unknown spelling. It is not promoted into the lexical database.

### `client_rules`

Deterministic language-specific grapheme rules produce a DE or EN IPA anchor when no source-backed composition is available.

### `client_grapheme_fallback`

A final deterministic grapheme fallback guarantees a non-empty pronunciation anchor even when normal rule scanning produces nothing useful.

There is no user-visible `uncertain` state. The selected query language determines which deterministic pronunciation is used.

## API handoff

The browser may retry the existing Writer endpoint with these ephemeral query-anchor parameters:

- `query_ipa_de`
- `query_ipa_en`
- `query_method_de`
- `query_method_en`
- `query_source_backed_de`
- `query_source_backed_en`
- `query_components_de`
- `query_components_en`

The server:

1. prefers an actual source-backed query pronunciation when one exists;
2. only consumes supplied client IPA when the corresponding source-backed lookup missed;
3. validates the IPA through the existing accepted DE/EN analyzer;
4. uses it only as the query anchor;
5. does not persist it;
6. does not change candidate lexical truth;
7. continues through the existing retrieval/scoring/ranking implementation.

## Browser search test

Development route:

```text
/query-pronunciation-test
```

The test page exercises the real end-user flow:

```text
existing Writer lookup
-> identify missing DE/EN query anchors
-> browser-only pronunciation
-> retry existing Writer with query IPA
-> normal results
```

Quick-test sentinels include:

- Vulkanschnecken
- Glutamat
- Winterwolf
- Holladio
- Dragonspawn
- Ironworm
- Baladur
- Madonna
- Michael Jackson

The first seven must produce analyzable DE and EN client IPA when requested. Known source-backed entries must continue to use the database instead of client generation.

## Multi-word boundary

The client total-pronunciation fallback is for **single-token query spelling**.

Existing accepted multi-word Phrase/Mosaic behavior remains unchanged:

1. exact accepted phrase pronunciation;
2. otherwise accepted source-backed token composition when all tokens resolve;
3. otherwise pronunciation-unresolved.

Do not silently apply the single-token spelling generator to unresolved multi-word Phrase/Mosaic input.

## Provenance

Client-generated query details are ephemeral and must expose:

- `generatedPronunciation=true`;
- `queryPronunciation.clientOnly=true`;
- generation method;
- selected language;
- optional source-backed compound components;
- `hostExecutableRequired=false`;
- `persisted=false`;
- `canonicalLexicalFact=false`.

Generated query IPA must never be silently inserted into accepted DE, EN, Phrase/Mosaic, or Entity data.

## eSpeak-NG boundary

eSpeak-NG is **not an end-user runtime dependency**.

All eSpeak-NG code lives under `scripts/` and exists only for development/benchmark evidence:

- `scripts/query-pronunciation-espeak-adapter.mjs`
- `scripts/run-query-pronunciation-espeak-oov.mjs`
- `scripts/run-query-pronunciation-espeak-gold.mjs`

The previously collected 1000-case eSpeak evidence remains useful as external reference evidence, but it does not define the end-user resolver and does not justify shipping eSpeak.

## Existing eSpeak evidence

The normalized development-only v2 run remains recorded:

```text
sample fingerprint
c51fad67e560787af92cc1f133ec355e8ffe2b6afd4c5fd546c2e27b26d434a5

v2 report fingerprint
facd6d15fa6096d33409de274d0271279560c3a728f2f860e9ee24bbff5ff1e5

cases                         1014
accepted                       1012
failed                            2
structural coverage            99.80%
```

This is benchmark/reference evidence only.

## Quality work still required

The client resolver is now testable independently from the 700k+ unresolved Entity-data problem.

Next quality work should benchmark **the browser/client resolver itself** against held-out source-backed DE/EN pronunciations, emphasizing:

- rhyme-tail agreement;
- syllable-count agreement;
- primary-stress agreement;
- phone agreement;
- compound behavior;
- proper-name/loanword behavior.

That work is separate from later bulk generated-pronunciation staging.

## Non-goals

This milestone does not:

- move rhyme retrieval into the browser;
- move ranking into the browser;
- move the runtime databases into a new client-side implementation;
- mass-process the unresolved Entity long tail;
- promote generated pronunciation rows;
- introduce a runtime host executable;
- introduce LLM inference;
- change accepted scorer/ranking policies.
