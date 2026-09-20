export const SERVING_V1_SCHEMA='rhymelab-serving-v1';
export const SERVING_V1_POLICY='surface-pronunciation-core-authority-v1';
export const SERVING_V1_BUILD_POLICY='resumable-attached-source-batches-v1';

export const SERVING_AUTHORITY=Object.freeze({
  core_word:10,
  core_phrase:20,
  core_entity:30,
  generated_word:110,
  generated_phrase:120,
  generated_entity:130,
});

const acceptedEntityReviewStates="'accepted','reviewed','accepted_source_composition','accepted_source_backed'";

export function createServingV1Storage(db){
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS meta(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS build_stage(
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
    CREATE TABLE IF NOT EXISTS surface(
      surface_id INTEGER PRIMARY KEY,
      language TEXT NOT NULL,
      normalized TEXT NOT NULL,
      display_surface TEXT NOT NULL,
      canonical_available INTEGER NOT NULL DEFAULT 0 CHECK(canonical_available IN (0,1)),
      generated_available INTEGER NOT NULL DEFAULT 0 CHECK(generated_available IN (0,1)),
      authority_rank INTEGER NOT NULL,
      authority_kind TEXT NOT NULL,
      usage_rank INTEGER,
      usage_count INTEGER,
      historical INTEGER,
      lemma TEXT,
      part_of_speech TEXT,
      lexicon_layer TEXT,
      UNIQUE(language,normalized)
    );
    CREATE TABLE IF NOT EXISTS pronunciation(
      pronunciation_id INTEGER PRIMARY KEY,
      surface_id INTEGER NOT NULL REFERENCES surface(surface_id) ON DELETE CASCADE,
      identity_key TEXT NOT NULL,
      notation TEXT NOT NULL,
      raw TEXT NOT NULL,
      ipa TEXT,
      phonemes TEXT,
      syllable_count INTEGER,
      stress_pattern TEXT,
      primary_stress INTEGER,
      exact_key TEXT,
      multisyllable_key TEXT,
      vowel_key TEXT,
      vowel_family TEXT,
      coda_key TEXT,
      eligible INTEGER NOT NULL DEFAULT 1 CHECK(eligible IN (0,1)),
      canonical_available INTEGER NOT NULL DEFAULT 0 CHECK(canonical_available IN (0,1)),
      generated_available INTEGER NOT NULL DEFAULT 0 CHECK(generated_available IN (0,1)),
      canonical_preferred INTEGER NOT NULL DEFAULT 0 CHECK(canonical_preferred IN (0,1)),
      generated_preferred INTEGER NOT NULL DEFAULT 0 CHECK(generated_preferred IN (0,1)),
      authority_rank INTEGER NOT NULL,
      authority_kind TEXT NOT NULL,
      UNIQUE(surface_id,identity_key)
    );
    CREATE TABLE IF NOT EXISTS surface_role(
      surface_id INTEGER NOT NULL REFERENCES surface(surface_id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      canonical_available INTEGER NOT NULL DEFAULT 0 CHECK(canonical_available IN (0,1)),
      generated_available INTEGER NOT NULL DEFAULT 0 CHECK(generated_available IN (0,1)),
      PRIMARY KEY(surface_id,role)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS surface_entity(
      surface_id INTEGER NOT NULL REFERENCES surface(surface_id) ON DELETE CASCADE,
      entity_qid TEXT NOT NULL,
      primary_category TEXT,
      popularity_score REAL,
      canonical_available INTEGER NOT NULL DEFAULT 0 CHECK(canonical_available IN (0,1)),
      generated_available INTEGER NOT NULL DEFAULT 0 CHECK(generated_available IN (0,1)),
      PRIMARY KEY(surface_id,entity_qid)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS pronunciation_origin(
      pronunciation_id INTEGER NOT NULL REFERENCES pronunciation(pronunciation_id) ON DELETE CASCADE,
      layer TEXT NOT NULL CHECK(layer IN ('core','generated')),
      domain TEXT NOT NULL CHECK(domain IN ('word','phrase','entity')),
      source_kind TEXT NOT NULL,
      origin_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(pronunciation_id,layer,domain,source_kind)
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_surface_availability
      ON surface(language,canonical_available,generated_available,normalized);
    CREATE INDEX IF NOT EXISTS idx_surface_authority
      ON surface(language,authority_rank,normalized);
    CREATE INDEX IF NOT EXISTS idx_pron_surface
      ON pronunciation(surface_id,eligible,authority_rank,pronunciation_id);
    CREATE INDEX IF NOT EXISTS idx_pron_exact
      ON pronunciation(exact_key,eligible,canonical_available,generated_available)
      WHERE exact_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_pron_vowel
      ON pronunciation(vowel_key,eligible,canonical_available,generated_available)
      WHERE vowel_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_pron_family
      ON pronunciation(vowel_family,coda_key,eligible,canonical_available,generated_available)
      WHERE vowel_family IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_role
      ON surface_role(role,canonical_available,generated_available,surface_id);
    CREATE INDEX IF NOT EXISTS idx_entity_qid
      ON surface_entity(entity_qid,surface_id);
  `);
}

function availability(layer){
  return layer==='core'
    ?{canonical:1,generated:0}
    :{canonical:0,generated:1};
}

function surfaceUpsert(selectSql){
  return `
    INSERT INTO surface(
      language,normalized,display_surface,canonical_available,generated_available,
      authority_rank,authority_kind,usage_rank,usage_count,historical,lemma,part_of_speech,lexicon_layer
    )
    ${selectSql}
    WHERE 1
    ON CONFLICT(language,normalized) DO UPDATE SET
      canonical_available=MAX(surface.canonical_available,excluded.canonical_available),
      generated_available=MAX(surface.generated_available,excluded.generated_available),
      display_surface=CASE WHEN excluded.authority_rank<surface.authority_rank THEN excluded.display_surface ELSE surface.display_surface END,
      usage_rank=CASE WHEN excluded.authority_rank<surface.authority_rank THEN excluded.usage_rank ELSE surface.usage_rank END,
      usage_count=CASE WHEN excluded.authority_rank<surface.authority_rank THEN excluded.usage_count ELSE surface.usage_count END,
      historical=CASE WHEN excluded.authority_rank<surface.authority_rank THEN excluded.historical ELSE surface.historical END,
      lemma=CASE WHEN excluded.authority_rank<surface.authority_rank THEN excluded.lemma ELSE surface.lemma END,
      part_of_speech=CASE WHEN excluded.authority_rank<surface.authority_rank THEN excluded.part_of_speech ELSE surface.part_of_speech END,
      lexicon_layer=CASE WHEN excluded.authority_rank<surface.authority_rank THEN excluded.lexicon_layer ELSE surface.lexicon_layer END,
      authority_kind=CASE WHEN excluded.authority_rank<surface.authority_rank THEN excluded.authority_kind ELSE surface.authority_kind END,
      authority_rank=MIN(surface.authority_rank,excluded.authority_rank);
  `;
}

function pronunciationUpsert(selectSql){
  const replace=(column)=>`${column}=CASE WHEN excluded.authority_rank<pronunciation.authority_rank THEN excluded.${column} ELSE pronunciation.${column} END`;
  return `
    INSERT INTO pronunciation(
      surface_id,identity_key,notation,raw,ipa,phonemes,syllable_count,stress_pattern,primary_stress,
      exact_key,multisyllable_key,vowel_key,vowel_family,coda_key,eligible,
      canonical_available,generated_available,canonical_preferred,generated_preferred,
      authority_rank,authority_kind
    )
    ${selectSql}
    WHERE 1
    ON CONFLICT(surface_id,identity_key) DO UPDATE SET
      canonical_available=MAX(pronunciation.canonical_available,excluded.canonical_available),
      generated_available=MAX(pronunciation.generated_available,excluded.generated_available),
      canonical_preferred=MAX(pronunciation.canonical_preferred,excluded.canonical_preferred),
      generated_preferred=MAX(pronunciation.generated_preferred,excluded.generated_preferred),
      eligible=MAX(pronunciation.eligible,excluded.eligible),
      ${replace('notation')},
      ${replace('raw')},
      ${replace('ipa')},
      ${replace('phonemes')},
      ${replace('syllable_count')},
      ${replace('stress_pattern')},
      ${replace('primary_stress')},
      ${replace('exact_key')},
      ${replace('multisyllable_key')},
      ${replace('vowel_key')},
      ${replace('vowel_family')},
      ${replace('coda_key')},
      authority_kind=CASE WHEN excluded.authority_rank<pronunciation.authority_rank THEN excluded.authority_kind ELSE pronunciation.authority_kind END,
      authority_rank=MIN(pronunciation.authority_rank,excluded.authority_rank);
  `;
}

function roleUpsert(selectSql){
  return `
    INSERT INTO surface_role(surface_id,role,canonical_available,generated_available)
    ${selectSql}
    WHERE 1
    ON CONFLICT(surface_id,role) DO UPDATE SET
      canonical_available=MAX(surface_role.canonical_available,excluded.canonical_available),
      generated_available=MAX(surface_role.generated_available,excluded.generated_available);
  `;
}

function originUpsert(selectSql){
  return `
    INSERT INTO pronunciation_origin(pronunciation_id,layer,domain,source_kind,origin_count)
    ${selectSql}
    WHERE 1
    ON CONFLICT(pronunciation_id,layer,domain,source_kind) DO UPDATE SET
      origin_count=pronunciation_origin.origin_count+excluded.origin_count;
  `;
}

function entityUpsert(selectSql){
  return `
    INSERT INTO surface_entity(
      surface_id,entity_qid,primary_category,popularity_score,canonical_available,generated_available
    )
    ${selectSql}
    WHERE 1
    ON CONFLICT(surface_id,entity_qid) DO UPDATE SET
      canonical_available=MAX(surface_entity.canonical_available,excluded.canonical_available),
      generated_available=MAX(surface_entity.generated_available,excluded.generated_available),
      primary_category=COALESCE(surface_entity.primary_category,excluded.primary_category),
      popularity_score=MAX(COALESCE(surface_entity.popularity_score,0),COALESCE(excluded.popularity_score,0));
  `;
}

function deStage({name,path,layer}){
  const bits=availability(layer);
  const generated=layer==='generated';
  const rank=generated?SERVING_AUTHORITY.generated_word:SERVING_AUTHORITY.core_word;
  const authority=generated?'generated_word':'core_word';
  const marker=generated?" AND h.pronunciation_flags LIKE '%secondary_opt_in%'":'';
  const sourceWhere=(last,upper)=>`h.id>${last} AND h.id<=${upper} AND h.pronunciation_eligible=1${marker}`;
  const common=(last,upper)=>`
    SELECT
      h.id source_id,'de' language,h.normalized,h.surface,
      'ipa' notation,h.ipa raw,h.ipa ipa,
      COALESCE(NULLIF(h.phonemes,''),h.ipa) identity_key,
      h.phonemes,h.syllable_count,h.stress stress_pattern,h.primary_stress,
      h.exact_key,h.multisyllable_key,h.vowel_key,h.vowel_family,h.coda_key,
      h.pronunciation_eligible eligible,h.pronunciation_preferred preferred,
      h.usage_rank,h.usage_count,h.historical,h.lemma,h.pos part_of_speech,h.lexicon_layer,
      h.pronunciation_source source_kind
    FROM src.hot h
    WHERE ${sourceWhere(last,upper)}
  `;
  return {
    name,label:generated?'DE generated words':'DE Core words',path,layer,domain:'word',
    totalSql:`SELECT COUNT(*) c FROM src.hot h WHERE h.pronunciation_eligible=1${marker}`,
    maxSql:`SELECT COALESCE(MAX(h.id),0) m FROM src.hot h WHERE h.pronunciation_eligible=1${marker}`,
    rangeCountSql:(last,upper)=>`SELECT COUNT(*) c FROM src.hot h WHERE ${sourceWhere(last,upper)}`,
    statements(last,upper){
      const rows=common(last,upper);
      return [
        surfaceUpsert(`
          SELECT language,normalized,surface,${bits.canonical},${bits.generated},
            ${rank},'${authority}',usage_rank,usage_count,historical,lemma,part_of_speech,lexicon_layer
          FROM (${rows})
          GROUP BY language,normalized
        `),
        pronunciationUpsert(`
          SELECT s.surface_id,r.identity_key,r.notation,r.raw,r.ipa,r.phonemes,r.syllable_count,
            r.stress_pattern,r.primary_stress,r.exact_key,r.multisyllable_key,r.vowel_key,
            r.vowel_family,r.coda_key,r.eligible,${bits.canonical},${bits.generated},
            CASE WHEN ${bits.canonical}=1 THEN r.preferred ELSE 0 END,
            CASE WHEN ${bits.generated}=1 THEN r.preferred ELSE 0 END,
            ${rank},'${authority}'
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
        `),
        roleUpsert(`
          SELECT s.surface_id,'lexical',${bits.canonical},${bits.generated}
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
          GROUP BY s.surface_id
        `),
        originUpsert(`
          SELECT p.pronunciation_id,'${layer}','word',r.source_kind,COUNT(*)
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
          JOIN pronunciation p ON p.surface_id=s.surface_id AND p.identity_key=r.identity_key
          GROUP BY p.pronunciation_id,r.source_kind
        `),
      ];
    },
  };
}

function enStage({name,path,layer}){
  const bits=availability(layer);
  const generated=layer==='generated';
  const rank=generated?SERVING_AUTHORITY.generated_word:SERVING_AUTHORITY.core_word;
  const authority=generated?'generated_word':'core_word';
  const marker=generated?" AND p.source='espeak_ng_generated_secondary'":'';
  const sourceWhere=(last,upper)=>`p.id>${last} AND p.id<=${upper} AND p.analysis_status='ok'${marker}`;
  const common=(last,upper)=>`
    SELECT
      p.id source_id,'en' language,f.normalized,f.surface,p.notation,p.raw,
      CASE WHEN p.notation='ipa' THEN p.raw ELSE NULL END ipa,
      COALESCE(NULLIF(p.phonemes,''),p.raw) identity_key,
      p.phonemes,p.syllable_count,p.stress stress_pattern,p.primary_stress,
      p.exact_key,p.multisyllable_key,p.vowel_key,p.vowel_family,p.coda_key,
      p.default_profile_eligible eligible,p.default_profile_eligible preferred,
      f.wordfreq_rank usage_rank,NULL usage_count,f.historical_only historical,
      f.lemmas lemma,f.poses part_of_speech,'english_writer' lexicon_layer,p.source source_kind
    FROM src.en_pronunciation p
    JOIN src.en_form f ON f.id=p.form_id
    WHERE ${sourceWhere(last,upper)}
  `;
  return {
    name,label:generated?'EN generated words':'EN Core words',path,layer,domain:'word',
    totalSql:`SELECT COUNT(*) c FROM src.en_pronunciation p WHERE p.analysis_status='ok'${marker}`,
    maxSql:`SELECT COALESCE(MAX(p.id),0) m FROM src.en_pronunciation p WHERE p.analysis_status='ok'${marker}`,
    rangeCountSql:(last,upper)=>`SELECT COUNT(*) c FROM src.en_pronunciation p WHERE ${sourceWhere(last,upper)}`,
    statements(last,upper){
      const rows=common(last,upper);
      return [
        surfaceUpsert(`
          SELECT language,normalized,surface,${bits.canonical},${bits.generated},
            ${rank},'${authority}',usage_rank,usage_count,historical,lemma,part_of_speech,lexicon_layer
          FROM (${rows})
          GROUP BY language,normalized
        `),
        pronunciationUpsert(`
          SELECT s.surface_id,r.identity_key,r.notation,r.raw,r.ipa,r.phonemes,r.syllable_count,
            r.stress_pattern,r.primary_stress,r.exact_key,r.multisyllable_key,r.vowel_key,
            r.vowel_family,r.coda_key,r.eligible,${bits.canonical},${bits.generated},
            CASE WHEN ${bits.canonical}=1 THEN r.preferred ELSE 0 END,
            CASE WHEN ${bits.generated}=1 THEN r.preferred ELSE 0 END,
            ${rank},'${authority}'
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
        `),
        roleUpsert(`
          SELECT s.surface_id,'lexical',${bits.canonical},${bits.generated}
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
          GROUP BY s.surface_id
        `),
        originUpsert(`
          SELECT p2.pronunciation_id,'${layer}','word',r.source_kind,COUNT(*)
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
          JOIN pronunciation p2 ON p2.surface_id=s.surface_id AND p2.identity_key=r.identity_key
          GROUP BY p2.pronunciation_id,r.source_kind
        `),
      ];
    },
  };
}

function phraseStage({name,path,layer}){
  const bits=availability(layer);
  const generated=layer==='generated';
  const rank=generated?SERVING_AUTHORITY.generated_phrase:SERVING_AUTHORITY.core_phrase;
  const authority=generated?'generated_phrase':'core_phrase';
  const marker=generated
    ?" AND EXISTS(SELECT 1 FROM src.phrase_pronunciation_token ppt WHERE ppt.phrase_pronunciation_id=pp.phrase_pronunciation_id AND ppt.pronunciation_source='eSpeak-NG Backfill V2')"
    :'';
  const sourceWhere=(last,upper)=>`pp.rowid>${last} AND pp.rowid<=${upper} AND pp.eligible=1${marker}`;
  const common=(last,upper)=>`
    SELECT
      pp.rowid source_id,'de' language,p.normalized,p.canonical surface,
      'ipa' notation,pp.ipa raw,pp.ipa ipa,
      COALESCE(NULLIF(pp.canonical_phonemes,''),pp.ipa) identity_key,
      pp.canonical_phonemes phonemes,pp.syllable_count,pp.stress_pattern,
      NULL primary_stress,pp.exact_tail_key exact_key,pp.multisyllable_key,
      pp.vowel_key,pp.vowel_family_key vowel_family,pp.coda_key,
      pp.eligible,CASE WHEN pp.variant_rank=1 THEN 1 ELSE 0 END preferred,
      NULL usage_rank,NULL usage_count,
      CASE WHEN p.historical_state='historical_only' THEN 1 ELSE 0 END historical,
      NULL lemma,'phrase' part_of_speech,'phrase' lexicon_layer,
      '${generated?'eSpeak-NG Backfill V2':'RhymeLab phrase catalog'}' source_kind
    FROM src.phrase_pronunciation pp
    JOIN src.phrase p ON p.phrase_id=pp.phrase_id
    WHERE ${sourceWhere(last,upper)}
  `;
  return {
    name,label:generated?'DE generated phrases':'DE Core phrases',path,layer,domain:'phrase',
    totalSql:`SELECT COUNT(*) c FROM src.phrase_pronunciation pp WHERE pp.eligible=1${marker}`,
    maxSql:`SELECT COALESCE(MAX(pp.rowid),0) m FROM src.phrase_pronunciation pp WHERE pp.eligible=1${marker}`,
    rangeCountSql:(last,upper)=>`SELECT COUNT(*) c FROM src.phrase_pronunciation pp WHERE ${sourceWhere(last,upper)}`,
    statements(last,upper){
      const rows=common(last,upper);
      return [
        surfaceUpsert(`
          SELECT language,normalized,surface,${bits.canonical},${bits.generated},
            ${rank},'${authority}',usage_rank,usage_count,historical,lemma,part_of_speech,lexicon_layer
          FROM (${rows})
          GROUP BY language,normalized
        `),
        pronunciationUpsert(`
          SELECT s.surface_id,r.identity_key,r.notation,r.raw,r.ipa,r.phonemes,r.syllable_count,
            r.stress_pattern,r.primary_stress,r.exact_key,r.multisyllable_key,r.vowel_key,
            r.vowel_family,r.coda_key,r.eligible,${bits.canonical},${bits.generated},
            CASE WHEN ${bits.canonical}=1 THEN r.preferred ELSE 0 END,
            CASE WHEN ${bits.generated}=1 THEN r.preferred ELSE 0 END,
            ${rank},'${authority}'
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
        `),
        roleUpsert(`
          SELECT s.surface_id,'phrase',${bits.canonical},${bits.generated}
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
          GROUP BY s.surface_id
        `),
        originUpsert(`
          SELECT p2.pronunciation_id,'${layer}','phrase',r.source_kind,COUNT(*)
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
          JOIN pronunciation p2 ON p2.surface_id=s.surface_id AND p2.identity_key=r.identity_key
          GROUP BY p2.pronunciation_id,r.source_kind
        `),
      ];
    },
  };
}

function entityStage({name,path,layer}){
  const bits=availability(layer);
  const generated=layer==='generated';
  const rank=generated?SERVING_AUTHORITY.generated_entity:SERVING_AUTHORITY.core_entity;
  const authority=generated?'generated_entity':'core_entity';
  const marker=generated?" AND ep.source_kind='espeak_ng_generated_secondary'":'';
  const sourceWhere=(last,upper)=>`
    ep.pronunciation_id>${last} AND ep.pronunciation_id<=${upper}
    AND en.searchable=1
    AND en.language IN ('de','en')
    AND ep.review_state IN (${acceptedEntityReviewStates})
    ${marker}
  `;
  const common=(last,upper)=>`
    SELECT
      ep.pronunciation_id source_id,en.language,en.normalized,en.surface,
      'ipa' notation,ep.ipa raw,ep.ipa ipa,
      COALESCE(NULLIF(MIN(epa.phonemes),''),ep.ipa) identity_key,
      MIN(epa.phonemes) phonemes,MIN(epa.syllable_count) syllable_count,
      MIN(epa.stress_pattern) stress_pattern,MIN(epa.primary_stress) primary_stress,
      NULL exact_key,NULL multisyllable_key,NULL vowel_key,NULL vowel_family,NULL coda_key,
      1 eligible,ep.preferred preferred,NULL usage_rank,NULL usage_count,NULL historical,
      NULL lemma,NULL part_of_speech,'entity' lexicon_layer,ep.source_kind source_kind,
      e.qid,e.primary_category,e.popularity_score
    FROM src.entity_pronunciation ep
    JOIN src.entity_name en ON en.name_id=ep.name_id
    JOIN src.entity e ON e.entity_id=en.entity_id
    LEFT JOIN src.entity_phonetic_analysis epa ON epa.pronunciation_id=ep.pronunciation_id
    WHERE ${sourceWhere(last,upper)}
    GROUP BY ep.pronunciation_id
  `;
  return {
    name,label:generated?'Generated Entity pronunciations':'Core Entity pronunciations',path,layer,domain:'entity',
    totalSql:`SELECT COUNT(*) c FROM src.entity_pronunciation ep JOIN src.entity_name en ON en.name_id=ep.name_id WHERE en.searchable=1 AND en.language IN ('de','en') AND ep.review_state IN (${acceptedEntityReviewStates})${marker}`,
    maxSql:`SELECT COALESCE(MAX(ep.pronunciation_id),0) m FROM src.entity_pronunciation ep JOIN src.entity_name en ON en.name_id=ep.name_id WHERE en.searchable=1 AND en.language IN ('de','en') AND ep.review_state IN (${acceptedEntityReviewStates})${marker}`,
    rangeCountSql:(last,upper)=>`SELECT COUNT(*) c FROM src.entity_pronunciation ep JOIN src.entity_name en ON en.name_id=ep.name_id WHERE ${sourceWhere(last,upper)}`,
    statements(last,upper){
      const rows=common(last,upper);
      const filter=sourceWhere(last,upper);
      return [
        surfaceUpsert(`
          SELECT language,normalized,surface,${bits.canonical},${bits.generated},
            ${rank},'${authority}',usage_rank,usage_count,historical,lemma,part_of_speech,lexicon_layer
          FROM (${rows})
          GROUP BY language,normalized
        `),
        pronunciationUpsert(`
          SELECT s.surface_id,r.identity_key,r.notation,r.raw,r.ipa,r.phonemes,r.syllable_count,
            r.stress_pattern,r.primary_stress,r.exact_key,r.multisyllable_key,r.vowel_key,
            r.vowel_family,r.coda_key,r.eligible,${bits.canonical},${bits.generated},
            CASE WHEN ${bits.canonical}=1 THEN r.preferred ELSE 0 END,
            CASE WHEN ${bits.generated}=1 THEN r.preferred ELSE 0 END,
            ${rank},'${authority}'
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
        `),
        roleUpsert(`
          SELECT s.surface_id,ec.category,${bits.canonical},${bits.generated}
          FROM src.entity_pronunciation ep
          JOIN src.entity_name en ON en.name_id=ep.name_id
          JOIN src.entity_category ec ON ec.entity_id=en.entity_id
          JOIN surface s ON s.language=en.language AND s.normalized=en.normalized
          WHERE ${filter}
          GROUP BY s.surface_id,ec.category
        `),
        entityUpsert(`
          SELECT s.surface_id,e.qid,e.primary_category,e.popularity_score,${bits.canonical},${bits.generated}
          FROM src.entity_pronunciation ep
          JOIN src.entity_name en ON en.name_id=ep.name_id
          JOIN src.entity e ON e.entity_id=en.entity_id
          JOIN surface s ON s.language=en.language AND s.normalized=en.normalized
          WHERE ${filter}
          GROUP BY s.surface_id,e.qid
        `),
        originUpsert(`
          SELECT p2.pronunciation_id,'${layer}','entity',r.source_kind,COUNT(*)
          FROM (${rows}) r
          JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
          JOIN pronunciation p2 ON p2.surface_id=s.surface_id AND p2.identity_key=r.identity_key
          GROUP BY p2.pronunciation_id,r.source_kind
        `),
      ];
    },
  };
}

export function servingV1StageDefinitions(paths){
  return [
    deStage({name:'01_de_core',path:paths.deCore,layer:'core'}),
    enStage({name:'02_en_core',path:paths.enCore,layer:'core'}),
    phraseStage({name:'03_phrase_core',path:paths.phraseCore,layer:'core'}),
    entityStage({name:'04_entity_core',path:paths.entityCore,layer:'core'}),
    deStage({name:'05_de_generated',path:paths.deGenerated,layer:'generated'}),
    enStage({name:'06_en_generated',path:paths.enGenerated,layer:'generated'}),
    phraseStage({name:'07_phrase_generated',path:paths.phraseGenerated,layer:'generated'}),
    entityStage({name:'08_entity_generated',path:paths.entityGenerated,layer:'generated'}),
  ];
}

function scalar(db,sql){
  return Number(db.prepare(sql).get()?.c||0);
}

export function servingV1Summary(db){
  const roleDistribution=db.prepare(`
    SELECT role,COUNT(*) surfaces
    FROM surface_role
    GROUP BY role
    ORDER BY surfaces DESC,role
    LIMIT 200
  `).all().map((row)=>({role:row.role,surfaces:Number(row.surfaces)}));
  return {
    surfaces:scalar(db,'SELECT COUNT(*) c FROM surface'),
    pronunciations:scalar(db,'SELECT COUNT(*) c FROM pronunciation'),
    canonicalSurfaces:scalar(db,'SELECT COUNT(*) c FROM surface WHERE canonical_available=1'),
    generatedSurfaces:scalar(db,'SELECT COUNT(*) c FROM surface WHERE generated_available=1'),
    surfaceLayerOverlap:scalar(db,'SELECT COUNT(*) c FROM surface WHERE canonical_available=1 AND generated_available=1'),
    canonicalPronunciations:scalar(db,'SELECT COUNT(*) c FROM pronunciation WHERE canonical_available=1'),
    generatedPronunciations:scalar(db,'SELECT COUNT(*) c FROM pronunciation WHERE generated_available=1'),
    pronunciationLayerOverlap:scalar(db,'SELECT COUNT(*) c FROM pronunciation WHERE canonical_available=1 AND generated_available=1'),
    generatedOnlyPronunciations:scalar(db,'SELECT COUNT(*) c FROM pronunciation WHERE canonical_available=0 AND generated_available=1'),
    multiRoleSurfaces:scalar(db,`
      SELECT COUNT(*) c FROM (
        SELECT surface_id FROM surface_role GROUP BY surface_id HAVING COUNT(*)>1
      )
    `),
    sameNameMultipleEntities:scalar(db,`
      SELECT COUNT(*) c FROM (
        SELECT surface_id FROM surface_entity GROUP BY surface_id HAVING COUNT(*)>1
      )
    `),
    multiPronunciationSurfaces:scalar(db,`
      SELECT COUNT(*) c FROM (
        SELECT surface_id FROM pronunciation GROUP BY surface_id HAVING COUNT(*)>1
      )
    `),
    entityLinks:scalar(db,'SELECT COUNT(*) c FROM surface_entity'),
    roles:scalar(db,'SELECT COUNT(*) c FROM surface_role'),
    origins:scalar(db,'SELECT COUNT(*) c FROM pronunciation_origin'),
    roleDistribution,
  };
}

export function servingV1InvariantReport(db){
  const generatedDisplacedCore=scalar(db,`
    SELECT COUNT(*) c
    FROM pronunciation
    WHERE canonical_available=1
      AND authority_rank>=100
  `);
  const generatedSurfaceDisplacedCore=scalar(db,`
    SELECT COUNT(*) c
    FROM surface
    WHERE canonical_available=1
      AND authority_rank>=100
  `);
  const orphanPronunciations=scalar(db,`
    SELECT COUNT(*) c
    FROM pronunciation p
    LEFT JOIN surface s ON s.surface_id=p.surface_id
    WHERE s.surface_id IS NULL
  `);
  const missingOrigin=scalar(db,`
    SELECT COUNT(*) c
    FROM pronunciation p
    WHERE NOT EXISTS(
      SELECT 1 FROM pronunciation_origin o WHERE o.pronunciation_id=p.pronunciation_id
    )
  `);
  return {
    core_never_displaced_by_generated:generatedDisplacedCore===0&&generatedSurfaceDisplacedCore===0,
    generated_displaced_core_pronunciations:generatedDisplacedCore,
    generated_displaced_core_surfaces:generatedSurfaceDisplacedCore,
    orphan_pronunciations:orphanPronunciations,
    pronunciations_without_origin:missingOrigin,
    ok:generatedDisplacedCore===0
      &&generatedSurfaceDisplacedCore===0
      &&orphanPronunciations===0
      &&missingOrigin===0,
  };
}
