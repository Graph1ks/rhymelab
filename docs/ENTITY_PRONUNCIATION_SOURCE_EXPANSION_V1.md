# Phase 12C — Entity Pronunciation Source Expansion v1

Status: **ACCEPTED / owner full-data evidence complete**

This block expands Entity pronunciation coverage before any broad proper-name G2P is considered.

The design intentionally stops after the practical source/benchmark layers. It does **not** add audio alignment, speech recognition, remote APIs, paid services, or automatic neural inference to the product runtime.

## Goal

Start from the current English Entity baseline:

```text
searchable EN Entity names          1,415,550
source-backed ready                   459,728
ready pct                               32.48%
unresolved                            955,822
```

Then measure how much of that unresolved population can be recovered with sources already present locally plus cheap deterministic name composition.

## Source order

### 1. Existing raw Kaikki English Wiktionary

Reuse the already downloaded:

```text
enwiktionary-kaikki-20260916.jsonl.gz
```

No redownload is required.

The source-expansion scan reads explicit English proper-name records directly from raw Kaikki instead of routing them through the normal English Writer publish cut.

Policy:

- US-tagged parseable IPA -> candidate `en-US` Entity evidence;
- en-GB remains en-GB;
- tagless/unqualified English IPA remains generic `en` evidence;
- generic English is **not** silently relabeled en-US;
- unsupported IPA remains non-runtime evidence.

### 2. Existing raw pinned CMUdict

Reuse the complete pinned CMUdict snapshot directly:

```text
commit 74790861f652…
```

This lookup is independent of English Writer default lexical admission. An Entity name or token may therefore resolve through CMUdict even when that proper name never belonged in the default Writer vocabulary.

### 3. Optional Moby Pronunciator II

Supported as an optional secondary exact-match source.

The Moby documentation states that the pronunciation database was placed in the Public Domain by grant from the author in January 2001.

Moby's legacy ASCII phone notation is **not** promoted automatically into the accepted English analyzer in this phase. Exact matches are stored as raw secondary evidence only until its phone mapping is benchmarked against accepted English controls.

No Moby download is required for the primary owner gate.

## Deterministic Entity-name composition

The existing composition layer is extended conservatively for Entity surfaces.

Examples:

```text
The Exorcist III
-> the + exorcist + three

Metro-Goldwyn-Mayer
-> metro + goldwyn + mayer

Captain America: Brave New World
-> captain + america + brave + new + world
```

Supported normalization in v1:

- whitespace-separated name components;
- hyphenated components;
- `&` -> `and`;
- title separators such as `:`, `/`, `+`;
- Roman numerals I–XX -> cardinal names;
- Arabic integers 0–20 -> cardinal names.

The implementation deliberately does not invent pronunciations for arbitrary years, long numbers, acronyms, or ambiguous name particles.

Default expanded composition bound:

```text
8 units
```

The accepted English Writer evidence and the new source-expansion sidecar may both satisfy components.

## Sidecar

The expansion scan creates:

```text
data/work/entity/entity-pronunciation-source-expansion-v1.sqlite
```

Schema:

```text
rhymelab-entity-pronunciation-source-expansion-v1
```

This sidecar stores provenance-bearing pronunciation evidence only. It does not mutate:

- `rhymelab-entities-v1.sqlite`;
- `rhymelab-en-v1.sqlite`;
- frozen German Entity runtime rows.

## Owner command

Run:

```powershell
git pull
npm run entity:pronunciation:expand
```

The command looks for the existing Kaikki file in the accepted Phase 12B raw directory first. If the file lives elsewhere:

```powershell
npm run entity:pronunciation:expand -- --kaikki D:\path\enwiktionary-kaikki-20260916.jsonl.gz
```

Primary report:

```text
data/local/entity-pronunciation-source-expansion-v1-report.json
```

The report is compact. It contains aggregate source counts, baseline vs expanded coverage, incremental recovery, source contribution and only a small priority-unresolved sample.

## G2P boundary

G2P is **not** executed by the source-expansion command.

Only the population still unresolved after source expansion is eligible for later G2P benchmarking.

### MFA English (US)

Primary proper-name G2P candidate.

Pinned benchmark target:

```text
English (US) MFA G2P model v2.2.1
architecture  Phonetisaurus
license       CC BY 4.0
```

This is compatible with the project's local/offline and commercial-use constraints, subject to attribution.

### DeepPhonemizer

Independent benchmark candidate.

The project code is MIT. Before any pretrained checkpoint is promoted into production, its exact model artifact/license must be pinned and audited separately.

### CharsiuG2P

Multilingual research candidate only.

The code is MIT, but upstream explicitly notes that some collected pronunciation datasets have unspecified licenses. Therefore no Charsiu model is production-eligible until the exact model/data provenance is cleanly audited.

## Proper-name G2P benchmark

After a source-expansion owner run:

```powershell
npm run entity:g2p:benchmark:prepare
```

Outputs:

```text
data/local/entity-g2p-proper-name-benchmark-v1.json
data/local/entity-g2p-proper-name-benchmark-v1-input.tsv
```

The benchmark is built from real preferred Entity names with direct source-backed pronunciation evidence. This gives us a relevant proper-name control instead of relying on ordinary dictionary-word G2P accuracy.

External candidate output contract:

```text
case_id<TAB>notation<TAB>pronunciation
```

Supported notation values:

```text
arpabet
ipa
```

Evaluation:

```powershell
npm run entity:g2p:benchmark:evaluate -- --candidate mfa --predictions <file.tsv>
```

Metrics:

- exact canonical phone sequence;
- exact rhyme tail;
- syllable count;
- stress pattern;
- primary stress;
- mean accepted English rhyme score.

No generated pronunciation is persisted by the evaluator.

## Decision rule after owner expansion

Do **not** G2P the original 955k unresolved names.

First use the new report to determine:

```text
remaining unresolved after:
raw Kaikki proper-name IPA
+ raw CMUdict
+ improved deterministic composition
(+ optional Moby evidence)
```

Only that residual population becomes the proper-name G2P problem.

This keeps the next engineering step proportional to the actual remaining gap.


## Accepted owner result

```text
status                         evidence_ready
semantic fingerprint           fdabce67cc53ef7028402b7a92b6538a61663477a41adf81905c80218f0b949d
source index fingerprint       eab125329a5a99897b1cf7508243ce5659e9cdd56cd59a9b32d144a83d8e74c9
baseline ready                 459,728 / 1,415,550 = 32.48%
expanded ready                 710,561 / 1,415,550 = 50.20%
absolute gain                  250,833
incremental direct ready        10,255
improved composition ready     240,578
preferred expanded ready       558,036 / 1,062,694 = 52.51%
remaining unresolved           704,989
preferred unresolved           504,658
Moby used                      no
generated G2P used             no
```

Decision: accept the source-expansion layer. Do not add another blocking Moby run. Move directly to the real proper-name G2P benchmark. Only the residual 704,989-name population is eligible for a later generated-pronunciation policy, and only after benchmark evidence.
