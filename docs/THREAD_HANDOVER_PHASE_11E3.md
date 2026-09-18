# RhymeLab — Phase 11E3 Thread Handover

Last updated: 2026-09-18

This file is the compact continuation checkpoint for a fresh engineering thread. Repository state is authoritative; if any chat history conflicts with the repository, follow the repository.

## Start in a fresh thread

Read first:

1. `AGENTS.md`
2. `docs/HANDOVER.md`
3. this file
4. `PROJECT_STATE.json`
5. `STATUS.md`
6. `ROADMAP.md`
7. `docs/PHRASE_MOSAIC_PLAN.md`
8. `docs/PHRASE_MOSAIC_RANKING_V1.md`

Current milestone:

```text
PHASE_11E3_PHRASE_CHANNEL_DIVERSIFICATION
```

Do not restart source survey, pronunciation cleanup, retrieval architecture, or 11E2 ranking design unless new evidence specifically invalidates an accepted gate.

## Hard product / architecture boundaries

RhymeLab core remains deterministic and local-only.

Do not add:

- LLM inference;
- ML/neural ranking;
- hosted search/ranking;
- runtime network dependencies;
- telemetry or hidden upload behavior.

The accepted German single-word Writer remains frozen:

```text
DB schema       rhymelab-local-db-v5
runtime         materialized-writer-v5-v1
ranking         deterministic_writer_utility_v6
anchor policy   de-right-edge-anchors-v1
morphology      de-attested-right-head-v4
construction    de-adverbial-weise-v2
```

Do not modify the single-word Writer to solve phrase/mosaic quality.

## Phase 11 state

### 11A — source survey / licensing

Complete.

Selected production basis:

- German Wiktionary via Kaikki/Wiktextract for source-backed phraseology;
- Leipzig News 2024 1M;
- Leipzig Wikipedia 2021 1M;
- Leipzig Web 2021 1M.

Optional register evidence remains separate from general commonness.

### 11B — phrase catalog

Complete / accepted.

```text
schema                  rhymelab-phrase-catalog-v1
catalog fingerprint     f98692ac0763d711a1c99627d2ce1ca3727babf299cb5a438f45f28a7be1ce6d
phrases                 98,504
modern eligible         97,400
historical only          1,104
attestations            99,357
phrase tokens          205,957
Leipzig usage rows      28,799
SQLite                  153.74 MiB
```

The catalog is intentionally lexeme-heavy. Do not assume every row is a good songwriting phrase.

### 11C — deterministic phrase pronunciation

Accepted / frozen.

```text
schema                    rhymelab-phrase-pronunciation-v1
policy                    de-phrase-pronunciation-v1
pronunciation fingerprint fdee7796df2403cf2a24ad2e4f001c7cf09e536dee67bdfc764f565cdc8e9548
resolved tokens           195,490 / 205,957
token coverage            94.92%
ready phrases             90,089 / 98,504
ready modern phrases      89,865
phrase coverage           91.46%
```

No broad G2P fallback. No automatic connected-speech variants. No blocking 11C2 lexical-gap campaign.

### 11D — cross-word / mosaic retrieval

Accepted / frozen.

11D1 windows:

```text
window count        356,693
window fingerprint  24176031008b9180050a74f8b65ccab7f1cb27e1227ed86da9983b21008bd1ac
```

11D2 bounded retrieval:

```text
anchor count        356,693
anchor fingerprint  55626550bcabe9b1e422d61378121ada50b2a33a6507d5d4f4b9a726abf743ae
```

11D4 accepted retrieval revision:

```text
candidate anchor fingerprint
9e5aceb96b5f0be6344887f0c3f2b578544d109a083ac5b0c48a7239249b7059

candidate semantic fingerprint
4bd1733db4dd77d08c109423157034e38d571447416922cafa24f62fd13e28bd

anchors                    356,693
distinct family+coda keys   66,904
DB bytes                837,390,336
```

11D4 features now frozen:

- full-surface 2–6 syllable query domain when distinct;
- deterministic vowel-family bridge;
- bounded indexed retrieval only;
- weak/unrelated phonetic rows filtered from the default returned retrieval pool;
- accepted `de-phon-v3` scorer/relation truth unchanged.

Do not reopen 11D merely because a lexically poor phrase can still be retrieved. That is ranking/product-quality territory.

## 11E1 — ranking evidence

Complete.

Order-neutral evidence layer:

