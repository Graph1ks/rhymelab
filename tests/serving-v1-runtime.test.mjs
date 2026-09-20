import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServingV1Storage } from '../scripts/serving-v1-core.mjs';
import {
  SERVING_V1_RUNTIME_SCHEMA,
  runtimeLookupTargets,
  servingV1RuntimeInvariantReport,
} from '../scripts/serving-v1-runtime-core.mjs';

function createMeta(db,schema){
  db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('schema',schema);
}

function createDe(path,{generated=false}={}){
  const db=new DatabaseSync(path);
  try{
    createMeta(db,'rhymelab-local-db-v5');
    db.exec(`
      CREATE TABLE hot(
        id INTEGER PRIMARY KEY,publish_order INTEGER,surface TEXT,normalized TEXT,ipa TEXT,phonemes TEXT,
        stress TEXT,pronunciation_eligible INTEGER,pronunciation_flags TEXT,
        exact_key TEXT,multisyllable_key TEXT,vowel_key TEXT,vowel_family TEXT,coda_key TEXT,coda_class TEXT,
        pronunciation_preferred INTEGER,historical INTEGER,usage_rank INTEGER
      );
      CREATE TABLE writer_anchor(anchor_key TEXT,pronunciation_id INTEGER,PRIMARY KEY(anchor_key,pronunciation_id)) WITHOUT ROWID;
      CREATE TABLE form_analysis(form_id INTEGER,analysis_key TEXT,normalized_lemma TEXT,pos TEXT);
      CREATE TABLE writer_morphology_evidence(
        form_id INTEGER,analysis_key TEXT,family_key TEXT,construction_rule TEXT,
        split_index INTEGER,left_normalized TEXT,right_normalized TEXT,right_head_analysis_key TEXT,
        PRIMARY KEY(form_id,analysis_key)
      ) WITHOUT ROWID;
    `);
    const insert=db.prepare('INSERT INTO hot VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    if(!generated){
      insert.run(1,1,'Arbeitsweise','arbeitsweise','a','a r b aɪ t s v aɪ z ə','10010',1,'[]','tail-a', 'multi-a','a-aɪ','A-AI','z ə','open',1,0,100);
      insert.run(2,2,'Hochzeitsreise','hochzeitsreise','b','h ɔ x t s aɪ t s r aɪ z ə','10010',1,'[]','tail-b','multi-b','ɔ-aɪ-aɪ','O-AI-AI','z ə','open',1,0,200);
      insert.run(3,3,'Metallica','metallica','c','m ɛ t a l ɪ k a','0010',1,'[]','tail-c','multi-c','ɛ-a-ɪ-a','E-A-I-A','k a','open',1,0,300);
      db.prepare('INSERT INTO writer_anchor VALUES(?,?)').run('aɪ-zə',2);
      db.prepare('INSERT INTO form_analysis VALUES(?,?,?,?)').run(1,'a1','arbeitsweise','noun');
      db.prepare('INSERT INTO writer_morphology_evidence VALUES(?,?,?,?,?,?,?,?)')
        .run(1,'a1','right:weise','de-adverbial-weise-v2',7,'arbeit','weise','weise:a1');
    }else{
      insert.run(4,4,'Krankenscheindrucker','krankenscheindrucker','d','k r a ŋ k n ʃ aɪ n d r ʊ k ɐ','10000',1,'["generated","secondary_opt_in"]','tail-d','multi-d','a-aɪ-ʊ-ɐ','A-AI-U-A','k ɐ','open',1,0,null);
      insert.run(5,5,'Metallica','metallica','c','m ɛ t a l ɪ k a','0010',1,'["generated","secondary_opt_in"]','tail-c','multi-c','ɛ-a-ɪ-a','E-A-I-A','k a','open',1,0,null);
      db.prepare('INSERT INTO writer_anchor VALUES(?,?)').run('aɪ-ʊ-ɐ',4);
      db.prepare('INSERT INTO writer_anchor VALUES(?,?)').run('ɛ-a-ɪ-a',5);
    }
  }finally{db.close();}
}

