export const ENTITY_WRITER_RANKING_POLICY =
  'entity-writer-ranking-v3-surface-identity-v1';
export const ENTITY_PHONETIC_BAND_WIDTH = 0.02;
export const ENTITY_SURFACE_DIVERSITY_CAP = 1;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function entityPhoneticBand(score, width = ENTITY_PHONETIC_BAND_WIDTH) {
  const safeWidth = Math.max(0.001, finiteNumber(width, ENTITY_PHONETIC_BAND_WIDTH));
  const normalized = Math.max(0, Math.min(1, finiteNumber(score, 0)));
  return Math.max(0, Math.floor(((1 - normalized) + 1e-9) / safeWidth));
}

export function entityProminencePercentile(row) {
  return finiteNumber(
    row?.selectedCategory?.percentile ?? row?.popularityPercentile,
    0,
  );
}

function surfaceMetadata(rows){
  const metadata=new Map();
  for(const row of rows||[]){
    const normalized=String(row?.normalized||'').trim();
    if(!normalized)continue;
    if(!metadata.has(normalized)){
      metadata.set(normalized,{
        entityQids:[],
        entityIdentities:[],
        entityCategories:[],
        surfacePronunciations:[],
      });
    }
    const target=metadata.get(normalized);
    const qid=String(row?.entityQid||'').trim();
    if(qid&&!target.entityQids.includes(qid)){
      target.entityQids.push(qid);
      target.entityIdentities.push({
        qid,
        entityId:row?.entityId??null,
        entityNameId:row?.entityNameId??null,
        primaryCategory:row?.primaryCategory||null,
        popularityScore:finiteNumber(row?.popularityScore,0),
        popularityPercentile:finiteNumber(row?.popularityPercentile,0),
        popularityTier:row?.popularityTier||null,
      });
    }
    const categories=[
      row?.primaryCategory,
      ...(row?.entityCategories||[]).map((entry)=>
        typeof entry==='string'?entry:entry?.category
      ),
    ].filter(Boolean);
    for(const category of categories){
      if(target.entityCategories.some((entry)=>entry.category===category))continue;
      const detail=(row?.entityCategories||[]).find((entry)=>
        (typeof entry==='string'?entry:entry?.category)===category
      );
      target.entityCategories.push(
        typeof detail==='object'&&detail
          ?{...detail,category}
          :{category},
      );
    }
    const ipa=String(row?.ipa||'').trim();
    if(ipa&&!target.surfacePronunciations.some(
      (entry)=>entry.ipa===ipa&&entry.locale===(row?.locale||null)
    )){
      target.surfacePronunciations.push({
        ipa,
        locale:row?.locale||null,
        generated:Boolean(
          row?.generatedPronunciation||row?.pronunciationGenerated
        ),
        source:row?.pronunciationSource||null,
        qid:row?.entityQid||null,
      });
    }
  }
  return metadata;
}

export function compareEntityWriterRows(a, b) {
  const tierDelta = finiteNumber(a?.rhymeTier, 99) - finiteNumber(b?.rhymeTier, 99);
  if (tierDelta) return tierDelta;

  const bandDelta = entityPhoneticBand(a?.score) - entityPhoneticBand(b?.score);
  if (bandDelta) return bandDelta;

  const syllableDelta =
    finiteNumber(a?.syllableDistance, 99) - finiteNumber(b?.syllableDistance, 99);
  if (syllableDelta) return syllableDelta;

  const percentileDelta =
    entityProminencePercentile(b) - entityProminencePercentile(a);
  if (percentileDelta) return percentileDelta;

  const popularityDelta =
    finiteNumber(b?.popularityScore, 0) - finiteNumber(a?.popularityScore, 0);
  if (popularityDelta) return popularityDelta;

  const exactPhoneticDelta = finiteNumber(b?.score, 0) - finiteNumber(a?.score, 0);
  if (exactPhoneticDelta) return exactPhoneticDelta;

  const preferredDelta =
    Number(Boolean(b?.namePreferred)) - Number(Boolean(a?.namePreferred));
  if (preferredDelta) return preferredDelta;

  const surfaceDelta = String(a?.surface || '').localeCompare(
    String(b?.surface || ''),
    a?.language === 'de' ? 'de' : 'en',
  );
  if (surfaceDelta) return surfaceDelta;

  return String(a?.entityQid || '').localeCompare(String(b?.entityQid || ''), 'en');
}

