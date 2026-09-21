const CAPABILITY_ENDPOINTS=Object.freeze(['/api/health','/api/dataset-stats']);

async function readJson(fetchImpl,url,signal){
  const response=await fetchImpl(url,{signal,headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

export function normalizeStudioCapabilities(health={},datasetStats={}){
  const generated=health.generated_optin||{};
  const totals=datasetStats.totals||{};
  const servingV1=health.serving_v1?.enabled===true;
  return {
    status:health.status==='ok'?'ready':'degraded',
    runtime:servingV1?'serving-v1':String(health.writer_runtime||'writer'),
    servingV1,
    deWriter:Boolean(health.writer_database),
    enWriter:health.english_available===true,
    phrases:health.phrase_available===true,
    entities:health.entity_available===true,
    generated:generated.available===true,
    generatedDefault:generated.default_enabled===true,
    queryPronunciationRevision:String(health.query_pronunciation_revision||''),
    dataset:{
      core:Number(totals.core||0),
      generated:Number(totals.generated||0),
      total:Number(totals.total||0),
      consistent:totals.consistent!==false,
    },
  };
}

export async function loadStudioCapabilities({
  fetchImpl=globalThis.fetch,
  signal,
}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetch is unavailable');
  const [health,datasetStats]=await Promise.all(
    CAPABILITY_ENDPOINTS.map((url)=>readJson(fetchImpl,url,signal)),
  );
  return normalizeStudioCapabilities(health,datasetStats);
}

export {CAPABILITY_ENDPOINTS};
