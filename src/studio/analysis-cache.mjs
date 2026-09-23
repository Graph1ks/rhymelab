export const STUDIO_ANALYSIS_CACHE_SCHEMA='rhymelab-studio-analysis-cache-v1';
export const STUDIO_ANALYSIS_CACHE_DB='rhymelab-studio-analysis';
export const STUDIO_ANALYSIS_CACHE_STORE='analyses';
export const STUDIO_ANALYSIS_CACHE_VERSION=1;
export const STUDIO_ANALYSIS_CACHE_MAX_ENTRIES=96;

let databasePromise=null;
const memoryCache=new Map();

function normalizeKey(value){
  return String(value||'').normalize('NFKC').trim();
}
function touchMemory(key,payload){
  if(memoryCache.has(key))memoryCache.delete(key);
  memoryCache.set(key,payload);
  while(memoryCache.size>24)memoryCache.delete(memoryCache.keys().next().value);
}
function openDatabase(indexedDb=globalThis.indexedDB){
  if(!indexedDb?.open)return Promise.resolve(null);
  if(databasePromise)return databasePromise;
  databasePromise=new Promise((resolve,reject)=>{
    const request=indexedDb.open(STUDIO_ANALYSIS_CACHE_DB,STUDIO_ANALYSIS_CACHE_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STUDIO_ANALYSIS_CACHE_STORE)){
        const store=db.createObjectStore(STUDIO_ANALYSIS_CACHE_STORE,{keyPath:'key'});
        store.createIndex('lastUsedAt','lastUsedAt');
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{
      databasePromise=null;
      reject(request.error||new Error('Studio analysis cache open failed'));
    };
  }).catch(()=>null);
  return databasePromise;
}
async function pruneCache(db){
  const count=await new Promise((resolve)=>{
    const tx=db.transaction(STUDIO_ANALYSIS_CACHE_STORE,'readonly');
    const request=tx.objectStore(STUDIO_ANALYSIS_CACHE_STORE).count();
    request.onsuccess=()=>resolve(Number(request.result||0));
    request.onerror=()=>resolve(0);
  });
  let remaining=count-STUDIO_ANALYSIS_CACHE_MAX_ENTRIES;
  if(remaining<=0)return;
  await new Promise((resolve)=>{
    const tx=db.transaction(STUDIO_ANALYSIS_CACHE_STORE,'readwrite');
    const request=tx.objectStore(STUDIO_ANALYSIS_CACHE_STORE).index('lastUsedAt').openCursor();
    request.onsuccess=()=>{
      const cursor=request.result;
      if(!cursor||remaining<=0)return;
      cursor.delete();
      remaining-=1;
      cursor.continue();
    };
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>resolve();
    tx.onabort=()=>resolve();
  });
}

export async function readStudioAnalysisCache(key){
  const cacheKey=normalizeKey(key);
  if(!cacheKey)return null;
  if(memoryCache.has(cacheKey)){
    const payload=memoryCache.get(cacheKey);
    touchMemory(cacheKey,payload);
    return payload;
  }
  const db=await openDatabase();
  if(!db)return null;
  const record=await new Promise((resolve)=>{
    const tx=db.transaction(STUDIO_ANALYSIS_CACHE_STORE,'readonly');
    const request=tx.objectStore(STUDIO_ANALYSIS_CACHE_STORE).get(cacheKey);
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>resolve(null);
  });
  if(!record||record.schema!==STUDIO_ANALYSIS_CACHE_SCHEMA)return null;
  touchMemory(cacheKey,record.payload);
  try{
    const tx=db.transaction(STUDIO_ANALYSIS_CACHE_STORE,'readwrite');
    tx.objectStore(STUDIO_ANALYSIS_CACHE_STORE).put({...record,lastUsedAt:Date.now()});
  }catch{}
  return record.payload??null;
}

export async function writeStudioAnalysisCache(key,payload){
  const cacheKey=normalizeKey(key);
  if(!cacheKey||!payload)return false;
  touchMemory(cacheKey,payload);
  const db=await openDatabase();
  if(!db)return false;
  const now=Date.now();
  const stored=await new Promise((resolve)=>{
    const tx=db.transaction(STUDIO_ANALYSIS_CACHE_STORE,'readwrite');
    tx.objectStore(STUDIO_ANALYSIS_CACHE_STORE).put({
      key:cacheKey,
      schema:STUDIO_ANALYSIS_CACHE_SCHEMA,
      payload,
      updatedAt:now,
      lastUsedAt:now,
    });
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>resolve(false);
    tx.onabort=()=>resolve(false);
  });
  if(stored)pruneCache(db).catch(()=>{});
  return stored;
}

export function clearStudioAnalysisMemoryCache(){
  memoryCache.clear();
}
