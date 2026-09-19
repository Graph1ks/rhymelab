# Pronunciation Backfill V2 — Source → Accepted Diff

Status: **implemented; owner execution pending**

Policy: `source-diff-espeak-then-client-resolver-staging-v2`

V2 supersedes `docs/PRONUNCIATION_BACKFILL_V1.md`.

## Why V2 exists

V1 incorrectly started from already materialized/accepted runtime databases. That can only find pronunciation gaps that are still represented inside those databases. It cannot recover lexical/source rows that were dropped before runtime materialization because they had no accepted pronunciation.

V2 fixes the population boundary:

```text
original/pre-publish source inventory
        ↓
compare with accepted pronunciation inventory
        ↓
source rows missing accepted pronunciation
        ↓
deduplicate language + normalized surface
        ↓
eSpeak-NG
        ↓
accepted DE/EN analyzer
        ↓ rejected only
client-total-query-pronunciation-v2
        ↓
accepted DE/EN analyzer
        ↓
A/B/C/D/U quality staging
```

The accepted DBs are now the **right-hand side of the diff**, not the population being scanned.

## Source populations

### German words

The owner-local inventory showed that the old `data/de/core/` stage is not present locally, while the two actual source inventories needed to reconstruct it are present:

1. `data/de/usage/de-usage.tsv`
   - merged German usage-source universe used by the DE core build;
   - catches usage-ranked forms that never acquired an accepted pronunciation.
2. `data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz`
   - original German Kaikki/Wiktextract snapshot;
   - provides dictionary headwords plus listed/inflected forms independently of pronunciation success.

Both are compared against `data/local/rhymelab-v5.sqlite`.

Scopes:

```text
de_usage_source_minus_accepted
de_wiktionary_headword_source_minus_accepted
de_listed_form_source_minus_accepted
```

### English words

The original English Kaikki/Wiktextract source is streamed directly using the pinned source registry:

```text
sources/en/phase12b-sources-v1.json
data/raw/en/phase12b-20260918/enwiktionary-kaikki-20260916.jsonl.gz
```

Headwords and listed forms are passed through the **same pronunciation-independent lexical candidate functions used by the English publish build** (`lexicalEvidenceForHeadword` / `lexicalEvidenceForListedForms`) and then compared against accepted analyzed en-US pronunciation rows in `data/local/rhymelab-en-v1.sqlite`.

This avoids treating every arbitrary form in the 2.70 GiB Wiktextract file as a Writer candidate while still recovering lexical candidates that were excluded only because no accepted pronunciation materialized.

CMUdict, SCOWL/ESDB and wordfreq remain auxiliary pronunciation/lexical/usage evidence exactly as in the existing English build; they do not independently create the pronunciation-missing candidate universe here.

Scope:

```text
en_wiktionary_lexical_source_minus_accepted
```

### German Phrase/Mosaic

The Phrase catalog already is the source-stage inventory; it was not created by filtering to pronunciation-ready rows. Therefore its existing diff is valid:

```text
phrase_unresolved_token
phrase_surface_unresolved
```

Source/accepted comparison happens inside `data/local/rhymelab-phrases-v1.sqlite` between the catalog/token inventory and the pronunciation tables.

### Entities

The retained Entity catalog is also the pronunciation source population: the Hybrid-v2 popularity cut happened before pronunciation and is an intentional relevance/product cut, not a pronunciation filter.

Therefore V2 scans every searchable retained DE/EN Entity name and compares it with accepted non-generated locale-qualified Entity pronunciation rows:

```text
entity_de_no_source_pronunciation
entity_en_no_source_pronunciation
```

The pre-Hybrid popularity-rejected Entity population is deliberately not resurrected by pronunciation backfill.

## Default local inputs

These defaults now match the owner-local inventory:

```text
data/de/usage/de-usage.tsv
data/work/de-rhyme-core-v1/downloads/dewiktionary-kaikki-raw.jsonl.gz

sources/en/phase12b-sources-v1.json
data/raw/en/phase12b-20260918/enwiktionary-kaikki-20260916.jsonl.gz

data/local/rhymelab-v5.sqlite
data/local/rhymelab-en-v1.sqlite
data/local/rhymelab-phrases-v1.sqlite
data/local/rhymelab-entities-v1.sqlite
```

Alternative local source locations can be supplied with:

```text
--de-usage <file>
--de-kaikki <file>
--en-registry <file>
--en-raw-dir <dir>
```

## Workset and outputs

V2 deliberately uses new filenames so a V1 workset can never be mistaken for the corrected population:

```text
data/local/pronunciation-backfill-v2.sqlite
data/local/pronunciation-backfill-v2-report.json
data/local/pronunciation-backfill-v2-review.tsv
```

Optional:

```text
data/local/pronunciation-backfill-v2-all.tsv
```

The SQLite work database is the resume/audit authority.

## Deduplication

Generation is per:

```text
language + normalized surface
```

A surface occurring in several source layers is generated only once, while `source_ref` preserves the scopes in which it was missing.

This matters for phrase tokens, dictionary forms and Entity names that overlap.

## Resume behavior

Collection, eSpeak and client stages commit bounded batches.

