import {createHash} from 'node:crypto';

export const DISTRIBUTION_SCHEMA='rhymelab-distribution-v1';
export const DISTRIBUTION_RANK_POLICY='distribution-rank-v1-language-normalized-usage-surface';
export const DISTRIBUTION_ENTITY_POLICY='phase12a2-hybrid-v2-frozen-runtime-population';
export const DISTRIBUTION_BUILD_POLICY='positive-materialization-relational-closure-v1';

export const DISTRIBUTION_EDITIONS=Object.freeze({
  lite:Object.freeze({
    edition:'lite',
    coreTarget:50000,
    generatedTarget:0,
    mode:'core',
    features:Object.freeze({
      words_de:true,words_en:true,phrases:false,entities:false,generated:false,markov:false,
    }),
  }),
  standard:Object.freeze({
    edition:'standard',
    coreTarget:250000,
    generatedTarget:0,
    mode:'core',
    features:Object.freeze({
      words_de:true,words_en:true,phrases:true,entities:true,generated:false,markov:false,
    }),
  }),
  full:Object.freeze({
    edition:'full',
    coreTarget:400000,
    generatedTarget:200000,
    mode:'all',
    features:Object.freeze({
      words_de:true,words_en:true,phrases:true,entities:true,generated:true,markov:true,
    }),
  }),
});

function q(name){
  return '"'+String(name).replaceAll('"','""')+'"';
}

function prefix(alias){
  return alias?String(alias).replace(/\.$/u,'')+'.':'';
}

export function editionContract(edition){
  const contract=DISTRIBUTION_EDITIONS[String(edition||'').toLowerCase()];
  if(!contract)throw new Error('Unknown distribution edition: '+edition);
  return contract;
}

export function distributionMetaFingerprint(meta){
  return createHash('sha256').update(JSON.stringify({
    schema:meta.schema||null,
    identity_revision:meta.identity_revision||null,
    runtime_revision:meta.runtime_revision||null,
    runtime_semantic_fingerprint:meta.runtime_semantic_fingerprint||null,
    product_adapter_revision:meta.product_adapter_revision||null,
    product_adapter_semantic_fingerprint:meta.product_adapter_semantic_fingerprint||null,
  })).digest('hex');
}

export function readMeta(db,{alias='main'}={}){
  const rows=db.prepare('SELECT key,value FROM '+q(alias)+'.meta ORDER BY key').all();
  return Object.fromEntries(rows.map((row)=>[String(row.key),String(row.value)]));
}

export function assertDistributionSourceReady(meta){
  const failures=[];
  if(meta.schema!=='rhymelab-serving-v1')failures.push('schema');
  if(meta.runtime_status!=='complete')failures.push('runtime_status');
  if(meta.product_adapter_status!=='complete')failures.push('product_adapter_status');
  if(!meta.runtime_semantic_fingerprint)failures.push('runtime_semantic_fingerprint');
  if(!meta.product_adapter_semantic_fingerprint)failures.push('product_adapter_semantic_fingerprint');
  if(failures.length)throw new Error(
    'Serving-v1 source is not distribution-ready: '+failures.join(', '),
  );
  return true;
}

