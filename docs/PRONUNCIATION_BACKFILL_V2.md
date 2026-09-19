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

## Generator chain

The existing development adapter remains authoritative:

```text
scripts/query-pronunciation-espeak-adapter.mjs
```

Order:

1. eSpeak-NG with DE or en-US voice;
2. existing eSpeak IPA normalization;
3. accepted language analyzer;
4. only analyzer-rejected eSpeak rows continue;
5. `client-total-query-pronunciation-v2`;
6. source-backed Writer token lookup / bounded source composition first;
7. deterministic client rules;
8. grapheme fallback;
9. accepted language analyzer.

Host eSpeak unavailability fails the eSpeak phase. It does not silently route the entire source universe through the weaker client fallback.

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

Then run/continue the complete generator chain:

```powershell
npm run pronunciation:backfill
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
