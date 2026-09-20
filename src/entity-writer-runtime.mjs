import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  SERVING_V1_PRODUCT_REVISION,
  SERVING_V1_PRODUCT_SCHEMA,
} from '../scripts/serving-v1-product-core.mjs';
import { getPhonologyProfile } from '../scripts/phonology-profiles.mjs';
import {
  ENTITY_WRITER_RANKING_POLICY,
  rankAndDiversifyEntityRows,
} from './entity-writer-ranking.mjs';
import {
  ENTITY_EN_PHONETIC_RUNTIME,
  ENTITY_EN_RUNTIME_ANALYZER,
  ENTITY_PHONETIC_RUNTIME,
  ENTITY_RUNTIME_ANALYZER,
  entityRetrievalAnchors,
} from '../scripts/entity-pronunciation-core.mjs';

export const DEFAULT_ENTITY_DB_PATH = resolve('data/local/rhymelab-entities-v1.sqlite');
export const ENTITY_WRITER_RUNTIME_POLICY = 'entity-writer-channel-v1';

const RHYME_TYPES = new Set([
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
  'assonance',
  'consonance',
]);
const PRIMARY_TYPES = new Set([
  'multisyllabic_perfect',
  'perfect',
  'multisyllabic_slant',
  'family',
  'slant',
]);
const RHYME_TIER = new Map([
  ['multisyllabic_perfect', 0],
  ['perfect', 0],
  ['multisyllabic_slant', 1],
  ['family', 2],
  ['slant', 3],
  ['assonance', 4],
  ['consonance', 5],
]);

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function tableExists(db, name) {
  if (!db) return false;
  try {
    return Boolean(
      db.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('table','view') AND name=?").get(name)
      ||db.prepare("SELECT 1 FROM sqlite_temp_schema WHERE type IN ('table','view') AND name=?").get(name)
    );
  } catch {
    return false;
  }
}

function metaValue(db, key) {
  if (!db) return null;
  try {
    return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value ?? null;
  } catch {
    return null;
  }
}

function servingConnectionMode(db){
  try{
    return String(db.prepare('SELECT mode FROM temp.serving_runtime_connection').get()?.mode||'');
  }catch{
    return null;
  }
}

function servingAvailabilitySql(mode,alias='sp'){
  return mode==='core'
    ?`${alias}.canonical_available=1`
    :`(${alias}.canonical_available=1 OR ${alias}.generated_available=1)`;
}

const servingCapabilityCache=new WeakMap();

function relationRows(score) {
  return ['assonance', 'consonance'].flatMap((type) => {
    const relation = score?.relations?.[type];
    return relation?.matched ? [{
      type,
      strength: relation.strength,
      score: Number(relation.score || 0),
      components: relation.components || null,
    }] : [];
  });
}

function scoreTypes(score) {
  const types = [];
  if (PRIMARY_TYPES.has(score?.type)) types.push(score.type);
  for (const relation of relationRows(score)) {
    if (!types.includes(relation.type)) types.push(relation.type);
  }
  return types;
}

function rhymeTier(score) {
  const types = scoreTypes(score);
  return types.length
    ? Math.min(...types.map((type) => RHYME_TIER.get(type) ?? 99))
    : 99;
}

function normalizeCategory(value) {
  const category = String(value || 'all').trim();
  return category || 'all';
}

function categoryRowsByEntity(db, entityIds, chunkSize = 400) {
  const ids = [...new Set((entityIds || []).map(Number).filter(Number.isFinite))];
  const rowsByEntity = new Map(ids.map((id) => [id, []]));
  let queryCount = 0;

  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => '?').join(',');
    const categoryTable=metaValue(db,'schema')==='rhymelab-serving-v1'
      ?'runtime_entity_category'
      :'entity_category';
    const rows = db.prepare(`
      SELECT entity_id,category,category_score,category_rank,category_percentile,
        category_tier,retained_by_category
      FROM ${categoryTable}
      WHERE entity_id IN (${placeholders})
      ORDER BY entity_id,retained_by_category DESC,category_percentile DESC,category
    `).all(...chunk);
    queryCount += 1;
    for (const row of rows) {
      const entityId = Number(row.entity_id);
      if (!rowsByEntity.has(entityId)) rowsByEntity.set(entityId, []);
      rowsByEntity.get(entityId).push({
        category: row.category,
        score: Number(row.category_score || 0),
        rank: Number(row.category_rank || 0),
        percentile: Number(row.category_percentile || 0),
        tier: row.category_tier,
        retained: Boolean(row.retained_by_category),
      });
    }
  }

  return { rowsByEntity, queryCount };
}

