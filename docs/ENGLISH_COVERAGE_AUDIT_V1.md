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


## Stratified owner review — rescue policy direction

The deterministic stratified owner sample is now complete across all seven rank bands. Summed cell populations for the material loss/recovery classes are:

```text
not_wiktionary_lexical_candidate                  97,144
no_source_backed_pronunciation                    52,864
published_explicit_proper_name_only               26,264
form_of_without_analyzed_en_us_lemma              14,976
published_no_analyzed_en_us_pronunciation         14,821
regular_inflection_shape_with_analyzed_en_us_lemma 13,454
non_wiktionary_cmudict_only                        8,764
form_of_with_analyzed_en_us_lemma                  5,505
possessive_with_cmudict_and_analyzed_en_us_base    4,036
non_wiktionary_esdb_current_plus_cmudict             918
orthographic_variant_with_analyzed_en_us_lemma       168
```

Review conclusions:

1. exact-CMUdict possessives are a high-confidence lexical-surface rescue class;
2. punctuation-only aliases to an analyzed lemma are a high-confidence pronunciation-identity class;
3. regular inflection recovery is promising but must be tag-gated; abbreviation/initialism/contraction/misspelling/letter/number/symbol rows are blocked before composition;
4. published rows with analyzed but unprofiled IPA are a major locale-policy candidate and require rhyme-domain agreement diagnostics before default promotion;
5. ESDB+CMUdict and CMUdict-only non-Wiktionary rows are heavily name/brand/entity-shaped in review samples and must not be silently reclassified as ordinary common lexical vocabulary;
6. proper-name-only remains a Writer channel/product-policy question, not a pronunciation-coverage defect.

Quick exact-count command over the already-materialized 311k sidecar:

```powershell
npm run en:coverage:rescue
```

Output:

```text
data/local/en-coverage-rescue-policy-v1-report.json
```

Pronunciation fallback agreement diagnostic over the existing publish shards:

```powershell
npm run en:pronunciation:fallback:diagnose
```

Output:

```text
data/local/en-pronunciation-fallback-diagnostic-v1-report.json
```

Neither diagnostic mutates publish data or the English runtime.


## Exact rescue-policy owner counts

Owner execution of `npm run en:coverage:rescue` read all 311,685 ranked coverage-sidecar rows without malformed input.

```text
Tier A immediate candidates                         4,204
Tier A + Tier B candidates                        27,435

exact CMUdict possessives                          4,036
punctuation-only aliases                             168
strict source-backed inflection                   12,406
analyzed unprofiled IPA                           10,662
en-GB + unprofiled analyzed IPA                      163
en-GB-only analyzed IPA                            1,889
ESDB-current + exact CMUdict                         918
CMUdict without lexical guard                      8,764
deterministic initialism composition review        6,077
proper-name channel review                        26,264
unresolved pronunciation                           2,107
```

Interpretation:

- the strict morphology gate retains 12,406 / 13,454 previously shape-matched rows, so bounded inflection composition is large enough to justify implementation;
- exact-CMUdict possessives and punctuation-only aliases remain the strongest immediate additions;
- unprofiled IPA is also large, but must not be relabeled en-US without stronger evidence.

## Pronunciation fallback agreement owner run

Current production exact-key agreement is not high enough to promote unprofiled or en-GB pronunciation to the en-US default profile:

```text
unprofiled vs en-US:
  compared surfaces              21,306
  exact-tail match               62.86%
  final-tail match               82.79%
  vowel-family match             69.35%
  syllable-count match           94.92%
  stress-pattern match           82.36%
  primary-stress match           96.98%

en-GB vs en-US:
  compared surfaces              27,648
  exact-tail match               48.64%
  final-tail match               74.62%
  vowel-family match             58.11%
  syllable-count match           95.31%
  stress-pattern match           87.67%
  primary-stress match           98.08%
```

