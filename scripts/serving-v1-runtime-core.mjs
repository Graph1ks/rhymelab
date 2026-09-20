export const SERVING_V1_RUNTIME_SCHEMA='rhymelab-serving-v1-runtime-v1';
export const SERVING_V1_RUNTIME_POLICY='unified-indexed-serving-runtime-v1';
export const SERVING_V1_RUNTIME_REVISION='retrieval-morphology-phrase-evidence-v2-identity-v3';

export const RUNTIME_CHANNELS=Object.freeze([
  'exact_tail',
  'multisyllable',
  'vowel',
  'vowel_family',
  'coda',
  'family_coda_class',
  'writer_right_edge',
  'entity_exact_tail',
  'entity_vowel_sequence',
  'entity_vowel_family',
  'entity_final_nucleus_coda',
  'entity_final_nucleus',
  'entity_writer_right_edge',
  'phrase_exact_tail',
  'phrase_vowel_coda',
  'phrase_vowel',
  'phrase_vowel_family_coda_class',
  'phrase_final_nucleus_coda_class',
]);

export function createServingV1RuntimeStorage(db){
  db.exec(`
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS runtime_build_stage(
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

    CREATE TABLE IF NOT EXISTS runtime_target(
      target_id INTEGER PRIMARY KEY,
      target_kind TEXT NOT NULL CHECK(target_kind IN ('pronunciation','phrase_window')),
      language TEXT NOT NULL,
      pronunciation_id INTEGER NOT NULL REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      runtime_phrase_id INTEGER,
      runtime_window_id TEXT UNIQUE,
      syllable_count INTEGER,
      canonical_available INTEGER NOT NULL CHECK(canonical_available IN (0,1)),
      generated_available INTEGER NOT NULL CHECK(generated_available IN (0,1)),
      canonical_preferred INTEGER NOT NULL DEFAULT 0 CHECK(canonical_preferred IN (0,1)),
      generated_preferred INTEGER NOT NULL DEFAULT 0 CHECK(generated_preferred IN (0,1))
    );

    CREATE TABLE IF NOT EXISTS runtime_key(
      key_id INTEGER PRIMARY KEY,
      language TEXT NOT NULL,
      channel TEXT NOT NULL,
      key_value TEXT NOT NULL,
      UNIQUE(language,channel,key_value)
    );

    CREATE TABLE IF NOT EXISTS runtime_key_member(
      key_id INTEGER NOT NULL REFERENCES runtime_key(key_id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES runtime_target(target_id) ON DELETE CASCADE,
      PRIMARY KEY(key_id,target_id)
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_runtime_target_pronunciation
      ON runtime_target(pronunciation_id,target_kind,target_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_target_availability
      ON runtime_target(language,target_kind,canonical_available,generated_available,syllable_count,target_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_key_lookup
      ON runtime_key(language,channel,key_value,key_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_key_member_target
      ON runtime_key_member(target_id,key_id);

    CREATE TABLE IF NOT EXISTS runtime_surface_morphology(
      surface_id INTEGER PRIMARY KEY REFERENCES surface(surface_id) ON DELETE CASCADE,
      policy TEXT NOT NULL,
      status TEXT NOT NULL,
      family_key TEXT,
      construction_rule TEXT,
      analysis_count INTEGER NOT NULL DEFAULT 0,
      stored_positive_count INTEGER NOT NULL DEFAULT 0,
      supported_family_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_morphology_family
      ON runtime_surface_morphology(family_key,surface_id)
      WHERE family_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS runtime_phrase(
      runtime_phrase_id INTEGER PRIMARY KEY,
      source_layer TEXT NOT NULL CHECK(source_layer IN ('core','generated')),
      source_phrase_id TEXT NOT NULL,
      source_phrase_pronunciation_id TEXT NOT NULL,
      source_surface TEXT NOT NULL,
      surface_id INTEGER NOT NULL REFERENCES surface(surface_id) ON DELETE CASCADE,
      pronunciation_id INTEGER NOT NULL REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      canonical_available INTEGER NOT NULL CHECK(canonical_available IN (0,1)),
      generated_available INTEGER NOT NULL CHECK(generated_available IN (0,1)),
      phrase_types_json TEXT NOT NULL DEFAULT '[]',
      historical_state TEXT,
      modern_eligible INTEGER NOT NULL DEFAULT 1 CHECK(modern_eligible IN (0,1)),
      commonness_score REAL,
      commonness_corpus_count INTEGER NOT NULL DEFAULT 0,
      commonness_occurrence_sum INTEGER NOT NULL DEFAULT 0,
      commonness_sentence_sum INTEGER NOT NULL DEFAULT 0,
      style_tags_json TEXT NOT NULL DEFAULT '[]',
      surface_safety_class TEXT,
      surface_safety_reasons_json TEXT NOT NULL DEFAULT '[]',
      evidence_ready INTEGER NOT NULL DEFAULT 0 CHECK(evidence_ready IN (0,1)),
      UNIQUE(source_layer,source_phrase_pronunciation_id)
    );

    CREATE TABLE IF NOT EXISTS runtime_phrase_usage(
      runtime_phrase_id INTEGER NOT NULL REFERENCES runtime_phrase(runtime_phrase_id) ON DELETE CASCADE,
      snapshot_label TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      sentence_count INTEGER NOT NULL DEFAULT 0,
      per_million_tokens REAL NOT NULL DEFAULT 0,
      per_million_sentences REAL NOT NULL DEFAULT 0,
      PRIMARY KEY(runtime_phrase_id,snapshot_label)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS runtime_phrase_attestation(
      runtime_phrase_id INTEGER NOT NULL REFERENCES runtime_phrase(runtime_phrase_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      style_tags_json TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY(runtime_phrase_id,ordinal)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS runtime_phrase_window(
      runtime_window_id TEXT PRIMARY KEY,
      runtime_phrase_id INTEGER NOT NULL REFERENCES runtime_phrase(runtime_phrase_id) ON DELETE CASCADE,
      source_window_id TEXT NOT NULL,
      syllable_start INTEGER NOT NULL,
      syllable_end INTEGER NOT NULL,
      syllable_count INTEGER NOT NULL,
      phoneme_start INTEGER NOT NULL,
      phoneme_end INTEGER NOT NULL,
      phoneme_count INTEGER NOT NULL,
      token_start_index INTEGER NOT NULL,
      token_end_index INTEGER NOT NULL,
      token_count INTEGER NOT NULL,
      crossed_word_boundaries INTEGER NOT NULL,
      starts_inside_token INTEGER NOT NULL CHECK(starts_inside_token IN (0,1)),
      ends_inside_token INTEGER NOT NULL CHECK(ends_inside_token IN (0,1)),
      phoneme_key TEXT NOT NULL,
      vowel_key TEXT NOT NULL,
      stress_pattern TEXT NOT NULL,
      final_coda_key TEXT NOT NULL,
      exact_tail_key TEXT NOT NULL,
      final_nucleus TEXT NOT NULL,
      final_coda_class TEXT NOT NULL,
      vowel_family_key TEXT,
      canonical_available INTEGER NOT NULL CHECK(canonical_available IN (0,1)),
      generated_available INTEGER NOT NULL CHECK(generated_available IN (0,1)),
      UNIQUE(runtime_phrase_id,source_window_id)
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_phrase_pronunciation
      ON runtime_phrase(pronunciation_id,runtime_phrase_id);
    CREATE INDEX IF NOT EXISTS idx_runtime_phrase_window_phrase
      ON runtime_phrase_window(runtime_phrase_id,syllable_start,syllable_end);
  `);
}

