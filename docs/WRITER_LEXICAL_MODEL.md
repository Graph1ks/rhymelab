# Writer lexical / morphology data model

Status: design baseline for the experimental German writer-search branch  
Date: 2026-09-17

This document defines the next storage/materialization step after the German Writer Page Benchmark v2 structural baseline. It is a design contract only. It does **not** authorize rebuilding the owner database or promoting writer search.

## Problem statement

The accepted DB v4 `hot` table is pronunciation-oriented and stores one selected `lemma` / `pos` / `gender` analysis on every pronunciation row for a surface form.

The current publish builder has richer source evidence available, but reduces it before publish:

```text
Kaikki/Wiktextract entry/form evidence
  -> resolver options
  -> mergeOptions(...)
  -> bestAnalysis(...)
  -> record.analysis
  -> compact publish l/p/g
  -> DB-v4 hot lemma/pos/gender
```

That reduction is acceptable for the accepted legacy rhyme path because legacy phonetic retrieval/scoring does not depend on morphology. It is not sufficient as the final substrate for writer morphology, family diversity, compound/head evidence or future phrase work.

A surface form can legitimately have several source-supported analyses with equal or near-equal confidence. `stufenweise` is the motivating live case: the source can support adjective and adverb analyses, while DB v4 exposes only whichever deterministic selection happened to win. Writer logic must not turn that incidental selection into semantic truth.

## Existing source-supported analysis payload

`scripts/kaikki-resolver-lib.mjs` already exposes the evidence needed to preserve ambiguity. A merged analysis can contain:

- `resolutionKey`;
- `lemma` and `normalizedLemma`;
- `pos`;
- `homographNo`;
- `confidence`;
- `gender`;
- `isProper`;
- `isObsolete`;
- `historicalOnly`;
- `styleTags`;
- `formFeatures`;
- one or more `matchKinds`;
- one or more `sourceRecordKeys`;
- pronunciation candidates where supplied by the lexical record.

`resolutionKey` is already deterministic for `(normalized lemma, POS, homograph number)`. `mergeOptions()` already merges repeated evidence for the same resolution while retaining source-record and match-kind provenance.

The missing step is preserving **all merged resolution options per surface form** instead of reducing them to `bestAnalysis()`.

## Design principles

1. **Preserve ambiguity; do not guess it away.** Every source-supported merged lexical analysis needed by writer logic remains available with provenance.
2. **Legacy isolation first.** The accepted `ranking=legacy` path must continue to use the accepted phonology/relation behavior until an explicit migration is accepted.
3. **No invented morphology.** Materialized morphology is derived evidence with a policy/version and supporting lexical-analysis IDs; it is not claimed to be dictionary-attested full morphology.
4. **Deterministic combination rules.** Multiple analyses must not make result order depend on source iteration order.
5. **Separate lexical truth from product policy.** Usage, writer safety, cheapness and page diversity remain product/ranking signals, not lexical assertions.
6. **Index the validated retrieval keys.** The final writer path must not rely on broad runtime suffix `LIKE` scans.
7. **Keep provenance auditable.** It must be possible to explain which source-supported analysis and which deterministic rule produced a family/head/anchor decision.

## Proposed logical model

The names below are provisional, but the separation of concerns is required.

### 1. Form identity

A form-level record owns data that does not belong to one pronunciation or one lexical analysis:

```text
form
  form_id
  publish_order
  surface
  normalized
  usage_rank / usage evidence
  lexicon_layer / entity_kind
  historical aggregate state
  lexical style aggregate state
```

During migration, the existing deterministic `publish_order` can provide the form-level bridge. A future schema may expose an explicit `form_id`; downstream code must not use pronunciation-row IDs as lexical-analysis identity.

### 2. Pronunciation variants

Pronunciations remain one-to-many from the form and keep the existing provenance/eligibility fields:

```text
pronunciation
  pronunciation_id
  form_id
  ipa
  canonical phonemes
  syllable/stress fields
  accepted legacy retrieval keys
  preferred / eligible / rank
  source / tags / raw tags / flags
  locale / dialect / register
```

