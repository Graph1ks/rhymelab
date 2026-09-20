import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createEnglishWriterDbStorage, insertEnglishPublishRow, prepareEnglishWriterDbInserts } from '../scripts/en-writer-db-core.mjs';
import { analyzeEnglishIpa, analyzeEnglishPronunciation } from '../scripts/english-phonology.mjs';
import {
  analyzeStoredEnglishRuntimePronunciation,
  compareStoredEnglishAnalysis,
  englishRuntimeQueryPlans,
  retrieveEnglishRuntimeCandidates,
  retrieveEnglishRuntimeCandidatesFromAnalysis,
} from '../scripts/en-writer-runtime-core.mjs';

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

function row(id,surface,arpabet,{unprofiledAlias=false}={}){
  const analysis=analyzeEnglishPronunciation(arpabet,{notation:'arpabet',locale:'en-US',source:'cmudict'});
  const pronunciations=[{
    source:'cmudict',
    notation:'arpabet',
    raw:arpabet,
    locales:['en-US'],
    tags:[],
    evidence_count:1,
    analysis_status:'ok',
    analysis:compactAnalysis(analysis),
  }];
  if(unprofiledAlias){
    pronunciations.push({
      source:'wiktionary',
      notation:'ipa',
      raw:`/${analysis.canonicalPhonemes.replaceAll(' ','')}/`,
      locales:[],
      tags:[],
      evidence_count:1,
      analysis_status:'ok',
      analysis:compactAnalysis(analysis),
    });
  }
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
    pronunciations,
    esdb:{min_size:10,regions:['US'],pos_classes:['n'],archaic:false,uncommon:false,invalid:false},
    usage:{rank:id,zipf:5},
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

function fixtureDb(){
  const db=new DatabaseSync(':memory:');
  createEnglishWriterDbStorage(db);
  const insert=prepareEnglishWriterDbInserts(db);
  insertEnglishPublishRow(insert,row(1,'time','T AY1 M'));
  insertEnglishPublishRow(insert,row(2,'rhyme','R AY1 M',{unprofiledAlias:true}));
  insertEnglishPublishRow(insert,row(3,'nation','N EY1 SH AH0 N'));
  insertEnglishPublishRow(insert,row(4,'station','S T EY1 SH AH0 N'));
  insertEnglishPublishRow(insert,row(5,'wine','W AY1 N'));
  return db;
}

test('English runtime retrieval resolves exact and multisyllabic candidates through default-profile rows only',()=>{
  const db=fixtureDb();
  try{
    const time=retrieveEnglishRuntimeCandidates(db,'TIME',{channelLimit:32,maxCandidates:64});
    assert.equal(time.status,'ok');
    const rhyme=time.candidates.filter((candidate)=>candidate.normalized==='rhyme');
    assert.equal(rhyme.length,1);
    assert.ok(rhyme[0].channels.includes('exact'));
    assert.equal(rhyme[0].locale_us,1);
    assert.equal(rhyme[0].source,'cmudict');

    const nation=retrieveEnglishRuntimeCandidates(db,'nation',{channelLimit:32,maxCandidates:64});
    const station=nation.candidates.find((candidate)=>candidate.normalized==='station');
    assert.ok(station);
    assert.ok(station.channels.includes('exact'));
    assert.ok(station.channels.includes('multi'));
  }finally{
    db.close();
  }
});

test('English runtime retrieval is bounded and deterministic',()=>{
  const db=fixtureDb();
  try{
    const a=retrieveEnglishRuntimeCandidates(db,'time',{channelLimit:2,maxCandidates:2});
    const b=retrieveEnglishRuntimeCandidates(db,'time',{channelLimit:2,maxCandidates:2});
    assert.ok(a.candidates.length<=2);
    assert.deepEqual(
      a.candidates.map((row)=>row.pronunciation_id),
      b.candidates.map((row)=>row.pronunciation_id)
    );
  }finally{
    db.close();
  }
});

test('English runtime reanalysis reproduces materialized pronunciation keys',()=>{
  const db=fixtureDb();
  try{
    const row=db.prepare(`
      SELECT p.*,f.surface,f.normalized,f.default_eligible AS form_default_eligible
      FROM en_pronunciation p
      JOIN en_form f ON f.id=p.form_id
      WHERE f.normalized='nation' AND p.default_profile_eligible=1
    `).get();
    const compared=compareStoredEnglishAnalysis(row);
    assert.deepEqual(compared.mismatches,[]);
  }finally{
    db.close();
  }
});

test('generated eSpeak runtime reanalysis applies the complete accepted English normalization contract',()=>{
  const cases=[
    ['bɪɫ','bɪl'],
    ['ˈsɪɾi','ˈsɪti'],
    ['bᵻt','bɪt'],
    ['bᵊt','bət'],
    ['ɡoʊ','goʊ'],
    ['bˈəːd','bˈɜd'],
    ['bˈɹ̩','bˈɚ'],
    ['goː','goʊ'],
    ['deː','deɪ'],
    ['bɛːd','bɛd'],
    ['sɪː','si'],
    ['fʊːd','fud'],
    ['dᵻpɹˈa\\u200Dɪm','dɪpɹˈaɪm'],
  ];
  for(const [raw,expected] of cases){
    const generated=analyzeStoredEnglishRuntimePronunciation({
      raw,
      notation:'ipa',
      source:'espeak_ng_generated_secondary',
      locale_us:1,
      locale_gb:0,
    });
    const canonical=analyzeEnglishIpa(expected,{locale:'en-US'});
    assert.equal(generated.canonicalPhonemes,canonical.canonicalPhonemes,raw);
    assert.equal(generated.stressPattern,canonical.stressPattern,raw);
    assert.equal(generated.exactTailKey,canonical.exactTailKey,raw);
  }
});

test('stored runtime reanalysis does not apply eSpeak normalization to source-backed IPA',()=>{
  assert.throws(()=>analyzeStoredEnglishRuntimePronunciation({
    raw:'ˈsɪɾi',
    notation:'ipa',
    source:'wiktionary',
    locale_us:1,
    locale_gb:0,
  }),/Unsupported English IPA symbol: ɾ/);
});

test('English runtime query plans use all five dedicated pronunciation indexes',()=>{
  const db=fixtureDb();
  try{
    const plans=englishRuntimeQueryPlans(db);
    assert.ok(plans.exact.some((line)=>line.includes('idx_en_pron_exact')));
    assert.ok(plans.multi.some((line)=>line.includes('idx_en_pron_multi')));
    assert.ok(plans.vowel.some((line)=>line.includes('idx_en_pron_vowel')));
    assert.ok(plans.family_coda.some((line)=>line.includes('idx_en_pron_family_coda')));
    assert.ok(plans.coda.some((line)=>line.includes('idx_en_pron_coda')));
  }finally{
    db.close();
  }
});


test('English indexed retrieval accepts an external phonetic analysis',()=>{
  const db=fixtureDb();
  try{
    const analysis=analyzeEnglishIpa('/ʃvaɪn/',{locale:'en-US',source:'cross_language_test'});
    const result=retrieveEnglishRuntimeCandidatesFromAnalysis(db,analysis,{channelLimit:32,maxCandidates:64});
    assert.equal(result.status,'ok');
    const wine=result.candidates.find((candidate)=>candidate.normalized==='wine');
    assert.ok(wine);
    assert.ok(wine.channels.includes('exact'));
  }finally{
    db.close();
  }
});
