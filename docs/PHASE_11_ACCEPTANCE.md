# RhymeLab — Phase 11 Final Acceptance

Accepted: 2026-09-18

Phase 11 German phrase/mosaic/phraseology is **closed and frozen**.

## Product surface

The accepted product surface is the main local Writer UI at `/`.

There is no separate Phrase Explorer product page and no compatibility requirement for `/phrases`.

The unified Writer contract is:

```text
schema  rhymelab-unified-writer-v1
policy  de-unified-word-phrase-writer-v1
API     GET /api/writer
```

The same UI accepts single words and multi-word queries and exposes:

```text
All
Words
Phrases / Mosaic
```

The language-basis product contract is:

```text
DE
EN
DE+EN
```

German is the only accepted runtime at Phase 11 closure. English remains explicitly capability-gated and belongs to Phase 12.

## Frozen Phrase/Mosaic stack

```text
11D4 retrieval anchor fingerprint
9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059

11D4 semantic fingerprint
4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd

11E1 evidence fingerprint
04ecde26f0a59b7615d6b2a192e7cffed26aefe86ebac07e388e546210d58845

11E2-v2 ranking fingerprint
1d07ad486bdff8b167a7a394dafa687a60178cb43bd5a48da19044715d33d3a0

11E3 diversity fingerprint
ca7e04e91226cd5a3855dbe302a54bffaccce8c6d3a9defff8be049ca6153ef1
```

## Final integrated 11E4/F owner gate

Final report schema:

```text
rhymelab-unified-writer-acceptance-v1
```

Result:

```text
status                              ok
independent DB-open runs             3
protected checks                  PASS
structural checks                 PASS
frozen Word Writer equivalence    PASS
11E2-v2 fingerprint reproduced    PASS
11E3 fingerprint reproduced       PASS
performance gate                  PASS
repeatability                     PASS
```

Performance evidence from the accepted owner run:

```text
direct Word total        12015.029 ms
unified total            12516.537 ms
direct Word mean          1001.252 ms
unified mean              1043.045 ms
combined overhead ratio      1.0417
accepted maximum             1.5000
```

Repeatability semantic fingerprint:

```text
9c5ea5fcd67d74c58393cb25da854c3ed7a7ef2d6ea658d26614a194dd745694
```

All three runs reproduced that fingerprint with zero mismatches.

Protected Phrase/Mosaic cases all passed, including the accepted behavior for Liebe, Freiheit, Gedanken, Arbeitsweise, verloren, Musik and Leben.

## Product rules frozen at closure

- single-word Writer v5/v6 ranking remains frozen;
- Phrase/Mosaic is optional and may legitimately return zero results;
- no phrase quota or forced phrase visibility;
- no invented cross-channel score calibration;
- phrase diversity stays inside the Phrase/Mosaic channel;
- no G2P or guessed pronunciation for unresolved multi-word input;
- core search remains deterministic, local-only and network-independent;
- English must not be emulated with German phonology.

## Deferred final-hardening work

Do **not** spend the current development cycle polishing the UI or micro-optimizing the databases solely for presentation/performance.

Deferred until the broader databases plus search/display algorithms are complete:

- visual polish;
- ergonomic UI/UX refinement;
- responsive/product interaction refinement;
- SQLite size/layout optimization;
- query-path micro-optimization;
- caching and final latency tuning;
- final packaging/product hardening.

Functional correctness, deterministic behavior and algorithm/data quality take priority before that final hardening pass.

## Next milestone

Phase 12 — English profile + benchmark.

The existing unified UI/API language contract should be reused; Phase 12 should add an actual accepted English analyzer/scorer/database behind `EN` and `DE+EN`, not redesign the product surface.
