# Markov Phrase / Sentence Generator — Thread Handover

## Purpose

This is the focused continuation document for the **next engineering thread**.

The next thread is **not** a continuation of Serving-v1 micro-optimization work. The immediate focus moves to the planned **Markov phrase/sentence generator**.

Read first:

1. `AGENTS.md`
2. `PROJECT.md`
3. this file
4. `docs/DISTRIBUTION_TIERS.md`
5. `docs/SERVING_V1_PRODUCT_ADAPTER.md`
6. `docs/PHASE_11_ACCEPTANCE.md`
7. any additional Markov requirements the owner supplies in the new thread

Repository state is authoritative. Do not reconstruct current design from old chat history.

## Current repository checkpoint

Current main checkpoint at handover creation:

```text
Serving-v1 Product preview          implemented
persistent parallel workers         implemented
Generated product default           ON / explicit opt-out
cross-request runtime caching       intentionally deferred
Entity language-routing fix         merged
DE -> EN compound bridge            merged
safe scorer prefilter               merged
report-grade benchmark              implemented
distribution tier contract          documented
```

Important merged architecture document:

```text
docs/DISTRIBUTION_TIERS.md
```

The distribution contract defines:

```text
Lite      50k Core
          DE/EN Words only

Standard  250k Core
          Words + Phrase/Mosaic + Entities

Full      400k Core + 200k Generated
          Words + Phrase/Mosaic + Entities
          + Generated layer
          + Markov live generator

Master    complete Developer/Serving population
```

The numeric tier cuts are **Word/Pronunciation population cuts, not Entity counts**.

Hard invariant:

```text
LITE ⊂ STANDARD ⊂ FULL ⊂ MASTER
```

## Performance checkpoint

The report-grade Serving benchmark exists as:

```powershell
npm run serving:v1:report:benchmark
```

Most recent owner report at handover time:

```text
execution       persistent-worker-threads-v1-steady-state
dataset         all
cases           20
warmup rounds   1 discarded
measured        7 repeats / 140 samples

overall
p50             145.366 ms
p95             280.296 ms
max             425.638 ms
average         144.716 ms

integrity       PASS
p50 target      MISS (<=100 ms)
p95 target      MISS (<=250 ms)
max target      PASS (<=1500 ms)
```

Language summary:

```text
DE     p50 162.884 ms   p95 370.565 ms
EN     p50  54.674 ms   p95 194.018 ms
Both   p50 162.338 ms   p95 219.789 ms
```

Highest-average major stages:

```text
words_de      ~171.4 ms average
entities_de    ~84.8 ms
words_en       ~60.8 ms
entities_en    ~42.8 ms
phrases_de     ~29.3 ms
```

The pathological current case remains `Arbeitsweise` at roughly 371 ms median in the report workload.

## Explicit performance decision

**Stop further Serving-v1 micro-optimization for now.**

Do not continue optimizing merely because the current Master/Developer preview misses the historical 100/250 ms target.

Reason:

1. the current local Serving database is about 18.8 GiB;
2. shipping editions will intentionally have materially smaller Word/Pronunciation populations and different feature sets;
3. smaller B-trees, smaller working sets, fewer eligible rows and absent feature channels in Lite should improve real latency;
4. a meaningful part of current DE cost is CPU scorer/ranking work, so file-size reduction is not expected to produce a simple linear or 10x speedup;
5. optimizing the Master before measuring the actual distributions risks spending time on bottlenecks users will not experience.

### Expected tier performance — hypothesis, not acceptance evidence

Current expectation:

- **Lite:** should be substantially faster than the current Master preview. It has only 50k Core Words and no Phrase/Entity/Generated/Markov channels. It is not expected to feel slow on ordinary queries.
- **Standard:** should be materially faster than the Master Word path because the Core Word population is capped at 250k. Phrase and Entity channels remain, so exact latency depends strongly on the eventual Entity distribution/closure.
- **Full:** should still benefit from the 400k Core + 200k Generated Word cut and a smaller shipping working set, but it retains Phrase/Entity and adds Markov. It may still expose noticeable delay on expensive DE outliers.
- **Worst-case CPU-heavy queries:** database reduction alone cannot eliminate Writer scoring/diversity/feature-preparation costs. Reopen optimization only if measured shipping-tier latency justifies it.

