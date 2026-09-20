#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,open,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {DatabaseSync} from 'node:sqlite';
import {
  SERVING_V1_PRODUCT_POLICY,
  SERVING_V1_PRODUCT_REVISION,
  SERVING_V1_PRODUCT_SCHEMA,
  createServingV1ProductStorage,
  servingV1ProductInvariantReport,
  servingV1ProductSummary,
} from './serving-v1-product-core.mjs';

const args=process.argv.slice(2);
const value=(flag,fallback=null)=>{
  const i=args.indexOf(flag);
  return i>=0?(args[i+1]||fallback):fallback;
};
const has=(flag)=>args.includes(flag);
const intArg=(flag,fallback,min,max)=>{
  const n=Number.parseInt(String(value(flag,fallback)),10);
  return Math.max(min,Math.min(max,Number.isFinite(n)?n:fallback));
};

const mode=has('--plan')?'plan':has('--status')?'status':'build';
const reset=has('--reset');
const replace=has('--replace');
const batchSize=intArg('--batch-size',100000,1000,500000);
const progressEvery=intArg('--progress-every',1,1,10000);
const pauseAfterStage=value('--pause-after-stage',null);
const servingPath=resolve(value('--serving','data/local/rhymelab-serving-v1.sqlite'));
const workPath=resolve(value('--work','data/local/rhymelab-serving-v1.product-building.sqlite'));
const copyStatePath=resolve(value('--copy-state',workPath+'.copy-state.json'));
const reportPath=resolve(value('--report','data/local/rhymelab-serving-v1-product-report.json'));
const backupPath=resolve(value('--backup','data/local/rhymelab-serving-v1.pre-product.sqlite'));

const now=()=>new Date().toISOString();
const hash=(v)=>createHash('sha256').update(String(v)).digest('hex');
const quote=(v)=>"'"+String(v).replaceAll("'","''")+"'";
const scalar=(db,sql)=>Number(db.prepare(sql).get()?.c||0);
const count=(n)=>Number(n||0).toLocaleString('en-US');
const duration=(ms)=>{
  if(!Number.isFinite(ms)||ms<0)return '—';
  if(ms<1000)return Math.round(ms)+'ms';
  const s=Math.round(ms/1000);
  if(s<60)return s+'s';
  const m=Math.floor(s/60);
  if(m<60)return m+'m '+String(s%60).padStart(2,'0')+'s';
  return Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m';
};

let stopRequested=false;
for(const signal of ['SIGINT','SIGTERM']){
  process.on(signal,()=>{
    if(stopRequested)return;
    stopRequested=true;
    process.exitCode=130;
    console.error('\n[serving-product] '+signal+' received; pausing after the current safe transaction.');
  });
}

function meta(db){
  return Object.fromEntries(db.prepare('SELECT key,value FROM meta ORDER BY key').all().map(r=>[r.key,r.value]));
}
function sourceMeta(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    try{return meta(db);}catch{return {};}
  }finally{db.close();}
}
async function fileState(path){
  const s=await stat(path);
  return {path:resolve(path),bytes:Number(s.size),mtime_ms:Math.trunc(Number(s.mtimeMs)),meta:sourceMeta(path)};
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function readContract(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    db.exec('PRAGMA query_only=ON;');
    const m=meta(db);
    if(m.schema!=='rhymelab-serving-v1')throw new Error('Unexpected Serving-v1 schema: '+String(m.schema||'missing'));
    if(m.status!=='complete'||m.runtime_status!=='complete')throw new Error('Serving-v1 Phase 1/2 is not complete.');
    if(!/^[a-f0-9]{64}$/u.test(String(m.runtime_semantic_fingerprint||''))){
      throw new Error('Serving-v1 runtime semantic fingerprint missing.');
    }
    let snapshot=null;
    try{snapshot=JSON.parse(m.source_snapshot_json||'null');}catch{}
    if(!snapshot?.inputs)throw new Error('Serving-v1 source snapshot missing.');
    return {meta:m,snapshot};
  }finally{db.close();}
}

async function validateSources(snapshot){
  const out={};
  for(const [key,expected] of Object.entries(snapshot.inputs||{})){
    const path=resolve(expected.path);
    if(!existsSync(path))throw new Error('Source input missing: '+path);
    const actual=await fileState(path);
    out[key]=actual;
    if(actual.bytes!==Number(expected.bytes)
      ||actual.mtime_ms!==Number(expected.mtime_ms)
      ||!same(actual.meta,expected.meta||{})){
      throw new Error('Source input changed since Serving-v1 build: '+key+'. Refusing mixed revisions.');
    }
  }
  return out;
}

