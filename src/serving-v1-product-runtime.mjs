import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {
  SERVING_V1_PRODUCT_REVISION,
  SERVING_V1_PRODUCT_SCHEMA,
} from '../scripts/serving-v1-product-core.mjs';
import {
  SERVING_V1_PRONUNCIATION_IDENTITY_REVISION,
} from '../scripts/serving-v1-pronunciation-identity.mjs';

export const DEFAULT_SERVING_V1_PRODUCT_DB_PATH=resolve('data/local/rhymelab-serving-v1.sqlite');
export const SERVING_V1_PRODUCT_RUNTIME='serving-v1-single-db-product-candidate';
export const SERVING_V1_PRODUCT_RUNTIME_POLICY='core-plus-generated-default-optout-candidate-v1';

function metaValue(db,key){
  try{return db.prepare('SELECT value FROM main.meta WHERE key=?').get(key)?.value??null;}
  catch{return null;}
}

export function servingV1ProductRuntimeState(db){
  if(!db)return {available:false,reason:'serving_v1_database_unavailable'};
  const schema=metaValue(db,'schema');
  const runtimeStatus=metaValue(db,'runtime_status');
  const productSchema=metaValue(db,'product_adapter_schema');
  const productStatus=metaValue(db,'product_adapter_status');
  const productRevision=metaValue(db,'product_adapter_revision');
  const identityRevision=metaValue(db,'identity_revision');
  const productIdentityRevision=metaValue(db,'product_adapter_identity_revision');
  const valid=schema==='rhymelab-serving-v1'
    &&runtimeStatus==='complete'
    &&productSchema===SERVING_V1_PRODUCT_SCHEMA
    &&productStatus==='complete'
    &&productRevision===SERVING_V1_PRODUCT_REVISION
    &&identityRevision===SERVING_V1_PRONUNCIATION_IDENTITY_REVISION
    &&productIdentityRevision===SERVING_V1_PRONUNCIATION_IDENTITY_REVISION;
  return {
    available:valid,
    reason:valid?null:
      schema!=='rhymelab-serving-v1'?'serving_v1_schema_mismatch':
      runtimeStatus!=='complete'?'serving_v1_runtime_incomplete':
      productSchema!==SERVING_V1_PRODUCT_SCHEMA?'serving_v1_product_schema_mismatch':
      productStatus!=='complete'?'serving_v1_product_incomplete':
      productRevision!==SERVING_V1_PRODUCT_REVISION?'serving_v1_product_revision_mismatch':
      identityRevision!==SERVING_V1_PRONUNCIATION_IDENTITY_REVISION?'serving_v1_identity_revision_mismatch':
      'serving_v1_product_identity_revision_mismatch',
    schema,
    runtimeStatus,
    productSchema,
    productStatus,
    productRevision,
    identityRevision,
    productIdentityRevision,
    runtimeSemanticFingerprint:metaValue(db,'runtime_semantic_fingerprint'),
    productSemanticFingerprint:metaValue(db,'product_adapter_semantic_fingerprint'),
    runtime:valid?SERVING_V1_PRODUCT_RUNTIME:null,
    policy:valid?SERVING_V1_PRODUCT_RUNTIME_POLICY:null,
  };
}

function availability(mode,alias='p'){
  return mode==='core'
    ?`${alias}.canonical_available=1`
    :`(${alias}.canonical_available=1 OR ${alias}.generated_available=1)`;
}

function preferredExpression(mode,alias='p'){
  return mode==='core'
    ?`${alias}.canonical_preferred`
    :`CASE WHEN ${alias}.canonical_available=1 THEN ${alias}.canonical_preferred ELSE ${alias}.generated_preferred END`;
}

function dropCompatibilityViews(db){
  for(const name of [
    'hot','en_form','en_pronunciation',
    'entity','entity_category','entity_name','entity_pronunciation',
    'entity_phonetic_analysis','entity_rhyme_anchor',
    'phrase','phrase_source','phrase_token','phrase_pronunciation','phrase_pronunciation_token',
    'phrase_mosaic_window','phrase_mosaic_retrieval_anchor','phrase_mosaic_retrieval_v2_anchor',
    'phrase_snapshot','phrase_usage_evidence','phrase_attestation','serving_runtime_connection',
  ]){
    db.exec(`DROP VIEW IF EXISTS temp.${name};`);
  }
}

