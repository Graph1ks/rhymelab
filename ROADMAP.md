# RhymeLab Roadmap

Last updated: 2026-09-18

## Phase 0 — German phonology + source pipeline — complete

German IPA/feature models, Leipzig usage ranking, Kaikki resolver, deterministic local shard pipeline and compact pronunciation-backed publish data are implemented.

## Phase 1 — Local runtime/product foundation — current through v0.11

Current product/runtime baseline:

```text
package         v0.11.0
default DB      rhymelab-local-db-v5
writer runtime  materialized-writer-v5-v1
writer ranking  deterministic_writer_utility_v6
```

The previous v0.10.0 / DB-v4 engine remains only as the optional `?ranking=legacy` regression/control path.

## Phase 2 — German blind relation/reference benchmark — complete

`de-human-rhyme-v1`: 367/367 reviewed with accepted ranking NDCG 0.9562 / pairwise 0.8350. This remains the relation/scorer benchmark, not Writer Page human gold.

## Phase 3 — Benchmark-informed German refinement — accepted first pass

Accepted improvements include `de-ipa-v2`, `de-phon-v3`, `rhyme-relations-v2`, curated-modern pronunciation overlay and provenance-aware pronunciation integrity policy.

## Phase 4 — Runtime ranking isolation — accepted legacy control path

The preserved DB-v4 control ranking is `modern_entity_relative_commonness_1decade_0_05`. `?ranking=legacy` remains available for regression/comparison when the v4 control DB exists.

## Phase 5 — Pronunciation coverage + lexical quality — open background work

Continue as background diagnostics: cluster remaining IPA failures, prioritize common-word failures, investigate poor preferred defaults, expand reviewed modern vocabulary/provenance, and add fallback/G2P only if attested coverage proves insufficient.

## Phase 6 — Deterministic writer-oriented single-word search — accepted and promoted

Frozen policies:

```text
writer ranking:       deterministic_writer_utility_v6
right-edge anchor:    de-right-edge-anchors-v1
morphology family:    de-attested-right-head-v4
construction:         de-adverbial-weise-v2
runtime:              materialized-writer-v5-v1
DB schema:            rhymelab-local-db-v5
```

This stack is the normal v0.11 local/UI/API runtime. No LLM/ML/neural inference, hosted ranking or runtime network dependency is allowed in core retrieval/ranking. Writer v7 remains rejected and rolled back.

## Phase 7 — Multi-analysis lexical/morphology model — complete

Publish-v3 / DB-v5 preserves source-supported lexical analyses in `form_analysis`. Real owner data contains 967,931 lexical-analysis rows across 838,209 forms / 904,836 pronunciations.

## Phase 8 — Writer Page Benchmark v2 — structural baseline complete

Frozen validation baseline:

```text
queries                             12 / 12
mean writer elapsed                 1528.8 ms
Top-20 exact duplicates             0
Top-20 near duplicates              0
Top-20 same-lemma rows              0
Top-20 repeated family rows         0
Top-20 unranked rows                1
Top-20 usage rank >100k rows        25
Top-20 usage rank >250k rows        1
Top-20 explicit rare/historical     0
preferred pronunciation rows        240 / 240
legacy tier-0 retention             685 / 685
```

`Arbeitsweise -> Hochzeitsreise` is a retrieval sentinel with `max_rank: 250`, not a Top-20 surfacing guard. `Arbeitsweise -> right:reise` is the family surfacing gate.

Writer NDCG@10/20 is deliberately deferred until the German Writer system is feature-complete enough for coherent independent human evaluation. The project owner is not treated as an independent human-reference source.

## Phase 9 — Legacy invariance + materialized Writer runtime — complete

### 9A. Accepted legacy control-path invariance — PASS

27/27 queries; zero runtime candidate, runtime policy, or protected-order mismatches.

### 9B. Multi-analysis publish/storage — PASS

Publish-v3 / DB-v5 builder migration and owner build complete.

### 9C. Compact right-edge + morphology materialization — PASS

```text
DB-v5 final                         819.77 MiB
writer_anchor                        60.43 MiB
writer_morphology_evidence           32.13 MiB
anchor rows                      3,153,639
positive morphology rows          325,724
freelist pages                           0
```

### 9D. Retrieval/morphology equivalence — PASS

```text
queries                             12 / 12
retrieval mismatch queries          0
morphology regressions              10 / 10 pass
old LIKE retrieval total            843.016 ms
indexed retrieval total              59.694 ms
retrieval-only speedup                14.12x
```

### 9E. Materialized runtime structural gate — PASS

