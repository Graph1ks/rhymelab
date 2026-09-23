const STUDIO_WORD_PATTERN=/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

function normalizeStudioAnalysisWord(value){
  return String(value??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('de-DE');
}

export function studioAnalysisOccurrences(lines,{limit=500}={}){
  const output=[];
  const max=Math.max(1,Math.min(800,Number(limit)||500));
  for(const [lineIndex,line] of (Array.isArray(lines)?lines:[]).entries()){
    let wordIndex=0;
    for(const match of String(line??'').normalize('NFKC').matchAll(STUDIO_WORD_PATTERN)){
      const surface=match[0];
      output.push({
        index:output.length,
        lineIndex,
        wordIndex:wordIndex++,
        surface,
        normalized:normalizeStudioAnalysisWord(surface),
      });
      if(output.length>=max)return output;
    }
  }
  return output;
}

function studioRhymePairKey(left,right){
  return [normalizeStudioAnalysisWord(left),normalizeStudioAnalysisWord(right)]
    .sort((a,b)=>a.localeCompare(b,'de'))
    .join('\u0000');
}

export function expandStudioRhymeRelations(payload,occurrences){
  const rows=Array.isArray(occurrences)?occurrences:[];
  const pairMap=new Map(
    (Array.isArray(payload?.pairs)?payload.pairs:[]).map((pair)=>[
      studioRhymePairKey(pair.left,pair.right),
      pair,
    ]),
  );
  const relations=[];
  for(let leftIndex=0;leftIndex<rows.length;leftIndex++){
    for(let rightIndex=leftIndex+1;rightIndex<rows.length;rightIndex++){
      const left=rows[leftIndex],right=rows[rightIndex];
      let relation=null;
      if(left.normalized&&left.normalized===right.normalized){
        relation={
          type:'identity',
          label:'Identisch',
          score:1,
          primary:true,
          language:String(payload?.language||''),
        };
      }else{
        relation=pairMap.get(studioRhymePairKey(left.normalized,right.normalized))||null;
      }
      if(!relation)continue;
      relations.push({
        index:relations.length,
        left,
        right,
        type:String(relation.type||''),
        label:String(relation.label||relation.type||'Klangrelation'),
        score:Number(relation.score||0),
        primary:relation.primary===true,
        language:String(relation.language||payload?.language||''),
        sameBar:left.lineIndex===right.lineIndex,
      });
    }
  }
  return relations;
}

export function studioRhymeTypeCounts(relations){
  const counts={};
  for(const relation of Array.isArray(relations)?relations:[]){
    const type=String(relation?.type||'unknown');
    counts[type]=(counts[type]||0)+1;
  }
  return counts;
}

export function extractStudioEndWord(line){
  const text=String(line??'').normalize('NFKC').trim();
  const match=text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*[.!?,;:]*$/u);
  return match?match[0].replace(/[.!?,;:]+$/u,''):'';
}

export function studioAnalysisWords(lines){
  return (Array.isArray(lines)?lines:[]).map(extractStudioEndWord);
}

export function createStudioAnalysisClient({fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetch implementation is required');

  const requestWords=async(words,{language='de',generated=false,generatedOnly=false,runtimeDb='',signal,mode='end'}={})=>{
    const params=new URLSearchParams();
    for(const word of words)params.append('word',word);
    params.set('language',['de','en','both'].includes(language)?language:'de');
    if(mode==='all')params.set('mode','all');
    if(generated)params.set('generated','1');
    if(generatedOnly)params.set('generated_only','1');
    if(runtimeDb)params.set('runtime_db',String(runtimeDb));
    const response=await fetchImpl('/api/analysis/rhyme-scheme?'+params.toString(),{signal});
    const payload=await response.json();
    if(!response.ok){
      const error=new Error(payload?.error||('Analysis request failed with '+response.status));
      error.status=response.status;
      error.payload=payload;
      throw error;
    }
    return payload;
  };

  return {
    async analyze(lines,options={}){
      return requestWords(studioAnalysisWords(lines),{...options,mode:'end'});
    },
    async analyzeAll(lines,options={}){
      const occurrences=studioAnalysisOccurrences(lines,{limit:500});
      const payload=await requestWords(occurrences.map((entry)=>entry.surface),{...options,mode:'all'});
      return {
        ...payload,
        occurrences,
        occurrenceRelations:expandStudioRhymeRelations(payload,occurrences),
      };
    },
  };
}
