# React Studio R6 — Analysis + Perform

Status: **AUTOMATED VERIFIED / browser + physical Web Audio acceptance deferred**

Tested functional code head: `48600af0221c5d9429813e697b381af3a794383e`

R6 ports the existing Studio V2 Analysis and Perform workflows into the React Studio without changing the accepted analysis endpoint, performance-session semantics, document authority, backend, or shipping Studio V2 implementation.

## Hard boundary

R6 is a frontend orchestration port.

It does **not**:

- replace `src/studio/analysis-adapter.mjs`;
- replace `src/studio/performance-session.mjs`;
- introduce a second analysis algorithm;
- introduce a React-owned performance document;
- change the DocumentStore schema;
- change Writer / Serving-v1 semantics;
- change the shipping `src/studio/*` implementation;
- claim real-device Web Audio acceptance from automated tests.

The existing R1 bridges remain the semantic boundary:

```text
React Analysis
  -> TanStack Query
  -> R1 services bridge
  -> existing analysis-adapter.mjs
  -> existing local API / Writer runtime

React Perform
  -> R5 EditorSessionProvider mutation/history boundary
  -> R1 editor bridge
  -> existing performance-session.mjs
  -> R4 DocumentWorkspaceProvider
  -> existing DocumentStore
  -> IndexedDB
```

## Analysis

React now exposes both Studio V2 analysis scopes.

### End-rhyme analysis

The end-rhyme surface uses the existing canonical Writer analysis path and presents:

- canonical rhyme scheme;
- Bar-by-Bar end words;
- primary and soft rhyme relations;
- Word Laboratory IPA and stress data;
- stress fingerprint;
- optional rhyme-chain grouping;
- DE / EN / Cross DE+EN analysis basis;
- relation filtering;
- Writer-anchor handoff from analysis terms;
- live Bar Inspector.

The canonical query identity includes:

- active song ID;
- stable Bar IDs and Bar revisions;
- query/analysis language basis;
- generated/generated-only state;
- query-pronunciation revision;
- selected runtime database.

A changed Bar revision therefore invalidates the canonical query identity instead of silently reusing stale analysis.

### All-rhymes analysis

The all-word surface calls the existing `analyzeAll()` route and projects the returned occurrence relations into:

- whole-document primary/soft counts;
- relation counts by rhyme type;
- per-Section relation summaries;
- per-Bar relation summaries;
- per-word relation highlighting;
- Writer-anchor handoff from individual analyzed words.

No second client-side rhyme classifier was added. React only groups and presents the relations returned by the existing adapter.

### Tracked/free-line behavior

Analysis keeps the editor contract:

- blank rows are not tracked;
- fully bracketed rows such as `[Verse 2]` are not Bars;
- bracket rows label Sections;
- blank rows split unnamed Sections;
- inline `[...]` metadata is removed from tracked lyric text;
- stable Bar IDs remain the identity used across editor, analysis and performance.

### Canonical vs approximate metrics

The UI explicitly separates canonical Writer data from local assistance.

Canonical:

- rhyme scheme;
- rhyme relations;
- IPA;
- stress / pronunciation details.

Local approximation:

- syllable estimates;
- Bar density;
- syllables per second;
- estimated verse duration.

The local values remain marked with `≈` / `LOCAL` and are not presented as canonical phonetic measurements.

## Bar Inspector

The React Bar Inspector combines already-existing sources rather than creating a new metric engine.

It presents:

- local word count;
- local syllable estimate;
- Bar duration;
- syllables / second estimate;
- cue count;
- pocket / off-beat share;
- breath load;
- previous-Bar shared placements;
- canonical IPA;
- canonical stress;
- canonical rhyme relation;
- existing performance flow fingerprint.

## Perform

React Perform uses the existing performance-session API through the R1 bridge.

### Stable cue model

Cue anchors remain stable Bar IDs.

Supported cue operations:

- Hit;
- Accent;
- Pause;
- Breath;
- Hold;
- Erase.

A cue remains attached to its Bar ID across Bar reorder. If the Bar text revision changes after cue mapping, `performanceNeedsReview()` marks the timing stale rather than silently moving or accepting it.