function scalar(db,sql){
  return Number(db.prepare(sql).get()?.c||0);
}

export function runtimeLookupTargets(db,{
  language='de',
  channel,
  keyValue,
  mode='all',
  targetKind=null,
  querySurfaceId=null,
  querySyllables=null,
  syllableDistance=null,
  limit=800,
}={}){
  const clauses=[
    'k.language=?',
    'k.channel=?',
    'k.key_value=?',
  ];
  const args=[String(language),String(channel),String(keyValue)];
  if(targetKind){
    clauses.push('t.target_kind=?');
    args.push(String(targetKind));
  }
  if(mode==='core'){
    clauses.push('t.canonical_available=1');
  }else if(mode==='generated'){
    clauses.push('t.canonical_available=0 AND t.generated_available=1');
  }else{
    clauses.push('(t.canonical_available=1 OR t.generated_available=1)');
  }
  if(querySurfaceId!=null){
    clauses.push('p.surface_id<>?');
    args.push(Number(querySurfaceId));
  }
  if(querySyllables!=null&&syllableDistance!=null){
    clauses.push('ABS(COALESCE(t.syllable_count,0)-?)<=?');
    args.push(Number(querySyllables),Math.max(0,Number(syllableDistance)));
  }
  args.push(Math.max(1,Math.min(5000,Number(limit)||800)));
  return db.prepare(`
    SELECT
      t.target_id,t.target_kind,t.language,t.pronunciation_id,
      t.runtime_phrase_id,t.runtime_window_id,t.syllable_count,
      t.canonical_available,t.generated_available,
      t.canonical_preferred,t.generated_preferred,
      p.surface_id,s.display_surface,s.normalized,s.usage_rank,s.historical,
      p.ipa,p.raw,p.phonemes,p.stress_pattern,p.authority_kind
    FROM runtime_key k
    JOIN runtime_key_member m USING(key_id)
    JOIN runtime_target t ON t.target_id=m.target_id
    JOIN pronunciation p USING(pronunciation_id)
    JOIN surface s USING(surface_id)
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      ABS(COALESCE(t.syllable_count,0)-COALESCE(?,t.syllable_count)),
      s.usage_rank IS NULL,s.usage_rank,t.target_id
    LIMIT ?
  `).all(...args.slice(0,-1),querySyllables==null?null:Number(querySyllables),args.at(-1));
}