export function entityRankingGuardViolations(rows) {
  const violations = [];
  const ranked = rows || [];
  for (let i = 0; i < ranked.length; i += 1) {
    const earlier = ranked[i];
    for (let j = i + 1; j < ranked.length; j += 1) {
      const later = ranked[j];
      const earlierTier = finiteNumber(earlier?.rhymeTier, 99);
      const laterTier = finiteNumber(later?.rhymeTier, 99);
      if (earlierTier > laterTier) {
        violations.push({
          kind: 'worse_rhyme_tier_ahead',
          earlier_rank: i + 1,
          later_rank: j + 1,
          earlier_qid: earlier?.entityQid || null,
          later_qid: later?.entityQid || null,
        });
        continue;
      }
      if (earlierTier !== laterTier) continue;

      const earlierBand = entityPhoneticBand(earlier?.score);
      const laterBand = entityPhoneticBand(later?.score);
      if (earlierBand > laterBand) {
        violations.push({
          kind: 'materially_worse_phonetic_band_ahead',
          earlier_rank: i + 1,
          later_rank: j + 1,
          earlier_qid: earlier?.entityQid || null,
          later_qid: later?.entityQid || null,
          earlier_score: finiteNumber(earlier?.score, 0),
          later_score: finiteNumber(later?.score, 0),
          earlier_band: earlierBand,
          later_band: laterBand,
        });
      }
    }
  }
  return violations;
}

export function rankAndDiversifyEntityRows(rows, {
  limit = 100,
  surfaceCap = ENTITY_SURFACE_DIVERSITY_CAP,
} = {}) {
  const sorted = [...(rows || [])].sort(compareEntityWriterRows);
  const metadataBySurface=surfaceMetadata(sorted);
  const seenQids = new Set();
  const surfaceCounts = new Map();
  const results = [];
  const suppressed = [];
  const reasonCounts = {
    duplicate_entity_qid: 0,
    repeated_surface_cap: 0,
  };

  for (const row of sorted) {
    const qid = String(row?.entityQid || '');
    const normalized = String(row?.normalized || '').trim();
    let suppressionReason = null;

    if (qid && seenQids.has(qid)) {
      suppressionReason = 'duplicate_entity_qid';
    } else if (
      normalized
      && Number(surfaceCounts.get(normalized) || 0) >= surfaceCap
    ) {
      suppressionReason = 'repeated_surface_cap';
    }

    if (suppressionReason) {
      reasonCounts[suppressionReason] += 1;
      suppressed.push({
        entityQid: row?.entityQid || null,
        normalized: row?.normalized || null,
        reason: suppressionReason,
      });
      continue;
    }

    if (qid) seenQids.add(qid);
    if (normalized) {
      surfaceCounts.set(normalized, Number(surfaceCounts.get(normalized) || 0) + 1);
    }

    const phoneticBand = entityPhoneticBand(row?.score);
    const mergedSurface=metadataBySurface.get(normalized)||null;
    results.push({
      ...row,
      ...(mergedSurface?{
        entityQids:[...mergedSurface.entityQids],
        entityIdentities:[...mergedSurface.entityIdentities],
        entityCategories:[...mergedSurface.entityCategories],
        surfacePronunciations:[...mergedSurface.surfacePronunciations],
        mergedEntityCount:mergedSurface.entityQids.length,
        mergedPronunciationCount:mergedSurface.surfacePronunciations.length,
      }:{}),
      rankingEvidence: {
        policy: ENTITY_WRITER_RANKING_POLICY,
        phoneticBand,
        phoneticBandWidth: ENTITY_PHONETIC_BAND_WIDTH,
        prominencePercentile: entityProminencePercentile(row),
        prominenceScope: 'same_rhyme_tier_same_phonetic_band_same_syllable_distance',
      },
    });
    if (results.length >= limit) break;
  }

  const guardViolations = entityRankingGuardViolations(results);
  return {
    policy: ENTITY_WRITER_RANKING_POLICY,
    phoneticBandWidth: ENTITY_PHONETIC_BAND_WIDTH,
    surfaceCap,
    sortedCandidateCount: sorted.length,
    suppressedCount: suppressed.length,
    suppressionReasonCounts: reasonCounts,
    guardViolations,
    results: results.map((row, index) => ({
      ...row,
      channelRank: index + 1,
    })),
  };
}
