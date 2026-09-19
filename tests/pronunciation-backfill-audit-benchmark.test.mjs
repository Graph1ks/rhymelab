import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateEqualQuotas,
  classifySurface,
  deterministicTake,
} from '../scripts/pronunciation-backfill-audit-core.mjs';
import {
  addAgreement,
  addGold,
  compareAnalyses,
  createAgreementStats,
  createGoldStats,
  finalizeAgreement,
  finalizeGold,
} from '../scripts/pronunciation-generator-benchmark-core.mjs';
import { evaluatePronunciationAdmission } from '../scripts/pronunciation-backfill-admission-core.mjs';
import { mapConcurrent } from '../scripts/pronunciation-espeak-parallel.mjs';

test('surface audit classifies lexical and suspicious shapes deterministically',()=>{
  assert.equal(classifySurface('Arbeitsweise',1).shape,'clean_single');
  assert.equal(classifySurface('E-Mail',1).shape,'joined_lexeme');
  assert.equal(classifySurface('heute abend',2).shape,'multiword');
  assert.equal(classifySurface('B2B',1).shape,'mixed_alnum');
  assert.equal(classifySurface('東京',1).shape,'non_latin_letters');
  assert.equal(classifySurface('foo/bar',1).shape,'other_punctuation');
});

test('equal quotas sum exactly and deterministic sampling is stable',()=>{
  const quotas=allocateEqualQuotas(['c','a','b'],10);
  assert.equal([...quotas.values()].reduce((a,b)=>a+b,0),10);
  assert.deepEqual([...quotas.keys()],['a','b','c']);
  const rows=Array.from({length:100},(_,id)=>({id}));
  const a=deterministicTake(rows,10,'seed',(row)=>row.id);
  const b=deterministicTake(rows,10,'seed',(row)=>row.id);
  assert.deepEqual(a,b);
});

test('generator agreement metrics preserve analyzer-level comparison',()=>{
  const left={canonicalPhonemes:'abc',exactTailKey:'bc',syllableCount:2,stressPattern:'10',primaryStressSyllable:1};
  const right={...left};
  const comparison=compareAnalyses(left,right,()=>({overall:.9}));
  assert.equal(comparison.exact_phones,true);
  assert.equal(comparison.exact_tail,true);
  assert.equal(comparison.rhyme_score,.9);

  const stats=createAgreementStats();
  addAgreement(stats,{espeakAccepted:true,clientAccepted:true,comparison});
  const final=finalizeAgreement(stats);
  assert.equal(final.espeak_coverage_pct,100);
  assert.equal(final.client_coverage_pct,100);
  assert.equal(final.exact_phone_agreement_pct,100);
});

test('gold calibration metrics compare predictions to references without declaring unresolved correctness',()=>{
  const stats=createGoldStats();
  addGold(stats,{
    exactPhones:true,
    exactTail:true,
    syllable:true,
    stress:false,
    primaryStress:true,
    score:{overall:.75},
  });
  addGold(stats,null);
  const final=finalizeGold(stats);
  assert.equal(final.cases,2);
  assert.equal(final.prediction_coverage_pct,50);
  assert.equal(final.exact_tail_pct,100);
  assert.equal(final.stress_pattern_pct,0);
  assert.equal(final.mean_rhyme_score,.75);
});


test('source-aware admission keeps lexical words, holds ambiguous word-source surfaces, and rejects explicit artifacts',()=>{
  const clean=evaluatePronunciationAdmission({
    surface:'Arbeitsweise',
    tokenCount:1,
    scopes:['de_usage_source_minus_accepted'],
  });
  assert.equal(clean.decision,'admit');
  assert.equal(clean.shape,'clean_single');

  const listedPhrase=evaluatePronunciationAdmission({
    surface:'wir änderten',
    tokenCount:2,
    scopes:['de_listed_form_source_minus_accepted'],
  });
  assert.equal(listedPhrase.decision,'review');
  assert.equal(listedPhrase.reason,'word_target_multiword');

  const template=evaluatePronunciationAdmission({
    surface:'er/sie/es werde kompostiert werden',
    tokenCount:6,
    scopes:['de_listed_form_source_minus_accepted'],
  });
  assert.equal(template.decision,'reject_noise');
  assert.equal(template.reason,'word_source_pronoun_template');

  const entity=evaluatePronunciationAdmission({
    surface:'New York',
    tokenCount:2,
    scopes:['entity_en_no_source_pronunciation'],
  });
  assert.equal(entity.decision,'admit');

  const phrase=evaluatePronunciationAdmission({
    surface:'heute abend große party',
    tokenCount:4,
    scopes:['phrase_surface_unresolved'],
  });
  assert.equal(phrase.decision,'admit');
});

test('admission conservatively reviews work items that have no surviving source provenance',()=>{
  const result=evaluatePronunciationAdmission({
    surface:'Hawaiʻi',
    tokenCount:1,
    scopes:[],
  });
  assert.equal(result.decision,'review');
  assert.equal(result.reason,'no_source_scope');
  assert.deepEqual(result.scopes,[]);
});

test('admission is permissive across overlapping scopes when a pronunciation-independent product scope admits the item',()=>{
  const result=evaluatePronunciationAdmission({
    surface:'New York',
    tokenCount:2,
    scopes:['en_wiktionary_lexical_source_minus_accepted','entity_en_no_source_pronunciation'],
  });
  assert.equal(result.decision,'admit');
  assert.deepEqual(result.scopes,[
    'en_wiktionary_lexical_source_minus_accepted',
    'entity_en_no_source_pronunciation',
  ]);
});

test('bounded concurrent mapper preserves input order and respects worker cap',async()=>{
  let active=0;
  let peak=0;
  const values=Array.from({length:12},(_,index)=>index);
  const result=await mapConcurrent(values,3,async(value)=>{
    active+=1;
    peak=Math.max(peak,active);
    await new Promise((resolve)=>setTimeout(resolve,2));
    active-=1;
    return value*2;
  });
  assert.deepEqual(result,values.map((value)=>value*2));
  assert.ok(peak<=3);
  assert.ok(peak>=2);
});
