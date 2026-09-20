import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  PRONUNCIATION_SECONDARY_POLICY,
  compactKaikkiSourceRecord,
  createPronunciationSecondaryStorage,
  deferredGeneratedBucket,
  isActiveSecondaryGeneratedRow,
  lexicalAggregate,
  phoneticParityFields,
  stableKaikkiRecordKey,
} from '../scripts/pronunciation-secondary-core.mjs';

test('secondary policy admits only resolved eSpeak A/B rows',()=>{
  assert.equal(PRONUNCIATION_SECONDARY_POLICY,'opt-in-generated-pronunciation-secondary-v1');
  assert.equal(isActiveSecondaryGeneratedRow({
    final_status:'resolved',final_method:'espeak_ng',quality_tier:'A',
  }),true);
  assert.equal(isActiveSecondaryGeneratedRow({
    final_status:'resolved',final_method:'espeak_ng',quality_tier:'B',
  }),true);
  assert.equal(isActiveSecondaryGeneratedRow({
    final_status:'resolved',final_method:'client_rules',quality_tier:'C',
  }),false);
  assert.equal(isActiveSecondaryGeneratedRow({
    final_status:'unresolved',final_method:null,quality_tier:'U',
  }),false);
});

test('deferred buckets preserve client B/C/D and unresolved U separately',()=>{
  assert.equal(deferredGeneratedBucket({
    final_status:'resolved',final_method:'client_source_reference_compound',quality_tier:'B',
  }),'client_B_source_backed');
  assert.equal(deferredGeneratedBucket({
    final_status:'resolved',final_method:'client_rules',quality_tier:'C',
  }),'client_C_rules');
  assert.equal(deferredGeneratedBucket({
    final_status:'resolved',final_method:'client_grapheme_fallback',quality_tier:'D',
  }),'client_D_grapheme');
  assert.equal(deferredGeneratedBucket({
    final_status:'unresolved',final_method:null,quality_tier:'U',
  }),'U_unresolved');
});

test('Kaikki metadata keeps etymology and compact lexical sense provenance',()=>{
  const entry={
    lang_code:'de',
    word:'Haus',
    pos:'noun',
    etymology_number:2,
    etymology_text:'Inherited source text.',
    tags:['neuter'],
    senses:[{
      glosses:['building'],
      tags:['common'],
      synonyms:[{word:'Gebäude'}],
      antonyms:[{word:'Freifläche'}],
    }],
  };
  const key=stableKaikkiRecordKey(entry,'de');
  const compact=compactKaikkiSourceRecord(entry,'de',key);
  assert.equal(compact.source_record_key,key);
  assert.equal(compact.etymology_number,2);
  assert.equal(compact.etymology_text,'Inherited source text.');
  const senses=JSON.parse(compact.senses_json);
  assert.deepEqual(senses[0].glosses,['building']);
  assert.deepEqual(senses[0].synonyms,['Gebäude']);
});

test('phonetic parity fields retain rhyme family and retrieval keys',()=>{
  const row=phoneticParityFields({
    ipa:'ˈhaʊs',
    canonicalPhonemes:['h','aʊ','s'],
    syllables:[{coda:[]}],
    syllableCount:1,
    stressPattern:'1',
    primaryStressSyllable:0,
    stressedTail:'aʊ s',
    finalTail:'aʊ s',
    vowelSequence:['aʊ'],
    consonantSequence:['h','s'],
    exactTailKey:'aʊ s',
    multisyllableKey:null,
    vowelKey:'aʊ',
    vowelFamilyKey:'A',
    codaKey:'s',
    stressedSyllableCount:1,
  },'de');
  assert.equal(row.phonemes,'h aʊ s');
  assert.equal(row.vowel_family,'A');
  assert.equal(row.exact_key,'aʊ s');
  assert.equal(row.rhyme_syllables,1);
});

test('lexical aggregate prefers strongest analysis and merges style tags',()=>{
  const result=lexicalAggregate([
    {
      analysis_key:'a',lemma:'Haus',pos:'noun',gender:'n',confidence:.98,
      historical_only:0,style_tags:'["rare"]',
    },
    {
      analysis_key:'b',lemma:'hausen',pos:'verb',gender:null,confidence:.8,
      historical_only:0,style_tags:'["colloquial"]',
    },
  ]);
  assert.equal(result.preferred_lemma,'Haus');
  assert.equal(result.preferred_pos,'noun');
  assert.equal(result.preferred_gender,'n');
  assert.deepEqual(JSON.parse(result.lexical_tags),['colloquial','rare']);
});

test('secondary storage hard-codes opt-in-only search eligibility',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    createPronunciationSecondaryStorage(db);
    db.prepare(`
      INSERT INTO secondary_form(
        item_id,language,surface,normalized,quality_tier,quality_reason,final_method,source_ref_count
      ) VALUES(1,'de','Haus','haus','A','test','espeak_ng',1)
    `).run();
    const row=db.prepare('SELECT second_class,default_search_eligible,user_opt_in_eligible FROM secondary_form WHERE item_id=1').get();
    assert.equal(row.second_class,1);
    assert.equal(row.default_search_eligible,0);
    assert.equal(row.user_opt_in_eligible,1);
  }finally{
    db.close();
  }
});
