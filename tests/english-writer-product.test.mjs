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
  ACCEPTED_ENGLISH_DB_FINGERPRINT,
  ACCEPTED_ENGLISH_DB_SCHEMA,
  ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
  ENGLISH_WRITER_DIVERSITY_WEIGHT,
  ENGLISH_WRITER_PRODUCT_POLICY,
  ENGLISH_WRITER_QUALITY_ID,
  englishWriterCapabilities,
  getEnglishWord,
  searchEnglishWriter,
} from '../src/english-writer-runtime.mjs';
import {
  searchUnifiedWriter,
  unifiedWriterCapabilities,
} from '../src/unified-writer-search.mjs';

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

function publishRow(id,surface,arpabet,{rank=id,zipf=5,poses=['noun'],lemmas=[]}={}){
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
      poses,
      lemmas,
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

function fixtureEnglishDb(){
  const db=new DatabaseSync(':memory:');
  createEnglishWriterDbStorage(db);
  const insert=prepareEnglishWriterDbInserts(db);
  insertEnglishPublishRow(insert,publishRow(1,'time','T AY1 M',{rank:60,zipf:6.29}));
  insertEnglishPublishRow(insert,publishRow(2,'rhyme','R AY1 M',{rank:13733,zipf:3.56}));
  insertEnglishPublishRow(insert,publishRow(3,'crime','K R AY1 M',{rank:1351,zipf:4.89}));
  insertEnglishPublishRow(insert,publishRow(4,'prime','P R AY1 M',{rank:1630,zipf:4.81}));
  insertEnglishPublishRow(insert,publishRow(5,'nation','N EY1 SH AH0 N',{rank:1389,zipf:4.88}));
  insertEnglishPublishRow(insert,publishRow(6,'station','S T EY1 SH AH0 N',{rank:1700,zipf:4.7}));
  const meta=db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  const values={
    schema:ACCEPTED_ENGLISH_DB_SCHEMA,
    language:'en',
    default_locale:'en-US',
    retrieval_policy:'en-indexed-rhyme-retrieval-v1-candidate',
    publish_fingerprint:ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
    semantic_fingerprint:ACCEPTED_ENGLISH_DB_FINGERPRINT,
  };
  for(const [key,value] of Object.entries(values)) meta.run(key,String(value));
  return db;
}


function denseNationFixtureDb(){
  const db=new DatabaseSync(':memory:');
  createEnglishWriterDbStorage(db);
  const insert=prepareEnglishWriterDbInserts(db);
  insertEnglishPublishRow(insert,publishRow(1,'nation','N EY1 SH AH0 N',{rank:1389,zipf:4.88}));
  for(let id=2;id<=180;id+=1){
    insertEnglishPublishRow(
      insert,
      publishRow(
        id,
        `nationfiller${String(id).padStart(3,'0')}`,
        'N EY1 SH AH0 N',
        {rank:200000+id,zipf:2.0},
      ),
    );
  }
  insertEnglishPublishRow(
    insert,
    publishRow(181,'station','S T EY1 SH AH0 N',{rank:1700,zipf:4.7}),
  );
  const meta=db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  const values={
    schema:ACCEPTED_ENGLISH_DB_SCHEMA,
    language:'en',
    default_locale:'en-US',
    retrieval_policy:'en-indexed-rhyme-retrieval-v1-candidate',
    publish_fingerprint:ACCEPTED_ENGLISH_PUBLISH_FINGERPRINT,
    semantic_fingerprint:ACCEPTED_ENGLISH_DB_FINGERPRINT,
  };
  for(const [key,value] of Object.entries(values)) meta.run(key,String(value));
  return db;
}

test('English product runtime exposes accepted candidate policy and source-backed query detail',()=>{
  const db=fixtureEnglishDb();
  try{
    const capabilities=englishWriterCapabilities(db);
    assert.equal(capabilities.available,true);
    assert.equal(capabilities.qualityCandidate,ENGLISH_WRITER_QUALITY_ID);
    assert.equal(capabilities.diversityWeight,ENGLISH_WRITER_DIVERSITY_WEIGHT);

    const detail=getEnglishWord(db,'TIME');
    assert.equal(detail.language,'en');
    assert.equal(detail.normalized,'time');
    assert.equal(detail.pronunciations.length,1);
    assert.equal(detail.pronunciations[0].locale,'en-US');
  }finally{
    db.close();
  }
});

test('English product Writer ranks deterministic source-backed perfect rhymes',()=>{
  const db=fixtureEnglishDb();
  try{
    const result=searchEnglishWriter(db,'time',{limit:20});
    assert.equal(result.rankingPolicy,ENGLISH_WRITER_PRODUCT_POLICY);
    assert.equal(result.qualityCandidate,'guarded_commonness_06');
    assert.equal(result.diversityWeight,0.08);
    assert.equal(result.results[0].language,'en');
    assert.ok(result.results.some((row)=>row.normalized==='rhyme'&&row.type==='perfect'));
    assert.ok(result.results.every((row)=>row.resultKind==='word'));
    assert.deepEqual(
      result.results.map((row)=>row.normalized),
      searchEnglishWriter(db,'time',{limit:20}).results.map((row)=>row.normalized),
    );
  }finally{
    db.close();
  }
});


test('English product retrieval keeps common exact multisyllabic rhymes beyond the 128-row diagnostic slice',()=>{
  const db=denseNationFixtureDb();
  try{
    const result=searchEnglishWriter(db,'nation',{limit:20});
    const station=result.results.find((row)=>row.normalized==='station');
    assert.ok(station);
    assert.equal(station.type,'multisyllabic_perfect');
    assert.equal(result.writerRetrieval.channelLimits.exact,1536);
    assert.equal(result.writerRetrieval.channelLimits.multi,1536);
    assert.equal(result.writerRetrieval.channelLimits.vowel,128);
  }finally{
    db.close();
  }
});

test('unified Writer exposes English word capability without emulating English through German',()=>{
  const db=fixtureEnglishDb();
  try{
    const capabilities=unifiedWriterCapabilities({writerDb:{},englishDb:db});
    assert.equal(capabilities.languages.en.available,true);
    assert.equal(capabilities.languages.en.wordWriter,true);
    assert.equal(capabilities.languages.en.phraseMosaic,false);

    const result=searchUnifiedWriter(
      {writerDb:{},englishDb:db},
      'time',
      {language:'en',scope:'words',wordLimit:20},
    );
    assert.equal(result.status,'ok');
    assert.deepEqual(result.resolvedLanguages,['en']);
    assert.ok(result.results.length>0);
    assert.ok(result.results.every((row)=>row.language==='en'));
    assert.equal(result.channels.words.byLanguage.en.qualityCandidate,'guarded_commonness_06');
  }finally{
    db.close();
  }
});

test('English-only product mode reports Phrase/Mosaic as unavailable instead of inventing it',()=>{
  const db=fixtureEnglishDb();
  try{
    const result=searchUnifiedWriter(
      {writerDb:{},englishDb:db},
      'time',
      {language:'en',scope:'phrases'},
    );
    assert.equal(result.status,'ok');
    assert.equal(result.channels.phrases.available,false);
    assert.equal(result.channels.phrases.reason,'english_phrase_mosaic_not_implemented');
    assert.deepEqual(result.results,[]);
  }finally{
    db.close();
  }
});
