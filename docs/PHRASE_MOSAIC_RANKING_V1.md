# German Phrase / Mosaic Writer Ranking v1 — Phase 11E

Last updated: 2026-09-18

## Status

**11E2-v2 IMPLEMENTED / FIXTURE CI PENDING — v1 RETAINED AS CONTROL**

Phase 11D retrieval is accepted and frozen. Phase 11E consumes its output; it does not retune retrieval or phonetic relation truth.

Frozen input controls:

```text
11D1 window fingerprint
24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac

11D2 retrieval fingerprint
55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae

11D4 candidate anchor fingerprint
9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059

11D4 candidate diagnostic semantic fingerprint
4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd
```

The accepted single-word Writer policy `deterministic_writer_utility_v6` remains frozen and is not modified by this phase.

## Goal

Turn the accepted cross-word phonetic candidate pool into a useful Writer result page without corrupting phonetic truth.

The retrieval layer answers:

> Which attested cross-word spans are plausible phonetic matches?

The ranking layer answers:

> Which of those valid matches should a lyricist see first?

Those are separate decisions and must remain separately inspectable.

## Evidence motivating 11E

11D4 solved the retrieval-specific failures:

- `Musik` now receives a legitimate multi-syllable `full_surface` query domain;
- weak/unrelated returned rows fell from 55.84% to 3.40%;
- dependence on the broad final fallback fell from 65.98% to 31.01%;
- known strong results remained intact.

The remaining top-result problems are product-quality problems. Examples include phonologically plausible but lexically poor surfaces such as `Musik -> K.-o.-Siegen`, and strong phonetic matches that are not automatically strong songwriting suggestions such as `Gedanken -> notleidende Banken`.

## Hard boundaries

11E must not:

- alter `de-phon-v3` scoring;
- alter rhyme relation labels;
- alter 11D1/11D2/11D4 retrieval fingerprints;
- mutate `deterministic_writer_utility_v6`;
- fabricate frequency/commonness;
- treat optional specialist register corpora as general German commonness;
- use LLM, ML, embeddings, neural ranking, hosted ranking, or runtime network access;
- silently delete provenance or hide why a result was demoted.

## Candidate evidence available now

### Phonetic evidence

Already emitted by frozen 11D4:

- primary relation type;
- overall phonetic score;
- vowel/coda/stress/syllable/onset/consonance subscores;
- independent Assonance / Consonance relations;
- matched syllable count;
- query anchor kind;
- retrieval channels;
- number of crossed word boundaries;
- token-span coordinates.

### General commonness evidence

`phrase_usage_evidence` contains exact-token-sequence Leipzig evidence per corpus:

- occurrence count;
- sentence count;
- corpus token count;
- corpus sentence count;
- per-million-token rate;
- per-million-sentence rate.

The frozen general-purpose corpora are:

- `deu_news_2024_1M`;
- `deu_wikipedia_2021_1M`;
- `deu-de_web_2021_1M`.

11E may aggregate those rows deterministically, including:

- number of Leipzig corpora with evidence;
- summed occurrence/sentence evidence;
- equal-weight per-corpus normalized commonness.

Missing Leipzig evidence means **unknown/unattested in these three corpora**, not automatically obsolete or invalid.

### Phraseological evidence

The base phrase catalog preserves source-backed:

- phrase type set;
- historical/current eligibility;
- Wiktionary attestation metadata;
- source style tags and source POS.

Useful phrase types include explicit `phrase`, `idiom`, `proverb`, `figurative`, and `multiword_lexeme`. Type is a usefulness/product signal only; it does not change phonetic truth.

### Register evidence

Optional Cologne Kiezdeutsch evidence may be exposed as a separate register signal. It must never be folded into the Leipzig general-commonness score or treated as representative German frequency.

## Phase 11E1 — ranking evidence enrichment

First implementation should enrich every 11D4 candidate with deterministic ranking evidence before introducing a final page policy.

Required per-candidate fields:

```text
phonetic_type
phonetic_score
matched_syllables
crossed_word_boundaries

modern_eligible
historical_state

leipzig_corpus_count
leipzig_occurrence_sum
leipzig_sentence_sum
leipzig_equal_weight_commonness

phrase_types
style_tags

surface_safety_class
surface_safety_reasons

query_token_overlap
```

