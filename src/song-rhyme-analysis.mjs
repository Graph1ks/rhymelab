export const SONG_RHYME_ANALYSIS_SCHEMA='rhymelab-song-rhyme-analysis-v1';

export function compactSongAnalysisAnchorResult(result){
  return {
    status:String(result?.status||''),
    input:String(result?.input||''),
    query:result?.query||null,
    queries:result?.queries||null,
    results:(Array.isArray(result?.results)?result.results:[]).map((row)=>({
      word:String(row?.word||row?.surface||row?.normalized||''),
      normalized:String(row?.normalized||row?.word||row?.surface||''),
      primaryType:row?.primaryType==null?null:String(row.primaryType),
      score:Number(row?.score||0),
      language:String(row?.language||''),
      relations:(Array.isArray(row?.relations)?row.relations:[])
        .filter((entry)=>entry?.type==='assonance'||entry?.type==='consonance')
        .map((entry)=>({type:String(entry.type),score:Number(entry.score||0)})),
    })),
  };
}

export function createSongAnalysisAnchorCache({maxEntries=384}={}){
  const limit=Math.max(8,Math.min(4096,Number(maxEntries)||384));
  const entries=new Map();
  const trim=()=>{
    while(entries.size>limit){
      const oldest=entries.keys().next().value;
      entries.delete(oldest);
    }
  };
  return {
    get size(){return entries.size},
    get maxEntries(){return limit},
    clear(){entries.clear()},
    async resolve(key,loader){
      const cacheKey=String(key||'');
      if(!cacheKey)throw new TypeError('analysis cache key is required');
      if(typeof loader!=='function')throw new TypeError('analysis cache loader is required');
      if(entries.has(cacheKey)){
        const pending=entries.get(cacheKey);
        entries.delete(cacheKey);
        entries.set(cacheKey,pending);
        return {value:await pending,hit:true};
      }
      const pending=Promise.resolve().then(loader);
      entries.set(cacheKey,pending);
      trim();
      try{
        const value=await pending;
        entries.delete(cacheKey);
        entries.set(cacheKey,Promise.resolve(value));
        trim();
        return {value,hit:false};
      }catch(error){
        if(entries.get(cacheKey)===pending)entries.delete(cacheKey);
        throw error;
      }
    },
  };
}

const PRIMARY_TYPES=new Set([
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
]);
const RELATION_TIER={
  identity:-1,
  multisyllabic_perfect:0,
  perfect:0,
  multisyllabic_slant:1,
  family:2,
  slant:3,
  assonance:4,
  consonance:5,
};
export const SONG_RHYME_RELATION_LABELS=Object.freeze({
  identity:'Identisch',
  multisyllabic_perfect:'Mehrsilbiger Vollreim',
  perfect:'Vollreim',
  multisyllabic_slant:'Mehrsilbiger Slant-Reim',
  family:'Reimfamilie',
  slant:'Slant-Reim',
  assonance:'Assonanz',
  consonance:'Konsonanz',
});

function normalize(value){
  return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('de-DE');
}
function pairKey(a,b){return [a,b].sort((x,y)=>x.localeCompare(y,'de')).join('\u0000')}
function schemeLabel(index){
  let number=index;
  let label='';
  do{
    label=String.fromCharCode(65+(number%26))+label;
    number=Math.floor(number/26)-1;
  }while(number>=0);
  return label;
}
function relationFromRow(row){
  const primary=String(row?.primaryType||'');
  if(PRIMARY_TYPES.has(primary)){
    return {
      type:primary,
      label:SONG_RHYME_RELATION_LABELS[primary]||primary,
      score:Number(row?.score||0),
      primary:true,
      language:String(row?.language||''),
    };
  }
  const relations=Array.isArray(row?.relations)?row.relations:[];
  const candidates=relations
    .filter((entry)=>entry?.type==='assonance'||entry?.type==='consonance')
    .map((entry)=>({
      type:entry.type,
      label:SONG_RHYME_RELATION_LABELS[entry.type]||entry.type,
      score:Number(entry.score||0),
      primary:false,
      language:String(row?.language||''),
    }))
    .sort((a,b)=>(RELATION_TIER[a.type]??99)-(RELATION_TIER[b.type]??99)||b.score-a.score);
  return candidates[0]||null;
}
function strongerRelation(a,b){
  if(!a)return b;
  if(!b)return a;
  const tierA=RELATION_TIER[a.type]??99,tierB=RELATION_TIER[b.type]??99;
  return tierA-tierB<0?a:tierB-tierA<0?b:(b.score>a.score?b:a);
}

function normalizedQueryDetail(result,word,language){
  const candidates=[
    result?.query,
    result?.queries?.[language],
    result?.queries?.de,
    result?.queries?.en,
  ].filter(Boolean);
  const detail=candidates.find((entry)=>normalize(entry?.normalized||entry?.surface)===word)||candidates[0]||null;
  if(!detail)return null;
  const primaryStressSyllables=Array.isArray(detail.primaryStressSyllables)
    ?detail.primaryStressSyllables.map(Number).filter(Number.isFinite)
    :detail.primaryStressSyllable!=null
      ?[Number(detail.primaryStressSyllable)].filter(Number.isFinite)
      :[];
  const secondaryStressSyllables=Array.isArray(detail.secondaryStressSyllables)
    ?detail.secondaryStressSyllables.map(Number).filter(Number.isFinite)
    :[];
  return {
    surface:String(detail.surface||result?.input||word),
    normalized:word,
    language:String(detail.language||language||''),
    ipa:String(detail.preferredIpa||detail.ipa||''),
    syllableCount:Number(detail.syllableCount||0),
    stressPattern:detail.stressPattern==null?null:String(detail.stressPattern),
    primaryStressSyllable:primaryStressSyllables[0]??null,
    primaryStressSyllables,
    secondaryStressSyllables,
    generatedPronunciation:detail.generatedPronunciation===true,
    pronunciationProvenance:detail.pronunciationProvenance||detail.queryPronunciation?.method||null,
  };
}

