import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  classifyKaikkiProperNamePronunciations,
  cmudictEntityPronunciation,
  createEntityPronunciationSourceStorage,
  entityPronunciationLookupUnits,
  insertEntityPronunciationEvidence,
  mobyEntityPronunciation,
  parseMobyPronunciationLine,
  prepareEntityPronunciationSourceInsert,
  prepareExpandedSourceLookup,
} from '../scripts/entity-pronunciation-source-expansion-core.mjs';

test('Entity pronunciation units handle title numerals and hyphenated names conservatively',()=>{
  assert.deepEqual(
    entityPronunciationLookupUnits('The Exorcist III').map((row)=>row.normalized),
    ['the','exorcist','three'],
  );
  assert.deepEqual(
    entityPronunciationLookupUnits('Metro-Goldwyn-Mayer').map((row)=>row.normalized),
    ['metro','goldwyn','mayer'],
  );
  assert.deepEqual(
    entityPronunciationLookupUnits('Captain America: Brave New World').map((row)=>row.normalized),
    ['captain','america','brave','new','world'],
  );
  assert.deepEqual(
    entityPronunciationLookupUnits('Studio 20').map((row)=>row.normalized),
    ['studio','twenty'],
  );
});

test('Kaikki proper-name IPA keeps locale boundaries explicit',()=>{
  const record={
    lang_code:'en',
    word:'Example Name',
    pos:'proper_noun',
    sounds:[
      {ipa:'/ɪgˈzæmpəl/',tags:['US']},
      {ipa:'/ɛgˈzɑːmpəl/',tags:['UK']},
      {ipa:'/ɪgˈzæmpəl/'},
    ],
  };
  const rows=classifyKaikkiProperNamePronunciations(record);
  assert.equal(rows.length,3);
  const us=rows.find((row)=>row.locale==='en-US');
  const uk=rows.find((row)=>row.locale==='en-GB');
  const generic=rows.find((row)=>row.locale==='en');
  assert.ok(us);
  assert.equal(us.runtime_profile_eligible,true);
  assert.equal(us.analysis_status,'ok');
  assert.ok(uk);
  assert.equal(uk.runtime_profile_eligible,false);
  assert.ok(generic);
  assert.equal(generic.runtime_profile_eligible,false);
});

test('CMUdict raw Entity evidence is en-US and analyzed, Moby remains raw-only',()=>{
  const cmu=cmudictEntityPronunciation({
    surface:'DEPP',
    normalized:'depp',
    pronunciation:'D EH1 P',
  });
  assert.equal(cmu.locale,'en-US');
  assert.equal(cmu.analysis_status,'ok');
  assert.equal(cmu.runtime_profile_eligible,true);
  assert.equal(cmu.analysis.syllable_count,1);

  const parsed=parseMobyPronunciationLine("johnny 'dZ/A/n/i");
  assert.equal(parsed.normalized,'johnny');
  const moby=mobyEntityPronunciation(parsed);
  assert.equal(moby.notation,'moby_ascii');
  assert.equal(moby.analysis_status,'raw_only');
  assert.equal(moby.runtime_profile_eligible,false);
});

test('source-expansion sidecar prefers runtime-eligible raw CMU/Kaikki evidence only',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    createEntityPronunciationSourceStorage(db);
    const insert=prepareEntityPronunciationSourceInsert(db);
    insertEntityPronunciationEvidence(insert,mobyEntityPronunciation({
      surface:'Depp',
      normalized:'depp',
      pronunciation:'d/E/p',
    }));
    insertEntityPronunciationEvidence(insert,cmudictEntityPronunciation({
      surface:'DEPP',
      normalized:'depp',
      pronunciation:'D EH1 P',
    }));
    const lookup=prepareExpandedSourceLookup(db);
    const runtime=lookup.runtime.get('depp');
    const any=lookup.any.get('depp');
    assert.equal(runtime.source_kind,'cmudict_raw_entity');
    assert.equal(runtime.runtime_profile_eligible,1);
    assert.equal(any.source_kind,'cmudict_raw_entity');
  }finally{
    db.close();
  }
});
