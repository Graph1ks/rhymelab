# English Coverage Funnel Audit v1

Status: **implemented / owner full-data run pending**

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
