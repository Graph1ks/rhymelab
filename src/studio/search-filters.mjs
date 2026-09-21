export const STUDIO_RHYME_TYPES=Object.freeze([
  'all',
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
  'assonance',
  'consonance',
]);

export const STUDIO_RHYME_TYPE_LABELS=Object.freeze({
  all:'Alle Reimtypen',
  multisyllabic_perfect:'Mehrsilbiger Vollreim',
  perfect:'Vollreim',
  multisyllabic_slant:'Mehrsilbiger Slant-Reim',
  family:'Reimfamilie',
  slant:'Slant-Reim',
  assonance:'Assonanz',
  consonance:'Konsonanz',
});

const SOUND_RELATIONS=new Set(['assonance','consonance']);

export function normalizeStudioRhymeType(value){
  return STUDIO_RHYME_TYPES.includes(value)?value:'all';
}

export function studioRowMatchesType(row,type){
  const requested=normalizeStudioRhymeType(type);
  if(requested==='all')return true;
  const raw=row?.raw||row||{};
  const types=new Set([
    row?.relationType,
    raw.primaryType,
    raw.type,
    ...(Array.isArray(raw.relationTypes)?raw.relationTypes:[]),
    ...(Array.isArray(raw.relations)?raw.relations.map((item)=>item?.type):[]),
  ].filter(Boolean));
  return types.has(requested);
}

export function studioRowRelationScore(row,type='all'){
  const requested=normalizeStudioRhymeType(type);
  if(requested==='all'||!SOUND_RELATIONS.has(requested)){
    return Number(row?.score??row?.raw?.score??0);
  }
  const relation=(row?.raw?.relations||[]).find((item)=>item?.type===requested);
  return Number(relation?.score||0);
}

export function studioRowSyllableDistance(row,querySyllables=0){
  const explicit=Number(row?.syllableDistance);
  if(Number.isFinite(explicit))return Math.abs(explicit);
  const count=Number(row?.syll);
  const anchor=Number(querySyllables);
  return anchor>0&&Number.isFinite(count)?Math.abs(count-anchor):Number.MAX_SAFE_INTEGER;
}

export function studioRowMatchesSyllables(row,mode='all',querySyllables=0){
  const distance=studioRowSyllableDistance(row,querySyllables);
  const count=Number(row?.syll||0);
  if(mode==='all')return true;
  if(mode==='same')return distance===0;
  if(mode==='near'||mode==='near1')return distance<=1;
  if(mode==='near2')return distance<=2;
  if(mode==='near3')return distance<=3;
  if(mode==='3')return count>=3;
  if(mode==='1'||mode==='2')return count===Number(mode);
  return true;
}

export function filterStudioWriterRows(rows,{
  rhymeType='all',
  syllableMode='all',
  querySyllables=0,
}={}){
  return rows.filter((row)=>
    studioRowMatchesType(row,rhymeType)
    &&studioRowMatchesSyllables(row,syllableMode,querySyllables)
  );
}

function commonnessCompare(a,b){
  const aRaw=a?.raw||{};
  const bRaw=b?.raw||{};
  const aPopularity=Number(aRaw.popularityPercentile);
  const bPopularity=Number(bRaw.popularityPercentile);
  if(Number.isFinite(aPopularity)&&Number.isFinite(bPopularity)&&aPopularity!==bPopularity){
    return bPopularity-aPopularity;
  }
  const aRank=Number(a?.usageRank);
  const bRank=Number(b?.usageRank);
  const aHasRank=Number.isFinite(aRank)&&aRank>0;
  const bHasRank=Number.isFinite(bRank)&&bRank>0;
  if(aHasRank!==bHasRank)return aHasRank?-1:1;
  if(aHasRank&&bHasRank&&aRank!==bRank)return aRank-bRank;
  const aCount=Number(a?.usageCount||0);
  const bCount=Number(b?.usageCount||0);
  if(aCount!==bCount)return bCount-aCount;
  return 0;
}

export function sortStudioWriterRows(rows,{
  sort='recommended',
  rhymeType='all',
  querySyllables=0,
  locale='de',
}={}){
  if(sort==='recommended')return [...rows];
  return rows.map((row,index)=>({row,index})).sort((left,right)=>{
    const a=left.row,b=right.row;
    let order=0;
    if(sort==='alpha'){
      order=String(a?.word||'').localeCompare(
        String(b?.word||''),
        locale==='en'?'en':'de',
        {sensitivity:'base'},
      );
    }else if(sort==='syllables'){
      order=studioRowSyllableDistance(a,querySyllables)
        -studioRowSyllableDistance(b,querySyllables);
    }else if(sort==='common'){
      order=commonnessCompare(a,b);
    }else if(sort==='closest'){
      order=studioRowRelationScore(b,rhymeType)-studioRowRelationScore(a,rhymeType);
    }
    return order||left.index-right.index;
  }).map((item)=>item.row);
}
