import { analyzeEnglishPronunciation } from './english-phonology.mjs';
import { englishCoarseCodaClass } from './en-writer-db-core.mjs';
import { normalizeEnglishSurface } from './en-writer-source-core.mjs';

export const ENGLISH_RUNTIME_RETRIEVAL_POLICY='en-bounded-indexed-runtime-v1-candidate';
export const DEFAULT_ENGLISH_RUNTIME_CHANNEL_LIMIT=128;
export const DEFAULT_ENGLISH_RUNTIME_MAX_CANDIDATES=512;

const CHANNELS=Object.freeze([
  {kind:'exact',key:'exact_key',index:'idx_en_pron_exact'},
  {kind:'multi',key:'multisyllable_key',index:'idx_en_pron_multi'},
  {kind:'vowel',key:'vowel_key',index:'idx_en_pron_vowel'},
  {kind:'family_coda',key:'family_coda',index:'idx_en_pron_family_coda'},
  {kind:'coda',key:'coda_key',index:'idx_en_pron_coda'},
]);

function rowProjection(){
  return `
    SELECT
      f.id AS form_id,
      f.surface,
      f.normalized,
      f.default_eligible AS form_default_eligible,
      f.wordfreq_rank,
      f.wordfreq_zipf,
      f.lemmas,
      f.relation_kinds,
      f.lexical_tags,
      f.esdb_archaic,
      f.esdb_uncommon,
      p.id AS pronunciation_id,
      p.source,
      p.notation,
      p.raw,
      p.locales,
      p.locale_us,
      p.locale_gb,
      p.source_attested_unprofiled,
      p.analysis_status,
      p.phonemes,
      p.syllable_count,
      p.stress,
      p.primary_stress,
      p.rhyme_tail,
      p.final_tail,
      p.exact_key,
      p.multisyllable_key,
      p.vowel_key,
      p.vowel_family,
      p.coda_key,
      p.coda_class,
      p.rhyme_syllables,
      p.rhotic,
      p.default_profile_eligible
    FROM en_pronunciation p
    JOIN en_form f ON f.id=p.form_id
  `;
}

export function prepareEnglishRuntimeStatements(db){
  const base=rowProjection();
  return {
    query:db.prepare(`
      ${base}
      WHERE f.normalized=?
        AND f.default_eligible=1
        AND p.default_profile_eligible=1
      ORDER BY p.id
    `),
    exact:db.prepare(`
      ${base}
      WHERE p.exact_key=?
        AND p.default_profile_eligible=1
        AND f.default_eligible=1
        AND p.form_id<>?
      ORDER BY p.id
      LIMIT ?
    `),
    multi:db.prepare(`
      ${base}
      WHERE p.multisyllable_key=?
        AND p.default_profile_eligible=1
        AND f.default_eligible=1
        AND p.form_id<>?
      ORDER BY p.id
      LIMIT ?
    `),
    vowel:db.prepare(`
      ${base}
      WHERE p.vowel_key=?
        AND p.default_profile_eligible=1
        AND f.default_eligible=1
        AND p.form_id<>?
      ORDER BY p.id
      LIMIT ?
    `),
    family_coda:db.prepare(`
      ${base}
      WHERE p.vowel_family=?
        AND p.coda_class=?
        AND p.default_profile_eligible=1
        AND f.default_eligible=1
        AND p.form_id<>?
      ORDER BY p.id
      LIMIT ?
    `),
    coda:db.prepare(`
      ${base}
      WHERE p.coda_key=?
        AND p.default_profile_eligible=1
        AND f.default_eligible=1
        AND p.form_id<>?
      ORDER BY p.id
      LIMIT ?
    `),
  };
}

export function resolveEnglishRuntimeQuery(db,surface,{statements=null}={}){
  const normalized=normalizeEnglishSurface(surface);
  const stmts=statements||prepareEnglishRuntimeStatements(db);
  const pronunciations=normalized?stmts.query.all(normalized):[];
  return {
    surface:String(surface??''),
    normalized,
    status:pronunciations.length?'ok':'not_found_default_profile',
    pronunciations,
  };
}

