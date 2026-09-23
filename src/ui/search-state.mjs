export const SEARCH_STATE_SCHEMA='rhymelab-search-state-v1';
export const SEARCH_STATE_STORAGE_KEY='rhymelab.searchState.v1';

const QUERY_BASES=new Set(['de','en','both']);
const SCOPES=new Set(['all','words','phrases','entities']);
const RHYME_TYPES=new Set([
  'all',
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
  'assonance',
  'consonance',
]);
const SYLLABLE_FILTERS=new Set(['all','same','near','near1','near2','near3','1','2','3']);
const SORTS=new Set(['recommended','syllables','common','closest','alpha']);
const VARIANTS=new Set(['preferred','all']);

function normalizeScope(value){
  const text=String(value||'all').trim().toLowerCase();
  const alias={word:'words',phrase:'phrases',entity:'entities'}[text]||text;
  return SCOPES.has(alias)?alias:'all';
}
function normalizeBoolean(value){
  if(typeof value==='boolean')return value;
  if(value===1||value==='1'||value==='true'||value==='all')return true;
  return false;
}
function normalizeEnum(value,allowed,fallback){
  const text=String(value||'').trim();
  return allowed.has(text)?text:fallback;
}
function cleanCategory(value){
  const text=String(value||'all').trim();
  return text||'all';
}
function cleanCategories(value,fallback='all'){
  const source=Array.isArray(value)
    ?value
    :String(value??'').split(',');
  const categories=[];
  for(const entry of source){
    const category=cleanCategory(entry);
    if(category==='all')continue;
    if(!categories.includes(category))categories.push(category);
    if(categories.length>=24)break;
  }
  if(categories.length)return categories;
  const legacy=cleanCategory(fallback);
  return legacy==='all'?[]:[legacy];
}

export function createSearchState(input={}){
  const queryBasis=normalizeEnum(input.queryBasis??input.basis,QUERY_BASES,'de');
  const resultLanguage=normalizeEnum(
    input.resultLanguage,
    QUERY_BASES,
    queryBasis,
  );
  const generatedOnly=normalizeBoolean(input.generatedOnly);
  const entityCategories=cleanCategories(input.entityCategories,input.entityCategory);
  return {
    schema:SEARCH_STATE_SCHEMA,
    anchor:String(input.anchor??input.query??'').normalize('NFKC').trim(),
    queryBasis,
    resultLanguage,
    scope:normalizeScope(input.scope),
    rhymeType:normalizeEnum(input.rhymeType??input.type,RHYME_TYPES,'all'),
    syllableFilter:normalizeEnum(input.syllableFilter, SYLLABLE_FILTERS,'all'),
    sort:normalizeEnum(input.sort,SORTS,'recommended'),
    variantMode:normalizeEnum(input.variantMode??input.variants,VARIANTS,'preferred'),
    historical:normalizeBoolean(input.historical),
    generated:generatedOnly||normalizeBoolean(input.generated),
    generatedOnly,
    entityCategory:entityCategories[0]||'all',
    entityCategories,
    selectedResultId:String(input.selectedResultId||''),
  };
}

export function patchSearchState(current,patch={}){
  return createSearchState({...createSearchState(current),...patch});
}

export function loadSearchState(storage=globalThis.localStorage){
  try{
    const raw=storage?.getItem?.(SEARCH_STATE_STORAGE_KEY);
    return raw?createSearchState(JSON.parse(raw)):createSearchState();
  }catch{
    return createSearchState();
  }
}

export function saveSearchState(value,storage=globalThis.localStorage){
  const normalized=createSearchState(value);
  storage?.setItem?.(SEARCH_STATE_STORAGE_KEY,JSON.stringify(normalized));
  return normalized;
}

export function searchStateFromUrl(urlLike,current={}){
  const base=createSearchState(current);
  let url;
  try{
    url=urlLike instanceof URL
      ?urlLike
      :new URL(String(urlLike||''),'http://rhymelab.local/');
  }catch{
    return base;
  }
  const params=url.searchParams;
  const hasCategory=params.has('entity_category');
  const hasCategories=params.has('entity_categories');
  const entityCategory=hasCategory?params.get('entity_category'):base.entityCategory;
  const entityCategories=hasCategories
    ?params.get('entity_categories')
    :hasCategory
      ?[entityCategory]
      :base.entityCategories;
  return createSearchState({
    ...base,
    anchor:params.get('q')??base.anchor,
    queryBasis:params.get('lang')??base.queryBasis,
    resultLanguage:params.get('result_lang')??base.resultLanguage,
    scope:params.get('scope')??base.scope,
    rhymeType:params.get('type')??base.rhymeType,
    syllableFilter:params.get('syllables')??base.syllableFilter,
    sort:params.get('sort')??base.sort,
    variantMode:params.get('variants')??base.variantMode,
    historical:params.has('historical')?params.get('historical'):base.historical,
    generated:params.has('generated')?params.get('generated'):base.generated,
    generatedOnly:params.has('generated_only')?params.get('generated_only'):base.generatedOnly,
    entityCategory,
    entityCategories,
  });
}

function setOrDelete(params,key,value,defaultValue){
  if(value==null||value===''||value===defaultValue)params.delete(key);
  else params.set(key,String(value));
}

export function writeSearchStateToUrl(urlLike,value){
  const state=createSearchState(value);
  const url=urlLike instanceof URL
    ?new URL(urlLike.href)
    :new URL(String(urlLike||''),'http://rhymelab.local/');
  const params=url.searchParams;
  setOrDelete(params,'q',state.anchor,'');
  setOrDelete(params,'lang',state.queryBasis,'de');
  setOrDelete(params,'result_lang',state.resultLanguage,state.queryBasis);
  setOrDelete(params,'scope',state.scope,'all');
  setOrDelete(params,'type',state.rhymeType,'all');
  setOrDelete(params,'syllables',state.syllableFilter,'all');
  setOrDelete(params,'sort',state.sort,'recommended');
  setOrDelete(params,'variants',state.variantMode,'preferred');
  setOrDelete(params,'historical',state.historical?'all':'','');
  setOrDelete(params,'generated',state.generated?'1':'','');
  setOrDelete(params,'generated_only',state.generatedOnly?'1':'','');
  if(state.entityCategories.length>1){
    params.delete('entity_category');
    params.set('entity_categories',state.entityCategories.join(','));
  }else{
    params.delete('entity_categories');
    setOrDelete(params,'entity_category',state.entityCategory,'all');
  }
  return url;
}

export function searchStateToWriterParams(value,{
  wordLimit=250,
  wordPool=800,
  phraseLimit=250,
  phrasePool=512,
  phrasePerChannel=128,
  entityLimit=250,
  entityPool=512,
}={}){
  const state=createSearchState(value);
  const params=new URLSearchParams({
    q:state.anchor,
    language:state.queryBasis,
    result_language:state.resultLanguage,
    scope:state.scope,
    word_limit:String(wordLimit),
    word_pool:String(wordPool),
    phrase_limit:String(phraseLimit),
    phrase_pool:String(phrasePool),
    phrase_per_channel:String(phrasePerChannel),
    entity_limit:String(entityLimit),
    entity_pool:String(entityPool),
    entity_category:state.entityCategories.length>1?'all':state.entityCategory,
    variants:state.variantMode==='all'?'all':'standard',
    historical:state.historical?'all':'current',
    generated:state.generated?'1':'0',
    generated_only:state.generatedOnly?'1':'0',
    type:state.rhymeType,
    syllables:state.syllableFilter,
  });
  if(state.entityCategories.length>1)params.set('entity_categories',state.entityCategories.join(','));
  return params;
}
