import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createServingV1Storage} from '../scripts/serving-v1-core.mjs';
import {createServingV1RuntimeStorage} from '../scripts/serving-v1-runtime-core.mjs';
import {
  SERVING_V1_PRODUCT_REVISION,
  SERVING_V1_PRODUCT_SCHEMA,
  servingV1ProductInvariantReport,
} from '../scripts/serving-v1-product-core.mjs';
import {openServingV1ProductRuntime} from '../src/serving-v1-product-runtime.mjs';

function meta(db,schema){
  db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('schema',schema);
}
function createDummy(path,label){
  const db=new DatabaseSync(path);
  try{meta(db,label);}finally{db.close();}
}
function createDe(path){
  const db=new DatabaseSync(path);
  try{
    meta(db,'rhymelab-local-db-v5');
    db.exec(`
      CREATE TABLE hot(
        id INTEGER PRIMARY KEY,surface TEXT,normalized TEXT,ipa TEXT,phonemes TEXT,stress TEXT,
        pronunciation_eligible INTEGER,pronunciation_flags TEXT,usage_rank INTEGER,usage_score REAL,
        usage_count INTEGER,usage_source_count INTEGER,lemma TEXT,pos TEXT,gender TEXT,lexicon_layer TEXT,
        entity_kind TEXT,historical INTEGER,lexical_tags TEXT,pronunciation_preferred INTEGER,
        pronunciation_source TEXT,pronunciation_source_order INTEGER,pronunciation_evidence INTEGER,
        pronunciation_tags TEXT,pronunciation_raw_tags TEXT,locale TEXT,dialect TEXT,
        pronunciation_register TEXT,rhyme_tail TEXT,final_tail TEXT,vowels TEXT,consonants TEXT,
        coda_class TEXT,rhyme_syllables INTEGER,pronunciation_rank INTEGER
      );
    `);
    const ins=db.prepare(`
      INSERT INTO hot(
        id,surface,normalized,ipa,phonemes,stress,pronunciation_eligible,pronunciation_flags,
        usage_rank,usage_score,usage_count,usage_source_count,lemma,pos,gender,lexicon_layer,
        entity_kind,historical,lexical_tags,pronunciation_preferred,pronunciation_source,
        pronunciation_source_order,pronunciation_evidence,pronunciation_tags,pronunciation_raw_tags,
        locale,dialect,pronunciation_register,rhyme_tail,final_tail,vowels,consonants,coda_class,
        rhyme_syllables,pronunciation_rank
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    ins.run(
      1,'Zeit','zeit','tsaɪt','t s aɪ t','1',1,'[]',
      1,6.0,10,3,'zeit','noun','f','dictionary',null,0,'["common"]',1,
      'German Wiktionary',1,2,'[]','[]','de-DE',null,null,'aɪt','aɪt','aɪ','t','COR-STOP',1,1
    );
    ins.run(
      2,'Krankenscheindrucker','krankenscheindrucker','kʁaŋk','k ʁ a ŋ k','1',1,
      '["generated","secondary_opt_in"]',null,null,null,null,'krankenscheindrucker','noun',null,
      'dictionary',null,0,'[]',1,'eSpeak-NG Backfill V2',99,0,'["generated"]','["generated"]',
      'de-DE',null,null,'aŋk','aŋk','a','k','DOR-STOP',1,1
    );
  }finally{db.close();}
}
function createEn(path){
  const db=new DatabaseSync(path);
  try{
    meta(db,'rhymelab-en-writer-db-v1-candidate');
    db.exec(`
      CREATE TABLE en_form(
        id INTEGER PRIMARY KEY,normalized TEXT,surface_variants TEXT,poses TEXT,lemmas TEXT,
        relation_kinds TEXT,lexical_tags TEXT,evidence_kinds TEXT,esdb_archaic INTEGER,
        esdb_uncommon INTEGER,wordfreq_zipf REAL,default_eligible INTEGER
      );
      CREATE TABLE en_pronunciation(
        id INTEGER PRIMARY KEY,form_id INTEGER,source TEXT,raw TEXT,phonemes TEXT,stress TEXT,
        analysis_status TEXT,tags TEXT,evidence_count INTEGER,locales TEXT,locale_us INTEGER,
        locale_gb INTEGER,source_attested_unprofiled INTEGER,rhyme_tail TEXT,final_tail TEXT,
        vowel_key TEXT,coda_key TEXT,coda_class TEXT,rhyme_syllables INTEGER,rhotic INTEGER,
        default_profile_eligible INTEGER
      );
    `);
    db.prepare('INSERT INTO en_form VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(1,'time','["time"]','["noun"]','["time"]','[]','[]','[]',0,0,6.5,1);
    db.prepare('INSERT INTO en_pronunciation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(1,1,'cmudict','T AY1 M','t aɪ m','1','ok','[]',3,'["en-US"]',1,0,0,
        'aɪm','aɪm','aɪ','m','COR-NAS',1,0,1);
  }finally{db.close();}
}
function createPhrase(path){
  const db=new DatabaseSync(path);
  try{
    meta(db,'rhymelab-phrase-catalog-v1');
    db.exec(`
      CREATE TABLE phrase(
        phrase_id TEXT PRIMARY KEY,token_count INTEGER
      );
      CREATE TABLE phrase_pronunciation(
        phrase_pronunciation_id TEXT PRIMARY KEY,phrase_id TEXT,variant_rank INTEGER,eligible INTEGER,
        primary_stress_syllables_json TEXT,secondary_stress_syllables_json TEXT
      );
    `);
    db.prepare('INSERT INTO phrase VALUES(?,?)').run('phrase-1',3);
    db.prepare('INSERT INTO phrase_pronunciation VALUES(?,?,?,?,?,?)')
      .run('pp-1','phrase-1',1,1,'[2]','[]');
  }finally{db.close();}
}
function createEntity(path){
  const db=new DatabaseSync(path);
  try{
    meta(db,'rhymelab-entity-catalog-v1');
    db.exec(`
      CREATE TABLE entity(
        entity_id INTEGER PRIMARY KEY,qid TEXT,primary_category TEXT,popularity_score REAL,
        popularity_percentile REAL,popularity_tier TEXT
      );
      CREATE TABLE entity_category(
        entity_id INTEGER,category TEXT,category_score REAL,category_rank INTEGER,
        category_percentile REAL,category_tier TEXT,retention_percentile_floor REAL,
        retained_by_category INTEGER
      );
      CREATE TABLE entity_name(
        name_id INTEGER PRIMARY KEY,entity_id INTEGER,surface TEXT,normalized TEXT,language TEXT,
        script TEXT,name_kind TEXT,preferred INTEGER,searchable INTEGER,source_kind TEXT,source_record TEXT
      );
      CREATE TABLE entity_pronunciation(
        pronunciation_id INTEGER PRIMARY KEY,name_id INTEGER,locale TEXT,pronunciation_role TEXT,
        ipa TEXT,preferred INTEGER,source_kind TEXT,source_record TEXT,generated INTEGER,
        model_id TEXT,confidence REAL,review_state TEXT
      );
      CREATE TABLE entity_phonetic_analysis(
        pronunciation_id INTEGER,analyzer_id TEXT,phonemes TEXT,syllables TEXT,syllable_count INTEGER,
        primary_stress INTEGER,secondary_stress TEXT,stress_pattern TEXT,vowel_sequence TEXT,
        consonant_sequence TEXT,rhyme_tail TEXT,rhyme_signature TEXT
      );
      CREATE TABLE entity_rhyme_anchor(
        analyzer_id TEXT,channel TEXT,anchor_key TEXT,pronunciation_id INTEGER
      );
    `);
    db.prepare('INSERT INTO entity VALUES(?,?,?,?,?,?)').run(1,'Q1','person.musician',0.9,0.9,'A');
    db.prepare('INSERT INTO entity_category VALUES(?,?,?,?,?,?,?,?)')
      .run(1,'person.musician',0.9,1,0.9,'A',0,1);
    db.prepare('INSERT INTO entity_name VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(1,1,'Zeit','zeit','de','auto','label',1,1,'wikidata','Q1');
    db.prepare('INSERT INTO entity_pronunciation VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(1,1,'de-DE','source','tsaɪt',1,'wikidata_p898','Q1',0,null,1,'accepted_source_backed');
    db.prepare('INSERT INTO entity_phonetic_analysis VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
      1,'de-ipa-v2','["t","s","aɪ","t"]',
      '[{"position":1,"onset":["t","s"],"nucleus":"aɪ","coda":["t"],"stressLevel":2}]',
      1,1,'[]','2','aɪ','t','aɪ t','aɪt'
    );
    db.prepare('INSERT INTO entity_rhyme_anchor VALUES(?,?,?,?)')
      .run('de-ipa-v2','writer_secondary_anchor','aɪ-t',1);
  }finally{db.close();}
}

async function state(path){
  const s=await stat(path);
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    return {
      path,bytes:Number(s.size),mtime_ms:Math.trunc(Number(s.mtimeMs)),
      meta:Object.fromEntries(db.prepare('SELECT key,value FROM meta ORDER BY key').all().map(r=>[r.key,r.value])),
    };
  }finally{db.close();}
}

function insertSurface(db,id,language,normalized,surface,core,generated,role='lexical'){
  db.prepare(`
    INSERT INTO surface(
      surface_id,language,normalized,display_surface,canonical_available,generated_available,
      authority_rank,authority_kind,usage_rank,usage_count,historical,lemma,part_of_speech,lexicon_layer
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id,language,normalized,surface,core?1:0,generated?1:0,core?10:110,
    core?'core_word':'generated_word',id,null,0,normalized,role==='phrase'?'phrase':'noun',role);
  db.prepare('INSERT INTO surface_role VALUES(?,?,?,?)').run(id,role,1,0);
}
function insertPron(db,id,surfaceId,core,generated,ipa,phonemes,stress='1'){
  db.prepare(`
    INSERT INTO pronunciation(
      pronunciation_id,surface_id,identity_key,notation,raw,ipa,phonemes,syllable_count,stress_pattern,
      primary_stress,exact_key,multisyllable_key,vowel_key,vowel_family,coda_key,eligible,
      canonical_available,generated_available,canonical_preferred,generated_preferred,authority_rank,authority_kind
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id,surfaceId,phonemes+'|stress:'+stress,'ipa',ipa,ipa,phonemes,1,stress,1,
    'tail-'+id,null,'aɪ','AI','t',1,core?1:0,generated?1:0,core?1:0,generated?1:0,
    core?10:110,core?'core_word':'generated_word');
  db.prepare(`
    INSERT INTO pronunciation_origin(pronunciation_id,layer,domain,source_kind,origin_count)
    VALUES(?,?,?,?,1)
  `).run(id,core?'core':'generated','word',core?'source':'generated');
  db.prepare(`
    INSERT INTO runtime_target(
      target_id,target_kind,language,pronunciation_id,syllable_count,canonical_available,
      generated_available,canonical_preferred,generated_preferred
    )
    SELECT ?, 'pronunciation',language,?,?,?,?,?,? FROM surface WHERE surface_id=?
  `).run(id,id,1,core?1:0,generated?1:0,core?1:0,generated?1:0,surfaceId);
}

async function createServing(path,inputs){
  const db=new DatabaseSync(path);
  try{
    createServingV1Storage(db);
    createServingV1RuntimeStorage(db);
    insertSurface(db,1,'de','zeit','Zeit',true,false);
    insertPron(db,1,1,true,false,'tsaɪt','t s aɪ t');
    insertSurface(db,2,'de','krankenscheindrucker','Krankenscheindrucker',false,true);
    insertPron(db,2,2,false,true,'kʁaŋk','k ʁ a ŋ k');
    insertSurface(db,3,'en','time','time',true,false);
    insertPron(db,3,3,true,false,'taɪm','t aɪ m');
    insertSurface(db,4,'de','bei klarer reise','bei klarer Reise',true,false,'phrase');
    insertPron(db,4,4,true,false,'reise','b aɪ k l a ʁ ɐ ʁ aɪ z ə','01010');
    // Phrase pronunciation is not a word-origin.
    db.prepare("DELETE FROM pronunciation_origin WHERE pronunciation_id=4").run();
    db.prepare(`
      INSERT INTO runtime_phrase(
        runtime_phrase_id,source_layer,source_phrase_id,source_phrase_pronunciation_id,source_surface,
        surface_id,pronunciation_id,canonical_available,generated_available,phrase_types_json,
        historical_state,modern_eligible,style_tags_json,evidence_ready
      ) VALUES(1,'core','phrase-1','pp-1','bei klarer Reise',4,4,1,0,'["idiom"]','current_or_unmarked',1,'[]',1)
    `).run();

    for(const [key,val] of Object.entries({
      schema:'rhymelab-serving-v1',status:'complete',
      identity_revision:'canonical-phoneme-stress-v3',
      semantic_fingerprint:'a'.repeat(64),runtime_status:'complete',
      runtime_semantic_fingerprint:'b'.repeat(64),
      source_snapshot_json:JSON.stringify({inputs,generated_acceptance:{}}),
    })){
      db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(key,String(val));
    }
  }finally{db.close();}
}

function run(args){
  return spawnSync(process.execPath,['--no-warnings','scripts/build-serving-v1-product.mjs',...args],{
    cwd:process.cwd(),encoding:'utf8',
  });
}

test('Product metadata builder plans read-only, checkpoints, resumes and atomically promotes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'rhymelab-product-build-'));
  try{
    const files={
      deCore:join(root,'de-core.sqlite'),enCore:join(root,'en-core.sqlite'),
      phraseCore:join(root,'phrase-core.sqlite'),entityCore:join(root,'entity-core.sqlite'),
      deGenerated:join(root,'de-generated.sqlite'),enGenerated:join(root,'en-generated.sqlite'),
      phraseGenerated:join(root,'phrase-generated.sqlite'),entityGenerated:join(root,'entity-generated.sqlite'),
    };
    createDummy(files.deCore,'de-core');
    createDummy(files.enCore,'en-core');
    createDummy(files.phraseCore,'phrase-core');
    createDummy(files.entityCore,'entity-core');
    createDe(files.deGenerated);
    createEn(files.enGenerated);
    createPhrase(files.phraseGenerated);
    createEntity(files.entityGenerated);
    const inputs={};
    for(const [key,path] of Object.entries(files))inputs[key]=await state(path);

    const serving=join(root,'serving.sqlite');
    await createServing(serving,inputs);
    const work=join(root,'product.building.sqlite');
    const report=join(root,'product-report.json');
    const backup=join(root,'serving.pre-product.sqlite');
    const common=['--serving',serving,'--work',work,'--report',report,'--backup',backup,'--batch-size','1000'];

    const plan=run([...common,'--plan']);
    assert.equal(plan.status,0,plan.stderr||plan.stdout);
    assert.equal(existsSync(work),false);

    const paused=run([...common,'--pause-after-stage','01_de_profiles']);
    assert.equal(paused.status,0,paused.stderr||paused.stdout);
    assert.equal(existsSync(work),true);
    assert.equal(existsSync(backup),false);

    const resumed=run(common);
    assert.equal(resumed.status,0,resumed.stderr||resumed.stdout);
    assert.match(resumed.stdout,/DE lexical\/pronunciation metadata already complete/);
    assert.equal(existsSync(work),false);
    assert.equal(existsSync(backup),true);
    assert.equal(existsSync(report),true);

    const promoted=new DatabaseSync(serving,{readOnly:true});
    try{
      const m=Object.fromEntries(promoted.prepare('SELECT key,value FROM meta').all().map(r=>[r.key,r.value]));
      assert.equal(m.product_adapter_schema,SERVING_V1_PRODUCT_SCHEMA);
      assert.equal(m.product_adapter_revision,SERVING_V1_PRODUCT_REVISION);
      assert.equal(m.product_adapter_status,'complete');
      assert.equal(servingV1ProductInvariantReport(promoted).ok,true);
    }finally{promoted.close();}

    const runtime=openServingV1ProductRuntime(serving);
    try{
      assert.equal(runtime.allDb.prepare("SELECT COUNT(*) c FROM hot").get().c,2);
      assert.equal(runtime.coreDb.prepare("SELECT COUNT(*) c FROM hot").get().c,1);
      assert.equal(runtime.allDb.prepare("SELECT COUNT(*) c FROM entity_rhyme_anchor WHERE channel='writer_secondary_anchor'").get().c,1);
      assert.equal(runtime.allDb.prepare('SELECT COUNT(*) c FROM runtime_de_surface_profile').get().c,2);
      assert.equal(runtime.allDb.prepare('SELECT COUNT(*) c FROM runtime_entity_analysis').get().c,1);
      assert.equal(runtime.allDb.prepare('SELECT COUNT(*) c FROM runtime_entity_anchor_occurrence').get().c,1);
    }finally{runtime.close();}
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