Runtime `materialized-writer-v5-v1` uses compact indexed anchors and materialized multi-analysis morphology. Runtime contract 12/12, page regressions pass, morphology regressions pass, legacy Tier-0 retention 685/685.

### 9F. Prefix-stable runtime performance gate — PASS

```text
mean writer elapsed                 1103.9 ms
frozen validation mean              1528.8 ms
mean improvement                     27.8%
Arbeitsweise                         3021.8 ms
previous Arbeitsweise                7105.7 ms
Arbeitsweise improvement              57.5%
```

No score, tier, ranking, morphology, or diversity policy changed. Prefix-stability is protected by test.

### 9G. Deterministic runtime repeatability — PASS

Three independent DB opens produced identical complete semantic `findWriterRhymes()` per-query and suite fingerprints across all 12 frozen queries; mismatch count 0.

## Phase 10 — German single-word Writer acceptance + runtime promotion — complete / PASS

Acceptance report: `docs/WRITER_SEARCH_ACCEPTANCE.md`.

The deterministic German single-word Writer architecture is accepted, frozen, and promoted to the normal RhymeLab v0.11 runtime.

```text
normal runtime       Writer v5
legacy control       DB-v4 via ?ranking=legacy
human Writer NDCG    deferred / pending_reference
```

Future single-word Writer changes must preserve or explicitly supersede the frozen evidence with a new benchmarked candidate.

## Phase 11 — German phrase / mosaic / phraseology — current

Execution plan: `docs/PHRASE_MOSAIC_PLAN.md`. Source decision: `docs/PHRASE_SOURCE_SURVEY.md`.

### 11A. Public phraseology source survey — complete

The source/licensing gate is complete. The selected architecture is layered:

- German Wiktionary via raw Kaikki/Wiktextract for source-backed phraseology;
- existing Leipzig News/Web/Wikipedia corpora for deterministic phrase attestation/commonness;
- Tatoeba conditionally for sentence/fragment diversity once contributor attribution is preserved;
- Wikidata/OpenThesaurus/OdeNet as optional semantic support;
- ParlaMint-AT as later domain/register enrichment;
- non-commercial/restricted or insufficiently pinned resources remain research-only.

No universal phrase database was selected, and no giant new source download is required for the first implementation milestone.

### 11B1. Provenance-bearing phrase catalog — fixture implementation complete

Milestone ID:

`PHASE_11B1_PROVENANCE_PHRASE_CATALOG`

Build a separate phrase source/snapshot/catalog layer with:

- source/license/snapshot/checksum provenance;
- phrase canonical/normalized identity;
- source attestations and source-backed phrase types/tags;
- deterministic token boundaries and unresolved-token state;
- separate corpus usage/commonness evidence;
- optional semantic links;
- deterministic build fingerprints and idempotency tests.

First ingestion work is fixture-scale raw German Wiktextract phrase records plus Leipzig phrase/commonness evidence over existing source fixtures.

11B1 explicitly excludes phrase pronunciation, connected-speech rules, mosaic runtime/indexing, phrase ranking, UI/API surfacing, large new downloads and Human Writer NDCG.

Phase 11B1 now implements `rhymelab-phrase-catalog-v1`, source/snapshot/license provenance, raw Wiktextract phrase ingestion, deterministic token boundaries, historical/current eligibility, Leipzig exact-token commonness evidence and deterministic fingerprints. The repository fixture gate passes.

The owner-local full source build is now complete: 98,504 phrases / 97,400 modern-eligible phrases in a 153.74 MiB SQLite catalog, fingerprint `f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d`.

### 11B2. Modern register evidence + full-catalog diagnostics — diagnostics complete

Add small, legally clear register sensors without turning them into general-frequency truth.

- Cologne Kiezdeutsch 2025 v2: selected, CC BY 4.0, transcript-only bootstrap (~970 KiB; audio excluded), youth/urban/spoken register evidence only.
- add full phrase diagnostics for type/token/history/Leipzig 1/2/3-corpus coverage, top commonness and anomaly samples;
- require review of Cologne extraction/matches;
- require one independent repeat full build with equal semantic fingerprint.

Owner gate:

```powershell
npm run phrase:register:cologne:bootstrap
npm run phrase:catalog:diagnose
```

### 11C. Deterministic phrase pronunciation — current

#### 11C1. Preferred citation composition — complete / PASS

Contract: `docs/PHRASE_PRONUNCIATION_V1.md`.