export function lexicalRankSelectSql({alias='main',layer='core'}={}){
  const p=prefix(alias);
  const availability=layer==='generated'
    ?`p.canonical_available=0 AND p.generated_available=1
       AND NOT EXISTS(
         SELECT 1
         FROM ${p}pronunciation cp
         JOIN ${p}pronunciation_origin co
           ON co.pronunciation_id=cp.pronunciation_id AND co.domain='word'
         WHERE cp.surface_id=s.surface_id
           AND cp.eligible=1
           AND cp.canonical_available=1
       )`
    :`p.canonical_available=1`;

  return `
    WITH candidates AS (
      SELECT
        s.surface_id,
        s.language,
        s.normalized,
        s.display_surface,
        s.usage_rank,
        s.usage_count,
        COALESCE(s.historical,0) AS historical,
        CASE
          WHEN s.language='de' THEN COALESCE(lp.usage_score,-1e30)
          ELSE COALESCE(lp.en_wordfreq_zipf,-1e30)
        END AS fallback_score,
        CASE WHEN s.usage_rank IS NOT NULL AND s.usage_rank>0 THEN 0 ELSE 1 END AS rank_class
      FROM ${p}surface s
      LEFT JOIN ${p}runtime_lexical_profile lp USING(surface_id)
      WHERE s.language IN ('de','en')
        AND EXISTS(
          SELECT 1 FROM ${p}surface_role sr
          WHERE sr.surface_id=s.surface_id AND sr.role='lexical'
        )
        AND EXISTS(
          SELECT 1
          FROM ${p}pronunciation p
          JOIN ${p}pronunciation_origin po
            ON po.pronunciation_id=p.pronunciation_id
           AND po.domain='word'
          WHERE p.surface_id=s.surface_id
            AND p.eligible=1
            AND ${availability}
        )
    ),
    local_rank AS (
      SELECT
        c.*,
        ROW_NUMBER() OVER(
          PARTITION BY language,rank_class
          ORDER BY
            CASE WHEN rank_class=0 THEN usage_rank END ASC,
            fallback_score DESC,
            historical ASC,
            COALESCE(usage_count,0) DESC,
            normalized ASC,
            surface_id ASC
        ) AS local_ordinal,
        COUNT(*) OVER(PARTITION BY language,rank_class) AS local_count
      FROM candidates c
    ),
    merged AS (
      SELECT
        l.*,
        ROW_NUMBER() OVER(
          ORDER BY
            rank_class ASC,
            (CAST(local_ordinal AS REAL)/MAX(local_count,1)) ASC,
            language ASC,
            normalized ASC,
            surface_id ASC
        ) AS distribution_rank
      FROM local_rank l
    )
    SELECT * FROM merged
  `;
}

export function createRankTables(db,{alias='main',replace=true}={}){
  if(replace){
    db.exec('DROP TABLE IF EXISTS _dist_core_rank; DROP TABLE IF EXISTS _dist_generated_rank;');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS _dist_core_rank AS
    ${lexicalRankSelectSql({alias,layer:'core'})};
    CREATE UNIQUE INDEX IF NOT EXISTS _dist_core_rank_surface ON _dist_core_rank(surface_id);
    CREATE UNIQUE INDEX IF NOT EXISTS _dist_core_rank_order ON _dist_core_rank(distribution_rank);

    CREATE TABLE IF NOT EXISTS _dist_generated_rank AS
    ${lexicalRankSelectSql({alias,layer:'generated'})};
    CREATE UNIQUE INDEX IF NOT EXISTS _dist_generated_rank_surface ON _dist_generated_rank(surface_id);
    CREATE UNIQUE INDEX IF NOT EXISTS _dist_generated_rank_order ON _dist_generated_rank(distribution_rank);
  `);
}

function countByLanguage(db,table,target){
  const rows=db.prepare(`
    SELECT language,rank_class,COUNT(*) c
    FROM ${table}
    WHERE distribution_rank<=?
    GROUP BY language,rank_class
    ORDER BY language,rank_class
  `).all(target);
  const out={de:{ranked:0,fallback:0,total:0},en:{ranked:0,fallback:0,total:0}};
  for(const row of rows){
    const language=String(row.language);
    const count=Number(row.c||0);
    if(!out[language])continue;
    if(Number(row.rank_class)===0)out[language].ranked=count;
    else out[language].fallback=count;
    out[language].total+=count;
  }
  return out;
}

export function rankPlan(db){
  const coreTotal=Number(db.prepare('SELECT COUNT(*) c FROM _dist_core_rank').get()?.c||0);
  const generatedTotal=Number(db.prepare('SELECT COUNT(*) c FROM _dist_generated_rank').get()?.c||0);
  return Object.fromEntries(Object.entries(DISTRIBUTION_EDITIONS).map(([edition,contract])=>[
    edition,
    {
      edition,
      core_target:contract.coreTarget,
      core_available:coreTotal,
      core_selection:countByLanguage(db,'_dist_core_rank',contract.coreTarget),
      generated_target:contract.generatedTarget,
      generated_available:generatedTotal,
      generated_selection:contract.generatedTarget
        ?countByLanguage(db,'_dist_generated_rank',contract.generatedTarget)
        :{de:{ranked:0,fallback:0,total:0},en:{ranked:0,fallback:0,total:0}},
      features:contract.features,
    },
  ]));
}

export function createSelectionStorage(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS _dist_word_surface(
      surface_id INTEGER PRIMARY KEY,
      layer TEXT NOT NULL CHECK(layer IN ('core','generated'))
    );
    CREATE TABLE IF NOT EXISTS _dist_pronunciation(
      pronunciation_id INTEGER PRIMARY KEY,
      reason TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS _dist_surface(surface_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_phrase(runtime_phrase_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_phrase_window(runtime_window_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_entity(entity_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_entity_name(name_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_entity_pronunciation(product_pronunciation_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_target(target_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_key(key_id INTEGER PRIMARY KEY);
  `);
}