async function copyBase(source,target,statePath,fingerprint){
  const info=await stat(source);
  const expected={
    schema:'rhymelab-serving-v1-product-copy-v1',
    source:resolve(source),
    source_bytes:Number(info.size),
    source_mtime_ms:Math.trunc(Number(info.mtimeMs)),
    runtime_semantic_fingerprint:String(fingerprint),
    product_revision:SERVING_V1_PRODUCT_REVISION,
  };
  let checkpoint=null;
  if(existsSync(statePath)){
    checkpoint=JSON.parse(await readFile(statePath,'utf8'));
    if(!same(checkpoint,expected))throw new Error('Product copy checkpoint is stale. Use --reset.');
  }else if(!existsSync(target)){
    await writeFile(statePath,JSON.stringify(expected,null,2)+'\n','utf8');
    checkpoint=expected;
  }else{
    return;
  }
  if(!checkpoint)return;
  const initial=existsSync(target)?Number((await stat(target)).size):0;
  if(initial>expected.source_bytes)throw new Error('Product work copy is larger than source. Use --reset.');
  if(initial===expected.source_bytes){
    await rm(statePath,{force:true});
    return;
  }
  const src=await open(source,'r');
  const dst=await open(target,initial?'a':'w');
  const buffer=Buffer.allocUnsafe(8*1024*1024);
  let offset=initial,lastPrint=initial;
  const started=performance.now();
  try{
    console.log('[serving-product] copy '+count(offset)+'/'+count(expected.source_bytes)+' bytes resumed');
    while(offset<expected.source_bytes){
      const len=Math.min(buffer.length,expected.source_bytes-offset);
      const {bytesRead}=await src.read(buffer,0,len,offset);
      if(!bytesRead)break;
      await dst.write(buffer,0,bytesRead);
      offset+=bytesRead;
      if(offset-lastPrint>=256*1024*1024||offset===expected.source_bytes){
        const elapsed=performance.now()-started;
        const advanced=offset-initial;
        const rate=elapsed>0?advanced/(elapsed/1000):0;
        const eta=rate>0?(expected.source_bytes-offset)/rate*1000:NaN;
        console.log('[serving-product] copy '+(100*offset/expected.source_bytes).toFixed(1)+'% · '
          +count(offset)+'/'+count(expected.source_bytes)+' bytes · '
          +count(Math.round(rate/1024/1024))+' MiB/s · ETA '+duration(eta));
        lastPrint=offset;
      }
      if(stopRequested)break;
    }
    await dst.sync();
  }finally{
    await src.close();
    await dst.close();
  }
  if(stopRequested)return;
  if(offset!==expected.source_bytes)throw new Error('Product base copy ended before EOF.');
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
  createServingV1ProductStorage(db);
  return db;
}
function putMeta(db,key,val){
  db.prepare(`
    INSERT INTO meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key,String(val));
}
function attach(db,path){db.exec('ATTACH DATABASE '+quote(path)+' AS src;');}
function detach(db){db.exec('DETACH DATABASE src;');}
function stageRow(db,name){return db.prepare('SELECT * FROM product_build_stage WHERE stage=?').get(name)||null;}

function deProfileStage(path){
  const filter=(last,upper)=>`h.id>${last} AND h.id<=${upper} AND h.pronunciation_eligible=1`;
  const mapped=(last,upper)=>`
    SELECT
      h.id source_id,s.surface_id,p.pronunciation_id,p.canonical_available,p.generated_available,
      CASE
        WHEN h.pronunciation_flags LIKE '%secondary_opt_in%' AND p.canonical_available=1 THEN 20
        WHEN h.pronunciation_flags LIKE '%secondary_opt_in%' THEN 110
        ELSE 10
      END source_priority,
      h.usage_score,h.usage_source_count,h.gender,h.entity_kind,h.lexical_tags,
      CASE
        WHEN h.pronunciation_flags LIKE '%secondary_opt_in%' AND p.canonical_available=1
          THEN 'serving_core_absorbed'
        ELSE h.pronunciation_source
      END effective_source,
      h.pronunciation_source_order,h.pronunciation_evidence,h.pronunciation_tags,
      h.pronunciation_raw_tags,
      CASE
        WHEN h.pronunciation_flags LIKE '%secondary_opt_in%' AND p.canonical_available=1 THEN '[]'
        ELSE h.pronunciation_flags
      END effective_flags,
      h.locale,h.dialect,h.pronunciation_register,h.rhyme_tail,h.final_tail,
      h.vowels,h.consonants,h.coda_class,h.rhyme_syllables,h.pronunciation_rank
    FROM src.hot h
    JOIN surface s ON s.language='de' AND s.normalized=h.normalized
    JOIN pronunciation p
      ON p.surface_id=s.surface_id
     AND p.identity_key=(COALESCE(NULLIF(h.phonemes,''),h.ipa)||'|stress:'||COALESCE(h.stress,''))
    WHERE ${filter(last,upper)}
  `;
  return {
    name:'01_de_profiles',label:'DE lexical/pronunciation metadata',path,
    total(db){attach(db,path);try{return scalar(db,'SELECT COUNT(*) c FROM src.hot WHERE pronunciation_eligible=1');}finally{detach(db);}},
    max(db){attach(db,path);try{return scalar(db,'SELECT COALESCE(MAX(id),0) c FROM src.hot WHERE pronunciation_eligible=1');}finally{detach(db);}},
    range(db,last,upper){return scalar(db,`SELECT COUNT(*) c FROM src.hot h WHERE ${filter(last,upper)}`);},
    run(db,last,upper){
      const rows=mapped(last,upper);
      db.exec(`
        INSERT INTO runtime_lexical_profile(
          surface_id,source_priority,usage_score,usage_source_count,gender,entity_kind,lexical_tags_json
        )
        SELECT surface_id,MIN(source_priority),MIN(usage_score),MAX(usage_source_count),
          MIN(gender),MIN(entity_kind),MIN(lexical_tags)
        FROM (${rows}) r
        GROUP BY surface_id
        ON CONFLICT(surface_id) DO UPDATE SET
          source_priority=MIN(runtime_lexical_profile.source_priority,excluded.source_priority),
          usage_score=CASE WHEN excluded.source_priority<runtime_lexical_profile.source_priority THEN excluded.usage_score ELSE runtime_lexical_profile.usage_score END,
          usage_source_count=CASE WHEN excluded.source_priority<runtime_lexical_profile.source_priority THEN excluded.usage_source_count ELSE runtime_lexical_profile.usage_source_count END,
          gender=CASE WHEN excluded.source_priority<runtime_lexical_profile.source_priority THEN excluded.gender ELSE runtime_lexical_profile.gender END,
          entity_kind=CASE WHEN excluded.source_priority<runtime_lexical_profile.source_priority THEN excluded.entity_kind ELSE runtime_lexical_profile.entity_kind END,
          lexical_tags_json=CASE WHEN excluded.source_priority<runtime_lexical_profile.source_priority THEN excluded.lexical_tags_json ELSE runtime_lexical_profile.lexical_tags_json END;
      `);
      db.exec(`
        INSERT INTO runtime_pronunciation_profile(
          pronunciation_id,source_priority,source,source_order,evidence_count,tags_json,raw_tags_json,
          flags_json,locale,dialect,register,rhyme_tail,final_tail,vowels,consonants,coda_class,
          rhyme_syllables,default_profile_eligible
        )
        SELECT pronunciation_id,source_priority,effective_source,pronunciation_source_order,
          pronunciation_evidence,pronunciation_tags,pronunciation_raw_tags,effective_flags,
          locale,dialect,pronunciation_register,rhyme_tail,final_tail,vowels,consonants,coda_class,
          rhyme_syllables,1
        FROM (${rows}) r
        WHERE 1
        ON CONFLICT(pronunciation_id) DO UPDATE SET
          source_priority=MIN(runtime_pronunciation_profile.source_priority,excluded.source_priority),
          source=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.source ELSE runtime_pronunciation_profile.source END,
          source_order=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.source_order ELSE runtime_pronunciation_profile.source_order END,
          evidence_count=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.evidence_count ELSE runtime_pronunciation_profile.evidence_count END,
          tags_json=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.tags_json ELSE runtime_pronunciation_profile.tags_json END,
          raw_tags_json=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.raw_tags_json ELSE runtime_pronunciation_profile.raw_tags_json END,
          flags_json=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.flags_json ELSE runtime_pronunciation_profile.flags_json END,
          locale=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.locale ELSE runtime_pronunciation_profile.locale END,
          dialect=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.dialect ELSE runtime_pronunciation_profile.dialect END,
          register=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.register ELSE runtime_pronunciation_profile.register END,
          rhyme_tail=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.rhyme_tail ELSE runtime_pronunciation_profile.rhyme_tail END,
          final_tail=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.final_tail ELSE runtime_pronunciation_profile.final_tail END,
          vowels=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.vowels ELSE runtime_pronunciation_profile.vowels END,
          consonants=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.consonants ELSE runtime_pronunciation_profile.consonants END,
          coda_class=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.coda_class ELSE runtime_pronunciation_profile.coda_class END,
          rhyme_syllables=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.rhyme_syllables ELSE runtime_pronunciation_profile.rhyme_syllables END;
      `);
    },
  };
}

function enProfileStage(path){
  const filter=(last,upper)=>`p.id>${last} AND p.id<=${upper} AND p.analysis_status='ok'`;
  const mapped=(last,upper)=>`
    SELECT
      p.id source_id,s.surface_id,sp.pronunciation_id,sp.canonical_available,sp.generated_available,
      CASE
        WHEN p.source='espeak_ng_generated_secondary' AND sp.canonical_available=1 THEN 20
        WHEN p.source='espeak_ng_generated_secondary' THEN 110
        ELSE 10
      END source_priority,
      f.surface_variants,f.poses,f.lemmas,f.relation_kinds,f.lexical_tags,f.evidence_kinds,
      f.esdb_archaic,f.esdb_uncommon,f.wordfreq_zipf,f.default_eligible,
      CASE
        WHEN p.source='espeak_ng_generated_secondary' AND sp.canonical_available=1 THEN 'serving_core_absorbed'
        ELSE p.source
      END effective_source,
      p.tags,p.evidence_count,p.locales,p.locale_us,p.locale_gb,p.source_attested_unprofiled,
      p.rhyme_tail,p.final_tail,p.vowel_key,p.coda_key,p.coda_class,p.rhyme_syllables,p.rhotic,
      p.default_profile_eligible
    FROM src.en_pronunciation p
    JOIN src.en_form f ON f.id=p.form_id
    JOIN surface s ON s.language='en' AND s.normalized=f.normalized
    JOIN pronunciation sp
      ON sp.surface_id=s.surface_id
     AND sp.identity_key=(COALESCE(NULLIF(p.phonemes,''),p.raw)||'|stress:'||COALESCE(p.stress,''))
    WHERE ${filter(last,upper)}
  `;
  return {
    name:'02_en_profiles',label:'EN lexical/pronunciation metadata',path,
    total(db){attach(db,path);try{return scalar(db,"SELECT COUNT(*) c FROM src.en_pronunciation WHERE analysis_status='ok'");}finally{detach(db);}},
    max(db){attach(db,path);try{return scalar(db,"SELECT COALESCE(MAX(id),0) c FROM src.en_pronunciation WHERE analysis_status='ok'");}finally{detach(db);}},
    range(db,last,upper){return scalar(db,`SELECT COUNT(*) c FROM src.en_pronunciation p WHERE ${filter(last,upper)}`);},
    run(db,last,upper){
      const rows=mapped(last,upper);
      db.exec(`
        INSERT INTO runtime_lexical_profile(
          surface_id,source_priority,en_surface_variants_json,en_poses_json,en_lemmas_json,
          en_relation_kinds_json,lexical_tags_json,en_evidence_kinds_json,en_esdb_archaic,
          en_esdb_uncommon,en_wordfreq_zipf,en_default_eligible
        )
        SELECT surface_id,MIN(source_priority),MIN(surface_variants),MIN(poses),MIN(lemmas),
          MIN(relation_kinds),MIN(lexical_tags),MIN(evidence_kinds),MAX(esdb_archaic),
          MAX(esdb_uncommon),MIN(wordfreq_zipf),MAX(default_eligible)
        FROM (${rows}) r GROUP BY surface_id
        ON CONFLICT(surface_id) DO UPDATE SET
          source_priority=MIN(runtime_lexical_profile.source_priority,excluded.source_priority),
          en_surface_variants_json=excluded.en_surface_variants_json,
          en_poses_json=excluded.en_poses_json,
          en_lemmas_json=excluded.en_lemmas_json,
          en_relation_kinds_json=excluded.en_relation_kinds_json,
          lexical_tags_json=excluded.lexical_tags_json,
          en_evidence_kinds_json=excluded.en_evidence_kinds_json,
          en_esdb_archaic=excluded.en_esdb_archaic,
          en_esdb_uncommon=excluded.en_esdb_uncommon,
          en_wordfreq_zipf=excluded.en_wordfreq_zipf,
          en_default_eligible=excluded.en_default_eligible;
      `);
      db.exec(`
        INSERT INTO runtime_pronunciation_profile(
          pronunciation_id,source_priority,source,evidence_count,tags_json,raw_tags_json,flags_json,
          locales_json,locale_us,locale_gb,source_attested_unprofiled,rhyme_tail,final_tail,vowels,
          consonants,coda_class,rhyme_syllables,rhotic,default_profile_eligible,locale
        )
        SELECT pronunciation_id,source_priority,effective_source,evidence_count,
          CASE WHEN effective_source='serving_core_absorbed' THEN '[]' ELSE tags END,
          CASE WHEN effective_source='serving_core_absorbed' THEN '[]' ELSE tags END,
          CASE WHEN effective_source='espeak_ng_generated_secondary' THEN '["generated","secondary_opt_in"]' ELSE '[]' END,
          locales,locale_us,locale_gb,source_attested_unprofiled,rhyme_tail,final_tail,vowel_key,coda_key,
          coda_class,rhyme_syllables,rhotic,default_profile_eligible,
          CASE WHEN locale_us=1 THEN 'en-US' WHEN locale_gb=1 THEN 'en-GB' ELSE NULL END
        FROM (${rows}) r WHERE 1
        ON CONFLICT(pronunciation_id) DO UPDATE SET
          source_priority=MIN(runtime_pronunciation_profile.source_priority,excluded.source_priority),
          source=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.source ELSE runtime_pronunciation_profile.source END,
          evidence_count=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.evidence_count ELSE runtime_pronunciation_profile.evidence_count END,
          tags_json=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.tags_json ELSE runtime_pronunciation_profile.tags_json END,
          raw_tags_json=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.raw_tags_json ELSE runtime_pronunciation_profile.raw_tags_json END,
          flags_json=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.flags_json ELSE runtime_pronunciation_profile.flags_json END,
          locales_json=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.locales_json ELSE runtime_pronunciation_profile.locales_json END,
          locale_us=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.locale_us ELSE runtime_pronunciation_profile.locale_us END,
          locale_gb=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.locale_gb ELSE runtime_pronunciation_profile.locale_gb END,
          source_attested_unprofiled=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.source_attested_unprofiled ELSE runtime_pronunciation_profile.source_attested_unprofiled END,
          rhyme_tail=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.rhyme_tail ELSE runtime_pronunciation_profile.rhyme_tail END,
          final_tail=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.final_tail ELSE runtime_pronunciation_profile.final_tail END,
          vowels=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.vowels ELSE runtime_pronunciation_profile.vowels END,
          consonants=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.consonants ELSE runtime_pronunciation_profile.consonants END,
          coda_class=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.coda_class ELSE runtime_pronunciation_profile.coda_class END,
          rhyme_syllables=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.rhyme_syllables ELSE runtime_pronunciation_profile.rhyme_syllables END,
          rhotic=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.rhotic ELSE runtime_pronunciation_profile.rhotic END,
          default_profile_eligible=MAX(runtime_pronunciation_profile.default_profile_eligible,excluded.default_profile_eligible),
          locale=CASE WHEN excluded.source_priority<runtime_pronunciation_profile.source_priority THEN excluded.locale ELSE runtime_pronunciation_profile.locale END;
      `);
    },
  };
}

function phraseProfileStage(path){
  const filter=(last,upper)=>`pp.rowid>${last} AND pp.rowid<=${upper} AND pp.eligible=1`;
  return {
    name:'03_phrase_profiles',label:'Phrase query metadata',path,
    total(db){attach(db,path);try{return scalar(db,'SELECT COUNT(*) c FROM src.phrase_pronunciation WHERE eligible=1');}finally{detach(db);}},
    max(db){attach(db,path);try{return scalar(db,'SELECT COALESCE(MAX(rowid),0) c FROM src.phrase_pronunciation WHERE eligible=1');}finally{detach(db);}},
    range(db,last,upper){return scalar(db,`SELECT COUNT(*) c FROM src.phrase_pronunciation pp WHERE ${filter(last,upper)}`);},
    run(db,last,upper){
      db.exec(`
        INSERT OR REPLACE INTO runtime_phrase_profile(
          runtime_phrase_id,token_count,variant_rank,
          primary_stress_syllables_json,secondary_stress_syllables_json
        )
        SELECT
          rp.runtime_phrase_id,p.token_count,pp.variant_rank,
          pp.primary_stress_syllables_json,pp.secondary_stress_syllables_json
        FROM src.phrase_pronunciation pp
        JOIN src.phrase p ON p.phrase_id=pp.phrase_id
        JOIN runtime_phrase rp
          ON rp.source_phrase_pronunciation_id=pp.phrase_pronunciation_id
        WHERE ${filter(last,upper)};
      `);
    },
  };
}

function entityIdentityStage(path){
  const filter=(last,upper)=>`e.entity_id>${last} AND e.entity_id<=${upper}`;
  return {
    name:'04_entity_identity',label:'Entity identities/categories',path,
    total(db){attach(db,path);try{return scalar(db,'SELECT COUNT(*) c FROM src.entity');}finally{detach(db);}},
    max(db){attach(db,path);try{return scalar(db,'SELECT COALESCE(MAX(entity_id),0) c FROM src.entity');}finally{detach(db);}},
    range(db,last,upper){return scalar(db,`SELECT COUNT(*) c FROM src.entity e WHERE ${filter(last,upper)}`);},
    run(db,last,upper){
      db.exec(`
        INSERT OR REPLACE INTO runtime_entity_identity(
          entity_id,qid,primary_category,popularity_score,popularity_percentile,popularity_tier
        )
        SELECT e.entity_id,e.qid,e.primary_category,e.popularity_score,e.popularity_percentile,e.popularity_tier
        FROM src.entity e WHERE ${filter(last,upper)};
      `);
      db.exec(`
        INSERT OR REPLACE INTO runtime_entity_category(
          entity_id,category,category_score,category_rank,category_percentile,category_tier,
          retention_percentile_floor,retained_by_category
        )
        SELECT ec.entity_id,ec.category,ec.category_score,ec.category_rank,ec.category_percentile,
          ec.category_tier,ec.retention_percentile_floor,ec.retained_by_category
        FROM src.entity_category ec
        JOIN src.entity e USING(entity_id)
        WHERE ${filter(last,upper)};
      `);
    },
  };
}

function entityNameStage(path){
  const filter=(last,upper)=>`n.name_id>${last} AND n.name_id<=${upper} AND n.searchable=1 AND n.language IN ('de','en')`;
  return {
    name:'05_entity_names',label:'Entity searchable names',path,
    total(db){attach(db,path);try{return scalar(db,"SELECT COUNT(*) c FROM src.entity_name WHERE searchable=1 AND language IN ('de','en')");}finally{detach(db);}},
    max(db){attach(db,path);try{return scalar(db,"SELECT COALESCE(MAX(name_id),0) c FROM src.entity_name WHERE searchable=1 AND language IN ('de','en')");}finally{detach(db);}},
    range(db,last,upper){return scalar(db,`SELECT COUNT(*) c FROM src.entity_name n WHERE ${filter(last,upper)}`);},
    run(db,last,upper){
      db.exec(`
        INSERT OR REPLACE INTO runtime_entity_name(
          name_id,entity_id,surface_id,surface,normalized,language,script,name_kind,
          preferred,searchable,source_kind,source_record
        )
        SELECT n.name_id,n.entity_id,s.surface_id,n.surface,n.normalized,n.language,n.script,n.name_kind,
          n.preferred,n.searchable,n.source_kind,n.source_record
        FROM src.entity_name n
        JOIN surface s ON s.language=n.language AND s.normalized=n.normalized
        WHERE ${filter(last,upper)};
      `);
    },
  };
}

function entityPronStage(path){
  const accepted="'accepted','reviewed','accepted_source_composition','accepted_source_backed'";
  const filter=(last,upper)=>`
    ep.pronunciation_id>${last} AND ep.pronunciation_id<=${upper}
    AND ep.review_state IN (${accepted})
    AND n.searchable=1 AND n.language IN ('de','en')
    AND ((n.language='de' AND ep.locale='de-DE') OR (n.language='en' AND ep.locale='en-US'))
  `;
  const mapped=(last,upper)=>`
    SELECT
      ep.pronunciation_id source_id,n.name_id,n.language,n.normalized,sp.pronunciation_id serving_pronunciation_id,
      CASE
        WHEN sp.canonical_available=1 AND ep.source_kind='espeak_ng_generated_secondary' THEN 20
        WHEN sp.canonical_available=0 AND sp.generated_available=1 THEN 110
        ELSE 10
      END source_priority,
      ep.locale,ep.pronunciation_role,ep.ipa,ep.preferred,
      CASE
        WHEN sp.canonical_available=1 AND ep.source_kind='espeak_ng_generated_secondary'
          THEN 'serving_core_absorbed'
        ELSE ep.source_kind
      END effective_source_kind,
      ep.source_record,
      CASE WHEN sp.canonical_available=0 AND sp.generated_available=1 THEN 1 ELSE 0 END effective_generated,
      ep.model_id,ep.confidence,ep.review_state
    FROM src.entity_pronunciation ep
    JOIN src.entity_name n ON n.name_id=ep.name_id
    JOIN runtime_entity_name rn ON rn.name_id=n.name_id
    LEFT JOIN src.entity_phonetic_analysis epa ON epa.pronunciation_id=ep.pronunciation_id
    JOIN surface s ON s.language=n.language AND s.normalized=n.normalized
    JOIN pronunciation sp
      ON sp.surface_id=s.surface_id
     AND sp.identity_key=(
       COALESCE(NULLIF(MIN(epa.phonemes),''),ep.ipa)
       ||'|stress:'||COALESCE(MIN(epa.stress_pattern),'')
     )
    WHERE ${filter(last,upper)}
    GROUP BY ep.pronunciation_id
  `;
  return {
    name:'06_entity_pronunciations',label:'Entity pronunciation occurrences',path,
    total(db){attach(db,path);try{return scalar(db,`
      SELECT COUNT(*) c
      FROM src.entity_pronunciation ep JOIN src.entity_name n ON n.name_id=ep.name_id
      WHERE ep.review_state IN (${accepted})
        AND n.searchable=1 AND n.language IN ('de','en')
        AND ((n.language='de' AND ep.locale='de-DE') OR (n.language='en' AND ep.locale='en-US'))
    `);}finally{detach(db);}},
    max(db){attach(db,path);try{return scalar(db,`
      SELECT COALESCE(MAX(ep.pronunciation_id),0) c
      FROM src.entity_pronunciation ep JOIN src.entity_name n ON n.name_id=ep.name_id
      WHERE ep.review_state IN (${accepted})
        AND n.searchable=1 AND n.language IN ('de','en')
        AND ((n.language='de' AND ep.locale='de-DE') OR (n.language='en' AND ep.locale='en-US'))
    `);}finally{detach(db);}},
    range(db,last,upper){return scalar(db,`
      SELECT COUNT(*) c FROM src.entity_pronunciation ep
      JOIN src.entity_name n ON n.name_id=ep.name_id
      WHERE ${filter(last,upper)}
    `);},
    run(db,last,upper){
      const rows=mapped(last,upper);
      db.exec(`
        INSERT INTO runtime_entity_pronunciation(
          product_pronunciation_id,name_id,serving_pronunciation_id,source_priority,
          locale,pronunciation_role,ipa,preferred,source_kind,source_record,generated,
          model_id,confidence,review_state
        )
        SELECT source_id,name_id,serving_pronunciation_id,source_priority,locale,pronunciation_role,
          ipa,preferred,effective_source_kind,source_record,effective_generated,model_id,confidence,review_state
        FROM (${rows}) r WHERE 1
        ON CONFLICT(name_id,serving_pronunciation_id) DO UPDATE SET
          source_priority=MIN(runtime_entity_pronunciation.source_priority,excluded.source_priority),
          locale=CASE WHEN excluded.source_priority<runtime_entity_pronunciation.source_priority THEN excluded.locale ELSE runtime_entity_pronunciation.locale END,
          pronunciation_role=CASE WHEN excluded.source_priority<runtime_entity_pronunciation.source_priority THEN excluded.pronunciation_role ELSE runtime_entity_pronunciation.pronunciation_role END,
          ipa=CASE WHEN excluded.source_priority<runtime_entity_pronunciation.source_priority THEN excluded.ipa ELSE runtime_entity_pronunciation.ipa END,
          preferred=MAX(runtime_entity_pronunciation.preferred,excluded.preferred),
          source_kind=CASE WHEN excluded.source_priority<runtime_entity_pronunciation.source_priority THEN excluded.source_kind ELSE runtime_entity_pronunciation.source_kind END,
          source_record=CASE WHEN excluded.source_priority<runtime_entity_pronunciation.source_priority THEN excluded.source_record ELSE runtime_entity_pronunciation.source_record END,
          generated=CASE WHEN excluded.source_priority<runtime_entity_pronunciation.source_priority THEN excluded.generated ELSE runtime_entity_pronunciation.generated END,
          model_id=CASE WHEN excluded.source_priority<runtime_entity_pronunciation.source_priority THEN excluded.model_id ELSE runtime_entity_pronunciation.model_id END,
          confidence=CASE WHEN excluded.source_priority<runtime_entity_pronunciation.source_priority THEN excluded.confidence ELSE runtime_entity_pronunciation.confidence END,
          review_state=CASE WHEN excluded.source_priority<runtime_entity_pronunciation.source_priority THEN excluded.review_state ELSE runtime_entity_pronunciation.review_state END;
      `);
    },
  };
}

function stageDefinitions(paths){
  return [
    deProfileStage(paths.deGenerated),
    enProfileStage(paths.enGenerated),
    phraseProfileStage(paths.phraseGenerated),
    entityIdentityStage(paths.entityGenerated),
    entityNameStage(paths.entityGenerated),
    entityPronStage(paths.entityGenerated),
  ];
}

async function context(){
  if(!existsSync(servingPath))throw new Error('Serving-v1 DB missing: '+servingPath);
  const contract=readContract(servingPath);
  if(contract.meta.product_adapter_schema===SERVING_V1_PRODUCT_SCHEMA
    &&contract.meta.product_adapter_status==='complete'
    &&!replace){
    return {contract,alreadyComplete:true};
  }
  const actual=await validateSources(contract.snapshot);
  const paths=Object.fromEntries(Object.entries(actual).map(([k,v])=>[k,v.path]));
  const fingerprint=hash(JSON.stringify({
    runtime_semantic_fingerprint:contract.meta.runtime_semantic_fingerprint,
    product_revision:SERVING_V1_PRODUCT_REVISION,
    inputs:actual,
  }));
  return {contract,actual,paths,fingerprint,alreadyComplete:false};
}

async function plan(db,stages){
  const out=[];
  for(const stage of stages){
    out.push({
      stage:stage.name,label:stage.label,source_rows:stage.total(db),
      max_source_id:stage.max(db),source:stage.path,
    });
  }
  return out;
}

async function main(){
  if(reset){
    for(const p of [workPath,workPath+'-wal',workPath+'-shm',copyStatePath])await rm(p,{force:true});
    console.log('[serving-product] reset incomplete Product work only; promoted Serving-v1 preserved.');
  }
  const ctx=await context();
  if(ctx.alreadyComplete){
    console.log(JSON.stringify({
      schema:SERVING_V1_PRODUCT_SCHEMA,status:'already_complete',serving:servingPath,
      semantic_fingerprint:ctx.contract.meta.product_adapter_semantic_fingerprint||null,
    },null,2));
    return;
  }

  if(mode==='status'){
    const candidate=existsSync(workPath)?workPath:servingPath;
    const db=new DatabaseSync(candidate,{readOnly:true});
    try{
      const m=meta(db);
      console.log(JSON.stringify({
        schema:'rhymelab-serving-v1-product-status',
        state:existsSync(workPath)?'building':'not_started',
        product_adapter_status:m.product_adapter_status||null,
        product_adapter_revision:m.product_adapter_revision||null,
        stages:existsSync(workPath)?db.prepare('SELECT * FROM product_build_stage ORDER BY stage').all():[],
        summary:existsSync(workPath)?servingV1ProductSummary(db):null,
      },null,2));
    }finally{db.close();}
    return;
  }

  if(mode==='plan'){
    const db=new DatabaseSync(servingPath,{readOnly:true});
    try{
      const stages=stageDefinitions(ctx.paths);
      console.log(JSON.stringify({
        schema:'rhymelab-serving-v1-product-plan',
        policy:SERVING_V1_PRODUCT_POLICY,
        revision:SERVING_V1_PRODUCT_REVISION,
        runtime_semantic_fingerprint:ctx.contract.meta.runtime_semantic_fingerprint,
        product_source_fingerprint:ctx.fingerprint,
        batch_size:batchSize,
        serving:servingPath,
        work:workPath,
        stages:await plan(db,stages),
        safety:{
          read_only_plan:true,current_runtime_rewired:false,source_databases_mutated:false,
          serving_preserved_until_success:true,resumable:true,atomic_promotion:true,
        },
      },null,2));
    }finally{db.close();}
    return;
  }

  await mkdir(dirname(workPath),{recursive:true});
  if(!existsSync(workPath)||existsSync(copyStatePath)){
    await copyBase(servingPath,workPath,copyStatePath,ctx.contract.meta.runtime_semantic_fingerprint);
    if(stopRequested)return;
  }

  const db=openWork(workPath);
  let finalReport=null;
  let paused=false;
  try{
    const m=meta(db);
    if(m.runtime_semantic_fingerprint!==ctx.contract.meta.runtime_semantic_fingerprint){
      throw new Error('Product work DB does not match current runtime semantic fingerprint. Use --reset.');
    }
    if(m.product_adapter_revision&&m.product_adapter_revision!==SERVING_V1_PRODUCT_REVISION){
      throw new Error('Product adapter build revision changed. Use --reset.');
    }
    if(m.product_adapter_source_fingerprint&&m.product_adapter_source_fingerprint!==ctx.fingerprint){
      throw new Error('Product adapter source fingerprint changed. Use --reset.');
    }

    for(const [key,val] of Object.entries({
      product_adapter_schema:SERVING_V1_PRODUCT_SCHEMA,
      product_adapter_policy:SERVING_V1_PRODUCT_POLICY,
      product_adapter_revision:SERVING_V1_PRODUCT_REVISION,
      product_adapter_status:'building',
      product_adapter_source_fingerprint:ctx.fingerprint,
      product_adapter_started_at:m.product_adapter_started_at||now(),
      product_adapter_updated_at:now(),
    }))putMeta(db,key,val);

    const stages=stageDefinitions(ctx.paths);
    console.log('[serving-product] stages='+stages.length+' · batch='+count(batchSize)
      +' · resume='+(scalar(db,'SELECT COUNT(*) c FROM product_build_stage')?'yes':'new'));
    const started=performance.now();

    for(const stage of stages){
      const sourceRows=stage.total(db);
      const maxId=stage.max(db);
      let state=stageRow(db,stage.name);
      if(state?.status==='complete'){
        console.log('[serving-product] ✓ '+stage.label+' already complete · '+count(sourceRows));
        continue;
      }
      if(!state){
        db.prepare(`
          INSERT INTO product_build_stage(
            stage,status,source_rows,max_source_id,last_source_id,processed_rows,
            started_at,updated_at,completed_at,error
          ) VALUES(?,?,?,?,0,0,?,?,NULL,NULL)
        `).run(stage.name,'running',sourceRows,maxId,now(),now());
        state=stageRow(db,stage.name);
      }else{
        db.prepare(`
          UPDATE product_build_stage
          SET status='running',source_rows=?,max_source_id=?,updated_at=?,error=NULL
          WHERE stage=?
        `).run(sourceRows,maxId,now(),stage.name);
        state=stageRow(db,stage.name);
      }

      let last=Number(state.last_source_id||0);
      let processed=Number(state.processed_rows||0);
      const stageStarted=performance.now(),initialProcessed=processed;
      let batchNo=0;
      console.log('[serving-product] → '+stage.label+' · '+count(processed)+'/'+count(sourceRows)+' resumed');
      attach(db,stage.path);
      try{
        while(last<maxId){
          const upper=Math.min(maxId,last+batchSize);
          const rows=stage.range(db,last,upper);
          const batchStarted=performance.now();
          db.exec('BEGIN IMMEDIATE;');
          try{
            if(rows>0)stage.run(db,last,upper);
            processed+=rows;
            db.prepare(`
              UPDATE product_build_stage SET last_source_id=?,processed_rows=?,updated_at=?,error=NULL
              WHERE stage=?
            `).run(upper,processed,now(),stage.name);
            putMeta(db,'product_adapter_updated_at',now());
            db.exec('COMMIT;');
          }catch(error){
            try{db.exec('ROLLBACK;')}catch{}
            db.prepare('UPDATE product_build_stage SET status=\'error\',updated_at=?,error=? WHERE stage=?')
              .run(now(),String(error?.stack||error),stage.name);
            throw error;
          }
          last=upper;
          batchNo++;
          if(batchNo%progressEvery===0||last>=maxId){
            const elapsed=performance.now()-stageStarted;
            const advanced=Math.max(0,processed-initialProcessed);
            const rate=elapsed>0?advanced/(elapsed/1000):0;
            const eta=rate>0?(sourceRows-processed)/rate*1000:NaN;
            const pct=sourceRows?Math.min(100,100*processed/sourceRows):100;
            console.log('[serving-product]   '+stage.name+' '+pct.toFixed(1)+'% · '
              +count(processed)+'/'+count(sourceRows)+' · '+count(Math.round(rate))
              +' rows/s · batch '+duration(performance.now()-batchStarted)+' · ETA '+duration(eta));
          }
          if(stopRequested){
            db.prepare("UPDATE product_build_stage SET status='paused',updated_at=?,error=NULL WHERE stage=?")
              .run(now(),stage.name);
            paused=true;
            break;
          }
        }
      }finally{detach(db);}
      if(paused)break;
      db.prepare(`
        UPDATE product_build_stage
        SET status='complete',last_source_id=?,processed_rows=?,updated_at=?,completed_at=?,error=NULL
        WHERE stage=?
      `).run(maxId,processed,now(),now(),stage.name);
      const summary=servingV1ProductSummary(db);
      console.log('[serving-product] ✓ '+stage.label+' · '+count(processed)
        +' · '+count(summary.pronunciationProfiles)+' pronunciation profiles · '
        +duration(performance.now()-stageStarted));
      if(pauseAfterStage===stage.name){
        paused=true;
        putMeta(db,'product_adapter_status','paused');
        console.log('[serving-product] manual checkpoint pause after '+stage.name);
        break;
      }
    }

    if(paused||stopRequested){
      putMeta(db,'product_adapter_status','paused');
      putMeta(db,'product_adapter_updated_at',now());
      return;
    }

    console.log('[serving-product] finalizing indexes/statistics…');
    db.exec('ANALYZE; PRAGMA optimize;');
    const quick=db.prepare('PRAGMA quick_check').all();
    if(quick.length!==1||String(quick[0]?.quick_check||'').toLowerCase()!=='ok'){
      throw new Error('Product adapter quick_check failed: '+JSON.stringify(quick));
    }
    const summary=servingV1ProductSummary(db);
    const invariants=servingV1ProductInvariantReport(db);
    if(!invariants.ok)throw new Error('Product adapter invariants failed: '+JSON.stringify(invariants));
    await validateSources(ctx.contract.snapshot);

    const completedAt=now();
    const semantic=hash(JSON.stringify({
      schema:SERVING_V1_PRODUCT_SCHEMA,
      policy:SERVING_V1_PRODUCT_POLICY,
      revision:SERVING_V1_PRODUCT_REVISION,
      runtime_semantic_fingerprint:ctx.contract.meta.runtime_semantic_fingerprint,
      source_fingerprint:ctx.fingerprint,summary,invariants,
    }));
    for(const [key,val] of Object.entries({
      product_adapter_status:'complete',
      product_adapter_completed_at:completedAt,
      product_adapter_updated_at:completedAt,
      product_adapter_semantic_fingerprint:semantic,
      product_adapter_summary_json:JSON.stringify(summary),
      product_adapter_invariants_json:JSON.stringify(invariants),
    }))putMeta(db,key,val);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

    finalReport={
      schema:'rhymelab-serving-v1-product-build-report',
      status:'ok',
      policy:SERVING_V1_PRODUCT_POLICY,
      revision:SERVING_V1_PRODUCT_REVISION,
      runtime_semantic_fingerprint:ctx.contract.meta.runtime_semantic_fingerprint,
      product_source_fingerprint:ctx.fingerprint,
      product_semantic_fingerprint:semantic,
      completed_at:completedAt,
      duration_ms:Number((performance.now()-started).toFixed(1)),
      batch_size:batchSize,
      stages:db.prepare('SELECT * FROM product_build_stage ORDER BY stage').all(),
      summary,invariants,
      safety:{
        current_runtime_rewired:false,
        source_databases_mutated:false,
        source_inputs_revalidated_unchanged:true,
        serving_preserved_until_success:true,
        promotion_atomic:true,
      },
    };
  }finally{db.close();}

  if(paused||stopRequested){
    console.error('[serving-product] paused safely; work retained at '+workPath);
    return;
  }
  if(!finalReport)throw new Error('Product adapter build finished without report.');

  await mkdir(dirname(reportPath),{recursive:true});
  const tempReport=reportPath+'.tmp';
  await writeFile(tempReport,JSON.stringify(finalReport,null,2)+'\n','utf8');

  if(existsSync(backupPath)&&!replace){
    throw new Error('Pre-product backup already exists: '+backupPath+'. Use --replace only intentionally.');
  }
  if(existsSync(backupPath)&&replace)await rm(backupPath,{force:true});
  await rename(servingPath,backupPath);
  try{await rename(workPath,servingPath);}
  catch(error){await rename(backupPath,servingPath);throw error;}

  const promoted=new DatabaseSync(servingPath,{readOnly:true});
  try{
    const qm=meta(promoted);
    const quick=promoted.prepare('PRAGMA quick_check').all();
    if(quick.length!==1||String(quick[0]?.quick_check||'').toLowerCase()!=='ok'
      ||qm.product_adapter_status!=='complete'
      ||qm.product_adapter_semantic_fingerprint!==finalReport.product_semantic_fingerprint){
      throw new Error('Promoted product adapter verification failed.');
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
    schema:finalReport.schema,status:finalReport.status,
    product_semantic_fingerprint:finalReport.product_semantic_fingerprint,
    summary:finalReport.summary,
    output:servingPath,backup:backupPath,report:reportPath,current_runtime_rewired:false,
  },null,2));
}

await main();