### Timing controls

Existing configuration semantics are retained:

- BPM: 40–220;
- grid: 8 or 16;
- feel: Straight or Triplet;
- tempo scale: 0.5× / 1× / 2×;
- pause length: 1–4 steps.

All duration calculations use the existing `performanceStepDurationMs()` / `performanceBarDurationMs()` functions.

### Cue movement

React supports both:

- accessible source → target cue movement;
- desktop drag-and-drop movement.

Both call the same existing `movePerformanceCue()` function.

### Auto-Map

Auto-Map remains the existing deterministic helper:

```text
local syllable estimate
      ->
autoMapPerformanceBar()
      ->
stable Bar-ID cue placements
```

It remains explicitly approximate and does not become a canonical phonetic feature.

### Performance insights

The React surface exposes the existing derived metrics:

- Bar duration;
- syllables / second approximation;
- on/off-beat pocket;
- breath load;
- flow fingerprint;
- previous-Bar placement overlap.

### Metronome

The React metronome:

- creates/resumes Web Audio only from an explicit user action;
- uses the current existing performance config;
- schedules each pulse with `performanceStepDurationMs()`;
- distinguishes quarter pulses and explicit Hit/Accent cues;
- stops when Bar or timing configuration changes.

Source-level and automated behavior is ported, but physical browser Web Audio timing/resume acceptance remains an R7 gate.

## R5 / R4 integration

R6 Perform mutations do not bypass editor history.

`EditorSessionProvider.mutateActiveSong()` provides the shared mutation boundary:

1. capture an R5 undo checkpoint;
2. mutate the current authoritative UI working copy through existing R1 functions;
3. touch the active song;
4. schedule the existing R5 revision boundary;
5. flow into R4 serialized persistence.

No second history stack or performance persistence path was introduced.

Analysis remains read-only with respect to the document.

## Parity movement

The following 16 rows move from `pending` to `ported`:

### Analysis

- `analysis.scheme`
- `analysis.all-rhymes`
- `analysis.relations`
- `analysis.word-lab`
- `analysis.stress`
- `analysis.chain`
- `analysis.languages`
- `analysis.bar-inspector`
- `analysis.verse-totals`

### Perform

- `perform.cues`
- `perform.move`
- `perform.pause-length`
- `perform.grid`
- `perform.automap`
- `perform.stable-cues`
- `perform.metronome`

Current 93-row inventory:

```text
ported       82
in_progress   5
pending       6
verified      0
total        93
```

Nothing is promoted to `verified` without the required browser/device evidence.

## Automated verification

Functional code head `48600af…`:

```text
Parity inventory                     PASS
Strict TypeScript                    PASS
R1 legacy parity            13       PASS
R2 shell                    12       PASS
R3 Search / Writer          11       PASS
R4 Library                  12       PASS
R5 Editor                   10       PASS
R6 Analysis / Perform       11       PASS
Parity coverage              2       PASS
                              ──
Total                        71 / 71 PASS
Vite 8.3 production build             PASS
```

GitHub Actions on the same functional code head:

```text
React Studio Replatform #152          PASS
Studio V2 Gate #470                   PASS
RhymeLab CI #1335                     PASS
```

Focused gate:

```bash
npm run studio:react:r6
```

## Safety diff from R5

R6 functional implementation changes:

- shipping `src/studio/*`: **0**
- backend / Serving-v1: **0**
- `apps/studio-react/src/legacy/*`: **0**
- IndexedDB schema: **0**

The only root-level functional change is the focused `studio:react:r6` verification command.

## Deferred to R7

R7 owns the final automated + real-device parity evidence, including:

- browser-level interaction evidence for all ported rows;
- physical IME acceptance;
- physical Web Audio metronome acceptance;
- mobile VisualViewport / keyboard acceptance;
- touch target acceptance;
- no-hover acceptance;
- single-drawer scroll acceptance;
- diagnostics/startup/cutover/reversible-route system rows;
- conversion from `ported` / `in_progress` / `pending` to `verified` only where evidence is complete.

R8 reversible cutover remains blocked until every mandatory row is verified.
