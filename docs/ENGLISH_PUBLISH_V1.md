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


## Candidate policy v4 — bounded Tier-A recovery

Candidate policy:

```text
en-source-backed-publish-v4-tier-a-candidate
```

The publish schema remains `rhymelab-en-publish-v1`; this is a policy revision, not a schema reset.

Two bounded recovery channels are now implemented in the builder.

### Exact CMUdict possessive surface

A previously absent surface such as an apostrophe possessive may be admitted when:

- the normalized surface exists exactly in pinned CMUdict;
- the surface deterministically parses as `base + 's` or plural `base + '`;
- the base already exists in the source-backed publish candidate population;
- the base has an analyzed en-US pronunciation.

The surface pronunciation remains the exact CMUdict pronunciation. The lexical relationship is stored as `possessive_of` with evidence kind
`cmudict_exact_possessive_from_source_backed_base`.

This is not G2P.

### Punctuation-only explicit alias

A pronunciation-free Wiktionary headword may be recovered when:

- Wiktionary explicitly supplies an `alt_of` lemma relation;
- removing apostrophe/hyphen punctuation makes surface and lemma identical;
- exactly one such lemma target has analyzed en-US pronunciation.

The derived pronunciation is stored with source
`derived_punctuation_alias`.

The lexical source remains Wiktionary; the pronunciation identity is a deterministic consequence of the explicit punctuation-only alias relation and is not mislabeled as direct Wiktionary IPA.

### Regular inflection composition — accepted bounded v4 channel

The v2 CMUdict control benchmark passes for bounded source-backed regular morphology:

```text
19,993 control surfaces
95.46% full phoneme-sequence match
96.02% boundary-insensitive stressed-tail match
99.36% syllable-count match
96.92% stress-pattern match
```

The previously weak epenthetic rules reach 97.06% (`-ed` after /t,d/) and 95.47% (`-es` after a sibilant) boundary-insensitive tail agreement after preserving both common reduced-vowel variants.

Publish v4 therefore permits a derived pronunciation only when all of these hold:

- Wiktionary explicitly supplies `form_of` or `listed_form_of`;
- exactly one lemma+regular spelling shape survives the strict gate;
- source morphology tags identify plural/3sg, past/participle, or gerund/participle;
- abbreviation/initialism/acronym/letter/number/symbol/contraction/misspelling blockers are absent;
- the lemma already has analyzed en-US pronunciation evidence;
- the lemma pronunciation is not itself a `derived_inflection`.

Generated pronunciations use source `derived_inflection`, notation IPA and locale `en-US`. The derivation is single-hop and provenance-bearing.

Suffix set:

```text
plural:      /s/, /z/, /ɪz/, /əz/
past:        /t/, /d/, /ɪd/, /əd/
progressive: /ɪŋ/
```

Ambiguous or unresolved lemma relationships are rejected.

Strict tagless Wiktionary IPA remains non-en-US provenance. The v3 owner benchmark reached 76.52% boundary-insensitive stressed-tail agreement against explicit en-US controls, which is insufficient for silent en-US promotion.

Current candidate policy:

```text
en-source-backed-publish-v4-candidate
```

A full owner publish build/verify and coverage A/B are required before this policy can be frozen.


### Morphology benchmark v1 result

The first control benchmark covered 19,993 already source-backed inflected surfaces with exact CMUdict target pronunciations.

Overall:

```text
phoneme sequence            94.42%
boundary-insensitive tail   94.97%
syllable count              99.36%
stress pattern              96.93%
```

Non-epenthetic allomorphs are already around 95-98% boundary-insensitive rhyme-tail agreement. The weak classes are epenthetic `-es` after sibilants and `-ed` after /t,d/, where the original composer emitted only `/ɪz/` and `/ɪd/` but CMUdict often uses schwa-reduced `/əz/` and `/əd/`.

The recovery layer now preserves both reduced-vowel variants. This remains diagnostic-only; the publisher still has morphology composition disabled.

Next command:

```powershell
npm run en:pronunciation:inflection:diagnose
```

The v2 report must be reviewed before any derived inflection pronunciation becomes default-profile eligible.
