#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import {
  PHRASE_MOSAIC_GENERAL_COMMONNESS_CORPORA,
  classifyPhraseSurfaceSafety,
} from './phrase-mosaic-ranking-evidence-core.mjs';
import {
  SERVING_V1_RUNTIME_POLICY,
  SERVING_V1_RUNTIME_REVISION,
  SERVING_V1_RUNTIME_SCHEMA,
  createServingV1RuntimeStorage,
  servingV1RuntimeInvariantReport,
  servingV1RuntimeSummary,
} from './serving-v1-runtime-core.mjs';

const args=process.argv.slice(2);
const value=(flag,fallback=null)=>{
  const index=args.indexOf(flag);
  return index>=0?(args[index+1]||fallback):fallback;
};
const has=(flag)=>args.includes(flag);
const intArg=(flag,fallback,min,max)=>{
  const parsed=Number.parseInt(String(value(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(parsed)?parsed:fallback));
};

const mode=has('--plan')?'plan':has('--status')?'status':'build';
const batchSize=intArg('--batch-size',100000,1000,500000);
const progressEvery=intArg('--progress-every',1,1,10000);
const reset=has('--reset');
const replace=has('--replace');
const pauseAfterStage=value('--pause-after-stage',null);

const servingPath=resolve(value('--serving','data/local/rhymelab-serving-v1.sqlite'));
const workPath=resolve(value('--work','data/local/rhymelab-serving-v1.runtime-building.sqlite'));
const copyStatePath=resolve(value('--copy-state',workPath+'.copy-state.json'));
const reportPath=resolve(value('--report','data/local/rhymelab-serving-v1-runtime-report.json'));
const backupPath=resolve(value('--backup','data/local/rhymelab-serving-v1.pre-runtime.sqlite'));

const now=()=>new Date().toISOString();
const sha256=(input)=>createHash('sha256').update(String(input)).digest('hex');
const sqlQuote=(input)=>"'"+String(input).replaceAll("'","''")+"'";
const scalar=(db,sql)=>Number(db.prepare(sql).get()?.c||0);
const formatCount=(v)=>Number(v||0).toLocaleString('en-US');
const formatDuration=(ms)=>{
  if(!Number.isFinite(ms)||ms<0)return '—';
  if(ms<1000)return Math.round(ms)+'ms';
  const seconds=Math.round(ms/1000);
  if(seconds<60)return seconds+'s';
  const minutes=Math.floor(seconds/60);
  if(minutes<60)return minutes+'m '+String(seconds%60).padStart(2,'0')+'s';
  return Math.floor(minutes/60)+'h '+String(minutes%60).padStart(2,'0')+'m';
};

let stopRequested=false;
for(const signal of ['SIGINT','SIGTERM']){
  process.on(signal,()=>{
    if(stopRequested)return;
    stopRequested=true;
    process.exitCode=130;
    console.error('\n[serving-v1-runtime] '+signal+' received; current transaction will finish or roll back, then pause.');
  });
}

function metaObject(db){
  return Object.fromEntries(db.prepare('SELECT key,value FROM meta ORDER BY key').all().map((row)=>[row.key,row.value]));
}

function databaseMeta(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    try{return metaObject(db);}catch{return {};}
  }finally{db.close();}
}

async function currentFileState(path){
  const info=await stat(path);
  return {
    path:resolve(path),
    bytes:Number(info.size),
    mtime_ms:Math.trunc(Number(info.mtimeMs)),
    meta:databaseMeta(path),
  };
}

function equalJson(a,b){
  return JSON.stringify(a)===JSON.stringify(b);
}

async function validateSourceSnapshot(snapshot){
  const actual={};
  for(const [key,expected] of Object.entries(snapshot?.inputs||{})){
    const path=resolve(expected.path);
    if(!existsSync(path))throw new Error('Serving-v1 source input missing: '+path);
    const state=await currentFileState(path);
    actual[key]=state;
    if(state.bytes!==Number(expected.bytes)
      ||state.mtime_ms!==Number(expected.mtime_ms)
      ||!equalJson(state.meta,expected.meta||{})){
      throw new Error(
        'Serving-v1 source input changed since identity build: '+key+
        '. Rebuild Serving v1 identity first; runtime materialization refuses mixed source revisions.'
      );
    }
  }
  return actual;
}

function readServingContract(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    const meta=metaObject(db);
    if(meta.schema!=='rhymelab-serving-v1')throw new Error('Unexpected Serving-v1 schema: '+String(meta.schema||'missing'));
    if(meta.status!=='complete')throw new Error('Serving-v1 identity database is not complete.');
    if(!/^[a-f0-9]{64}$/u.test(String(meta.semantic_fingerprint||''))){
      throw new Error('Serving-v1 semantic fingerprint missing/invalid.');
    }
    let sourceSnapshot;
    try{sourceSnapshot=JSON.parse(meta.source_snapshot_json||'null');}
    catch{sourceSnapshot=null;}
    if(!sourceSnapshot?.inputs)throw new Error('Serving-v1 source snapshot missing.');
    return {meta,sourceSnapshot};
  }finally{db.close();}
}

async function copyBaseResumable(source,target,statePath,semanticFingerprint){
  const sourceInfo=await stat(source);
  const expected={
    schema:'rhymelab-serving-v1-runtime-copy-v1',
    source:resolve(source),
    source_bytes:Number(sourceInfo.size),
    source_mtime_ms:Math.trunc(Number(sourceInfo.mtimeMs)),
    serving_semantic_fingerprint:String(semanticFingerprint),
  };
  let state=null;
  if(existsSync(statePath)){
    try{state=JSON.parse(await readFile(statePath,'utf8'));}catch{}
    if(!state||!equalJson(state,expected)){
      throw new Error('Runtime-copy checkpoint does not match the current Serving-v1 source. Use --reset.');
    }
  }else if(existsSync(target)){
    // A valid SQLite work DB is handled by the caller. A raw partial copy without state is unsafe.
    return;
  }else{
    await writeFile(statePath,JSON.stringify(expected,null,2)+'\n','utf8');
    state=expected;
  }

  if(!state)return;
  const targetBytes=existsSync(target)?Number((await stat(target)).size):0;
  if(targetBytes>expected.source_bytes)throw new Error('Runtime work copy is larger than source; use --reset.');
  if(targetBytes===expected.source_bytes){
    await rm(statePath,{force:true});
    return;
  }

  const sourceHandle=await open(source,'r');
  const targetHandle=await open(target,targetBytes?'a':'w');
  const buffer=Buffer.allocUnsafe(8*1024*1024);
  let offset=targetBytes;
  let lastPrinted=offset;
  const started=performance.now();
  try{
    console.log('[serving-v1-runtime] copying base · '+formatCount(offset)+'/'+formatCount(expected.source_bytes)+' bytes resumed');
    while(offset<expected.source_bytes){
      const length=Math.min(buffer.length,expected.source_bytes-offset);
      const {bytesRead}=await sourceHandle.read(buffer,0,length,offset);
      if(!bytesRead)break;
      await targetHandle.write(buffer,0,bytesRead);
      offset+=bytesRead;
      if(offset-lastPrinted>=256*1024*1024||offset===expected.source_bytes){
        const elapsed=performance.now()-started;
        const advanced=offset-targetBytes;
        const bytesPerSecond=elapsed>0?advanced/(elapsed/1000):0;
        const remaining=expected.source_bytes-offset;
        const eta=bytesPerSecond>0?(remaining/bytesPerSecond)*1000:NaN;
        console.log(
          '[serving-v1-runtime] copy '+(100*offset/expected.source_bytes).toFixed(1)+'% · '+
          formatCount(offset)+'/'+formatCount(expected.source_bytes)+' bytes · '+
          formatCount(Math.round(bytesPerSecond/1024/1024))+' MiB/s · ETA '+formatDuration(eta)
        );
        lastPrinted=offset;
      }
      if(stopRequested)break;
    }
    await targetHandle.sync();
  }finally{
    await sourceHandle.close();
    await targetHandle.close();
  }
  if(stopRequested){
    console.error('[serving-v1-runtime] copy paused safely; rerun the same command to resume.');
    return;
  }
  if(offset!==expected.source_bytes)throw new Error('Serving-v1 base copy ended before source EOF.');
  await rm(statePath,{force:true});
}

