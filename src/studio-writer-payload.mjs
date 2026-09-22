const RESULT_FIELDS=Object.freeze([
  'resultKind','language','resultId','phraseId','windowId',
  'word','surface','normalized','ipa','locale',
  'syllableCount','syllableDistance',
  'score','type','primaryType','relationTypes','relations','components',
  'usageRank','usageCount','usageSourceCount',
  'generatedPronunciation',
  'pronunciationSource','pronunciationSourceRecord','pronunciationProvenance',
  'lexiconLayer','partOfSpeech','lemma','lexicalTags',
  'historical','historicalState','modernEligible',
  'phraseTypes','crossedWordBoundaries','retrievalChannels',
  'primaryStressSyllable','stressPattern',
  'primaryCategory','selectedCategory','entityCategories','entityQid',
  'popularityPercentile','popularityTier',
  'channelRank','writerRank',
]);

const QUERY_FIELDS=Object.freeze([
  'kind','language','surface','normalized','preferredIpa','ipa',
  'syllableCount','primaryStressSyllable','stressPattern',
  'generatedPronunciation','resolvable','pronunciationProvenance',
]);

function copyDefined(source,fields){
  const out={};
  for(const key of fields){
    if(source?.[key]!==undefined)out[key]=source[key];
  }
  return out;
}

function compactRelations(value){
  if(!Array.isArray(value))return value;
  return value.map((row)=>({
    type:row?.type||null,
    strength:row?.strength||null,
    score:Number(row?.score||0),
  }));
}

export function compactStudioWriterResult(row){
  const result=copyDefined(row,RESULT_FIELDS);
  if(Array.isArray(result.relations))result.relations=compactRelations(result.relations);
  return result;
}

export function compactStudioWriterQuery(row){
  if(!row)return row??null;
  return copyDefined(row,QUERY_FIELDS);
}

export function compactStudioWriterPayload(result){
  const queries=result?.queries&&typeof result.queries==='object'
    ?Object.fromEntries(
      Object.entries(result.queries).map(([language,row])=>[
        language,
        compactStudioWriterQuery(row),
      ]),
    )
    :result?.queries??null;

  return {
    schema:result?.schema||null,
    policy:result?.policy||null,
    status:result?.status||null,
    input:result?.input||'',
    languageBasis:result?.languageBasis||null,
    resultLanguageBasis:result?.resultLanguageBasis||null,
    scope:result?.scope||null,
    generatedOnly:result?.generatedOnly===true,
    capabilities:result?.capabilities||null,
    requestedLanguages:result?.requestedLanguages||[],
    resultLanguages:result?.resultLanguages||[],
    activeLanguages:result?.activeLanguages||[],
    activeResultLanguages:result?.activeResultLanguages||[],
    unavailableLanguages:result?.unavailableLanguages||[],
    unavailableResultLanguages:result?.unavailableResultLanguages||[],
    resolvedLanguages:result?.resolvedLanguages||[],
    warnings:Array.isArray(result?.warnings)?result.warnings:[],
    query:compactStudioWriterQuery(result?.query),
    queries,
    counts:result?.counts||null,
    performanceProfile:result?.performanceProfile||null,
    results:(result?.results||[]).map(compactStudioWriterResult),
  };
}

export function studioWriterPayloadStats(payload){
  const rows=Array.isArray(payload?.results)?payload.results:[];
  const kinds={word:0,phrase:0,entity:0,other:0};
  const languages={de:0,en:0,other:0};
  for(const row of rows){
    const kind=String(row?.resultKind||'other');
    if(Object.hasOwn(kinds,kind))kinds[kind]++;
    else kinds.other++;
    const language=String(row?.language||'other').toLowerCase();
    if(Object.hasOwn(languages,language))languages[language]++;
    else languages.other++;
  }
  return {total:rows.length,kinds,languages};
}
