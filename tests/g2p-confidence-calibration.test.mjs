import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildG2pScoreCalibration,
  hasFiniteG2pScore,
} from '../scripts/g2p-confidence-calibration.mjs';

test('G2P score calibration treats lower Pynini score as better and reports retained quality',()=>{
  const rows=[
    {case_id:'a',g2p_score:0.1,exact_phones:true,exact_tail:true,syllable_match:true,stress_match:true,primary_stress_match:true,rhyme_score:1},
    {case_id:'b',g2p_score:0.2,exact_phones:true,exact_tail:true,syllable_match:true,stress_match:true,primary_stress_match:true,rhyme_score:0.95},
    {case_id:'c',g2p_score:0.3,exact_phones:false,exact_tail:false,syllable_match:true,stress_match:false,primary_stress_match:true,rhyme_score:0.7},
    {case_id:'d',g2p_score:0.4,exact_phones:false,exact_tail:false,syllable_match:false,stress_match:false,primary_stress_match:false,rhyme_score:0.2},
  ];
  const report=buildG2pScoreCalibration(rows,{retentionFractions:[0.5,1]});
  assert.equal(report.score_direction,'lower_is_better');
  assert.equal(report.scored_cases,4);
  assert.equal(report.retention_points.length,2);
  assert.equal(report.retention_points[0].retained,2);
  assert.equal(report.retention_points[0].exact_tail_pct,100);
  assert.equal(report.retention_points[1].retained,4);
  assert.equal(report.retention_points[1].exact_tail_pct,50);
  assert.equal(report.max_retention_at_exact_tail_90pct.retained,2);
  assert.equal(report.max_retention_at_exact_tail_85pct.retained,2);
});

test('G2P score calibration ignores rows without finite scores',()=>{
  const report=buildG2pScoreCalibration([
    {case_id:'a',g2p_score:null,exact_tail:true,rhyme_score:1},
    {case_id:'b',g2p_score:0.3,exact_phones:true,exact_tail:true,syllable_match:true,stress_match:true,primary_stress_match:true,rhyme_score:1},
  ],{retentionFractions:[1]});
  assert.equal(report.scored_cases,1);
  assert.equal(report.retention_points[0].retained,1);
});


test('missing confidence values are not coerced to zero',()=>{
  assert.equal(hasFiniteG2pScore(null),false);
  assert.equal(hasFiniteG2pScore(undefined),false);
  assert.equal(hasFiniteG2pScore(''),false);
  assert.equal(hasFiniteG2pScore('0'),true);
  assert.equal(hasFiniteG2pScore(0),true);
});