export function clearSelectionStorage(db){
  for(const table of [
    '_dist_word_surface','_dist_pronunciation','_dist_surface','_dist_phrase',
    '_dist_phrase_window','_dist_entity','_dist_entity_name',
    '_dist_entity_pronunciation','_dist_target','_dist_key',
  ])db.exec('DELETE FROM '+table+';');
}

export function populateDistributionSelection(db,{edition,alias='src'}){
  const contract=editionContract(edition);
  const p=prefix(alias);
  createSelectionStorage(db);
  clearSelectionStorage(db);

  const coreAvailable=Number(db.prepare('SELECT COUNT(*) c FROM _dist_core_rank').get()?.c||0);
  const generatedAvailable=Number(db.prepare('SELECT COUNT(*) c FROM _dist_generated_rank').get()?.c||0);
  if(coreAvailable<contract.coreTarget){
    throw new Error('Core distribution population too small: '+coreAvailable+' < '+contract.coreTarget);
  }
  if(contract.generatedTarget&&generatedAvailable<contract.generatedTarget){
    throw new Error('Generated distribution population too small: '+generatedAvailable+' < '+contract.generatedTarget);
  }

  db.prepare(`
    INSERT INTO _dist_word_surface(surface_id,layer)
    SELECT surface_id,'core'
    FROM _dist_core_rank
    WHERE distribution_rank<=?
  `).run(contract.coreTarget);

  if(contract.generatedTarget){
    db.prepare(`
      INSERT INTO _dist_word_surface(surface_id,layer)
      SELECT surface_id,'generated'
      FROM _dist_generated_rank
      WHERE distribution_rank<=?
    `).run(contract.generatedTarget);
  }

  db.exec(`
    INSERT OR IGNORE INTO _dist_pronunciation(pronunciation_id,reason)
    SELECT p.pronunciation_id,'word_core'
    FROM ${p}pronunciation p
    JOIN _dist_word_surface ws ON ws.surface_id=p.surface_id AND ws.layer='core'
    WHERE p.eligible=1 AND p.canonical_available=1
      AND EXISTS(
        SELECT 1 FROM ${p}pronunciation_origin po
        WHERE po.pronunciation_id=p.pronunciation_id AND po.domain='word'
      );
  `);

  if(contract.features.generated){
    db.exec(`
      INSERT OR IGNORE INTO _dist_pronunciation(pronunciation_id,reason)
      SELECT p.pronunciation_id,
        CASE WHEN ws.layer='core' THEN 'word_generated_closure_on_core' ELSE 'word_generated' END
      FROM ${p}pronunciation p
      JOIN _dist_word_surface ws ON ws.surface_id=p.surface_id
      WHERE p.eligible=1 AND p.canonical_available=0 AND p.generated_available=1
        AND EXISTS(
          SELECT 1 FROM ${p}pronunciation_origin po
          WHERE po.pronunciation_id=p.pronunciation_id AND po.domain='word'
        );
    `);
  }

  if(contract.features.phrases){
    const phraseAvailability=contract.mode==='core'
      ?'rp.canonical_available=1'
      :'(rp.canonical_available=1 OR rp.generated_available=1)';
    const windowAvailability=contract.mode==='core'
      ?'w.canonical_available=1'
      :'(w.canonical_available=1 OR w.generated_available=1)';
    db.exec(`
      INSERT OR IGNORE INTO _dist_phrase(runtime_phrase_id)
      SELECT rp.runtime_phrase_id
      FROM ${p}runtime_phrase rp
      WHERE ${phraseAvailability};

      INSERT OR IGNORE INTO _dist_phrase_window(runtime_window_id)
      SELECT w.runtime_window_id
      FROM ${p}runtime_phrase_window w
      JOIN _dist_phrase dp USING(runtime_phrase_id)
      WHERE ${windowAvailability};

      INSERT OR IGNORE INTO _dist_pronunciation(pronunciation_id,reason)
      SELECT rp.pronunciation_id,'phrase'
      FROM ${p}runtime_phrase rp
      JOIN _dist_phrase dp USING(runtime_phrase_id);
    `);
  }

  if(contract.features.entities){
    const entityAvailability=contract.mode==='core'
      ?'sp.canonical_available=1'
      :'(sp.canonical_available=1 OR sp.generated_available=1)';
    db.exec(`
      INSERT OR IGNORE INTO _dist_entity_pronunciation(product_pronunciation_id)
      SELECT ep.product_pronunciation_id
      FROM ${p}runtime_entity_pronunciation ep
      JOIN ${p}pronunciation sp
        ON sp.pronunciation_id=ep.serving_pronunciation_id
      WHERE sp.eligible=1 AND ${entityAvailability};

      INSERT OR IGNORE INTO _dist_entity_name(name_id)
      SELECT DISTINCT ep.name_id
      FROM ${p}runtime_entity_pronunciation ep
      JOIN _dist_entity_pronunciation dep USING(product_pronunciation_id);

      INSERT OR IGNORE INTO _dist_entity(entity_id)
      SELECT DISTINCT n.entity_id
      FROM ${p}runtime_entity_name n
      JOIN _dist_entity_name dn USING(name_id);

      INSERT OR IGNORE INTO _dist_pronunciation(pronunciation_id,reason)
      SELECT DISTINCT ep.serving_pronunciation_id,'entity'
      FROM ${p}runtime_entity_pronunciation ep
      JOIN _dist_entity_pronunciation dep USING(product_pronunciation_id);
    `);
  }

  db.exec(`
    INSERT OR IGNORE INTO _dist_surface(surface_id)
    SELECT surface_id FROM _dist_word_surface;

    INSERT OR IGNORE INTO _dist_surface(surface_id)
    SELECT DISTINCT p.surface_id
    FROM ${p}pronunciation p
    JOIN _dist_pronunciation dp USING(pronunciation_id);
  `);

  if(contract.features.phrases){
    db.exec(`
      INSERT OR IGNORE INTO _dist_surface(surface_id)
      SELECT DISTINCT rp.surface_id
      FROM ${p}runtime_phrase rp
      JOIN _dist_phrase dp USING(runtime_phrase_id);
    `);
  }

  if(contract.features.entities){
    db.exec(`
      INSERT OR IGNORE INTO _dist_surface(surface_id)
      SELECT DISTINCT n.surface_id
      FROM ${p}runtime_entity_name n
      JOIN _dist_entity_name dn USING(name_id);
    `);
  }

  db.exec(`
    INSERT OR IGNORE INTO _dist_target(target_id)
    SELECT t.target_id
    FROM ${p}runtime_target t
    WHERE
      (t.target_kind='pronunciation' AND EXISTS(
        SELECT 1 FROM _dist_pronunciation dp WHERE dp.pronunciation_id=t.pronunciation_id
      ))
      OR
      (t.target_kind='phrase_window' AND t.runtime_window_id IN(
        SELECT runtime_window_id FROM _dist_phrase_window
      ));

    INSERT OR IGNORE INTO _dist_key(key_id)
    SELECT DISTINCT km.key_id
    FROM ${p}runtime_key_member km
    JOIN _dist_target dt USING(target_id);
  `);

  return distributionSelectionSummary(db,{edition,alias});
}