- German usage TSV resumes from the last committed usage rank.
- Phrase/Entity SQLite scans resume from stable source keys.
- eSpeak and client processing resume from per-item status.
- English/German raw gzip streams are sequential. If a raw-source collection is interrupted, the next run re-decompresses to the last committed raw-line checkpoint, then continues; already committed gap rows are not reinserted and no completed pronunciation generation is repeated.

The compressed source limitation is explicit: normal gzip does not support arbitrary random line seeks. The expensive million-row pronunciation stage remains fully checkpointed.

If an input source/accepted DB revision changes, V2 fails closed instead of mixing revisions. Use `--reset` only when intentionally creating a fresh workset.

## Admission/noise gate

The completed owner audit showed that the raw 6.03M-item workset is not equivalent to 6.03M safe lexical generator targets. Before eSpeak runs, Backfill V2 now requires a resumable source-aware admission pass:

```powershell
npm run pronunciation:backfill:admit
```

Policy: `source-aware-pronunciation-admission-v1`.

Decisions are stored per work item in SQLite:

```text
admit         safe enough for unattended bulk eSpeak generation
review        plausible but held out of unattended generation
reject_noise  strong structural/source artifact; retained for audit only
```

The decision is based on both surface shape and source scope. Important target boundaries:

- DE/EN word-source scopes admit normal single lexical surfaces and lexical hyphen/apostrophe forms; multiword rows are held for review instead of being treated as word-runtime gaps.
- Phrase surfaces may legitimately be multiword.
- Phrase unresolved-token rows are expected to be lexical tokens.
- Entity names may legitimately be multiword or contain ordinary punctuation.
- obvious Wiktionary display/template artifacts such as numbered display rows, ellipsis placeholders, markup fragments and `er/sie/es` form templates are not sent blindly to eSpeak.
- overlapping provenance is conservative: if one legitimate source scope admits the item, that valid scope wins over a stricter overlapping scope.

Outputs:

```text
data/local/pronunciation-backfill-v2-admission-report.json
data/local/pronunciation-backfill-v2-admission-review-sample.tsv
```

The gate does not delete source rows or canonical data. Rejected/review rows remain in the workset with their provenance.

Admission completeness is checked against the full `work_item` population, not only rows that still have a `source_ref`. Any legacy orphan work item is conservatively classified as `review:no_source_scope` and reported in the admission integrity block. New collection runs prevent such orphans from being created when a source-key uniqueness collision occurs. Re-running `npm run pronunciation:backfill:admit` repairs missing admission decisions in place; no source recollection is required.

## Generator chain

The existing development adapter remains authoritative:

```text
scripts/query-pronunciation-espeak-adapter.mjs
```

The 1000-case held-out calibration confirmed eSpeak as the primary generator: it materially outperformed the client resolver on exact rhyme tail, syllable count, stress and mean rhyme score overall, with the largest margin on English. The client remains the fallback after eSpeak analyzer rejection.

Order:

1. source-aware admission/noise gate;
2. eSpeak-NG with DE or en-US voice for `admit` rows only;
3. existing eSpeak IPA normalization;
4. accepted language analyzer;
5. only analyzer-rejected eSpeak rows continue;
6. `client-total-query-pronunciation-v2`;
7. source-backed Writer token lookup / bounded source composition first;
8. deterministic client rules;
9. grapheme fallback;
10. accepted language analyzer.

Host eSpeak unavailability fails the eSpeak phase. It does not silently route the entire admitted source universe through the weaker client fallback.

The eSpeak phase now uses **four bounded batch workers by default**. Each worker sends a block of rows to one eSpeak process over stdin instead of launching one process per row:

```powershell
npm run pronunciation:backfill:espeak -- --workers 4
```

Default batch size is 512 rows per worker and can be overridden with `--espeak-batch-size`. Complex/multi-line-capable surfaces are boundary-framed inside the batch so eSpeak may emit more than one IPA line for a row without destroying row alignment. A plain line-batch cardinality mismatch is retried once as one framed batch instead of recursively degrading into per-row process launches. DE and EN are processed as separate language phases so all four workers can use one fixed voice at a time. Output cardinality is checked before rows are mapped back to the workset; a mismatching batch is recursively split and an isolated single-row mismatch falls back to the established per-row adapter. Completed rows are still committed transactionally to the same resumable SQLite workset. Worker/batch settings change throughput only; they do not alter pronunciation, admission, analyzer, quality-tier or promotion policy.

## Generated quality classes

```text
A  eSpeak-NG accepted by the analyzer with unchanged normalized IPA
B  eSpeak accepted after existing IPA normalization,
   or fully source-backed client composition
C  deterministic client rules / rule token chain
D  grapheme fallback, alone or mixed into a token chain
U  unresolved after the requested chain
```

These are **generated-evidence quality classes**, not lexical truth grades.

## Console progress

Collection identifies the exact source scope currently being scanned and reports source progress plus missing/deduplicated counts.

Examples:

