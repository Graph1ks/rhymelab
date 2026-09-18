# German Phrase Mosaic Query Diagnostics v1 — Phase 11D3

Last updated: 2026-09-18

## Purpose

Phase 11D3 evaluates the accepted 11D2 bounded/indexed retrieval layer against representative real Writer queries before any phrase usefulness ranking is introduced.

This phase is **diagnostic only**. It must not tune results to the test suite, mutate the accepted 11D1/11D2 substrates, or introduce phrase-ranking heuristics.

## Accepted source substrate

```text
11D1 window fingerprint
24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac

11D2 retrieval-anchor fingerprint
55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
```

The diagnostic runner refuses to run if either accepted fingerprint is missing or changed.

## Query suite

Default query source:

```text
benchmarks/de-writer-v2/plan.json
```

The existing Writer Page v2 suite is reused rather than inventing a new ad-hoc mosaic query list:

```text
Arbeitsweise
Liebe
Leben
Zeit
Nacht
Feuer
verloren
Gedanken
Freiheit
Musik
Spotify
hitzefrei
```

Each query keeps the existing benchmark `phenomena` labels for interpretation.

The query pronunciation comes from the accepted Writer-v5 database via the existing local-engine `getWord()` resolution path.

## What the report measures

Per query:

- resolved Writer-v5 preferred IPA;
- word syllable count and primary-stress position;
- generated 11D2 query anchors;
- retrieval status/reason;
- raw indexed anchor/window matches;
- unique windows scored;
- returned candidates;
- elapsed retrieval/scoring time;
- primary rhyme-type distribution;
- retrieval-channel distribution;
- query-anchor kind distribution;
- Assonance/Consonance relation distribution;
- modern-eligible vs other rows;
- starts/ends-inside-token counts;
- multi-boundary candidate count;
- top candidate windows with phrase/span/channel/score evidence;
- deterministic semantic fingerprint excluding timings.

Suite-level output includes aggregate distributions and a deterministic semantic fingerprint.

## Explicit no-anchor states

The current accepted mosaic substrate starts at two syllables.

The diagnostic runner distinguishes:

```text
query_below_2_syllable_mosaic_minimum
```

for genuinely one-syllable queries, from:

```text
accepted_rhyme_domain_below_2_syllable_mosaic_minimum
```

for multi-syllable words whose accepted stressed rhyme domain is only one syllable, such as a final-stressed query.

These are diagnostic states, not automatically bugs and not automatically reasons to widen the substrate. Their frequency and product impact must be reviewed before an architecture change.

## Defaults

```text
per-channel SQL limit    128
maximum candidates       512
top candidates stored     20
```

These match the accepted 11D2 retrieval defaults.

## Run

Prerequisites:

```powershell
npm run phrase:mosaic:windows
npm run phrase:mosaic:retrieval
```

Run the full existing Writer v2 query suite:

```powershell
npm run phrase:mosaic:diagnose
```

Report:

```text
data/local/phrase-mosaic-query-diagnostics-v1-report.json
```

One-off query:

```powershell
node --no-warnings scripts/diagnose-de-phrase-mosaic-retrieval.mjs --query Arbeitsweise
```

Multiple explicit queries can be supplied with repeated `--query`.

## Gate before 11E

Review the owner full-data diagnostic report for:

- how many established Writer queries obtain 2–6-syllable mosaic anchors;
- candidate volume per query;
- exact/slant/family mix;
- retrieval-channel contribution;
- whether broad final-nucleus/coda-class retrieval dominates;
- duplicate phrase/window patterns;
- lexical/source-quality problems visible before ranking;
- representative top candidates for `Arbeitsweise` and the rest of the established suite;
- query latency on the owner machine;
- cases where the accepted stressed rhyme domain is too short for the current mosaic substrate.

Only after this evidence is understood should Phase 11E define phrase usefulness/commonness/diversity ranking.

If 11D3 exposes a structural retrieval gap, revise retrieval architecture explicitly before 11E instead of hiding the gap with ranking weights.

## Explicitly deferred

11D3 does not add:

- phrase usefulness scores;
- commonness/register weighting;
- lexical novelty penalties;
- family/template diversity;
- semantic retrieval;
- generated phrase recombination;
- UI/API integration.

The single-word Writer remains frozen.
