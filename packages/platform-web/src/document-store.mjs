import {
  STUDIO_DOCUMENT_SCHEMA,
  STUDIO_DOCUMENT_VERSION,
  migrateLegacyStudioState,
  validateStudioDocumentSnapshot,
} from '../../shared-core/src/document/document-model.mjs';

export const STUDIO_DOCUMENT_DB='rhymelab-studio';
export const STUDIO_DOCUMENT_DB_VERSION=2;

const STORE_NAMES=Object.freeze({
  meta:'meta',
  songs:'songs',
  bars:'bars',
  revisions:'revisions',
  folders:'folders',
  backups:'backups',
});

function requestResult(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('IndexedDB request failed'));
  });
}
function transactionDone(transaction){
  return new Promise((resolve,reject)=>{
    transaction.oncomplete=()=>resolve();
    transaction.onabort=()=>reject(transaction.error||new Error('IndexedDB transaction aborted'));
    transaction.onerror=()=>reject(transaction.error||new Error('IndexedDB transaction failed'));
  });
}
function createStore(db,name,keyPath='id'){
  return db.objectStoreNames.contains(name)?null:db.createObjectStore(name,{keyPath});
}
function ensureIndex(store,name,keyPath,options={}){
  if(store&&!store.indexNames.contains(name))store.createIndex(name,keyPath,options);
}

export function openStudioDocumentDatabase(indexedDBImpl=globalThis.indexedDB){
  if(!indexedDBImpl?.open)return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
    const request=indexedDBImpl.open(STUDIO_DOCUMENT_DB,STUDIO_DOCUMENT_DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      const meta=createStore(db,STORE_NAMES.meta,'key');
      const songs=createStore(db,STORE_NAMES.songs,'id');
      const bars=createStore(db,STORE_NAMES.bars,'id');
      const revisions=createStore(db,STORE_NAMES.revisions,'id');
      createStore(db,STORE_NAMES.folders,'id');
      const backups=createStore(db,STORE_NAMES.backups,'id');

      ensureIndex(songs,'folderId','folderId');
      ensureIndex(songs,'updatedAt','updatedAt');
      ensureIndex(songs,'deletedAt','deletedAt');
      ensureIndex(bars,'songId','songId');
      ensureIndex(bars,'songOrder',['songId','orderKey'],{unique:false});
      ensureIndex(revisions,'songId','songId');
      ensureIndex(revisions,'songCreated',['songId','createdAt'],{unique:false});
      ensureIndex(backups,'createdAt','createdAt');
      ensureIndex(backups,'sourceSignature','sourceSignature',{unique:false});
      void meta;
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Unable to open Studio IndexedDB'));
    request.onblocked=()=>reject(new Error('Studio IndexedDB upgrade blocked'));
  });
}

async function getAll(store){
  if(typeof store.getAll==='function')return requestResult(store.getAll());
  return new Promise((resolve,reject)=>{
    const rows=[];
    const request=store.openCursor();
    request.onsuccess=()=>{
      const cursor=request.result;
      if(!cursor){resolve(rows);return}
      rows.push(cursor.value);
      cursor.continue();
    };
    request.onerror=()=>reject(request.error||new Error('IndexedDB cursor failed'));
  });
}