function scalar(db,sql){
  return Number(db.prepare(sql).get()?.c||0);
}

export function distributionSelectionSummary(db,{edition,alias='src'}){
  const p=prefix(alias);
  return {
    edition,
    word_surfaces:{
      core:scalar(db,"SELECT COUNT(*) c FROM _dist_word_surface WHERE layer='core'"),
      generated:scalar(db,"SELECT COUNT(*) c FROM _dist_word_surface WHERE layer='generated'"),
    },
    selected:{
      surfaces:scalar(db,'SELECT COUNT(*) c FROM _dist_surface'),
      pronunciations:scalar(db,'SELECT COUNT(*) c FROM _dist_pronunciation'),
      phrases:scalar(db,'SELECT COUNT(*) c FROM _dist_phrase'),
      phrase_windows:scalar(db,'SELECT COUNT(*) c FROM _dist_phrase_window'),
      entities:scalar(db,'SELECT COUNT(*) c FROM _dist_entity'),
      entity_names:scalar(db,'SELECT COUNT(*) c FROM _dist_entity_name'),
      entity_pronunciations:scalar(db,'SELECT COUNT(*) c FROM _dist_entity_pronunciation'),
      runtime_targets:scalar(db,'SELECT COUNT(*) c FROM _dist_target'),
      runtime_keys:scalar(db,'SELECT COUNT(*) c FROM _dist_key'),
      runtime_key_members:scalar(db,`
        SELECT COUNT(*) c
        FROM ${p}runtime_key_member km
        JOIN _dist_target dt USING(target_id)
      `),
    },
  };
}