- exact normalized phrase-token resolution against accepted Writer-v5 preferred eligible pronunciations;
- no G2P fallback and no guessed IPA;
- one `citation_preferred` phrase pronunciation per fully resolved phrase;
- explicit word-boundary coordinates across the continuous phoneme/syllable stream;
- all citation primary/secondary stress positions retained without inventing sentence prosody;
- per-token Writer form/pronunciation provenance and phoneme/syllable spans;
- token alternate counts retained but no Cartesian phrase-variant expansion;
- no generated connected speech in 11C1;
- base phrase catalog fingerprint must remain unchanged;
- deterministic pronunciation fingerprint required on repeat.

Owner gate:

```powershell
npm run phrase:pronunciation
npm run dev
```

Review `data/local/phrase-pronunciation-v1-report.json` and the `/phrases` IPA surface before 11D.

Confirmed owner full-data evidence:

```text
pronunciation fingerprint   fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
token coverage              94.92% (195,490 / 205,957)
phrase coverage             91.46% (90,089 / 98,504)
ready modern phrases        89,865
unresolved tokens           10,467
base catalog unchanged      yes
```

Coverage triage is now complete:

```text
modern phrase coverage       92.26%
blocked modern phrases        7,535
distinct unresolved forms     5,894
Top-1 unlock                    317 modern phrases
Top-20 unlock                   624
Top-100 unlock                1,036
Top-250 unlock                1,532
```

The tail is not concentrated enough to justify a blocking manual 11C2 pronunciation campaign. `zurecht` is a notable high-impact lexical gap, but the ranked tail quickly mixes useful German with abbreviations, numerals, names/foreign material, specialist vocabulary and historical forms.

**Decision:** proceed directly to 11D after the remaining repeatability check. Any 11C2 lexical additions are optional background work, source-backed only, with no broad G2P fallback and no mutation of the frozen Writer-v5 runtime.

Repeatability gate: **PASS**.

```text
first fingerprint   fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
repeat fingerprint  fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
```

Phase 11C1 is closed.
### 11D. Mosaic retrieval architecture — accepted / frozen

#### 11D1. Deterministic cross-word window substrate — COMPLETE / PASS

Contract: `docs/PHRASE_MOSAIC_RETRIEVAL_V1.md`.

Materialize 2–6-syllable phrase windows that strictly cross at least one accepted word boundary. Persist syllable/phoneme/token spans, boundary offsets, exact phoneme/vowel keys and deterministic fingerprints with indexed SQLite lookup.

Owner gate:

```powershell
npm run phrase:mosaic:windows
```

First owner full-data build:

```text
pronunciations scanned   90,089
phrases with windows     90,089
windows                 356,693
SQLite                  510.09 MiB
window fingerprint
24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
```

Window lengths are concentrated at 2–4 syllables; 327,828 windows cross one boundary and the remainder provide bounded multi-boundary coverage up to five boundaries.

Repeatability: **PASS**.

```text
first   24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
repeat  24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
```

11D1 is accepted/frozen.

#### 11D2. Bounded indexed candidate retrieval — COMPLETE / PASS

Contract: `docs/PHRASE_MOSAIC_RETRIEVAL_V2.md`.

Fixture CI gate: **PASS** (`validate`, run 248).

Implemented at fixture level:

- additive rhyme-domain anchor rows over immutable 11D1 windows;
- exact-tail index consistent with `de-phon-v3` first-onset exclusion;
- full-vowel + exact-coda index;
- full-vowel index;
- final-nucleus + coarse-coda-class index with ±1-syllable candidate length;
- hard per-channel and final candidate limits;
- existing German scorer reused after bounded retrieval;
- `EXPLAIN QUERY PLAN` tests reject full-table scans.

First owner full-data anchor build:

```text
anchor rows                 356,693
distinct exact-tail keys    181,548
distinct vowel keys          52,174
distinct final keys              772
SQLite                     686.76 MiB
anchor fingerprint
55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
```

Repeatability: **PASS**.

```text
first   55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
repeat  55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
```

11D2 is accepted/frozen.

#### 11D3. Representative full-data query diagnostics — COMPLETE / REVISION SIGNAL

Fixture CI gate: **PASS** (`validate`, run 253).

Run the accepted retrieval stack against the existing Writer Page v2 query suite before defining phrase ranking.

Measure query-anchor coverage, bounded candidate volume, exact/slant/family mix, retrieval-channel contribution, duplicates/window multiplicity, representative top candidates and owner-machine latency. Explicitly expose queries whose accepted stressed rhyme domain falls below the current two-syllable mosaic minimum.

Owner result:

```text
9/12 queries with anchors
1,771 returned candidates
989 weak (55.84%)
1,280 final-nucleus/coda-class channel assignments
mean 33.6 ms
```