export function createStudioDocumentStore({indexedDBImpl=globalThis.indexedDB}={}){
  let databasePromise=null;
  const database=()=>databasePromise||(databasePromise=openStudioDocumentDatabase(indexedDBImpl));

  return {
    async available(){
      try{return Boolean(await database())}catch{return false}
    },
    async saveSnapshot(snapshot){
      const validation=validateStudioDocumentSnapshot(snapshot);
      if(!validation.valid)throw new Error(`Invalid Studio document snapshot: ${validation.errors.join(', ')}`);
      const db=await database();
      if(!db)return {saved:false,reason:'indexeddb_unavailable'};
      const names=[STORE_NAMES.meta,STORE_NAMES.songs,STORE_NAMES.bars,STORE_NAMES.revisions,STORE_NAMES.folders];
      const transaction=db.transaction(names,'readwrite');
      const done=transactionDone(transaction);
      const stores=Object.fromEntries(names.map((name)=>[name,transaction.objectStore(name)]));
      for(const name of [STORE_NAMES.songs,STORE_NAMES.bars,STORE_NAMES.revisions,STORE_NAMES.folders])stores[name].clear();
      stores.meta.put({
        key:'document',
        schema:STUDIO_DOCUMENT_SCHEMA,
        schemaVersion:STUDIO_DOCUMENT_VERSION,
        activeSongId:snapshot.activeSongId,
        meta:{...snapshot.meta},
        savedAt:Date.now(),
      });
      for(const row of snapshot.songs)stores.songs.put(row);
      for(const row of snapshot.bars)stores.bars.put(row);
      for(const row of snapshot.revisions)stores.revisions.put(row);
      for(const row of snapshot.folders)stores.folders.put(row);
      await done;
      return {
        saved:true,
        counts:{
          songs:snapshot.songs.length,
          bars:snapshot.bars.length,
          revisions:snapshot.revisions.length,
          folders:snapshot.folders.length,
        },
      };
    },
    async loadSnapshot(){
      const db=await database();
      if(!db)return null;
      const names=[STORE_NAMES.meta,STORE_NAMES.songs,STORE_NAMES.bars,STORE_NAMES.revisions,STORE_NAMES.folders];
      const transaction=db.transaction(names,'readonly');
      const done=transactionDone(transaction);
      const metaStore=transaction.objectStore(STORE_NAMES.meta);
      const [meta,songs,bars,revisions,folders]=await Promise.all([
        requestResult(metaStore.get('document')),
        getAll(transaction.objectStore(STORE_NAMES.songs)),
        getAll(transaction.objectStore(STORE_NAMES.bars)),
        getAll(transaction.objectStore(STORE_NAMES.revisions)),
        getAll(transaction.objectStore(STORE_NAMES.folders)),
      ]);
      await done;
      if(!meta)return null;
      const snapshot={
        schema:meta.schema,
        schemaVersion:meta.schemaVersion,
        activeSongId:meta.activeSongId,
        meta:{...meta.meta},
        songs,
        bars,
        revisions,
        folders,
      };
      const validation=validateStudioDocumentSnapshot(snapshot);
      if(!validation.valid)throw new Error(`Corrupt Studio document snapshot: ${validation.errors.join(', ')}`);
      return snapshot;
    },
    async saveLegacyBackup({backup,report}){
      const db=await database();
      if(!db)return {saved:false,reason:'indexeddb_unavailable'};
      const transaction=db.transaction([STORE_NAMES.backups],'readwrite');
      const done=transactionDone(transaction);
      const store=transaction.objectStore(STORE_NAMES.backups);
      const id=`legacy:${report.sourceSignature}`;
      store.put({
        id,
        kind:'legacy',
        createdAt:Date.now(),
        sourceSchema:report.sourceSchema,
        sourceSignature:report.sourceSignature,
        backupSignature:report.backupSignature,
        backup,
      });
      await done;
      return {saved:true,id};
    },
    async saveDocumentBackup(snapshot,{reason='manual'}={}){
      const validation=validateStudioDocumentSnapshot(snapshot);
      if(!validation.valid)throw new Error(`Invalid Studio document backup: ${validation.errors.join(', ')}`);
      const db=await database();
      if(!db)return {saved:false,reason:'indexeddb_unavailable'};
      const transaction=db.transaction([STORE_NAMES.backups],'readwrite');
      const done=transactionDone(transaction);
      const store=transaction.objectStore(STORE_NAMES.backups);
      const createdAt=Date.now();
      const id=`document:${createdAt}:${Math.random().toString(36).slice(2,8)}`;
      store.put({
        id,
        kind:'document',
        createdAt,
        reason:String(reason||'manual'),
        schema:snapshot.schema,
        schemaVersion:snapshot.schemaVersion,
        counts:{
          songs:snapshot.songs.length,
          bars:snapshot.bars.length,
          revisions:snapshot.revisions.length,
          folders:snapshot.folders.length,
        },
        snapshot,
      });
      await done;
      return {saved:true,id};
    },
    async getBackup(id){
      const db=await database();
      if(!db)return null;
      const transaction=db.transaction([STORE_NAMES.backups],'readonly');
      const done=transactionDone(transaction);
      const row=await requestResult(transaction.objectStore(STORE_NAMES.backups).get(String(id||'')));
      await done;
      return row||null;
    },
    async listBackups(){
      const db=await database();
      if(!db)return [];
      const transaction=db.transaction([STORE_NAMES.backups],'readonly');
      const done=transactionDone(transaction);
      const rows=await getAll(transaction.objectStore(STORE_NAMES.backups));
      await done;
      return rows.sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));
    },
    async restoreDocumentBackup(id){
      const row=await this.getBackup(id);
      if(!row||row.kind!=='document'||!row.snapshot)return {restored:false,reason:'backup_not_found'};
      const before=await this.loadSnapshot();
      if(before)await this.saveDocumentBackup(before,{reason:'before_recovery_restore'});
      const saveResult=await this.saveSnapshot(row.snapshot);
      const loaded=await this.loadSnapshot();
      const validation=loaded?validateStudioDocumentSnapshot(loaded):{valid:false,errors:['load_failed']};
      if(!validation.valid)throw new Error(`Studio backup restore verification failed: ${validation.errors.join(', ')}`);
      return {restored:true,saveResult,snapshot:loaded,backup:row};
    },
    close(){
      databasePromise?.then((db)=>db?.close?.()).catch(()=>{});
      databasePromise=null;
    },
  };
}

export async function migrateLegacyStudioStateToStore(legacyState,store){
  if(!store)throw new TypeError('store is required');
  const migration=migrateLegacyStudioState(legacyState);
  if(!migration.report.valid){
    throw new Error(`Studio document migration failed: ${migration.report.errors.join(', ')}`);
  }
  const backupResult=await store.saveLegacyBackup(migration);
  const saveResult=await store.saveSnapshot(migration.snapshot);
  const loaded=await store.loadSnapshot();
  const validation=loaded?validateStudioDocumentSnapshot(loaded):{valid:false,errors:['load_failed']};
  if(!validation.valid){
    throw new Error(`Studio document migration verification failed: ${validation.errors.join(', ')}`);
  }
  const counts={
    songs:loaded.songs.length,
    bars:loaded.bars.length,
    revisions:loaded.revisions.length,
    folders:loaded.folders.length,
  };
  for(const [key,value] of Object.entries(migration.report.counts)){
    if(counts[key]!==value)throw new Error(`Studio document migration count mismatch: ${key}`);
  }
  return {
    migration,
    backupResult,
    saveResult,
    verified:true,
    counts,
  };
}


export async function shadowLegacyStudioStateToStore(legacyState,store){
  if(!store)throw new TypeError('store is required');
  const migration=migrateLegacyStudioState(legacyState);
  if(!migration.report.valid){
    throw new Error(`Studio document shadow migration failed: ${migration.report.errors.join(', ')}`);
  }
  const saveResult=await store.saveSnapshot(migration.snapshot);
  return {
    report:migration.report,
    saveResult,
  };
}
