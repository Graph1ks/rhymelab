import { entityPronunciationLookupUnits } from './entity-pronunciation-source-expansion-core.mjs';

export const ENTITY_G2P_BENCHMARK_POLICY='entity-proper-name-token-g2p-benchmark-v2';

export function entityG2pOrthographyBucket(surface){
  const value=String(surface??'').normalize('NFKC');
  if([...value].some((ch)=>ch.codePointAt(0)>127)) return 'non_ascii';
  if(/[’']/u.test(value)) return 'apostrophe';
  const letters=[...value].filter((ch)=>/\p{L}/u.test(ch)).length;
  if(letters<=4) return 'very_short';
  if(letters<=7) return 'short';
  if(letters<=10) return 'medium';
  return 'long';
}

export function groupProperNameReferences(rows){
  const map=new Map();
  for(const row of rows){
    if(!row?.normalized) continue;
    const key=String(row.normalized);
    const list=map.get(key)||[];
    list.push({
      evidence_id:Number(row.evidence_id),
      surface:String(row.surface||key),
      source_kind:String(row.source_kind),
      locale:String(row.locale),
      notation:String(row.notation),
      pronunciation:String(row.raw),
    });
    map.set(key,list);
  }
  return map;
}

export function selectProperNameTokenBenchmarkCases(
  entityRows,
  properRefsByNormalized,
  {
    targetSize=600,
    perCategory=100,
    referencesPerCase=4,
  }={},
){
  const selected=[];
  const seen=new Set();
  const categoryCounts=new Map();
  const shapeCounts=new Map();

  for(const row of entityRows){
    if(selected.length>=targetSize) break;
    const category=String(row.primary_category||'unknown');
    if((categoryCounts.get(category)||0)>=perCategory) continue;

    for(const unit of entityPronunciationLookupUnits(row.surface)){
      if(selected.length>=targetSize) break;
      const normalized=String(unit.normalized||'');
      if(!normalized||seen.has(normalized)) continue;
      const refs=properRefsByNormalized.get(normalized);
      if(!refs?.length) continue;

      const gold=refs.slice(0,referencesPerCase);
      const preferredSurface=
        gold.find((ref)=>ref.surface)?.surface
        ||unit.source
        ||normalized;
      const bucket=entityG2pOrthographyBucket(preferredSurface);

      selected.push({
        case_id:`token-${gold[0].evidence_id}`,
        surface:preferredSurface,
        normalized,
        control_kind:'entity_name_token',
        control_source:'wiktionary_kaikki_proper_name',
        orthography_bucket:bucket,
        context:{
          name_id:Number(row.name_id),
          qid:row.qid,
          entity_surface:row.surface,
          primary_category:category,
          popularity_tier:row.popularity_tier,
          popularity_percentile:Number(row.popularity_percentile||0),
          unit_strategy:unit.strategy,
        },
        references:gold.map((ref)=>({
          source_kind:ref.source_kind,
          locale:ref.locale,
          notation:ref.notation,
          pronunciation:ref.pronunciation,
        })),
      });
      seen.add(normalized);
      categoryCounts.set(category,(categoryCounts.get(category)||0)+1);
      shapeCounts.set(bucket,(shapeCounts.get(bucket)||0)+1);

      if((categoryCounts.get(category)||0)>=perCategory) break;
    }
  }

  return {
    cases:selected,
    category_counts:Object.fromEntries(
      [...categoryCounts.entries()]
        .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'en'))
    ),
    orthography_counts:Object.fromEntries(
      [...shapeCounts.entries()]
        .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'en'))
    ),
    distinct_normalized:seen.size,
  };
}