function createEn(path,{generated=false}={}){
  const db=new DatabaseSync(path);
  try{
    createMeta(db,'rhymelab-en-writer-db-v1-candidate');
    db.exec(`
      CREATE TABLE en_form(id INTEGER PRIMARY KEY,normalized TEXT,default_eligible INTEGER);
      CREATE TABLE en_pronunciation(
        id INTEGER PRIMARY KEY,form_id INTEGER,source TEXT,raw TEXT,phonemes TEXT,stress TEXT,
        analysis_status TEXT,default_profile_eligible INTEGER,exact_key TEXT,multisyllable_key TEXT,
        vowel_key TEXT,vowel_family TEXT,coda_key TEXT,coda_class TEXT
      );
    `);
    if(!generated){
      db.prepare('INSERT INTO en_form VALUES(?,?,?)').run(1,'time',1);
      db.prepare('INSERT INTO en_pronunciation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(1,1,'cmudict','T AY1 M','t aɪ m','1','ok',1,'aɪm',null,'aɪ','AI','m','m');
    }else{
      db.prepare('INSERT INTO en_form VALUES(?,?,?)').run(2,'chime',1);
      db.prepare('INSERT INTO en_pronunciation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(2,2,'espeak_ng_generated_secondary','tʃaɪm','tʃ aɪ m','1','ok',1,'aɪm',null,'aɪ','AI','m','m');
    }
  }finally{db.close();}
}

function createEntity(path,{generated=false}={}){
  const db=new DatabaseSync(path);
  try{
    createMeta(db,'rhymelab-entity-catalog-v1');
    db.exec(`
      CREATE TABLE entity_name(
        name_id INTEGER PRIMARY KEY,normalized TEXT,language TEXT,searchable INTEGER
      );
      CREATE TABLE entity_pronunciation(
        pronunciation_id INTEGER PRIMARY KEY,name_id INTEGER,ipa TEXT,source_kind TEXT,review_state TEXT,locale TEXT
      );
      CREATE TABLE entity_phonetic_analysis(
        pronunciation_id INTEGER,phonemes TEXT,stress_pattern TEXT
      );
      CREATE TABLE entity_rhyme_anchor(
        analyzer_id TEXT,channel TEXT,anchor_key TEXT,pronunciation_id INTEGER,
        PRIMARY KEY(analyzer_id,channel,anchor_key,pronunciation_id)
      ) WITHOUT ROWID;
    `);
    if(!generated){
      db.prepare('INSERT INTO entity_name VALUES(?,?,?,?)').run(1,'metallica','de',1);
      db.prepare('INSERT INTO entity_pronunciation VALUES(?,?,?,?,?,?)')
        .run(1,1,'c','wikidata_p898','accepted_source_backed','de-DE');
      db.prepare('INSERT INTO entity_phonetic_analysis VALUES(?,?,?)').run(1,'m ɛ t a l ɪ k a','0010');
      db.prepare('INSERT INTO entity_rhyme_anchor VALUES(?,?,?,?)')
        .run('de-ipa-v2','exact_tail','tail-c',1);
    }else{
      db.prepare('INSERT INTO entity_name VALUES(?,?,?,?)').run(2,'future star','en',1);
      db.prepare('INSERT INTO entity_pronunciation VALUES(?,?,?,?,?,?)')
        .run(2,2,'f','espeak_ng_generated_secondary','accepted','en-US');
      db.prepare('INSERT INTO entity_phonetic_analysis VALUES(?,?,?)').run(2,'f j u tʃ ɚ s t ɑ ɹ','100');
      db.prepare('INSERT INTO entity_rhyme_anchor VALUES(?,?,?,?)')
        .run('en-pron-v1-candidate','vowel_sequence','u-ɚ-ɑ',2);
    }
  }finally{db.close();}
}

function createPhrase(path,{generated=false}={}){
  const db=new DatabaseSync(path);
  try{
    createMeta(db,'rhymelab-phrase-catalog-v1');
    db.exec(`
      CREATE TABLE phrase(
        phrase_id TEXT PRIMARY KEY,normalized TEXT,canonical TEXT,phrase_types_json TEXT,
        historical_state TEXT,modern_eligible INTEGER
      );
      CREATE TABLE phrase_pronunciation(
        phrase_pronunciation_id TEXT PRIMARY KEY,phrase_id TEXT,ipa TEXT,canonical_phonemes TEXT,
        stress_pattern TEXT,eligible INTEGER
      );
      CREATE TABLE phrase_pronunciation_token(
        phrase_pronunciation_id TEXT,pronunciation_source TEXT
      );
      CREATE TABLE phrase_snapshot(snapshot_id TEXT PRIMARY KEY,snapshot_label TEXT);
      CREATE TABLE phrase_usage_evidence(
        phrase_id TEXT,snapshot_id TEXT,policy TEXT,occurrence_count INTEGER,sentence_count INTEGER,
        per_million_tokens REAL,per_million_sentences REAL
      );
      CREATE TABLE phrase_attestation(
        attestation_id TEXT PRIMARY KEY,phrase_id TEXT,style_tags_json TEXT
      );
      CREATE TABLE phrase_mosaic_window(
        window_id TEXT PRIMARY KEY,phrase_pronunciation_id TEXT,
        syllable_start INTEGER,syllable_end INTEGER,syllable_count INTEGER,
        phoneme_start INTEGER,phoneme_end INTEGER,phoneme_count INTEGER,
        token_start_index INTEGER,token_end_index INTEGER,token_count INTEGER,
        crossed_word_boundaries INTEGER,starts_inside_token INTEGER,ends_inside_token INTEGER,
        phoneme_key TEXT,vowel_key TEXT,stress_pattern TEXT,final_coda_key TEXT
      );
      CREATE TABLE phrase_mosaic_retrieval_anchor(
        window_id TEXT PRIMARY KEY,exact_tail_key TEXT,final_nucleus TEXT,final_coda_class TEXT
      );
      CREATE TABLE phrase_mosaic_retrieval_v2_anchor(
        window_id TEXT PRIMARY KEY,vowel_family_key TEXT
      );
    `);
    const id=generated?'p2':'p1';
    const pp=generated?'pp2':'pp1';
    const normalized=generated?'generierte phrase':'bei klarer reise';
    const canonical=generated?'Generierte Phrase':'bei klarer Reise';
    const phonemes=generated?'g e n ə r i ə t ə f r a z ə':'b aɪ k l a r ə r aɪ z ə';
    const stress=generated?'100100':'01010';
    db.prepare('INSERT INTO phrase VALUES(?,?,?,?,?,?)')
      .run(id,normalized,canonical,'["idiom"]','current_or_unmarked',1);
    db.prepare('INSERT INTO phrase_pronunciation VALUES(?,?,?,?,?,?)')
      .run(pp,id,generated?'gen':'reise',phonemes,stress,1);
    db.prepare('INSERT INTO phrase_pronunciation_token VALUES(?,?)')
      .run(pp,generated?'eSpeak-NG Backfill V2':'German Wiktionary');

    const corpora=['deu_news_2024_1M','deu_wikipedia_2021_1M','deu-de_web_2021_1M'];
    for(let i=0;i<corpora.length;i++){
      const sid='s'+i;
      db.prepare('INSERT INTO phrase_snapshot VALUES(?,?)').run(sid,corpora[i]);
      db.prepare('INSERT INTO phrase_usage_evidence VALUES(?,?,?,?,?,?,?)')
        .run(id,sid,'leipzig-exact-token-sequence-v1',10+i,8+i,1+i,2+i);
    }
    db.prepare('INSERT INTO phrase_attestation VALUES(?,?,?)')
      .run('a1',id,'["modern","spoken"]');
    const window='w-'+pp;
    db.prepare('INSERT INTO phrase_mosaic_window VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(window,pp,0,2,2,0,4,4,0,1,2,1,0,0,'p h','aɪ-a','10','z ə');
    db.prepare('INSERT INTO phrase_mosaic_retrieval_anchor VALUES(?,?,?,?)')
      .run(window,generated?'tail-gen':'tail-reise','ə','open');
    db.prepare('INSERT INTO phrase_mosaic_retrieval_v2_anchor VALUES(?,?)')
      .run(window,generated?'E-A':'AI-A');
  }finally{db.close();}
}

async function sourceState(path){
  const info=await stat(path);
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    const meta=Object.fromEntries(db.prepare('SELECT key,value FROM meta ORDER BY key').all().map((row)=>[row.key,row.value]));
    return {path,bytes:Number(info.size),mtime_ms:Math.trunc(Number(info.mtimeMs)),meta};
  }finally{db.close();}
}

function insertServingSurface(db,row){
  db.prepare(`
    INSERT INTO surface(
      surface_id,language,normalized,display_surface,canonical_available,generated_available,
      authority_rank,authority_kind,usage_rank,historical,lemma,part_of_speech,lexicon_layer
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id,row.language,row.normalized,row.surface,row.core?1:0,row.generated?1:0,
    row.core?10:110,row.core?'core_word':'generated_word',row.usageRank??null,0,
    row.lemma??row.normalized,row.pos??null,row.role==='phrase'?'phrase':'dictionary'
  );
  db.prepare('INSERT INTO surface_role(surface_id,role,canonical_available,generated_available) VALUES(?,?,?,?)')
    .run(row.id,row.role||'lexical',row.core?1:0,row.generated?1:0);
}

function insertServingPron(db,row){
  db.prepare(`
    INSERT INTO pronunciation(
      pronunciation_id,surface_id,identity_key,notation,raw,ipa,phonemes,syllable_count,
      stress_pattern,primary_stress,exact_key,multisyllable_key,vowel_key,vowel_family,coda_key,
      eligible,canonical_available,generated_available,canonical_preferred,generated_preferred,
      authority_rank,authority_kind
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id,row.surfaceId,row.phonemes+'|stress:'+row.stress,'ipa',row.raw??row.ipa,row.ipa??null,
    row.phonemes,row.syllables??1,row.stress,0,row.exact??null,row.multi??null,row.vowel??null,
    row.family??null,row.coda??null,1,row.core?1:0,row.generated?1:0,row.core?1:0,row.generated?1:0,
    row.core?10:110,row.core?'core_word':'generated_word'
  );
}

async function createServing(path,sourcePaths){
  const db=new DatabaseSync(path);
  try{
    createServingV1Storage(db);
    const surfaces=[
      {id:1,language:'de',normalized:'arbeitsweise',surface:'Arbeitsweise',core:true,role:'lexical',usageRank:100,pos:'noun'},
      {id:2,language:'de',normalized:'hochzeitsreise',surface:'Hochzeitsreise',core:true,role:'lexical',usageRank:200,pos:'noun'},
      {id:3,language:'de',normalized:'krankenscheindrucker',surface:'Krankenscheindrucker',generated:true,role:'lexical'},
      {id:4,language:'en',normalized:'time',surface:'time',core:true,role:'lexical',usageRank:1,pos:'noun'},
      {id:5,language:'en',normalized:'chime',surface:'chime',generated:true,role:'lexical'},
      {id:6,language:'de',normalized:'bei klarer reise',surface:'bei klarer Reise',core:true,role:'phrase'},
      {id:7,language:'de',normalized:'generierte phrase',surface:'Generierte Phrase',generated:true,role:'phrase'},
      {id:8,language:'en',normalized:'future star',surface:'Future Star',generated:true,role:'person.rapper'},
      {id:9,language:'de',normalized:'metallica',surface:'Metallica',core:true,role:'lexical',usageRank:300},
    ];
    for(const row of surfaces)insertServingSurface(db,row);
    db.prepare('INSERT INTO surface_role VALUES(?,?,?,?)').run(9,'group.music_group',1,0);
    const prons=[
      {id:1,surfaceId:1,core:true,phonemes:'a r b aɪ t s v aɪ z ə',stress:'10010',ipa:'a',syllables:5,exact:'tail-a',multi:'multi-a',vowel:'a-aɪ',family:'A-AI',coda:'z ə'},
      {id:2,surfaceId:2,core:true,phonemes:'h ɔ x t s aɪ t s r aɪ z ə',stress:'10010',ipa:'b',syllables:5,exact:'tail-b',multi:'multi-b',vowel:'ɔ-aɪ-aɪ',family:'O-AI-AI',coda:'z ə'},
      {id:3,surfaceId:3,generated:true,phonemes:'k r a ŋ k n ʃ aɪ n d r ʊ k ɐ',stress:'10000',ipa:'d',syllables:5,exact:'tail-d',multi:'multi-d',vowel:'a-aɪ-ʊ-ɐ',family:'A-AI-U-A',coda:'k ɐ'},
      {id:4,surfaceId:4,core:true,phonemes:'t aɪ m',stress:'1',raw:'T AY1 M',syllables:1,exact:'aɪm',vowel:'aɪ',family:'AI',coda:'m'},
      {id:5,surfaceId:5,generated:true,phonemes:'tʃ aɪ m',stress:'1',ipa:'tʃaɪm',syllables:1,exact:'aɪm',vowel:'aɪ',family:'AI',coda:'m'},
      {id:6,surfaceId:6,core:true,phonemes:'b aɪ k l a r ə r aɪ z ə',stress:'01010',ipa:'reise',syllables:5,exact:'tail-reise',vowel:'aɪ-a',family:'AI-A',coda:'z ə'},
      {id:7,surfaceId:7,generated:true,phonemes:'g e n ə r i ə t ə f r a z ə',stress:'100100',ipa:'gen',syllables:6,exact:'tail-gen',vowel:'e-a',family:'E-A',coda:'z ə'},
      {id:8,surfaceId:8,generated:true,phonemes:'f j u tʃ ɚ s t ɑ ɹ',stress:'100',ipa:'f',syllables:3},
      {id:9,surfaceId:9,core:true,phonemes:'m ɛ t a l ɪ k a',stress:'0010',ipa:'c',syllables:4,exact:'tail-c',vowel:'ɛ-a-ɪ-a',family:'E-A-I-A',coda:'k a'},
    ];
    for(const row of prons)insertServingPron(db,row);

    const inputs={};
    for(const [key,sourcePath] of Object.entries(sourcePaths))inputs[key]=await sourceState(sourcePath);
    const meta=db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
    for(const [key,val] of Object.entries({
      schema:'rhymelab-serving-v1',
      status:'complete',
      semantic_fingerprint:'a'.repeat(64),
      source_fingerprint:'b'.repeat(64),
      source_snapshot_json:JSON.stringify({inputs,generated_acceptance:{}}),
    }))meta.run(key,String(val));
  }finally{db.close();}
}

function runBuilder(args){
  return spawnSync(process.execPath,['--no-warnings','scripts/build-serving-v1-runtime.mjs',...args],{
    cwd:process.cwd(),encoding:'utf8'
  });
}

test('Serving-v1 runtime materializer plans read-only, resumes safely, and builds compact unified runtime indexes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'rhymelab-serving-runtime-'));
  try{
    const paths={
      deCore:join(root,'de-core.sqlite'),
      enCore:join(root,'en-core.sqlite'),
      phraseCore:join(root,'phrase-core.sqlite'),
      entityCore:join(root,'entity-core.sqlite'),
      deGenerated:join(root,'de-generated.sqlite'),
      enGenerated:join(root,'en-generated.sqlite'),
      phraseGenerated:join(root,'phrase-generated.sqlite'),
      entityGenerated:join(root,'entity-generated.sqlite'),
    };
    createDe(paths.deCore);
    createEn(paths.enCore);
    createPhrase(paths.phraseCore);
    createEntity(paths.entityCore);
    createDe(paths.deGenerated,{generated:true});
    createEn(paths.enGenerated,{generated:true});
    createPhrase(paths.phraseGenerated,{generated:true});
    createEntity(paths.entityGenerated,{generated:true});

    const serving=join(root,'serving.sqlite');
    const work=join(root,'runtime.building.sqlite');
    const report=join(root,'runtime-report.json');
    const backup=join(root,'serving.pre-runtime.sqlite');
    await createServing(serving,paths);

    const common=['--serving',serving,'--work',work,'--report',report,'--backup',backup,'--batch-size','1000'];

    const plan=runBuilder([...common,'--plan']);
    assert.equal(plan.status,0,plan.stderr||plan.stdout);
    assert.equal(existsSync(work),false,'read-only plan must not create the runtime work copy');
    assert.match(plan.stdout,/"read_only_plan": true/);

    const paused=runBuilder([...common,'--pause-after-stage','01_pronunciation_targets']);
    assert.equal(paused.status,0,paused.stderr||paused.stdout);
    assert.equal(existsSync(work),true);
    assert.equal(existsSync(backup),false);
    const baseBefore=new DatabaseSync(serving,{readOnly:true});
    try{
      assert.equal(baseBefore.prepare("SELECT value FROM meta WHERE key='runtime_schema'").get(),undefined);
    }finally{baseBefore.close();}

    const resumed=runBuilder(common);
    assert.equal(resumed.status,0,resumed.stderr||resumed.stdout);
    assert.match(resumed.stdout,/Serving pronunciation targets already complete/);
    assert.equal(existsSync(work),false);
    assert.equal(existsSync(backup),true);
    assert.equal(existsSync(report),true);

    const builtReport=JSON.parse(await readFile(report,'utf8'));
    assert.equal(builtReport.status,'ok');
    assert.equal(builtReport.invariants.ok,true);
    assert.ok(builtReport.summary.retrievalKeyRows>0);
    assert.equal(builtReport.summary.phraseEvidenceReady,2);

    const db=new DatabaseSync(serving,{readOnly:true});
    try{
      assert.equal(db.prepare("SELECT value FROM meta WHERE key='runtime_schema'").get()?.value,SERVING_V1_RUNTIME_SCHEMA);
      const invariants=servingV1RuntimeInvariantReport(db);
      assert.equal(invariants.ok,true);
      assert.equal(invariants.canonical_targets_marked_generated,0);

      const rightEdge=runtimeLookupTargets(db,{
        language:'de',channel:'writer_right_edge',keyValue:'aɪ-zə',mode:'core',targetKind:'pronunciation',limit:20,
      });
      assert.deepEqual(rightEdge.map((row)=>row.normalized),['hochzeitsreise']);

      const generated=runtimeLookupTargets(db,{
        language:'de',channel:'writer_right_edge',keyValue:'aɪ-ʊ-ɐ',mode:'generated',targetKind:'pronunciation',limit:20,
      });
      assert.deepEqual(generated.map((row)=>row.normalized),['krankenscheindrucker']);

      const duplicateGeneratedMetallica=runtimeLookupTargets(db,{
        language:'de',channel:'writer_right_edge',keyValue:'ɛ-a-ɪ-a',mode:'generated',targetKind:'pronunciation',limit:20,
      });
      assert.equal(duplicateGeneratedMetallica.length,0);

      const morphology=db.prepare(`
        SELECT m.* FROM runtime_surface_morphology m
        JOIN surface s USING(surface_id)
        WHERE s.normalized='arbeitsweise' AND s.language='de'
      `).get();
      assert.equal(morphology.status,'attested_right_head_candidate');
      assert.equal(morphology.family_key,'right:weise');

      const phrase=db.prepare(`
        SELECT * FROM runtime_phrase WHERE source_phrase_id='p1'
      `).get();
      assert.equal(phrase.evidence_ready,1);
      assert.ok(Number(phrase.commonness_score)>0);
      assert.deepEqual(JSON.parse(phrase.style_tags_json),['modern','spoken']);
      assert.equal(phrase.surface_safety_class,'safe');

      const phraseTargets=db.prepare("SELECT COUNT(*) c FROM runtime_target WHERE target_kind='phrase_window'").get();
      assert.equal(Number(phraseTargets.c),2);

      const entityGenerated=runtimeLookupTargets(db,{
        language:'en',channel:'entity_vowel_sequence',keyValue:'u-ɚ-ɑ',mode:'generated',targetKind:'pronunciation',limit:20,
      });
      assert.deepEqual(entityGenerated.map((row)=>row.normalized),['future star']);
    }finally{db.close();}

    const equivalenceReport=join(root,'equivalence-report.json');
    const equivalence=spawnSync(
      process.execPath,
      ['--no-warnings','scripts/verify-serving-v1-runtime-equivalence.mjs',
        '--serving',serving,'--report',equivalenceReport,'--sample','20'],
      {cwd:process.cwd(),encoding:'utf8'},
    );
    assert.equal(equivalence.status,0,equivalence.stderr||equivalence.stdout);
    const equivalenceJson=JSON.parse(await readFile(equivalenceReport,'utf8'));
    assert.equal(equivalenceJson.status,'accepted');
    assert.equal(equivalenceJson.totals.failed,0);
    assert.ok(equivalenceJson.totals.cases>0);

    const backupDb=new DatabaseSync(backup,{readOnly:true});
    try{
      assert.equal(backupDb.prepare("SELECT value FROM meta WHERE key='runtime_schema'").get(),undefined);
    }finally{backupDb.close();}
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