The accepted phonetic analyzer/scorer/relation policy does not change as part of this data-model work.

### 3. Multiple lexical analyses

Introduce a normalized form-analysis relation. One row represents one merged resolver resolution, not one pronunciation:

```text
form_analysis
  form_id
  analysis_key              # resolver resolutionKey
  lemma
  normalized_lemma
  pos
  homograph_no
  confidence
  gender
  is_proper
  is_obsolete
  historical_only
  style_tags
  form_features
  match_kinds
  source_record_keys
  lexical_source
  resolver_policy
```

Required uniqueness:

```text
UNIQUE(form_id, analysis_key)
```

All arrays are deterministically sorted before serialization/fingerprinting.

`confidence` may order explanations or deterministic processing, but it must **not** silently delete equal-confidence alternatives.

### 4. Materialized writer morphology evidence

Writer morphology should be materialized separately from source lexical analyses:

```text
writer_morphology_evidence
  form_id
  morphology_policy
  analysis_key
  status
  family_key
  construction_rule
  split_index
  left_normalized
  right_normalized
  right_head_lemma
  evidence payload / checks
```

Every materialized row points back to the lexical analysis that supported it and records the policy/rule version that derived it.

This table is derived RhymeLab evidence. It must never overwrite source lexical analysis rows.

### 5. Materialized right-edge anchors

Validated writer anchors should be materialized per pronunciation:

```text
writer_anchor
  pronunciation_id
  anchor_policy
  anchor_kind
  anchor_position
  nuclei
  anchor_key
  tail
```

At minimum the materialization must cover the currently validated `de-right-edge-anchors-v1` keys, including the secondary-anchor channels that recover `Arbeitsweise -> Hochzeitsreise`.

Required lookup shape:

```text
(anchor_policy, anchor_key)
```

with enough attached form/pronunciation eligibility metadata to retrieve current/preferred candidates without scanning arbitrary suffixes.

The final runtime should perform indexed equality/range lookups over materialized keys, then merge/dedupe with accepted/base retrieval. Broad suffix `LIKE` probing is a validation prototype only.

## Multi-analysis morphology resolution policy

Writer decisions must consider the set of source-supported analyses, not one selected row.

For each form:

1. derive morphology candidates independently for every eligible `form_analysis` under the active morphology policy;
2. preserve every evidence record for explanation/debugging;
3. collect the distinct supported `family_key` values;
4. resolve a hard writer family only when the supported evidence converges on exactly one family key;
5. if source-supported analyses produce conflicting family keys, expose the ambiguity but return no hard family for query cheapness/diversity until a deterministic rule resolves it;
6. if no analysis satisfies the morphology gates, remain `unresolved`;
7. explicit construction rules such as `de-adverbial-weise-v2` remain versioned evidence, not generic suffix matching.

This is deliberately conservative. A false hard family is more damaging than an unresolved form because family evidence changes page order.

### Example: productive `-weise`

If `stufenweise` carries both supported adjective and adverb analyses and both lead through the explicit construction rule to:

```text
right:weise
```

the family resolves cleanly because the analyses converge.

### Example: conflicting analyses

If two source-supported analyses imply different right heads/families, writer morphology records both derivations but does not choose one merely because one resolver row sorts first.

## Publish-layer migration

The current compact publish v2 format writes only one selected lexical analysis through `l`, `p`, `g`.

The next publish schema should preserve a compact analysis array per form, conceptually:

```text
{
  "w": "...",
  "n": "...",
  "a": [
    {
      "k": "analysis-key",
      "l": "lemma",
      "nl": "normalized-lemma",
      "p": "pos",
      "h": 1,
      "c": 0.98,
      "g": "...",
      "mk": ["headword"],
      "sr": ["dewiktionary:..."],
      "st": [],
      "ff": []
    }
  ],
  "r": [ ... pronunciations ... ]
}
```

Exact compact field names are implementation details and should be fixed only with tests. The required semantic contract is the preservation of all merged analyses and their provenance.

During migration it is acceptable to retain a deterministic compatibility projection for old consumers, but writer logic must use the multi-analysis relation once the new layer is accepted.

