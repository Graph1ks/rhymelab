# Unknown Query Pronunciation Fallback

Status: **active client-side word + word-chain contract**

See `docs/QUERY_PRONUNCIATION_TOTAL_V1.md`.

## Rule

Unknown pronunciation must not block a user query.

```text
existing source-backed query pronunciation
        |
        +-- complete -> use it
        |
        +-- incomplete / missing
               -> browser tokenizes user text
               -> known token? use DB pronunciation
               -> unknown token? generate IPA locally
               -> compose full query IPA
               -> existing search pipeline
```

This applies to both:

- single words;
- multi-word user text such as `heute abend große gangbang party`.

## Hard boundary

The client generates pronunciation only. It does not implement a second database, rhyme retrieval, scorer or ranker.

Source-backed DB references are allowed and preferred.

Generated token pronunciation may be persisted in the bounded IndexedDB cache only after the app has obtained the current `query_pronunciation_revision` from its initial `/api/health` request. A cached row is valid only for the same language, normalized spelling, resolver policy and DB revision. Revision changes invalidate stale cache before reuse.

No end-user eSpeak, host executable, LLM, paid API or operator pronunciation compute is allowed.

## Candidate-data boundary

Generated query IPA changes only the query anchor.

Accepted Word, Phrase/Mosaic and Entity candidate pronunciations remain unchanged and provenance-bearing. Client query IPA is never silently stored as lexical truth. Persistent generated-token cache rows are explicitly non-canonical performance data, not accepted pronunciation records.

Fresh-thread continuation: `docs/QUERY_PRONUNCIATION_CLIENT_HANDOVER.md`.