function argsForChannel(kind,queryPronunciation,formId,limit){
  if(kind==='exact'){
    return queryPronunciation.exact_key?[queryPronunciation.exact_key,formId,limit]:null;
  }
  if(kind==='multi'){
    return queryPronunciation.multisyllable_key?[queryPronunciation.multisyllable_key,formId,limit]:null;
  }
  if(kind==='vowel'){
    return queryPronunciation.vowel_key?[queryPronunciation.vowel_key,formId,limit]:null;
  }
  if(kind==='family_coda'){
    return queryPronunciation.vowel_family!==null
      &&queryPronunciation.vowel_family!==undefined
      &&queryPronunciation.coda_class!==null
      &&queryPronunciation.coda_class!==undefined
      ?[queryPronunciation.vowel_family,queryPronunciation.coda_class,formId,limit]
      :null;
  }
  if(kind==='coda'){
    return queryPronunciation.coda_key!==null&&queryPronunciation.coda_key!==undefined
      ?[queryPronunciation.coda_key,formId,limit]
      :null;
  }
  return null;
}

export function retrieveEnglishRuntimeCandidates(db,surface,options={}){
  const channelLimit=Math.max(1,Number(options.channelLimit||DEFAULT_ENGLISH_RUNTIME_CHANNEL_LIMIT));
  const maxCandidates=Math.max(1,Number(options.maxCandidates||DEFAULT_ENGLISH_RUNTIME_MAX_CANDIDATES));
  const statements=options.statements||prepareEnglishRuntimeStatements(db);
  const query=resolveEnglishRuntimeQuery(db,surface,{statements});
  if(query.status!=='ok'){
    return {
      policy:ENGLISH_RUNTIME_RETRIEVAL_POLICY,
      ...query,
      channel_limit:channelLimit,
      max_candidates:maxCandidates,
      candidates:[],
      channel_counts:Object.fromEntries(CHANNELS.map(({kind})=>[kind,0])),
    };
  }

  const merged=new Map();
  const channelCounts=Object.fromEntries(CHANNELS.map(({kind})=>[kind,0]));
  for(const queryPronunciation of query.pronunciations){
    for(const {kind} of CHANNELS){
      const args=argsForChannel(kind,queryPronunciation,queryPronunciation.form_id,channelLimit);
      if(!args) continue;
      const rows=statements[kind].all(...args);
      channelCounts[kind]+=rows.length;
      for(const row of rows){
        let item=merged.get(row.pronunciation_id);
        if(!item){
          item={
            ...row,
            channels:[],
            query_pronunciation_ids:[],
          };
          merged.set(row.pronunciation_id,item);
        }
        if(!item.channels.includes(kind)) item.channels.push(kind);
        if(!item.query_pronunciation_ids.includes(queryPronunciation.pronunciation_id)){
          item.query_pronunciation_ids.push(queryPronunciation.pronunciation_id);
        }
      }
    }
  }

  const priority=new Map(CHANNELS.map(({kind},index)=>[kind,index]));
  const candidates=[...merged.values()]
    .sort((a,b)=>{
      const ap=Math.min(...a.channels.map((kind)=>priority.get(kind)??99));
      const bp=Math.min(...b.channels.map((kind)=>priority.get(kind)??99));
      return ap-bp||a.pronunciation_id-b.pronunciation_id;
    })
    .slice(0,maxCandidates);

  return {
    policy:ENGLISH_RUNTIME_RETRIEVAL_POLICY,
    ...query,
    channel_limit:channelLimit,
    max_candidates:maxCandidates,
    candidates,
    channel_counts:channelCounts,
  };
}

export function analyzeStoredEnglishRuntimePronunciation(row){
  const locale=row.locale_us?'en-US':(row.locale_gb?'en-GB':null);
  return analyzeEnglishPronunciation(row.raw,{
    notation:row.notation,
    locale,
    source:row.source,
  });
}

