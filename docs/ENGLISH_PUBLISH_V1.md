# English Publish v1 — Phase 12B4

Status: **candidate implementation / owner full build pending**

## Purpose

`rhymelab-en-publish-v1` is the source-backed English lexical/pronunciation layer between the Phase 12B source universe and the future Phase 12B5 local English Writer database.

It is not the final Writer population, not a product runtime, and not a G2P completion layer.

## Source-backed publish cut

A surface may enter the publish layer only when:

1. English Wiktionary/Wiktextract provides lexical evidence for the headword or listed form; and
2. at least one exact source-backed pronunciation exists from:
   - Wiktionary IPA, or
   - CMUdict exact normalized surface match.

Listed forms are retained only when they have an exact CMUdict pronunciation or the same normalized surface is independently pronunciation-backed as a headword.

No spelling-derived pronunciation is generated.

## Pronunciation policy

CMUdict:

- notation: ARPAbet;
- locale: `en-US`;
- alternate pronunciations are preserved separately;
- normalization uses `en-pron-v1-candidate`.

Wiktionary:

- notation: IPA;
- `en-US` and `en-GB` are preserved when source tags support them;
- unqualified IPA is stored as `source_attested_unprofiled`;
- unqualified IPA is never silently promoted to `en-US`;
- unsupported IPA remains source evidence with `analysis_status = unsupported_or_unparseable` rather than being discarded or guessed.

## Default eligibility

A published surface is `default_eligible` only when all of the following hold:

- at least one analyzed `en-US` pronunciation exists;
- the surface is not historical-only;
- the surface is not proper-name-only;
- ESDB does not mark the spelling/variant invalid.

Proper-name homographs are not over-filtered: a surface with both proper-name and ordinary lexical evidence is not excluded merely because one Wiktionary entry is a proper noun.

ESDB archaic/uncommon evidence by itself is retained as an independent signal and does not automatically override current Wiktionary evidence.

## Evidence retained per surface

- canonical/normalized surface;
- observed surface variants;
- POS evidence;
- source lemma/form relationships;
- lexical tags;
- current vs historical evidence counts;
- proper-name vs ordinary lexical evidence counts;
- all source-backed pronunciation variants;
- pronunciation source, notation and locale evidence;
- canonical phonology analysis when supported;
- ESDB size/region/POS/variant signals;
- wordfreq rank + Zipf score when present;
- explicit eligibility result + exclusion reasons.

## Determinism

Output is lexically sorted by normalized surface. wordfreq is evidence only and does not define the materialization order.

The builder writes deterministic JSONL shards plus a manifest containing:

- per-shard SHA-256;
- source snapshot IDs;
- counts;
- semantic fingerprint over all emitted JSONL rows.

The verifier recomputes the row fingerprint and checks default-eligibility invariants.

## Commands

```powershell
npm run en:publish
npm run en:publish:verify
```

Default output:

```text
data/local/en-publish-v1/
  manifest.json
  shard-000001.jsonl
  ...
```

## Explicit non-goals

Phase 12B4 does **not**:

- enable English in the product;
- create `rhymelab-en-v1.sqlite`;
- approve a final English Writer row count;
- introduce broad G2P;
- infer missing pronunciation from spelling;
- merge English into the frozen German Writer database;
- retune German phonology;
- resume Entity/P898 work.

Those remain later gates.
