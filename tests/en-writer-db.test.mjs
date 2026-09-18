import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  ENGLISH_WRITER_DB_SCHEMA,
  createEnglishWriterDbStorage,
  englishCoarseCodaClass,
  englishRetrievalQueryPlans,
  fingerprintEnglishWriterDb,
  insertEnglishPublishRow,
  prepareEnglishWriterDbInserts,
} from '../scripts/en-writer-db-core.mjs';

function fixtureRow(){
  return {
    publish_order:1,
    surface:'time',
    normalized:'time',
    surface_variants:['time','Time'],
    lexical:{
      poses:['noun','verb'],
      lemmas:[],
      relation_kinds:[],
      tags:[],
      evidence_kinds:['wiktionary_headword'],
      current_evidence_count:2,
      historical_evidence_count:0,
      proper_name_evidence_count:0,
      common_lexical_evidence_count:2,
    },
    pronunciations:[
      {
        source:'cmudict',
        notation:'arpabet',
        raw:'T AY1 M',
        locales:['en-US'],
        tags:[],
        evidence_count:1,
        analysis_status:'ok',
        analysis:{
          ph:'t aɪ m',sc:1,st:'2',ps:1,rt:'aɪ m',ft:'aɪ m',e:'aɪm',m:null,
          vk:'aɪ',vf:'AY',ck:'m',rs:1,rh:0,
        },
      },
      {
        source:'wiktionary',
        notation:'ipa',
        raw:'/taɪm/',
        locales:[],
        tags:[],
        evidence_count:1,
        analysis_status:'ok',
        analysis:{
          ph:'t aɪ m',sc:1,st:'2',ps:1,rt:'aɪ m',ft:'aɪ m',e:'aɪm',m:null,
          vk:'aɪ',vf:'AY',ck:'m',rs:1,rh:0,
        },
      },
    ],
    esdb:{min_size:10,regions:['US','GB'],pos_classes:['n'],archaic:false,uncommon:false,invalid:false},
    usage:{rank:100,zipf:5.8},
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

test('English coarse coda class is English-specific and leaves voicing to the scorer',()=>{
  assert.equal(englishCoarseCodaClass(''),'OPEN');
  assert.equal(englishCoarseCodaClass('m'),'LAB-NAS');
  assert.equal(englishCoarseCodaClass('t'),'COR-STOP');
  assert.equal(englishCoarseCodaClass('d'),'COR-STOP');
});

test('English Writer DB stores source variants while gating default en-US retrieval',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    createEnglishWriterDbStorage(db);
    const counts=insertEnglishPublishRow(prepareEnglishWriterDbInserts(db),fixtureRow());
    assert.deepEqual(counts,{pronunciations:2,indexed:2,defaultProfile:1});
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM en_form').get().c,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM en_pronunciation').get().c,2);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM en_pronunciation WHERE default_profile_eligible=1').get().c,1);
    assert.equal(db.prepare('SELECT coda_class FROM en_pronunciation WHERE default_profile_eligible=1').get().coda_class,'LAB-NAS');
  }finally{
    db.close();
  }
});

test('English Writer DB retrieval plans use dedicated English indexes',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    createEnglishWriterDbStorage(db);
    insertEnglishPublishRow(prepareEnglishWriterDbInserts(db),fixtureRow());
    const plans=englishRetrievalQueryPlans(db);
    assert.ok(plans.exact.some((line)=>line.includes('idx_en_pron_exact')));
    assert.ok(plans.vowel.some((line)=>line.includes('idx_en_pron_vowel')));
    assert.ok(plans.family_coda.some((line)=>line.includes('idx_en_pron_family_coda')));
    assert.ok(plans.coda.some((line)=>line.includes('idx_en_pron_coda')));
  }finally{
    db.close();
  }
});

test('English Writer DB semantic fingerprint is deterministic for identical materialization',()=>{
  function build(){
    const db=new DatabaseSync(':memory:');
    createEnglishWriterDbStorage(db);
    insertEnglishPublishRow(prepareEnglishWriterDbInserts(db),fixtureRow());
    return {db,fingerprint:fingerprintEnglishWriterDb(db)};
  }
  const a=build(),b=build();
  try{
    assert.equal(a.fingerprint,b.fingerprint);
    assert.match(a.fingerprint,/^[0-9a-f]{64}$/u);
  }finally{
    a.db.close(); b.db.close();
  }
});

test('English Writer DB schema constant remains candidate-gated',()=>{
  assert.equal(ENGLISH_WRITER_DB_SCHEMA,'rhymelab-en-writer-db-v1-candidate');
});
