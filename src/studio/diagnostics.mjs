export const STUDIO_DIAGNOSTICS_SCHEMA='rhymelab-studio-diagnostics-v1';

function bool(value){return value===true}
function status(ok,detail=''){return {ok:Boolean(ok),detail:String(detail||'')}}
function matchMediaSafe(windowObj,query){
  try{return windowObj?.matchMedia?.(query)?.matches===true}catch{return false}
}

export function collectStudioEnvironmentDiagnostics({
  windowObj=globalThis.window,
  documentObj=globalThis.document,
  documentStoreStatus='idle',
  documentStoreAuthority=false,
  writerStatus='idle',
  writerCapabilities=null,
  writerRuntimeTiming=null,
  controlsBound=false,
}={}){
  const navigatorObj=windowObj?.navigator||globalThis.navigator||{};
  const viewport=windowObj?.visualViewport;
  const coarsePointer=matchMediaSafe(windowObj,'(pointer: coarse)');
  const reducedMotion=matchMediaSafe(windowObj,'(prefers-reduced-motion: reduce)');
  const audioSupported=Boolean(windowObj?.AudioContext||windowObj?.webkitAudioContext);
  const indexedDbSupported=Boolean(windowObj?.indexedDB||globalThis.indexedDB);
  const visualViewportSupported=Boolean(viewport);
  const storageSupported=(()=>{
    try{return Boolean(windowObj?.localStorage||globalThis.localStorage)}catch{return false}
  })();
  const languageSupport=writerCapabilities?.languages||{};
  const writerAvailable=writerStatus==='ready'||writerStatus==='idle'
    ?Boolean(
      languageSupport.de?.available
      ||languageSupport.en?.available
      ||writerCapabilities?.bases?.de
      ||writerCapabilities?.bases?.en
    )
    :false;

  const currentTiming=writerRuntimeTiming?.searchMs==null?null:Number(writerRuntimeTiming.searchMs);
  const averageTiming=writerRuntimeTiming?.averageLast100Ms==null?null:Number(writerRuntimeTiming.averageLast100Ms);

  const checks=[
    {id:'controls',label:'Studio controls',...status(controlsBound,controlsBound?'bound':'not bound')},
    {id:'indexeddb',label:'IndexedDB API',...status(indexedDbSupported,indexedDbSupported?'available':'unavailable')},
    {id:'document-store',label:'DocumentStore authority',...status(documentStoreAuthority,documentStoreStatus)},
    {id:'writer',label:'Writer runtime',...status(writerAvailable,writerStatus)},
    {id:'audio',label:'Web Audio',...status(audioSupported,audioSupported?'available':'unavailable')},
    {id:'visual-viewport',label:'VisualViewport',...status(visualViewportSupported,visualViewportSupported?'available':'fallback')},
    {id:'storage',label:'Local preferences storage',...status(storageSupported,storageSupported?'available':'unavailable')},
    {id:'reduced-motion',label:'Reduced-motion signal',...status(true,reducedMotion?'reduce':'normal')},
    {id:'pointer',label:'Primary pointer',...status(true,coarsePointer?'coarse/touch':'fine/mouse')},
  ];

  return {
    schema:STUDIO_DIAGNOSTICS_SCHEMA,
    createdAt:Date.now(),
    viewport:{
      width:Number(viewport?.width||windowObj?.innerWidth||0),
      height:Number(viewport?.height||windowObj?.innerHeight||0),
      layoutWidth:Number(windowObj?.innerWidth||0),
      layoutHeight:Number(windowObj?.innerHeight||0),
      devicePixelRatio:Number(windowObj?.devicePixelRatio||1),
    },
    input:{
      maxTouchPoints:Number(navigatorObj.maxTouchPoints||0),
      coarsePointer,
    },
    preferences:{
      reducedMotion,
      language:String(navigatorObj.language||''),
    },
    platform:{
      userAgent:String(navigatorObj.userAgent||''),
      secureContext:windowObj?.isSecureContext===true,
    },
    runtime:{
      documentStoreStatus,
      documentStoreAuthority:Boolean(documentStoreAuthority),
      writerStatus,
      writerCurrentMs:Number.isFinite(currentTiming)?currentTiming:null,
      writerAverageLast100Ms:Number.isFinite(averageTiming)?averageTiming:null,
      writerSampleCount:Number(writerRuntimeTiming?.sampleCount||0),
    },
    checks,
    summary:{
      passing:checks.filter((check)=>check.ok).length,
      total:checks.length,
      failing:checks.filter((check)=>!check.ok).map((check)=>check.id),
    },
  };
}

export function diagnosticsFilename(date=new Date()){
  const stamp=date instanceof Date&&!Number.isNaN(date.valueOf())
    ?date.toISOString().slice(0,19).replaceAll(':','-')
    :'diagnostics';
  return `rhymelab-studio-diagnostics-${stamp}.json`;
}
