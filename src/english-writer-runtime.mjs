import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scoreEnglishRhymeAnalyses } from '../scripts/english-rhyme-features.mjs';
import {
  DEFAULT_ENGLISH_RUNTIME_CHANNEL_LIMIT,
  ENGLISH_RUNTIME_RETRIEVAL_POLICY,
  analyzeStoredEnglishRuntimePronunciation,
  prepareEnglishRuntimeStatements,
  resolveEnglishRuntimeQuery,
  retrieveEnglishRuntimeCandidates,
  retrieveEnglishRuntimeCandidatesFromAnalysis,
} from '../scripts/en-writer-runtime-core.mjs';
import { analyzeEnglishIpa } from '../scripts/english-phonology.mjs';
import { analyzeGermanIpa } from '../scripts/german-ipa.mjs';
import {
  eligibleGermanRhymeAnchorPositions,
  germanAnalysisAtRhymeAnchor,
} from '../scripts/german-rhyme-anchors.mjs';
import { SERVING_V1_PRODUCT_SCHEMA } from '../scripts/serving-v1-product-core.mjs';
import {
  ENGLISH_QUALITY_CANDIDATES,
  ENGLISH_WRITER_RANKING_V2_POLICY,
  diversifyRanked,
  qualityEvidence,
  rankQualityRows,
  relationTier,
} from '../scripts/en-writer-ranking-v2-core.mjs';

export const DEFAULT_ENGLISH_WRITER_DB_PATH=resolve('data/local/rhymelab-en-v1.sqlite');
export const DEFAULT_ENGLISH_PRODUCT_MARKER_PATH=resolve('data/local/en-product-enabled-v1.json');

export const ACCEPTED_ENGLISH_DB_SCHEMA='rhymelab-en-writer-db-v1-candidate';
export const ACCEPTED_ENGLISH_DB_FINGERPRINT='beca46fccb27eed4349c988b726928a464c216b9e59f2640e4925effdc9e6e37';
export const ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT='b921d5350cb14badd9ddf2a65f989ee6eb2c3f03add434e592c674d759c595a9';
export const ACCEPTED_ENGLISH_RUNTIME_FINGERPRINT='dc4de5383325ee3b0d03ca6d77b8282bb0986e19c8e12567c2022a8aa3f29fcf';

export const ENGLISH_WRITER_PRODUCT_RUNTIME='en-writer-product-v1-candidate';
export const ENGLISH_WRITER_PRODUCT_POLICY='en-writer-guarded-quality-diversity-v1-candidate';
export const ENGLISH_WRITER_QUALITY_ID='guarded_commonness_06';
export const ENGLISH_WRITER_DIVERSITY_WEIGHT=0.08;
export const ENGLISH_PRODUCT_RETRIEVAL_PROFILE='en-product-retrieval-reservoir-v1';
export const ENGLISH_PRODUCT_CHANNEL_LIMITS=Object.freeze({
  exact:1536,
  multi:1536,
  vowel:128,
  family_coda:128,
  coda:128,
});
export const ENGLISH_PRODUCT_MAX_CANDIDATES=3072;
export const ENGLISH_PRODUCT_MARKER_SCHEMA='rhymelab-en-product-enabled-v1';

const PRIMARY_TYPES=new Set([
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
]);
const SOUND_TYPES=new Set(['assonance','consonance']);
const RHYME_TYPES=[
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
  'assonance',
  'consonance',
];
const QUALITY_CONFIG=ENGLISH_QUALITY_CANDIDATES.find((row)=>row.id===ENGLISH_WRITER_QUALITY_ID);
if(!QUALITY_CONFIG) throw new Error(`Missing accepted English Quality config: ${ENGLISH_WRITER_QUALITY_ID}`);

function metaValue(db,key){
  try{return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;}
  catch{return null;}
}

