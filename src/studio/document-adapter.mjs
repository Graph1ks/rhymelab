import {migrateLegacyStudioState} from './document-model.mjs';

export const STUDIO_STORAGE_KEY='rhymelab-studio-concept-v2';

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
    }],
    active:'demo',
    saved:[],
    theme:'dark',
    themeSlots:{light:null,dark:null},
    customThemes:[],
    fontSize:21,
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
