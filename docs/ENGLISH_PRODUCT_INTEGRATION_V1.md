# English Product Integration v1 — Phase 12B11

Status: **implemented / owner integrated acceptance pending**

## Goal

Phase 12B11 wires the selected English single-word Writer into the normal unified product contract without mutating the frozen German Writer.

Accepted English ranking candidate:

```text
Quality             guarded_commonness_06
Diversity           0.08
ranking evidence    en-writer-ranking-v2-candidate
product policy      en-writer-guarded-quality-diversity-v1-candidate
```

The product language basis remains:

```text
DE
EN
DE+EN
```

English Phrase/Mosaic and English Entity rhymes remain explicitly unavailable in this phase. No broad G2P is introduced.

## Product runtime

Module:

```text
src/english-writer-runtime.mjs
```

Runtime:

```text
en-writer-product-v1-candidate
```

English DB:

```text
data/local/rhymelab-en-v1.sqlite
```

Required DB semantic fingerprint:

```text
beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37
```

Required source publish fingerprint:

```text
b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9
```

The runtime:

1. resolves source-backed default-eligible en-US pronunciation variants;
2. performs bounded indexed candidate retrieval through the accepted five English channels;
3. scores every candidate against all source-backed query pronunciation variants;
4. collapses pronunciation variants by normalized surface using the best phonetic relation;
5. applies strict relation tier + anchored <=0.03 phonetic bands;
6. applies `guarded_commonness_06` only inside those bands;
7. applies separate Diversity weight `0.08`;
8. uses Product retrieval reservoir profile `en-product-retrieval-reservoir-v1`: exact/multi 1536, broader vowel/family-coda/coda channels 128, merged maximum 3072;
9. returns the normal product result shape.

No English candidate is passed through German phonology.

## Unified Writer behavior

### DE

The German word channel remains the frozen Writer-v5/v6 path.

### EN

`language=en` uses the English word Writer only.

Phrase/Mosaic returns:

```text
english_phrase_mosaic_not_implemented
```

English Entity rhyme remains unavailable until the deferred multilingual Entity phase.

### DE+EN

The same surface is resolved independently against the German and English source-backed inventories.

Word results preserve each language-local channel order and are interleaved by channel rank. There is no invented numeric DE/EN score calibration.

German Phrase/Mosaic and German Entity channels remain German-only.

Unknown English input still returns `query_not_found`; Phase 12B11 does not introduce broad or hidden G2P.

## Product gate

The normal server does **not** open the English DB merely because the file exists.

English is enabled only when this local marker exists and matches the accepted DB/runtime/ranking contract:

```text
data/local/en-product-enabled-v1.json
```

Marker schema:

```text
rhymelab-en-product-enabled-v1
```

The marker is generated only by a passing integrated acceptance run.

This prevents candidate code from silently becoming an accepted product capability before the owner full-data gate passes.

## Integrated owner acceptance

Run:

```powershell
git pull
npm run en:product:accept
```

Primary report:

```text
data/local/en-product-acceptance-v1-report.json
```

Acceptance marker on PASS:

```text
data/local/en-product-enabled-v1.json
```

The acceptance bundle performs two independent database-open suites and requires identical semantic fingerprints.

It checks:

- accepted English DB/publish fingerprints;
- exact selected English ranking/diversity policy;
- frozen German direct Writer vs unified `language=de&scope=words` equivalence;
- English sentinel resolution;
- `time -> rhyme` perfect-rhyme preservation;
- `nation -> station` multisyllabic-perfect preservation;
- `record` stress variants;
- `route` alternate pronunciations;
- zero language leakage in EN mode;
- DE+EN full capability and count consistency;
- explicit English Phrase/Mosaic unavailability;
- unknown English input does not fabricate a pronunciation;
- independent-open repeatability.

The report is compact by design. It stores aggregate checks and small Top-12 diagnostic snapshots, not full candidate matrices.

## Automatic local enablement

If the acceptance report status is `ok`, the runner writes the acceptance marker.

On the next `npm run dev` / `npm start`, the server validates that marker and opens the English DB.

No follow-up code change is required to activate the accepted English runtime locally.

If the acceptance command fails, the marker is removed and English remains gated.

## API

Unified Writer:

```text
GET /api/writer?q=time&language=en&scope=words
GET /api/writer?q=time&language=both&scope=words
```

English word detail:

```text
GET /api/word/time?language=en
```

The legacy `/api/rhymes/:word` endpoint remains the German control/product-history surface. English integration is through the unified Writer endpoint.

## Non-goals

Phase 12B11 does not add:

- English Phrase/Mosaic;
- English Entity rhyme;
- cross-language rhyme scoring;
- DE/EN numeric score calibration;
- unknown-query G2P;
- English DB mutation;
- German ranking retuning;
- performance/SQLite final optimization.

Those remain separate roadmap concerns.


## Owner run 1 finding

The first full-data integrated acceptance was deterministic but failed one check only: `english_multisyllabic_nation_station`.

The failure was not a phonology, ranking, database, language-isolation or repeatability failure. The accepted low-level runtime defaults to 128 rows per retrieval channel, while its earlier pair-integration diagnostic intentionally expanded the reservoir to prove `nation -> station`. Reusing 128 unchanged in Product caused the dense `-ation` exact/multisyllabic bucket to truncate before `station`.

The Product profile therefore widens only the precise exact/multisyllabic reservoirs to 1536. The accepted DB verifier measured a maximum bucket of 1430 for each of those channels. The broader vowel/coda reservoirs remain 128.

Rerun the same owner acceptance command after merge. Do not rebuild either DB.