```text
[collect:de_usage_source_minus_accepted] ...
[collect:de_wiktionary_headword_source_minus_accepted] ...
[collect:de_listed_form_source_minus_accepted] ...
[collect:en_wiktionary_lexical_source_minus_accepted] ...
[collect:phrase_unresolved_token] ...
[collect:phrase_surface_unresolved] ...
[collect:entity_de_no_source_pronunciation] ...
[collect:entity_en_no_source_pronunciation] ...
```

Resolution continues to report count, percentage, throughput, ETA and accepted/rejected/error totals.

## Pre-eSpeak audit and generator comparison

After collection completes, run the structural audit before starting the multi-million-row generator pass:

```powershell
npm run pronunciation:backfill:audit
```

Outputs:

```text
data/local/pronunciation-backfill-v2-audit.json
data/local/pronunciation-backfill-v2-audit-sample-1000.json
data/local/pronunciation-backfill-v2-audit-sample-1000.tsv
```

The audit is read-only. It classifies the existing workset by language, scope, token count, source-ref multiplicity, length and surface shape, and reports the cross-tab `scope × shape` with small per-cell examples. It does not automatically discard any candidate.

The 1000 unresolved cases are deterministic and scope-balanced so every collected source family is represented.

For the eSpeak-NG vs in-house client resolver comparison:

```powershell
npm run pronunciation:backfill:benchmark
```

This performs two separate evaluations:

1. the same 1000 unresolved backfill cases through both generators;
2. a separate 1000-case source-backed lexical control set through both generators.

The unresolved set measures coverage and analyzer-level agreement only; it has no direct lexical gold. The source-backed control set is the quality calibration. On the gold controls the client resolver's exact-surface lookup is blocked, while component lookup remains available, so it cannot simply return the held-out reference pronunciation.

Benchmark outputs:

```text
data/local/pronunciation-generator-benchmark-1000-v1.json
data/local/pronunciation-generator-benchmark-1000-v1.tsv
```

The report includes per-scope/per-language/**per-shape** coverage, client method breakdown, eSpeak/client IPA agreement, syllable/stress/rhyme-key agreement, held-out reference metrics and latency. Neither benchmark mutates the backfill work DB or canonical runtime DBs.

If the audit/gold samples already exist and only the generators should be rerun:

```powershell
npm run pronunciation:backfill:benchmark:run
```

## eSpeak high-speed throughput test

The first owner scaling run proved that per-row process launch is the bottleneck: 4 row-spawn workers reached 24.268 cases/s with no errors, while higher concurrency delivered diminishing throughput and started producing process-unavailable failures.

The default high-speed test now keeps concurrency fixed at **4 workers** and benchmarks **batch size** instead:

```powershell
npm run pronunciation:backfill:highspeed:test
```

Default test:

```text
workers        4
sample         2,048 admitted rows
batch sizes    64, 128, 256, 512 rows/worker
```

Output:

```text
data/local/pronunciation-espeak-highspeed-v2.json
```

The test is read-only. It reports cases/second, process-mode/fallback counts, errors and projected hours for the remaining admitted population. The full runner additionally prints a per-window `recent=.../s` rate and cumulative process-mode counts so fallback storms are visible immediately instead of being hidden by the cumulative ETA. A batch size is eligible for the full run only when the run is stable with zero process errors.

Custom example:

```powershell
npm run pronunciation:backfill:highspeed:test -- --workers 4 --cases 4096 --batch-sizes 128,256,512,1024
```

The old per-row spawn ladder is retained only as a control:

```powershell
npm run pronunciation:backfill:highspeed:spawn
```

## Owner commands

The owner-local inventory has now been consumed and the default source adapters above are mapped to the actual local files. A new inventory run is **not** required for this backfill unless the local data layout changes.

Update first:

```powershell
git switch main
git pull --ff-only
```

Collect the corrected source-diff population only:

```powershell
npm run pronunciation:backfill:collect
```

Apply/review the admission gate:

```powershell
npm run pronunciation:backfill:admit
```

Measure local eSpeak concurrency before the multi-million-row generator pass:

```powershell
npm run pronunciation:backfill:highspeed:test
```

Then run eSpeak with four workers and the fastest stable batch size from the v2 report, for example:

```powershell
npm run pronunciation:backfill:espeak -- --workers 4 --espeak-batch-size 512
```

After eSpeak completes, run the client fallback only for analyzer-rejected admitted rows:

```powershell
npm run pronunciation:backfill:client
```

The convenience full-chain command still exists and defaults to 4 batched eSpeak workers. `--workers` and `--espeak-batch-size` override those local defaults explicitly:

```powershell
npm run pronunciation:backfill -- --workers 4 --espeak-batch-size 512
```

Retry unexpected per-row processing errors:

```powershell
npm run pronunciation:backfill -- --retry-errors
```

Start a fresh V2 workset intentionally:

```powershell
npm run pronunciation:backfill -- --reset
```

eSpeak path override remains supported:

```powershell
$env:RHYMELAB_ESPEAK_COMMAND = "C:\path\to\espeak-ng.exe"
npm run pronunciation:backfill
```

## Promotion boundary

V2 does not mutate accepted Writer, Phrase/Mosaic or Entity DBs.

The generated workset is staging/review evidence only. Promotion is a later explicit decision and can differ by source scope and quality tier.
