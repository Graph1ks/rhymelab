export const RUNTIME_EDITION_STORAGE_KEY='rhymelab.internal.dbLab.v1';
export const RUNTIME_EDITIONS=Object.freeze(['lite','standard','full']);

export function normalizeRuntimeEdition(value){
  const id=String(value||'').trim().toLowerCase();
  return RUNTIME_EDITIONS.includes(id)?id:'standard';
}

export function loadRuntimeEditionSelection(storage=globalThis.localStorage){
  try{return normalizeRuntimeEdition(storage?.getItem?.(RUNTIME_EDITION_STORAGE_KEY)||'standard')}
  catch{return 'standard'}
}

export function saveRuntimeEditionSelection(id,storage=globalThis.localStorage){
  const value=normalizeRuntimeEdition(id);
  try{storage?.setItem?.(RUNTIME_EDITION_STORAGE_KEY,value)}catch{}
  return value;
}

export function runtimeEditionSummaryMap(payload){
  return Object.fromEntries(
    (payload?.databases||[]).map((row)=>[String(row.id),row]),
  );
}

export function capabilitiesForRuntimeEdition(summary,current={}){
  if(!summary?.available)return current;
  const caps=summary.capabilities||{};
  return {
    ...current,
    status:'ready',
    runtime:'serving-v1/'+String(summary.id||'standard'),
    servingV1:true,
    deWriter:caps.words_de===true,
    enWriter:caps.words_en===true,
    phrases:caps.phrases===true,
    entities:caps.entities===true,
    generated:caps.generated===true,
    generatedDefault:false,
    queryPronunciationRevision:String(
      summary.state?.productSemanticFingerprint
      ||summary.meta?.product_adapter_semantic_fingerprint
      ||''
    ),
  };
}
