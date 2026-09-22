import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const DISTRIBUTION_SCHEMA='rhymelab-distribution-v1';
export const DISTRIBUTION_RANK_POLICY='distribution-rank-v1-language-normalized-usage-surface';
export const DISTRIBUTION_ENTITY_POLICY='phase12a2-hybrid-v2-frozen-runtime-population';
export const DISTRIBUTION_BUILD_POLICY='positive-materialization-relational-closure-v1';

export const DISTRIBUTION_EDITIONS=Object.freeze({
  lite:Object.freeze({
    edition:'lite',
    totalTarget:50000,
    entityPerCategory:0,
    phraseMode:'none',
    mode:'core',
    features:Object.freeze({
      words_de:true,words_en:true,phrases:false,entities:false,generated:false,markov:false,
    }),
  }),
  standard:Object.freeze({
    edition:'standard',
    totalTarget:250000,
    entityPerCategory:1000,
    phraseMode:'core',
    mode:'core',
    features:Object.freeze({
      words_de:true,words_en:true,phrases:true,entities:true,generated:false,markov:false,
    }),
  }),
  full:Object.freeze({
    edition:'full',
    totalTarget:400000,
    entityPerCategory:5000,
    phraseMode:'all',
    mode:'all',
    features:Object.freeze({
      words_de:true,words_en:true,phrases:true,entities:true,generated:true,markov:false,
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

export function attachReadOnlyDatabase(db,path,{alias='src'}={}){
  const uri=new URL(pathToFileURL(path));
  uri.searchParams.set('mode','ro');
  db.prepare('ATTACH DATABASE ? AS '+q(alias)).run(uri.href);
  return uri.href;
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

export function createRankTable(db,{alias='main',layer='core',replace=true,onProgress=null}={}){
  if(!['core','generated'].includes(layer))throw new Error('Rank layer must be core or generated.');
  const table=layer==='core'?'_dist_core_rank':'_dist_generated_rank';
  if(replace)db.exec('DROP TABLE IF EXISTS '+table+';');
  onProgress?.({phase:'rank',layer,status:'start',table});
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${table} AS
    ${lexicalRankSelectSql({alias,layer})};
  `);
  onProgress?.({
    phase:'rank',layer,status:'rows',table,
    rows:Number(db.prepare('SELECT COUNT(*) c FROM '+table).get()?.c||0),
  });
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${table}_surface ON ${table}(surface_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ${table}_order ON ${table}(distribution_rank);
  `);
  onProgress?.({phase:'rank',layer,status:'complete',table});
}

export function createRankTables(db,{alias='main',replace=true,onProgress=null}={}){
  createRankTable(db,{alias,layer:'core',replace,onProgress});
  createRankTable(db,{alias,layer:'generated',replace,onProgress});
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
      total_target:contract.totalTarget,
      entity_per_category:contract.entityPerCategory,
      phrase_mode:contract.phraseMode,
      core_word_surfaces_available:coreTotal,
      generated_only_word_surfaces_available:generatedTotal,
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
    CREATE TABLE IF NOT EXISTS _dist_entity_availability(
      entity_id INTEGER PRIMARY KEY,
      canonical_available INTEGER NOT NULL,
      generated_available INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS _dist_entity_availability_state(
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      source_max_pronunciation_id INTEGER NOT NULL,
      last_pronunciation_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('building','complete'))
    );
    CREATE TABLE IF NOT EXISTS _dist_entity_membership(
      entity_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      edition_category_rank INTEGER NOT NULL,
      selection_source TEXT NOT NULL,
      PRIMARY KEY(entity_id,category)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS _dist_entity_name(name_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_entity_pronunciation(product_pronunciation_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_target(target_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS _dist_key(key_id INTEGER PRIMARY KEY);
  `);
}

export function clearSelectionStorage(db){
  for(const table of [
    '_dist_word_surface','_dist_pronunciation','_dist_surface','_dist_phrase',
    '_dist_phrase_window','_dist_entity','_dist_entity_membership','_dist_entity_name',
    '_dist_entity_pronunciation','_dist_target','_dist_key',
  ])db.exec('DELETE FROM '+table+';');
}

export function ensureEntityAvailability(db,{
  alias='src',
  onProgress=null,
  chunkSize=100000,
}={}){
  const p=prefix(alias);
  createSelectionStorage(db);
  const sourceMax=Number(db.prepare(`
    SELECT COALESCE(MAX(product_pronunciation_id),0) AS max_id
    FROM ${p}runtime_entity_pronunciation
  `).get()?.max_id||0);
  const safeChunk=Math.max(1000,Math.trunc(Number(chunkSize)||100000));

  let state=db.prepare(`
    SELECT source_max_pronunciation_id,last_pronunciation_id,status
    FROM _dist_entity_availability_state
    WHERE singleton=1
  `).get()||null;

  if(state&&Number(state.source_max_pronunciation_id)!==sourceMax){
    db.exec(`
      DELETE FROM _dist_entity_availability;
      DELETE FROM _dist_entity_availability_state;
    `);
    state=null;
  }

  if(state?.status==='complete'){
    const entities=scalar(db,'SELECT COUNT(*) c FROM _dist_entity_availability');
    onProgress?.({
      phase:'selection',step:'entity_availability',status:'resume_skip',
      entities,last_pronunciation_id:Number(state.last_pronunciation_id||0),
      source_max_pronunciation_id:sourceMax,
    });
    return entities;
  }

  if(!state){
    db.prepare(`
      INSERT INTO _dist_entity_availability_state(
        singleton,source_max_pronunciation_id,last_pronunciation_id,status
      ) VALUES(1,?,0,'building')
    `).run(sourceMax);
    state={source_max_pronunciation_id:sourceMax,last_pronunciation_id:0,status:'building'};
  }

  let last=Number(state.last_pronunciation_id||0);
  const totalChunks=Math.max(1,Math.ceil(sourceMax/safeChunk));
  onProgress?.({
    phase:'selection',step:'entity_availability',status:last>0?'resume':'start',
    last_pronunciation_id:last,source_max_pronunciation_id:sourceMax,
    current:Math.min(totalChunks,Math.floor(last/safeChunk)),
    total:totalChunks,
  });

  const upsert=db.prepare(`
    INSERT INTO _dist_entity_availability(
      entity_id,canonical_available,generated_available
    )
    SELECT
      n.entity_id,
      MAX(CASE
        WHEN sp.eligible=1 AND sp.canonical_available=1 THEN 1 ELSE 0
      END) AS canonical_available,
      MAX(CASE
        WHEN sp.eligible=1
         AND (sp.canonical_available=1 OR sp.generated_available=1)
        THEN 1 ELSE 0
      END) AS generated_available
    FROM ${p}runtime_entity_pronunciation ep
    JOIN ${p}runtime_entity_name n
      ON n.name_id=ep.name_id
    JOIN ${p}pronunciation sp
      ON sp.pronunciation_id=ep.serving_pronunciation_id
    WHERE ep.product_pronunciation_id>?
      AND ep.product_pronunciation_id<=?
      AND sp.eligible=1
      AND (sp.canonical_available=1 OR sp.generated_available=1)
    GROUP BY n.entity_id
    ON CONFLICT(entity_id) DO UPDATE SET
      canonical_available=MAX(
        _dist_entity_availability.canonical_available,
        excluded.canonical_available
      ),
      generated_available=MAX(
        _dist_entity_availability.generated_available,
        excluded.generated_available
      )
  `);
  const updateState=db.prepare(`
    UPDATE _dist_entity_availability_state
    SET last_pronunciation_id=?,status=?
    WHERE singleton=1
  `);

  while(last<sourceMax){
    const upper=Math.min(sourceMax,last+safeChunk);
    const current=Math.ceil(upper/safeChunk);
    onProgress?.({
      phase:'selection',step:'entity_availability_chunk',status:'start',
      current,total:totalChunks,from:last+1,to:upper,
    });
    db.exec('BEGIN IMMEDIATE;');
    try{
      upsert.run(last,upper);
      updateState.run(upper,upper>=sourceMax?'complete':'building');
      db.exec('COMMIT;');
    }catch(error){
      try{db.exec('ROLLBACK;')}catch{}
      throw error;
    }
    last=upper;
    onProgress?.({
      phase:'selection',step:'entity_availability_chunk',status:'complete',
      current,total:totalChunks,last_pronunciation_id:last,
    });
  }

  const entities=scalar(db,'SELECT COUNT(*) c FROM _dist_entity_availability');
  onProgress?.({
    phase:'selection',step:'entity_availability',status:'complete',
    entities,last_pronunciation_id:last,source_max_pronunciation_id:sourceMax,
    current:totalChunks,total:totalChunks,
  });
  return entities;
}

export function populateDistributionSelection(db,{
  edition,
  alias='src',
  totalTarget:totalTargetOverride=null,
  entityPerCategory:entityPerCategoryOverride=null,
  onProgress=null,
}){
  const contract=editionContract(edition);
  const totalTarget=totalTargetOverride==null
    ?contract.totalTarget
    :Number(totalTargetOverride);
  const entityPerCategory=entityPerCategoryOverride==null
    ?contract.entityPerCategory
    :Number(entityPerCategoryOverride);
  const p=prefix(alias);
  createSelectionStorage(db);
  clearSelectionStorage(db);
  onProgress?.({phase:'selection',edition,status:'start'});

  if(contract.features.phrases){
    onProgress?.({phase:'selection',edition,step:'phrases',status:'start'});
    const phraseAvailability=contract.phraseMode==='core'
      ?'rp.canonical_available=1'
      :'(rp.canonical_available=1 OR rp.generated_available=1)';
    const windowAvailability=contract.phraseMode==='core'
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
    `);
    onProgress?.({
      phase:'selection',edition,step:'phrases',status:'complete',
      phrases:scalar(db,'SELECT COUNT(*) c FROM _dist_phrase'),
      windows:scalar(db,'SELECT COUNT(*) c FROM _dist_phrase_window'),
    });
  }

  if(contract.features.entities&&entityPerCategory>0){
    onProgress?.({phase:'selection',edition,step:'entities',status:'start'});
    const availabilityColumn=contract.mode==='core'
      ?'canonical_available'
      :'generated_available';
    const quota=Math.max(0,Math.trunc(entityPerCategory));

    ensureEntityAvailability(db,{
      alias,
      onProgress:(event)=>onProgress?.({...event,edition}),
    });

    onProgress?.({
      phase:'selection',edition,step:'entity_category_quota',status:'start',
      quota,availability:availabilityColumn,
    });
    db.exec(`
      WITH eligible AS (
        SELECT
          ec.entity_id,
          ec.category,
          ec.category_rank,
          ec.category_score,
          ROW_NUMBER() OVER(
            PARTITION BY ec.category
            ORDER BY
              CASE WHEN ec.category_rank IS NOT NULL AND ec.category_rank>0 THEN 0 ELSE 1 END,
              ec.category_rank ASC,
              ec.category_score DESC,
              ec.entity_id ASC
          ) AS edition_category_rank
        FROM ${p}runtime_entity_category ec
        JOIN _dist_entity_availability ea
          ON ea.entity_id=ec.entity_id
        WHERE ec.retained_by_category=1
          AND ea.${availabilityColumn}=1
      )
      INSERT OR IGNORE INTO _dist_entity_membership(
        entity_id,category,edition_category_rank,selection_source
      )
      SELECT entity_id,category,edition_category_rank,'edition_quota'
      FROM eligible
      WHERE edition_category_rank<=${quota};
    `);
    onProgress?.({
      phase:'selection',edition,step:'entity_category_quota',status:'complete',
      memberships:scalar(db,'SELECT COUNT(*) c FROM _dist_entity_membership'),
    });

    // Hard nesting rule: Full must contain every Standard Core Top-1k/category
    // membership. The availability cache makes this set-based and indexed.
    if(edition==='full'){
      const standardQuota=DISTRIBUTION_EDITIONS.standard.entityPerCategory;
      onProgress?.({
        phase:'selection',edition,step:'entity_standard_nesting',status:'start',
        quota:standardQuota,
      });
      db.exec(`
        WITH standard_eligible AS (
          SELECT
            ec.entity_id,
            ec.category,
            ROW_NUMBER() OVER(
              PARTITION BY ec.category
              ORDER BY
                CASE WHEN ec.category_rank IS NOT NULL AND ec.category_rank>0 THEN 0 ELSE 1 END,
                ec.category_rank ASC,
                ec.category_score DESC,
                ec.entity_id ASC
            ) AS standard_category_rank
          FROM ${p}runtime_entity_category ec
          JOIN _dist_entity_availability ea
            ON ea.entity_id=ec.entity_id
          WHERE ec.retained_by_category=1
            AND ea.canonical_available=1
        )
        INSERT OR IGNORE INTO _dist_entity_membership(
          entity_id,category,edition_category_rank,selection_source
        )
        SELECT entity_id,category,standard_category_rank,'standard_required'
        FROM standard_eligible
        WHERE standard_category_rank<=${Math.max(0,Math.trunc(standardQuota))};
      `);
      onProgress?.({
        phase:'selection',edition,step:'entity_standard_nesting',status:'complete',
        memberships:scalar(db,'SELECT COUNT(*) c FROM _dist_entity_membership'),
      });
    }

    db.exec(`
      INSERT OR IGNORE INTO _dist_entity(entity_id)
      SELECT DISTINCT entity_id FROM _dist_entity_membership;
    `);
    onProgress?.({
      phase:'selection',edition,step:'entity_pronunciation_closure',status:'start',
      entities:scalar(db,'SELECT COUNT(*) c FROM _dist_entity'),
    });

    const entityPronAvailability=contract.mode==='core'
      ?'sp.canonical_available=1'
      :'(sp.canonical_available=1 OR sp.generated_available=1)';
    db.exec(`
      INSERT OR IGNORE INTO _dist_entity_pronunciation(product_pronunciation_id)
      SELECT ep.product_pronunciation_id
      FROM ${p}runtime_entity_pronunciation ep
      JOIN ${p}runtime_entity_name n USING(name_id)
      JOIN _dist_entity de USING(entity_id)
      JOIN ${p}pronunciation sp
        ON sp.pronunciation_id=ep.serving_pronunciation_id
      WHERE sp.eligible=1 AND ${entityPronAvailability};

      INSERT OR IGNORE INTO _dist_entity_name(name_id)
      SELECT DISTINCT ep.name_id
      FROM ${p}runtime_entity_pronunciation ep
      JOIN _dist_entity_pronunciation dep USING(product_pronunciation_id);
    `);
    onProgress?.({
      phase:'selection',edition,step:'entity_pronunciation_closure',status:'complete',
      pronunciations:scalar(db,'SELECT COUNT(*) c FROM _dist_entity_pronunciation'),
      names:scalar(db,'SELECT COUNT(*) c FROM _dist_entity_name'),
    });
    onProgress?.({
      phase:'selection',edition,step:'entities',status:'complete',
      entities:scalar(db,'SELECT COUNT(*) c FROM _dist_entity'),
      memberships:scalar(db,'SELECT COUNT(*) c FROM _dist_entity_membership'),
      names:scalar(db,'SELECT COUNT(*) c FROM _dist_entity_name'),
    });
  }

  const phraseCount=scalar(db,'SELECT COUNT(*) c FROM _dist_phrase');
  const entityCount=scalar(db,'SELECT COUNT(*) c FROM _dist_entity');
  const wordTarget=totalTarget-phraseCount-entityCount;
  onProgress?.({
    phase:'selection',edition,step:'budget',status:'complete',
    totalTarget,phraseCount,entityCount,wordTarget,
  });
  if(wordTarget<=0){
    throw new Error(
      'Distribution non-word populations exceed total budget: '
      +JSON.stringify({edition,totalTarget,phraseCount,entityCount,wordTarget}),
    );
  }
  if(wordTarget<=Math.floor(totalTarget/2)){
    throw new Error(
      'Words must remain the majority of the edition budget: '
      +JSON.stringify({edition,totalTarget,phraseCount,entityCount,wordTarget}),
    );
  }

  // Word IDs are the first N rows of one canonical rank. Enforce monotonic
  // cut sizes so Lite Words ⊂ Standard Words ⊂ Full Words is guaranteed by ID.
  if(edition==='standard'&&wordTarget<DISTRIBUTION_EDITIONS.lite.totalTarget){
    throw new Error(
      'Standard Word cut would not contain all Lite Words: '
      +JSON.stringify({wordTarget,liteWords:DISTRIBUTION_EDITIONS.lite.totalTarget}),
    );
  }

  if(edition==='full'){
    const standardPhraseCount=scalar(db,`
      SELECT COUNT(*) c
      FROM ${p}runtime_phrase rp
      WHERE rp.canonical_available=1
    `);
    ensureEntityAvailability(db,{alias});
    const standardEntityCount=Number(db.prepare(`
      WITH eligible AS (
        SELECT
          ec.entity_id,
          ec.category,
          ROW_NUMBER() OVER(
            PARTITION BY ec.category
            ORDER BY
              CASE WHEN ec.category_rank IS NOT NULL AND ec.category_rank>0 THEN 0 ELSE 1 END,
              ec.category_rank ASC,
              ec.category_score DESC,
              ec.entity_id ASC
          ) AS standard_category_rank
        FROM ${p}runtime_entity_category ec
        JOIN _dist_entity_availability ea
          ON ea.entity_id=ec.entity_id
        WHERE ec.retained_by_category=1
          AND ea.canonical_available=1
      )
      SELECT COUNT(DISTINCT entity_id) c
      FROM eligible
      WHERE standard_category_rank<=?
    `).get(DISTRIBUTION_EDITIONS.standard.entityPerCategory)?.c||0);
    const standardWordTarget=
      DISTRIBUTION_EDITIONS.standard.totalTarget
      -standardPhraseCount
      -standardEntityCount;
    if(wordTarget<standardWordTarget){
      throw new Error(
        'Full Word cut would not contain all Standard Words: '
        +JSON.stringify({wordTarget,standardWordTarget}),
      );
    }
  }

  const coreAvailable=Number(db.prepare('SELECT COUNT(*) c FROM _dist_core_rank').get()?.c||0);
  if(coreAvailable<wordTarget){
    throw new Error('Core word population too small: '+coreAvailable+' < '+wordTarget);
  }

  onProgress?.({phase:'selection',edition,step:'words',status:'start',wordTarget});
  db.prepare(`
    INSERT INTO _dist_word_surface(surface_id,layer)
    SELECT surface_id,'core'
    FROM _dist_core_rank
    WHERE distribution_rank<=?
  `).run(wordTarget);
  onProgress?.({
    phase:'selection',edition,step:'words',status:'complete',
    words:scalar(db,"SELECT COUNT(*) c FROM _dist_word_surface WHERE layer='core'"),
  });

  onProgress?.({phase:'selection',edition,step:'pronunciation_closure',status:'start'});
  db.exec(`
    INSERT OR IGNORE INTO _dist_pronunciation(pronunciation_id,reason)
    SELECT p.pronunciation_id,'word_core'
    FROM ${p}pronunciation p
    JOIN _dist_word_surface ws ON ws.surface_id=p.surface_id
    WHERE p.eligible=1 AND p.canonical_available=1
      AND EXISTS(
        SELECT 1 FROM ${p}pronunciation_origin po
        WHERE po.pronunciation_id=p.pronunciation_id AND po.domain='word'
      );
  `);

  if(contract.features.generated){
    db.exec(`
      INSERT OR IGNORE INTO _dist_pronunciation(pronunciation_id,reason)
      SELECT p.pronunciation_id,'word_generated_closure_on_selected_core'
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
    db.exec(`
      INSERT OR IGNORE INTO _dist_pronunciation(pronunciation_id,reason)
      SELECT rp.pronunciation_id,'phrase'
      FROM ${p}runtime_phrase rp
      JOIN _dist_phrase dp USING(runtime_phrase_id);
    `);
  }

  if(contract.features.entities){
    db.exec(`
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

  onProgress?.({
    phase:'selection',edition,step:'pronunciation_closure',status:'complete',
    pronunciations:scalar(db,'SELECT COUNT(*) c FROM _dist_pronunciation'),
    surfaces:scalar(db,'SELECT COUNT(*) c FROM _dist_surface'),
  });

  onProgress?.({phase:'selection',edition,step:'runtime_closure',status:'start'});
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

  const summary=distributionSelectionSummary(db,{
    edition,
    alias,
    totalTarget,
    entityPerCategory,
  });
  onProgress?.({
    phase:'selection',edition,step:'runtime_closure',status:'complete',
    runtime_targets:summary.selected.runtime_targets,
    runtime_keys:summary.selected.runtime_keys,
    runtime_key_members:summary.selected.runtime_key_members,
  });
  onProgress?.({phase:'selection',edition,status:'complete',summary});
  return summary;
}

function scalar(db,sql){
  return Number(db.prepare(sql).get()?.c||0);
}

export function distributionSelectionSummary(db,{
  edition,
  alias='src',
  totalTarget=editionContract(edition).totalTarget,
  entityPerCategory=editionContract(edition).entityPerCategory,
}){
  const p=prefix(alias);
  const words=scalar(db,"SELECT COUNT(*) c FROM _dist_word_surface WHERE layer='core'");
  const phrases=scalar(db,'SELECT COUNT(*) c FROM _dist_phrase');
  const entities=scalar(db,'SELECT COUNT(*) c FROM _dist_entity');
  const categoryRows=entityPerCategory>0
    ?db.prepare(`
      SELECT
        category,
        COUNT(*) AS selected_memberships,
        MAX(edition_category_rank) AS last_rank,
        SUM(CASE WHEN selection_source='standard_required' THEN 1 ELSE 0 END) AS nesting_additions
      FROM _dist_entity_membership
      GROUP BY category
      ORDER BY category
    `).all().map((row)=>({
      category:String(row.category),
      selected_memberships:Number(row.selected_memberships||0),
      last_rank:Number(row.last_rank||0),
      nesting_additions:Number(row.nesting_additions||0),
    }))
    :[];
  return {
    edition,
    budget:{
      target:Number(totalTarget),
      entries:words+phrases+entities,
      words,
      phrases,
      entities,
      word_share:Number(totalTarget)>0?words/Number(totalTarget):0,
      entity_per_category:Number(entityPerCategory||0),
    },
    word_surfaces:{
      core:words,
      generated:0,
    },
    entity_categories:categoryRows,
    selected:{
      surfaces:scalar(db,'SELECT COUNT(*) c FROM _dist_surface'),
      pronunciations:scalar(db,'SELECT COUNT(*) c FROM _dist_pronunciation'),
      phrases,
      phrase_windows:scalar(db,'SELECT COUNT(*) c FROM _dist_phrase_window'),
      entities,
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
      runtime_entity_writer_anchor:`serving_pronunciation_id IN(
        SELECT ep.serving_pronunciation_id
        FROM src.runtime_entity_pronunciation ep
        JOIN _dist_entity_pronunciation dep USING(product_pronunciation_id)
      )`,
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

export function copyDistributionStage(db,stage,{alias='src',onProgress=null}={}){
  const p=prefix(alias);
  const entries=Object.entries(stage.tables);
  db.exec('BEGIN IMMEDIATE;');
  try{
    for(let index=0;index<entries.length;index+=1){
      const [table,where]=entries[index];
      const targetCount=table==='meta'?0:scalar(db,'SELECT COUNT(*) c FROM '+q(table));
      if(table!=='meta'&&targetCount>0){
        onProgress?.({
          phase:'copy',stage:stage.name,table,index:index+1,total:entries.length,
          status:'skip_existing',rows:targetCount,
        });
        continue;
      }
      onProgress?.({
        phase:'copy',stage:stage.name,table,index:index+1,total:entries.length,
        status:'start',
      });
      if(table==='meta'){
        db.exec(`INSERT OR IGNORE INTO meta SELECT * FROM ${p}meta WHERE ${where};`);
      }else{
        db.exec(`INSERT INTO ${q(table)} SELECT * FROM ${p}${q(table)} WHERE ${where};`);
      }
      const rows=table==='meta'?scalar(db,'SELECT COUNT(*) c FROM meta'):scalar(db,'SELECT COUNT(*) c FROM '+q(table));
      onProgress?.({
        phase:'copy',stage:stage.name,table,index:index+1,total:entries.length,
        status:'complete',rows,
      });
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
    distribution_total_target:String(contract.totalTarget),
    distribution_entity_per_category:String(contract.entityPerCategory),
    distribution_phrase_mode:String(contract.phraseMode),
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

export function distributionIntegrityReport(db,edition,{onProgress=null}={}){
  const contract=editionContract(edition);

  onProgress?.({step:'quick_check',status:'start'});
  const quick=db.prepare('PRAGMA quick_check').all();
  onProgress?.({
    step:'quick_check',
    status:'complete',
    rows:quick.length,
    result:quick.length===1?String(quick[0]?.quick_check||''):null,
  });

  onProgress?.({step:'foreign_key_check',status:'start'});
  const foreign=db.prepare('PRAGMA foreign_key_check').all();
  onProgress?.({
    step:'foreign_key_check',
    status:'complete',
    violations:foreign.length,
  });

  const counts={};
  onProgress?.({step:'count_phrases',status:'start'});
  counts.phrases=scalar(db,'SELECT COUNT(*) c FROM runtime_phrase');
  onProgress?.({step:'count_phrases',status:'complete',rows:counts.phrases});

  onProgress?.({step:'count_entities',status:'start'});
  counts.entities=scalar(db,'SELECT COUNT(*) c FROM runtime_entity_identity');
  onProgress?.({step:'count_entities',status:'complete',rows:counts.entities});

  onProgress?.({step:'count_generated_word_pronunciations',status:'start'});
  counts.generated_word_pronunciations=scalar(db,`
    SELECT COUNT(*) c
    FROM pronunciation p
    WHERE p.canonical_available=0 AND p.generated_available=1
      AND EXISTS(
        SELECT 1 FROM pronunciation_origin po
        WHERE po.pronunciation_id=p.pronunciation_id AND po.domain='word'
      )
  `);
  onProgress?.({
    step:'count_generated_word_pronunciations',
    status:'complete',
    rows:counts.generated_word_pronunciations,
  });

  const violations=[];
  if(quick.length!==1||String(quick[0]?.quick_check||'').toLowerCase()!=='ok')violations.push('quick_check');
  if(foreign.length)violations.push('foreign_key_check');
  if(!contract.features.phrases&&counts.phrases)violations.push('phrase_leakage');
  if(!contract.features.entities&&counts.entities)violations.push('entity_leakage');
  if(!contract.features.generated&&counts.generated_word_pronunciations)violations.push('generated_word_leakage');
  const report={
    ok:violations.length===0,
    violations,
    quick_check:quick,
    foreign_key_violations:foreign.length,
    counts,
  };
  onProgress?.({step:'integrity',status:'complete',ok:report.ok,violations});
  return report;
}

export function dropDistributionBuildStorage(db){
  for(const table of [
    '_dist_core_rank','_dist_generated_rank','_dist_word_surface','_dist_pronunciation',
    '_dist_surface','_dist_phrase','_dist_phrase_window','_dist_entity',
    '_dist_entity_availability','_dist_entity_availability_state',
    '_dist_entity_membership','_dist_entity_name',
    '_dist_entity_pronunciation','_dist_target','_dist_key',
    'distribution_build_stage',
  ]){
    db.exec('DROP TABLE IF EXISTS '+q(table)+';');
  }
}
