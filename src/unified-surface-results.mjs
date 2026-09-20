function normalizedSurfaceKey(row){
  const language=String(row?.language||'').trim().toLocaleLowerCase('en-US');
  const normalized=String(row?.normalized||row?.word||row?.surface||'')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase(language==='de'?'de-DE':'en-US');
  return language&&normalized?language+'\u0000'+normalized:null;
}

function uniqueStrings(values){
  const out=[];
  const seen=new Set();
  for(const value of values||[]){
    const text=String(value||'').trim();
    if(!text||seen.has(text))continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function entityCategoryRows(row){
  const entries=[];
  const seen=new Set();
  const add=(entry)=>{
    const category=typeof entry==='string'?entry:entry?.category;
    const code=String(category||'').trim();
    if(!code||seen.has(code))return;
    seen.add(code);
    entries.push(typeof entry==='string'?{category:code}:{...entry,category:code});
  };
  if(row?.primaryCategory)add({category:row.primaryCategory});
  for(const entry of row?.entityCategories||[])add(entry);
  return entries;
}

function pronunciationRows(row,kind){
  const direct={
    ipa:String(row?.ipa||'').trim(),
    locale:row?.locale||null,
    generated:Boolean(
      row?.generatedPronunciation
      ||row?.pronunciationGenerated
    ),
    source:row?.pronunciationSource||null,
    kind,
  };
  const rows=[];
  if(direct.ipa)rows.push(direct);
  for(const item of row?.surfacePronunciations||[]){
    const ipa=String(item?.ipa||'').trim();
    if(!ipa)continue;
    rows.push({
      ipa,
      locale:item?.locale||null,
      generated:Boolean(item?.generated),
      source:item?.source||null,
      kind:item?.kind||kind,
    });
  }
  return rows;
}

function uniquePronunciations(rows){
  const out=[];
  const seen=new Set();
  for(const row of rows||[]){
    const key=[
      String(row?.ipa||'').trim(),
      String(row?.locale||''),
    ].join('\u0000');
    if(!row?.ipa||seen.has(key))continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function entityIdentity(row){
  return {
    qid:row?.entityQid||null,
    entityId:row?.entityId??null,
    entityNameId:row?.entityNameId??null,
    primaryCategory:row?.primaryCategory||null,
    categories:entityCategoryRows(row),
    popularityScore:Number(row?.popularityScore||0),
    popularityPercentile:Number(row?.popularityPercentile||0),
    popularityTier:row?.popularityTier||null,
    nameKind:row?.nameKind||null,
    namePreferred:Boolean(row?.namePreferred),
  };
}

function mergeEntitySurfaceRows(rows){
  const candidates=[...(rows||[])];
  if(!candidates.length)return null;
  const core=candidates.filter(
    (row)=>!row?.generatedPronunciation&&!row?.pronunciationGenerated,
  );
  const representative=(core.length?core:candidates)
    .slice()
    .sort((a,b)=>
      Number(a?.channelRank||Number.MAX_SAFE_INTEGER)
      -Number(b?.channelRank||Number.MAX_SAFE_INTEGER)
    )[0];

  const categoryMap=new Map();
  const identities=[];
  const seenQids=new Set();
  for(const row of candidates){
    for(const entry of entityCategoryRows(row)){
      if(!categoryMap.has(entry.category))categoryMap.set(entry.category,entry);
    }
    const qid=String(row?.entityQid||'').trim();
    if(qid&&!seenQids.has(qid)){
      seenQids.add(qid);
      identities.push(entityIdentity(row));
    }
  }

  const entityCategories=[...categoryMap.values()];
  const entityQids=uniqueStrings(candidates.map((row)=>row?.entityQid));
  const surfacePronunciations=uniquePronunciations(
    candidates.flatMap((row)=>pronunciationRows(row,'entity')),
  );
  const bestRank=Math.min(
    ...candidates.map(
      (row)=>Number(row?.channelRank||Number.MAX_SAFE_INTEGER),
    ),
  );

  return {
    ...representative,
    resultId:'surface:'+String(representative?.language||'')
      +':'+String(representative?.normalized||''),
    channelRank:Number.isFinite(bestRank)?bestRank:representative?.channelRank,
    surfaceRoles:['entity'],
    entityQids,
    entityIdentities:identities,
    entityCategories,
    primaryCategory:representative?.primaryCategory
      ||entityCategories[0]?.category
      ||null,
    surfacePronunciations,
    mergedEntityCount:identities.length,
    mergedPronunciationCount:surfacePronunciations.length,
  };
}

function mergeWordSurfaceRows(rows){
  const candidates=[...(rows||[])];
  if(!candidates.length)return null;
  const core=candidates.filter((row)=>!row?.generatedPronunciation);
  const representative=(core.length?core:candidates)[0];
  const surfacePronunciations=uniquePronunciations(
    candidates.flatMap((row)=>pronunciationRows(row,'word')),
  );
  return {
    ...representative,
    surfaceRoles:uniqueStrings([
      ...(representative?.surfaceRoles||[]),
      'word',
    ]),
    surfacePronunciations,
    mergedWordCount:candidates.length,
  };
}

function attachEntityMetadataToWord(word,entity){
  if(!entity)return word;
  return {
    ...word,
    surfaceRoles:uniqueStrings([
      ...(word?.surfaceRoles||[]),
      'word',
      'entity',
    ]),
    entityQids:[...(entity.entityQids||[])],
    entityIdentities:[...(entity.entityIdentities||[])],
    entityCategories:[...(entity.entityCategories||[])],
    primaryCategory:entity.primaryCategory||null,
    surfacePronunciations:uniquePronunciations([
      ...(word?.surfacePronunciations||[]),
      ...(entity?.surfacePronunciations||[]),
    ]),
    mergedEntityCount:Number(entity.mergedEntityCount||0),
    mergedPronunciationCount:uniquePronunciations([
      ...(word?.surfacePronunciations||[]),
      ...(entity?.surfacePronunciations||[]),
    ]).length,
    surfaceAggregation:'word_preferred_over_entity_v1',
  };
}

function groupRows(rows){
  const order=[];
  const groups=new Map();
  for(const row of rows||[]){
    const key=normalizedSurfaceKey(row);
    if(!key){
      order.push({key:null,row});
      continue;
    }
    if(!groups.has(key)){
      groups.set(key,[]);
      order.push({key,row:null});
    }
    groups.get(key).push(row);
  }
  return {order,groups};
}

export function consolidateUnifiedSurfaceResults({
  wordResults=[],
  entityResults=[],
}={}){
  const wordGrouped=groupRows(wordResults);
  const entityGrouped=groupRows(entityResults);
  const mergedEntities=new Map();
  for(const [key,rows] of entityGrouped.groups){
    mergedEntities.set(key,mergeEntitySurfaceRows(rows));
  }

  const words=[];
  const seenWordKeys=new Set();
  for(const entry of wordGrouped.order){
    if(!entry.key){
      words.push(entry.row);
      continue;
    }
    if(seenWordKeys.has(entry.key))continue;
    seenWordKeys.add(entry.key);
    const word=mergeWordSurfaceRows(wordGrouped.groups.get(entry.key));
    const entity=mergedEntities.get(entry.key)||null;
    words.push(attachEntityMetadataToWord(word,entity));
    if(entity)mergedEntities.delete(entry.key);
  }

  const entities=[];
  const seenEntityKeys=new Set();
  for(const entry of entityGrouped.order){
    if(!entry.key){
      entities.push(entry.row);
      continue;
    }
    if(seenEntityKeys.has(entry.key))continue;
    seenEntityKeys.add(entry.key);
    const merged=mergedEntities.get(entry.key);
    if(!merged)continue;
    entities.push(merged);
  }

  const originalWordCount=wordResults.length;
  const originalEntityCount=entityResults.length;
  return {
    wordResults:words,
    entityResults:entities,
    diagnostics:{
      originalWordCount,
      visibleWordCount:words.length,
      originalEntityCount,
      visibleEntityCount:entities.length,
      collapsedWordRows:Math.max(0,originalWordCount-words.length),
      collapsedEntityRows:Math.max(
        0,
        originalEntityCount-entities.length,
      ),
      absorbedEntityRows:Math.max(
        0,
        originalEntityCount
        -entities.reduce(
          (sum,row)=>sum+Math.max(1,Number(row?.mergedEntityCount||1)),
          0,
        ),
      ),
    },
  };
}
