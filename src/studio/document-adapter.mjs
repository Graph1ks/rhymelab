import {barsForSong,migrateLegacyStudioState} from './document-model.mjs';

export const STUDIO_STORAGE_KEY='rhymelab-studio-concept-v2';
export const STUDIO_PREFERENCES_KEY='rhymelab-studio-preferences-v1';

export const STUDIO_DEMO_LINES=Object.freeze([
  'Ich trag die Stadt noch unter meiner Haut',
  'Die letzten Lichter werden langsam laut',
  'Ein leeres Blatt, der ganze Kopf noch wach',
  'Ich schreib uns einen Weg durch diese Nacht',
  'Die Bahn zieht ihre Linien durch die Zeit',
  'Wir waren für den nächsten Schritt bereit',
  'Zwischen all dem Lärm hör ich uns leben',
  'Und jede neue Zeile lässt uns schweben',
]);

export function createStudioState(){
  return {
    songs:[{
      id:'demo',
      title:'Zwischen den Zeilen',
      lines:[...STUDIO_DEMO_LINES],
      folder:'Nachtschicht',
      revisions:[],
      steps:{},
      createdAt:0,
      updatedAt:0,
    }],
    active:'demo',
    folders:['Nachtschicht','Entwürfe'],
    saved:[],
    theme:'dark',
    themeSlots:{light:null,dark:null},
    customThemes:[],
    fontSize:21,
    uiLanguage:'de',
  };
}

function isValidStoredState(value){
  return Boolean(
    value
    &&Array.isArray(value.songs)
    &&value.songs.length
    &&value.songs.every((song)=>Array.isArray(song.lines)),
  );
}

export function loadStudioState(storage=globalThis.localStorage){
  const fallback=createStudioState();
  try{
    const raw=storage?.getItem?.(STUDIO_STORAGE_KEY);
    if(!raw)return fallback;
    const parsed=JSON.parse(raw);
    return isValidStoredState(parsed)?{...fallback,...parsed}:fallback;
  }catch{
    return fallback;
  }
}

export function writeStudioState(state,storage=globalThis.localStorage){
  storage?.setItem?.(STUDIO_STORAGE_KEY,JSON.stringify(state));
}


export function loadStudioDocumentSnapshot(storage=globalThis.localStorage){
  const legacyState=loadStudioState(storage);
  return migrateLegacyStudioState(legacyState);
}


const PREFERENCE_FIELDS=Object.freeze([
  'saved',
  'theme',
  'themeSlots',
  'customThemes',
  'fontSize',
  'hideUsed',
  'density',
  'motion',
  'assistWidth',
  'editorFont',
  'uiLanguage',
]);

export function studioPreferencesFromState(state={}){
  const preferences={};
  for(const field of PREFERENCE_FIELDS){
    if(state[field]!==undefined)preferences[field]=state[field];
  }
  return preferences;
}

export function loadStudioPreferences(storage=globalThis.localStorage){
  try{
    const raw=storage?.getItem?.(STUDIO_PREFERENCES_KEY);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch{
    return {};
  }
}

export function writeStudioPreferences(state,storage=globalThis.localStorage){
  storage?.setItem?.(STUDIO_PREFERENCES_KEY,JSON.stringify(studioPreferencesFromState(state)));
}

function revisionFromDocumentRow(row){
  const bars=(row?.documentSnapshot?.bars||[]).slice()
    .sort((a,b)=>Number(a.orderKey)-Number(b.orderKey)||String(a.id).localeCompare(String(b.id)));
  const snapshot={
    lines:bars.map((bar)=>String(bar.text??'')),
    barIds:bars.map((bar)=>String(bar.id??'')),
    barRevisions:bars.map((bar)=>Number.isInteger(Number(bar.revision))?Number(bar.revision):0),
    editorNextBarId:Math.max(1,Number(row?.documentSnapshot?.editorNextBarId)||1),
    steps:{...(row?.documentSnapshot?.steps||{})},
    performance:{...(row?.documentSnapshot?.performance||{})},
    performanceCues:{...(row?.documentSnapshot?.performanceCues||{})},
    performanceAnchors:{...(row?.documentSnapshot?.performanceAnchors||{})},
  };
  return {
    at:Number(row?.createdAt)||0,
    reason:String(row?.reason||'document_revision'),
    text:snapshot.lines.join('\n'),
    snapshot,
  };
}

export function studioStateFromDocumentSnapshot(snapshot,baseState=createStudioState()){
  if(!snapshot||!Array.isArray(snapshot.songs)||!Array.isArray(snapshot.bars))return baseState;
  const folderById=new Map((snapshot.folders||[]).map((row)=>[row.id,row.name]));
  const revisionsBySong=new Map();
  for(const row of snapshot.revisions||[]){
    if(!revisionsBySong.has(row.songId))revisionsBySong.set(row.songId,[]);
    revisionsBySong.get(row.songId).push(revisionFromDocumentRow(row));
  }
  for(const rows of revisionsBySong.values())rows.sort((a,b)=>a.at-b.at);

  const songs=snapshot.songs.map((row)=>{
    const bars=barsForSong(snapshot,row.id);
    return {
      id:row.id,
      title:String(row.title||'Untitled'),
      folder:String(folderById.get(row.folderId)||'Entwürfe'),
      lines:bars.length?bars.map((bar)=>String(bar.text??'')):[''],
      barIds:bars.length?bars.map((bar)=>String(bar.id)):[`bar:${row.id}:empty`],
      barRevisions:bars.length?bars.map((bar)=>Number(bar.revision)||0):[0],
      editorNextBarId:Math.max(1,Number(row.editorNextBarId)||1),
      steps:{...(row.steps||{})},
      performance:{...(row.performance||{})},
      performanceCues:{...(row.performanceCues||{})},
      performanceAnchors:{...(row.performanceAnchors||{})},
      revisions:revisionsBySong.get(row.id)||[],
      createdAt:Number(row.createdAt)||0,
      updatedAt:Number(row.updatedAt)||0,
      deleted:Boolean(row.deletedAt),
      deletedAt:row.deletedAt==null?null:Number(row.deletedAt)||0,
    };
  });
  const active=songs.some((row)=>row.id===snapshot.activeSongId&&!row.deleted)
    ?snapshot.activeSongId
    :songs.find((row)=>!row.deleted)?.id||songs[0]?.id||null;
  const folders=(snapshot.folders||[]).slice()
    .sort((a,b)=>Number(a.orderKey)-Number(b.orderKey)||String(a.name).localeCompare(String(b.name),'de'))
    .map((row)=>String(row.name||'').trim())
    .filter(Boolean);

  return {
    ...baseState,
    songs,
    active,
    folders,
  };
}
