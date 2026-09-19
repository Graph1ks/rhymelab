import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateRedundancy,
  commonnessUtility,
  diversifyRanked,
  guardViolations,
  lexicalSimilarity,
  pageMetrics,
  qualityEvidence,
  rankQualityRows,
} from '../scripts/en-writer-ranking-v2-core.mjs';

test('English Writer v2 commonness remains bounded and unknown usage stays explicit',()=>{
  assert.ok(commonnessUtility(6,100)>commonnessUtility(3,50000));
  assert.ok(commonnessUtility(null,null)>=0&&commonnessUtility(null,null)<=1);
  const config={phonetic:0.80,syllable:0.14,commonness:0.06,unknown_usage_penalty:0.015,near_tie_band:0.03};
  const known=qualityEvidence({normalized:'known',score:{overall:1,syllable:1},wordfreq_rank:100,wordfreq_zipf:6},'query',config);
  const unknown=qualityEvidence({normalized:'unknown',score:{overall:1,syllable:1},wordfreq_rank:null,wordfreq_zipf:null},'query',config);
  assert.equal(known.usage_known,true);
  assert.equal(unknown.usage_known,false);
  assert.equal(unknown.usage_uncertainty_penalty,0.015);
});

test('English Writer v2 anchored bands block non-transitive near-tie chains',()=>{
  const config={phonetic:0.80,syllable:0.14,commonness:0.06,unknown_usage_penalty:0.015,near_tie_band:0.03};
  const rows=[
    {normalized:'a',tier:0,pronunciation_id:1,wordfreq_rank:50000,wordfreq_zipf:2.5,score:{overall:0.95,syllable:1}},
    {normalized:'b',tier:0,pronunciation_id:2,wordfreq_rank:10,wordfreq_zipf:6.5,score:{overall:0.93,syllable:1}},
    {normalized:'c',tier:0,pronunciation_id:3,wordfreq_rank:1,wordfreq_zipf:7.5,score:{overall:0.91,syllable:1}},
  ].map((row)=>({...row,evidence:qualityEvidence(row,'query',config)}));
  const ranked=rankQualityRows(rows,config);
  assert.equal(ranked[0].quality_band,ranked[1].quality_band);
  assert.notEqual(ranked[1].quality_band,ranked[2].quality_band);
  assert.equal(ranked[2].normalized,'c');
  assert.equal(guardViolations(ranked,{nearTieBand:0.03}).length,0);
});

test('raw English query spelling overlap is diagnostic only in Writer v2 utility',()=>{
  const config={phonetic:0.80,syllable:0.14,commonness:0.06,unknown_usage_penalty:0.015,near_tie_band:0.03};
  const base={tier:0,wordfreq_rank:1000,wordfreq_zipf:5,score:{overall:1,syllable:1}};
  const crime=qualityEvidence({...base,normalized:'crime'},'time',config);
  const rhyme=qualityEvidence({...base,normalized:'rhyme'},'time',config);
  assert.notEqual(crime.lexical_overlap,rhyme.lexical_overlap);
  assert.equal(crime.utility,rhyme.utility);
});

test('English Writer v2 diversity stays inside tier and anchored quality band',()=>{
  const base=[
    {normalized:'alpha',tier:0,pronunciation_id:1,lemmas:'["root"]',evidence:{utility:0.90,phonetic:0.95,commonness:0.5,usage_known:true,lexical_overlap:0}},
    {normalized:'alphas',tier:0,pronunciation_id:2,lemmas:'["root"]',evidence:{utility:0.89,phonetic:0.95,commonness:0.5,usage_known:true,lexical_overlap:0}},
    {normalized:'beta',tier:0,pronunciation_id:3,lemmas:'["beta"]',evidence:{utility:0.88,phonetic:0.94,commonness:0.5,usage_known:true,lexical_overlap:0}},
    {normalized:'gamma',tier:1,pronunciation_id:4,lemmas:'["gamma"]',evidence:{utility:0.99,phonetic:0.99,commonness:0.8,usage_known:true,lexical_overlap:0}},
  ];
  assert.ok(candidateRedundancy(base[0],base[1])>=0.95);
  const ranked=rankQualityRows(base,{near_tie_band:0.03});
  const diversified=diversifyRanked(ranked,{weight:0.12,limit:4});
  assert.equal(diversified[0].normalized,'alpha');
  assert.equal(diversified[1].normalized,'beta');
  assert.equal(diversified[3].normalized,'gamma');
  assert.equal(guardViolations(diversified,{nearTieBand:0.03,limit:4}).length,0);
  assert.equal(pageMetrics(diversified,4).rows,4);
});

test('lexical similarity remains available for diversity diagnostics',()=>{
  assert.equal(lexicalSimilarity('time','time'),1);
  assert.ok(lexicalSimilarity('nation','station')>0);
});
