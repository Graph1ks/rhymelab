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
  return {
    async analyze(lines,{language='de',generated=false,generatedOnly=false,runtimeDb='',signal}={}){
      const words=studioAnalysisWords(lines);
      const params=new URLSearchParams();
      for(const word of words)params.append('word',word);
      params.set('language',['de','en','both'].includes(language)?language:'de');
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
    },
  };
}