function runtimeLanguageState(db,tablesReady,language){
  const code=language==='en'?'en':'de';
  const expectedRuntime=code==='en'?ENTITY_EN_PHONETIC_RUNTIME:ENTITY_PHONETIC_RUNTIME;
  const expectedAnalyzer=code==='en'?ENTITY_EN_RUNTIME_ANALYZER:ENTITY_RUNTIME_ANALYZER;
  const servingProduct=
    metaValue(db,'schema')==='rhymelab-serving-v1'
    &&metaValue(db,'runtime_status')==='complete'
    &&metaValue(db,'product_adapter_schema')===SERVING_V1_PRODUCT_SCHEMA
    &&metaValue(db,'product_adapter_status')==='complete'
    &&metaValue(db,'product_adapter_revision')===SERVING_V1_PRODUCT_REVISION;
  if(servingProduct){
    const mode=servingConnectionMode(db)||'all';
    const availability=servingAvailabilitySql(mode,'sp');
    let availableRow=null;
    try{
      availableRow=db.prepare(`
        SELECT 1 AS available
        FROM runtime_entity_pronunciation ep
        JOIN runtime_entity_name n USING(name_id)
        JOIN pronunciation sp ON sp.pronunciation_id=ep.serving_pronunciation_id
        WHERE n.language=? AND ${availability}
        LIMIT 1
      `).get(code);
    }catch{}
    const available=Boolean(tablesReady&&availableRow?.available);
    return {
      available,
      reason:!tablesReady
        ?'entity_runtime_tables_missing'
        :available?null:`entity_${code}_pronunciations_unavailable`,
      runtime:expectedRuntime,
      analyzer:expectedAnalyzer,
      pronunciations:available?1:0,
      locale:code==='en'?'en-US':'de-DE',
      servingV1:true,
      servingMode:mode,
    };
  }
  const runtime=metaValue(db,code==='en'?'entity_phonetic_runtime_en':'entity_phonetic_runtime');
  const analyzer=metaValue(db,code==='en'?'entity_phonetic_analyzer_en':'entity_phonetic_analyzer');
  const pronunciations=Number(
    metaValue(db,code==='en'?'entity_phonetic_analyses_en':'entity_phonetic_analyses')||0
  );
  const active=tablesReady&&runtime===expectedRuntime&&analyzer===expectedAnalyzer;
  return {
    available:Boolean(active&&pronunciations>0),
    reason:!tablesReady
      ?'entity_runtime_tables_missing'
      :runtime!==expectedRuntime
        ?`entity_${code}_phonetic_runtime_not_materialized`
        :analyzer!==expectedAnalyzer
          ?`entity_${code}_phonetic_analyzer_mismatch`
          :pronunciations>0
            ?null
            :`entity_${code}_pronunciations_unavailable`,
    runtime,
    analyzer,
    pronunciations:active?pronunciations:0,
    locale:code==='en'?'en-US':'de-DE',
  };
}

