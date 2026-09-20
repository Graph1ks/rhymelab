export const SERVING_V1_PRODUCT_SCHEMA='rhymelab-serving-v1-product-adapter-v1';
export const SERVING_V1_PRODUCT_POLICY='single-db-legacy-semantic-adapter-v1';
export const SERVING_V1_PRODUCT_REVISION='bounded-hotpaths-v3-identity-v3';

export function createServingV1ProductStorage(db){
  db.exec(`
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS product_build_stage(
      stage TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      source_rows INTEGER NOT NULL DEFAULT 0,
      max_source_id INTEGER NOT NULL DEFAULT 0,
      last_source_id INTEGER NOT NULL DEFAULT 0,
      processed_rows INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS runtime_lexical_profile(
      surface_id INTEGER PRIMARY KEY REFERENCES surface(surface_id) ON DELETE CASCADE,
      source_priority INTEGER NOT NULL,
      usage_score REAL,
      usage_source_count INTEGER,
      gender TEXT,
      entity_kind TEXT,
      lexical_tags_json TEXT NOT NULL DEFAULT '[]',
      en_surface_variants_json TEXT NOT NULL DEFAULT '[]',
      en_poses_json TEXT NOT NULL DEFAULT '[]',
      en_lemmas_json TEXT NOT NULL DEFAULT '[]',
      en_relation_kinds_json TEXT NOT NULL DEFAULT '[]',
      en_evidence_kinds_json TEXT NOT NULL DEFAULT '[]',
      en_esdb_archaic INTEGER NOT NULL DEFAULT 0,
      en_esdb_uncommon INTEGER NOT NULL DEFAULT 0,
      en_wordfreq_zipf REAL,
      en_default_eligible INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS runtime_pronunciation_profile(
      pronunciation_id INTEGER PRIMARY KEY REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      source_row_id INTEGER,
      source_priority INTEGER NOT NULL,
      source TEXT NOT NULL,
      source_order INTEGER,
      pronunciation_rank INTEGER,
      evidence_count INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      raw_tags_json TEXT NOT NULL DEFAULT '[]',
      flags_json TEXT NOT NULL DEFAULT '[]',
      locale TEXT,
      dialect TEXT,
      register TEXT,
      locales_json TEXT NOT NULL DEFAULT '[]',
      locale_us INTEGER NOT NULL DEFAULT 0,
      locale_gb INTEGER NOT NULL DEFAULT 0,
      source_attested_unprofiled INTEGER NOT NULL DEFAULT 0,
      rhyme_tail TEXT,
      final_tail TEXT,
      vowels TEXT,
      consonants TEXT,
      coda_class TEXT,
      rhyme_syllables INTEGER,
      rhotic INTEGER,
      default_profile_eligible INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_pron_profile_coda
      ON runtime_pronunciation_profile(coda_class,pronunciation_id);

    -- Product-v3 lookup repair: these two channels were the only DE base lookups
    -- without a leading-key index in the unified Serving pronunciation table.
    CREATE INDEX IF NOT EXISTS idx_pron_multi_lookup
      ON pronunciation(multisyllable_key,eligible,canonical_available,generated_available)
      WHERE multisyllable_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_pron_coda_lookup
      ON pronunciation(coda_key,eligible,canonical_available,generated_available)
      WHERE coda_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS runtime_de_surface_profile(
      surface_id INTEGER PRIMARY KEY REFERENCES surface(surface_id) ON DELETE CASCADE,
      source_hot_id INTEGER NOT NULL,
      display_surface TEXT NOT NULL,
      usage_rank INTEGER,
      usage_score REAL,
      usage_count INTEGER,
      usage_source_count INTEGER,
      lemma TEXT,
      part_of_speech TEXT,
      gender TEXT,
      lexicon_layer TEXT,
      entity_kind TEXT,
      historical INTEGER NOT NULL DEFAULT 0,
      lexical_tags_json TEXT NOT NULL DEFAULT '[]',
      selection_usage_rank_missing INTEGER NOT NULL,
      selection_pronunciation_preferred INTEGER NOT NULL,
      selection_pronunciation_rank INTEGER,
      selection_ipa TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_de_surface_profile_hot
      ON runtime_de_surface_profile(source_hot_id,surface_id);

    CREATE TABLE IF NOT EXISTS runtime_de_candidate(
      pronunciation_id INTEGER PRIMARY KEY REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      normalized TEXT NOT NULL,
      syllable_count INTEGER NOT NULL,
      usage_rank INTEGER,
      historical INTEGER NOT NULL,
      core_preferred INTEGER NOT NULL,
      all_preferred INTEGER NOT NULL,
      canonical_available INTEGER NOT NULL,
      generated_available INTEGER NOT NULL,
      generated_only INTEGER NOT NULL,
      source_order INTEGER NOT NULL,
      exact_key TEXT,
      multisyllable_key TEXT,
      vowel_key TEXT,
      vowel_family TEXT,
      stressed_family TEXT,
      coda_key TEXT,
      coda_class TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_de_candidate_exact
      ON runtime_de_candidate(exact_key,syllable_count,usage_rank,source_order)
      WHERE exact_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_runtime_de_candidate_multi
      ON runtime_de_candidate(multisyllable_key,syllable_count,usage_rank,source_order)
      WHERE multisyllable_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_runtime_de_candidate_vowel
      ON runtime_de_candidate(vowel_key,syllable_count,usage_rank,source_order)
      WHERE vowel_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_runtime_de_candidate_family
      ON runtime_de_candidate(vowel_family,syllable_count,usage_rank,source_order)
      WHERE vowel_family IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_runtime_de_candidate_stressed_family
      ON runtime_de_candidate(stressed_family,syllable_count,usage_rank,source_order)
      WHERE stressed_family IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_runtime_de_candidate_family_coda
      ON runtime_de_candidate(vowel_family,coda_class,syllable_count,usage_rank,source_order)
      WHERE vowel_family IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_runtime_de_candidate_coda
      ON runtime_de_candidate(coda_key,syllable_count,usage_rank,source_order)
      WHERE coda_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS runtime_de_analysis(
      pronunciation_id INTEGER PRIMARY KEY REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      analyzer_id TEXT NOT NULL,
      analysis_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_de_writer_candidate(
      key_value TEXT NOT NULL,
      pronunciation_id INTEGER NOT NULL REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      normalized TEXT NOT NULL,
      syllable_count INTEGER NOT NULL,
      usage_rank INTEGER,
      historical INTEGER NOT NULL,
      core_preferred INTEGER NOT NULL,
      all_preferred INTEGER NOT NULL,
      canonical_available INTEGER NOT NULL,
      generated_available INTEGER NOT NULL,
      generated_only INTEGER NOT NULL,
      source_order INTEGER NOT NULL,
      PRIMARY KEY(key_value,source_order,pronunciation_id)
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_runtime_de_writer_candidate_bucket
      ON runtime_de_writer_candidate(key_value,syllable_count,usage_rank,source_order,pronunciation_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_de_writer_candidate_pron
      ON runtime_de_writer_candidate(pronunciation_id,key_value);

    CREATE TABLE IF NOT EXISTS runtime_phrase_profile(
      runtime_phrase_id INTEGER PRIMARY KEY REFERENCES runtime_phrase(runtime_phrase_id) ON DELETE CASCADE,
      token_count INTEGER NOT NULL,
      variant_rank INTEGER NOT NULL DEFAULT 1,
      primary_stress_syllables_json TEXT NOT NULL DEFAULT '[]',
      secondary_stress_syllables_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS runtime_en_key_candidate(
      channel TEXT NOT NULL,
      key_value TEXT NOT NULL,
      pronunciation_id INTEGER NOT NULL REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      surface_id INTEGER NOT NULL REFERENCES surface(surface_id) ON DELETE CASCADE,
      source_order INTEGER NOT NULL,
      canonical_available INTEGER NOT NULL,
      generated_available INTEGER NOT NULL,
      default_eligible INTEGER NOT NULL,
      PRIMARY KEY(channel,key_value,source_order,pronunciation_id)
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_runtime_en_key_candidate_pron
      ON runtime_en_key_candidate(pronunciation_id,channel,key_value);

    CREATE TABLE IF NOT EXISTS runtime_entity_identity(
      entity_id INTEGER PRIMARY KEY,
      qid TEXT UNIQUE NOT NULL,
      primary_category TEXT,
      popularity_score REAL NOT NULL,
      popularity_percentile REAL NOT NULL,
      popularity_tier TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_entity_category(
      entity_id INTEGER NOT NULL REFERENCES runtime_entity_identity(entity_id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      category_score REAL NOT NULL,
      category_rank INTEGER NOT NULL,
      category_percentile REAL NOT NULL,
      category_tier TEXT NOT NULL,
      retention_percentile_floor REAL NOT NULL,
      retained_by_category INTEGER NOT NULL,
      PRIMARY KEY(entity_id,category)
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_runtime_entity_category_lookup
      ON runtime_entity_category(category,retained_by_category,category_percentile,entity_id);

    CREATE TABLE IF NOT EXISTS runtime_entity_name(
      name_id INTEGER PRIMARY KEY,
      entity_id INTEGER NOT NULL REFERENCES runtime_entity_identity(entity_id) ON DELETE CASCADE,
      surface_id INTEGER NOT NULL REFERENCES surface(surface_id) ON DELETE CASCADE,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      language TEXT NOT NULL,
      script TEXT NOT NULL,
      name_kind TEXT NOT NULL,
      preferred INTEGER NOT NULL,
      searchable INTEGER NOT NULL,
      source_kind TEXT NOT NULL,
      source_record TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_entity_name_surface
      ON runtime_entity_name(language,normalized,name_id);

    CREATE TABLE IF NOT EXISTS runtime_entity_pronunciation(
      product_pronunciation_id INTEGER PRIMARY KEY,
      name_id INTEGER NOT NULL REFERENCES runtime_entity_name(name_id) ON DELETE CASCADE,
      serving_pronunciation_id INTEGER NOT NULL REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      source_priority INTEGER NOT NULL,
      locale TEXT,
      pronunciation_role TEXT NOT NULL,
      ipa TEXT NOT NULL,
      preferred INTEGER NOT NULL,
      source_kind TEXT NOT NULL,
      source_record TEXT,
      generated INTEGER NOT NULL,
      model_id TEXT,
      confidence REAL,
      review_state TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_entity_pron_serving
      ON runtime_entity_pronunciation(serving_pronunciation_id,product_pronunciation_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_entity_pron_name
      ON runtime_entity_pronunciation(name_id,locale,preferred DESC,review_state,product_pronunciation_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_entity_pron_identity_occurrence
      ON runtime_entity_pronunciation(name_id,serving_pronunciation_id,product_pronunciation_id);

    CREATE TABLE IF NOT EXISTS runtime_entity_analysis(
      product_pronunciation_id INTEGER PRIMARY KEY REFERENCES runtime_entity_pronunciation(product_pronunciation_id) ON DELETE CASCADE,
      analyzer_id TEXT NOT NULL,
      phonemes_json TEXT NOT NULL DEFAULT '[]',
      syllables_json TEXT NOT NULL DEFAULT '[]',
      syllable_count INTEGER NOT NULL,
      primary_stress INTEGER,
      secondary_stress_json TEXT NOT NULL DEFAULT '[]',
      stress_pattern TEXT,
      vowel_sequence TEXT,
      consonant_sequence TEXT,
      rhyme_tail TEXT,
      rhyme_signature TEXT
    );

    CREATE TABLE IF NOT EXISTS runtime_entity_anchor_occurrence(
      analyzer_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      anchor_key TEXT NOT NULL,
      product_pronunciation_id INTEGER NOT NULL REFERENCES runtime_entity_pronunciation(product_pronunciation_id) ON DELETE CASCADE,
      PRIMARY KEY(analyzer_id,channel,anchor_key,product_pronunciation_id)
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_runtime_entity_anchor_occurrence_pron
      ON runtime_entity_anchor_occurrence(product_pronunciation_id,analyzer_id,channel);

    CREATE TABLE IF NOT EXISTS runtime_entity_anchor_ranked(
      analyzer_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      anchor_key TEXT NOT NULL,
      product_pronunciation_id INTEGER NOT NULL REFERENCES runtime_entity_pronunciation(product_pronunciation_id) ON DELETE CASCADE,
      language TEXT NOT NULL,
      locale TEXT,
      canonical_available INTEGER NOT NULL,
      generated_available INTEGER NOT NULL,
      popularity_score REAL NOT NULL,
      name_preferred INTEGER NOT NULL,
      qid TEXT NOT NULL,
      name_id INTEGER NOT NULL,
      PRIMARY KEY(analyzer_id,channel,anchor_key,product_pronunciation_id)
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_runtime_entity_anchor_ranked_lookup
      ON runtime_entity_anchor_ranked(
        analyzer_id,channel,anchor_key,language,locale,
        popularity_score DESC,name_preferred DESC,qid,name_id,product_pronunciation_id
      );

    CREATE TABLE IF NOT EXISTS runtime_entity_writer_anchor(
      analyzer_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      anchor_key TEXT NOT NULL,
      serving_pronunciation_id INTEGER NOT NULL REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      PRIMARY KEY(analyzer_id,channel,anchor_key,serving_pronunciation_id)
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_runtime_entity_writer_anchor_pron
      ON runtime_entity_writer_anchor(serving_pronunciation_id,analyzer_id,channel);

    CREATE INDEX IF NOT EXISTS idx_runtime_phrase_window_exact
      ON runtime_phrase_window(exact_tail_key,syllable_count,runtime_window_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_phrase_window_vowel_coda
      ON runtime_phrase_window(vowel_key,final_coda_key,syllable_count,runtime_window_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_phrase_window_vowel
      ON runtime_phrase_window(vowel_key,syllable_count,runtime_window_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_phrase_window_family_coda
      ON runtime_phrase_window(vowel_family_key,final_coda_class,syllable_count,runtime_window_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_phrase_window_final
      ON runtime_phrase_window(final_nucleus,final_coda_class,syllable_count,runtime_window_id);
  `);
}

