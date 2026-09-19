import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  PRONUNCIATION_ADMISSION_POLICY,
  evaluatePronunciationAdmission,
} from '../scripts/pronunciation-backfill-admission-core.mjs';
import { mapConcurrent } from '../scripts/pronunciation-espeak-parallel.mjs';
import { inspectEspeakQueryPronunciationAsync } from '../scripts/query-pronunciation-espeak-adapter.mjs';
import { createPronunciationBackfillStorage } from '../scripts/pronunciation-backfill-core.mjs';

test('source-aware admission keeps lexical word targets and holds ambiguous word-source shapes',()=>{
  assert.equal(PRONUNCIATION_ADMISSION_POLICY,'source-aware-pronunciation-admission-v1');

  const clean=evaluatePronunciationAdmission({
    surface:'Arbeitsweise',
    tokenCount:1,
    scopes:['de_usage_source_minus_accepted'],
  });
  assert.equal(clean.decision,'admit');
  assert.equal(clean.shape,'clean_single');

  const multi=evaluatePronunciationAdmission({
    surface:'wir änderten',
    tokenCount:2,
    scopes:['de_listed_form_source_minus_accepted'],
  });
  assert.equal(multi.decision,'review');
  assert.equal(multi.shape,'multiword');

  const punctuation=evaluatePronunciationAdmission({
    surface:'habe derbleckt!',
    tokenCount:2,
    scopes:['de_listed_form_source_minus_accepted'],
  });
  assert.equal(punctuation.decision,'review');
  assert.equal(punctuation.shape,'other_punctuation');
});

test('admission rejects strong Wiktionary/template noise without deleting plausible phrase/entity surfaces',()=>{
  const numbered=evaluatePronunciationAdmission({
    surface:'[1] 01., 1., I., I.',
    tokenCount:4,
    scopes:['de_listed_form_source_minus_accepted'],
  });
  assert.equal(numbered.decision,'reject_noise');
  assert.equal(numbered.artifact,'wiktionary_numbered_display');

  const pronounTemplate=evaluatePronunciationAdmission({
    surface:'er/sie/es werde kompostiert werden',
    tokenCount:6,
    scopes:['de_listed_form_source_minus_accepted'],
  });
  assert.equal(pronounTemplate.decision,'reject_noise');
  assert.equal(pronounTemplate.artifact,'pronoun_template');

  const phrase=evaluatePronunciationAdmission({
    surface:'heute abend große gangbang party',
    tokenCount:5,
    scopes:['phrase_surface_unresolved'],
  });
  assert.equal(phrase.decision,'admit');
  assert.equal(phrase.shape,'multiword');

  const entity=evaluatePronunciationAdmission({
    surface:'AC/DC',
    tokenCount:1,
    scopes:['entity_en_no_source_pronunciation'],
  });
  assert.equal(entity.decision,'admit');
  assert.equal(entity.shape,'other_punctuation');
});

test('overlapping provenance admits when one legitimate source scope admits the item',()=>{
  const result=evaluatePronunciationAdmission({
    surface:'New York',
    tokenCount:2,
    scopes:['de_usage_source_minus_accepted','entity_de_no_source_pronunciation'],
  });
  assert.equal(result.decision,'admit');
  assert.deepEqual(result.scopes,[
    'de_usage_source_minus_accepted',
    'entity_de_no_source_pronunciation',
  ]);
});

test('backfill storage additively creates admission table and decision index',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    createPronunciationBackfillStorage(db);
    const table=db.prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name='admission'"
    ).get();
    const index=db.prepare(
      "SELECT name FROM sqlite_schema WHERE type='index' AND name='idx_backfill_admission_decision'"
    ).get();
    assert.equal(table.name,'admission');
    assert.equal(index.name,'idx_backfill_admission_decision');
  }finally{
    db.close();
  }
});

test('bounded async worker pool preserves input order and never exceeds concurrency',async()=>{
  const items=Array.from({length:24},(_,index)=>index);
  let active=0;
  let peak=0;
  const result=await mapConcurrent(items,4,async(value)=>{
    active+=1;
    peak=Math.max(peak,active);
    await new Promise((resolve)=>setTimeout(resolve,(value%3)+1));
    active-=1;
    return value*2;
  });
  assert.equal(peak<=4,true);
  assert.equal(peak>1,true);
  assert.deepEqual(result,items.map((value)=>value*2));
});

test('async eSpeak adapter accepts analyzer-compatible mocked output',async()=>{
  const runner=async(_command,args)=>{
    assert.ok(args.includes('--ipa=3'));
    assert.ok(args.includes('-v'));
    return {status:0,stdout:'ˈhaːloː\n',stderr:''};
  };
  const result=await inspectEspeakQueryPronunciationAsync(
    'Hallo','de',{command:'mock-espeak',runner},
  );
  assert.equal(result.status,'accepted');
  assert.equal(result.engineCommand,'mock-espeak');
  assert.equal(result.ipa,'ˈhaːloː');
  assert.ok(result.analysis);
});

test('async eSpeak adapter reports unavailable mocked process failures',async()=>{
  const runner=async()=>({
    status:null,
    error:new Error('ENOENT'),
    stdout:'',
    stderr:'',
  });
  const result=await inspectEspeakQueryPronunciationAsync(
    'hello','en',{command:'missing-espeak',runner},
  );
  assert.equal(result.status,'unavailable');
  assert.equal(result.attempts.length,1);
  assert.match(result.attempts[0].processError,/ENOENT/u);
});
