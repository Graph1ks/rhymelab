function compactUnique(values){
  return [...new Set(values.map((value)=>String(value||'').trim()).filter(Boolean))];
}

export function studioDetailKey(row){
  const raw=row?.raw||{};
  return [
    row?.kind||raw.resultKind||'word',
    row?.lang||raw.language||'de',
    row?.id||raw.resultId||raw.windowId||raw.normalized||row?.word||'',
  ].join(':');
}

async function readJson(response){
  try{return await response.json();}catch{return null;}
}

export function createStudioDetailClient({fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetch is unavailable');
  const cache=new Map();
  let activeController=null;
  let requestId=0;

  return {
    cancel(){
      activeController?.abort();
      activeController=null;
    },
    clear(){cache.clear();},
    async load(row){
      const key=studioDetailKey(row);
      const raw=row?.raw||{};
      activeController?.abort();
      activeController=null;
      const current=++requestId;
      if(cache.has(key))return {...cache.get(key),raw};
      if((row?.kind||raw.resultKind)==='entity'){
        return {kind:'entity',detail:null,raw,source:'writer-result'};
      }

      const controller=new AbortController();
      activeController=controller;
      let url='';
      if((row?.kind||raw.resultKind)==='phrase'&&raw.phraseId){
        const params=new URLSearchParams({
          id:String(raw.phraseId),
          generated:row?.generatedPronunciation?'1':'0',
        });
        url=`/api/phrases/detail?${params}`;
      }else if((row?.kind||raw.resultKind)==='word'){
        const params=new URLSearchParams({
          language:String(row?.lang||raw.language||'de'),
          generated:row?.generatedPronunciation?'1':'0',
        });
        url=`/api/word/${encodeURIComponent(row?.word||raw.word||raw.surface||'')}?${params}`;
      }else{
        const result={kind:row?.kind||raw.resultKind||'word',detail:null,raw,source:'writer-result'};
        cache.set(key,result);
        return result;
      }

      const response=await fetchImpl(url,{signal:controller.signal,headers:{accept:'application/json'}});
      if(current!==requestId){
        const stale=new Error('Stale Studio detail request');
        stale.name='AbortError';
        throw stale;
      }
      const detail=response.ok?await readJson(response):null;
      const cached={
        kind:row?.kind||raw.resultKind||'word',
        detail,
        source:detail?'detail-endpoint':'writer-result',
      };
      cache.set(key,cached);
      return {...cached,raw};
    },
  };
}

function sourceRows(row,detail){
  const raw=row?.raw||{};
  return compactUnique([
    detail?.pronunciationProvenance,
    detail?.lexiconLayer,
    raw.pronunciationSource,
    raw.pronunciationSourceRecord,
    raw.pronunciationProvenance,
    raw.lexiconLayer,
    ...(detail?.pronunciations||[]).map((item)=>item?.source),
  ]);
}

function pronunciationRows(row,detail){
  const raw=row?.raw||{};
  const values=(detail?.pronunciations||[]).map((item)=>({
    ipa:String(item?.ipa||'').trim(),
    preferred:item?.preferred===true,
    locale:item?.locale||null,
    register:item?.register||null,
    dialect:item?.dialect||null,
    source:item?.source||null,
  })).filter((item)=>item.ipa);
  if(values.length)return values;
  const ipa=String(detail?.preferredIpa||detail?.ipa||raw.ipa||'').trim();
  return ipa?[{ipa,preferred:true,locale:raw.locale||null,register:null,dialect:null,source:raw.pronunciationSource||null}]:[];
}

export function buildStudioDetailModel(row,payload=null){
  const raw=payload?.raw||row?.raw||{};
  const detail=payload?.detail||{};
  const pronunciations=pronunciationRows(row,detail);
  const preferred=pronunciations.find((item)=>item.preferred)||pronunciations[0]||null;
  const categories=compactUnique([
    raw.primaryCategory,
    raw.selectedCategory,
    ...(Array.isArray(raw.entityCategories)?raw.entityCategories:[]),
  ]);
  const phraseTypes=compactUnique([
    ...(Array.isArray(detail?.phraseTypes)?detail.phraseTypes:[]),
    ...(Array.isArray(raw.phraseTypes)?raw.phraseTypes:[]),
  ]);
  const lexicalTags=compactUnique([
    ...(Array.isArray(detail?.lexicalTags)?detail.lexicalTags:[]),
    ...(Array.isArray(raw.lexicalTags)?raw.lexicalTags:[]),
  ]);
  const relations=(Array.isArray(raw.relations)?raw.relations:[])
    .filter((item)=>item?.type)
    .map((item)=>({
      type:item.type,
      strength:item.strength||null,
      score:Number(item.score||0),
    }));
  const popularity=raw.popularityPercentile==null
    ?null
    :Math.round(Number(raw.popularityPercentile)*100);

  return {
    key:studioDetailKey(row),
    kind:row?.kind||raw.resultKind||'word',
    word:row?.word||raw.word||raw.surface||detail?.surface||detail?.canonical||'',
    language:String(row?.lang||raw.language||'de').toUpperCase(),
    ipa:String(detail?.preferredIpa||detail?.ipa||preferred?.ipa||raw.ipa||''),
    pronunciations,
    syllables:Number(detail?.syllableCount??raw.syllableCount??row?.syll??0)||null,
    primaryStress:detail?.primaryStressSyllable??raw.primaryStressSyllable??null,
    stressPattern:detail?.stressPattern||raw.stressPattern||null,
    partOfSpeech:detail?.partOfSpeech||raw.partOfSpeech||null,
    lemma:detail?.lemma||raw.lemma||null,
    lexicalTags,
    usageRank:detail?.usageRank??raw.usageRank??row?.usageRank??null,
    usageCount:detail?.usageCount??raw.usageCount??row?.usageCount??null,
    usageSourceCount:detail?.usageSourceCount??raw.usageSourceCount??null,
    historical:Boolean(detail?.historical||raw.historical),
    generated:Boolean(row?.generatedPronunciation||detail?.generatedPronunciation||raw.generatedPronunciation),
    phraseTypes,
    crossedWordBoundaries:raw.crossedWordBoundaries??null,
    retrievalChannels:Array.isArray(raw.retrievalChannels)?raw.retrievalChannels:[],
    categories,
    entityQid:raw.entityQid||null,
    popularity,
    popularityTier:raw.popularityTier||null,
    relationLabel:row?.relationLabel||'Klangtreffer',
    relationType:row?.relationType||raw.primaryType||raw.type||'weak',
    score:Number.isFinite(Number(row?.score))?Number(row.score):Number(raw.score||0),
    relations,
    components:raw.components||null,
    sources:sourceRows(row,detail),
    detailSource:payload?.source||'writer-result',
  };
}
