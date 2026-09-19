# Total Query Pronunciation v1

Status: **implemented product/runtime baseline; normalized v2 structural benchmark accepted; source-backed gold controls pending**  
Policy: `total-query-pronunciation-v1`

## Goal

Every normalizable single-token query receives a usable pronunciation anchor for each selected query language.

The user experience must be:

```text
type any word / coined word / compound-like token
-> source-backed pronunciation if known
-> otherwise local generated pronunciation
-> normal rhyme search
```

Never:

```text
unknown spelling
-> no pronunciation
-> no rhyme search
```

## Runtime implementation

Runtime module:

- `src/query-pronunciation-runtime.mjs`

Existing analyzers remain authoritative:

- DE: `de-ipa-v2`
- EN: accepted English pronunciation profile

Existing retrieval/ranking remains authoritative.

### Generated methods

`espeak_ng`

- optional host executable;
- local CPU;
- no network;
- analyzer-gated;
- not bundled;
- not lexical truth.

`deterministic_rules`

- in-repository deterministic DE/EN grapheme rules;
- used when eSpeak-NG is missing or rejected.

`deterministic_grapheme_fallback`

- final total-function fallback;
- exists to guarantee at least one analyzable syllabic pronunciation.

## Retrieval integration

German generated queries use:

- existing DE phonology;
- existing Writer retrieval anchors;
- existing scorer;
- existing Writer utility ranking;
- existing Phrase/Mosaic retrieval;
- existing Entity retrieval.

English generated queries use:

- existing English phonology;
- existing indexed English retrieval;
- existing scorer/ranking/diversification;
- existing Entity retrieval.

Generated query pronunciation changes only the **query anchor**. Candidate lexical truth is unchanged.

## Runtime cache

Generated query details are cached in-process by:

```text
language + normalized surface
```

The cache is bounded and ephemeral. It is not a lexical database.

## 1000-case real unresolved sample

Script:

- `scripts/sample-query-pronunciation-oov.mjs`

Default inputs:

- `data/local/rhymelab-phrases-v1.sqlite`
- `data/local/rhymelab-entities-v1.sqlite`

Default output:

- `data/local/query-pronunciation-oov-sample-v1.json`
- `data/local/query-pronunciation-oov-sample-v1.tsv`

The default sample is balanced across five 200-row strata and deduplicated by language + normalized spelling.

Selection is deterministic and fingerprinted.

## eSpeak-NG evaluation

Script:

- `scripts/run-query-pronunciation-espeak-oov.mjs`

Default output:

- `data/local/query-pronunciation-espeak-oov-report-v2.json`
- `data/local/query-pronunciation-espeak-oov-predictions-v2.tsv`

The report measures structural coverage and local latency. It explicitly does **not** claim correctness gold for unresolved rows.

Report v2 also records raw eSpeak IPA, normalized IPA, whether normalization changed the pronunciation, and the exact analyzer rejection reason for every failed case.

The same run includes the seven product sentinels in both languages.

### First owner run — diagnostic baseline, not accepted evidence

The first Windows 11 owner run used eSpeak-NG 1.52.0 over the deterministic 1000-row local sample plus 14 product-sentinel language cases.

```text
sample fingerprint
c51fad67e560787af92cc1f133ec355e8ffe2b6afd4c5fd546c2e27b26d434a5

v1 report fingerprint
6dde5b586895bc22e7b606429d37eac99913e6ca37d997a5d7926d6fb0c07c3e

cases                         1014
database unresolved cases     1000
product sentinel cases          14
accepted                        685
failed                          329
coverage                      67.55%
p50                            82.414 ms
p95                            94.689 ms
max                           152.365 ms

DE phrase unresolved          194 / 200  97%
DE preferred Entity           200 / 200 100%
DE Entity alias               200 / 200 100%
EN preferred Entity            48 / 200  24%
EN Entity alias                32 / 200  16%
product sentinels              11 / 14   78.57%
```

This v1 report is diagnostic only and must not be used for generated-pronunciation staging. It exposed an adapter-normalization defect rather than an eSpeak-NG coverage ceiling:

- eSpeak-NG 1.52.0 emits Unicode format joiners inside some diphthongs/affricates;
- the v1 adapter left those characters in place;
- German analysis could carry them into phoneme/rhyme keys and split diphthongs into multiple nuclei;
- English analysis rejected many such outputs;
- eSpeak also emits phone variants such as DE `ɑː` and EN `oː` / `ɛː` that require explicit adapter normalization into the already accepted analyzer inventories.

