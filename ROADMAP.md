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

#### 11C1. Preferred citation composition — implemented / owner full-data gate pending

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

### 11D. Mosaic retrieval architecture

Add deterministic indexed phrase-span retrieval capable of matching rhyme spans across one or more word boundaries without scanning the full phrase corpus at query time.

### 11E. Phrase Writer ranking

Create a separate benchmarked phrase-ranking policy. Do not mutate the frozen single-word Writer policy in place.

### 11F. Phrase/mosaic benchmark

Build dedicated structural, regression, lexical-safety, provenance, performance, and repeatability gates. Human usefulness NDCG comes only when the combined German Writer system is mature and independent reviewers exist.

## Phase 12 — English profile + benchmark

Only after the German Writer path, including phrase/mosaic work, is stable enough to freeze.

## Phase 13 — Cross-language rhyme

Only after German and English are individually strong.

## Hosted runtime

Not part of the current roadmap. Core search remains locally executable for desktop, web packaging and later mobile use.

### 11B3. Local Phrase Explorer — implemented

- expose phrase/source/Leipzig/pronunciation and optional generic register evidence through a local read-only `/phrases` explorer;
- keep the phrase DB optional for Writer startup and keep Writer v6/v5 frozen;
- RUEG was evaluated and removed because its learner/register utterances do not provide enough direct phraseology/metaphor/idiom value for this project.

Owner gate:

```powershell
npm run phrase:catalog:diagnose
npm run dev
```