However, mismatch examples expose a second issue: the current `exactTailKey` includes syllable-boundary placement. Identical phone sequences can therefore disagree when CMUdict deterministic syllabification and source IPA explicit boundaries differ. Protected example:

```text
abacus
CMUdict-derived exact key    æ.bə.kəs
Wiktionary IPA exact key     æb.ə.kəs
canonical phoneme sequence   æ b ə k ə s  (same)
```

Before changing the production key, rerun the enhanced diagnostic:

```powershell
npm run en:pronunciation:fallback:diagnose
```

It now also reports:

- boundary-insensitive stressed-tail agreement;
- boundary-insensitive stressed-tail + rhyme-region stress agreement;
- full canonical phoneme-sequence agreement;
- the share of current exact-key mismatches explained only by syllable-boundary placement.

No production rhyme key changes are accepted yet.

## Arbitrary wordlist coverage audit

A new local diagnostic checks external stress-test wordlists directly against the actual English SQLite plus the 311k coverage sidecar:

```powershell
npm run en:coverage:wordlist -- --input <path-to-wordlist>
```

Accepted input formats:

```text
rarity<TAB>word
rarity word
word
```

Outputs:

```text
data/local/en-wordlist-coverage-v1-report.json
data/local/en-wordlist-coverage-v1.tsv
```

For each word it records:

- present in English SQLite;
- present in the default selection;
- pronunciation inventory and analyzed en-US/unprofiled/GB counts;
- wordfreq coverage-sidecar presence/status;
- exclusion reasons and recovery evidence;
- coverage summaries per rarity tier when a rarity column is present.

This is specifically intended for the owner's 1,000-word rarity-stratified stress list. The list is an engineering coverage probe, not lexical gold.


## 1,000-word rarity stress-list result

The owner ran the external rarity-stratified 1,000-word stress list against the current English SQLite and 311k coverage sidecar.

The first run reported 1,003 rows because three prose metadata lines were parsed as words. Those three rows had no rarity and were all absent. Corrected actual-word totals are therefore:

```text
actual words                         1,000
in English SQLite                      882  88.2%
default-selected                       676  67.6%
published but non-default              206  20.6%
missing from English SQLite            118  11.8%
present in ranked wordfreq sidecar     756  75.6%
with any analyzed pronunciation        859  85.9%
with analyzed en-US pronunciation      682  68.2%
```

Rarity curve:

```text
rarity   DB presence   default-selected
1        100.00%       100.00%
2        100.00%       100.00%
3        100.00%       100.00%
4        100.00%       100.00%
5         98.57%        92.86%
6         98.89%        95.56%
7        100.00%        91.82%
8         96.43%        77.14%
9         89.47%        53.16%
10        65.00%        28.85%
```

The stress list is not lexical gold: its own metadata states that no web/corpus/dictionary/package/external word list was used to select the words. Use it as a coverage-stress probe, not as evidence that every tail item must be admitted.

Among the 206 published non-default words:

```text
no analyzed en-US only                 189
historical + no analyzed en-US          11
historical only with analyzed en-US      6

pronunciation state:
true current DB row with unprofiled     138
en-GB only                               38
en-GB + unprofiled                        1
stored but no analyzed pronunciation     23
analyzed en-US but historical-only         6
```

Among the corrected 118 missing words:

```text
absent from DB and ranked sidecar         98
sidecar: no source-backed pronunciation   18
sidecar: strict morphology candidate       1
sidecar: form-of without analyzed lemma    1
```

Examples of clearly real mid-tail lexical misses with source lexical evidence but no source-backed pronunciation include `waggish`, `floridly`, `desiderative`, `stenotic`, `sapid`, `caparison`, `fossorial`, `conspectus`, `uncinate`, `dendroid`, `yulan`, `imbricate`, `lambdoid`, `tonsorial`, `georgic` and `famulus`.

The wordlist parser now detects structured rarity inputs and ignores unmatched prose metadata rows.

## Unprofiled pronunciation provenance defect

