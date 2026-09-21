export const QUERY_PRONUNCIATION_CACHE_SCHEMA='rhymelab-query-pronunciation-cache-v1';
export const QUERY_PRONUNCIATION_CACHE_DB='rhymelab-query-pronunciation';
export const QUERY_PRONUNCIATION_CACHE_STORE='generated_pronunciations';
export const QUERY_PRONUNCIATION_CACHE_VERSION=1;
export const QUERY_PRONUNCIATION_CACHE_MAX_ENTRIES=10000;

let databasePromise=null;

function normalizeLanguage(value){
  const language=String(value||'').trim().toLocaleLowerCase('en-US');
  if(!['de','en'].includes(language)) throw new TypeError(`Unsupported cache language: ${value}`);
  return language;
}

function normalizeSurface(value,language){
  const code=normalizeLanguage(language);
  return String(value??'')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu,' ')
    .toLocaleLowerCase(code==='de'?'de-DE':'en-US');
}

export function generatedPronunciationCacheKey(surface,language){
  const code=normalizeLanguage(language);
  return `${code}\u0000${normalizeSurface(surface,code)}`;
}

export function buildGeneratedPronunciationCacheRecord(
  detail,
  databaseRevision,
  now=Date.now(),
){
  const language=normalizeLanguage(detail?.language);
  const normalized=normalizeSurface(detail?.normalized||detail?.surface,language);
  const ipa=String(detail?.ipa||'').trim();
  const policy=String(detail?.policy||'').trim();
  const method=String(detail?.method||'').trim();
  const revision=String(databaseRevision||'').trim();
  if(!normalized||!ipa||!policy||!method||!revision) return null;
  if(method==='client_source_reference') return null;

  return {
    key:generatedPronunciationCacheKey(normalized,language),
    schema:QUERY_PRONUNCIATION_CACHE_SCHEMA,
    language,
    normalized,
    surface:String(detail?.surface||normalized).normalize('NFKC').trim(),
    ipa,
    method,
    policy,
    sourceBacked:detail?.sourceBacked===true,
    clientOnly:true,
    components:Array.isArray(detail?.components)?detail.components.slice(0,16).map(String):null,
    databaseRevision:revision,
    createdAt:Number(now),
    updatedAt:Number(now),
    lastUsedAt:Number(now),
  };
}

export function isGeneratedPronunciationCacheRecordUsable(
  record,
  {
    surface,
    language,
    policy,
    databaseRevision,
  }={},
){
  if(!record||record.schema!==QUERY_PRONUNCIATION_CACHE_SCHEMA) return false;
  const code=normalizeLanguage(language);
  const normalized=normalizeSurface(surface,code);
  return (
    record.key===generatedPronunciationCacheKey(normalized,code)
    &&record.language===code
    &&record.normalized===normalized
    &&String(record.policy||'')===String(policy||'')
    &&String(record.databaseRevision||'')===String(databaseRevision||'')
    &&Boolean(String(record.ipa||'').trim())
  );
}

function openDatabase(indexedDb=globalThis.indexedDB){
  if(!indexedDb) return Promise.resolve(null);
  if(databasePromise) return databasePromise;

  databasePromise=new Promise((resolve,reject)=>{
    const request=indexedDb.open(
      QUERY_PRONUNCIATION_CACHE_DB,
      QUERY_PRONUNCIATION_CACHE_VERSION,
    );
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(QUERY_PRONUNCIATION_CACHE_STORE)){
        const store=db.createObjectStore(
          QUERY_PRONUNCIATION_CACHE_STORE,
          {keyPath:'key'},
        );
        store.createIndex('lastUsedAt','lastUsedAt');
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{
      databasePromise=null;
      reject(request.error||new Error('IndexedDB pronunciation cache open failed'));
    };
  }).catch(()=>null);

  return databasePromise;
}

