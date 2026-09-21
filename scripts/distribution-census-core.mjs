export const DISTRIBUTION_CENSUS_SCHEMA='rhymelab-distribution-census-v1';
export const DISTRIBUTION_CENSUS_POLICY='master-readonly-dbstat-closure-census-v1';

export const DISTRIBUTION_TIERS=Object.freeze({
  lite:Object.freeze({
    edition:'lite',
    core_word_population:50000,
    generated_word_population:0,
    features:Object.freeze({words_de:true,words_en:true,phrases:false,entities:false,generated:false,markov:false}),
  }),
  standard:Object.freeze({
    edition:'standard',
    core_word_population:250000,
    generated_word_population:0,
    features:Object.freeze({words_de:true,words_en:true,phrases:true,entities:true,generated:false,markov:false}),
  }),
  full:Object.freeze({
    edition:'full',
    core_word_population:400000,
    generated_word_population:200000,
    features:Object.freeze({words_de:true,words_en:true,phrases:true,entities:true,generated:true,markov:true}),
  }),
});

function scalar(db,sql){
  return Number(db.prepare(sql).get()?.c||0);
}

export function classifyDistributionObject(name){
  const value=String(name||'');
  if(value==='surface_entity'||value.startsWith('runtime_entity_')||value.startsWith('idx_runtime_entity_')||value==='idx_entity_qid'){
    return 'entities';
  }
  if(value.startsWith('runtime_phrase')||value.startsWith('idx_runtime_phrase')||value==='idx_runtime_phrase_window_phrase'){
    return 'phrases';
  }
  if(value.startsWith('runtime_de_')||value.startsWith('runtime_en_')
    ||value.startsWith('idx_runtime_de_')||value.startsWith('idx_runtime_en_')
    ||value==='runtime_lexical_profile'||value==='runtime_pronunciation_profile'
    ||value==='idx_runtime_pron_profile_coda'){
    return 'words';
  }
  if(value==='surface'||value==='pronunciation'||value==='surface_role'||value==='pronunciation_origin'
    ||value.startsWith('idx_surface_')||value.startsWith('idx_pron_')||value==='idx_role'){
    return 'shared_identity';
  }
  if(value==='runtime_target'||value==='runtime_key'||value==='runtime_key_member'||value==='runtime_surface_morphology'
    ||value.startsWith('idx_runtime_target_')||value.startsWith('idx_runtime_key_')||value==='idx_runtime_morphology_family'){
    return 'shared_runtime';
  }
  if(value==='meta'||value.endsWith('_build_stage')||value==='build_stage'){
    return 'metadata_build';
  }
  return 'other';
}

export function readDistributionMeta(db){
  const rows=db.prepare('SELECT key,value FROM meta ORDER BY key').all();
  return Object.fromEntries(rows.map((row)=>[String(row.key),String(row.value)]));
}

export function assertDistributionMasterReady(meta){
  const failures=[];
  if(meta.schema!=='rhymelab-serving-v1')failures.push('meta.schema must be rhymelab-serving-v1');
  if(meta.runtime_status!=='complete')failures.push('runtime_status must be complete');
  if(meta.product_adapter_status!=='complete')failures.push('product_adapter_status must be complete');
  if(!meta.product_adapter_schema)failures.push('product_adapter_schema missing');
  if(failures.length){
    const error=new Error('Serving-v1 Master is not distribution-ready: '+failures.join('; '));
    error.failures=failures;
    throw error;
  }
  return true;
}