export function extractAnalysisEndWord(line){
  const text=String(line??'').normalize('NFKC').trim();
  const match=text.match(/([\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*)[\p{P}\p{S}\s]*$/u);
  return match?.[1]||'';
}

async function mapWithConcurrency(values,limit,worker){
  const output=new Array(values.length);
  let cursor=0;
  const count=Math.max(1,Math.min(values.length||1,Number(limit)||1));
  await Promise.all(Array.from({length:count},async()=>{
    while(true){
      const index=cursor++;
      if(index>=values.length)return;
      try{output[index]=await worker(values[index],index)}
      catch{output[index]=null}
    }
  }));
  return output;
}

export async function analyzeSongEndRhymes(words,{searchAnchor,language='de',maxUnique=64,concurrency=4}={}){
  if(typeof searchAnchor!=='function')throw new TypeError('searchAnchor is required');
  const surfaces=(Array.isArray(words)?words:[]).map((word)=>String(word??'').trim());
  const normalized=surfaces.map(normalize);
  const unique=[...new Set(normalized.filter(Boolean))].slice(0,Math.max(1,Number(maxUnique)||64));
  const targetSet=new Set(unique);
  const relations=new Map();
  const resolved=new Set();
  const unresolved=new Set();
  const details=new Map();

  const anchorResults=await mapWithConcurrency(
    unique,
    Math.max(1,Math.min(8,Number(concurrency)||4)),
    (word)=>searchAnchor(word,{language}),
  );
  for(let queryIndex=0;queryIndex<unique.length;queryIndex++){
    const word=unique[queryIndex];
    const result=anchorResults[queryIndex];
    if(!result||result.status==='query_not_found'||result.status==='language_unavailable'){
      unresolved.add(word);
      continue;
    }
    resolved.add(word);
    const queryDetail=normalizedQueryDetail(result,word,language);
    if(queryDetail)details.set(word,queryDetail);
    for(const row of result.results||[]){
      const candidate=normalize(row?.normalized||row?.word);
      if(!candidate||candidate===word||!targetSet.has(candidate))continue;
      const relation=relationFromRow(row);
      if(!relation)continue;
      const key=pairKey(word,candidate);
      relations.set(key,strongerRelation(relations.get(key),relation));
    }
  }

  for(let i=0;i<unique.length;i++){
    for(let j=i+1;j<unique.length;j++){
      if(unique[i]!==unique[j])continue;
      relations.set(pairKey(unique[i],unique[j]),{
        type:'identity',
        label:SONG_RHYME_RELATION_LABELS.identity,
        score:1,
        primary:true,
        language,
      });
    }
  }

  const scheme=[];
  let nextScheme=0;
  for(let index=0;index<normalized.length;index++){
    const word=normalized[index];
    if(!word){scheme.push('—');continue}
    let best=null;
    for(let prior=0;prior<index;prior++){
      const previous=normalized[prior];
      if(!previous)continue;
      let relation=null;
      if(previous===word){
        relation={type:'identity',label:SONG_RHYME_RELATION_LABELS.identity,score:1,primary:true,language};
      }else{
        relation=relations.get(pairKey(word,previous))||null;
      }
      if(!relation?.primary)continue;
      if(!best||strongerRelation(best.relation,relation)===relation)best={prior,relation};
    }
    if(best)scheme.push(scheme[best.prior]);
    else scheme.push(schemeLabel(nextScheme++));
  }

  const lineRelations=normalized.map((word,index)=>{
    if(!word)return null;
    let best=null;
    for(let prior=0;prior<index;prior++){
      const previous=normalized[prior];
      if(!previous)continue;
      const relation=previous===word
        ?{type:'identity',label:SONG_RHYME_RELATION_LABELS.identity,score:1,primary:true,language}
        :relations.get(pairKey(word,previous))||null;
      if(!relation)continue;
      if(!best||strongerRelation(best.relation,relation)===relation)best={prior,relation};
    }
    return best;
  });

  return {
    schema:SONG_RHYME_ANALYSIS_SCHEMA,
    source:'canonical_writer_runtime',
    language,
    words:surfaces,
    normalized,
    scheme,
    lineRelations,
    wordDetails:normalized.map((word)=>word?(details.get(word)||null):null),
    uniqueWordDetails:unique.map((word)=>details.get(word)||{
      surface:surfaces[normalized.indexOf(word)]||word,
      normalized:word,
      language:'',
      ipa:'',
      syllableCount:0,
      stressPattern:null,
      primaryStressSyllable:null,
      primaryStressSyllables:[],
      secondaryStressSyllables:[],
      unresolved:true,
    }),
    pairs:[...relations.entries()].map(([key,relation])=>{
      const [left,right]=key.split('\u0000');
      return {left,right,...relation};
    }),
    coverage:{
      unique:unique.length,
      resolved:resolved.size,
      unresolved:[...unresolved],
      truncated:[...new Set(normalized.filter(Boolean))].length>unique.length,
    },
  };
}
