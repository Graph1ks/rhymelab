# Phase 12C — Proper-Name G2P Benchmark v2

Status: **MFA FULL BASELINE COMPLETE / confidence calibration pending**

## Why v1 was rejected before running G2P

The first owner benchmark preparation completed successfully, but the resulting control set was not representative of the fallback problem.

Owner v1 evidence:

```text
schema                     rhymelab-entity-g2p-proper-name-benchmark-v1
status                     prepared
cases                      600
semantic fingerprint       e9b6e47cc91cee2e9410136f1e40de97c979679532b1a8eda62f26974eb62d7c

single-word Entity surfaces 599 / 600
CMUdict-backed cases        592 / 600
distinct normalized         578 / 600
duplicate normalized         22
multi-word Entity surfaces    1 / 600
```

This would mainly measure ordinary-English / CMUdict-like spelling behavior, not the unknown name-unit problem that blocks Entity composition.

Examples of duplicate controls included the same normalized surface through multiple entities/categories such as `Queen`, `Madonna`, `Metallica`, `Dune`, `Spider-Man`, and `Tesla`.

No G2P model was run against v1.

## Correct benchmark unit

The generated fallback will be used to resolve **unknown Entity name tokens**, after deterministic Entity-name tokenization/composition.

Therefore v2 benchmarks the same unit:

```text
Entity surface
  -> deterministic Entity lookup units
  -> unknown token
  -> G2P candidate
  -> compose Entity pronunciation
```

The benchmark control is a token observed inside a preferred searchable English Entity name for which raw Kaikki/Wiktionary provides explicit `en-US` proper-name IPA.

This deliberately excludes CMUdict as benchmark gold. CMUdict remains a production source layer, but it must not make the G2P benchmark artificially easy.

## v2 selection contract

Default target: 600 unique normalized token controls.

Each case must satisfy:

- token appears in a real preferred searchable English Entity name;
- token has explicit raw Kaikki/Wiktionary proper-name evidence;
- at least one parseable `en-US` IPA control exists;
- normalized token is unique across the benchmark;
- control references are Kaikki proper-name IPA only;
- Entity context is retained for category/popularity diagnostics;
- deterministic per-category cap remains 100.

The report also records coarse orthographic buckets:

- `non_ascii`;
- `apostrophe`;
- `very_short`;
- `short`;
- `medium`;
- `long`.

## MFA candidate

Primary candidate is now the official MFA **English (US) ARPA** G2P model rather than the MFA-phone-set model.

```text
model id       english_us_arpa
model version  2.0.0a
phone set      ARPA
architecture   pynini
license        CC BY 4.0
```

Reason: ARPA output is directly compatible with RhymeLab's accepted English ARPAbet analyzer. No extra MFA-phone-set conversion layer is required.

The model remains build-time benchmark evidence only.

## Owner workflow

The standalone preparation command remains available for diagnostics:

```powershell
npm run entity:g2p:benchmark:prepare
```

It writes:

```text
data/local/entity-g2p-proper-name-benchmark-v2.json
data/local/entity-g2p-proper-name-benchmark-v2-input.tsv
```

The normal owner gate does not require a separate review/upload between preparation and MFA.

One-time MFA setup, if MFA is not already installed:

```powershell
conda create -n rhymelab-mfa -c conda-forge montreal-forced-aligner -y
conda activate rhymelab-mfa
mfa model download g2p english_us_arpa --version 2.0.0a
```

Then run the complete owner gate **inside the Miniforge Prompt with `(rhymelab-mfa)` visibly active**:

```powershell
git pull
npm run entity:g2p:benchmark:mfa
```

If the prompt does not begin with `(rhymelab-mfa)`, activate it first with `conda activate rhymelab-mfa`.

The npm command first rebuilds v2, then the runner:

1. requires benchmark schema v2;
2. requires zero duplicate normalized controls;
3. verifies MFA is available;
4. verifies the installed `english_us_arpa` model matches the expected Pynini + complete 69-phone ARPA model family; MFA's internal archive `version` string is recorded for provenance but is not required to equal the public release label `2.0.0a`;
5. generates one pronunciation per token;
6. converts the generated dictionary to the RhymeLab prediction TSV contract;
7. evaluates it automatically against explicit proper-name IPA controls.

Primary output:

```text
data/local/entity-g2p-mfa-en-us-arpa-evaluation-v2.json
```

Generated pronunciations are not persisted to the Entity DB by this workflow.

## Decision boundary

Do not promote G2P because it performs well on ordinary English words.

The benchmark must establish whether the model preserves the features RhymeLab actually uses for rhyme search:

- exact canonical phones;
- exact stressed rhyme tail;
- syllable count;
- stress pattern;
- primary stress;
- accepted English rhyme-analysis score.

Only after v2 evidence is reviewed do we decide whether MFA is useful as a fallback for the remaining 704,989 unresolved English Entity names.


### MFA archive-version note

The public model release is documented by MFA as `english_us_arpa` v2.0.0a, ARPA, Pynini, CC BY 4.0. Some current MFA installs report an older internal build metadata string such as `2.0.0rc4.dev19+...` through `mfa model inspect`. RhymeLab therefore verifies stable model-family properties (Pynini + complete 69-phone ARPA inventory) and records the actual inspect string/fingerprint instead of requiring string equality with the public release label.


## MFA model-input normalization

MFA's word-list G2P path does not automatically lowercase input words. Its generator removes graphemes that are outside the selected model's grapheme inventory before rewriting. For the selected English US ARPA model, the expected inventory is lowercase `a-z` plus apostrophe.

Therefore the RhymeLab runner never sends display-case Entity spelling directly to MFA. It derives a separate benchmark-only model input from the benchmark normalized token:

- lowercase first;
- normalize apostrophe variants to `'`;
- decompose and remove combining diacritic marks when a base Latin grapheme remains;
- preserve the original benchmark surface/reference for evaluation;
- reject any residual unsupported grapheme rather than letting MFA silently delete it.

The runner records model-input eligibility, diacritic-fold counts, input collisions and prediction coverage. It refuses to emit a quality evaluation when fewer than 95% of model-eligible cases receive a mapped prediction.

The first owner MFA execution prior to this fix generated only 13 mapped predictions for 600 controls and is rejected as a runner defect. Its quality metrics are not model evidence.


## Valid MFA full-coverage baseline

Owner evidence after model-input normalization:

```text
benchmark cases                  600
model-input eligible             599
eligible prediction coverage     100%
prediction rows                  599
evaluated                        597
invalid                            2
missing                            1
exact phones                   70.35%
exact stressed rhyme tail      71.19%
syllable count                 95.98%
stress pattern                 80.57%
primary stress                 94.14%
mean rhyme score             0.913040
semantic fingerprint
b6c3943f90a90a2938bcd3ce74ccecc95eedc67712fe751a6dda0266b2c91b5a
```

This baseline rejects **unconditional** MFA runtime promotion. Exact-tail accuracy is the key RhymeLab risk and remains materially below source-backed quality.

### Confidence calibration

MFA/Pynini already exposes a path score. RhymeLab now requests `--export_scores` for the same single-best pronunciation and records that score in the prediction TSV.

The evaluator treats lower Pynini path score as better and reports deterministic retained-quality points for the lowest-score 10%, 25%, 50%, 75%, 90% and 100% of scored/evaluable controls. It also reports the largest retained subset, if any, that reaches at least 90% exact-tail and at least 85% exact-tail.

This is a benchmark-only confidence experiment. No generated pronunciation is persisted or promoted by it.