export function distributionPopulationCensus(db){
  const lexicalRole=`EXISTS(
    SELECT 1 FROM surface_role r
    WHERE r.surface_id=s.surface_id AND r.role='lexical'
  )`;
  const wordOrigin=`EXISTS(
    SELECT 1 FROM pronunciation_origin o
    WHERE o.pronunciation_id=p.pronunciation_id AND o.domain='word'
  )`;

  const languages={};
  for(const language of ['de','en']){
    languages[language]={
      core_lexical_surfaces:scalar(db,`
        SELECT COUNT(*) c FROM surface s
        WHERE s.language='${language}' AND s.canonical_available=1
          AND ${lexicalRole}
          AND EXISTS(
            SELECT 1 FROM pronunciation p
            WHERE p.surface_id=s.surface_id AND p.eligible=1 AND p.canonical_available=1
          )
      `),
      generated_only_lexical_surfaces:scalar(db,`
        SELECT COUNT(*) c FROM surface s
        WHERE s.language='${language}' AND s.generated_available=1
          AND ${lexicalRole}
          AND NOT EXISTS(
            SELECT 1 FROM pronunciation p
            WHERE p.surface_id=s.surface_id AND p.eligible=1 AND p.canonical_available=1
          )
          AND EXISTS(
            SELECT 1 FROM pronunciation p
            WHERE p.surface_id=s.surface_id AND p.eligible=1
              AND p.canonical_available=0 AND p.generated_available=1
          )
      `),
      core_word_pronunciations:scalar(db,`
        SELECT COUNT(*) c
        FROM pronunciation p
        JOIN surface s USING(surface_id)
        WHERE s.language='${language}' AND p.eligible=1 AND p.canonical_available=1
          AND ${wordOrigin}
      `),
      generated_only_word_pronunciations:scalar(db,`
        SELECT COUNT(*) c
        FROM pronunciation p
        JOIN surface s USING(surface_id)
        WHERE s.language='${language}' AND p.eligible=1
          AND p.canonical_available=0 AND p.generated_available=1
          AND ${wordOrigin}
      `),
      ranked_usage_surfaces:scalar(db,`
        SELECT COUNT(*) c
        FROM surface s
        WHERE s.language='${language}' AND s.canonical_available=1
          AND ${lexicalRole}
          AND s.usage_rank IS NOT NULL AND s.usage_rank>0
      `),
    };
  }

  return {
    languages,
    core:{
      lexical_surfaces:languages.de.core_lexical_surfaces+languages.en.core_lexical_surfaces,
      word_pronunciations:languages.de.core_word_pronunciations+languages.en.core_word_pronunciations,
    },
    generated_only:{
      lexical_surfaces:languages.de.generated_only_lexical_surfaces+languages.en.generated_only_lexical_surfaces,
      word_pronunciations:languages.de.generated_only_word_pronunciations+languages.en.generated_only_word_pronunciations,
    },
    phrases:{
      runtime_rows:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase'),
      core_rows:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase WHERE canonical_available=1'),
      generated_only_rows:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase WHERE canonical_available=0 AND generated_available=1'),
      windows:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase_window'),
      usage_rows:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase_usage'),
      attestation_rows:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase_attestation'),
    },
    entities:{
      identities:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_identity'),
      categories:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_category'),
      names:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_name'),
      pronunciations:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_pronunciation'),
      analyses:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_analysis'),
      anchor_occurrences:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_anchor_occurrence'),
      ranked_anchors:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_anchor_ranked'),
      writer_anchors:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_writer_anchor'),
    },
    shared_runtime:{
      targets:scalar(db,'SELECT COUNT(*) c FROM runtime_target'),
      keys:scalar(db,'SELECT COUNT(*) c FROM runtime_key'),
      key_members:scalar(db,'SELECT COUNT(*) c FROM runtime_key_member'),
      morphology_rows:scalar(db,'SELECT COUNT(*) c FROM runtime_surface_morphology'),
    },
  };
}

export function distributionStorageCensus(db){
  let rows;
  try{
    rows=db.prepare(`
      SELECT name,COALESCE(SUM(pgsize),0) bytes,COUNT(*) pages
      FROM dbstat
      GROUP BY name
      ORDER BY bytes DESC,name
    `).all();
  }catch(error){
    return {
      available:false,
      reason:'dbstat_unavailable',
      error:String(error?.message||error),
      objects:[],
      groups:{},
    };
  }

  const objects=rows.map((row)=>({
    name:String(row.name),
    bytes:Number(row.bytes||0),
    pages:Number(row.pages||0),
    group:classifyDistributionObject(row.name),
  }));
  const groups={};
  for(const object of objects){
    const current=groups[object.group]||{bytes:0,pages:0,objects:0};
    current.bytes+=object.bytes;
    current.pages+=object.pages;
    current.objects+=1;
    groups[object.group]=current;
  }
  return {available:true,objects,groups};
}

export function distributionRankReadiness(population){
  const ranked=population.languages.de.ranked_usage_surfaces+population.languages.en.ranked_usage_surfaces;
  return {
    status:'policy_required',
    current_rank_signal:'surface.usage_rank',
    ranked_core_surfaces:ranked,
    total_core_lexical_surfaces:population.core.lexical_surfaces,
    note:'DE and EN usage ranks are source-local signals and must not be silently treated as one cross-language rank. Freeze a versioned distribution rank after reviewing this census.',
  };
}

export function buildDistributionCensusReport(db,{sourcePath=null,sourceSizeBytes=null}={}){
  const meta=readDistributionMeta(db);
  assertDistributionMasterReady(meta);
  const population=distributionPopulationCensus(db);
  const storage=distributionStorageCensus(db);
  return {
    schema:DISTRIBUTION_CENSUS_SCHEMA,
    policy:DISTRIBUTION_CENSUS_POLICY,
    source:{
      path:sourcePath,
      size_bytes:sourceSizeBytes,
      serving_schema:meta.schema,
      runtime_status:meta.runtime_status,
      runtime_revision:meta.runtime_revision||null,
      runtime_semantic_fingerprint:meta.runtime_semantic_fingerprint||null,
      product_adapter_schema:meta.product_adapter_schema,
      product_adapter_status:meta.product_adapter_status,
      product_adapter_revision:meta.product_adapter_revision||null,
      product_adapter_semantic_fingerprint:meta.product_adapter_semantic_fingerprint||null,
    },
    tier_contract:DISTRIBUTION_TIERS,
    population,
    storage,
    ranking:distributionRankReadiness(population),
    projection:{
      status:'blocked_until_rank_policy',
      reason:'Projected closure sizes depend on the canonical cross-language Core/Generated distribution rank and must not be fabricated from raw table ratios.',
    },
    next_gate:{
      action:'review_census_then_freeze_distribution_rank_v1',
      builder_status:'not_implemented',
      master_mutated:false,
    },
  };
}
