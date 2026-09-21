const CAPABILITY_ENDPOINTS=Object.freeze(['/api/health','/api/dataset-stats']);

async function readJson(fetchImpl,url,signal){
  const response=await fetchImpl(url,{signal,headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

export async function loadStudioCapabilities({
  fetchImpl=globalThis.fetch,
  signal,
}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetch is unavailable');
  const [health,datasetStats]=await Promise.all(
    CAPABILITY_ENDPOINTS.map((url)=>readJson(fetchImpl,url,signal)),
  );
  return {health,datasetStats};
}

export {CAPABILITY_ENDPOINTS};