function openWork(path){
  const db=new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA temp_store=MEMORY;
    PRAGMA cache_size=-262144;
    PRAGMA mmap_size=1073741824;
    PRAGMA busy_timeout=5000;
  `);
  createServingV1RuntimeStorage(db);
  return db;
}

function upsertMeta(db,key,val){
  db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key,String(val));
}

function attach(db,path){
  db.exec('ATTACH DATABASE '+sqlQuote(path)+' AS src;');
}
function detach(db){
  db.exec('DETACH DATABASE src;');
}

function stageState(db,name){
  return db.prepare('SELECT * FROM runtime_build_stage WHERE stage=?').get(name)||null;
}

function keyStatements(selectSql){
  return [
    `
      INSERT OR IGNORE INTO runtime_key(language,channel,key_value)
      SELECT DISTINCT language,channel,key_value
      FROM (${selectSql}) candidate_keys
      WHERE key_value IS NOT NULL AND key_value<>''
    `,
    `
      INSERT OR IGNORE INTO runtime_key_member(key_id,target_id)
      SELECT k.key_id,candidate_keys.target_id
      FROM (${selectSql}) candidate_keys
      JOIN runtime_key k
        ON k.language=candidate_keys.language
       AND k.channel=candidate_keys.channel
       AND k.key_value=candidate_keys.key_value
      WHERE candidate_keys.key_value IS NOT NULL AND candidate_keys.key_value<>''
    `,
  ];
}

function deKeyStage(name,label,path,generated){
  const marker=generated?" AND h.pronunciation_flags LIKE '%secondary_opt_in%'":'';
  const availability=generated?'p.canonical_available=0 AND p.generated_available=1':'p.canonical_available=1';
  const filter=(last,upper)=>`h.id>${last} AND h.id<=${upper} AND h.pronunciation_eligible=1${marker}`;
  const select=(last,upper)=>`
    WITH mapped AS (
      SELECT
        h.id source_id,t.target_id,'de' language,
        h.exact_key,h.multisyllable_key,h.vowel_key,h.vowel_family,h.coda_key,h.coda_class
      FROM src.hot h
      JOIN surface s ON s.language='de' AND s.normalized=h.normalized
      JOIN pronunciation p
        ON p.surface_id=s.surface_id
       AND p.identity_key=(COALESCE(NULLIF(h.phonemes,''),h.ipa)||'|stress:'||COALESCE(h.stress,''))
      JOIN runtime_target t
        ON t.target_kind='pronunciation' AND t.pronunciation_id=p.pronunciation_id
      WHERE ${filter(last,upper)} AND ${availability}
    ),
    keys AS (
      SELECT language,'exact_tail' channel,exact_key key_value,target_id FROM mapped
      UNION ALL SELECT language,'multisyllable',multisyllable_key,target_id FROM mapped WHERE multisyllable_key IS NOT NULL
      UNION ALL SELECT language,'vowel',vowel_key,target_id FROM mapped
      UNION ALL SELECT language,'vowel_family',vowel_family,target_id FROM mapped
      UNION ALL SELECT language,'coda',coda_key,target_id FROM mapped WHERE coda_key IS NOT NULL
      UNION ALL SELECT language,'family_coda_class',vowel_family||char(31)||coda_class,target_id FROM mapped
      UNION ALL
      SELECT m.language,'writer_right_edge',wa.anchor_key,m.target_id
      FROM mapped m JOIN src.writer_anchor wa ON wa.pronunciation_id=m.source_id
    )
    SELECT language,channel,key_value,target_id FROM keys
  `;
  return {
    name,label,path,
    total(db){
      attach(db,path);
      try{return Number(db.prepare(`SELECT COUNT(*) c FROM src.hot h WHERE h.pronunciation_eligible=1${marker}`).get()?.c||0);}
      finally{detach(db);}
    },
    max(db){
      attach(db,path);
      try{return Number(db.prepare(`SELECT COALESCE(MAX(h.id),0) m FROM src.hot h WHERE h.pronunciation_eligible=1${marker}`).get()?.m||0);}
      finally{detach(db);}
    },
    rangeCount(db,last,upper){
      return Number(db.prepare(`SELECT COUNT(*) c FROM src.hot h WHERE ${filter(last,upper)}`).get()?.c||0);
    },
    run(db,last,upper){
      for(const sql of keyStatements(select(last,upper)))db.exec(sql);
    },
  };
}

function enKeyStage(name,label,path,generated){
  const marker=generated?" AND p.source='espeak_ng_generated_secondary'":'';
  const availability=generated?'sp.canonical_available=0 AND sp.generated_available=1':'sp.canonical_available=1';
  const filter=(last,upper)=>`
    p.id>${last} AND p.id<=${upper}
    AND p.analysis_status='ok'
    AND p.default_profile_eligible=1
    AND f.default_eligible=1
    ${marker}
  `;
  const select=(last,upper)=>`
    WITH mapped AS (
      SELECT
        t.target_id,'en' language,
        p.exact_key,p.multisyllable_key,p.vowel_key,p.vowel_family,p.coda_key,p.coda_class
      FROM src.en_pronunciation p
      JOIN src.en_form f ON f.id=p.form_id
      JOIN surface s ON s.language='en' AND s.normalized=f.normalized
      JOIN pronunciation sp
        ON sp.surface_id=s.surface_id
       AND sp.identity_key=(COALESCE(NULLIF(p.phonemes,''),p.raw)||'|stress:'||COALESCE(p.stress,''))
      JOIN runtime_target t
        ON t.target_kind='pronunciation' AND t.pronunciation_id=sp.pronunciation_id
      WHERE ${filter(last,upper)} AND ${availability}
    )
    SELECT language,'exact_tail' channel,exact_key key_value,target_id FROM mapped
    UNION ALL SELECT language,'multisyllable',multisyllable_key,target_id FROM mapped WHERE multisyllable_key IS NOT NULL
    UNION ALL SELECT language,'vowel',vowel_key,target_id FROM mapped
    UNION ALL SELECT language,'family_coda_class',vowel_family||char(31)||coda_class,target_id FROM mapped
    UNION ALL SELECT language,'coda',coda_key,target_id FROM mapped WHERE coda_key IS NOT NULL
  `;
  return {
    name,label,path,
    total(db){
      attach(db,path);
      try{return Number(db.prepare(`
        SELECT COUNT(*) c FROM src.en_pronunciation p JOIN src.en_form f ON f.id=p.form_id
        WHERE p.analysis_status='ok' AND p.default_profile_eligible=1 AND f.default_eligible=1 ${marker}
      `).get()?.c||0);}
      finally{detach(db);}
    },
    max(db){
      attach(db,path);
      try{return Number(db.prepare(`
        SELECT COALESCE(MAX(p.id),0) m FROM src.en_pronunciation p JOIN src.en_form f ON f.id=p.form_id
        WHERE p.analysis_status='ok' AND p.default_profile_eligible=1 AND f.default_eligible=1 ${marker}
      `).get()?.m||0);}
      finally{detach(db);}
    },
    rangeCount(db,last,upper){
      return Number(db.prepare(`
        SELECT COUNT(*) c FROM src.en_pronunciation p JOIN src.en_form f ON f.id=p.form_id
        WHERE ${filter(last,upper)}
      `).get()?.c||0);
    },
    run(db,last,upper){
      for(const sql of keyStatements(select(last,upper)))db.exec(sql);
    },
  };
}

function entityKeyStage(name,label,path,generated){
  const marker=generated?" AND ep.source_kind='espeak_ng_generated_secondary'":'';
  const availability=generated?'sp.canonical_available=0 AND sp.generated_available=1':'sp.canonical_available=1';
  const filter=(last,upper)=>`
    ep.pronunciation_id>${last} AND ep.pronunciation_id<=${upper}
    AND en.searchable=1
    AND en.language IN ('de','en')
    AND ep.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
    AND (
      (en.language='de' AND ep.locale='de-DE')
      OR (en.language='en' AND ep.locale='en-US')
    )
    ${marker}
  `;
  const select=(last,upper)=>`
    WITH source_rows AS (
      SELECT
        ep.pronunciation_id source_id,en.language,en.normalized,
        (COALESCE(NULLIF(MIN(epa.phonemes),''),ep.ipa)||'|stress:'||COALESCE(MIN(epa.stress_pattern),'')) identity_key
      FROM src.entity_pronunciation ep
      JOIN src.entity_name en ON en.name_id=ep.name_id
      LEFT JOIN src.entity_phonetic_analysis epa ON epa.pronunciation_id=ep.pronunciation_id
      WHERE ${filter(last,upper)}
      GROUP BY ep.pronunciation_id
    ),
    mapped AS (
      SELECT r.source_id,r.language,t.target_id
      FROM source_rows r
      JOIN surface s ON s.language=r.language AND s.normalized=r.normalized
      JOIN pronunciation sp ON sp.surface_id=s.surface_id AND sp.identity_key=r.identity_key
      JOIN runtime_target t ON t.target_kind='pronunciation' AND t.pronunciation_id=sp.pronunciation_id
      WHERE ${availability}
    )
    SELECT
      m.language,
      CASE
        WHEN a.channel='exact_tail' THEN 'entity_exact_tail'
        WHEN a.channel='vowel_sequence' THEN 'entity_vowel_sequence'
        WHEN a.channel='vowel_family' THEN 'entity_vowel_family'
        WHEN a.channel='final_nucleus_coda' THEN 'entity_final_nucleus_coda'
        WHEN a.channel='final_nucleus' THEN 'entity_final_nucleus'
        WHEN a.channel LIKE 'writer_%' THEN 'entity_writer_right_edge'
        ELSE 'entity_'||a.channel
      END channel,
      a.anchor_key key_value,
      m.target_id
    FROM mapped m
    JOIN src.entity_rhyme_anchor a
      ON a.pronunciation_id=m.source_id
     AND a.analyzer_id=CASE m.language
       WHEN 'en' THEN 'en-pron-v1-candidate'
       ELSE 'de-ipa-v2'
     END
  `;
  return {
    name,label,path,
    total(db){
      attach(db,path);
      try{return Number(db.prepare(`
        SELECT COUNT(*) c
        FROM src.entity_pronunciation ep
        JOIN src.entity_name en ON en.name_id=ep.name_id
        WHERE en.searchable=1
          AND en.language IN ('de','en')
          AND ep.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
          AND (
            (en.language='de' AND ep.locale='de-DE')
            OR (en.language='en' AND ep.locale='en-US')
          )
          ${marker}
      `).get()?.c||0);}
      finally{detach(db);}
    },
    max(db){
      attach(db,path);
      try{return Number(db.prepare(`
        SELECT COALESCE(MAX(ep.pronunciation_id),0) m
        FROM src.entity_pronunciation ep
        JOIN src.entity_name en ON en.name_id=ep.name_id
        WHERE en.searchable=1
          AND en.language IN ('de','en')
          AND ep.review_state IN ('accepted','reviewed','accepted_source_composition','accepted_source_backed')
          AND (
            (en.language='de' AND ep.locale='de-DE')
            OR (en.language='en' AND ep.locale='en-US')
          )
          ${marker}
      `).get()?.m||0);}
      finally{detach(db);}
    },
    rangeCount(db,last,upper){
      return Number(db.prepare(`
        SELECT COUNT(*) c
        FROM src.entity_pronunciation ep
        JOIN src.entity_name en ON en.name_id=ep.name_id
        WHERE ${filter(last,upper)}
      `).get()?.c||0);
    },
    run(db,last,upper){
      for(const sql of keyStatements(select(last,upper)))db.exec(sql);
    },
  };
}

function phraseStage(name,label,path,generated){
  const layer=generated?'generated':'core';
  const marker=generated
    ?" AND EXISTS(SELECT 1 FROM src.phrase_pronunciation_token ppt WHERE ppt.phrase_pronunciation_id=pp.phrase_pronunciation_id AND ppt.pronunciation_source='eSpeak-NG Backfill V2')"
    :'';
  const availability=generated?'sp.canonical_available=0 AND sp.generated_available=1':'sp.canonical_available=1';
  const filter=(last,upper)=>`pp.rowid>${last} AND pp.rowid<=${upper} AND pp.eligible=1${marker}`;
  const mapped=(last,upper)=>`
    SELECT
      pp.rowid source_id,pp.phrase_pronunciation_id,pp.phrase_id,
      p.normalized,p.canonical,p.phrase_types_json,p.historical_state,p.modern_eligible,
      s.surface_id,sp.pronunciation_id,sp.canonical_available,sp.generated_available
    FROM src.phrase_pronunciation pp
    JOIN src.phrase p ON p.phrase_id=pp.phrase_id
    JOIN surface s ON s.language='de' AND s.normalized=p.normalized
    JOIN pronunciation sp
      ON sp.surface_id=s.surface_id
     AND sp.identity_key=(COALESCE(NULLIF(pp.canonical_phonemes,''),pp.ipa)||'|stress:'||COALESCE(pp.stress_pattern,''))
    WHERE ${filter(last,upper)} AND ${availability}
  `;
  return {
    name,label,path,
    total(db){
      attach(db,path);
      try{return Number(db.prepare(`SELECT COUNT(*) c FROM src.phrase_pronunciation pp WHERE pp.eligible=1${marker}`).get()?.c||0);}
      finally{detach(db);}
    },
    max(db){
      attach(db,path);
      try{return Number(db.prepare(`SELECT COALESCE(MAX(pp.rowid),0) m FROM src.phrase_pronunciation pp WHERE pp.eligible=1${marker}`).get()?.m||0);}
      finally{detach(db);}
    },
    rangeCount(db,last,upper){
      return Number(db.prepare(`SELECT COUNT(*) c FROM src.phrase_pronunciation pp WHERE ${filter(last,upper)}`).get()?.c||0);
    },
    run(db,last,upper){
      const rows=mapped(last,upper);
      db.exec(`
        INSERT OR IGNORE INTO runtime_phrase(
          source_layer,source_phrase_id,source_phrase_pronunciation_id,source_surface,
          surface_id,pronunciation_id,canonical_available,generated_available,
          phrase_types_json,historical_state,modern_eligible
        )
        SELECT
          '${layer}',r.phrase_id,r.phrase_pronunciation_id,r.canonical,
          r.surface_id,r.pronunciation_id,r.canonical_available,r.generated_available,
          r.phrase_types_json,r.historical_state,r.modern_eligible
        FROM (${rows}) r;
      `);

      db.exec(`
        INSERT OR IGNORE INTO runtime_phrase_usage(
          runtime_phrase_id,snapshot_label,occurrence_count,sentence_count,
          per_million_tokens,per_million_sentences
        )
        SELECT
          rp.runtime_phrase_id,snap.snapshot_label,u.occurrence_count,u.sentence_count,
          u.per_million_tokens,u.per_million_sentences
        FROM (${rows}) r
        JOIN runtime_phrase rp
          ON rp.source_layer='${layer}'
         AND rp.source_phrase_pronunciation_id=r.phrase_pronunciation_id
        JOIN src.phrase_usage_evidence u ON u.phrase_id=r.phrase_id
        JOIN src.phrase_snapshot snap ON snap.snapshot_id=u.snapshot_id
        WHERE u.policy='leipzig-exact-token-sequence-v1'
          AND snap.snapshot_label IN ('deu_news_2024_1M','deu_wikipedia_2021_1M','deu-de_web_2021_1M');
      `);

      db.exec(`
        INSERT OR IGNORE INTO runtime_phrase_attestation(runtime_phrase_id,ordinal,style_tags_json)
        SELECT runtime_phrase_id,ordinal,style_tags_json FROM (
          SELECT
            rp.runtime_phrase_id,
            ROW_NUMBER() OVER(PARTITION BY rp.runtime_phrase_id ORDER BY a.attestation_id) ordinal,
            a.style_tags_json
          FROM (${rows}) r
          JOIN runtime_phrase rp
            ON rp.source_layer='${layer}'
           AND rp.source_phrase_pronunciation_id=r.phrase_pronunciation_id
          JOIN src.phrase_attestation a ON a.phrase_id=r.phrase_id
        );
      `);

      db.exec(`
        INSERT OR IGNORE INTO runtime_phrase_window(
          runtime_window_id,runtime_phrase_id,source_window_id,
          syllable_start,syllable_end,syllable_count,
          phoneme_start,phoneme_end,phoneme_count,
          token_start_index,token_end_index,token_count,crossed_word_boundaries,
          starts_inside_token,ends_inside_token,phoneme_key,vowel_key,stress_pattern,final_coda_key,
          exact_tail_key,final_nucleus,final_coda_class,vowel_family_key,
          canonical_available,generated_available
        )
        SELECT
          '${layer}:'||w.window_id,rp.runtime_phrase_id,w.window_id,
          w.syllable_start,w.syllable_end,w.syllable_count,
          w.phoneme_start,w.phoneme_end,w.phoneme_count,
          w.token_start_index,w.token_end_index,w.token_count,w.crossed_word_boundaries,
          w.starts_inside_token,w.ends_inside_token,w.phoneme_key,w.vowel_key,w.stress_pattern,w.final_coda_key,
          a.exact_tail_key,a.final_nucleus,a.final_coda_class,v2.vowel_family_key,
          rp.canonical_available,rp.generated_available
        FROM (${rows}) r
        JOIN runtime_phrase rp
          ON rp.source_layer='${layer}'
         AND rp.source_phrase_pronunciation_id=r.phrase_pronunciation_id
        JOIN src.phrase_mosaic_window w
          ON w.phrase_pronunciation_id=r.phrase_pronunciation_id
        JOIN src.phrase_mosaic_retrieval_anchor a ON a.window_id=w.window_id
        LEFT JOIN src.phrase_mosaic_retrieval_v2_anchor v2 ON v2.window_id=w.window_id;
      `);

      db.exec(`
        INSERT OR IGNORE INTO runtime_target(
          target_kind,language,pronunciation_id,runtime_phrase_id,runtime_window_id,
          syllable_count,canonical_available,generated_available,canonical_preferred,generated_preferred
        )
        SELECT
          'phrase_window','de',rp.pronunciation_id,rp.runtime_phrase_id,w.runtime_window_id,
          w.syllable_count,w.canonical_available,w.generated_available,
          CASE WHEN w.canonical_available=1 THEN 1 ELSE 0 END,
          CASE WHEN w.canonical_available=0 AND w.generated_available=1 THEN 1 ELSE 0 END
        FROM runtime_phrase_window w
        JOIN runtime_phrase rp USING(runtime_phrase_id)
        WHERE rp.source_layer='${layer}'
          AND rp.source_phrase_pronunciation_id IN (
            SELECT phrase_pronunciation_id FROM (${rows})
          );
      `);

      const keySelect=`
        SELECT 'de' language,'phrase_exact_tail' channel,w.exact_tail_key key_value,t.target_id
        FROM runtime_phrase_window w
        JOIN runtime_target t ON t.runtime_window_id=w.runtime_window_id
        JOIN runtime_phrase rp USING(runtime_phrase_id)
        WHERE rp.source_layer='${layer}'
          AND rp.source_phrase_pronunciation_id IN (SELECT phrase_pronunciation_id FROM (${rows}))
        UNION ALL
        SELECT 'de','phrase_vowel_coda',w.vowel_key||char(31)||w.final_coda_key,t.target_id
        FROM runtime_phrase_window w
        JOIN runtime_target t ON t.runtime_window_id=w.runtime_window_id
        JOIN runtime_phrase rp USING(runtime_phrase_id)
        WHERE rp.source_layer='${layer}'
          AND rp.source_phrase_pronunciation_id IN (SELECT phrase_pronunciation_id FROM (${rows}))
        UNION ALL
        SELECT 'de','phrase_vowel',w.vowel_key,t.target_id
        FROM runtime_phrase_window w
        JOIN runtime_target t ON t.runtime_window_id=w.runtime_window_id
        JOIN runtime_phrase rp USING(runtime_phrase_id)
        WHERE rp.source_layer='${layer}'
          AND rp.source_phrase_pronunciation_id IN (SELECT phrase_pronunciation_id FROM (${rows}))
        UNION ALL
        SELECT 'de','phrase_vowel_family_coda_class',w.vowel_family_key||char(31)||w.final_coda_class,t.target_id
        FROM runtime_phrase_window w
        JOIN runtime_target t ON t.runtime_window_id=w.runtime_window_id
        JOIN runtime_phrase rp USING(runtime_phrase_id)
        WHERE w.vowel_family_key IS NOT NULL
          AND rp.source_layer='${layer}'
          AND rp.source_phrase_pronunciation_id IN (SELECT phrase_pronunciation_id FROM (${rows}))
        UNION ALL
        SELECT 'de','phrase_final_nucleus_coda_class',w.final_nucleus||char(31)||w.final_coda_class,t.target_id
        FROM runtime_phrase_window w
        JOIN runtime_target t ON t.runtime_window_id=w.runtime_window_id
        JOIN runtime_phrase rp USING(runtime_phrase_id)
        WHERE rp.source_layer='${layer}'
          AND rp.source_phrase_pronunciation_id IN (SELECT phrase_pronunciation_id FROM (${rows}))
      `;
      for(const sql of keyStatements(keySelect))db.exec(sql);
    },
  };
}

function morphologyStage(path){
  const name='10_de_morphology';
  return {
    name,label:'DE precomputed morphology',path,
    total(db){
      return scalar(db,`
        SELECT COUNT(*) c
        FROM surface s
        JOIN surface_role r USING(surface_id)
        WHERE s.language='de' AND r.role='lexical' AND r.canonical_available=1
      `);
    },
    max(db){
      return scalar(db,`
        SELECT COALESCE(MAX(s.surface_id),0) c
        FROM surface s
        JOIN surface_role r USING(surface_id)
        WHERE s.language='de' AND r.role='lexical' AND r.canonical_available=1
      `);
    },
    rangeCount(db,last,upper){
      return scalar(db,`
        SELECT COUNT(*) c
        FROM surface s
        JOIN surface_role r USING(surface_id)
        WHERE s.surface_id>${last} AND s.surface_id<=${upper}
          AND s.language='de' AND r.role='lexical' AND r.canonical_available=1
      `);
    },
    run(db,last,upper){
      db.exec(`
        WITH candidate_forms AS (
          SELECT
            s.surface_id,h.publish_order form_id,
            ROW_NUMBER() OVER(
              PARTITION BY s.surface_id
              ORDER BY h.historical,h.usage_rank IS NULL,h.usage_rank,h.id
            ) rn
          FROM surface s
          JOIN surface_role sr ON sr.surface_id=s.surface_id AND sr.role='lexical' AND sr.canonical_available=1
          JOIN src.hot h ON h.normalized=s.normalized AND h.pronunciation_preferred=1
          WHERE s.surface_id>${last} AND s.surface_id<=${upper} AND s.language='de'
        ),
        chosen AS (
          SELECT surface_id,form_id FROM candidate_forms WHERE rn=1
        ),
        analysis_counts AS (
          SELECT c.surface_id,COUNT(fa.analysis_key) analysis_count
          FROM chosen c
          LEFT JOIN src.form_analysis fa ON fa.form_id=c.form_id
          GROUP BY c.surface_id
        ),
        evidence AS (
          SELECT
            c.surface_id,
            COUNT(e.analysis_key) stored_positive_count,
            COUNT(DISTINCT e.family_key) supported_family_count,
            MIN(e.family_key) family_key,
            COUNT(DISTINCT COALESCE(e.construction_rule,'<null>')) rule_count,
            MAX(e.construction_rule) construction_rule
          FROM chosen c
          LEFT JOIN src.writer_morphology_evidence e ON e.form_id=c.form_id
          GROUP BY c.surface_id
        )
        INSERT OR REPLACE INTO runtime_surface_morphology(
          surface_id,policy,status,family_key,construction_rule,
          analysis_count,stored_positive_count,supported_family_count
        )
        SELECT
          c.surface_id,'de-attested-right-head-v4',
          CASE
            WHEN COALESCE(e.supported_family_count,0)=0 THEN 'unresolved'
            WHEN e.supported_family_count=1 THEN 'attested_right_head_candidate'
            ELSE 'ambiguous_conflict'
          END,
          CASE WHEN e.supported_family_count=1 THEN e.family_key ELSE NULL END,
          CASE WHEN e.supported_family_count=1 AND e.rule_count=1 THEN e.construction_rule ELSE NULL END,
          COALESCE(a.analysis_count,0),
          COALESCE(e.stored_positive_count,0),
          COALESCE(e.supported_family_count,0)
        FROM chosen c
        LEFT JOIN analysis_counts a USING(surface_id)
        LEFT JOIN evidence e USING(surface_id);
      `);
    },
  };
}

function phraseEvidenceStage(){
  return {
    name:'11_phrase_evidence',
    label:'Phrase ranking evidence',
    path:null,
    total(db){return scalar(db,'SELECT COUNT(*) c FROM runtime_phrase');},
    max(db){return scalar(db,'SELECT COALESCE(MAX(runtime_phrase_id),0) c FROM runtime_phrase');},
    rangeCount(db,last,upper){
      return scalar(db,`SELECT COUNT(*) c FROM runtime_phrase WHERE runtime_phrase_id>${last} AND runtime_phrase_id<=${upper}`);
    },
    run(db,last,upper){
      const phrases=db.prepare(`
        SELECT rp.*
        FROM runtime_phrase rp
        WHERE rp.runtime_phrase_id>? AND rp.runtime_phrase_id<=?
        ORDER BY rp.runtime_phrase_id
      `).all(last,upper);
      if(!phrases.length)return;
      const usageRows=db.prepare(`
        SELECT * FROM runtime_phrase_usage
        WHERE runtime_phrase_id>? AND runtime_phrase_id<=?
        ORDER BY runtime_phrase_id,snapshot_label
      `).all(last,upper);
      const attestationRows=db.prepare(`
        SELECT * FROM runtime_phrase_attestation
        WHERE runtime_phrase_id>? AND runtime_phrase_id<=?
        ORDER BY runtime_phrase_id,ordinal
      `).all(last,upper);
      const usageBy=new Map();
      for(const row of usageRows){
        const id=Number(row.runtime_phrase_id);
        if(!usageBy.has(id))usageBy.set(id,[]);
        usageBy.get(id).push(row);
      }
      const attestationBy=new Map();
      for(const row of attestationRows){
        const id=Number(row.runtime_phrase_id);
        if(!attestationBy.has(id))attestationBy.set(id,[]);
        attestationBy.get(id).push(row);
      }
      const update=db.prepare(`
        UPDATE runtime_phrase
        SET commonness_score=?,commonness_corpus_count=?,
            commonness_occurrence_sum=?,commonness_sentence_sum=?,
            style_tags_json=?,surface_safety_class=?,surface_safety_reasons_json=?,
            evidence_ready=1
        WHERE runtime_phrase_id=?
      `);
      for(const phrase of phrases){
        const byCorpus=new Map((usageBy.get(Number(phrase.runtime_phrase_id))||[]).map((row)=>[String(row.snapshot_label),row]));
        let corpusCount=0;
        let occurrenceSum=0;
        let sentenceSum=0;
        let logRateSum=0;
        for(const corpus of PHRASE_MOSAIC_GENERAL_COMMONNESS_CORPORA){
          const row=byCorpus.get(corpus);
          if(row)corpusCount+=1;
          occurrenceSum+=Number(row?.occurrence_count||0);
          sentenceSum+=Number(row?.sentence_count||0);
          logRateSum+=Math.log1p(Math.max(0,Number(row?.per_million_sentences||0)));
        }
        const commonness=Number((logRateSum/PHRASE_MOSAIC_GENERAL_COMMONNESS_CORPORA.length).toFixed(6));
        const tags=new Set();
        for(const row of attestationBy.get(Number(phrase.runtime_phrase_id))||[]){
          try{
            const parsed=JSON.parse(row.style_tags_json||'[]');
            if(Array.isArray(parsed))for(const tag of parsed)if(String(tag||''))tags.add(String(tag));
          }catch{}
        }
        const styleTags=[...tags].sort((a,b)=>a.localeCompare(b,'de'));
        const safety=classifyPhraseSurfaceSafety(phrase.source_surface,{
          historicalState:phrase.historical_state,
          modernEligible:Boolean(phrase.modern_eligible),
        });
        update.run(
          commonness,corpusCount,occurrenceSum,sentenceSum,
          JSON.stringify(styleTags),safety.class,JSON.stringify(safety.reasons),
          Number(phrase.runtime_phrase_id),
        );
      }
    },
  };
}

function pronunciationTargetStage(){
  return {
    name:'01_pronunciation_targets',
    label:'Serving pronunciation targets',
    path:null,
    total(db){return scalar(db,'SELECT COUNT(*) c FROM pronunciation WHERE eligible=1');},
    max(db){return scalar(db,'SELECT COALESCE(MAX(pronunciation_id),0) c FROM pronunciation WHERE eligible=1');},
    rangeCount(db,last,upper){
      return scalar(db,`SELECT COUNT(*) c FROM pronunciation WHERE pronunciation_id>${last} AND pronunciation_id<=${upper} AND eligible=1`);
    },
    run(db,last,upper){
      db.exec(`
        INSERT OR IGNORE INTO runtime_target(
          target_id,target_kind,language,pronunciation_id,runtime_phrase_id,runtime_window_id,
          syllable_count,canonical_available,generated_available,
          canonical_preferred,generated_preferred
        )
        SELECT
          p.pronunciation_id,'pronunciation',s.language,p.pronunciation_id,NULL,NULL,
          p.syllable_count,p.canonical_available,p.generated_available,
          p.canonical_preferred,p.generated_preferred
        FROM pronunciation p
        JOIN surface s USING(surface_id)
        WHERE p.pronunciation_id>${last} AND p.pronunciation_id<=${upper} AND p.eligible=1;
      `);
    },
  };
}

async function prepareContext(){
  if(!existsSync(servingPath))throw new Error('Serving-v1 identity DB missing: '+servingPath);
  const contract=readServingContract(servingPath);
  if(contract.meta.runtime_schema===SERVING_V1_RUNTIME_SCHEMA
    &&contract.meta.runtime_status==='complete'
    &&!replace){
    return {contract,alreadyComplete:true};
  }
  const actualSources=await validateSourceSnapshot(contract.sourceSnapshot);
  const paths=Object.fromEntries(Object.entries(actualSources).map(([key,row])=>[key,row.path]));
  const runtimeSourceFingerprint=sha256(JSON.stringify({
    serving_semantic_fingerprint:contract.meta.semantic_fingerprint,
    serving_source_fingerprint:contract.meta.source_fingerprint,
    runtime_revision:SERVING_V1_RUNTIME_REVISION,
    inputs:actualSources,
  }));
  return {contract,paths,actualSources,runtimeSourceFingerprint,alreadyComplete:false};
}

function stageDefinitions(paths){
  return [
    pronunciationTargetStage(),
    deKeyStage('02_de_core_keys','DE Core retrieval keys',paths.deCore,false),
    deKeyStage('03_de_generated_keys','DE Generated retrieval keys',paths.deGenerated,true),
    enKeyStage('04_en_core_keys','EN Core retrieval keys',paths.enCore,false),
    enKeyStage('05_en_generated_keys','EN Generated retrieval keys',paths.enGenerated,true),
    entityKeyStage('06_entity_core_keys','Core Entity retrieval keys',paths.entityCore,false),
    entityKeyStage('07_entity_generated_keys','Generated Entity retrieval keys',paths.entityGenerated,true),
    phraseStage('08_phrase_core_runtime','Core Phrase/Mosaic runtime',paths.phraseCore,false),
    phraseStage('09_phrase_generated_runtime','Generated Phrase/Mosaic runtime',paths.phraseGenerated,true),
    morphologyStage(paths.deCore),
    phraseEvidenceStage(),
  ];
}

async function planFor(db,stages){
  const rows=[];
  for(const stage of stages){
    rows.push({
      stage:stage.name,
      label:stage.label,
      source_rows:stage.total(db),
      max_source_id:stage.max(db),
      source:stage.path||'serving-v1',
    });
  }
  return rows;
}

async function main(){
  if(reset){
    for(const path of [workPath,workPath+'-wal',workPath+'-shm',copyStatePath]){
      await rm(path,{force:true});
    }
    console.log('[serving-v1-runtime] reset incomplete runtime work only; promoted Serving-v1 DB was preserved.');
  }

  const context=await prepareContext();
  if(context.alreadyComplete){
    console.log(JSON.stringify({
      schema:SERVING_V1_RUNTIME_SCHEMA,
      status:'already_complete',
      serving:servingPath,
      semantic_fingerprint:context.contract.meta.runtime_semantic_fingerprint||null,
      message:'Use --replace only for an intentional rebuild of the runtime materialization.',
    },null,2));
    return;
  }

  if(mode==='plan'){
    const db=new DatabaseSync(servingPath,{readOnly:true});
    try{
      db.exec('PRAGMA query_only=ON;');
      const stages=stageDefinitions(context.paths);
      const plan=[];
      let phraseSourceRows=0;
      for(const stage of stages){
        if(stage.name==='11_phrase_evidence'){
          plan.push({
            stage:stage.name,
            label:stage.label,
            source_rows_estimate:phraseSourceRows,
            source:'serving-v1 runtime phrases after phrase stages',
          });
          continue;
        }
        const sourceRows=stage.total(db);
        if(stage.name==='08_phrase_core_runtime'||stage.name==='09_phrase_generated_runtime'){
          phraseSourceRows+=sourceRows;
        }
        plan.push({
          stage:stage.name,
          label:stage.label,
          source_rows:sourceRows,
          max_source_id:stage.max(db),
          source:stage.path||'serving-v1',
        });
      }
      console.log(JSON.stringify({
        schema:'rhymelab-serving-v1-runtime-plan',
        policy:SERVING_V1_RUNTIME_POLICY,
        revision:SERVING_V1_RUNTIME_REVISION,
        serving_semantic_fingerprint:context.contract.meta.semantic_fingerprint,
        runtime_source_fingerprint:context.runtimeSourceFingerprint,
        batch_size:batchSize,
        serving:servingPath,
        work:workPath,
        stages:plan,
        safety:{
          read_only_plan:true,
          current_runtime_rewired:false,
          source_databases_mutated:false,
          base_serving_preserved_until_success:true,
          resumable:true,
          atomic_promotion:true,
        },
      },null,2));
    }finally{db.close();}
    return;
  }

  if(mode==='status'){
    const candidate=existsSync(workPath)?workPath:servingPath;
    const db=new DatabaseSync(candidate,{readOnly:true});
    try{
      const meta=metaObject(db);
      const stages=existsSync(workPath)
        ?db.prepare('SELECT * FROM runtime_build_stage ORDER BY stage').all()
        :[];
      console.log(JSON.stringify({
        schema:'rhymelab-serving-v1-runtime-status',
        state:existsSync(workPath)?'building':'not_started',
        runtime_schema:meta.runtime_schema||null,
        runtime_status:meta.runtime_status||null,
        runtime_revision:meta.runtime_revision||null,
        stages,
        summary:existsSync(workPath)?servingV1RuntimeSummary(db):null,
      },null,2));
    }finally{db.close();}
    return;
  }

  if(!existsSync(workPath)){
    await mkdir(dirname(workPath),{recursive:true});
    await copyBaseResumable(
      servingPath,workPath,copyStatePath,context.contract.meta.semantic_fingerprint
    );
    if(stopRequested)return;
  }else if(existsSync(copyStatePath)){
    await copyBaseResumable(
      servingPath,workPath,copyStatePath,context.contract.meta.semantic_fingerprint
    );
    if(stopRequested)return;
  }

  const db=openWork(workPath);
  let finalReport=null;
  let paused=false;
  try{
    const workMeta=metaObject(db);
    if(workMeta.semantic_fingerprint!==context.contract.meta.semantic_fingerprint){
      throw new Error('Runtime work DB does not match current Serving-v1 semantic fingerprint. Use --reset.');
    }
    if(workMeta.runtime_revision&&workMeta.runtime_revision!==SERVING_V1_RUNTIME_REVISION){
      throw new Error('Runtime build revision changed; refusing stale checkpoint. Use --reset.');
    }
    if(workMeta.runtime_source_fingerprint
      &&workMeta.runtime_source_fingerprint!==context.runtimeSourceFingerprint){
      throw new Error('Runtime source fingerprint changed; refusing stale checkpoint. Rebuild Serving-v1 identity or use --reset as appropriate.');
    }

    for(const [key,val] of Object.entries({
      runtime_schema:SERVING_V1_RUNTIME_SCHEMA,
      runtime_policy:SERVING_V1_RUNTIME_POLICY,
      runtime_revision:SERVING_V1_RUNTIME_REVISION,
      runtime_status:'building',
      runtime_source_fingerprint:context.runtimeSourceFingerprint,
      runtime_started_at:workMeta.runtime_started_at||now(),
      runtime_updated_at:now(),
    }))upsertMeta(db,key,val);

    const stages=stageDefinitions(context.paths);

    console.log(
      '[serving-v1-runtime] stages='+stages.length+
      ' · batch='+formatCount(batchSize)+
      ' · resume='+(db.prepare('SELECT COUNT(*) c FROM runtime_build_stage').get()?.c?'yes':'new')
    );

    const buildStarted=performance.now();
    for(const stage of stages){
      // Stage sizes are resolved immediately before execution because later stages
      // (notably phrase evidence) depend on rows materialized by earlier stages.
      const sourceRows=Number(stage.total(db)||0);
      const maxSourceId=Number(stage.max(db)||0);
      let state=stageState(db,stage.name);
      if(state?.status==='complete'){
        console.log('[serving-v1-runtime] ✓ '+stage.label+' already complete · '+formatCount(sourceRows));
        continue;
      }
      if(!state){
        db.prepare(`
          INSERT INTO runtime_build_stage(
            stage,status,source_rows,max_source_id,last_source_id,processed_rows,
            started_at,updated_at,completed_at,error
          ) VALUES(?,?,?,?,0,0,?,?,NULL,NULL)
        `).run(stage.name,'running',sourceRows,maxSourceId,now(),now());
        state=stageState(db,stage.name);
      }else{
        db.prepare(`
          UPDATE runtime_build_stage
          SET status='running',source_rows=?,max_source_id=?,updated_at=?,error=NULL
          WHERE stage=?
        `).run(sourceRows,maxSourceId,now(),stage.name);
        state=stageState(db,stage.name);
      }

      let last=Number(state.last_source_id||0);
      let processed=Number(state.processed_rows||0);
      const stageStarted=performance.now();
      const startProcessed=processed;
      let batchNumber=0;
      console.log('[serving-v1-runtime] → '+stage.label+' · '+formatCount(processed)+'/'+formatCount(sourceRows)+' resumed');

      if(stage.path)attach(db,stage.path);
      try{
        while(last<maxSourceId){
          const step=stage.name==='11_phrase_evidence'?Math.min(batchSize,5000):batchSize;
          const upper=Math.min(maxSourceId,last+step);
          const count=stage.rangeCount(db,last,upper);
          const batchStarted=performance.now();
          db.exec('BEGIN IMMEDIATE;');
          try{
            if(count>0)stage.run(db,last,upper);
            processed+=count;
            db.prepare(`
              UPDATE runtime_build_stage
              SET last_source_id=?,processed_rows=?,updated_at=?,error=NULL
              WHERE stage=?
            `).run(upper,processed,now(),stage.name);
            upsertMeta(db,'runtime_updated_at',now());
            db.exec('COMMIT;');
          }catch(error){
            try{db.exec('ROLLBACK;')}catch{}
            db.prepare(`
              UPDATE runtime_build_stage SET status='error',updated_at=?,error=? WHERE stage=?
            `).run(now(),String(error?.stack||error),stage.name);
            throw error;
          }
          last=upper;
          batchNumber+=1;
          if(batchNumber%progressEvery===0||last>=maxSourceId){
            const elapsed=performance.now()-stageStarted;
            const advanced=Math.max(0,processed-startProcessed);
            const rate=elapsed>0?advanced/(elapsed/1000):0;
            const remaining=Math.max(0,sourceRows-processed);
            const eta=rate>0?(remaining/rate)*1000:NaN;
            const pct=sourceRows?Math.min(100,100*processed/sourceRows):100;
            console.log(
              '[serving-v1-runtime]   '+stage.name+' '+pct.toFixed(1)+'% · '+
              formatCount(processed)+'/'+formatCount(sourceRows)+' · '+
              formatCount(Math.round(rate))+' rows/s · batch '+
              formatDuration(performance.now()-batchStarted)+' · ETA '+formatDuration(eta)
            );
          }
          if(stopRequested){
            db.prepare(`
              UPDATE runtime_build_stage SET status='paused',updated_at=?,error=NULL WHERE stage=?
            `).run(now(),stage.name);
            paused=true;
            break;
          }
        }
      }finally{
        if(stage.path)detach(db);
      }
      if(paused)break;

      db.prepare(`
        UPDATE runtime_build_stage
        SET status='complete',last_source_id=?,processed_rows=?,updated_at=?,completed_at=?,error=NULL
        WHERE stage=?
      `).run(maxSourceId,processed,now(),now(),stage.name);
      const summary=servingV1RuntimeSummary(db);
      console.log(
        '[serving-v1-runtime] ✓ '+stage.label+' · '+formatCount(processed)+' · '+
        formatCount(summary.retrievalKeyRows)+' key memberships · '+
        formatDuration(performance.now()-stageStarted)
      );

      if(pauseAfterStage===stage.name){
        paused=true;
        upsertMeta(db,'runtime_status','paused');
        console.log('[serving-v1-runtime] manual checkpoint pause after '+stage.name+'; rerun normally to resume.');
        break;
      }
    }

    if(paused||stopRequested){
      upsertMeta(db,'runtime_status','paused');
      upsertMeta(db,'runtime_updated_at',now());
      return;
    }

    console.log('[serving-v1-runtime] finalizing indexes/statistics…');
    db.exec('ANALYZE; PRAGMA optimize;');
    const quick=db.prepare('PRAGMA quick_check').all();
    if(quick.length!==1||String(quick[0]?.quick_check||'').toLowerCase()!=='ok'){
      throw new Error('Serving-v1 runtime quick_check failed: '+JSON.stringify(quick));
    }
    const summary=servingV1RuntimeSummary(db);
    const invariants=servingV1RuntimeInvariantReport(db);
    if(!invariants.ok)throw new Error('Serving-v1 runtime invariant failure: '+JSON.stringify(invariants));
    await validateSourceSnapshot(context.contract.sourceSnapshot);

    const completedAt=now();
    const runtimeSemanticFingerprint=sha256(JSON.stringify({
      schema:SERVING_V1_RUNTIME_SCHEMA,
      policy:SERVING_V1_RUNTIME_POLICY,
      revision:SERVING_V1_RUNTIME_REVISION,
      base_serving_semantic_fingerprint:context.contract.meta.semantic_fingerprint,
      runtime_source_fingerprint:context.runtimeSourceFingerprint,
      summary,
      invariants,
    }));
    for(const [key,val] of Object.entries({
      runtime_status:'complete',
      runtime_completed_at:completedAt,
      runtime_updated_at:completedAt,
      runtime_semantic_fingerprint:runtimeSemanticFingerprint,
      runtime_summary_json:JSON.stringify(summary),
      runtime_invariants_json:JSON.stringify(invariants),
    }))upsertMeta(db,key,val);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

    finalReport={
      schema:'rhymelab-serving-v1-runtime-build-report',
      status:'ok',
      policy:SERVING_V1_RUNTIME_POLICY,
      revision:SERVING_V1_RUNTIME_REVISION,
      base_serving_semantic_fingerprint:context.contract.meta.semantic_fingerprint,
      runtime_source_fingerprint:context.runtimeSourceFingerprint,
      runtime_semantic_fingerprint:runtimeSemanticFingerprint,
      completed_at:completedAt,
      duration_ms:Number((performance.now()-buildStarted).toFixed(1)),
      batch_size:batchSize,
      stages:db.prepare('SELECT * FROM runtime_build_stage ORDER BY stage').all(),
      summary,
      invariants,
      safety:{
        current_runtime_rewired:false,
        source_databases_mutated:false,
        source_inputs_revalidated_unchanged:true,
        base_serving_preserved_until_success:true,
        promotion_atomic:true,
      },
    };
  }finally{
    db.close();
  }

  if(paused||stopRequested){
    console.error('[serving-v1-runtime] paused safely; work retained at '+workPath);
    return;
  }
  if(!finalReport)throw new Error('Runtime materialization finished without final report.');

  const tempReport=reportPath+'.tmp';
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(tempReport,JSON.stringify(finalReport,null,2)+'\n','utf8');

  if(existsSync(backupPath)&&!replace){
    throw new Error('Pre-runtime backup already exists: '+backupPath+'. Use --replace only for intentional rebuild.');
  }
  if(existsSync(backupPath)&&replace)await rm(backupPath,{force:true});

  await rename(servingPath,backupPath);
  try{
    await rename(workPath,servingPath);
  }catch(error){
    await rename(backupPath,servingPath);
    throw error;
  }

  const promoted=new DatabaseSync(servingPath,{readOnly:true});
  try{
    const quick=promoted.prepare('PRAGMA quick_check').all();
    const meta=metaObject(promoted);
    if(quick.length!==1||String(quick[0]?.quick_check||'').toLowerCase()!=='ok'
      ||meta.runtime_status!=='complete'
      ||meta.runtime_semantic_fingerprint!==finalReport.runtime_semantic_fingerprint){
      throw new Error('Promoted Serving-v1 runtime verification failed.');
    }
  }catch(error){
    promoted.close();
    await rm(servingPath,{force:true});
    await rename(backupPath,servingPath);
    throw error;
  }
  promoted.close();
  await rename(tempReport,reportPath);

  console.log(JSON.stringify({
    schema:finalReport.schema,
    status:finalReport.status,
    runtime_semantic_fingerprint:finalReport.runtime_semantic_fingerprint,
    retrieval_key_rows:finalReport.summary.retrievalKeyRows,
    distinct_retrieval_keys:finalReport.summary.distinctRetrievalKeys,
    pronunciation_targets:finalReport.summary.pronunciationTargets,
    phrase_window_targets:finalReport.summary.phraseWindowTargets,
    morphology_rows:finalReport.summary.morphologyRows,
    phrase_windows:finalReport.summary.phraseWindows,
    phrase_evidence_ready:finalReport.summary.phraseEvidenceReady,
    output:servingPath,
    backup:backupPath,
    report:reportPath,
    current_runtime_rewired:false,
  },null,2));
}

await main();
