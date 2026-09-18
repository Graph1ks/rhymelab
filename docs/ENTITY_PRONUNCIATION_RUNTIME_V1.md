# Phase 12A3 — Entity pronunciation and RhymePad runtime v1

Last updated: 2026-09-18

Status: **implemented candidate / owner full-data build pending**

## Scope

Phase 12A3 turns the accepted Phase 12A2 retained cultural-entity set into a local phonetic search channel without changing the frozen German Word Writer or Phrase/Mosaic behavior.

This is the first **German entity pronunciation profile**, not the final multilingual pronunciation pass planned for later phases.

The runtime remains:

- deterministic;
- local-only;
- offline after build;
- provenance-bearing;
- bounded/indexed at query time;
- free of LLM/ML/neural ranking;
- free of runtime network access.

## Accepted popularity input

The Entity catalog materializer is pinned to the owner Hybrid-v2 cut report:

```text
policy
category-relative-popularity-hybrid-v2-geometric-missing-evidence-candidate

semantic fingerprint
337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201

distinct retained entities
1,077,644

membership churn v1 -> v2
0.41%

hard-gate categories v2
none

Bud Spencer / Q221074
KEEP / Tier A
```

The preferred 600k–900k working range remains a nonblocking product-budget target. The accepted v2 population is inside the hard 500k–1.2M envelope.

## Entity catalog materialization

Command:

```powershell
npm run entity:catalog:materialize
```

Inputs:

```text
data/work/entity/wikidata-cultural-stage-v1.sqlite
data/local/entity-cut-hybrid-v2-candidate-report.json
sources/entity/wikidata-entity-taxonomy-v1.json
```

Output:

```text
data/local/rhymelab-entities-v1.sqlite
```

The materializer:

1. validates the accepted Hybrid-v2 fingerprint;
2. recomputes every category ranking from the staged evidence;
3. requires category kept counts and missing-QRank kept counts to match the owner report;
4. requires the recomputed distinct retained count to match 1,077,644;
5. materializes retained entities only;
6. preserves all structural category memberships for a retained entity;
7. preserves per-category score/rank/percentile/tier and whether that category membership itself passed its cut;
8. copies retained DE/EN labels and source aliases;
9. copies whitelisted external IDs;
10. stores raw QRank separately from the Hybrid-v2 derived candidate score.

No pageview value is invented. Unavailable pageview/DE/EN popularity evidence remains nullable.

## Category contract

Entity identity remains many-to-many.

Examples:

```text
person.rapper
person.musician
person.actor
person.director
group.music_group
organization.car_brand
organization.fashion_house
organization.company
work.film
work.video_game
work.album
work.song
fictional.character
```

An entity may be both `person.rapper` and `person.musician`. RhymePad therefore displays and filters category memberships instead of flattening them to one generic ENTITY type.

`primary_category` is a display/default convenience only.

## Pronunciation policy

Policy:

```text
entity-pronunciation-source-composition-v1
```

Analyzer/runtime:

```text
entity-phonetic-runtime-de-v1
de-ipa-v2
```

Command:

```powershell
npm run entity:pronunciation
```

### Source precedence

Existing eligible `de-DE` pronunciation rows are preserved.

For a DE entity name without an eligible pronunciation, v1 may compose a pronunciation only when **every token** resolves exactly against the accepted Writer-v5 pronunciation inventory.

Example concept:

```text
"Der Pate"
  Der  -> accepted Writer-v5 preferred pronunciation
  Pate -> accepted Writer-v5 preferred pronunciation
  => composition eligible
```

If one token is unresolved, the complete entity name remains unresolved.

There is:

- no broad G2P;
- no guessed IPA;
- no spelling-only fallback;
- no partial-token pronunciation;
- no runtime model call.

This is deliberately conservative for proper names.

## Important limitation

Writer-v5 exact-token composition is a bootstrap pronunciation source, not proof that every international proper name is pronounced correctly in German.

The owner full-data report must therefore be reviewed before the Entity channel is treated as complete.

The report records:

- names considered;
- existing eligible pronunciations;
- Writer-v5 exact compositions;
- unresolved names;
- resolution percentage;
- phonetic analysis count;
- rhyme-anchor count;
- top unresolved tokens;
- deterministic semantic fingerprint.

High-value unresolved proper names remain candidates for later source-backed pronunciation enrichment and audited G2P research. They must not receive invented IPA merely to raise coverage.

## Phonetic analysis and retrieval

Every runtime-eligible pronunciation is analyzed with the accepted German analyzer.

Stored fields include:

```text
phonemes
syllables
syllable_count
primary_stress
secondary_stress
stress_pattern
vowel_sequence
consonant_sequence
rhyme_tail
rhyme_signature
```

The additive `entity_rhyme_anchor` index stores bounded lookup keys:

```text
exact_tail
vowel_sequence
vowel_family
final_nucleus_coda
final_nucleus
writer_secondary_anchor
writer_secondary_anchor_context
```

RhymePad never full-scans the Entity catalog at request time.

Candidate scoring reuses the accepted German phonology profile and Writer anchor scorer. The Entity channel has its own internal ordering:

1. phonetic relation tier;
2. phonetic score;
3. syllable distance;
4. selected category percentile;
5. entity popularity evidence;
6. stable surface/QID tie-break.

There is no invented numeric calibration between Word, Phrase/Mosaic and Entity channels.

## RhymePad v14 integration

The checksum-verified RhymePad v14 source remains unchanged.

The existing RhymeLab integration layer adds:

- `Entities only` preset;
- deep-result `Entities` scope;
- semantic Entity category filters;
- Entity result section;
- up to three category badges per result;
- IPA display;
- popularity tier display;
- existing rhyme-relation badges/scores;
- current-lyrics suppression for already-used entity surfaces.

Examples of UI categories:

```text
Rapper
Musician
Actor
Director
Band / group
Song
Album
Film
Game
Character
Car brand
Fashion house
Company
```

If `data/local/rhymelab-entities-v1.sqlite` is absent or its phonetic runtime has not been materialized, the normal Writer and Phrase/Mosaic channels still start and operate unchanged. The Entity channel reports itself unavailable.

## Owner build

After merge:

```powershell
cd D:\rhymelab
git pull
npm run entity:runtime:build
```

This runs:

```text
entity:catalog:materialize
-> entity:pronunciation
```

No QLever fetch, Wikidata restage or QRank restage is required.

Then inspect:

```text
data/local/entity-catalog-v1-report.json
data/local/entity-pronunciation-v1-report.json
```

Only after pronunciation coverage and unresolved-name classes are reviewed should source-backed IPA enrichment or a G2P candidate be designed.

## Acceptance gate

Before this runtime is considered accepted:

1. Entity catalog recomputation must reproduce the accepted Hybrid-v2 cut;
2. Bud Spencer must remain retained through catalog materialization;
3. pronunciation materialization must finish deterministically;
4. a second run must reproduce the same Entity phonetic runtime fingerprint;
5. RhymePad must start both with and without the Entity DB;
6. Rapper/Musician multi-category examples must remain multi-category;
7. no unresolved entity may enter phonetic retrieval;
8. no generated/guessed pronunciation may silently present itself as source-backed;
9. representative artist, work, character and brand results must be inspected;
10. unresolved coverage must be measured before any fallback expansion.

This phase does not change frozen Word Writer or Phrase/Mosaic truth.