export const DISTRIBUTION_COPY_STAGES=Object.freeze([
  Object.freeze({
    name:'identity',
    tables:Object.freeze({
      meta:'1',
      surface:'surface_id IN (SELECT surface_id FROM _dist_surface)',
      pronunciation:'pronunciation_id IN (SELECT pronunciation_id FROM _dist_pronunciation)',
      surface_role:'surface_id IN (SELECT surface_id FROM _dist_surface)',
      surface_entity:`surface_id IN (SELECT surface_id FROM _dist_surface)
        AND entity_qid IN(
          SELECT e.qid FROM src.runtime_entity_identity e JOIN _dist_entity de USING(entity_id)
        )`,
      pronunciation_origin:'pronunciation_id IN (SELECT pronunciation_id FROM _dist_pronunciation)',
    }),
  }),
  Object.freeze({
    name:'runtime',
    tables:Object.freeze({
      runtime_target:'target_id IN (SELECT target_id FROM _dist_target)',
      runtime_key:'key_id IN (SELECT key_id FROM _dist_key)',
      runtime_key_member:`target_id IN (SELECT target_id FROM _dist_target)
        AND key_id IN (SELECT key_id FROM _dist_key)`,
      runtime_surface_morphology:'surface_id IN (SELECT surface_id FROM _dist_word_surface)',
      runtime_phrase:'runtime_phrase_id IN (SELECT runtime_phrase_id FROM _dist_phrase)',
      runtime_phrase_usage:'runtime_phrase_id IN (SELECT runtime_phrase_id FROM _dist_phrase)',
      runtime_phrase_attestation:'runtime_phrase_id IN (SELECT runtime_phrase_id FROM _dist_phrase)',
      runtime_phrase_window:'runtime_window_id IN (SELECT runtime_window_id FROM _dist_phrase_window)',
    }),
  }),
  Object.freeze({
    name:'product_words_phrases',
    tables:Object.freeze({
      runtime_lexical_profile:'surface_id IN (SELECT surface_id FROM _dist_word_surface)',
      runtime_pronunciation_profile:'pronunciation_id IN (SELECT pronunciation_id FROM _dist_pronunciation)',
      runtime_de_surface_profile:'surface_id IN (SELECT surface_id FROM _dist_word_surface)',
      runtime_de_candidate:'pronunciation_id IN (SELECT pronunciation_id FROM _dist_pronunciation)',
      runtime_de_analysis:'pronunciation_id IN (SELECT pronunciation_id FROM _dist_pronunciation)',
      runtime_de_writer_candidate:'pronunciation_id IN (SELECT pronunciation_id FROM _dist_pronunciation)',
      runtime_phrase_profile:'runtime_phrase_id IN (SELECT runtime_phrase_id FROM _dist_phrase)',
      runtime_phrase_ranking_evidence:'runtime_phrase_id IN (SELECT runtime_phrase_id FROM _dist_phrase)',
      runtime_en_key_candidate:'pronunciation_id IN (SELECT pronunciation_id FROM _dist_pronunciation)',
    }),
  }),
  Object.freeze({
    name:'product_entities',
    tables:Object.freeze({
      runtime_entity_identity:'entity_id IN (SELECT entity_id FROM _dist_entity)',
      runtime_entity_category:'entity_id IN (SELECT entity_id FROM _dist_entity)',
      runtime_entity_name:'name_id IN (SELECT name_id FROM _dist_entity_name)',
      runtime_entity_pronunciation:'product_pronunciation_id IN (SELECT product_pronunciation_id FROM _dist_entity_pronunciation)',
      runtime_entity_analysis:'product_pronunciation_id IN (SELECT product_pronunciation_id FROM _dist_entity_pronunciation)',
      runtime_entity_anchor_occurrence:'product_pronunciation_id IN (SELECT product_pronunciation_id FROM _dist_entity_pronunciation)',
      runtime_entity_anchor_ranked:'product_pronunciation_id IN (SELECT product_pronunciation_id FROM _dist_entity_pronunciation)',
      runtime_entity_writer_anchor:'serving_pronunciation_id IN (SELECT pronunciation_id FROM _dist_pronunciation)',
    }),
  }),
]);

