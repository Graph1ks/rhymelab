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

No end-user eSpeak, host executable, LLM, paid API or operator pronunciation compute is allowed.

## Candidate-data boundary

Generated query IPA changes only the query anchor.

Accepted Word, Phrase/Mosaic and Entity candidate pronunciations remain unchanged and provenance-bearing. Client query IPA is never silently stored as lexical truth.