All derived fields must have explicit deterministic formulas.

## Surface safety

Surface safety exists to prevent clearly machine-unfriendly lexical surfaces from dominating merely because their IPA happens to match.

The first candidate policy may identify transparent structural markers such as:

- dotted single-letter abbreviation sequences;
- digit-bearing lexical surfaces;
- punctuation-heavy or fragmented forms;
- implausibly short alphabetic token fragments;
- historical-only surfaces.

Surface safety must be deterministic and explainable. It is not a spelling-based rhyme score and must never modify phonetic relation labels.

Marked surfaces should initially be **demoted rather than deleted**, except for already-existing eligibility exclusions.

## Commonness

Initial commonness must use only stored Leipzig evidence.

Preferred formulation for the first candidate:

1. compute per-corpus `log1p(per_million_sentences)`;
2. average equally over the three frozen corpora, treating absent evidence as zero evidence for this bounded corpus sample;
3. preserve `corpus_count` separately so the UI/diagnostics can distinguish breadth from magnitude.

The exact formula must be fixture-tested and recorded in the candidate policy id.

Do not claim that this is absolute German-language frequency.

## Phrase type

Phrase type may provide a modest deterministic usefulness prior.

The initial candidate must not hard-code the assumption that every idiom is better than every multiword lexeme. Type should act as a bounded product signal, subordinate to phonetic validity and strong commonness evidence.

## Query lexical overlap

A mosaic result that simply contains the query word or an obvious normalized duplicate is often less useful than a genuinely cross-word alternative.

11E may compute deterministic normalized token overlap between the query surface and the candidate phrase. This is a result-usefulness signal only.

It must not change phonetic classification.

## Ranking architecture

The first 11E candidate should separate three stages:

```text
frozen 11D4 phonetic candidates
  -> evidence enrichment
  -> deterministic phrase utility ordering
  -> deterministic page diversification
```

### Stage 1 — phonetic guard

Only consume the frozen 11D4 returned pool. Do not reopen weak/unrelated rows filtered by 11D4.

### Stage 2 — phrase utility

The first candidate should use explicit, inspectable components rather than an opaque learned score.

Recommended components:

- phonetic quality;
- commonness breadth/magnitude;
- surface safety;
- phraseological type;
- matched-span strength;
- lexical novelty.

Every result in diagnostics must expose the component values and final utility.

### Stage 3 — page diversification

Diversification is separate from per-candidate utility.

The page layer should deterministically suppress excessive repetition of:

- the same canonical phrase;
- inflectional/surface variants of the same obvious template where a deterministic key exists;
- near-identical lexical frames;
- one phrase family monopolizing the top page.

Do not falsify diversity by relabeling phonetic relations or randomly shuffling results.

## Initial acceptance queries

The existing representative suite remains useful as a structural control, but 11E diagnostics should explicitly inspect at least:

- `Arbeitsweise` — preserve strong cross-word family/slant results while reducing repetitive `beiseite` variants;
- `Liebe` — preserve the exact multi-syllable perfect result;
- `Leben` — avoid promoting the lone weak/consonance survivor merely to fill a page;
- `Feuer` — allow an empty page when no valid candidates exist;
- `Gedanken` — test whether strong phonetics can be ordered by phrase usefulness;
- `Freiheit` — preserve the strong `dabei seid` result;
- `Musik` — specifically demote abbreviation-like `K.-o.-Siegen` surfaces;
- `hitzefrei` — preserve the strong family result while reducing template repetition.

## Acceptance gates

11E1/11E2 must demonstrate:

1. **Frozen input invariance** — 11D4 fingerprints unchanged.
2. **Determinism** — independent runs produce identical ranking fingerprints.
3. **Phonetic preservation** — protected high-quality results remain available and their relation/score fields are unchanged.
4. **Surface-safety improvement** — obvious abbreviation/fragment noise is materially demoted.
5. **Commonness behavior** — Leipzig-attested phrases gain transparent preference without treating missing evidence as linguistic invalidity.
6. **Phraseological usefulness** — explicit phrase/idiom/proverb evidence can help ordering but does not overpower substantially better phonetics.
7. **Diversity** — top-page duplicate/template concentration decreases deterministically.
8. **Empty-page safety** — ranking never invents/fills results when retrieval returns none.
9. **Performance** — evidence joins and ranking remain practical on the owner-local DB.
10. **No Writer regression** — single-word Writer remains untouched.