export function installServingV1CompatibilityViews(db,{mode='all'}={}){
  if(!['core','all'].includes(mode))throw new Error('Serving compatibility mode must be core or all.');
  const state=servingV1ProductRuntimeState(db);
  if(!state.available)throw new Error(state.reason);
  dropCompatibilityViews(db);
  const pronAvailability=availability(mode,'p');
  const phraseAvailability=mode==='core'
    ?'rp.canonical_available=1'
    :'(rp.canonical_available=1 OR rp.generated_available=1)';
  const entityAvailability=availability(mode,'sp');

  db.exec(`
    CREATE TEMP VIEW serving_runtime_connection AS
    SELECT '${mode}' AS mode;

    CREATE TEMP VIEW hot AS
    SELECT
      p.pronunciation_id AS id,
      dp.source_hot_id AS publish_order,
      COALESCE(pp.source_row_id,dp.source_hot_id,p.pronunciation_id) AS source_order_id,
      dp.display_surface AS surface,
      s.normalized,
      dp.usage_rank,
      dp.usage_score,
      dp.usage_count,
      dp.usage_source_count,
      dp.lemma,
      dp.part_of_speech AS pos,
      dp.gender,
      dp.lexicon_layer,
      dp.entity_kind,
      COALESCE(dp.historical,0) AS historical,
      dp.lexical_tags_json AS lexical_tags,
      COALESCE(p.ipa,p.raw) AS ipa,
      p.phonemes,
      p.syllable_count,
      p.stress_pattern AS stress,
      p.primary_stress,
      pp.rhyme_tail,
      pp.final_tail,
      pp.vowels,
      pp.consonants,
      p.exact_key,
      p.multisyllable_key,
      p.vowel_key,
      p.vowel_family,
      p.coda_key,
      pp.coda_class,
      pp.rhyme_syllables,
      COALESCE(pp.pronunciation_rank,1) AS pronunciation_rank,
      ${preferredExpression(mode,'p')} AS pronunciation_preferred,
      p.eligible AS pronunciation_eligible,
      pp.evidence_count AS pronunciation_evidence,
      pp.source_order AS pronunciation_source_order,
      pp.source AS pronunciation_source,
      pp.tags_json AS pronunciation_tags,
      pp.raw_tags_json AS pronunciation_raw_tags,
      pp.flags_json AS pronunciation_flags,
      pp.locale,
      pp.dialect,
      pp.register AS pronunciation_register,
      p.canonical_available,
      p.generated_available,
      da.analysis_json AS serving_analysis_json
    FROM pronunciation p
    JOIN surface s USING(surface_id)
    JOIN runtime_de_surface_profile dp USING(surface_id)
    JOIN runtime_pronunciation_profile pp USING(pronunciation_id)
    JOIN runtime_de_analysis da USING(pronunciation_id)
    WHERE s.language='de'
      AND p.eligible=1
      AND ${pronAvailability}
      AND EXISTS(
        SELECT 1 FROM surface_role sr
        WHERE sr.surface_id=s.surface_id AND sr.role='lexical'
      );

    CREATE TEMP VIEW en_form AS
    SELECT
      s.surface_id AS id,
      s.display_surface AS surface,
      s.normalized,
      lp.en_surface_variants_json AS surface_variants,
      lp.en_poses_json AS poses,
      lp.en_lemmas_json AS lemmas,
      lp.en_relation_kinds_json AS relation_kinds,
      lp.lexical_tags_json AS lexical_tags,
      lp.en_evidence_kinds_json AS evidence_kinds,
      0 AS current_evidence_count,
      0 AS historical_evidence_count,
      0 AS proper_name_evidence_count,
      0 AS common_lexical_evidence_count,
      COALESCE(s.historical,0) AS historical_only,
      0 AS proper_name_only,
      1 AS analyzed_en_us,
      lp.en_default_eligible AS default_eligible,
      '[]' AS exclusion_reasons,
      NULL AS esdb_min_size,
      '[]' AS esdb_regions,
      '[]' AS esdb_pos_classes,
      lp.en_esdb_archaic AS esdb_archaic,
      lp.en_esdb_uncommon AS esdb_uncommon,
      0 AS esdb_invalid,
      s.usage_rank AS wordfreq_rank,
      lp.en_wordfreq_zipf AS wordfreq_zipf
    FROM surface s
    JOIN runtime_lexical_profile lp USING(surface_id)
    WHERE s.language='en'
      AND EXISTS(
        SELECT 1 FROM pronunciation p
        JOIN runtime_pronunciation_profile pp USING(pronunciation_id)
        WHERE p.surface_id=s.surface_id
          AND p.eligible=1
          AND pp.default_profile_eligible=1
          AND ${pronAvailability}
      );

    CREATE TEMP VIEW en_pronunciation AS
    SELECT
      p.pronunciation_id AS id,
      COALESCE(pp.source_row_id,p.pronunciation_id) AS source_order_id,
      s.surface_id AS form_id,
      pp.source,
      p.notation,
      p.raw,
      pp.locales_json AS locales,
      pp.locale_us,
      pp.locale_gb,
      pp.source_attested_unprofiled,
      pp.tags_json AS tags,
      pp.evidence_count,
      'ok' AS analysis_status,
      p.phonemes,
      p.syllable_count,
      p.stress_pattern AS stress,
      p.primary_stress,
      pp.rhyme_tail,
      pp.final_tail,
      p.exact_key,
      p.multisyllable_key,
      p.vowel_key,
      p.vowel_family,
      p.coda_key,
      pp.coda_class,
      pp.rhyme_syllables,
      pp.rhotic,
      pp.default_profile_eligible
    FROM pronunciation p
    JOIN surface s USING(surface_id)
    JOIN runtime_pronunciation_profile pp USING(pronunciation_id)
    WHERE s.language='en' AND p.eligible=1 AND ${pronAvailability};

    CREATE TEMP VIEW entity AS
    SELECT
      entity_id,qid,primary_category,popularity_score,popularity_percentile,popularity_tier
    FROM runtime_entity_identity;

    CREATE TEMP VIEW entity_category AS
    SELECT
      entity_id,category,category_score,category_rank,category_percentile,category_tier,
      retention_percentile_floor,retained_by_category
    FROM runtime_entity_category;

    CREATE TEMP VIEW entity_name AS
    SELECT
      n.name_id,n.entity_id,n.surface,n.normalized,n.language,n.script,n.name_kind,n.preferred,
      n.searchable,n.source_kind,n.source_record
    FROM runtime_entity_name n
    WHERE EXISTS(
      SELECT 1
      FROM runtime_entity_pronunciation ep
      JOIN pronunciation sp ON sp.pronunciation_id=ep.serving_pronunciation_id
      WHERE ep.name_id=n.name_id AND ${entityAvailability}
    );

    CREATE TEMP VIEW entity_pronunciation AS
    SELECT
      ep.product_pronunciation_id AS pronunciation_id,
      ep.name_id,ep.locale,ep.pronunciation_role,ep.ipa,ep.preferred,ep.source_kind,
      ep.source_record,ep.generated,ep.model_id,ep.confidence,ep.review_state
    FROM runtime_entity_pronunciation ep
    JOIN pronunciation sp ON sp.pronunciation_id=ep.serving_pronunciation_id
    WHERE ${entityAvailability};

    CREATE TEMP VIEW entity_phonetic_analysis AS
    SELECT
      ea.product_pronunciation_id AS pronunciation_id,
      ea.analyzer_id,
      ea.phonemes_json AS phonemes,
      ea.syllables_json AS syllables,
      ea.syllable_count,
      ea.primary_stress,
      ea.secondary_stress_json AS secondary_stress,
      ea.stress_pattern,
      ea.vowel_sequence,
      ea.consonant_sequence,
      ea.rhyme_tail,
      ea.rhyme_signature
    FROM runtime_entity_analysis ea
    JOIN runtime_entity_pronunciation ep USING(product_pronunciation_id)
    JOIN pronunciation sp ON sp.pronunciation_id=ep.serving_pronunciation_id
    WHERE ${entityAvailability};

    CREATE TEMP VIEW entity_rhyme_anchor AS
    SELECT
      a.analyzer_id,a.channel,a.anchor_key,a.product_pronunciation_id AS pronunciation_id
    FROM runtime_entity_anchor_occurrence a
    JOIN runtime_entity_pronunciation ep USING(product_pronunciation_id)
    JOIN pronunciation sp ON sp.pronunciation_id=ep.serving_pronunciation_id
    WHERE ${entityAvailability};

    CREATE TEMP VIEW phrase AS
    SELECT
      rp.source_phrase_id AS phrase_id,
      MIN(rp.source_surface) AS canonical,
      MIN(s.normalized) AS normalized,
      '' AS token_key,
      MAX(pf.token_count) AS token_count,
      MIN(rp.phrase_types_json) AS phrase_types_json,
      MIN(rp.historical_state) AS historical_state,
      MAX(rp.modern_eligible) AS modern_eligible,
      '' AS identity_fingerprint
    FROM runtime_phrase rp
    JOIN runtime_phrase_profile pf USING(runtime_phrase_id)
    JOIN surface s USING(surface_id)
    WHERE ${phraseAvailability}
    GROUP BY rp.source_phrase_id;

    CREATE TEMP VIEW phrase_source AS
    SELECT
      'serving-v1' AS source_id,
      'Serving-v1 Product Preview' AS name,
      'runtime compatibility' AS role,
      'mixed-source-provenance' AS license_id;

    CREATE TEMP VIEW phrase_token AS
    SELECT
      CAST(NULL AS TEXT) AS phrase_id,
      CAST(NULL AS INTEGER) AS token_index,
      CAST(NULL AS TEXT) AS surface,
      CAST(NULL AS TEXT) AS normalized,
      CAST(NULL AS TEXT) AS lexical_state,
      CAST(NULL AS INTEGER) AS lexical_form_id
    WHERE 0;

    CREATE TEMP VIEW phrase_pronunciation AS
    SELECT
      rp.source_phrase_pronunciation_id AS phrase_pronunciation_id,
      rp.source_phrase_id AS phrase_id,
      pf.variant_rank,
      'serving_v1' AS variant_type,
      'de-phrase-pronunciation-v1' AS policy,
      'de-ipa-v2' AS analyzer,
      'explicit-word-boundary-v1' AS boundary_policy,
      'attested-or-explicit-rule-only-v1' AS connected_speech_policy,
      COALESCE(p.ipa,p.raw) AS ipa,
      p.phonemes AS canonical_phonemes,
      p.syllable_count,
      p.stress_pattern,
      pf.primary_stress_syllables_json,
      pf.secondary_stress_syllables_json,
      COALESCE(pp.vowels,'') AS vowel_sequence,
      COALESCE(pp.consonants,'') AS consonant_sequence,
      p.exact_key AS exact_tail_key,
      p.multisyllable_key,
      p.vowel_key,
      p.vowel_family AS vowel_family_key,
      p.coda_key,
      '' AS onset_key,
      COALESCE(pp.rhyme_syllables,p.syllable_count) AS stressed_syllable_count,
      '[]' AS word_boundary_phoneme_positions_json,
      '[]' AS word_boundary_syllable_positions_json,
      p.eligible,
      NULL AS ineligible_reason,
      '' AS fingerprint
    FROM runtime_phrase rp
    JOIN runtime_phrase_profile pf USING(runtime_phrase_id)
    JOIN pronunciation p USING(pronunciation_id)
    LEFT JOIN runtime_pronunciation_profile pp USING(pronunciation_id)
    WHERE ${phraseAvailability};

    CREATE TEMP VIEW phrase_pronunciation_token AS
    SELECT
      rp.source_phrase_pronunciation_id AS phrase_pronunciation_id,
      0 AS token_index,
      0 AS writer_form_id,
      0 AS writer_pronunciation_id,
      rp.source_surface AS writer_surface,
      COALESCE(p.ipa,p.raw) AS ipa,
      0 AS phoneme_start,0 AS phoneme_end,0 AS syllable_start,0 AS syllable_end,
      p.stress_pattern,
      CASE
        WHEN rp.canonical_available=0 AND rp.generated_available=1 THEN 'eSpeak-NG Backfill V2'
        ELSE 'Serving-v1 Core'
      END AS pronunciation_source,
      1 AS available_pronunciations
    FROM runtime_phrase rp
    JOIN pronunciation p USING(pronunciation_id)
    WHERE ${phraseAvailability};

    CREATE TEMP VIEW phrase_mosaic_window AS
    SELECT
      w.source_window_id AS window_id,
      rp.source_phrase_pronunciation_id AS phrase_pronunciation_id,
      rp.source_phrase_id AS phrase_id,
      w.syllable_start,w.syllable_end,w.syllable_count,
      w.phoneme_start,w.phoneme_end,w.phoneme_count,
      w.token_start_index,w.token_end_index,w.token_count,w.crossed_word_boundaries,
      w.starts_inside_token,w.ends_inside_token,w.phoneme_key,w.vowel_key,w.stress_pattern,
      w.final_coda_key
    FROM runtime_phrase_window w
    JOIN runtime_phrase rp USING(runtime_phrase_id)
    WHERE ${phraseAvailability};

    CREATE TEMP VIEW phrase_mosaic_retrieval_anchor AS
    SELECT
      w.source_window_id AS window_id,w.exact_tail_key,w.vowel_key,w.final_nucleus,
      w.final_coda_key,w.final_coda_class,w.syllable_count
    FROM runtime_phrase_window w
    JOIN runtime_phrase rp USING(runtime_phrase_id)
    WHERE ${phraseAvailability};

    CREATE TEMP VIEW phrase_mosaic_retrieval_v2_anchor AS
    SELECT
      w.source_window_id AS window_id,
      'de-mosaic-vowel-family-bridge-v1' AS policy,
      w.vowel_family_key,w.final_coda_class,w.syllable_count,'' AS fingerprint
    FROM runtime_phrase_window w
    JOIN runtime_phrase rp USING(runtime_phrase_id)
    WHERE ${phraseAvailability};

    CREATE TEMP VIEW phrase_snapshot AS
    SELECT DISTINCT
      u.snapshot_label AS snapshot_id,
      'serving-v1' AS source_id,
      u.snapshot_label,
      NULL AS artifact_path,NULL AS artifact_sha256,NULL AS upstream_url,
      NULL AS evidence_year,NULL AS genre,NULL AS country,'{}' AS metadata_json
    FROM runtime_phrase_usage u
    JOIN runtime_phrase rp USING(runtime_phrase_id)
    WHERE ${phraseAvailability};

    CREATE TEMP VIEW phrase_usage_evidence AS
    SELECT
      rp.source_phrase_id AS phrase_id,
      u.snapshot_label AS snapshot_id,
      'leipzig-exact-token-sequence-v1' AS policy,
      u.occurrence_count,u.sentence_count,
      0 AS corpus_token_count,0 AS corpus_sentence_count,
      u.per_million_tokens,u.per_million_sentences,'{}' AS evidence_json
    FROM runtime_phrase_usage u
    JOIN runtime_phrase rp USING(runtime_phrase_id)
    WHERE ${phraseAvailability};

    CREATE TEMP VIEW phrase_attestation AS
    SELECT
      'serving:'||a.runtime_phrase_id||':'||a.ordinal AS attestation_id,
      rp.source_phrase_id AS phrase_id,
      '' AS snapshot_id,'' AS source_record_id,NULL AS source_pos,
      rp.phrase_types_json,a.style_tags_json,'[]' AS raw_tags_json,'[]' AS categories_json,
      rp.historical_state,'{}' AS evidence_json
    FROM runtime_phrase_attestation a
    JOIN runtime_phrase rp USING(runtime_phrase_id)
    WHERE ${phraseAvailability};
  `);

  return {
    ...state,
    mode,
    generatedIncluded:mode==='all',
  };
}

