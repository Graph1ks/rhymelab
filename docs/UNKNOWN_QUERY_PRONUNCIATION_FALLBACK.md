# Unknown Query Pronunciation Fallback

Status: **active browser/client contract**

See `docs/QUERY_PRONUNCIATION_TOTAL_V1.md` for the full implementation contract.

## Rule

For a requested DE or EN **single-token** query:

```text
existing source-backed lookup first
        |
        +-- found -> use database pronunciation
        |
        +-- missing -> browser/client generates IPA locally
                          |
                          -> existing server/API validates IPA
                          -> existing rhyme search continues unchanged
```

The browser/client pronunciation generator is `src/ui/query-pronunciation-client.mjs`.

## Hard boundary

Only the pronunciation of a missing query spelling is generated in the end-user client.

Do not move these subsystems into the browser as part of this fallback:

- lexical databases;
- Phrase/Mosaic database;
- Entity database;
- candidate retrieval;
- rhyme scoring;
- writer ranking;
- result diversity;
- normal result filtering.

Source-backed DB lookups are allowed and preferred. The client may use known source-backed pronunciations as components when resolving an unknown compound-like spelling.

## No end-user eSpeak

The end-user path must not invoke:

- eSpeak-NG;
- `child_process`;
- a local executable;
- a mandatory localhost server for pronunciation generation;
- an LLM or neural pronunciation service;
- a paid or metered API.

eSpeak-NG remains a development benchmark/reference tool under `scripts/` only.

## Language behavior

`Query Pronunciation = DE`  
Resolve/use the German anchor.

`Query Pronunciation = EN`  
Resolve/use the English anchor.

`Query Pronunciation = DE+EN`  
Resolve both anchors independently. A source-backed anchor may be used for one language while only the missing language is generated client-side.

No `uncertain` state is exposed.

## API handoff

The existing Writer endpoint may receive client-generated ephemeral anchors through:

```text
query_ipa_de
query_ipa_en
query_method_de
query_method_en
query_source_backed_de
query_source_backed_en
query_components_de
query_components_en
```

Source-backed query pronunciation always wins over supplied client IPA.

The server validates supplied IPA through the existing accepted analyzer before using it. Invalid supplied IPA is not persisted and does not alter lexical data.

## Browser verification

Run the normal development server and open:

```text
http://127.0.0.1:3030/query-pronunciation-test
```

The page verifies the real flow using the normal Writer API and the browser-only pronunciation module.

Primary sentinels:

- Vulkanschnecken
- Glutamat
- Winterwolf
- Holladio
- Dragonspawn
- Ironworm
- Baladur

The automated suite also requires the client-generated DE/EN IPA for those sentinels to be accepted by the existing language analyzers.

## Multi-word boundary

Do not apply this spelling fallback to unresolved multi-word Phrase/Mosaic queries. Existing accepted phrase resolution remains unchanged.

## Data boundary

Generated query IPA is:

- ephemeral;
- non-canonical;
- non-persistent;
- not source evidence.

The separate 700k+ unresolved Entity pronunciation/materialization problem is explicitly outside this end-user query fallback milestone.
