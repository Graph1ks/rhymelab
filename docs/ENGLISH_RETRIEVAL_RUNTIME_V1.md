# English Retrieval Runtime v1 — Phase 12B8

Status: **candidate implementation / owner diagnostic pending**

## Purpose

Phase 12B8 validates a read-only English single-word retrieval runtime against the accepted v4 English Writer SQLite:

```text
data/local/rhymelab-en-v1.sqlite
```

Accepted source/materialization fingerprints:

```text
publish-v4
b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9

English DB
beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37
```

This phase does not enable English in the product and does not define final Writer ranking.

## Runtime boundary

The candidate retrieval policy is:

```text
en-bounded-indexed-runtime-v1-candidate
```

Runtime query resolution:

1. normalize the user surface with the accepted English source normalization;
2. resolve only a default-eligible English form;
3. use only pronunciation variants with `default_profile_eligible=1`;
4. therefore use only explicitly supported analyzed en-US pronunciation evidence;
5. preserve every query pronunciation variant separately.

No unprofiled, en-GB-only, unresolved or non-default pronunciation is silently promoted into the default runtime.

## Indexed candidate channels

Each accepted query pronunciation may retrieve candidates through:

1. exact stressed-tail key;
2. multisyllabic stressed-tail key;
3. vowel-sequence key;
4. English vowel-family + coarse coda class;
5. exact final-coda key.

Each channel is bounded and index-backed. There is no full-corpus scan fallback.

The runtime candidate layer merges duplicate pronunciation rows deterministically and records which retrieval channels and query-pronunciation variants produced each candidate.

This layer is a candidate generator, not final ranking.

## Candidate-only defaults

Initial engineering defaults:

```text
per-channel limit     128
merged candidate cap  512
```

These are diagnostic candidate bounds, not accepted final product tuning. Ranking/commonness calibration may justify different bounds later, but any change must preserve retrieval quality and determinism.

## Runtime diagnostic

Command:

```powershell
npm run en:runtime:diagnose
```

Output:

```text
data/local/en-retrieval-runtime-v1-report.json
```

The diagnostic requires the accepted v4 DB/source fingerprints and checks:

- DB schema and fingerprint identity;
- product EN still disabled;
- broad G2P still disabled;
- all five runtime query shapes use their dedicated indexes;
- deterministic re-analysis of 200 stored default-profile pronunciations reproduces materialized phonology keys;
- common sentinel queries resolve;
- candidate sets remain bounded;
- no default-profile/provenance leakage;
- same-open deterministic retrieval;
- `time -> rhyme` perfect-rhyme integration;
- `nation -> station` multisyllabic-perfect integration through the multisyllabic channel;
- stress-variant handling for `record`;
- alternate-pronunciation handling for `route`;
- deterministic derived-inflection samples can be resolved and re-analyzed;
- no product/API rewiring.

The report has its own semantic fingerprint over diagnostic evidence.

## Explicit non-goals

Phase 12B8 does not:

- define final English commonness behavior;
- define Writer utility weights;
- define diversity/redundancy weights;
- enable EN or DE+EN in the UI/API;
- merge English into the German DB;
- introduce broad G2P;
- create cross-language rhymes;
- resume Entity pronunciation work.

## Next gate

If the owner diagnostic passes, repeatability/runtime acceptance should be reviewed before ranking work.

Ranking then proceeds in separate layers:

```text
phonetic/relation calibration
-> commonness safety
-> Writer Quality / Utility
-> separate Diversity / Redundancy
-> product EN acceptance
```

German numeric ranking/diversity weights remain controls, not automatic English defaults.