The diagnostic did reveal structural retrieval gaps. Do not compensate with 11E ranking weights.

Contract: `docs/PHRASE_MOSAIC_QUERY_DIAGNOSTICS_V1.md`.

#### 11D4. Mosaic query-domain + candidate-quality revision — ACCEPTED / FROZEN

Fixture CI gate: **PASS** (`validate`, run 261).

Candidate implementation now exists at fixture level:

- additive full-surface query domain;
- additive indexed vowel-family/coda-class bridge;
- default weak/no-relation phonetic gate;
- same-process accepted-baseline vs candidate diagnostics.

Required next gate: CI, then owner full-data A/B over the unchanged 12-query suite. The accepted 11D3 semantic fingerprint must reproduce exactly before candidate deltas are trusted.

Preserve the accepted 11D1 window and 11D2 retrieval-anchor fingerprints as frozen controls.

Additive goals:

- include a full-surface 2–6-syllable query domain when it is distinct from the stressed-tail domain, so final-stressed multi-syllable words such as `Musik` can participate in mosaic retrieval;
- add a deterministic vowel-family bridge channel between exact full-vowel retrieval and the broad final-nucleus/coda-class fallback;
- after scoring, suppress `weak` candidates that match no independent sound relation by default;
- rerun the same 12-query diagnostic suite and compare coverage, weak-share, channel dependence, latency and existing strong examples before 11E.

No phrase usefulness/commonness/diversity ranking belongs in 11D4.

Owner A/B quality gate passed:

```text
candidate anchor fp          9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059
candidate semantic fp        4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd
query coverage              9/12 -> 10/12
weak share                 55.84% -> 3.40%
final fallback share       65.98% -> 31.01%
vowel-family assignments  375
latency                     31.0 -> 35.9 ms
```

Repeatability: **PASS**. Both owner runs produced the same candidate anchor fingerprint `9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059` and candidate semantic fingerprint `4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd`, with identical semantic counts.

11D retrieval is frozen. 11E is now current.

### 11E. Phrase Writer ranking — current

Create a separate benchmarked phrase-ranking policy. Do not mutate the frozen single-word Writer policy in place.

**11E1 owner evidence is complete.** Across 1,237 candidates, only 312 (25.22%) have Leipzig evidence, 1,219 (98.54%) are surface-safe, 4 (0.32%) are marked, and query-token overlap is zero. This makes commonness a bounded bonus and surface safety a sparse demotion signal.

**11E2-v1 owner A/B is complete and v1 is rejected for promotion.** Surface-safety behavior works, but commonness over-pulls lower-phonetic rows: 48 Leipzig-backed raw Top-20 rows become 100 after ranking, and multiple queries change to materially weaker phonetic tops.

**11E2-v2 is current.** Keep v1 as a deterministic control. Add a conservative 0.02 phonetic near-tie band inside the same safety/relation class, and separate Writer-page eligibility so `weak` and restricted rows remain inspectable without filling the default page.

### 11F. Phrase/mosaic benchmark

Build dedicated structural, regression, lexical-safety, provenance, performance, and repeatability gates. Human usefulness NDCG comes only when the combined German Writer system is mature and independent reviewers exist.

### 11G. Retrieval-first natural-language generation research — deferred

Preserve the design in `docs/FUTURE_NATURAL_LANGUAGE_RHYME_RETRIEVAL.md`.

Only after phrase pronunciation, deterministic mosaic retrieval and phrase ranking are stable, evaluate:

- corpus-derived attested 2–6-token chunks;
- cross-word phonetic windows as retrieval substrate;
- explicit naturalness/register/context features;
- feature-aware slant-rhyme distance;
- deterministic Markov/template/phrase-splice recombination over retrieved natural chunks;
- optional/non-core semantic/vector experiments only after an explicit architecture decision.

The intended direction is retrieval first, generation second. Do not replace deterministic rhyme truth with a generator.

## Phase 12 — English profile + benchmark

Only after the German Writer path, including phrase/mosaic work, is stable enough to freeze.

## Phase 13 — Cross-language rhyme

Only after German and English are individually strong.

## Hosted runtime

Not part of the current roadmap. Core search remains locally executable for desktop, web packaging and later mobile use.

### 11B3. Local Phrase Explorer — implemented

- expose phrase/source/Leipzig/pronunciation and optional generic register evidence through a local read-only `/phrases` explorer;
- keep the phrase DB optional for Writer startup and keep Writer v6/v5 frozen;

Owner gate:

```powershell
npm run phrase:catalog:diagnose
npm run dev
```