async function deleteKey(key){
  const db=await openDatabase();
  if(!db) return;
  await new Promise((resolve)=>{
    const tx=db.transaction(QUERY_PRONUNCIATION_CACHE_STORE,'readwrite');
    tx.objectStore(QUERY_PRONUNCIATION_CACHE_STORE).delete(key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>resolve();
    tx.onabort=()=>resolve();
  });
}

export async function readGeneratedPronunciationCache({
  surface,
  language,
  policy,
  databaseRevision,
}={}){
  const revision=String(databaseRevision||'').trim();
  if(!revision||!globalThis.indexedDB) return null;
  const code=normalizeLanguage(language);
  const key=generatedPronunciationCacheKey(surface,code);
  const db=await openDatabase();
  if(!db) return null;

  const record=await new Promise((resolve)=>{
    const tx=db.transaction(QUERY_PRONUNCIATION_CACHE_STORE,'readonly');
    const request=tx.objectStore(QUERY_PRONUNCIATION_CACHE_STORE).get(key);
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>resolve(null);
  });
  if(!record) return null;

  if(!isGeneratedPronunciationCacheRecordUsable(record,{
    surface,
    language:code,
    policy,
    databaseRevision:revision,
  })){
    await deleteKey(key);
    return null;
  }

  const now=Date.now();
  try{
    const tx=db.transaction(QUERY_PRONUNCIATION_CACHE_STORE,'readwrite');
    tx.objectStore(QUERY_PRONUNCIATION_CACHE_STORE).put({
      ...record,
      lastUsedAt:now,
    });
  }catch{}

  return {
    language:record.language,
    surface:record.surface,
    normalized:record.normalized,
    ipa:record.ipa,
    method:record.method,
    policy:record.policy,
    sourceBacked:Boolean(record.sourceBacked),
    clientOnly:true,
    components:Array.isArray(record.components)?record.components:null,
    cache:{
      persistent:true,
      schema:record.schema,
      databaseRevision:record.databaseRevision,
      createdAt:record.createdAt,
      lastUsedAt:now,
    },
  };
}

async function pruneCache(db){
  const count=await new Promise((resolve)=>{
    const tx=db.transaction(QUERY_PRONUNCIATION_CACHE_STORE,'readonly');
    const request=tx.objectStore(QUERY_PRONUNCIATION_CACHE_STORE).count();
    request.onsuccess=()=>resolve(Number(request.result||0));
    request.onerror=()=>resolve(0);
  });
  const removeCount=count-QUERY_PRONUNCIATION_CACHE_MAX_ENTRIES;
  if(removeCount<=0) return;

  await new Promise((resolve)=>{
    const tx=db.transaction(QUERY_PRONUNCIATION_CACHE_STORE,'readwrite');
    const index=tx.objectStore(QUERY_PRONUNCIATION_CACHE_STORE).index('lastUsedAt');
    const request=index.openCursor();
    let remaining=removeCount;
    request.onsuccess=()=>{
      const cursor=request.result;
      if(!cursor||remaining<=0) return;
      cursor.delete();
      remaining-=1;
      cursor.continue();
    };
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>resolve();
    tx.onabort=()=>resolve();
  });
}

export async function writeGeneratedPronunciationCache(
  detail,
  databaseRevision,
){
  if(!globalThis.indexedDB) return false;
  const record=buildGeneratedPronunciationCacheRecord(detail,databaseRevision);
  if(!record) return false;
  const db=await openDatabase();
  if(!db) return false;

  const previous=await new Promise((resolve)=>{
    const tx=db.transaction(QUERY_PRONUNCIATION_CACHE_STORE,'readonly');
    const request=tx.objectStore(QUERY_PRONUNCIATION_CACHE_STORE).get(record.key);
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>resolve(null);
  });
  if(previous?.createdAt) record.createdAt=previous.createdAt;

  const stored=await new Promise((resolve)=>{
    const tx=db.transaction(QUERY_PRONUNCIATION_CACHE_STORE,'readwrite');
    tx.objectStore(QUERY_PRONUNCIATION_CACHE_STORE).put(record);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>resolve(false);
    tx.onabort=()=>resolve(false);
  });
  if(stored) pruneCache(db).catch(()=>{});
  return stored;
}
