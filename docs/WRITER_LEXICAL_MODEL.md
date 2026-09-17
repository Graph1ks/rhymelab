# Writer lexical / morphology data model

Status: design baseline + experimental publish/storage migration contract  
Date: 2026-09-17

This document defines the storage/materialization path for the German writer-search branch. The multi-analysis publish/storage contract is now implemented behind explicit experimental schemas, but it still does **not** authorize rebuilding or replacing the accepted owner DB by default.

## Problem statement

The accepted DB v4 `hot` table is pronunciation-oriented and stores one selected `lemma` / `pos` / `gender` analysis on every pronunciation row for a surface form.

The original publish builder had richer source evidence available, but reduced it before publish:

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

`resolutionKey` is deterministic for `(normalized lemma, POS, homograph number)`. `mergeOptions()` merges repeated evidence for the same resolution while retaining source-record and match-kind provenance.

The writer layer must preserve **all merged resolution options per surface form** instead of reducing them to `bestAnalysis()`.

## Design principles

1. **Preserve ambiguity; do not guess it away.** Every source-supported merged lexical analysis needed by writer logic remains available with provenance.
2. **Legacy isolation first.** The accepted `ranking=legacy` path keeps the accepted phonology/relation behavior until an explicit migration is accepted.
3. **No invented morphology.** Materialized morphology is derived evidence with a policy/version and supporting lexical-analysis IDs; it is not claimed to be dictionary-attested full morphology.
4. **Deterministic combination rules.** Multiple analyses must not make result order depend on source iteration order.
5. **Separate lexical truth from product policy.** Usage, writer safety, cheapness and page diversity remain product/ranking signals, not lexical assertions.
6. **Index the validated retrieval keys.** The final writer path must not rely on broad runtime suffix `LIKE` scans.
7. **Keep provenance auditable.** It must be possible to explain which source-supported analysis and which deterministic rule produced a family/head/anchor decision.

## Logical model

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

During migration, deterministic `publish_order` is the form-level bridge. Downstream code must not use pronunciation-row IDs as lexical-analysis identity.

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

The experimental v5 model introduces a normalized form-analysis relation. One row represents one merged resolver resolution, not one pronunciation:

```text
form_analysis
  form_id
  analysis_key
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
  candidate_ipas
```

Required identity:

```text
PRIMARY KEY(form_id, analysis_key)
```

All arrays are deterministically sorted before serialization/storage. `confidence` can order explanations or deterministic processing but does **not** delete equal-confidence alternatives.

Implementation:

```text
scripts/writer-lexical-storage-v5-core.mjs
```

### 4. Materialized writer morphology evidence — next

Writer morphology will be materialized separately from source lexical analyses:

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

Every materialized row must point back to the lexical analysis that supported it and record the policy/rule version that derived it. This table is derived RhymeLab evidence and must never overwrite source lexical analysis rows.

### 5. Materialized right-edge anchors — next

Validated writer anchors will be materialized per pronunciation:

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

At minimum the materialization must cover the currently validated `de-right-edge-anchors-v1` keys, including secondary-anchor channels that recover `Arbeitsweise -> Hochzeitsreise`.

Required lookup shape:

```text
(anchor_policy, anchor_key)
```

The final runtime should perform indexed equality/range lookups over materialized keys, then merge/dedupe with accepted/base retrieval. Broad suffix `LIKE` probing is a validation prototype only.

## Multi-analysis morphology resolution policy

Writer decisions consider the set of source-supported analyses, not one selected row.

For each form:

1. derive morphology candidates independently for every eligible `form_analysis` under the active morphology policy;
2. preserve every evidence record for explanation/debugging;
3. collect the distinct supported `family_key` values;
4. resolve a hard writer family only when supported evidence converges on exactly one family key;
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

## Experimental publish v3 contract — implemented

The accepted compact publish v2 format writes one selected lexical analysis through `l`, `p`, `g`.

The experimental schema is:

```text
rhymelab-de-publish-v3
```