```text
schema   rhymelab-phrase-mosaic-ranking-evidence-v1
policy   de-phrase-ranking-evidence-v1

suite evidence fingerprint
04ecde26f0a59b7615d6b2a192e7cffed26aefe86ebac07e388e546210d58845
```

Owner distribution over 1,237 frozen 11D4 candidates:

```text
with Leipzig evidence       312  (25.22%)
without Leipzig evidence    925  (74.78%)
surface safe              1,219  (98.54%)
surface restricted           14  (1.13%)
surface marked                4  (0.32%)
query-token overlap            0
```

Consequence:

- Leipzig commonness is a bounded bonus, never an eligibility requirement;
- missing Leipzig evidence is unknown/unattested in the bounded sample, not invalid language;
- surface-safety is a sparse high-confidence demotion signal;
- query-token overlap remains diagnostic for the current suite.

## 11E2-v1 — rejected ranking control

Keep v1 as a deterministic control. Do not promote it.

```text
policy
de-phrase-writer-utility-v1-candidate

suite ranking fingerprint
593142fc70cc1e7b760d6bca3d94ea233c0bcaaf295f6f47f7659ccc7e805de4
```

Why rejected:

- marked-surface demotion worked;
- `Liebe` and `Freiheit` protected results survived;
- but commonness could cross phonetic gaps that were too large;
- `verloren` top moved from score 0.700 to 0.622;
- `Gedanken` raw 0.912747 fell to rank 17;
- `Spotify` and `hitzefrei` also shifted toward materially weaker phonetics;
- `Leben` still exposed its lone weak result.

Do not delete v1 because v2 diagnostics use it as a frozen control.

## 11E2-v2 — ACCEPTED / FROZEN

Accepted phrase ranking policy:

```text
schema
rhymelab-phrase-mosaic-ranking-candidate-v2

policy
de-phrase-writer-utility-v2-phonetic-guard-candidate

phonetic near-tie band
0.02

accepted suite ranking fingerprint
1d07ad486bdff8b167a7a394dafa687a60178cb43bd5a48da19044715d33d3a0
```

Ordering guards:

1. default Writer-page eligibility;
2. surface-safety class;
3. primary phonetic relation type;
4. 0.02 phonetic near-tie band;
5. only then v1 product/commonness/type utility;
6. phonetic/stable tie-breakers.

Owner acceptance:

```text
diagnostic candidates       1,237
Writer-page candidates     1,182
diagnostic-only               55
weak excluded                 42
restricted excluded           14
guard violations               0

Leipzig-backed Top-20
raw 48 -> v1 100 -> v2 68

marked Top-20
raw 4 -> v1 0 -> v2 0
```

Protected behavior:

- `Liebe`: multi-syllable perfect stays rank 1;
- `Freiheit -> dabei seid`: stays rank 1;
- `Leben`: lone weak phrase remains diagnostic but default Phrase Writer page is empty;
- `Gedanken`: strongest raw phonetic top is restored to Writer rank 1;
- `verloren`: 0.700 phonetic top is preserved; commonness only breaks genuine near-ties;
- `Musik -> K.-o.-Siegen`: abbreviation-like marked surface is strongly demoted through explicit surface-safety handling.

## Durable product decision: no phrase quota

This is important for all future work.

Phrase/Mosaic is an optional result channel, not a quota.

Do **not**:

- reserve N phrase slots in the default results;
- push phrase results above better single-word rhymes merely for visibility;
- manufacture a phrase result when the phrase channel has no acceptable result;
- treat single-word and phrase internal numeric scores as globally calibrated.

Allowed / intended product behavior:

- quality-first default Writer results;
- better single-word results may legitimately sit above every phrase result;
- Phrase/Mosaic has an explicit filter/channel;
- an empty Phrase/Mosaic channel is valid;
- weak/restricted diagnostic rows can remain available through explicit diagnostics/advanced filters;
- cross-channel numeric calibration remains deferred until a shared defensible human-reference set exists.

## CURRENT — 11E3 phrase-channel diversification

11E3 must operate **only inside the accepted 11E2-v2 Phrase/Mosaic Writer-page candidate set**.

Goal:

Improve variety when a user explicitly views phrase/mosaic results without changing rhyme truth or forcing phrases into the default result page.

### Required first diagnostics

Measure before implementing suppression:

- exact duplicate canonical surfaces in Top-10/20/50;
- repeated normalized canonical surfaces;
- repeated final lexical heads;
- repeated obvious lexical frames / template stems;
- inflectional variants when a deterministic identity is available;
- concentration of one phrase family/template in Top-20;
- how often diversity suppression would change protected high-quality results.

Use the existing representative query suite as control, especially:

- `Arbeitsweise`: inspect repetitive `beiseite`-style clusters;
- `hitzefrei`: inspect repeated lexical/template families;
- `Gedanken`: preserve strong phonetic top;
- `Liebe`: preserve exact multi-syllable perfect;
- `Freiheit`: preserve `dabei seid`;
- `Musik`: preserve marked-surface demotion;
- `Leben`: remain empty in default phrase page.

### 11E3 implementation rules

- exact canonical duplicates may be collapsed deterministically;
- obvious deterministic template/inflection clusters may be capped;
- do not invent semantic clusters;
- do not use embeddings/ML;
- do not randomize;
- do not change phonetic relation labels or scores;
- do not change 11E2-v2 eligibility;
- do not perform cross-channel single-word/phrase promotion;
- preserve full diagnostic provenance for suppressed rows.

Suggested architecture:

```text
accepted 11E2-v2 Writer-page candidates
  -> diversity diagnostics
  -> deterministic phrase-channel diversification candidate
  -> protected-result checks
  -> owner A/B
  -> repeatability
```

11E3 must have a deterministic whole-suite fingerprint and an owner repeatability gate before acceptance.

## After 11E3: remaining Phase 11 work

### 11E4 — runtime / API / UI integration

Only after 11E3 acceptance.

Required product behavior:

- integrate accepted phrase retrieval + ranking + diversity into local Writer runtime;
- expose explicit Phrase/Mosaic / Wortgruppen filter;
- no default phrase quota;
- allow zero phrase results;
- retain diagnostic provenance;
- keep single-word Writer path unchanged;
- no network dependency.

Required engineering gates:

- API contract;
- UI/filter behavior;
- local startup with expected DBs;
- regression that normal single-word queries remain unchanged;
- protected phrase cases;
- performance measurement for combined Writer request path.

### 11F — dedicated Phrase/Mosaic final benchmark

This is the final Phase 11 acceptance layer.

Must cover at least:

- exact multi-word rhyme cases;
- strong cross-word matches crossing one boundary;
- matches crossing multiple word boundaries;
- secondary-stress cases;
- short-query false positives;
- common-vs-obscure phrase safety;
- idiom/fixed-expression provenance;
- historical/dated filtering;
- empty-result safety;
- marked-surface handling;
- duplicate/template diversity;
- pronunciation ambiguity;
- owner-local performance;
- deterministic repeatability;
- unchanged frozen single-word Writer regressions.

Human Writer NDCG remains `pending_reference` if independent reviewers still do not exist. It does **not** block Phase 11 engineering closure.

## Phase 11 closure condition

Phase 11 can close when all of the following are true:

```text
11E3 phrase-channel diversity       accepted + repeatable
11E4 local runtime/API/UI           integrated + regression-safe
11F structural/performance suite    PASS + repeatable
single-word Writer                  unchanged
phrase provenance                   preserved
local-only deterministic core       preserved
Human NDCG                          pending_reference allowed
```

After that, mark Phase 11 complete and freeze the German phrase/mosaic surface before beginning the next major phase.

## Useful local data / commands

Core phrase DB:

```text
data/local/rhymelab-phrases-v1.sqlite
```

Useful accepted/debug commands:

```powershell
npm run phrase:mosaic:diagnose:v2
npm run phrase:mosaic:rank:evidence
npm run phrase:mosaic:rank:v1
npm run phrase:mosaic:rank:v2
```

Accepted reports used during 11E:

```text
data/local/phrase-mosaic-query-diagnostics-v2-candidate-report.json
data/local/phrase-mosaic-ranking-evidence-v1-report.json
data/local/phrase-mosaic-ranking-v1-candidate-report.json
data/local/phrase-mosaic-ranking-v2-candidate-report.json
```

Do not commit generated local reports or local SQLite data.

## Recommended first action in the next thread

Do **not** start with UI work.

Start 11E3 by implementing a read-only diversity diagnostic over the accepted 11E2-v2 Writer-page candidate set.

The diagnostic should quantify duplicate/template/family concentration before any suppression policy is selected. Only then create a bounded deterministic diversity candidate and compare it against the frozen 11E2-v2 ordering.

Use PR + required `validate` CI for every accepted change.