Do **not** claim a specific tier speedup before building and benchmarking the actual distribution files.

## Performance reopening gate

Serving/search optimization resumes only after at least one real distribution exists and the report benchmark has been run against it.

Expected future comparison:

```text
Tier       DB size   p50   p95   max
Lite       ?         ?     ?     ?
Standard   ?         ?     ?     ?
Full       ?         ?     ?     ?
Master     ~18.8 GiB historical reference
```

If Lite/Standard/Full meet product usability expectations, do not reopen low-value micro-optimization work.

If a tier remains slow:

1. use the report-stage breakdown;
2. identify whether the bottleneck is SQLite retrieval, hydration, scoring, ranking/diversity, Phrase, Entity, or Markov;
3. preserve exact result semantics;
4. optimize only the measured tier bottleneck.

Cross-request result/scoring caches remain deferred unless the owner explicitly reopens caching after tier benchmarks.

## Markov direction already decided

The Full distribution contract already establishes one boundary:

**Markov is a live phrase/sentence generator, not a pre-rendered giant phrase database.**

High-level intended path:

```text
context / seed
      ↓
Markov model
      ↓
generated token sequence
      ↓
existing token / pronunciation lookup
      ↓
phrase phonology
      ↓
existing rhyme / mosaic scoring
      ↓
writer-facing result
```

The model may contain compact state such as:

```text
vocabulary
n-gram / transition state
counts / weights
start/end-state metadata
```

Do not create millions of pre-generated phrase rows merely to support Markov.

The generator should reuse existing lexical/pronunciation/phonology infrastructure wherever practical instead of introducing a second phonological truth store.

## Important: Markov design is not finalized yet

The owner will provide **additional Markov requirements in the next thread**.

Therefore the first task in the new thread is:

1. read the additional owner requirements;
2. inspect the existing Phrase/Mosaic/Writer architecture and any older Markov/retrieval-first design notes;
3. reconcile the requested product behavior with frozen Phase-11 phonology/retrieval/ranking contracts;
4. propose a concrete Markov architecture, data/model source strategy, runtime contract, storage model, training/materialization pipeline and acceptance benchmark;
5. only then implement.

Do not prematurely lock:

- n-gram order;
- training corpus;
- context conditioning;
- sentence length policy;
- rhyme-target conditioning;
- backward vs forward generation;
- beam/sampling strategy;
- diversity policy;
- Standard-vs-Full availability beyond the current Full-only contract;
- model storage format;
- UI behavior.

Those choices depend on the owner's next-thread requirements and measured source/model properties.

## Frozen boundaries to preserve

Unless the owner explicitly changes them:

- accepted German single-word Writer semantics remain frozen;
- accepted Phase-11 Phrase/Mosaic semantics remain frozen;
- accepted English Writer semantics remain frozen;
- Entity identity/pronunciation provenance remains explicit;
- deterministic rhyme/scoring truth remains authoritative;
- Markov generation must not replace phonetic rhyme truth;
- local/offline runtime remains the product posture;
- no mandatory hosted service;
- no LLM/neural runtime dependency in canonical core search;
- no bulk pre-rendered generated phrase corpus;
- generated content must remain distinguishable from source-backed Phrase data.

## Distribution work remains planned, not current

Do not interrupt Markov work to build Lite/Standard/Full unless the owner explicitly asks.

When distribution work resumes, follow `docs/DISTRIBUTION_TIERS.md`:

1. finalize/freeze Master;
2. storage census / analyzer;
3. canonical distribution rank;
4. relational/runtime closure;
5. positive materialization of Lite/Standard/Full;
6. semantic/integrity acceptance;
7. VACUUM + dbstat;
8. benchmark each edition.

## New-thread starting point

The next thread can start with:

> Read `AGENTS.md`, `PROJECT.md`, `docs/MARKOV_GENERATOR_HANDOVER.md`, `docs/DISTRIBUTION_TIERS.md`, and the existing Phrase/Mosaic acceptance/design docs first. Performance optimization of the current Master Serving DB is intentionally paused until Lite/Standard/Full are materialized and benchmarked. The active task is now the Markov phrase/sentence generator. I will provide additional generator requirements in this thread; incorporate those before proposing or implementing the architecture.

