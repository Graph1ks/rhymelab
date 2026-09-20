import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function meta(db,schema){
  db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('schema',schema);
}

function createDe(path,{generated=false}={}){
  const db=new DatabaseSync(path);
  try{
    meta(db,'rhymelab-local-db-v5');
    db.exec(`
      CREATE TABLE hot(
        id INTEGER PRIMARY KEY,surface TEXT,normalized TEXT,ipa TEXT,phonemes TEXT,
        syllable_count INTEGER,stress TEXT,primary_stress INTEGER,
        exact_key TEXT,multisyllable_key TEXT,vowel_key TEXT,vowel_family TEXT,coda_key TEXT,
        pronunciation_eligible INTEGER,pronunciation_preferred INTEGER,
        usage_rank INTEGER,usage_count INTEGER,historical INTEGER,lemma TEXT,pos TEXT,
        lexicon_layer TEXT,pronunciation_source TEXT,pronunciation_flags TEXT
      );
    `);
    const insert=db.prepare(`
      INSERT INTO hot VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    insert.run(
      1,'Metallica','metallica','mɛtaˈlɪka','m ɛ t a l ɪ k a',4,'0010',2,
      'a-lɪ-ka','lɪ-ka','ɛ-a-ɪ-a','A-I-A','k-a',1,1,10,5000,0,'Metallica','proper_noun',
      'dictionary','German Wiktionary','[]'
    );
    insert.run(
      2,'Echo','echo','ˈɛço','ɛ ç o',2,'10',0,
      'ɛ-ço',null,'ɛ-o','E-O','ç-o',1,1,20,4000,0,'Echo','noun',
      'dictionary','German Wiktionary','[]'
    );
    if(generated){
      insert.run(
        3,'Metallica','metallica','mɛtaˈlɪka','m ɛ t a l ɪ k a',4,'0010',2,
        'a-lɪ-ka','lɪ-ka','ɛ-a-ɪ-a','A-I-A','k-a',1,1,null,null,0,null,null,
        'dictionary','eSpeak-NG Backfill V2','["generated","secondary_opt_in"]'
      );
      insert.run(
        4,'Krankenscheindrucker','krankenscheindrucker','ˈkʁaŋkn̩ʃaɪ̯ndʁʊkɐ',
        'k ʁ a ŋ k n ʃ aɪ n d ʁ ʊ k ɐ',5,'10000',0,
        'aɪ-n-dʁʊ-kɐ','dʁʊ-kɐ','a-aɪ-ʊ-ɐ','A-AI-U-A','k-ɐ',1,1,null,null,0,null,null,
        'dictionary','eSpeak-NG Backfill V2','["generated","secondary_opt_in"]'
      );
    }
  }finally{db.close();}
}

function createEn(path,{generated=false}={}){
  const db=new DatabaseSync(path);
  try{
    meta(db,'rhymelab-en-writer-db-v1-candidate');
    db.exec(`
      CREATE TABLE en_form(
        id INTEGER PRIMARY KEY,surface TEXT,normalized TEXT,wordfreq_rank INTEGER,
        historical_only INTEGER,lemmas TEXT,poses TEXT
      );
      CREATE TABLE en_pronunciation(
        id INTEGER PRIMARY KEY,form_id INTEGER,source TEXT,notation TEXT,raw TEXT,
        phonemes TEXT,syllable_count INTEGER,stress TEXT,primary_stress INTEGER,
        exact_key TEXT,multisyllable_key TEXT,vowel_key TEXT,vowel_family TEXT,coda_key TEXT,
        default_profile_eligible INTEGER,analysis_status TEXT
      );
    `);
    db.prepare('INSERT INTO en_form VALUES(?,?,?,?,?,?,?)')
      .run(1,'time','time',1,0,'["time"]','["noun"]');
    db.prepare('INSERT INTO en_pronunciation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(1,1,'cmudict','arpabet','T AY1 M','t aɪ m',1,'1',0,'aɪ-m',null,'aɪ','AI','m',1,'ok');
    if(generated){
      db.prepare('INSERT INTO en_form VALUES(?,?,?,?,?,?,?)')
        .run(2,'dictionnary','dictionnary',null,0,'[]','[]');
      db.prepare('INSERT INTO en_pronunciation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          2,2,'espeak_ng_generated_secondary','ipa','ˈdɪkʃənɛɹi','d ɪ k ʃ ə n ɛ ɹ i',
          4,'1000',0,'ɛ-ɹ-i','ɹ-i','ɪ-ə-ɛ-i','I-A-E-I','ɹ-i',1,'ok'
        );
    }
  }finally{db.close();}
}

function createPhrase(path,{generated=false}={}){
  const db=new DatabaseSync(path);
  try{
    meta(db,'rhymelab-phrase-catalog-v1');
    db.exec(`
      CREATE TABLE phrase(
        phrase_id TEXT PRIMARY KEY,canonical TEXT,normalized TEXT,historical_state TEXT
      );
      CREATE TABLE phrase_pronunciation(
        phrase_pronunciation_id TEXT PRIMARY KEY,phrase_id TEXT,variant_rank INTEGER,
        ipa TEXT,canonical_phonemes TEXT,syllable_count INTEGER,stress_pattern TEXT,
        exact_tail_key TEXT,multisyllable_key TEXT,vowel_key TEXT,vowel_family_key TEXT,
        coda_key TEXT,eligible INTEGER
      );
      CREATE TABLE phrase_pronunciation_token(
        phrase_pronunciation_id TEXT,pronunciation_source TEXT
      );
    `);
    db.prepare('INSERT INTO phrase VALUES(?,?,?,?)')
      .run('p1','bei klarer Reise','bei klarer reise','current_or_unmarked');
    db.prepare('INSERT INTO phrase_pronunciation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        'pp1','p1',1,'baɪ̯ klaːʁɐ ʁaɪ̯zə','b aɪ k l a ʁ ɐ ʁ aɪ z ə',
        5,'01010','aɪ-z-ə','ʁ-aɪ-z-ə','aɪ-a-ɐ-aɪ-ə','AI-A-A-AI-A','z-ə',1
      );
    db.prepare('INSERT INTO phrase_pronunciation_token VALUES(?,?)')
      .run('pp1','German Wiktionary');
    if(generated){
      db.prepare('INSERT INTO phrase VALUES(?,?,?,?)')
        .run('p2','generierte Phrase','generierte phrase','current_or_unmarked');
      db.prepare('INSERT INTO phrase_pronunciation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          'pp2','p2',1,'genəʁiːɐ̯tə fʁaːzə','g e n ə ʁ i ɐ t ə f ʁ a z ə',
          6,'100100','a-z-ə','f-ʁ-a-z-ə','e-ə-i-ɐ-ə-a-ə','E-A-I-A-A-A-A','z-ə',1
        );
      db.prepare('INSERT INTO phrase_pronunciation_token VALUES(?,?)')
        .run('pp2','eSpeak-NG Backfill V2');
    }
  }finally{db.close();}
}

function createEntity(path,{generated=false}={}){
  const db=new DatabaseSync(path);
  try{
    meta(db,'rhymelab-entity-catalog-v1');
    db.exec(`
      CREATE TABLE entity(
        entity_id INTEGER PRIMARY KEY,qid TEXT,primary_category TEXT,popularity_score REAL
      );
      CREATE TABLE entity_name(
        name_id INTEGER PRIMARY KEY,entity_id INTEGER,surface TEXT,normalized TEXT,
        language TEXT,searchable INTEGER
      );
      CREATE TABLE entity_category(entity_id INTEGER,category TEXT);
      CREATE TABLE entity_pronunciation(
        pronunciation_id INTEGER PRIMARY KEY,name_id INTEGER,ipa TEXT,preferred INTEGER,
        source_kind TEXT,review_state TEXT
      );
      CREATE TABLE entity_phonetic_analysis(
        pronunciation_id INTEGER,analyzer_id TEXT,phonemes TEXT,syllable_count INTEGER,
        stress_pattern TEXT,primary_stress INTEGER
      );
    `);
    const entity=db.prepare('INSERT INTO entity VALUES(?,?,?,?)');
    const name=db.prepare('INSERT INTO entity_name VALUES(?,?,?,?,?,?)');
    const category=db.prepare('INSERT INTO entity_category VALUES(?,?)');
    const pronunciation=db.prepare('INSERT INTO entity_pronunciation VALUES(?,?,?,?,?,?)');
    const analysis=db.prepare('INSERT INTO entity_phonetic_analysis VALUES(?,?,?,?,?,?)');

    entity.run(1,'Q1','group.music_group',0.99);
    name.run(1,1,'Metallica','metallica','de',1);
    category.run(1,'group.music_group');
    pronunciation.run(1,1,'mɛtaˈlɪka',1,'wikidata_p898','accepted_source_backed');
    analysis.run(1,'de-ipa-v2','["m","ɛ","t","a","l","ɪ","k","a"]',4,'0010',2);

    entity.run(2,'Q2','work.album',0.80);
    name.run(2,2,'Metallica','metallica','de',1);
    category.run(2,'work.album');
    pronunciation.run(2,2,'mɛtaˈlɪka',1,'source','accepted');
    analysis.run(2,'de-ipa-v2','["m","ɛ","t","a","l","ɪ","k","a"]',4,'0010',2);

    if(generated){
      entity.run(3,'Q3','person.rapper',0.70);
      name.run(3,3,'Future Star','future star','en',1);
      category.run(3,'person.rapper');
      pronunciation.run(3,3,'ˈfjuːtʃɚ stɑɹ',1,'espeak_ng_generated_secondary','accepted');
      analysis.run(3,'en-pron-v1-candidate','["f","j","u","tʃ","ɚ","s","t","ɑ","ɹ"]',3,'100',0);

      pronunciation.run(4,1,'mɛtaˈlɪka',0,'espeak_ng_generated_secondary','accepted');
      analysis.run(4,'de-ipa-v2','["m","ɛ","t","a","l","ɪ","k","a"]',4,'0010',2);
    }
  }finally{db.close();}
}

function createFixture(root){
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
  return paths;
}

function builderArgs(paths,root){
  const generatedReport=join(root,'generated-report.json');
  const generatedMarker=join(root,'generated-marker.json');
  const output=join(root,'serving.sqlite');
  const work=join(root,'serving.building.sqlite');
  const report=join(root,'serving-report.json');
  return {generatedReport,generatedMarker,output,work,report,args:[
    '--de-core',paths.deCore,
    '--en-core',paths.enCore,
    '--phrase-core',paths.phraseCore,
    '--entity-core',paths.entityCore,
    '--de-generated',paths.deGenerated,
    '--en-generated',paths.enGenerated,
    '--phrase-generated',paths.phraseGenerated,
    '--entity-generated',paths.entityGenerated,
    '--generated-report',generatedReport,
    '--generated-marker',generatedMarker,
    '--out',output,
    '--work',work,
    '--report',report,
    '--batch-size','1000',
    '--progress-every','1',
  ]};
}

async function writeAcceptedGeneratedContract(paths,files){
  const parityFingerprint='a'.repeat(64);
  const acceptanceFingerprint='b'.repeat(64);
  await writeFile(files.generatedReport,JSON.stringify({
    schema:'rhymelab-generated-base-parity-v1',
    policy:'canonical-schema-opt-in-generated-overlay-v1',
    status:'ok',
    semantic_fingerprint:parityFingerprint,
    unclassified_active:0,
    active_espeak_ab:6,
    deferred:{total:0},
    owner_contract:{
      generated_results_class:'second_class',
      default_search_included:false,
      user_opt_in_required:true,
      canonical_databases_mutated:false,
    },
    parity:{
      de:{exact_schema_match:true},
      en:{exact_schema_match:true},
      phrases:{exact_schema_match:true},
      entities:{exact_schema_match:true},
    },
    materialized:{
      phrases:{
        source_surface_rows:1,
        source_surface_rows_represented_by_canonical_composition:1,
        source_surface_rows_parity_deferred:0,
      },
    },
    outputs:{
      de:paths.deGenerated,
      en:paths.enGenerated,
      phrases:paths.phraseGenerated,
      entities:paths.entityGenerated,
    },
  },null,2));
  await writeFile(files.generatedMarker,JSON.stringify({
    schema:'rhymelab-generated-optin-runtime-enabled-v1',
    status:'accepted',
    policy:'explicit-checkbox-generated-overlay-v1',
    parity_report_fingerprint:parityFingerprint,
    acceptance_report_fingerprint:acceptanceFingerprint,
  },null,2));
}

function runBuilder(args){
  return spawnSync(
    process.execPath,
    ['--no-warnings','scripts/build-serving-v1.mjs',...args],
    {cwd:process.cwd(),encoding:'utf8'},
  );
}

test('Serving v1 builder resumes by stage, deduplicates cross-domain identities, and never lets generated displace Core', async () => {
  const root=await mkdtemp(join(tmpdir(),'rhymelab-serving-v1-'));
  try{
    const paths=createFixture(root);
    const files=builderArgs(paths,root);
    await writeAcceptedGeneratedContract(paths,files);

    const paused=runBuilder([...files.args,'--pause-after-stage','01_de_core']);
    assert.equal(paused.status,0,paused.stderr||paused.stdout);
    assert.equal(existsSync(files.work),true);
    assert.equal(existsSync(files.output),false);
    assert.match(paused.stdout,/manual checkpoint pause after 01_de_core/);

    const pausedDb=new DatabaseSync(files.work,{readOnly:true});
    try{
      const first=pausedDb.prepare("SELECT status FROM build_stage WHERE stage='01_de_core'").get();
      assert.equal(first?.status,'complete');
      assert.equal(
        pausedDb.prepare("SELECT COUNT(*) c FROM build_stage WHERE status='complete'").get().c,
        1,
      );
    }finally{pausedDb.close();}

    const resumed=runBuilder(files.args);
    assert.equal(resumed.status,0,resumed.stderr||resumed.stdout);
    assert.match(resumed.stdout,/DE Core words already complete/);
    assert.equal(existsSync(files.work),false);
    assert.equal(existsSync(files.output),true);
    assert.equal(existsSync(files.report),true);

    const report=JSON.parse(await readFile(files.report,'utf8'));
    assert.equal(report.status,'ok');
    assert.equal(report.invariants.core_never_displaced_by_generated,true);
    assert.equal(report.safety.current_runtime_rewired,false);
    assert.ok(report.deduplicated_pronunciation_rows>0);
    assert.ok(report.summary.multiRoleSurfaces>=1);
    assert.ok(report.summary.sameNameMultipleEntities>=1);
    assert.equal(report.summary.pronunciationLayerOverlap,0);
    assert.ok(report.summary.generatedOnlyPronunciations>=4);
    assert.equal(report.invariants.identical_generated_is_absorbed_by_core,true);
    assert.equal(report.invariants.generated_origins_on_canonical_pronunciations,0);

    const db=new DatabaseSync(files.output,{readOnly:true});
    try{
      const metallica=db.prepare("SELECT * FROM surface WHERE language='de' AND normalized='metallica'").get();
      assert.equal(metallica.display_surface,'Metallica');
      assert.equal(metallica.authority_kind,'core_word');
      assert.equal(Number(metallica.canonical_available),1);
      assert.equal(Number(metallica.generated_available),0);

      const pronunciations=db.prepare(
        'SELECT * FROM pronunciation WHERE surface_id=? ORDER BY pronunciation_id'
      ).all(metallica.surface_id);
      assert.equal(pronunciations.length,1);
      assert.equal(pronunciations[0].authority_kind,'core_word');
      assert.equal(Number(pronunciations[0].canonical_available),1);
      assert.equal(Number(pronunciations[0].generated_available),0);
      assert.equal(Number(pronunciations[0].generated_preferred),0);

      const roleRows=db.prepare(
        'SELECT role,canonical_available,generated_available FROM surface_role WHERE surface_id=? ORDER BY role'
      ).all(metallica.surface_id);
      assert.deepEqual(roleRows.map((row)=>row.role),['group.music_group','lexical','work.album']);
      assert.ok(roleRows.every((row)=>Number(row.canonical_available)===1));
      assert.ok(roleRows.every((row)=>Number(row.generated_available)===0));

      const generatedOrigins=db.prepare(
        "SELECT COUNT(*) c FROM pronunciation_origin WHERE pronunciation_id=? AND layer='generated'"
      ).get(pronunciations[0].pronunciation_id);
      assert.equal(Number(generatedOrigins.c),0);

      const entities=db.prepare(
        'SELECT entity_qid FROM surface_entity WHERE surface_id=? ORDER BY entity_qid'
      ).all(metallica.surface_id).map((row)=>row.entity_qid);
      assert.deepEqual(entities,['Q1','Q2']);

      const generatedOnly=db.prepare(`
        SELECT s.normalized,p.authority_kind
        FROM pronunciation p JOIN surface s USING(surface_id)
        WHERE p.canonical_available=0 AND p.generated_available=1
        ORDER BY s.normalized
      `).all();
      assert.ok(generatedOnly.some((row)=>row.normalized==='krankenscheindrucker'));
      assert.ok(generatedOnly.every((row)=>row.authority_kind.startsWith('generated_')));
    }finally{db.close();}

    const noImplicitReplace=runBuilder(files.args);
    assert.notEqual(noImplicitReplace.status,0);
    assert.match(noImplicitReplace.stderr,/Refusing to replace it implicitly/);
    assert.equal(existsSync(files.output),true);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