export function openEntityWriterDb(dbPath = DEFAULT_ENTITY_DB_PATH) {
  const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON;');
    const schema = metaValue(db, 'schema');
    if (schema !== 'rhymelab-entity-catalog-v1') {
      throw new Error(`Unexpected entity database schema: ${schema || 'missing'}`);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function entityWriterCapabilities(db) {
  if(db&&metaValue(db,'schema')==='rhymelab-serving-v1'){
    const cached=servingCapabilityCache.get(db);
    if(cached)return cached;
  }
  if (!db) {
    const unavailable={
      available:false,
      reason:'entity_database_unavailable',
      runtime:null,
      analyzer:null,
      pronunciations:0,
      locale:null,
    };
    return {
      ...unavailable,
      categories:[],
      languages:{de:{...unavailable,locale:'de-DE'},en:{...unavailable,locale:'en-US'}},
    };
  }

  const tablesReady = [
    'entity',
    'entity_category',
    'entity_name',
    'entity_pronunciation',
    'entity_phonetic_analysis',
    'entity_rhyme_anchor',
  ].every((name) => tableExists(db, name));
  const de=runtimeLanguageState(db,tablesReady,'de');
  const en=runtimeLanguageState(db,tablesReady,'en');
  const categories = tableExists(db, 'entity_category')
    ? db.prepare('SELECT DISTINCT category FROM entity_category ORDER BY category')
        .all().map((row) => row.category)
    : [];

  const result={
    // Backward-compatible top-level DE state.
    available:de.available,
    reason:de.reason,
    runtime:de.runtime,
    analyzer:de.analyzer,
    pronunciations:de.pronunciations,
    categories,
    languages:{de,en},
    multilingualAvailable:Boolean(de.available||en.available),
  };
  if(metaValue(db,'schema')==='rhymelab-serving-v1'){
    servingCapabilityCache.set(db,result);
  }
  return result;
}

function parseJsonArray(value){
  try{
    const parsed=JSON.parse(value||'[]');
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
}

function storedEntityAnalysis(row,language){
  const syllables=parseJsonArray(row.analysis_syllables_json);
  const phonemes=parseJsonArray(row.analysis_phonemes_json);
  if(!syllables.length)return null;
  const primary=Math.max(
    1,
    Math.min(
      syllables.length,
      Number(row.analysis_primary_stress||1)||1,
    ),
  );
  const vowelSequence=String(row.analysis_vowel_sequence||'');
  const consonantSequence=String(row.analysis_consonant_sequence||'');
  const final=syllables.at(-1)||{onset:[],nucleus:null,coda:[]};
  return {
    profile:language==='en'?'en-pron-v1-candidate':undefined,
    notation:'ipa',
    locale:row.locale||null,
    source:row.source_kind||null,
    rawPronunciation:row.ipa||null,
    ipa:row.ipa||null,
    canonicalPhonemes:phonemes.join(' '),
    phonemes,
    syllables,
    syllableCount:Number(row.analysis_syllable_count||syllables.length),
    stressPattern:String(row.analysis_stress_pattern||''),
    primaryStressSyllable:primary,
    rhymeStartSyllable:primary,
    stressedSyllableCount:Math.max(1,syllables.length-primary+1),
    stressedTail:String(row.analysis_rhyme_tail||''),
    exactTailKey:String(row.analysis_rhyme_signature||''),
    multisyllableKey:syllables.length-primary+1>=2
      ?String(row.analysis_rhyme_signature||'')
      :null,
    vowelSequence,
    vowelKey:vowelSequence.replaceAll(' ','-'),
    consonantSequence,
    onsetSequence:syllables.slice(primary-1)
      .flatMap((syllable,index)=>index===0?[]:(syllable.onset||[]))
      .join(' '),
    codaKey:(final.coda||[]).join(' '),
    onsetKey:(final.onset||[]).join(' '),
  };
}

function analyzeEntityQuery(query,language,profile){
  if(language==='en'){
    const pronunciation=(query?.pronunciations||[]).find((row)=>row.preferred)
      ||query?.pronunciations?.[0]
      ||null;
    if(pronunciation?.raw&&pronunciation?.notation&&profile.analyzePronunciation){
      return profile.analyzePronunciation(pronunciation.raw,{
        notation:pronunciation.notation,
        locale:'en-US',
        source:pronunciation.source||'english_writer_query',
      });
    }
  }
  const ipa=query?.preferredIpa||query?.ipa||'';
  if(!ipa) return null;
  const targetIpa=language==='en'&&query?.language!=='en'
    ?String(ipa).replaceAll('̯','')
    :ipa;
  return profile.analyzeIpa(targetIpa);
}

export function searchEntityRhymes(db, query, options = {}) {
  const profileStages=options.profileStages===true;
  const stages={};
  const counters={};
  const timed=(name,work)=>{
    if(!profileStages)return work();
    const started=performance.now();
    try{return work();}
    finally{stages[name]=Number((performance.now()-started).toFixed(3));}
  };

  const language=String(options.language||'de').trim().toLocaleLowerCase('en-US');
  if(!['de','en'].includes(language)){
    return {
      available:false,
      reason:'entity_language_profile_unavailable',
      policy:ENTITY_WRITER_RUNTIME_POLICY,
      results:[],
    };
  }

  const capabilities=timed(
    'capability_ms',
    ()=>entityWriterCapabilities(db),
  );
  const languageCapability=capabilities.languages?.[language];
  if(!languageCapability?.available){
    return {
      available:false,
      reason:languageCapability?.reason||capabilities.reason,
      policy:ENTITY_WRITER_RUNTIME_POLICY,
      results:[],
    };
  }

  const profile=getPhonologyProfile(language);
  let queryAnalysis;
  timed('query_analysis_ms',()=>{
    try {
      queryAnalysis=analyzeEntityQuery(query,language,profile);
    } catch {
      queryAnalysis=null;
    }
  });
  if(!queryAnalysis){
    return {
      available:true,
      reason:'query_pronunciation_unresolved',
      policy:ENTITY_WRITER_RUNTIME_POLICY,
      results:[],
    };
  }

  const category=normalizeCategory(options.category);
  const requestedType=RHYME_TYPES.has(String(options.type||''))
    ?String(options.type)
    :'all';
  const limit=clampInteger(options.limit,100,1,250);
  const perChannelLimit=clampInteger(options.poolLimit,192,16,512);
  const generatedOnly=options.generatedOnly===true;
  const queryNormalized=profile.normalizeSurface(query?.surface||query?.word||'');
  const anchors=entityRetrievalAnchors(queryAnalysis,language);
  const byPronunciation=new Map();

  const servingV1=languageCapability.servingV1===true;
  const servingMode=languageCapability.servingMode||servingConnectionMode(db)||'all';
  const servingAvailability=servingAvailabilitySql(servingMode,'sp');
  const servingGenerated=generatedOnly
    ?' AND sp.canonical_available=0 AND sp.generated_available=1'
    :'';
  const servingRankAvailability=servingMode==='core'
    ?'ra.canonical_available=1'
    :'(ra.canonical_available=1 OR ra.generated_available=1)';
  const servingRankGenerated=generatedOnly
    ?' AND ra.canonical_available=0 AND ra.generated_available=1'
    :'';
  const legacyLookup=servingV1?null:db.prepare(`
    SELECT
      a.channel,a.anchor_key,
      p.pronunciation_id,p.name_id,p.ipa,p.locale,p.pronunciation_role,
      p.source_kind,p.source_record,p.generated,p.model_id,p.confidence,p.review_state,
      n.entity_id,n.surface,n.normalized,n.language,n.name_kind,n.preferred AS name_preferred,
      e.qid,e.primary_category,e.popularity_score,e.popularity_percentile,e.popularity_tier
    FROM entity_rhyme_anchor a
    JOIN entity_pronunciation p USING(pronunciation_id)
    JOIN entity_name n USING(name_id)
    JOIN entity e USING(entity_id)
    WHERE a.analyzer_id=?
      AND a.channel=?
      AND a.anchor_key=?
      AND p.locale=?
      AND n.language=?
      AND p.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
      AND (?=0 OR p.source_kind='espeak_ng_generated_secondary')
      AND (?='all' OR EXISTS(
        SELECT 1 FROM entity_category ec
        WHERE ec.entity_id=e.entity_id AND ec.category=?
      ))
    ORDER BY e.popularity_score DESC,n.preferred DESC,e.qid,n.name_id,p.pronunciation_id
    LIMIT ?
  `);
  const servingLookupFast=servingV1?db.prepare(`
    WITH picked AS (
      SELECT
        ra.analyzer_id,ra.channel,ra.anchor_key,ra.product_pronunciation_id
      FROM runtime_entity_anchor_ranked ra
      WHERE ra.analyzer_id=?
        AND ra.channel=?
        AND ra.anchor_key=?
        AND ra.locale=?
        AND ra.language=?
        AND ${servingRankAvailability}
        ${servingRankGenerated}
      ORDER BY
        ra.popularity_score DESC,ra.name_preferred DESC,ra.qid,ra.name_id,ra.product_pronunciation_id
      LIMIT ?
    )
    SELECT
      picked.channel,picked.anchor_key,
      ep.product_pronunciation_id AS pronunciation_id,
      ep.name_id,ep.ipa,ep.locale,ep.pronunciation_role,
      ep.source_kind,ep.source_record,ep.generated,ep.model_id,ep.confidence,ep.review_state,
      n.entity_id,n.surface,n.normalized,n.language,n.name_kind,n.preferred AS name_preferred,
      e.qid,e.primary_category,e.popularity_score,e.popularity_percentile,e.popularity_tier,
      ea.phonemes_json AS analysis_phonemes_json,
      ea.syllables_json AS analysis_syllables_json,
      ea.syllable_count AS analysis_syllable_count,
      ea.primary_stress AS analysis_primary_stress,
      ea.stress_pattern AS analysis_stress_pattern,
      ea.vowel_sequence AS analysis_vowel_sequence,
      ea.consonant_sequence AS analysis_consonant_sequence,
      ea.rhyme_tail AS analysis_rhyme_tail,
      ea.rhyme_signature AS analysis_rhyme_signature
    FROM picked
    JOIN runtime_entity_pronunciation ep USING(product_pronunciation_id)
    JOIN runtime_entity_analysis ea USING(product_pronunciation_id)
    JOIN runtime_entity_name n USING(name_id)
    JOIN runtime_entity_identity e USING(entity_id)
    ORDER BY e.popularity_score DESC,n.preferred DESC,e.qid,n.name_id,ep.product_pronunciation_id
  `):null;
  const servingLookup=servingV1?db.prepare(`
    SELECT
      a.channel,a.anchor_key,
      ep.product_pronunciation_id AS pronunciation_id,
      ep.name_id,ep.ipa,ep.locale,ep.pronunciation_role,
      ep.source_kind,ep.source_record,ep.generated,ep.model_id,ep.confidence,ep.review_state,
      n.entity_id,n.surface,n.normalized,n.language,n.name_kind,n.preferred AS name_preferred,
      e.qid,e.primary_category,e.popularity_score,e.popularity_percentile,e.popularity_tier,
      ea.phonemes_json AS analysis_phonemes_json,
      ea.syllables_json AS analysis_syllables_json,
      ea.syllable_count AS analysis_syllable_count,
      ea.primary_stress AS analysis_primary_stress,
      ea.stress_pattern AS analysis_stress_pattern,
      ea.vowel_sequence AS analysis_vowel_sequence,
      ea.consonant_sequence AS analysis_consonant_sequence,
      ea.rhyme_tail AS analysis_rhyme_tail,
      ea.rhyme_signature AS analysis_rhyme_signature
    FROM runtime_entity_anchor_occurrence a
    JOIN runtime_entity_pronunciation ep
      ON ep.product_pronunciation_id=a.product_pronunciation_id
    JOIN runtime_entity_analysis ea USING(product_pronunciation_id)
    JOIN pronunciation sp ON sp.pronunciation_id=ep.serving_pronunciation_id
    JOIN runtime_entity_name n USING(name_id)
    JOIN runtime_entity_identity e USING(entity_id)
    WHERE a.analyzer_id=?
      AND a.channel=?
      AND a.anchor_key=?
      AND ep.locale=?
      AND n.language=?
      AND ep.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
      AND ${servingAvailability}
      ${servingGenerated}
      AND (?='all' OR EXISTS(
        SELECT 1 FROM runtime_entity_category ec
        WHERE ec.entity_id=e.entity_id AND ec.category=?
      ))
    ORDER BY e.popularity_score DESC,n.preferred DESC,e.qid,n.name_id,ep.product_pronunciation_id
    LIMIT ?
  `):null;

  let anchorRowsSeen=0;
  timed('anchor_lookup_ms',()=>{
  for(const anchor of anchors){
    let rows;
    if(servingV1&&category==='all'){
      rows=servingLookupFast.all(
        languageCapability.analyzer,
        anchor.channel,
        anchor.key,
        languageCapability.locale,
        language,
        perChannelLimit,
      );
    }else if(servingV1){
      rows=servingLookup.all(
        languageCapability.analyzer,
        anchor.channel,
        anchor.key,
        languageCapability.locale,
        language,
        category,
        category,
        perChannelLimit,
      );
    }else{
      rows=legacyLookup.all(
        languageCapability.analyzer,
        anchor.channel,
        anchor.key,
        languageCapability.locale,
        language,
        generatedOnly?1:0,
        category,
        category,
        perChannelLimit,
      );
    }
    anchorRowsSeen+=rows.length;
    for(const row of rows){
      if(queryNormalized&&profile.normalizeSurface(row.surface)===queryNormalized) continue;
      const current=byPronunciation.get(row.pronunciation_id);
      if(!current){
        byPronunciation.set(row.pronunciation_id,{
          ...row,
          retrievalChannels:[anchor.channel],
        });
      }else if(!current.retrievalChannels.includes(anchor.channel)){
        current.retrievalChannels.push(anchor.channel);
      }
    }
  }
  });
  counters.anchor_count=anchors.length;
  counters.anchor_rows=anchorRowsSeen;
  counters.unique_pronunciations=byPronunciation.size;

  const categoryIndex=timed('category_hydration_ms',()=>categoryRowsByEntity(
    db,
    [...byPronunciation.values()].map((row)=>row.entity_id),
  ));
  const results=[];
  timed('analysis_scoring_and_construction_ms',()=>{
  for(const row of byPronunciation.values()){
    let candidateAnalysis;
    try{
      candidateAnalysis=servingV1
        ?storedEntityAnalysis(row,language)
        :profile.analyzeIpa(row.ipa);
    }catch{
      candidateAnalysis=null;
    }
    if(!candidateAnalysis)continue;
    const score=profile.scoreWriterAnalyses(queryAnalysis,candidateAnalysis);
    const types=scoreTypes(score);
    if(!types.length) continue;
    if(requestedType!=='all'&&!types.includes(requestedType)) continue;
    const relations=relationRows(score);
    const categories=categoryIndex.rowsByEntity.get(Number(row.entity_id))||[];
    const selectedCategory=category==='all'
      ?categories.find((entry)=>entry.category===row.primary_category)||categories[0]||null
      :categories.find((entry)=>entry.category===category)||null;

    results.push({
      resultKind:'entity',
      language,
      resultId:`entity:${language}:${row.qid}:${row.name_id}:${row.pronunciation_id}`,
      word:row.surface,
      surface:row.surface,
      normalized:row.normalized,
      ipa:row.ipa,
      ipaKind:'entity_name_pronunciation',
      locale:row.locale,
      syllableCount:Number(candidateAnalysis.syllableCount||0),
      syllableDistance:Math.abs(
        Number(candidateAnalysis.syllableCount||0)
        -Number(queryAnalysis.syllableCount||0)
      ),
      score:Number(score.overall.toFixed(4)),
      type:score.type,
      primaryType:PRIMARY_TYPES.has(score.type)?score.type:null,
      relationTypes:relations.map((relation)=>relation.type),
      relations,
      rhymeTier:rhymeTier(score),
      components:{
        vowel:Number(score.vowel.toFixed(4)),
        coda:Number(score.coda.toFixed(4)),
        stress:Number(score.stress.toFixed(4)),
        syllable:Number(score.syllable.toFixed(4)),
        onset:Number((score.onset??0).toFixed(4)),
        consonance:Number(score.consonance.toFixed(4)),
      },
      entityQid:row.qid,
      entityId:Number(row.entity_id),
      entityNameId:Number(row.name_id),
      primaryCategory:row.primary_category,
      entityCategories:categories,
      selectedCategory,
      popularityScore:Number(row.popularity_score||0),
      popularityPercentile:Number(row.popularity_percentile||0),
      popularityTier:row.popularity_tier,
      nameKind:row.name_kind,
      namePreferred:Boolean(row.name_preferred),
      pronunciationRole:row.pronunciation_role,
      pronunciationSource:row.source_kind,
      pronunciationSourceRecord:row.source_record,
      pronunciationGenerated:Boolean(row.generated),
      ...(row.generated?{generatedPronunciation:true}:{}),
      pronunciationModelId:row.model_id,
      pronunciationConfidence:row.confidence==null?null:Number(row.confidence),
      pronunciationReviewState:row.review_state,
      retrievalChannels:row.retrievalChannels,
      writerAnchor:score.anchor||null,
      writerAnchorCandidates:score.anchorCandidates||[],
    });
  }
  });
  counters.scored_candidates=results.length;

  const ranked=timed(
    'ranking_diversity_ms',
    ()=>rankAndDiversifyEntityRows(results,{limit}),
  );

  return {
    available:true,
    reason:null,
    policy:ENTITY_WRITER_RUNTIME_POLICY,
    rankingPolicy:ENTITY_WRITER_RANKING_POLICY,
    runtime:languageCapability.runtime,
    analyzer:languageCapability.analyzer,
    language,
    locale:languageCapability.locale,
    category,
    retrievalAnchors:anchors,
    candidateCount:byPronunciation.size,
    scoredCandidateCount:results.length,
    rankingDiagnostics:{
      categoryBatchQueries:categoryIndex.queryCount,
      phoneticBandWidth:ranked.phoneticBandWidth,
      surfaceCap:ranked.surfaceCap,
      suppressedCount:ranked.suppressedCount,
      suppressionReasonCounts:ranked.suppressionReasonCounts,
      guardViolations:ranked.guardViolations,
    },
    ...(profileStages?{performanceProfile:{stages_ms:stages,counters}}:{}),
    results:ranked.results,
  };
}
