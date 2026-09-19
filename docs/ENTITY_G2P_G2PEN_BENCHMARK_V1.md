# Phase 12C — Independent g2p-en Neural Proper-Name Benchmark

Status: **OWNER COMPLETE / REJECTED FOR RUNTIME FALLBACK**

## Why MFA is closed

The corrected MFA benchmark and confidence calibration are complete.

```text
benchmark controls                         600
model-input eligible                       599
eligible prediction coverage              100%
evaluated                                  597
exact stressed rhyme tail                71.19%

best 10% by MFA path score exact-tail    86.67%
retention at >=90% exact-tail              1.68%
retention at >=85% exact-tail             21.94%
calibrated evaluation fingerprint
9bc00102d46af55352505389c03fe048083cdd81c966007ab86924d9df233488
```

Decision: MFA is **rejected for Entity runtime fallback**. Its path score improves quality at low retention but does not isolate a useful high-confidence population.

## Independent candidate

The next candidate is `g2p-en` 2.1.0.

```text
project              Kyubyong/g2p
package              g2p-en
license              Apache-2.0
bundled checkpoint   g2p_en/checkpoint20.npz
training basis       CMU Pronouncing Dictionary
output               stressed ARPAbet
```

Why this candidate instead of DeepPhonemizer:

- it emits the stress-bearing ARPAbet RhymeLab already analyzes;
- its neural checkpoint is distributed inside the Apache-2.0 package/repository;
- CMUdict is the documented training basis and has permissive redistribution terms;
- no separate model URL or unclear checkpoint license is added;
- it is lightweight NumPy inference rather than another large runtime stack.

DeepPhonemizer remains research evidence only: its code is MIT, but the pretrained checkpoint is not separately licensed clearly enough upstream for a commercial runtime promotion path.

## Critical benchmark rule — neural path only

Normal `g2p-en` behavior looks up CMUdict and homographs before neural prediction. That is **not** allowed in this benchmark because it would contaminate the independent G2P result with dictionary truth already present in the RhymeLab source stack.

The RhymeLab bridge therefore calls:

```python
G2p.predict(model_input)
```

directly.

It does **not** call the package's normal text-conversion path.

The metadata must record:

```text
neural_path_forced      true
cmudict_lookup_used     false
homograph_lookup_used   false
pos_lookup_used         false
```

## Model-input policy

RhymeLab prepares the benchmark input before Python inference:

- NFKC normalize;
- lowercase;
- remove combining diacritic marks when a base ASCII Latin grapheme remains;
- accept only `a-z`;
- reject residual punctuation/non-ASCII graphemes rather than silently deleting them;
- reject any normalization collisions.

This model-input policy is implemented and tested in `scripts/g2pen-benchmark-core.mjs`.

## One-time owner setup

Use a **Miniforge Prompt**, not a plain PowerShell.

Create a separate environment so the accepted MFA environment remains untouched:

```powershell
conda create -n rhymelab-g2pen -c conda-forge python=3.10 g2p-en=2.1.0 -y
conda activate rhymelab-g2pen
python -m nltk.downloader cmudict averaged_perceptron_tagger
```

The NLTK resources are installed explicitly so the benchmark does not rely on the package's automatic downloader.

## Owner benchmark

The prompt must visibly begin with `(rhymelab-g2pen)`.

```powershell
cd D:\rhymelab
git pull
npm run entity:g2p:benchmark:g2pen
```

Outputs:

```text
data/local/entity-g2p-g2pen-neural-predictions-v2.tsv
data/local/entity-g2p-g2pen-neural-metadata-v1.json
data/local/entity-g2p-g2pen-neural-evaluation-v2.json
```

Upload only the final evaluation JSON.

## Decision boundary

The candidate remains benchmark-only. No generated pronunciation is persisted or promoted.

Evaluate it against the exact same proper-name benchmark v2 and compare directly to MFA's accepted control metrics. If the independent neural candidate does not materially improve exact stressed rhyme-tail quality, stop the G2P campaign rather than stacking more models.


## Owner result

```text
package / model                   g2p-en 2.1.0 / checkpoint20.npz
checkpoint SHA-256
b8af35e4596d8dd5836dfd3fe9b2ba4f97b9c311efe8879544cbcfcbd566d8c6
benchmark cases                   600
model-input eligible              596
eligible prediction coverage      100%
prediction rows                   596
evaluated                         596
invalid                             0
exact phones                    64.60%
exact stressed rhyme tail       64.26%
syllable count                  93.62%
stress pattern                  81.88%
primary stress                  91.95%
mean rhyme score              0.891655
owner evaluation fingerprint
5511c6e2c83550b753692a64a1485302c88b61b5bc4acecf4a3a8e29937061b6
```

Metadata confirms the benchmark forced the neural path and did not use CMUdict, homograph or POS lookup.

Compared with MFA, exact stressed rhyme-tail quality is lower by 6.93 percentage points (64.26% vs 71.19%). The candidate is rejected for runtime fallback.

### Confidence-report note

`g2p-en` does not emit a confidence score in this benchmark. The owner evaluation's `confidence_calibration` block is invalid because the evaluator converted missing `null` scores to numeric zero before calibration. This reporting defect does not affect any primary quality metric above. The evaluator is fixed after the owner run; no rerun is required.

Final campaign decision: `docs/ENTITY_G2P_DECISION_V1.md`.
