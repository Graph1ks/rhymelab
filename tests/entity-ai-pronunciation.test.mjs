import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  analyzeEntityAiArpabet,
  englishAnalysisToIpa,
  validateEntityAiArpabet,
  validateEntityAiResultRow,
} from '../scripts/entity-ai-pronunciation-core.mjs';
import {
  prepareEnglishEntityRuntimeStatements,
  resolveEnglishEntitySourceRuntime,
} from '../scripts/entity-english-runtime-core.mjs';
import {
  createEntityPronunciationSourceStorage,
  insertEntityPronunciationEvidence,
  prepareEntityPronunciationSourceInsert,
  cmudictEntityPronunciation,
} from '../scripts/entity-pronunciation-source-expansion-core.mjs';
import { analyzeEnglishArpabet } from '../scripts/english-phonology.mjs';

test('Entity AI ARPAbet validator enforces phone separation, stress and word boundaries',()=>{
  assert.equal(validateEntityAiArpabet('T OY0 OW1 T AH0').valid,true);
  assert.equal(validateEntityAiArpabet('D AA1 R K | S AY1 D').valid,true);
  assert.equal(validateEntityAiArpabet('MIY1').valid,false);
  assert.equal(validateEntityAiArpabet('M IY').valid,false);
  assert.equal(validateEntityAiArpabet('M IY1 |').valid,false);
});

test('Entity AI ARPAbet analysis preserves compact deterministic English features',()=>{
  const row=analyzeEntityAiArpabet('D AA1 R K | S AY1 D');
  assert.equal(row.syllable_count,2);
  assert.equal(row.primary_stress,2);
  assert.equal(row.rhyme_tail,'aɪ d');
  assert.equal(row.exact_key,'aɪd');
  assert.match(row.ipa,/ /u);

  const ipa=englishAnalysisToIpa(analyzeEnglishArpabet('T OY0 OW1 T AH0'));
  assert.match(ipa,/ˈ/u);
});

test('Entity AI result rows use compact five-column contract',()=>{
  assert.equal(validateEntityAiResultRow(['17','T OY0 OW1 T AH0','98','C','']).valid,true);
  assert.equal(validateEntityAiResultRow(['18','K AE1 R AH0','76','A','K ER1']).valid,true);
  assert.equal(validateEntityAiResultRow(['19','','20','U','']).valid,true);
  assert.equal(validateEntityAiResultRow(['20','M IY1','99','C','M IY1']).valid,false);
  assert.equal(validateEntityAiResultRow(['21','MIY1','99','C','']).valid,false);
});

function createEnglishFixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE en_form(
      id INTEGER PRIMARY KEY,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      default_eligible INTEGER NOT NULL
    );
    CREATE TABLE en_pronunciation(
      id INTEGER PRIMARY KEY,
      form_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      notation TEXT NOT NULL,
      raw TEXT NOT NULL,
      default_profile_eligible INTEGER NOT NULL
    );
  `);
  return db;
}

test('English Entity runtime resolution preserves accepted-first then expanded source policy',()=>{
  const en=createEnglishFixture();
  const source=new DatabaseSync(':memory:');
  try{
    createEntityPronunciationSourceStorage(source);
    en.prepare('INSERT INTO en_form(id,surface,normalized,default_eligible) VALUES(1,?,?,1)')
      .run('Dark','dark');
    en.prepare('INSERT INTO en_pronunciation(id,form_id,source,notation,raw,default_profile_eligible) VALUES(1,1,?,?,?,1)')
      .run('cmudict','arpabet','D AA1 R K');

    en.prepare('INSERT INTO en_form(id,surface,normalized,default_eligible) VALUES(2,?,?,1)')
      .run('Side','side');
    en.prepare('INSERT INTO en_pronunciation(id,form_id,source,notation,raw,default_profile_eligible) VALUES(2,2,?,?,?,1)')
      .run('cmudict','arpabet','S AY1 D');

    const insert=prepareEntityPronunciationSourceInsert(source);
    insertEntityPronunciationEvidence(insert,cmudictEntityPronunciation({
      surface:'DEPP',
      normalized:'depp',
      pronunciation:'D EH1 P',
    }));

    const statements=prepareEnglishEntityRuntimeStatements(en,source);
    const accepted=resolveEnglishEntitySourceRuntime('Dark Side',statements);
    assert.equal(accepted.status,'bounded_accepted_token_composition');
    assert.equal(accepted.pronunciation.generated,false);
    assert.equal(accepted.pronunciation.locale,'en-US');

    const expanded=resolveEnglishEntitySourceRuntime('Depp',statements);
    assert.equal(expanded.status,'exact_expanded_source');
    assert.equal(expanded.pronunciation.source_kind,'cmudict_raw_entity');

    const missing=resolveEnglishEntitySourceRuntime('Unresolvable Xyzzy',statements);
    assert.equal(missing.pronunciation,null);
    assert.ok(missing.unresolved_units.length>0);
  }finally{
    source.close();
    en.close();
  }
});