function parseJsonArray(value){
  try{
    const parsed=JSON.parse(value||'[]');
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
}

function clampInteger(value,fallback,minimum,maximum){
  const parsed=Number.parseInt(String(value??''),10);
  if(!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum,Math.min(maximum,parsed));
}

function markerFailure(reason,marker=null){
  return {accepted:false,reason,marker};
}

export function readEnglishProductAcceptanceMarker(
  markerPath=DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
){
  const path=resolve(markerPath);
  if(!existsSync(path)) return markerFailure('english_product_acceptance_marker_missing');
  let marker;
  try{marker=JSON.parse(readFileSync(path,'utf8'));}
  catch{return markerFailure('english_product_acceptance_marker_invalid_json');}

  const checks=[
    ['schema',ENGLISH_PRODUCT_MARKER_SCHEMA],
    ['status','accepted'],
    ['database_schema',ACCEPTED_ENGLISH_DB_SCHEMA],
    ['db_semantic_fingerprint',ACCEPTED_ENGLISH_DB_FINGERPRINT],
    ['source_publish_fingerprint',ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT],
    ['runtime_diagnostic_fingerprint',ACCEPTED_ENGLISH_RUNTIME_FINGERPRINT],
    ['ranking_evidence_policy',ENGLISH_WRITER_RANKING_V2_POLICY],
    ['product_runtime',ENGLISH_WRITER_PRODUCT_RUNTIME],
    ['product_policy',ENGLISH_WRITER_PRODUCT_POLICY],
    ['product_retrieval_profile',ENGLISH_PRODUCT_RETRIEVAL_PROFILE],
    ['quality_candidate',ENGLISH_WRITER_QUALITY_ID],
  ];
  for(const [key,expected] of checks){
    if(marker?.[key]!==expected){
      return markerFailure(`english_product_acceptance_marker_${key}_mismatch`,marker);
    }
  }
  if(Number(marker?.diversity_weight)!==ENGLISH_WRITER_DIVERSITY_WEIGHT){
    return markerFailure('english_product_acceptance_marker_diversity_weight_mismatch',marker);
  }
  if(!/^[a-f0-9]{64}$/u.test(String(marker?.acceptance_report_fingerprint||''))){
    return markerFailure('english_product_acceptance_marker_report_fingerprint_invalid',marker);
  }
  return {accepted:true,reason:null,marker,path};
}

export function englishWriterDatabaseState(db){
  if(!db){
    return {
      available:false,
      reason:'english_database_unavailable',
      schema:null,
      semanticFingerprint:null,
      publishFingerprint:null,
    };
  }
  const schema=metaValue(db,'schema');
  const servingProduct=
    schema==='rhymelab-serving-v1'
    &&metaValue(db,'runtime_status')==='complete'
    &&metaValue(db,'product_adapter_schema')===SERVING_V1_PRODUCT_SCHEMA
    &&metaValue(db,'product_adapter_status')==='complete';
  if(servingProduct){
    return {
      available:true,
      reason:null,
      schema,
      semanticFingerprint:metaValue(db,'product_adapter_semantic_fingerprint'),
      publishFingerprint:ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
      language:'en',
      defaultLocale:'en-US',
      retrievalPolicy:'serving-v1-unified-runtime-keys',
      servingV1:true,
    };
  }
  const semanticFingerprint=metaValue(db,'semantic_fingerprint');
  const publishFingerprint=metaValue(db,'publish_fingerprint');
  const language=metaValue(db,'language');
  const defaultLocale=metaValue(db,'default_locale');
  const valid=
    schema===ACCEPTED_ENGLISH_DB_SCHEMA
    &&semanticFingerprint===ACCEPTED_ENGLISH_DB_FINGERPRINT
    &&publishFingerprint===ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT
    &&language==='en'
    &&defaultLocale==='en-US';
  return {
    available:valid,
    reason:valid?null:
      schema!==ACCEPTED_ENGLISH_DB_SCHEMA?'english_database_schema_mismatch':
      semanticFingerprint!==ACCEPTED_ENGLISH_DB_FINGERPRINT?'english_database_fingerprint_mismatch':
      publishFingerprint!==ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT?'english_publish_fingerprint_mismatch':
      language!=='en'?'english_database_language_mismatch':
      'english_database_default_locale_mismatch',
    schema,
    semanticFingerprint,
    publishFingerprint,
    language,
    defaultLocale,
    retrievalPolicy:metaValue(db,'retrieval_policy'),
  };
}

export function openEnglishWriterDb(
  dbPath=DEFAULT_ENGLISH_WRITER_DB_PATH,
  {
    requireProductAcceptance=true,
    markerPath=DEFAULT_ENGLISH_PRODUCT_MARKER_PATH,
  }={},
){
  if(requireProductAcceptance){
    const marker=readEnglishProductAcceptanceMarker(markerPath);
    if(!marker.accepted) throw new Error(marker.reason);
  }
  const db=new DatabaseSync(resolve(dbPath),{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    const state=englishWriterDatabaseState(db);
    if(!state.available) throw new Error(state.reason);
    return db;
  }catch(error){
    db.close();
    throw error;
  }
}

export function englishWriterCapabilities(db){
  const state=englishWriterDatabaseState(db);
  return {
    ...state,
    wordWriter:state.available,
    phraseMosaic:false,
    entityRhymes:false,
    productRuntime:state.available?ENGLISH_WRITER_PRODUCT_RUNTIME:null,
    productPolicy:state.available?ENGLISH_WRITER_PRODUCT_POLICY:null,
    qualityCandidate:state.available?ENGLISH_WRITER_QUALITY_ID:null,
    diversityWeight:state.available?ENGLISH_WRITER_DIVERSITY_WEIGHT:null,
    runtimeRetrievalPolicy:state.available?ENGLISH_RUNTIME_RETRIEVAL_POLICY:null,
  };
}

function pronunciationLocale(row){
  if(row.locale_us) return 'en-US';
  if(row.locale_gb) return 'en-GB';
  return null;
}

function detailFromPronunciations(surface,pronunciations){
  if(!pronunciations.length) return null;
  const first=pronunciations[0];
  const lemmas=parseJsonArray(first.lemmas);
  const poses=parseJsonArray(first.poses);
  const lexicalTags=parseJsonArray(first.lexical_tags);
  const firstTags=parseJsonArray(first.tags);
  const generatedPronunciation=
    firstTags.includes('generated')
    ||String(first.source||'').includes('generated_secondary');
  return {
    kind:'word',
    language:'en',
    surface:first.surface||String(surface||''),
    normalized:first.normalized,
    usageRank:first.wordfreq_rank??null,
    usageScore:first.wordfreq_zipf??null,
    usageCount:null,
    usageSourceCount:null,
    lemma:lemmas[0]??null,
    lemmas,
    partOfSpeech:poses[0]??null,
    partsOfSpeech:poses,
    lexiconLayer:'english_source_backed',
    entityKind:null,
    historical:false,
    lexicalTags,
    syllableCount:Number(first.syllable_count||0),
    stress:first.stress||null,
    primaryStressSyllable:Number(first.primary_stress||0)||null,
    preferredIpa:first.phonemes||'',
    pronunciationProvenance:generatedPronunciation
      ?'generated_optin_overlay'
      :'source_backed_en_us_default_profile',
    ...(generatedPronunciation?{generatedPronunciation:true}:{}),
    pronunciations:pronunciations.map((row,index)=>({
      ipa:row.phonemes||'',
      raw:row.raw,
      notation:row.notation,
      preferred:index===0,
      defaultEligible:Boolean(row.default_profile_eligible),
      preferenceRank:index+1,
      evidenceCount:Number(row.evidence_count||0),
      source:row.source,
      sourceTags:parseJsonArray(row.tags),
      sourceRawTags:parseJsonArray(row.tags),
      flags:[],
      locale:pronunciationLocale(row),
      dialect:null,
      register:null,
      syllableCount:Number(row.syllable_count||0),
      stress:row.stress||null,
      primaryStressSyllable:Number(row.primary_stress||0)||null,
      rhymeTail:row.rhyme_tail||null,
      finalTail:row.final_tail||null,
      vowelSequence:row.vowel_key||null,
      consonantSequence:row.coda_key||null,
      rhymeSyllables:Number(row.rhyme_syllables||0),
    })),
  };
}

export function getEnglishWord(db,surface,{statements=null}={}){
  const resolved=resolveEnglishRuntimeQuery(db,surface,{statements});
  return resolved.status==='ok'
    ?detailFromPronunciations(surface,resolved.pronunciations)
    :null;
}

function relationRows(score){
  return ['assonance','consonance'].flatMap((type)=>{
    const relation=score?.relations?.[type];
    return relation?.matched?[{
      type,
      strength:relation.strength,
      score:Number(relation.score||0),
      components:relation.components||null,
    }]:[];
  });
}

function resultTypes(score){
  const types=[];
  if(PRIMARY_TYPES.has(score?.type)) types.push(score.type);
  for(const type of score?.relationTypes||[]){
    if(SOUND_TYPES.has(type)&&!types.includes(type)) types.push(type);
  }
  return types;
}

function matchesRequestedType(row,type){
  if(type==='all') return true;
  return resultTypes(row.score).includes(type);
}

function betterScoredCandidate(next,current){
  if(!current) return true;
  if(next.tier!==current.tier) return next.tier<current.tier;
  if(Number(next.score.overall)!==Number(current.score.overall)){
    return Number(next.score.overall)>Number(current.score.overall);
  }
  const nextKnown=next.wordfreq_rank!==null&&next.wordfreq_rank!==undefined;
  const currentKnown=current.wordfreq_rank!==null&&current.wordfreq_rank!==undefined;
  if(nextKnown!==currentKnown) return nextKnown;
  if(nextKnown&&Number(next.wordfreq_rank)!==Number(current.wordfreq_rank)){
    return Number(next.wordfreq_rank)<Number(current.wordfreq_rank);
  }
  return Number(next.source_order_id??next.pronunciation_id)
    <Number(current.source_order_id??current.pronunciation_id);
}

function productResult(row,queryDetail,index){
  const score=row.score;
  const relations=relationRows(score);
  const lemmas=parseJsonArray(row.lemmas);
  const poses=parseJsonArray(row.poses);
  const lexicalTags=parseJsonArray(row.lexical_tags);
  const pronunciationTags=parseJsonArray(row.tags);
  const generatedPronunciation=
    pronunciationTags.includes('generated')
    ||String(row.source||'').includes('generated_secondary');
  return {
    resultKind:'word',
    language:'en',
    resultId:`en:${row.normalized}`,
    channelRank:index+1,
    writerRank:index+1,
    word:row.surface,
    surface:row.surface,
    normalized:row.normalized,
    ipa:row.phonemes||'',
    pronunciationPreferred:true,
    pronunciationRank:1,
    pronunciationSource:row.source,
    ...(generatedPronunciation?{
      pronunciationTags,
      generatedPronunciation:true,
    }:{}),
    pronunciationNotation:row.notation,
    locale:pronunciationLocale(row),
    dialect:null,
    register:null,
    usageRank:row.wordfreq_rank??null,
    usageScore:row.wordfreq_zipf??null,
    usageCount:null,
    usageSourceCount:null,
    lexiconLayer:'english_source_backed',
    entityKind:null,
    historical:false,
    lexicalTags,
    lemma:lemmas[0]??null,
    lemmas,
    partOfSpeech:poses[0]??null,
    partsOfSpeech:poses,
    syllableCount:Number(row.syllable_count||0),
    syllableDistance:Math.abs(
      Number(row.syllable_count||0)-Number(queryDetail?.syllableCount||0)
    ),
    rhymeTier:Number(row.tier??99),
    score:Number(Number(score.overall||0).toFixed(4)),
    type:score.type,
    primaryType:PRIMARY_TYPES.has(score.type)?score.type:null,
    relationTypes:relations.map((relation)=>relation.type),
    relations,
    components:{
      vowel:Number(Number(score.vowel||0).toFixed(4)),
      coda:Number(Number(score.coda||0).toFixed(4)),
      stress:Number(Number(score.stress||0).toFixed(4)),
      syllable:Number(Number(score.syllable||0).toFixed(4)),
      onset:Number(Number(score.onset||0).toFixed(4)),
      consonance:Number(Number(score.consonance||0).toFixed(4)),
    },
    retrievalChannels:row.channels||[],
    queryPronunciationIds:row.query_pronunciation_ids||[],
    qualityBand:row.quality_band,
    qualityBandAnchor:row.quality_band_anchor,
    writerUtility:Number(row.evidence?.utility||0),
    writerCommonness:Number(row.evidence?.commonness||0),
    writerUsageKnown:Boolean(row.evidence?.usage_known),
    writerMaxRedundancy:Number(row.max_redundancy||0),
    writerDiversifiedScore:Number(row.diversified_score||0),
  };
}

function groupsFor(results){
  const groups=Object.fromEntries(RHYME_TYPES.map((type)=>[type,[]]));
  for(const result of results){
    const types=[];
    if(result.primaryType) types.push(result.primaryType);
    for(const type of result.relationTypes||[]) if(!types.includes(type)) types.push(type);
    for(const type of types) if(groups[type]) groups[type].push(result);
  }
  return groups;
}

export function searchEnglishWriter(db,surface,options={}){
  const limit=clampInteger(options.limit,250,1,250);
  const requestedType=RHYME_TYPES.includes(String(options.type||''))
    ?String(options.type)
    :'all';
  const statements=options.statements||prepareEnglishRuntimeStatements(db,{generatedOnly:options.generatedOnly===true});
  const retrieval=retrieveEnglishRuntimeCandidates(db,surface,{
    statements,
    channelLimit:DEFAULT_ENGLISH_RUNTIME_CHANNEL_LIMIT,
    channelLimits:ENGLISH_PRODUCT_CHANNEL_LIMITS,
    maxCandidates:ENGLISH_PRODUCT_MAX_CANDIDATES,
  });
  if(retrieval.status!=='ok') return null;

  const query=detailFromPronunciations(surface,retrieval.pronunciations);
  const analysisCache=new Map();
  const analysisFor=(row)=>{
    if(!analysisCache.has(row.pronunciation_id)){
      analysisCache.set(row.pronunciation_id,analyzeStoredEnglishRuntimePronunciation(row));
    }
    return analysisCache.get(row.pronunciation_id);
  };

  const byNormalized=new Map();
  for(const candidate of retrieval.candidates){
    let best=null;
    for(const queryPronunciation of retrieval.pronunciations){
      const score=scoreEnglishRhymeAnalyses(
        analysisFor(queryPronunciation),
        analysisFor(candidate),
      );
      const tier=relationTier(score);
      if(tier>=99) continue;
      const scored={...candidate,score,tier};
      if(betterScoredCandidate(scored,best)) best=scored;
    }
    if(!best||!matchesRequestedType(best,requestedType)) continue;
    const current=byNormalized.get(best.normalized);
    if(betterScoredCandidate(best,current)) byNormalized.set(best.normalized,best);
  }

  const withEvidence=[...byNormalized.values()].map((row)=>({
    ...row,
    evidence:qualityEvidence(row,retrieval.normalized,QUALITY_CONFIG),
  }));
  const qualityRanked=rankQualityRows(withEvidence,QUALITY_CONFIG);
  const diversified=diversifyRanked(qualityRanked,{
    weight:ENGLISH_WRITER_DIVERSITY_WEIGHT,
    limit:Math.min(limit,qualityRanked.length),
  });
  const results=diversified.slice(0,limit)
    .map((row,index)=>productResult(row,query,index));

  return {
    schema:'rhymelab-en-writer-product-v1',
    language:'en',
    status:'ok',
    query,
    requestedType,
    rankingPolicy:ENGLISH_WRITER_PRODUCT_POLICY,
    rankingEvidencePolicy:ENGLISH_WRITER_RANKING_V2_POLICY,
    qualityCandidate:ENGLISH_WRITER_QUALITY_ID,
    diversityWeight:ENGLISH_WRITER_DIVERSITY_WEIGHT,
    writerRuntime:{
      id:ENGLISH_WRITER_PRODUCT_RUNTIME,
      databaseSchema:ACCEPTED_ENGLISH_DB_SCHEMA,
      databaseFingerprint:ACCEPTED_ENGLISH_DB_FINGERPRINT,
      publishFingerprint:ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
      retrievalPolicy:ENGLISH_RUNTIME_RETRIEVAL_POLICY,
      defaultProfile:'en-US',
    },
    writerRetrieval:{
      policy:retrieval.policy,
      profile:ENGLISH_PRODUCT_RETRIEVAL_PROFILE,
      channelLimit:retrieval.channel_limit,
      channelLimits:retrieval.channel_limits,
      maxCandidates:retrieval.max_candidates,
      channelCounts:retrieval.channel_counts,
      queryPronunciations:retrieval.pronunciations.length,
      pronunciationCandidates:retrieval.candidates.length,
      normalizedCandidates:byNormalized.size,
    },
    selection:{
      mode:'english_writer_ranked',
      limit,
      returned:results.length,
    },
    results,
    groups:groupsFor(results),
  };
}

function normalizeExternalEnglishIpa(value){
  return String(value??'')
    .normalize('NFC')
    .replaceAll('̯','')
    .trim();
}

const GERMAN_TO_ENGLISH_RHYME_TOKEN=new Map([
  ['R','ɹ'],
  ['R=','ɚ'],
  ['ɔʏ','ɔɪ'],
  ['iː','i'],
  ['uː','u'],
  ['ɑː','ɑ'],
  ['aː','ɑ'],
  ['ɔː','ɔ'],
  ['ɛː','ɛ'],
  ['eː','eɪ'],
  ['oː','oʊ'],
  ['y','i'],
  ['yː','i'],
  ['ʏ','ɪ'],
  ['ø','eɪ'],
  ['øː','eɪ'],
  ['œ','ɛ'],
  ['ts','ts'],
  ['pf','pf'],
]);

function germanRhymeTokenForEnglish(token){
  return GERMAN_TO_ENGLISH_RHYME_TOKEN.get(String(token||''))
    ||String(token||'');
}

function germanAnchorTailAsEnglishIpa(analysis,anchorPosition){
  const anchored=germanAnalysisAtRhymeAnchor(analysis,anchorPosition);
  const start=Math.max(0,Number(anchorPosition||1)-1);
  const syllables=(anchored?.syllables||[]).slice(start);
  if(!syllables.length)return null;
  return syllables.map((syllable,index)=>{
    const tokens=[
      ...(index===0?[]:(syllable?.onset||[])),
      syllable?.nucleus,
      ...(syllable?.coda||[]),
    ].filter(Boolean).map(germanRhymeTokenForEnglish);
    if(!tokens.length)return '';
    return (index===0?'ˈ':'')+tokens.join('');
  }).filter(Boolean).join('.');
}

export function adaptExternalQueryToEnglishAnalysis(queryDetail){
  const sourceIpa=normalizeExternalEnglishIpa(
    queryDetail?.preferredIpa||queryDetail?.ipa||''
  );
  if(!sourceIpa)return null;

  const sourceLanguage=String(queryDetail?.language||'')
    .trim()
    .toLocaleLowerCase('en-US');

  if(sourceLanguage==='de'){
    try{
      const german=analyzeGermanIpa(sourceIpa);
      const positions=eligibleGermanRhymeAnchorPositions(german)
        .slice()
        .sort((a,b)=>b-a);
      for(const position of positions){
        const adaptedIpa=germanAnchorTailAsEnglishIpa(german,position);
        if(!adaptedIpa)continue;
        try{
          const analysis=analyzeEnglishIpa(adaptedIpa,{
            locale:'en-US',
            source:'cross_language_right_edge_bridge',
          });
          return {
            analysis,
            sourceIpa,
            adaptedIpa,
            sourceLanguage:'de',
            sourceAnchorPosition:position,
            policy:'source-right-edge-rhyme-tail-to-target-phonology-v2',
          };
        }catch{}
      }
    }catch{}
  }

  try{
    return {
      analysis:analyzeEnglishIpa(sourceIpa,{
        locale:'en-US',
        source:'cross_language_query_bridge',
      }),
      sourceIpa,
      adaptedIpa:sourceIpa,
      sourceLanguage:sourceLanguage||null,
      sourceAnchorPosition:null,
      policy:'source-pronunciation-to-target-phonology-v1',
    };
  }catch{
    return null;
  }
}

export function searchEnglishWriterFromExternalQuery(db,queryDetail,options={}){
  const bridge=adaptExternalQueryToEnglishAnalysis(queryDetail);
  if(!bridge)return null;
  const {
    analysis:queryAnalysis,
    sourceIpa,
    adaptedIpa,
    sourceAnchorPosition,
    policy,
  }=bridge;

  const limit=clampInteger(options.limit,250,1,250);
  const requestedType=RHYME_TYPES.includes(String(options.type||''))
    ?String(options.type)
    :'all';
  const statements=options.statements||prepareEnglishRuntimeStatements(db,{generatedOnly:options.generatedOnly===true});
  const retrieval=retrieveEnglishRuntimeCandidatesFromAnalysis(db,queryAnalysis,{
    statements,
    channelLimit:DEFAULT_ENGLISH_RUNTIME_CHANNEL_LIMIT,
    channelLimits:ENGLISH_PRODUCT_CHANNEL_LIMITS,
    maxCandidates:ENGLISH_PRODUCT_MAX_CANDIDATES,
  });
  if(retrieval.status!=='ok') return null;

  const analysisCache=new Map();
  const analysisFor=(row)=>{
    if(!analysisCache.has(row.pronunciation_id)){
      analysisCache.set(row.pronunciation_id,analyzeStoredEnglishRuntimePronunciation(row));
    }
    return analysisCache.get(row.pronunciation_id);
  };

  const byNormalized=new Map();
  for(const candidate of retrieval.candidates){
    const score=scoreEnglishRhymeAnalyses(queryAnalysis,analysisFor(candidate));
    const tier=relationTier(score);
    if(tier>=99) continue;
    const scored={...candidate,score,tier};
    if(!matchesRequestedType(scored,requestedType)) continue;
    const current=byNormalized.get(scored.normalized);
    if(betterScoredCandidate(scored,current)) byNormalized.set(scored.normalized,scored);
  }

  const queryNormalized=String(queryDetail?.normalized||queryDetail?.surface||'')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US');
  const withEvidence=[...byNormalized.values()].map((row)=>({
    ...row,
    evidence:qualityEvidence(row,queryNormalized,QUALITY_CONFIG),
  }));
  const qualityRanked=rankQualityRows(withEvidence,QUALITY_CONFIG);
  const diversified=diversifyRanked(qualityRanked,{
    weight:ENGLISH_WRITER_DIVERSITY_WEIGHT,
    limit:Math.min(limit,qualityRanked.length),
  });
  const results=diversified.slice(0,limit)
    .map((row,index)=>productResult(row,queryDetail,index));

  return {
    schema:'rhymelab-en-writer-product-v1',
    language:'en',
    status:'ok',
    query:queryDetail,
    requestedType,
    crossLanguageQuery:{
      sourceLanguage:queryDetail?.language||null,
      targetLanguage:'en',
      sourceIpa,
      adaptedIpa,
      sourceAnchorPosition,
      policy,
    },
    rankingPolicy:ENGLISH_WRITER_PRODUCT_POLICY,
    rankingEvidencePolicy:ENGLISH_WRITER_RANKING_V2_POLICY,
    qualityCandidate:ENGLISH_WRITER_QUALITY_ID,
    diversityWeight:ENGLISH_WRITER_DIVERSITY_WEIGHT,
    writerRuntime:{
      id:ENGLISH_WRITER_PRODUCT_RUNTIME,
      databaseSchema:ACCEPTED_ENGLISH_DB_SCHEMA,
      databaseFingerprint:ACCEPTED_ENGLISH_DB_FINGERPRINT,
      publishFingerprint:ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
      retrievalPolicy:ENGLISH_RUNTIME_RETRIEVAL_POLICY,
      defaultProfile:'en-US',
    },
    writerRetrieval:{
      policy:retrieval.policy,
      profile:ENGLISH_PRODUCT_RETRIEVAL_PROFILE,
      channelLimit:retrieval.channel_limit,
      channelLimits:retrieval.channel_limits,
      maxCandidates:retrieval.max_candidates,
      channelCounts:retrieval.channel_counts,
      queryPronunciations:1,
      pronunciationCandidates:retrieval.candidates.length,
      normalizedCandidates:byNormalized.size,
      crossLanguage:true,
    },
    selection:{
      mode:'english_writer_ranked_cross_language_query',
      limit,
      returned:results.length,
    },
    results,
    groups:groupsFor(results),
  };
}