The first fallback benchmark grouped every analyzed Wiktionary IPA without an en-US/en-GB mapping into one `unprofiled` bucket. That bucket is semantically mixed.

Two concrete problems are now separated:

1. sounds tagged for another regional/profile class (Canadian, Australian, New Zealand, Indian, rhotic/non-rhotic, etc.) were treated as if they were genuinely unqualified;
2. visibly partial IPA such as `/-vʊlf/` for `aardwolf` was treated as a full-word fallback candidate.

Publish provenance policy is therefore bumped to:

```text
en-source-backed-publish-v3.1-candidate
```

without changing default eligibility.

The enhanced fallback diagnostic now separates:

```text
unqualified_fullword
other_profiled
unqualified_partial
en-GB
```

and reports each class against explicit en-US truth independently. Only `unqualified_fullword` is eligible for future General-English fallback consideration; none is silently relabeled en-US.

Owner rerun:

```powershell
npm run en:coverage:wordlist -- --input ".\1000_random_english_words_rarity.txt"
npm run en:pronunciation:fallback:diagnose
```

The wordlist rerun is cheap and should report exactly 1,000 rows. The fallback rerun is also publish-shard-only; no Kaikki restream is required.


## Segmented fallback owner rerun — v2 result and stricter v3 gate

The corrected 1,000-word audit now reports exactly 1,000 rows and ignores three prose metadata lines. The corrected counts are unchanged:

```text
in English SQLite                  882 / 1000  88.2%
default-selected                   676 / 1000  67.6%
published non-default              206 / 1000  20.6%
missing from DB                    118 / 1000  11.8%
with any analyzed pronunciation    859 / 1000  85.9%
with analyzed en-US pronunciation  682 / 1000  68.2%
```

The segmented pronunciation diagnostic v2 materially improved the no-locale comparison but also exposed that the supposedly unqualified bucket was still contaminated by source tags:

```text
all no-mapped-locale vs en-US:
  surfaces                              21,306
  exact-tail match                      62.85%
  boundary-insensitive tail             65.61%

v2 unqualified_fullword vs en-US:
  surfaces                              19,354
  exact-tail match                      67.40%
  boundary-insensitive tail             70.38%
  boundary-insensitive tail + stress    65.71%
  phoneme-sequence match                65.27%
  syllable-count match                  96.88%
  stress-pattern match                  83.42%
  vowel-family match                    72.27%

other_profiled vs en-US:
  surfaces                               2,941
  exact-tail match                      13.26%
  boundary-insensitive tail             13.70%

partial vs en-US:
  surfaces                                 185
  exact-tail match                       3.24%
  boundary-insensitive tail              3.78%
```

The v2 `unqualified_fullword` class is **not acceptance evidence**. Mismatch examples still contain tags such as `new-zealand`, `general-south-african`, `new-york-city`, `philadelphia` and `cot-caught-merger`. The previous classifier used a finite regional-pattern list and therefore treated unknown/unmatched tags as unqualified.

The policy is now stricter:

```text
unqualified_fullword         no mapped locale + zero source tags + full-word IPA
other_profiled_fullword      recognized non-US/GB regional/profile tag
tagged_unmapped_fullword     one or more source tags, but no mapped locale/profile
unmapped_partial             visibly partial prefix/suffix IPA
en-GB                        preserved separately
```

Only the first class may be considered for a future General-English fallback. This avoids an open-ended attempt to enumerate every region, city, merger, split or source pronunciation qualifier.

Source pronunciation provenance candidate policy becomes:

```text
en-source-backed-publish-v3.2-candidate
```

No default eligibility changes are accepted. No publish rebuild is required to run the v3 diagnostic because it reclassifies the existing publish-shard tags in place.

Owner gate:

```powershell
git pull
npm run en:pronunciation:fallback:diagnose
```

The diagnostic schema should be `rhymelab-en-pronunciation-fallback-diagnostic-v3`. The publish-v4 decision remains blocked until the strict tagless `unqualified_fullword_vs_en_us` agreement is known.
