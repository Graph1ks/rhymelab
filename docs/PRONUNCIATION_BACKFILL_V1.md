# Pronunciation Backfill V1

Status: **SUPERSEDED — do not use for owner execution**

The V1 collector started from already materialized runtime/accepted databases and therefore missed source rows that had been dropped before materialization because pronunciation could not be resolved. The corrected workflow is `docs/PRONUNCIATION_BACKFILL_V2.md` and uses source/stage → accepted diffs.

Policy: `espeak-then-client-resolver-staging-v1`

## Goal

Build one resumable local staging workset for pronunciation gaps currently represented in the local RhymeLab databases, then process every unique language+surface through the agreed generator chain:

```text
all selected local DB gaps
-> deduplicated workset
-> eSpeak-NG using the existing RhymeLab adapter
-> accepted language analyzer
-> only eSpeak analyzer-rejections:
   client-total-query-pronunciation-v2
-> accepted language analyzer
-> quality classification
-> review/report artifacts
```

This is an **offline owner/build workflow**. It does not put eSpeak-NG into the browser/end-user runtime.

## Default source databases

The default all-scope run requires:

```text
data/local/rhymelab-v5.sqlite
data/local/rhymelab-en-v1.sqlite
data/local/rhymelab-phrases-v1.sqlite
data/local/rhymelab-entities-v1.sqlite
```

The collector records these gap scopes:

- `de_writer_missing_preferred`
  - runtime invariant check for German Writer forms with no preferred pronunciation;
  - this is normally expected to be zero because DB-v5 is already rhyme-ready.
- `en_form_no_analyzed_pronunciation`
  - English DB forms for which no stored pronunciation has `analysis_status='ok'`.
- `phrase_unresolved_token`
  - unique unresolved German phrase tokens from `phrase_token_pronunciation_resolution`.
- `phrase_surface_unresolved`
  - phrase rows with no eligible `phrase_pronunciation`.
- `entity_de_no_source_pronunciation`
- `entity_en_no_source_pronunciation`
  - searchable Entity names with no accepted, non-generated locale-qualified source pronunciation.

Entity rows are included because the owner explicitly requested an all-database backfill run. They remain staging-only and are **not** automatically promoted into the accepted Entity runtime.

## Output artifacts

Default local artifacts:

```text
data/local/pronunciation-backfill-v1.sqlite
data/local/pronunciation-backfill-v1-report.json
data/local/pronunciation-backfill-v1-review.tsv
```

Optional:

```text
data/local/pronunciation-backfill-v1-all.tsv
```

The SQLite work DB is authoritative for resume/checkpoint state. The review TSV contains lower-confidence/generated rows that merit inspection:

- quality C;
- quality D;
- quality U / unresolved.

Use `--export-all` if a full TSV export is wanted.

## Quality classes

Generated rows are deliberately separated from source-backed lexical truth.

```text
A  eSpeak-NG output accepted directly by the accepted analyzer;
   normalized IPA is unchanged.

B  eSpeak-NG output accepted after the existing eSpeak IPA normalization;
   or fully source-backed client composition if such a client result occurs.

C  deterministic client rule output accepted by the language analyzer,
   including rule-based token chains.

D  client grapheme fallback accepted by the analyzer,
   either alone or mixed into a token chain.

U  unresolved after the requested generator chain.
```

A/B/C/D are still generated/staging evidence. The quality tier does not turn a generated pronunciation into canonical lexical truth.

## Resume model

The workflow is resume-first.

The work DB stores:

- one deduplicated `work_item` per `language + normalized surface`;
- every original database membership in `source_ref`;
- per-source collection checkpoint in `scan_state`;
- separate `espeak_status`, `client_status`, and `final_status`;
- per-attempt audit rows;
- the exact source-DB revision snapshot/fingerprint.

Collection commits every bounded batch. eSpeak and client resolution also commit bounded batches.

After interruption or failure, rerun the same command. Already completed source scans and resolution rows are skipped.

If one of the input DB files changed, resume fails closed instead of mixing revisions. Start a new workset explicitly with:

```powershell
npm run pronunciation:backfill -- --reset
```

Use `--retry-errors` to retry rows whose previous stage ended in an unexpected processing error.

Ctrl+C / SIGTERM requests a graceful checkpoint after the current transaction.

## Console progress

Every major phase prints its current scope and progress.

Resolution phases report:

```text
[espeak] 125,000/742,311 (16.84%) · 31.7/s · ETA 5h 24m · accepted=124,612 · rejected=377 · errors=11
```

Collection reports the current database/scope, scanned rows, source refs, and newly deduplicated work items.

Tune progress frequency with:

```powershell
--progress-every 1000
```

Tune checkpoint transaction size with:

```powershell
--commit-every 250
```

## eSpeak-NG

The runner deliberately reuses:

```text
scripts/query-pronunciation-espeak-adapter.mjs
```

Therefore voice selection, IPA normalization, host-executable discovery and analyzer validation remain aligned with the prior successful eSpeak benchmark.

Resolution order is strict:

1. eSpeak-NG;
2. only rows rejected by the accepted analyzer go to the client resolver;
3. the client resolver gets the same source-backed DE/EN Writer-word lookup role used by the browser flow, so exact known tokens and bounded two-part source compositions are preferred before local spelling rules;
4. eSpeak executable/process unavailability is a **workflow failure**, not a reason to silently route the whole workset to the client resolver.

The project does not bundle eSpeak-NG.

Existing command selection remains supported:

```powershell
$env:RHYMELAB_ESPEAK_COMMAND = "C:\path\to\espeak-ng.exe"
npm run pronunciation:backfill
```

or:

```powershell
npm run pronunciation:backfill -- --command "C:\path\to\espeak-ng.exe"
```

## Commands

Full default run:

```powershell
npm run pronunciation:backfill
```

Collection only:

```powershell
npm run pronunciation:backfill:collect
```

Resume the normal full pipeline:

```powershell
npm run pronunciation:backfill
```

Retry unexpected per-item errors:

```powershell
npm run pronunciation:backfill -- --retry-errors
```

Rebuild the workset from scratch:

```powershell
npm run pronunciation:backfill -- --reset
```

Run only selected database families:

```powershell
npm run pronunciation:backfill -- --scopes en,phrases
```

Phases can also be selected explicitly:

```powershell
npm run pronunciation:backfill -- --phase espeak
npm run pronunciation:backfill -- --phase client
npm run pronunciation:backfill:report
```

## Promotion boundary

This workflow does **not** mutate:

- German Writer DB;
- English Writer DB;
- Phrase/Mosaic DB;
- Entity DB.

It creates a separate local staging DB and review exports.

No generated row is automatically promoted into runtime truth. A later explicit promotion/audit phase can decide which quality tiers and source scopes are acceptable for which product databases.
