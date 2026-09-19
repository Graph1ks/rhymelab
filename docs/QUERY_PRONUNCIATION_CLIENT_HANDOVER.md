# Client Query Pronunciation Handover

Status: **current continuation handover for unknown-query pronunciation UX**  
Read with: `AGENTS.md`, `PROJECT.md`, `docs/QUERY_PRONUNCIATION_TOTAL_V1.md`, `STATUS.md`, and `PROJECT_STATE.json`.

## Product goal

Every normalizable user query, including arbitrary word chains, must receive a usable DE and/or EN pronunciation anchor even when parts of the spelling are absent from the canonical databases.

Only missing query pronunciation is generated in the end-user client. Existing Word, Phrase/Mosaic and Entity databases, retrieval, scoring, ranking and result behavior remain authoritative.

## Current runtime flow

```text
normal Writer request
-> source-backed query/phrase pronunciation complete?
   -> yes: use it unchanged
   -> no:
      client tokenizes query
      -> source-backed token pronunciation where available
      -> persistent generated-token cache when valid
      -> local deterministic IPA only for still-missing tokens
      -> compose ephemeral query IPA
-> accepted DE/EN analyzer validates query IPA
-> existing Word / Phrase-Mosaic / Entity search
```

Regression sentence:

```text
heute abend große gangbang party
```

## Persistent generated-pronunciation cache

Implementation:

- `src/ui/query-pronunciation-cache.mjs`
- IndexedDB database: `rhymelab-query-pronunciation`
- store: `generated_pronunciations`
- schema: `rhymelab-query-pronunciation-cache-v1`
- maximum entries: 10,000
- resolver policy: `client-total-query-pronunciation-v2`

The cache is a performance layer only. It is **not lexical truth** and must never be promoted into canonical Word, Phrase/Mosaic or Entity data.

### Revalidation rule

The application already performs one `GET /api/health` during initialization. That response now carries:

```text
query_pronunciation_revision
```

The revision is a SHA-256 digest over active pronunciation/search DB file state plus their `meta` rows.

A persisted generated pronunciation is reusable only when all of these still match:

- normalized spelling;
- language;
- client resolver policy;
- current DB revision.

If the DB revision or resolver policy changes, the persisted entry is ignored/deleted and the normal source-backed lookup/generation path runs again.

If the health revision is unavailable, persistent-cache reads/writes fail closed: query pronunciation still works, but no persisted generated result is trusted.

### Precedence

```text
CURRENT SOURCE-BACKED DB PRONUNCIATION
    >
CURRENT-REVISION PERSISTED GENERATED CACHE
    >
NEW CLIENT GENERATION
```

The normal Writer query happens before client fallback. A source-backed whole-query pronunciation always wins.

For token fallback, a current-revision cache entry is safe to reuse without repeating compound probing because the cache was created against the same active immutable/read-only DB revision. After any DB replacement/update, the revision changes and the token is re-evaluated against current DB data.

Exact source-backed token pronunciation is never written into the generated cache.

## Portability boundary

The pronunciation generator and persistent cache are browser-side components intended to remain portable to:

- normal browsers;
- Android/WebView-style packaging;
- Electron renderer-style packaging.

The generator must not use:

- Node.js or `child_process`;
- eSpeak-NG or another host executable;
- LLM/neural inference;
- paid/operator pronunciation compute;
- network access from the generator itself.

The cache uses IndexedDB. The resolver is storage-agnostic through lookup/store hooks, so a future native packaging layer may replace the storage adapter without changing pronunciation logic.

## eSpeak boundary

eSpeak-NG remains development/benchmark evidence under `scripts/` only. It is not an end-user runtime dependency.

Do not reintroduce eSpeak into `src/`.

## Browser verification

Run:

```text
npm run dev
http://127.0.0.1:3030/query-pronunciation-test
```

The transparent test page uses the same persistent cache and reports persistent cache-hit count.

Useful checks:

1. Search `Baladur` or another OOV spelling once.
2. Search it again: persistent cache should be reusable.
3. Reload the page: cache should survive.
4. Replace/update an active RhymeLab DB and restart the app: `query_pronunciation_revision` must change, so the old generated cache is not trusted.
5. Search a source-backed word: DB pronunciation must win over any supplied/generated IPA.
6. Search `heute abend große gangbang party`: mixed source-backed/generated token-chain resolution must still work.

## Automated regression coverage

Relevant tests:

- `tests/query-pronunciation-runtime.test.mjs`
- `tests/query-pronunciation-cache.test.mjs`
- `tests/local-ui-source.test.mjs`
- `tests/english-writer-product.test.mjs`

Cache regressions cover:

- policy/revision gating;
- stale revision rejection;
- exact source-backed rows never becoming generated cache truth;
- cache hit bypassing repeated generated-token work;
- cache miss preserving source-backed precedence;
- generated fallback storage;
- product UI/server wiring.

## Separate future work

The ~700k+ unresolved Entity-pronunciation/materialization problem remains separate. Do not make bulk Entity generation a prerequisite for user-query fallback and do not promote browser-generated query IPA into Entity truth.

Entity Writer latency/database optimization also remains a separate later task.

## Fresh-thread instruction

Before new work:

1. fetch latest `main`;
2. read `AGENTS.md`;
3. read `PROJECT.md`;
4. read this file;
5. read `docs/HANDOVER.md`, `STATUS.md`, and `PROJECT_STATE.json`;
6. preserve the accepted/frozen Word, Phrase/Mosaic, English Writer and source-backed Entity ranking/retrieval baselines unless the new task explicitly requires evidence-backed changes.

The owner has additional large follow-up tasks that are **not defined in this handover yet**. Ask only for those task requirements; do not infer them from the pronunciation/cache work.
