# German Phrase Mosaic Retrieval Candidate v2 — Phase 11D4

Last updated: 2026-09-18

## Purpose

Phase 11D4 is an **additive candidate revision** over the accepted Phase 11D1/11D2 substrate.

It exists because the first owner full-data 11D3 diagnostic showed two structural retrieval problems before phrase ranking:

1. the broad `final_nucleus_coda_class` fallback dominated aggregate channel assignments and more than half of returned candidates were phonologically `weak`;
2. a multi-syllable final-stressed query such as `Musik` received no mosaic query anchor because the reused single-word stressed rhyme domain was only one syllable.

11D4 must solve those retrieval problems without modifying accepted single-word Writer ranking and without hiding them behind phrase usefulness weights.

## Frozen controls

These fingerprints remain authoritative controls:

```text
11D1 window fingerprint
24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac

11D2 retrieval-anchor fingerprint
55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae

11D3 owner diagnostic semantic fingerprint
294a26d670e0202a0b5171d51c16d6059eff3f03620dd5b57369a04b4a87625c
```

The 11D4 candidate build fails if the accepted 11D2 anchor fingerprint is absent or changed.

## Candidate policy

```text
schema          rhymelab-phrase-mosaic-retrieval-v2-candidate
retrieval       de-bounded-indexed-mosaic-retrieval-v2-candidate
family policy   de-mosaic-vowel-family-bridge-v1
scorer          existing de-phon-v3 mechanics
phrase ranking  none
```

## Additive storage

11D4 does **not** alter `phrase_mosaic_retrieval_anchor`.

It adds:

```text
phrase_mosaic_retrieval_v2_anchor
```

with exactly one optional candidate-support row per accepted 11D2 window:

- window id;
- deterministic vowel-family sequence;
- final coarse coda class;
- syllable count;
- row fingerprint.

Index:

```text
idx_phrase_mosaic_retrieval_v2_family_coda
(vowel_family_key, final_coda_class, syllable_count, window_id)
```

The accepted 11D2 semantic fingerprint is recomputed after materialization and must remain identical.

## Query domains

11D4 keeps the accepted primary/secondary stressed-tail domains.

It additionally adds a **full_surface** domain when:

- the query has 2–6 syllables; and
- the full-surface domain is not already semantically identical to an existing stressed-tail domain.

The full-surface domain uses all query syllables while preserving their stress levels. As with the accepted rhyme-domain mechanics, the onset of the first compared syllable is not part of the rhyme tail.

This means:

- `Arbeitsweise`, whose accepted primary domain already spans the full word, does not receive a redundant copy;
- `Musik`, whose stressed tail is one syllable but whose full surface is two syllables, gains a legitimate two-syllable mosaic domain;
- genuinely monosyllabic queries such as `Zeit` and `Nacht` remain outside the current 2+-syllable mosaic-query model.

## Candidate channels

For every eligible query domain:

1. `exact_tail`;
2. `vowel_coda`;
3. `vowel`;
4. `vowel_family_coda_class` — new 11D4 bridge;
5. `final_nucleus_coda_class`.

The first three and final fallback continue to use the accepted 11D2 table. Only the vowel-family bridge uses the additive 11D4 table.

All SQL retrieval remains bounded and index-backed.

## Vowel-family bridge

The bridge reuses the deterministic German vowel-family mapping already present in the German IPA analyzer rather than introducing a new learned or opaque similarity model.

Examples of existing families include long/short members that share a family, such as:

```text
e / eː -> E_CLOSE
```

The channel requires:

- equal vowel-family sequence;
- equal final coarse coda class;
- equal syllable count.

It therefore sits structurally between strict exact-vowel retrieval and the much broader final-nucleus/coda-class fallback.

## Default phonetic gate

11D3 returned 989 `weak` candidates out of 1,771 total.

11D4 changes the default returned candidate pool:

```text
keep if primary type != weak
OR at least one independent sound relation matches
```

Therefore a candidate classified `weak` with neither Assonance nor Consonance is scored for diagnostics but is not forwarded by default.

This is a **phonetic validity gate**, not Writer ranking. It uses only the accepted scorer/relation outputs.

For control diagnostics, callers can set:

```text
includeWeakUnrelated=true
```

## Build

Prerequisites:

```powershell
npm run phrase:mosaic:windows
npm run phrase:mosaic:retrieval
```