export function resetServingV1ProductStorage(db){
  db.exec(`
    DROP TABLE IF EXISTS runtime_entity_anchor_ranked;
    DROP TABLE IF EXISTS runtime_en_key_candidate;
    DROP TABLE IF EXISTS runtime_de_writer_candidate;
    DROP TABLE IF EXISTS runtime_de_analysis;
    DROP TABLE IF EXISTS runtime_de_candidate;
    DROP TABLE IF EXISTS runtime_entity_anchor_occurrence;
    DROP TABLE IF EXISTS runtime_entity_analysis;
    DROP TABLE IF EXISTS runtime_entity_writer_anchor;
    DROP TABLE IF EXISTS runtime_entity_pronunciation;
    DROP TABLE IF EXISTS runtime_entity_name;
    DROP TABLE IF EXISTS runtime_entity_category;
    DROP TABLE IF EXISTS runtime_entity_identity;
    DROP TABLE IF EXISTS runtime_phrase_profile;
    DROP TABLE IF EXISTS runtime_de_surface_profile;
    DROP TABLE IF EXISTS runtime_pronunciation_profile;
    DROP TABLE IF EXISTS runtime_lexical_profile;
    DROP TABLE IF EXISTS product_build_stage;
  `);
  createServingV1ProductStorage(db);
}

