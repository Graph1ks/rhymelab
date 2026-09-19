import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  createEnglishWriterDbStorage,
  insertEnglishPublishRow,
  prepareEnglishWriterDbInserts,
} from '../scripts/en-writer-db-core.mjs';
import { analyzeEnglishPronunciation } from '../scripts/english-phonology.mjs';
import {
  auditEntityEnglishPronunciationEvidence,
  prepareEntityEnglishEvidenceStatements,
  resolveEnglishEntityNameCandidate,
} from '../scripts/entity-english-pronunciation-core.mjs';

function compactAnalysis(analysis){
  return {
    ph:analysis.canonicalPhonemes,
    sc:analysis.syllableCount,
    st:analysis.stressPattern,
    ps:analysis.primaryStressSyllable,
    rt:analysis.stressedTail,
    ft:analysis.finalTail,
    e:analysis.exactTailKey,
    m:analysis.multisyllableKey,
    vk:analysis.vowelKey,
    vf:analysis.vowelFamilyKey,
    ck:analysis.codaKey,
    rs:analysis.stressedSyllableCount,
    rh:analysis.rhotic?1:0,
  };
}

function publishRow(id,surface,arpabet,{rank=id,zipf=5}={}){
  const analysis=analyzeEnglishPronunciation(arpabet,{
    notation:'arpabet',
    locale:'en-US',
    source:'cmudict',
  });
  return {
    publish_order:id,
    surface,
    normalized:surface,
    surface_variants:[surface],
    lexical:{
      poses:['noun'],
      lemmas:[],
      relation_kinds:[],
      tags:[],
      evidence_kinds:['wiktionary_headword'],
      current_evidence_count:1,
      historical_evidence_count:0,
      proper_name_evidence_count:0,
      common_lexical_evidence_count:1,
    },
    pronunciations:[{
      source:'cmudict',
      notation:'arpabet',
      raw:arpabet,
      locales:['en-US'],
      tags:[],
      evidence_count:1,
      analysis_status:'ok',
      analysis:compactAnalysis(analysis),
    }],
    esdb:{
      min_size:10,
      regions:['US'],
      pos_classes:['n'],
      archaic:false,
      uncommon:false,
      invalid:false,
    },
    usage:{rank,zipf},
    eligibility:{
      source_backed_publishable:true,
      analyzed_en_us:true,
      historical_only:false,
      proper_name_only:false,
      default_eligible:true,
      exclusion_reasons:[],
    },
  };
}

function englishDb(){
  const db=new DatabaseSync(':memory:');
  createEnglishWriterDbStorage(db);
  const insert=prepareEnglishWriterDbInserts(db);
  insertEnglishPublishRow(insert,publishRow(1,'time','T AY1 M',{rank:60,zipf:6.29}));
  insertEnglishPublishRow(insert,publishRow(2,'prime','P R AY1 M',{rank:1630,zipf:4.81}));
  return db;
}

function entityDb(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE entity(
      entity_id INTEGER PRIMARY KEY,
      qid TEXT NOT NULL,
      primary_category TEXT,
      popularity_score REAL NOT NULL,
      popularity_percentile REAL NOT NULL,
      popularity_tier TEXT NOT NULL
    );
    CREATE TABLE entity_name(
      name_id INTEGER PRIMARY KEY,
      entity_id INTEGER NOT NULL,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      language TEXT NOT NULL,
      name_kind TEXT NOT NULL,
      preferred INTEGER NOT NULL,
      searchable INTEGER NOT NULL
    );
  `);
  const entity=db.prepare(
    'INSERT INTO entity(entity_id,qid,primary_category,popularity_score,popularity_percentile,popularity_tier) VALUES(?,?,?,?,?,?)'
  );
  const name=db.prepare(
    'INSERT INTO entity_name(name_id,entity_id,surface,normalized,language,name_kind,preferred,searchable) VALUES(?,?,?,?,?,?,?,?)'
  );
  const rows=[
    [1,'Q1','music',1,1,'A','Time','time'],
    [2,'Q2','music',0.9,0.9,'A','Prime Time','prime time'],
    [3,'Q3','music',0.8,0.8,'A','Unknown Time','unknown time'],
    [4,'Q4','music',0.7,0.7,'B','one two three four five six seven','one two three four five six seven'],
  ];
  for(const [id,qid,category,score,percentile,tier,surface,normalized] of rows){
    entity.run(id,qid,category,score,percentile,tier);
    name.run(id,id,surface,normalized,'en','label',1,1);
  }
  return db;
}

test('English Entity evidence resolves exact and bounded source-backed composition',()=>{
  const en=englishDb();
  try{
    const statements=prepareEntityEnglishEvidenceStatements(en);
    const exact=resolveEnglishEntityNameCandidate('Time',{statements});
    assert.equal(exact.status,'exact_source_backed');
    assert.equal(exact.pronunciation.source,'cmudict');

    const composed=resolveEnglishEntityNameCandidate('Prime Time',{statements});
    assert.equal(composed.status,'bounded_token_composition');
    assert.equal(composed.token_count,2);
    assert.deepEqual(composed.pronunciation.component_sources,['cmudict']);

    const unresolved=resolveEnglishEntityNameCandidate('Unknown Time',{statements});
    assert.equal(unresolved.status,'unresolved_token');
    assert.deepEqual(unresolved.unresolved_tokens,['Unknown']);

    const tooLong=resolveEnglishEntityNameCandidate(
      'one two three four five six seven',
      {statements,maxTokens:6},
    );
    assert.equal(tooLong.status,'unresolved_too_many_tokens');
  }finally{
    en.close();
  }
});

test('English Entity evidence audit stays compact and read-only',()=>{
  const en=englishDb();
  const entities=entityDb();
  try{
    const report=auditEntityEnglishPronunciationEvidence(entities,en,{
      maxTokens:6,
      priorityLimit:2,
    });
    assert.equal(report.counts.names,4);
    assert.equal(report.counts.preferred_names,4);
    assert.equal(report.counts.exact_source_backed,1);
    assert.equal(report.counts.bounded_token_composition,1);
    assert.equal(report.counts.unresolved,2);
    assert.equal(report.counts.source_backed_ready,2);
    assert.equal(report.counts.source_backed_ready_pct,50);
    assert.equal(report.generated_g2p_used,false);
    assert.equal(report.database_mutated,false);
    assert.ok(report.priority_unresolved_preferred_names.length<=2);
    assert.equal(Object.hasOwn(report,'rows'),false);
  }finally{
    entities.close();
    en.close();
  }
});
