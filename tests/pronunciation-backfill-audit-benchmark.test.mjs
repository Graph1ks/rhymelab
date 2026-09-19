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
