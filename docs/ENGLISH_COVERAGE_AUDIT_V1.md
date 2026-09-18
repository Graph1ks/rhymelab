# English Coverage Funnel Audit v1

Status: **history-fix A/B passed / proper-name v3 owner rerun reviewed / stratified coverage review implemented**

## Question

The Phase 12B5 English SQLite candidate is much smaller than the accepted German Writer DB even though the downloaded English Wiktionary source is very large.

Raw file size is not a useful coverage metric by itself. This audit measures the actual lexical/ranking/pronunciation funnel and compares it directly with the local German Writer runtime.

## Command

```powershell
npm run en:coverage:audit
```

Output:

```text
data/local/en-coverage-audit-v1-report.json
```

The command streams the pinned English Wiktionary source once. It does not mutate either database.

## What is measured

### English publish/runtime population

- broad Wiktionary single-token Writer candidate count from the accepted 12B2 source diagnostic;
- published surfaces;
- surfaces with any analyzed pronunciation;
- surfaces with analyzed en-US pronunciation;
- default-eligible surfaces;
- wordfreq-ranked published/default surfaces;
- unranked published/default surfaces;
- wordfreq rank distribution;
- non-default exclusion reasons.

### Frequency-qualified coverage

The audit reconstructs the same strict wordfreq ranking universe used by the Phase 12B4 publisher and reports checkpoints:

```text
Top 1k
Top 5k
Top 10k
Top 25k
Top 50k
Top 100k
Top 150k
Top 250k
Top 500k (when available)
```

For every checkpoint it measures:

- strict publish-surface population;
- Wiktionary lexical presence;
- source-backed pronunciation availability;
- publish coverage;
- analyzed en-US coverage;
- default eligibility.

### Loss classification

High-frequency missing/non-default words are classified into concrete buckets:

- not present as an eligible Wiktionary lexical surface;
- listed Wiktionary form without independent pronunciation;
- no source-backed Wiktionary/CMUdict pronunciation;
- published but without analyzed en-US pronunciation;
- historical-only;
- proper-name-only;
- ESDB-invalid;
- unexpected source-backed publish gap.

The report includes the highest-ranked missing examples and samples per loss reason so the policy can be inspected rather than inferred from aggregate percentages.

### German vs English runtime comparison

When the local databases exist, the audit reads them directly:

German:

- total preferred forms;
- ranked forms;
- unranked forms;
- ranked share;
- pronunciation rows;
- Writer anchor rows;
- morphology evidence rows;
- physical SQLite size.

English:

- total forms;
- ranked forms;
- unranked forms;
- default forms;
- ranked/unranked default forms;
- pronunciation rows;
- physical SQLite size.

This comparison is intentionally explicit that German v5 contains mature anchor and morphology materializations while English v1 is currently a lean candidate DB.

## Decision use

Do not accept the English lexical population merely because indexed retrieval works.

Before Phase 12B6 ranking work proceeds, inspect at least:

1. Top-10k, Top-50k and Top-100k default coverage;
2. ranked vs unranked English surface counts;
3. the dominant loss buckets;
4. the highest-frequency missing words;
5. whether listed-form pronunciation inheritance/composition is a material coverage bottleneck;
6. whether explicit en-US provenance is the main post-publish bottleneck;
7. the direct German-vs-English runtime population comparison.

Broad G2P remains disabled. A coverage gap is evidence for source/composition/policy work, not automatic permission to guess pronunciation.


## Owner baseline — 2026-09-18

The first full-data audit confirms that the small English DB is primarily a **population-cut issue**, not a SQLite compression anomaly.

```text
broad Writer candidates             1,084,050
published surfaces                    147,904
default eligible                       72,946

English ranked published              106,779
English unranked published             41,125
English ranked share                    72.19%

German ranked forms                   260,450
German unranked forms                 577,759
German ranked share                     31.07%
```

The accepted German Writer therefore contains roughly fourteen times as many unranked long-tail forms as the current English candidate.

