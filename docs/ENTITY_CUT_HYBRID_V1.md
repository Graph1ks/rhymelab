# Phase 12A2 Entity Cut Hybrid Candidate v1

Last updated: 2026-09-18

Status: **candidate / A-B diagnostic only / not frozen**

## Why this candidate exists

The first full QLever + QRank owner cut produced:

```text
staged entities                  1,620,664
kept category memberships        1,109,302
distinct retained entities       1,077,927
membership overlap                  31,375
memberships per entity              1.029107
Bud Spencer sentinel                   PASS
```

The distinct population is inside the accepted 500k–1.2M envelope but above the preferred 600k–900k working range. Multi-category overlap is small and is not the cause.

The more important defect is the v1 control ordering:

```text
QRank present
-> QRank descending
-> Wikipedia sitelinks
-> DE/EN Wikipedia presence
-> external IDs
-> statement count
-> QID
```

Because every QRank-present row is sorted ahead of every QRank-missing row, QRank coverage becomes an accidental hard gate whenever the category cut lands inside the QRank-present block.

Owner evidence confirmed this in 7/13 categories:

```text
group.music_group          coverage 84.63%   missing-QRank retained 0
organization.car_brand     coverage 86.14%   missing-QRank retained 0
organization.company       coverage 45.68%   missing-QRank retained 0
organization.fashion_house coverage 41.01%   missing-QRank retained 0
work.album                 coverage 89.78%   missing-QRank retained 0
work.film                  coverage 81.55%   missing-QRank retained 0
work.song                  coverage 73.22%   missing-QRank retained 0
```

This is incompatible with the Phase 12A popularity contract: QRank is the primary global signal, but it is evidence rather than cultural truth and must be combined with category-relative structural evidence.

## Candidate policy

Policy id:

```text
category-relative-popularity-hybrid-v1-candidate
```

The candidate uses a deterministic bounded score inside each category.

Weights:

```text
QRank percentile among QRank-present rows       55%
Wikipedia sitelink percentile                   25%
DE/EN Wikipedia presence                        10%
selected external IDs, capped at four            7%
statement-count percentile                       3%
                                                 ---
                                                100%
```

All component scores are integer parts-per-million. The weighted score is therefore deterministic and bounded.

### Missing QRank

A QRank-missing row receives:

```text
QRank component = 0
```

It does **not** receive a separate binary missing-QRank penalty.

A low-QRank row can therefore be outranked by a QRank-missing entity with materially stronger sitelink, DE/EN-presence and authority evidence. A top-QRank entity still receives a 55% component and remains difficult to displace using structural evidence alone.

### Percentiles

QRank, Wikipedia sitelinks and statement count are normalized category-relatively. Equal raw values receive equal component values. Bottom ties receive zero. Stable QID ordering is used only after all score/evidence tie-breaks.

External IDs are capped because identifier multiplicity is weak completeness evidence and must not become an identifier-spam reward.

Statement evidence is only 3% of the total score.

## What is unchanged

This candidate does not change:

- category taxonomy;
- category retention percentile floors;
- QLever artifacts;
- QRank staging;
- source acquisition;
- the existing `qrank-category-relative-cut-v1` control;
- final Entity Lexicon materialization;
- German Writer;
- Phrase/Mosaic;
- runtime networking policy.

The candidate exists only for A/B evidence.

## Owner A/B command

After the PR is merged:

```powershell
cd D:\rhymelab
git pull
npm run entity:cut:diagnose:hybrid
```

No QLever fetch, entity restage, QRank restage or final materialization is required.

Default report:

```text
data/local/entity-cut-hybrid-v1-candidate-report.json
```

The terminal summary reports:

- control vs candidate distinct retained entities;
- allowed/preferred range status;
- total promoted/demoted category memberships;
- category-level QRank-missing retention before/after;
- per-category kept-set Jaccard overlap;
- Bud Spencer candidate rank/tier/KEEP gate;
- deterministic semantic fingerprint.

The full report also records representative promoted/demoted boundary samples with QID, preferred DE/EN name and all score components.

## Acceptance decision

Do not freeze this candidate from CI/fixture behavior alone.

Owner full-data acceptance requires:

1. Bud Spencer remains KEEP / Tier A;
2. candidate retained population remains inside 500k–1.2M;
3. missing-QRank rows can compete in the seven previously hard-gated categories;
4. churn is explainable rather than wholesale;
5. promoted/demoted boundary samples are culturally plausible;
6. low-QRank-coverage categories, especially `work.video_game`, remain structurally sensible;
7. only after the ranking policy is accepted should category floors be tightened, if needed, toward the preferred 600k–900k working range.

Do not solve the size target by changing floors before the ranking policy itself is trustworthy.