## SQLite migration strategy

Do not mutate the accepted DB-v4 file in place during this design phase.

Recommended implementation sequence:

1. teach the publish builder to retain merged analysis sets in a new publish schema/fixture path;
2. add deterministic fixture tests before touching the owner DB;
3. extend the local DB builder with normalized analysis/anchor/morphology tables under a new schema version;
4. keep the accepted legacy hot-path semantics reproducible during comparison;
5. materialize writer morphology and right-edge anchors during build, never lazily through network/runtime services;
6. add indexes and inspect SQLite query plans;
7. rebuild only when the owner explicitly reaches the migration gate;
8. compare the new materialized writer path against the frozen v6/v4 benchmark baseline before promotion.

## Required invariants and tests

### Lexical-analysis preservation

- equal-confidence distinct `resolutionKey` analyses survive publish and DB build;
- repeated source evidence for the same `resolutionKey` merges deterministically;
- `sourceRecordKeys`, `matchKinds`, style tags and form features remain provenance-bearing and deterministically ordered;
- source iteration order does not change the emitted analysis set or fingerprint.

### Morphology safety

Permanent fixtures/regressions must include:

```text
stufenweise       -> right:weise via de-adverbial-weise-v2
 ausnahmsweise    -> right:weise via de-adverbial-weise-v2
 abschnittsweise  -> right:weise via de-adverbial-weise-v2
 auszugsweise     -> right:weise via de-adverbial-weise-v2
 Verweise         -> unresolved / no false right:weise
 Betriebe         -> unresolved / no bet|riebe
 Bestreben        -> unresolved / no best|reben
 Professoren      -> unresolved / no profes|soren
 deutscher        -> unresolved / no deut|scher
```

### Retrieval equivalence

For the frozen Writer Page Benchmark v2 battery:

- materialized right-edge retrieval must retain every protected writer candidate currently found by the validation prototype;
- `Arbeitsweise -> Hochzeitsreise` remains present, perfect-class under the writer anchor and cheap penalty 0;
- at least one `right:reise` member remains in Top 20;
- no repeated-family structural regression is introduced;
- accepted/base candidate behavior under `ranking=legacy` remains invariant.

### Runtime/performance evidence

Before promotion, record at least:

- per-query writer elapsed time on the benchmark battery;
- candidate counts by retrieval channel;
- SQLite size delta;
- query plans for materialized anchor/morphology lookups;
- proof that the final right-edge path no longer performs broad suffix `LIKE` scans;
- deterministic result equality across repeated runs on the same DB.

A numeric desktop/mobile latency target should be set from measured materialized prototypes, not invented in this design document.

## Current acceptance boundary

The 2026-09-17 Writer Page Benchmark v2 structural run on `deterministic_writer_utility_v6` / `de-attested-right-head-v4` is the correctness baseline for this work:

- structural gate passed;
- 12/12 queries succeeded;
- aggregate Top-10 and Top-20 repeated-family rows: 0;
- legacy top-250 tier-0 retention: 685/685;
- `Arbeitsweise -> Hochzeitsreise`: retained at rank 120, `multisyllabic_perfect`, score 1, cheap penalty 0;
- `right:reise` family surfacing: `Weiterreise` rank 3;
- direct productive-`-weise` and false-split morphology regressions passed;
- human usefulness NDCG remains `pending_reference` until independent labels completely cover the relevant writer cutoffs.

This baseline freezes correctness; it does **not** accept current validation-time latency or the single-analysis DB model.

## Next engineering gates

1. Run the existing accepted-runtime candidate benchmark as the owner-local `ranking=legacy` invariance gate.
2. Keep PR #3 draft while that owner-local report is pending.
3. Implement multi-analysis publish/storage first on fixtures and tests; do not rebuild the owner DB yet.
4. Materialize/index right-edge anchors and morphology evidence only after the new lexical model preserves provenance correctly.
5. Re-run Writer Page Benchmark v2 against the materialized runtime.
6. Produce an explicit writer-search acceptance report before changing the accepted/base default.

Phrase/mosaic rhyme, English and cross-language work remain after German single-word writer-search acceptance.