Human NDCG remains deferred until the broader German Writer surface is mature and independent reviewers are available.

## Implementation sequence

### 11E1

Implemented at code/fixture level:

- ranking-evidence enrichment core;
- deterministic surface-safety classifier;
- Leipzig aggregate commonness;
- source-backed style-tag aggregation;
- normalized query-token overlap;
- stable evidence fingerprint;
- fixture tests;
- diagnostic report that shows raw 11D4 order versus enriched evidence;
- command `npm run phrase:mosaic:rank:evidence`;
- no candidate reordering in 11E1.

### 11E2

Owner 11E1 evidence established the constraints:

```text
Leipzig evidence       312 / 1,237 (25.22%)
no Leipzig evidence    925 / 1,237 (74.78%)
surface safe         1,219 / 1,237 (98.54%)
surface marked           4 / 1,237 (0.32%)
query overlap            0 / 1,237
```

Implemented candidate policy `de-phrase-writer-utility-v1-candidate`:

- relation-type base: perfect 1.00, multisyllabic slant 0.82, family 0.78, slant 0.65, weak 0.25;
- phonetic overall score weight: 0.45;
- matched-span bonus: max +0.03;
- Leipzig breadth+magnitude bonus: max +0.10;
- phrase-type prior: max +0.025, non-cumulative;
- marked surface penalty: -0.35;
- restricted surface penalty: -0.50;
- query-token-overlap penalty: max -0.08 (currently inert on the owner suite);
- deterministic tie-breakers and whole-suite ranking fingerprint;
- same-process raw-vs-ranked owner diagnostic via `npm run phrase:mosaic:rank:v1`;
- explicit protected-result reporting for `Liebe`, `Freiheit`, `Musik`, and `Leben`;
- no page diversification yet.

v2 implementation:

```text
schema        rhymelab-phrase-mosaic-ranking-candidate-v2
policy        de-phrase-writer-utility-v2-phonetic-guard-candidate
band width    0.02
command       npm run phrase:mosaic:rank:v2
```

Ordering guards are lexicographic: default Writer-page eligibility -> safety class -> primary relation type -> phonetic near-tie band -> v1 control utility -> phonetic/stable tie-breakers.

The 0.02 band is intentionally conservative: v1 owner evidence showed unacceptable top-score drops of 0.078 (`verloren`), 0.058 (`Spotify`) and 0.040 (`hitzefrei`). Product evidence must not cross such gaps. Safety demotion remains exempt because it addresses known malformed/abbreviation surfaces.

`weak`, restricted and non-modern candidates are retained in diagnostics but excluded from the default Writer page; this makes `Leben` capable of correctly returning an empty phrase page without deleting provenance.

Owner A/B result for v1:

```text
suite ranking fingerprint   593142fc70cc1e7b760d6bca3d94ea233c0bcaaf295f6f47f7659ccc7e805de4
changed tops                6 / 12
marked top20                4 -> 0
Leipzig-backed top20       48 -> 100
```

v1 is **not accepted for promotion**. Safety behavior is correct, but the additive utility allows commonness to cross phonetic gaps that are too large for a rhyme-first Writer. `Leben` also demonstrates that page eligibility must be distinct from diagnostic candidate retention.

11E2-v2 requirements:

- preserve v1 as control;
- same safety class before product reranking; marked remains demoted;
- same primary phonetic relation type before product reranking;
- commonness/type bonuses may reorder only within a 0.02 phonetic near-tie band;
- `weak` candidates remain diagnostic but default Writer-page ineligible;
- restricted/historical-only surfaces remain diagnostic but default Writer-page ineligible;
- no page diversification yet.

### 11E3

- page diversification candidate;
- duplicate/template diagnostics;
- owner full-data acceptance and repeatability.

### 11E4

Only after accepted ranking/diversity gates:

- phrase Writer runtime/API/UI integration;
- combined German Writer structural benchmark;
- later independent human-reference evaluation when available.