function scalar(db,sql){
  return Number(db.prepare(sql).get()?.c||0);
}

function integrityCount(db,key){
  let value;
  try{value=db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;}
  catch{return null;}
  if(value==null)return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

export function servingV1ProductSummary(db){
  return {
    lexicalProfiles:scalar(db,'SELECT COUNT(*) c FROM runtime_lexical_profile'),
    pronunciationProfiles:scalar(db,'SELECT COUNT(*) c FROM runtime_pronunciation_profile'),
    deSurfaceProfiles:scalar(db,'SELECT COUNT(*) c FROM runtime_de_surface_profile'),
    phraseProfiles:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase_profile'),
    entityIdentities:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_identity'),
    entityCategories:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_category'),
    entityNames:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_name'),
    entityPronunciations:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_pronunciation'),
    entityWriterAnchors:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_writer_anchor'),
    entityAnalyses:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_analysis'),
    entityOccurrenceAnchors:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_anchor_occurrence'),
    deHotpathCandidates:scalar(db,'SELECT COUNT(*) c FROM runtime_de_candidate'),
    dePrecomputedAnalyses:scalar(db,'SELECT COUNT(*) c FROM runtime_de_analysis'),
    deWriterKeyCandidates:scalar(db,'SELECT COUNT(*) c FROM runtime_de_writer_candidate'),
    enHotpathKeyCandidates:scalar(db,'SELECT COUNT(*) c FROM runtime_en_key_candidate'),
    entityRankedAnchors:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_anchor_ranked'),
    coreEntityPronunciations:scalar(db,`
      SELECT COUNT(*) c
      FROM runtime_entity_pronunciation ep
      JOIN pronunciation p ON p.pronunciation_id=ep.serving_pronunciation_id
      WHERE p.canonical_available=1
    `),
    generatedOnlyEntityPronunciations:scalar(db,`
      SELECT COUNT(*) c
      FROM runtime_entity_pronunciation ep
      JOIN pronunciation p ON p.pronunciation_id=ep.serving_pronunciation_id
      WHERE p.canonical_available=0 AND p.generated_available=1
    `),
  };
}

export function servingV1ProductInvariantReport(db){
  const lexicalMissing=scalar(db,`
    SELECT COUNT(*) c
    FROM surface s
    WHERE EXISTS(
      SELECT 1 FROM surface_role r
      WHERE r.surface_id=s.surface_id AND r.role='lexical'
    )
      AND EXISTS(
        SELECT 1 FROM pronunciation p
        WHERE p.surface_id=s.surface_id AND p.eligible=1
      )
      AND NOT EXISTS(
        SELECT 1 FROM runtime_lexical_profile lp WHERE lp.surface_id=s.surface_id
      )
  `);
  const pronProfileMissing=scalar(db,`
    SELECT COUNT(*) c
    FROM pronunciation p
    JOIN surface s USING(surface_id)
    WHERE p.eligible=1
      AND EXISTS(
        SELECT 1 FROM pronunciation_origin o
        WHERE o.pronunciation_id=p.pronunciation_id AND o.domain='word'
      )
      AND NOT EXISTS(
        SELECT 1 FROM runtime_pronunciation_profile pp
        WHERE pp.pronunciation_id=p.pronunciation_id
      )
  `);
  const phraseProfileMissing=scalar(db,`
    SELECT COUNT(*) c
    FROM runtime_phrase rp
    WHERE NOT EXISTS(
      SELECT 1 FROM runtime_phrase_profile pp
      WHERE pp.runtime_phrase_id=rp.runtime_phrase_id
    )
  `);
  const orphanEntityPronunciation=scalar(db,`
    SELECT COUNT(*) c
    FROM runtime_entity_pronunciation ep
    LEFT JOIN pronunciation p ON p.pronunciation_id=ep.serving_pronunciation_id
    WHERE p.pronunciation_id IS NULL
  `);
  const generatedMarkerOnCoreEntity=scalar(db,`
    SELECT COUNT(*) c
    FROM runtime_entity_pronunciation ep
    JOIN pronunciation p ON p.pronunciation_id=ep.serving_pronunciation_id
    WHERE p.canonical_available=1
      AND (ep.generated=1 OR ep.source_kind='espeak_ng_generated_secondary')
  `);
  const generatedEntityNotMarked=scalar(db,`
    SELECT COUNT(*) c
    FROM runtime_entity_pronunciation ep
    JOIN pronunciation p ON p.pronunciation_id=ep.serving_pronunciation_id
    WHERE p.canonical_available=0 AND p.generated_available=1
      AND (ep.generated<>1 OR ep.source_kind<>'espeak_ng_generated_secondary')
  `);
  const deSurfaceProfileMissing=scalar(db,`
    SELECT COUNT(*) c
    FROM surface s
    WHERE s.language='de'
      AND EXISTS(
        SELECT 1 FROM pronunciation_origin o
        JOIN pronunciation p ON p.pronunciation_id=o.pronunciation_id
        WHERE p.surface_id=s.surface_id AND o.domain='word'
      )
      AND NOT EXISTS(
        SELECT 1 FROM runtime_de_surface_profile dp WHERE dp.surface_id=s.surface_id
      )
  `);
  const entityAnalysisMissing=scalar(db,`
    SELECT COUNT(*) c
    FROM runtime_entity_pronunciation ep
    WHERE NOT EXISTS(
      SELECT 1 FROM runtime_entity_analysis ea
      WHERE ea.product_pronunciation_id=ep.product_pronunciation_id
    )
  `);
  const entityAnchorless=scalar(db,`
    SELECT COUNT(*) c
    FROM runtime_entity_pronunciation ep
    WHERE NOT EXISTS(
      SELECT 1 FROM runtime_entity_anchor_occurrence a
      WHERE a.product_pronunciation_id=ep.product_pronunciation_id
    )
  `);
  const sourceOccurrenceMissing=integrityCount(
    db,'product_adapter_entity_source_occurrences_missing'
  );
  const productOccurrenceExtra=integrityCount(
    db,'product_adapter_entity_product_occurrences_extra'
  );
  const sourceAnchorMissing=integrityCount(
    db,'product_adapter_entity_source_anchors_missing'
  );
  const productAnchorExtra=integrityCount(
    db,'product_adapter_entity_product_anchors_extra'
  );
  const occurrenceIntegrityVerified=[
    sourceOccurrenceMissing,
    productOccurrenceExtra,
    sourceAnchorMissing,
    productAnchorExtra,
  ].every((value)=>value!==null);
  return {
    lexical_surfaces_without_profile:lexicalMissing,
    lexical_pronunciations_without_profile:pronProfileMissing,
    runtime_phrases_without_profile:phraseProfileMissing,
    orphan_entity_pronunciations:orphanEntityPronunciation,
    generated_marker_on_core_entity_pronunciations:generatedMarkerOnCoreEntity,
    generated_only_entity_pronunciations_not_marked:generatedEntityNotMarked,
    de_word_surfaces_without_runtime_profile:deSurfaceProfileMissing,
    entity_pronunciations_without_precomputed_analysis:entityAnalysisMissing,
    entity_pronunciations_without_occurrence_anchor:entityAnchorless,
    eligible_source_entity_occurrences_without_product_mapping:sourceOccurrenceMissing,
    product_entity_occurrences_without_eligible_source_mapping:productOccurrenceExtra,
    eligible_source_entity_anchors_without_exact_product_mapping:sourceAnchorMissing,
    product_entity_anchors_without_eligible_source_mapping:productAnchorExtra,
    entity_source_occurrence_integrity_verified:occurrenceIntegrityVerified,
    core_absorption_preserved:generatedMarkerOnCoreEntity===0,
    ok:lexicalMissing===0
      &&pronProfileMissing===0
      &&phraseProfileMissing===0
      &&orphanEntityPronunciation===0
      &&generatedMarkerOnCoreEntity===0
      &&generatedEntityNotMarked===0
      &&deSurfaceProfileMissing===0
      &&entityAnalysisMissing===0
      &&occurrenceIntegrityVerified
      &&sourceOccurrenceMissing===0
      &&productOccurrenceExtra===0
      &&sourceAnchorMissing===0
      &&productAnchorExtra===0,
  };
}