Frequency-qualified English baseline:

```text
                         Top 10k    Top 50k    Top 100k
Wiktionary lexical        99.46%      95.43%       87.53%
source pronunciation      99.09%      91.42%       74.43%
published                 98.56%      88.34%       69.75%
analyzed en-US            98.25%      85.82%       64.66%
default eligible          89.03%      72.00%       50.46%
```

This separates three problems:

1. the core Top-10k pronunciation inventory is already strong;
2. default eligibility suppresses too many otherwise published high-frequency words;
3. source-backed pronunciation and lexical coverage collapse materially through the Top-50k/Top-100k tail.

The initial hypothesis that listed forms are the dominant problem is **not supported**: only 111 Top-100k losses were in the old listed-form-without-independent-pronunciation bucket.

The dominant Top-100k baseline losses were:

```text
no source-backed pronunciation       17,667
not Wiktionary lexical candidate     12,469
explicit proper-name only            11,772
published without analyzed en-US      3,705
historical-only                       2,670
```

## Confirmed historical-only classification defect

The baseline publish policy classified a complete Wiktionary POS entry as historical whenever any collected sense tag was `archaic`, `obsolete`, `historical` or `dated`.

Because the implementation flattened record tags and every sense tag into one set before classifying the entry, a normal current word with one old sense could become historical evidence.

The symptom is large enough to require correction before ranking:

```text
Top-10k historical-only exclusions      567
Top-50k historical-only exclusions    1,829
Top-100k historical-only exclusions   2,670
```

The candidate fix changes this rule to:

> historical-only only when the record is explicitly historical at record level, or when it has historical senses and **no current sense**.

Historical/archaic/dated flags remain preserved as provenance even when a current sense exists.

The candidate publish policy is versioned separately as:

```text
en-source-backed-publish-v2-candidate
```

## Form-of recovery diagnostic

The rerun also distinguishes missing source pronunciations that are source-backed morphological forms whose lemma already has an analyzed en-US pronunciation.

This bucket is intentionally diagnostic only. It measures how much deterministic inflection-pronunciation composition could recover **without broad G2P**.

## A/B rerun behavior

If an older `data/local/en-coverage-audit-v1-report.json` exists, the next audit automatically compares the new result to it and reports deltas for:

- published surfaces;
- default-eligible surfaces;
- ranked published/default surfaces;
- Top-N published coverage;
- Top-N analyzed en-US coverage;
- Top-N default eligibility;
- source-backed pronunciation coverage.

The terminal summary also prints the 25 highest-ranked remaining missing/non-default examples.


## Owner history-fix A/B — PASS

```text
published surfaces                  147,904 -> 147,904
default eligible                     72,946 -> 75,695   (+2,749)
ranked default                       62,658 -> 65,161   (+2,503)

Top-10k default                       89.03% -> 94.38%  (+535 rows)
Top-50k default                       72.00% -> 75.21%  (+1,605 rows)
Top-100k default                      50.46% -> 52.52%  (+2,064 rows)

historical-only Top-10k                  567 -> 1
historical-only Top-50k                1,829 -> 67
historical-only Top-100k               2,670 -> 208
```

Publish and analyzed-en-US counts did not change; the fix correctly changed eligibility classification only.

## Confirmed proper-name evidence defect

The same flattening pattern existed in `isExplicitProperNameRecord()`: it inspected tags collected from every sense. A common-noun record could therefore become proper-name evidence because one sense carried a proper-name tag.

Observed protected example from the owner audit:

```text
college
wordfreq rank 528
Wiktionary IPA present
CMUdict present
status: published_explicit_proper_name_only
```

Candidate policy `en-source-backed-publish-v3-candidate` changes proper-name record evidence to use:

- explicit POS such as `name` / `proper noun`; or
- record-level proper-name tags.

Sense-level tags no longer poison the whole record.

## Rescue-channel audit

