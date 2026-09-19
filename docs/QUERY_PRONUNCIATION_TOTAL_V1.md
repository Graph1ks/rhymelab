# Client Total Query Pronunciation

Status: **implemented for single words and multi-word user queries**  
Umbrella policy: `total-query-pronunciation-v1`  
Client policy: `client-total-query-pronunciation-v2`

## Product invariant

Every normalizable user query must have a usable DE and/or EN pronunciation anchor for the selected query language, including arbitrary word chains.

```text
user query
-> existing source-backed query lookup
-> fully pronounceable?
   -> yes: use accepted pronunciation unchanged
   -> no:
      tokenize query in the end-user client
      -> each token: source-backed DB pronunciation when available
      -> only missing token: local deterministic spelling -> IPA
      -> compose token IPA into one ephemeral query IPA
-> existing accepted analyzer validates IPA
-> existing Word / Phrase-Mosaic / Entity retrieval, scoring and ranking
```

Regression sentinel:

```text
heute abend große gangbang party
```

## Runtime boundary

Only missing query pronunciation is generated in the end-user client.

Implementation:

- `src/ui/query-pronunciation-client.mjs`
- policy `client-total-query-pronunciation-v2`
- maximum 64 pronunciation tokens per query

The generator must remain browser-compatible and portable to Android/WebView-style packaging and Electron-style packaging.

It must not depend on:

- Node.js;
- `child_process`;
- eSpeak-NG or another installed executable;
- an LLM/neural model;
- paid/operator pronunciation compute;
- network access inside the generator.

The surrounding product may use the existing RhymeLab DB/API to obtain source-backed token pronunciations and to perform the normal rhyme search.

## Resolution order

For the whole query:

1. accepted exact query/phrase pronunciation when available;
2. accepted server-side source-backed token composition when already fully resolvable;
3. otherwise client token-chain resolution.

For every client token:

1. exact source-backed word pronunciation;
2. two-part source-backed compound composition when available;
3. deterministic language-specific client rules;
4. deterministic grapheme fallback.

The resulting word/phrase IPA is ephemeral query state only.

## Search handoff

The browser retries the existing Writer endpoint with optional ephemeral anchors:

- `query_ipa_de`
- `query_ipa_en`
- `query_method_de`
- `query_method_en`
- `query_source_backed_de`
- `query_source_backed_en`
- `query_components_de`
- `query_components_en`

Source-backed query pronunciation always overrides supplied client IPA.

The server validates supplied IPA through the accepted language analyzer and does not persist it.

For a multi-word query, the resulting phrase IPA may feed the existing:

- German Writer word retrieval by external query IPA;
- German Phrase/Mosaic retrieval;
- multilingual Entity retrieval;
- English Writer external-query retrieval.

No new rhyme scorer or ranking system is introduced.

## Phrase/Mosaic boundary

Accepted Phrase/Mosaic **candidate** pronunciations and the frozen Phase 11 retrieval/ranking/diversity policies remain unchanged.

The changed rule concerns only ad-hoc user query pronunciation. An unresolved user text chain may now receive a generated query IPA; this does not generate or mutate Phrase/Mosaic database rows.

## Browser test

Run:

```text
npm run dev
http://127.0.0.1:3030/query-pronunciation-test
```

The test route includes single-word sentinels plus:

```text
heute abend große gangbang party
```

It shows whether the final query came from a source-backed DB pronunciation or browser IPA and then displays results from the normal `/api/writer` pipeline.

## Provenance

Client-generated query details must remain:

- `generatedPronunciation=true`;
- `queryPronunciation.clientOnly=true`;
- non-persistent;
- non-canonical;
- explicit about method/components.

For token chains, source-backed tokens and locally generated tokens remain distinguishable in the client result object.

## eSpeak-NG

eSpeak-NG is development/benchmark evidence only under `scripts/`.

It is not part of browser, Android, Electron or normal end-user query pronunciation.

The prior normalized v2 benchmark remains reference evidence only:

```text
1012 / 1014 analyzer-compatible
99.80% structural coverage
report fingerprint facd6d15fa6096d33409de274d0271279560c3a728f2f860e9ee24bbff5ff1e5
```

## Separate bulk-data problem

The 700k+ unresolved Entity-pronunciation/materialization problem is separate.

Do not use bulk Entity staging as a prerequisite for end-user query pronunciation, and do not treat client query IPA as canonical Entity pronunciation data.