The accepted DE/EN analyzers remain unchanged. The fix belongs exclusively in the eSpeak adapter.

The normalized v2 owner rerun is now complete and is accepted as **structural/analyzer compatibility evidence**:

```text
v2 report fingerprint
facd6d15fa6096d33409de274d0271279560c3a728f2f860e9ee24bbff5ff1e5

cases                         1014
database unresolved cases     1000
product sentinel cases          14
accepted                       1012
failed                            2
coverage                       99.80%
normalization changed          830 / 82.02%
p50                            81.832 ms
p95                            96.699 ms
max                           165.763 ms

DE phrase unresolved          200 / 200 100%
DE preferred Entity           200 / 200 100%
DE Entity alias               200 / 200 100%
EN preferred Entity           200 / 200 100%
EN Entity alias               198 / 200  99%
product sentinels              14 / 14  100%
```

The two remaining failures are non-Latin Entity aliases for which eSpeak-NG emitted no IPA:
`夢境` and `זבולון קוורטין`. They are not analyzer-symbol failures.

The v2 result proves that the adapter now converts eSpeak-NG 1.52.0 output into the accepted RhymeLab analyzer inventories with near-total structural coverage. It does **not** establish lexical pronunciation correctness for unresolved spellings.

Generated-pronunciation staging may now consume the v2 report as isolated, non-canonical evidence. Runtime/candidate-overlay promotion remains blocked on pronunciation-quality evidence.

## Source-backed pronunciation-quality controls

Scripts:

- `scripts/sample-query-pronunciation-gold.mjs`
- `scripts/run-query-pronunciation-espeak-gold.mjs`

Owner command:

```bash
npm run query:gold:benchmark
```

Default sample:

- 1000 source-backed lexical controls;
- 500 German + 500 English;
- deterministic, fingerprinted selection;
- balanced across 1-, 2-, 3-, and 4+-syllable buckets;
- German controls from accepted non-historical dictionary pronunciations in `rhymelab-v5.sqlite`;
- English controls from accepted default-profile source-backed pronunciations in `rhymelab-en-v1.sqlite`.

The evaluation records prediction coverage, exact phones, exact rhyme tail, syllable count, stress pattern, primary-stress position, mean accepted language-specific rhyme score, latency, and mismatch examples.

These controls are a proxy quality benchmark over known source-backed pronunciations. They are **not direct gold for the unresolved OOV rows**, and the report contains no automatic runtime-promotion threshold.

## Generated pronunciation staging

Script:

- `scripts/materialize-generated-pronunciation-staging.mjs`

Default DB:

- `data/local/rhymelab-generated-pronunciations-v1.sqlite`

Schema:

- `rhymelab-generated-pronunciation-staging-v1`

Every row is:

```text
generated = 1
review_state = generated_unreviewed
consumer_policy = opt_in_only
opt_in_eligible = 1
canonical_lexical_fact = 0
```

The staging DB is deliberately separate from canonical DE, EN, Phrase/Mosaic, and Entity databases.

## Future opt-in candidate overlay

The staging schema reserves the intended product behavior:

```text
[ ] Include generated / unclear-spelling pronunciations
```

When enabled in a later accepted overlay, generated candidates may participate in result retrieval as explicitly non-source-backed data.

Before that checkbox is activated:

1. preserve the accepted 1000-case v2 structural report;
2. run held-out source-backed gold controls;
3. audit category/language failure distributions;
4. define generated-candidate ranking penalties or isolation semantics;
5. prove canonical database fingerprints are unchanged;
6. benchmark latency/memory cost;
7. add explicit UI provenance.

## Licensing

eSpeak-NG upstream project:

- https://github.com/espeak-ng/espeak-ng
- GPL-3.0-or-later upstream licensing

RhymeLab does not vendor or redistribute it in this implementation. The adapter invokes an already installed executable only.

Bundling eSpeak-NG into a future desktop distribution is a separate licensing decision.

## Acceptance status

Implemented now:

- total deterministic single-token resolver;
- optional eSpeak-NG host adapter;
- deterministic no-eSpeak fallback;
- DE/EN analyzer validation;
- DE/EN normal search-path integration;
- generated-pronunciation UI marker;
- 1000-case local unresolved sampler;
- eSpeak-NG structural runner;
- opt-in-only staging DB builder;
- product sentinel regression tests.

Pending owner-local evidence:

- source-backed DE/EN pronunciation-quality control benchmark;
- any promotion of generated candidate data.