A form can carry compact analysis array `a[]`:

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
      "sr": ["source-record-key"],
      "st": [],
      "ff": [],
      "ci": []
    }
  ],
  "r": [ ... pronunciations ... ]
}
```

Optional booleans use compact presence flags:

```text
ip = is_proper
io = is_obsolete
ho = historical_only
```

Legacy `l/p/g` remain in v3 only as a deterministic compatibility projection: highest confidence, then `analysis_key` as tie-break. Writer semantics must use `a[]` / normalized `form_analysis`, not treat compatibility fields as full lexical truth.

Core implementation:

```text
scripts/writer-lexical-publish-v3-core.mjs
```

The v3 analysis fingerprint is computed from deterministic compact analysis serialization, so source iteration order cannot change it.

### Builder selection

The accepted default remains publish v2:

```powershell
node scripts/build-de-rhyme-publish.mjs
```

The experimental v3 path is explicit:

```powershell
node scripts/build-de-rhyme-publish.mjs --writer-lexical-v3
```

If `--out` is not supplied, the v3 path writes to `data/de/publish-v3`, not the accepted `data/de/publish` location.

This command is documented for the migration contract; it is **not** currently an instruction to rebuild the owner dataset.

## Experimental SQLite v5 contract — implemented

`build-local-db.mjs` continues to map publish v2 to accepted DB v4. It additionally recognizes publish v3 and produces:

```text
rhymelab-local-db-v5
```

The v5 path preserves the existing `hot` layout for compatibility comparisons and adds normalized `form_analysis` storage.

For publish-v3 input, if output paths are not explicitly supplied, the builder uses separate local filenames rather than overwriting accepted v4 outputs.

The v5 build report records:

- analysis row count;
- base forms with any lexical analysis;
- base forms with multiple lexical analyses;
- base forms without analyses;
- supplemental new forms that do not yet have source lexical analyses.

Curated supplemental modern pronunciations continue to live in `hot`. The migration does not fabricate source lexical-analysis rows for them.

## Fixture/test contract — implemented

Files:

```text
tests/fixtures/writer-lexical-v3-options.json
tests/writer-lexical-model.test.mjs
tests/writer-lexical-publish-storage.test.mjs
tests/local-db-writer-lexical-v5.test.mjs
```

The fixture contract verifies:

- equal-confidence adjective/adverb analyses survive normalization and publish;
- repeated source evidence for the same `resolutionKey` merges deterministically;
- source-record keys, match kinds, style tags and form features remain provenance-bearing and sorted;
- source iteration order does not change `a[]` or the analysis fingerprint;
- compatibility projection remains deterministic;
- one normalized DB row exists per `(form_id, analysis_key)`;
- duplicate analysis identity fails the storage invariant;
- the real local DB builder can consume a tiny publish-v3 fixture and produce a DB-v5 fixture while preserving legacy `hot` compatibility fields.

## Morphology safety contract

Permanent regressions remain:

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

## Retrieval equivalence contract

For the frozen Writer Page Benchmark v2 battery:

- materialized right-edge retrieval must retain every protected writer candidate currently found by the validation prototype;
- `Arbeitsweise -> Hochzeitsreise` remains present, perfect-class under the writer anchor and cheap penalty 0;
- at least one `right:reise` member remains in Top 20;
- no repeated-family structural regression is introduced;
- accepted/base candidate behavior under `ranking=legacy` remains invariant.

The owner-local legacy/runtime gate has already passed with 27/27 queries, no missing queries, and empty runtime-candidate, policy and protected-order mismatch arrays. It used invariance-only mode because the historical local human-review assets were absent; that is sufficient for this control-path gate but does not recreate historical NDCG/pairwise values.

## Runtime/performance evidence required before promotion

Record at least:

- per-query writer elapsed time on the benchmark battery;
- candidate counts by retrieval channel;
- SQLite size delta;
- query plans for materialized anchor/morphology lookups;
- proof that the final right-edge path no longer performs broad suffix `LIKE` scans;
- deterministic result equality across repeated runs on the same DB.

A numeric desktop/mobile latency target should come from measured materialized prototypes, not be invented in advance.

## Current correctness baseline

The 2026-09-17 Writer Page Benchmark v2 structural run on `deterministic_writer_utility_v6` / `de-attested-right-head-v4` remains the correctness baseline:

- structural gate passed;
- 12/12 queries succeeded;
- aggregate Top-10 and Top-20 repeated-family rows: 0;
- legacy top-250 tier-0 retention: 685/685;
- `Arbeitsweise -> Hochzeitsreise`: rank 120, `multisyllabic_perfect`, score 1, cheap penalty 0;
- `right:reise` family surfacing: `Weiterreise` rank 3;
- direct productive-`-weise` and false-split morphology regressions passed;
- human usefulness NDCG remains `pending_reference` until independent labels completely cover the relevant writer cutoffs.

This baseline freezes correctness; it does **not** accept current validation-time latency or the single-analysis accepted DB model.

## Next engineering gates

1. Keep accepted publish-v2 / DB-v4 defaults untouched.
2. Materialize/index `de-right-edge-anchors-v1` per pronunciation in the experimental v5 path.
3. Materialize/version `de-attested-right-head-v4` morphology evidence per `analysis_key`.
4. Preserve hard-family convergence/ambiguity semantics from `resolveWriterFamilyConsensus()`.
5. Add fixture-level indexed retrieval/evidence tests and SQLite query-plan assertions.
6. Demonstrate candidate/regression equivalence before any owner DB rebuild.
7. Only then rebuild an experimental owner v5 DB for size/runtime measurement.
8. Re-run Writer Page Benchmark v2 against the materialized runtime.
9. Produce an explicit writer-search acceptance report before changing the accepted/base default.

PR #3 remains draft. Phrase/mosaic rhyme, English and cross-language work remain after German single-word writer-search acceptance.
