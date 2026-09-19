# Phase 12C — Entity Proper-Name G2P Decision

Status: **CLOSED / generated runtime fallback rejected**

## Accepted control

The accepted control remains the 600-case proper-name token benchmark v2:

- unique normalized Entity-name tokens;
- explicit en-US Kaikki/Wiktionary proper-name IPA controls;
- no CMUdict-as-gold shortcut;
- no generated runtime promotion.

Benchmark fingerprint:

```text
02e0e3a330434676164bb6837793774a3edf69fdb7683b6035fa2cdf979b172a
```

## Candidate results

| Metric | MFA english_us_arpa | g2p-en forced neural |
|---|---:|---:|
| Model-input eligible | 599 / 600 | 596 / 600 |
| Prediction coverage on eligible | 100% | 100% |
| Evaluated | 597 | 596 |
| Exact phones | 70.35% | 64.60% |
| Exact stressed rhyme tail | 71.19% | 64.26% |
| Syllable count | 95.98% | 93.62% |
| Stress pattern | 80.57% | 81.88% |
| Primary stress | 94.14% | 91.95% |
| Mean RhymeLab rhyme score | 0.913040 | 0.891655 |

MFA calibrated evaluation fingerprint:

```text
9bc00102d46af55352505389c03fe048083cdd81c966007ab86924d9df233488
```

g2p-en owner evaluation fingerprint:

```text
5511c6e2c83550b753692a64a1485302c88b61b5bc4acecf4a3a8e29937061b6
```

## MFA confidence result

MFA's Pynini path score is not selective enough to rescue runtime promotion:

```text
best 10% exact-tail                 86.67%
retention at >=90% exact-tail       1.68%   (10 / 597)
retention at >=85% exact-tail      21.94%   (131 / 597)
```

That is insufficient useful coverage for the remaining unresolved Entity population.

## Independent candidate result

The independent `g2p-en` benchmark forced `G2p.predict()` directly and explicitly bypassed:

- CMUdict lookup;
- homograph lookup;
- POS routing.

The bundled `checkpoint20.npz` therefore represents a real independent neural prediction path for this benchmark.

It performs materially worse than MFA on the product-critical exact stressed rhyme tail:

```text
MFA exact-tail      71.19%
g2p-en exact-tail   64.26%
delta                -6.93 percentage points
```

## Evaluator confidence bug

The g2p-en candidate does not emit a confidence score.

The owner report fingerprint above contains a non-semantic reporting defect in its `confidence_calibration` block: `null` was coerced through `Number(null)` to `0` before score calibration. This produced a flat synthetic zero-score curve.

The primary candidate metrics are unaffected. They are computed independently of score calibration and are sufficient for the rejection decision.

The evaluator is fixed after this owner run so missing confidence values remain unscored. No owner rerun is required because confidence cannot improve a candidate that exposes no confidence signal.

## Decision

**Do not promote generated proper-name G2P into the Entity runtime.**

Also:

- do not stack a third G2P model;
- do not mass-generate pronunciations for the remaining 704,989 unresolved English Entity names;
- keep unresolved names unresolved;
- retain MFA and g2p-en only as benchmark evidence;
- keep source-backed pronunciation evidence as runtime truth.

Phase 12C should continue with the accepted source-backed Entity pronunciation population and runtime/unified Writer integration, not another pronunciation-model campaign.
