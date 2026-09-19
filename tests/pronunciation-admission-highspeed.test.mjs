import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  PRONUNCIATION_ADMISSION_POLICY,
  evaluatePronunciationAdmission,
} from '../scripts/pronunciation-backfill-admission-core.mjs';
import { mapConcurrent } from '../scripts/pronunciation-espeak-parallel.mjs';
import {
  inspectEspeakQueryPronunciationAsync,
} from '../scripts/query-pronunciation-espeak-adapter.mjs';
import {
  backfillSummary,
  createPronunciationBackfillStorage,
} from '../scripts/pronunciation-backfill-core.mjs';

test('admission policy is target-aware rather than shape-only',()=>{
  const lexical=evaluatePronunciationAdmission({
    surface:'Arbeitsweise',
    scopes:['de_usage_source_minus_accepted'],
  });
  assert.equal(lexical.policy,PRONUNCIATION_ADMISSION_POLICY);
  assert.equal(lexical.decision,'admit');

  const lexicalPhrase=evaluatePronunciationAdmission({
    surface:'wir änderten',
    tokenCount:2,
    scopes:['de_listed_form_source_minus_accepted'],
  });
  assert.equal(lexicalPhrase.decision,'review');
  assert.equal(lexicalPhrase.reason,'word_target_multiword');

  const artifact=evaluatePronunciationAdmission({
    surface:'er/sie/es hatte gepichelt',
    tokenCount:5,
    scopes:['de_listed_form_source_minus_accepted'],
  });
  assert.equal(artifact.decision,'reject_noise');
  assert.equal(artifact.artifact,'pronoun_template');

  const entityPhrase=evaluatePronunciationAdmission({
    surface:'New York',
    tokenCount:2,
    scopes:['entity_en_no_source_pronunciation'],
  });
  assert.equal(entityPhrase.decision,'admit');

  const phrase=evaluatePronunciationAdmission({
    surface:'heute abend',
    tokenCount:2,
    scopes:['phrase_surface_unresolved'],
  });
  assert.equal(phrase.decision,'admit');

  const numericToken=evaluatePronunciationAdmission({
    surface:'1100',
    scopes:['phrase_unresolved_token'],
  });
  assert.equal(numericToken.decision,'reject_noise');
});

test('legitimate scope wins over a stricter overlapping source scope',()=>{
  const decision=evaluatePronunciationAdmission({
    surface:'New York',
    tokenCount:2,
    scopes:['de_listed_form_source_minus_accepted','entity_de_no_source_pronunciation'],
  });
  assert.equal(decision.decision,'admit');
  assert.equal(decision.reason,'entity_name_surface');
});

test('parallel worker pool preserves input order while overlapping async work',async()=>{
  const active={value:0,max:0};
  const input=[1,2,3,4,5,6];
  const output=await mapConcurrent(input,3,async(value)=>{
    active.value+=1;
    active.max=Math.max(active.max,active.value);
    await new Promise((resolve)=>setTimeout(resolve,5));
    active.value-=1;
    return value*10;
  });
  assert.deepEqual(output,[10,20,30,40,50,60]);
  assert.ok(active.max>=2);
  assert.ok(active.max<=3);
});

test('async eSpeak adapter supports injected async runners',async()=>{
  const result=await inspectEspeakQueryPronunciationAsync('Hallo','de',{
    command:'fixture-espeak',
    runner:async(command,args)=>{
      assert.equal(command,'fixture-espeak');
      assert.ok(args.includes('--ipa=3'));
      return {status:0,stdout:'hˈaloː\n',stderr:''};
    },
  });
  assert.equal(result.status,'accepted');
  assert.equal(result.language,'de');
  assert.equal(result.engine,'espeak-ng');
});

test('backfill storage exposes admission counts and admitted generator pending',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    createPronunciationBackfillStorage(db);
    db.prepare('INSERT INTO work_item(item_id,language,normalized,surface,updated_at) VALUES(1,?,?,?,?)')
      .run('de','wort','Wort',new Date(0).toISOString());
    db.prepare('INSERT INTO work_item(item_id,language,normalized,surface,updated_at) VALUES(2,?,?,?,?)')
      .run('de','noise','Noise',new Date(0).toISOString());
    db.prepare([
      'INSERT INTO admission(item_id,policy,decision,reason,shape,scopes_json,detail_json,evaluated_at)',
      'VALUES(?,?,?,?,?,?,?,?)',
    ].join(' ')).run(1,PRONUNCIATION_ADMISSION_POLICY,'admit','word_target_lexical_surface','clean_single','[]','{}',new Date(0).toISOString());
    db.prepare([
      'INSERT INTO admission(item_id,policy,decision,reason,shape,scopes_json,detail_json,evaluated_at)',
      'VALUES(?,?,?,?,?,?,?,?)',
    ].join(' ')).run(2,PRONUNCIATION_ADMISSION_POLICY,'reject_noise','word_target_nonlexical','nonlexical','[]','{}',new Date(0).toISOString());

    const summary=backfillSummary(db);
    assert.deepEqual(summary.admission,{admit:1,reject_noise:1});
    assert.equal(summary.generator_pending,1);
    assert.equal(summary.pending,2);
  }finally{
    db.close();
  }
});