export function compareStoredEnglishAnalysis(row){
  const analysis=analyzeStoredEnglishRuntimePronunciation(row);
  const expected={
    phonemes:row.phonemes,
    syllable_count:Number(row.syllable_count),
    stress:row.stress,
    primary_stress:Number(row.primary_stress),
    rhyme_tail:row.rhyme_tail,
    final_tail:row.final_tail,
    exact_key:row.exact_key,
    multisyllable_key:row.multisyllable_key,
    vowel_key:row.vowel_key,
    vowel_family:row.vowel_family,
    coda_key:row.coda_key,
    coda_class:row.coda_class,
    rhyme_syllables:Number(row.rhyme_syllables),
    rhotic:Number(row.rhotic),
  };
  const actual={
    phonemes:analysis.canonicalPhonemes,
    syllable_count:analysis.syllableCount,
    stress:analysis.stressPattern,
    primary_stress:analysis.primaryStressSyllable,
    rhyme_tail:analysis.stressedTail,
    final_tail:analysis.finalTail,
    exact_key:analysis.exactTailKey,
    multisyllable_key:analysis.multisyllableKey,
    vowel_key:analysis.vowelKey,
    vowel_family:analysis.vowelFamilyKey,
    coda_key:analysis.codaKey,
    coda_class:englishCoarseCodaClass(analysis.codaKey),
    rhyme_syllables:analysis.stressedSyllableCount,
    rhotic:analysis.rhotic?1:0,
  };
  const mismatches=[];
  for(const key of Object.keys(expected)){
    if(expected[key]!==actual[key]) mismatches.push({key,expected:expected[key],actual:actual[key]});
  }
  return {analysis,expected,actual,mismatches};
}

export function englishRuntimeQueryPlans(db){
  const plan=(sql,...args)=>db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map((row)=>String(row.detail||''));
  const samples={
    exact:db.prepare("SELECT exact_key AS a FROM en_pronunciation WHERE default_profile_eligible=1 AND exact_key IS NOT NULL ORDER BY id LIMIT 1").get(),
    multi:db.prepare("SELECT multisyllable_key AS a FROM en_pronunciation WHERE default_profile_eligible=1 AND multisyllable_key IS NOT NULL ORDER BY id LIMIT 1").get(),
    vowel:db.prepare("SELECT vowel_key AS a FROM en_pronunciation WHERE default_profile_eligible=1 AND vowel_key IS NOT NULL ORDER BY id LIMIT 1").get(),
    family_coda:db.prepare("SELECT vowel_family AS a,coda_class AS b FROM en_pronunciation WHERE default_profile_eligible=1 AND vowel_family IS NOT NULL AND coda_class IS NOT NULL ORDER BY id LIMIT 1").get(),
    coda:db.prepare("SELECT coda_key AS a FROM en_pronunciation WHERE default_profile_eligible=1 AND coda_key IS NOT NULL ORDER BY id LIMIT 1").get(),
  };
  const runtimePlan=(where,...args)=>plan(
    `SELECT p.id
     FROM en_pronunciation p
     JOIN en_form f ON f.id=p.form_id
     WHERE ${where}
       AND p.default_profile_eligible=1
       AND f.default_eligible=1
       AND p.form_id<>?
     ORDER BY p.id
     LIMIT 128`,
    ...args,
    -1
  );
  return {
    exact:samples.exact?runtimePlan('p.exact_key=?',samples.exact.a):[],
    multi:samples.multi?runtimePlan('p.multisyllable_key=?',samples.multi.a):[],
    vowel:samples.vowel?runtimePlan('p.vowel_key=?',samples.vowel.a):[],
    family_coda:samples.family_coda?runtimePlan('p.vowel_family=? AND p.coda_class=?',samples.family_coda.a,samples.family_coda.b):[],
    coda:samples.coda?runtimePlan('p.coda_key=?',samples.coda.a):[],
  };
}