export function sourceSchema(db,{alias='src'}={}){
  const tables=db.prepare(`
    SELECT name,sql FROM ${q(alias)}.sqlite_schema
    WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
    ORDER BY name
  `).all();
  const indexes=db.prepare(`
    SELECT name,sql FROM ${q(alias)}.sqlite_schema
    WHERE type='index' AND sql IS NOT NULL
    ORDER BY name
  `).all();
  return {tables,indexes};
}

export function createTargetSchema(db,{alias='src'}={}){
  const schema=sourceSchema(db,{alias});
  const existing=new Set(
    db.prepare("SELECT name FROM main.sqlite_schema WHERE type='table'").all().map((row)=>String(row.name)),
  );
  for(const row of schema.tables){
    if(existing.has(String(row.name)))continue;
    db.exec(String(row.sql));
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS distribution_build_stage(
      stage TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      completed_at TEXT,
      detail_json TEXT
    );
  `);
  return schema;
}

export function copyDistributionStage(db,stage,{alias='src'}={}){
  const p=prefix(alias);
  db.exec('BEGIN IMMEDIATE;');
  try{
    for(const [table,where] of Object.entries(stage.tables)){
      if(table==='meta'){
        db.exec(`INSERT OR IGNORE INTO meta SELECT * FROM ${p}meta WHERE ${where};`);
        continue;
      }
      const targetCount=scalar(db,'SELECT COUNT(*) c FROM '+q(table));
      if(targetCount>0)continue;
      db.exec(`INSERT INTO ${q(table)} SELECT * FROM ${p}${q(table)} WHERE ${where};`);
    }
    db.prepare(`
      INSERT INTO distribution_build_stage(stage,status,completed_at,detail_json)
      VALUES(?,'complete',datetime('now'),?)
      ON CONFLICT(stage) DO UPDATE SET
        status='complete',completed_at=excluded.completed_at,detail_json=excluded.detail_json
    `).run(stage.name,JSON.stringify({tables:Object.keys(stage.tables)}));
    db.exec('COMMIT;');
  }catch(error){
    try{db.exec('ROLLBACK;')}catch{}
    throw error;
  }
}

export function normalizeEditionAvailability(db,edition){
  const contract=editionContract(edition);
  if(!contract.features.generated){
    for(const table of ['surface','surface_role','surface_entity','runtime_target','runtime_phrase','runtime_phrase_window']){
      db.exec(`UPDATE ${table} SET generated_available=0 WHERE generated_available<>0;`);
    }
  }

  db.exec(`
    UPDATE surface
    SET
      canonical_available=CASE WHEN EXISTS(
        SELECT 1 FROM pronunciation p
        WHERE p.surface_id=surface.surface_id AND p.canonical_available=1
      ) THEN 1 ELSE 0 END,
      generated_available=CASE WHEN EXISTS(
        SELECT 1 FROM pronunciation p
        WHERE p.surface_id=surface.surface_id
          AND p.canonical_available=0 AND p.generated_available=1
      ) THEN 1 ELSE 0 END;
  `);
}

export function writeDistributionManifest(db,{edition,sourceMeta,selection}){
  const contract=editionContract(edition);
  const values={
    distribution_schema:DISTRIBUTION_SCHEMA,
    distribution_edition:edition,
    distribution_rank_policy:DISTRIBUTION_RANK_POLICY,
    distribution_entity_policy:DISTRIBUTION_ENTITY_POLICY,
    distribution_build_policy:DISTRIBUTION_BUILD_POLICY,
    distribution_source_fingerprint:distributionMetaFingerprint(sourceMeta),
    distribution_source_runtime_semantic_fingerprint:sourceMeta.runtime_semantic_fingerprint,
    distribution_source_product_semantic_fingerprint:sourceMeta.product_adapter_semantic_fingerprint,
    distribution_core_target:String(contract.coreTarget),
    distribution_generated_target:String(contract.generatedTarget),
    distribution_features_json:JSON.stringify(contract.features),
    distribution_selection_json:JSON.stringify(selection),
    distribution_status:'complete',
  };
  const put=db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);
  for(const [key,value] of Object.entries(values))put.run(key,String(value));
  return values;
}

export function distributionIntegrityReport(db,edition){
  const contract=editionContract(edition);
  const quick=db.prepare('PRAGMA quick_check').all();
  const foreign=db.prepare('PRAGMA foreign_key_check').all();
  const counts={
    phrases:scalar(db,'SELECT COUNT(*) c FROM runtime_phrase'),
    entities:scalar(db,'SELECT COUNT(*) c FROM runtime_entity_identity'),
    generated_word_pronunciations:scalar(db,`
      SELECT COUNT(*) c
      FROM pronunciation p
      WHERE p.canonical_available=0 AND p.generated_available=1
        AND EXISTS(
          SELECT 1 FROM pronunciation_origin po
          WHERE po.pronunciation_id=p.pronunciation_id AND po.domain='word'
        )
    `),
  };
  const violations=[];
  if(quick.length!==1||String(quick[0]?.quick_check||'').toLowerCase()!=='ok')violations.push('quick_check');
  if(foreign.length)violations.push('foreign_key_check');
  if(!contract.features.phrases&&counts.phrases)violations.push('phrase_leakage');
  if(!contract.features.entities&&counts.entities)violations.push('entity_leakage');
  if(!contract.features.generated&&counts.generated_word_pronunciations)violations.push('generated_word_leakage');
  return {
    ok:violations.length===0,
    violations,
    quick_check:quick,
    foreign_key_violations:foreign.length,
    counts,
  };
}

export function dropDistributionBuildStorage(db){
  for(const table of [
    '_dist_core_rank','_dist_generated_rank','_dist_word_surface','_dist_pronunciation',
    '_dist_surface','_dist_phrase','_dist_phrase_window','_dist_entity',
    '_dist_entity_name','_dist_entity_pronunciation','_dist_target','_dist_key',
    'distribution_build_stage',
  ]){
    db.exec('DROP TABLE IF EXISTS '+q(table)+';');
  }
}