export function servingV1RuntimeSummary(db){
  const channelRows=db.prepare(`
    SELECT channel,COUNT(*) key_rows,COUNT(DISTINCT key_value) distinct_keys
    FROM runtime_key k
    JOIN runtime_key_member m USING(key_id)
    GROUP BY channel
    ORDER BY channel
  `).all().map((row)=>({
    channel:row.channel,
    keyRows:Number(row.key_rows),
    distinctKeys:Number(row.distinct_keys),
  }));
  return {
    pronunciationTargets:scalar(db,"SELECT COUNT(*) c FROM runtime_target WHERE target_kind='pronunciation'"),
    phraseWindowTargets:scalar(db,"SELECT COUNT(*) c FROM runtime_target WHERE target_kind='phrase_window'"),
    retrievalKeyRows:scalar(db,'SELECT COUNT(*) c FROM runtime_key_member'),
    distinctRetrievalKeys:scalar(db,'SELECT COUNT(*) c FROM runtime_key'),
    morphologyRows:scalar(db,'SELECT COUNT(*) c FROM runtime_surface_morphology'),
    resolvedMorphologyRows:scalar(db,"SELECT COUNT(*) c FROM runtime_surface_morphology WHERE status='attested_right_head_candidate'"),
    ambiguousMorphologyRows:scalar(db,"SELECT COUNT(*) c FROM runtime_surface_morphology WHERE status='ambiguous_conflict'"),
    runtimePhrases:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase'),
    phraseWindows:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase_window'),
    phraseEvidenceReady:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase WHERE evidence_ready=1'),
    channels:channelRows,
  };
}

export function servingV1RuntimeInvariantReport(db){
  const missingPronTarget=scalar(db,`
    SELECT COUNT(*) c FROM pronunciation p
    WHERE p.eligible=1
      AND NOT EXISTS(
        SELECT 1 FROM runtime_target t
        WHERE t.target_kind='pronunciation' AND t.pronunciation_id=p.pronunciation_id
      )
  `);
  const canonicalMarkedGenerated=scalar(db,`
    SELECT COUNT(*) c FROM runtime_target
    WHERE canonical_available=1 AND generated_available=1
  `);
  const orphanKey=scalar(db,`
    SELECT COUNT(*) c
    FROM runtime_key_member m
    LEFT JOIN runtime_target t ON t.target_id=m.target_id
    WHERE t.target_id IS NULL
  `);
  const orphanWindow=scalar(db,`
    SELECT COUNT(*) c
    FROM runtime_phrase_window w
    LEFT JOIN runtime_phrase p USING(runtime_phrase_id)
    WHERE p.runtime_phrase_id IS NULL
  `);
  const phraseEvidenceMissing=scalar(db,`
    SELECT COUNT(*) c FROM runtime_phrase WHERE evidence_ready<>1
  `);
  return {
    eligible_pronunciations_without_target:missingPronTarget,
    canonical_targets_marked_generated:canonicalMarkedGenerated,
    orphan_retrieval_keys:orphanKey,
    orphan_phrase_windows:orphanWindow,
    phrase_rows_without_precomputed_evidence:phraseEvidenceMissing,
    ok:missingPronTarget===0
      &&canonicalMarkedGenerated===0
      &&orphanKey===0
      &&orphanWindow===0
      &&phraseEvidenceMissing===0,
  };
}
