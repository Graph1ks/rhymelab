export const SYLLABLE_FILTERS=Object.freeze([
  'all','same','near','near1','near2','near3','1','2','3',
]);

const FILTER_SET=new Set(SYLLABLE_FILTERS);

export function normalizeSyllableFilter(value){
  const normalized=String(value||'all').trim().toLowerCase();
  return FILTER_SET.has(normalized)?normalized:'all';
}

export function syllableFilterRange(value,querySyllables=0){
  const mode=normalizeSyllableFilter(value);
  const query=Math.max(0,Number(querySyllables)||0);
  if(mode==='all')return null;
  if(mode==='1')return {min:1,max:1};
  if(mode==='2')return {min:2,max:2};
  if(mode==='3')return {min:3,max:Number.MAX_SAFE_INTEGER};
  if(!query)return null;
  if(mode==='same')return {min:query,max:query};
  const distance=mode==='near2'?2:mode==='near3'?3:1;
  return {min:Math.max(1,query-distance),max:query+distance};
}

export function matchesSyllableFilter(count,value='all',querySyllables=0){
  const range=syllableFilterRange(value,querySyllables);
  if(!range)return true;
  const syllables=Number(count);
  return Number.isFinite(syllables)&&syllables>=range.min&&syllables<=range.max;
}

export function clampSyllableFilterRange(value,querySyllables,minAvailable,maxAvailable){
  const min=Math.max(1,Number(minAvailable)||1);
  const max=Math.max(min,Number(maxAvailable)||min);
  const requested=syllableFilterRange(value,querySyllables);
  if(!requested)return {min,max};
  return {
    min:Math.max(min,requested.min),
    max:Math.min(max,requested.max),
  };
}