export function openServingV1ProductDb(
  dbPath=DEFAULT_SERVING_V1_PRODUCT_DB_PATH,
  {mode='all'}={},
){
  const path=resolve(dbPath);
  if(!existsSync(path))throw new Error('Serving-v1 product DB missing: '+path);
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    installServingV1CompatibilityViews(db,{mode});
    db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-131072; PRAGMA mmap_size=1073741824;');
    return db;
  }catch(error){
    db.close();
    throw error;
  }
}

export function openServingV1ProductRuntime(dbPath=DEFAULT_SERVING_V1_PRODUCT_DB_PATH){
  const coreDb=openServingV1ProductDb(dbPath,{mode:'core'});
  let allDb=null;
  try{
    allDb=openServingV1ProductDb(dbPath,{mode:'all'});
    return {
      schema:'rhymelab-serving-v1-product-runtime-handle-v1',
      path:resolve(dbPath),
      runtime:SERVING_V1_PRODUCT_RUNTIME,
      policy:SERVING_V1_PRODUCT_RUNTIME_POLICY,
      coreDb,
      allDb,
      coreDatabases:{
        writerDb:coreDb,englishDb:coreDb,phraseDb:coreDb,entityDb:coreDb,generatedOverlay:false,
      },
      allDatabases:{
        writerDb:allDb,englishDb:allDb,phraseDb:allDb,entityDb:allDb,generatedOverlay:true,
      },
      close(){
        try{coreDb.close();}catch{}
        try{allDb?.close();}catch{}
      },
    };
  }catch(error){
    try{coreDb.close();}catch{}
    try{allDb?.close();}catch{}
    throw error;
  }
}
