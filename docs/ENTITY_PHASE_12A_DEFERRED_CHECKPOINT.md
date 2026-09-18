# Phase 12A Entity Lexicon — Deferred / Frozen Checkpoint

Last updated: 2026-09-18

Status: **DEFERRED / FROZEN WHILE PHASE 12B ENGLISH WORD WRITER PROCEEDS**

## Decision

Phase 12A Entity work is intentionally paused at the current validated checkpoint.

Do not continue Entity pronunciation enrichment, P898 owner materialization, category tuning, source expansion, G2P experiments, or Entity database optimization until the English single-word Writer database/runtime has been built and accepted far enough to resume Entity work coherently.

This is a sequencing decision, not an Entity rejection.

## Frozen code checkpoint

The last merged Entity change before this deferral is PR #70, which added the qualified Wikidata P898 pronunciation evidence layer.


The P898 source layer exists in code, but the owner explicitly did **not** execute the new P898 owner workflow after PR #70.

Therefore no full-data P898 materialization result is accepted or claimed.

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

## Frozen Entity boundaries

While deferred:

- do not change the accepted retained Entity population;
- do not retune Hybrid-v2;
- do not refetch/restage Phase 12A2 Entity/QRank sources;
- do not mass-G2P unresolved proper names;
- do not promote generic Wikidata `de`/`en` evidence to `de-DE`/`en-US`;
- do not route CMUdict into `de-ipa-v2`;
- do not optimize the Entity SQLite layout;
- do not remove the existing RhymePad Entity channel;
- do not claim P898 owner/full-data coverage until the owner workflow is actually run.

## Resume condition

Resume Phase 12A/12C Entity work only after the English single-word Writer has:

1. a pinned English source stack;
2. a real English phonology/analyzer/scorer;
3. a materialized local English Writer DB;
4. an accepted initial English benchmark/runtime checkpoint.

At that point the English pronunciation stack can be reused for Entity `en-US` pronunciation promotion instead of inventing a second incompatible English phone model.

## Resume order

When Entity work resumes:

1. run `npm run entity:pronunciation:owner`;
2. verify DE Entity runtime fingerprint invariance;
3. review actual retained-Entity P898 evidence;
4. promote only pronunciations supported by the accepted English profile;
5. use CMUdict exact matches through that English profile;
6. measure remaining multilingual/proper-name gaps;
7. only then evaluate additional source-backed pronunciation layers or audited G2P candidates.
