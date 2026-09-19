# Phase 12A Entity Lexicon — Deferred / Frozen Checkpoint

Last updated: 2026-09-19

Status: **RESUMED / PHASE 12C MULTILINGUAL PRONUNCIATION EVIDENCE ACTIVE**

## Decision

The English single-word Product gate is accepted, so the Entity deferral condition is satisfied.

Entity work resumes from the frozen Phase 12A2 population and DE pronunciation runtime. Do not restage QLever/QRank, retune the Hybrid-v2 population, mass-G2P names, or optimize the final SQLite layout.

To avoid unnecessary serial gates, P898 materialization, DE runtime invariance, accepted-English validation, exact en-US coverage, and bounded English token-composition coverage are now collected by one consolidated owner evidence command before the multilingual Entity runtime is implemented.

## Frozen code checkpoint

The last merged Entity change before this deferral is PR #70, which added the qualified Wikidata P898 pronunciation evidence layer.


The P898 source layer exists in code and remained unexecuted through the English phase. Phase 12C now executes it inside the consolidated multilingual evidence bundle. Until that owner report is reviewed, no full-data P898 counts are accepted or claimed.

## Accepted Phase 12A2 population baseline

The Entity retention/popularity baseline remains frozen:

```text
policy
category-relative-popularity-hybrid-v2-geometric-missing-evidence-candidate

semantic fingerprint
337c4c122cb015c053b8cae53710cd0248ed47295c66b4db8f273a799d8cf201

distinct retained entities
1,077,644

v1 -> v2 membership churn
0.41%

Bud Spencer / Q221074
KEEP / Tier A

QRank hard-gate categories
none
```

Do not retune category floors or the accepted Hybrid-v2 ranking while Phase 12B is active.

## Accepted current DE Entity pronunciation runtime

The last owner pronunciation build that actually ran remains the runtime evidence checkpoint:

```text
DE names considered              716,940
runtime-ready names               90,224
unresolved names                 626,716
resolved name coverage             12.58%
phonetic analyses                 90,224
rejected analyses                      0
rhyme anchors                    569,995
database bytes             1,267,650,560

runtime fingerprint
38199d5b872c3fd2a20839490005f43d76ac6baaecfe657b1026d3d94efd66b3
```

The RhymePad Entity channel may use this conservative runtime when the local Entity DB exists. The incomplete pronunciation coverage is known and accepted as a deferred limitation.

## Completed source-coverage diagnostic

The latest completed source diagnostic remains:

```text
DE preferred names                         577,228
runtime-ready preferred names               73,755
preferred runtime coverage                   12.78%

unresolved names probed                    626,716

CMUdict full-token candidates              261,833   41.78%
CMUdict partial-token candidates           233,283   37.22%
CMUdict no-token candidates                131,600   21.00%

unresolved preferred full-token matches    227,428
probe-only projected preferred ceiling       52.18%

diagnostic fingerprint
69e6ec4d14091d22c5a76ca5869d38908f09f95fcac248b2e6791f329ad99bfa
```

This evidence remains useful later: a real English phonology/runtime will unlock materially more Entity pronunciation coverage than blind German proper-name G2P.

## Implemented but intentionally not owner-run

PR #70 added a selective Wikidata P898 source-evidence layer:

```text
P898   IPA transcription
P407   language of work or name
P5237  pronunciation variety
P5168  applies to name of subject
```

Rows are designed to remain:

```text
source_kind   wikidata_p898
review_state  source_attested_unprofiled
generated     0
runtime       false
```

The one-command owner path would be:

```powershell
npm run entity:pronunciation:owner
```

**Do not run it as part of the active Phase 12B English Word work.**

When Entity work resumes, the first Entity action is to run that owner workflow and verify that the accepted DE Entity runtime fingerprint remains unchanged before evaluating P898 coverage.

## Phase 12C boundaries

- preserve the accepted retained Entity population and Hybrid-v2 fingerprint;
- preserve the accepted DE Entity runtime fingerprint;
- do not refetch/restage Phase 12A2 Entity/QRank sources;
- do not mass-G2P unresolved proper names;
- do not promote generic Wikidata `de`/`en` evidence to `de-DE`/`en-US`;
- route English source evidence only through the accepted English analyzer/profile;
- keep P898 evidence non-runtime during the evidence gate;
- keep the English Entity audit read-only;
- do not optimize the Entity SQLite layout yet;
- keep the existing German RhymePad Entity channel intact.

## Active consolidated evidence gate

Run:

```powershell
npm run entity:multilingual:evidence
```

Output:

```text
data/local/entity-multilingual-pronunciation-evidence-v1-report.json
```

The bundle combines the formerly separate resume steps:

1. existing Entity owner/P898 workflow;
2. frozen DE runtime fingerprint invariance;
3. accepted English Product marker/DB/profile validation;
4. exact source-backed en-US Entity-name matches;
5. bounded <=6-token source-backed English composition;
6. compact unresolved/source coverage diagnostics.

This is evidence-only. English Entity runtime promotion happens in the next implementation pass if the report is `evidence_ready`.