Before any broad G2P or ranking work, the next owner run quantifies:

1. **ESDB + CMUdict lexical rescue** — high-frequency surfaces missing a Wiktionary lexical candidate but independently attested by ESDB and exact CMUdict;
2. **regular inflection-shape recovery** — source-backed form relations whose analyzed en-US lemma and orthographic relation look like regular `-s/-es/-ed/-ing` morphology;
3. **orthographic-variant recovery** — punctuation-only `alt_of` relations such as apostrophe variants;
4. **locale gap** — published rows with analyzed en-GB and/or unprofiled pronunciation but no analyzed en-US row.

Arbitrary `form_of` pronunciation inheritance is explicitly forbidden. The owner result `ii -> second` demonstrates why source lexical relations must not be treated as phonological derivation rules without a narrower morphology contract.


## Owner proper-name v3 rerun — interpretation

The v3 proper-name classifier fix is correct but small in population impact:

```text
published surfaces               147,904
default eligible                  75,697
delta vs v2                           +2
ranked default delta                  +2
```

The earlier `college` false-positive was real, but the remaining proper-name block is overwhelmingly genuine names/places/month-name records under the current policy. Whether those surfaces should be searchable in the Writer is therefore a product/channel decision rather than another broad classifier bug.

The v3 owner report also confirms that only 106,779 of 311,685 ranked strict wordfreq surfaces are currently published (34.26%), while 65,163 are default eligible (20.91%).

## Rescue findings from v3

Top-100k diagnostic opportunities:

```text
ESDB + CMUdict non-Wiktionary lexical rescue      1,981
regular inflection shape + analyzed lemma          3,317
orthographic punctuation variant                      41
published analyzed-unprofiled / no en-US           3,748
published analyzed en-GB / no en-US                  556
published en-GB + unprofiled / no en-US               89
unresolved/unparseable published                     700
```

Across the complete 311,685 ranked strict universe:

```text
ESDB + CMUdict non-Wiktionary                      3,255
regular inflection shape                          13,459
non-Wiktionary CMUdict-only                       10,463
non-Wiktionary ESDB-current-only                   7,077
orthographic punctuation variants                    109
```

The highest-frequency miss examples show that the loss set contains substantial Writer-relevant material: contractions without apostrophes, slang/CMC forms, clipped `-in` spellings, possessives, brands, artists, athletes and fictional/cultural names.

## Diagnostic corrections after v3

Two audit classifications are corrected before using random review samples as policy evidence:

1. punctuation-only `alt_of` recovery is now checked independently and before generic morphology, so `dont -> don't` and `thats -> that's` are not mislabeled as generic no-pronunciation or ordinary `-s` inflection cases;
2. exact-CMUdict possessive surfaces with an analyzed en-US base are now a separate high-confidence rescue class, e.g. `world's`, `children's`, `mother's`.

These changes affect diagnostics only; they do not publish new lexical rows.

## Stratified review artifacts

Each full coverage audit now additionally writes:

```text
data/local/en-coverage-candidates-v1.jsonl
data/local/en-coverage-stratified-sample-v1.json
```

The JSONL contains every ranked strict candidate with its classification/evidence. The stratified sample uses a fixed SHA-256 seed and samples across these rank bands:

```text
1-10k
10k-25k
25k-50k
50k-100k
100k-150k
150k-250k
250k-tail
```

Samples are stratified by the material loss/rescue classes rather than only taking the highest-ranked examples.

After one full audit, arbitrary reproducible review samples can be drawn without restreaming Wiktionary:

```powershell
npm run en:coverage:sample -- --status no_source_backed_pronunciation --min-rank 50000 --max-rank 100000 --n 50
npm run en:coverage:sample -- --status not_wiktionary_lexical_candidate --min-rank 100000 --max-rank 250000 --n 50
npm run en:coverage:sample -- --min-rank 250000 --n 100 --seed tail-review-1
```

This is the preferred basis for the next lexical-admission decision.