Build the additive 11D4 candidate anchors:

```powershell
npm run phrase:mosaic:retrieval:v2
```

Report:

```text
data/local/phrase-mosaic-retrieval-v2-candidate-report.json
```

## A/B owner diagnostic

Run:

```powershell
npm run phrase:mosaic:diagnose:v2
```

The runner executes the accepted 11D3 baseline and 11D4 candidate against the same Writer-v2 12-query suite in one process.

For the full default suite it requires the baseline semantic fingerprint to remain exactly:

```text
294a26d670e0202a0b5171d51c16d6059eff3f03620dd5b57369a04b4a87625c
```

Candidate comparison report:

```text
data/local/phrase-mosaic-query-diagnostics-v2-candidate-report.json
```

The report compares:

- queries with/without mosaic domains;
- no-anchor query names;
- queries using `full_surface`;
- returned candidate count;
- weak candidate count/share;
- number of weak/no-relation rows filtered;
- final-fallback assignment count/share;
- vowel-family bridge contribution;
- owner-machine latency;
- per-query candidate deltas and top result evidence;
- deterministic candidate semantic fingerprint.

## Acceptance questions

11D4 is not accepted merely because aggregate numbers move.

Review must answer:

1. Does `Musik` gain a full-surface mosaic domain while `Zeit` and `Nacht` remain correctly unsupported?
2. Does the weak/no-relation share materially decrease without removing the known strong `Arbeitsweise`, `Liebe`, `Freiheit`, and `hitzefrei` behavior?
3. Does the vowel-family bridge contribute meaningful candidates rather than simply duplicating exact-vowel rows?
4. Does dependence on the broad final fallback decrease in the **returned** pool?
5. Does query latency remain acceptable on the owner machine?
6. Does the accepted 11D3 baseline fingerprint remain exact during A/B execution?

If the answer is no, reject/iterate 11D4. Do not compensate with phrase-ranking weights.

## First owner full-data A/B evidence

The quality gate passed on the first owner full-data run:

```text
candidate anchor fingerprint     9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059
candidate semantic fingerprint   4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd
accepted baseline reproduced     yes
queries with anchors             9 -> 10
returned candidates             1771 -> 1237
weak candidates                 989 -> 42
weak share                      55.84% -> 3.40%
weak/unrelated rows filtered    833
final fallback assignments      1280 -> 575
final fallback share            65.98% -> 31.01%
vowel-family assignments        375
mean elapsed                    31.0 -> 35.9 ms
```

Acceptance-question review:

1. **PASS** — `Musik` gains `full_surface`; `Zeit` and `Nacht` remain unsupported.
2. **PASS** — weak share drops materially while the known strong tops remain intact.
3. **PASS** — the family bridge contributes nonduplicate retrieval; e.g. `Arbeitsweise -> nahm beiseite` is retrieved through `vowel_family_coda_class` alone.
4. **PASS** — final-fallback dependence in the returned pool is substantially lower.
5. **PASS** — owner mean latency increases by only 4.9 ms.
6. **PASS** — the accepted 11D3 baseline semantic fingerprint reproduces exactly.

Product-quality observation: results such as `Musik -> K.-o.-Siegen` are evidence that phrase lexical/commonness/usefulness ranking is still necessary; they are not evidence that the cross-word phonetic retrieval layer failed.

## Repeatability acceptance

The second owner run reproduced the first deterministic state exactly:

```text
candidate anchor fingerprint   9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059
candidate semantic fingerprint 4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd
database bytes                 837,390,336
anchors                        356,693
distinct family+coda keys      66,904
returned candidates            1,237
weak candidates                42
final fallback assignments     575
vowel-family assignments       375
```

Owner mean latency was 35.9 ms in the first run and 37.6 ms in the repeat. Timing is machine-state evidence only and is excluded from semantic fingerprints.

**Decision: Phase 11D4 accepted and frozen. Phase 11E may consume this retrieval output as its fixed input.**
## Explicitly deferred

Still not part of 11D4:

- phrase commonness/usefulness ranking;
- register weighting;
- lexical novelty;
- duplicate/template diversity;
- semantic/vector retrieval;
- generated phrase recombination;
- UI/API integration.

Phase 11E is now unblocked; retrieval remains frozen while phrase ranking is developed.
