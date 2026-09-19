import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateRedundancy,
  commonnessUtility,
  diversifyRanked,
  guardViolations,
  lexicalSimilarity,
  pageMetrics,
  rankQualityRows,
  qualityEvidence,
} from '../scripts/en-writer-ranking-evidence-core.mjs';

test('English ranking evidence keeps commonness bounded and lexical overlap explicit',()=>{
  assert.ok(commonnessUtility(6,100)>commonnessUtility(3,50000));
  assert.ok(commonnessUtility(null,null)>=0&&commonnessUtility(null,null)<=1);
  assert.equal(lexicalSimilarity('time','time'),1);
  assert.ok(lexicalSimilarity('nation','station')>0);
});

test('English anchored quality bands do not let commonness jump outside phonetic guard',()=>{
  const config={phonetic:0.80,syllable:0.14,commonness:0.06,unknown_usage_penalty:0.015,near_tie_band:0.03};
  const rows=[
    {
      normalized:'strong',
      tier:0,
      wordfreq_rank:50000,
      score:{overall:0.95,syllable:1},
      wordfreq_zipf:2.5,
    },
    {
      normalized:'common',
      tier:0,
      wordfreq_rank:10,
      score:{overall:0.90,syllable:1},
      wordfreq_zipf:6.5,
    },
  ].map((row)=>({...row,evidence:qualityEvidence(row,'query',config)}));
  const ranked=rankQualityRows(rows,config);
  assert.equal(ranked[0].normalized,'strong');
  assert.equal(guardViolations(ranked,{nearTieBand:0.03}).length,0);
});

test('English diversity suppresses same-lemma concentration without crossing tier boundary',()=>{
  const base=[
    {normalized:'alpha',tier:0,lemmas:'["root"]',evidence:{utility:0.90,phonetic:0.95,commonness:0.5,lexical_overlap:0}},
    {normalized:'alphas',tier:0,lemmas:'["root"]',evidence:{utility:0.89,phonetic:0.95,commonness:0.5,lexical_overlap:0}},
    {normalized:'beta',tier:0,lemmas:'["beta"]',evidence:{utility:0.88,phonetic:0.94,commonness:0.5,lexical_overlap:0}},
    {normalized:'gamma',tier:1,lemmas:'["gamma"]',evidence:{utility:0.99,phonetic:0.99,commonness:0.8,lexical_overlap:0}},
  ];
  assert.ok(candidateRedundancy(base[0],base[1])>=0.95);
  const ranked=rankQualityRows(base,{near_tie_band:0.03});
  const diversified=diversifyRanked(ranked,{weight:0.18,limit:4});
  assert.equal(diversified[0].normalized,'alpha');
  assert.equal(diversified[1].normalized,'beta');
  assert.equal(diversified[3].normalized,'gamma');
  const metrics=pageMetrics(diversified,4);
  assert.equal(metrics.rows,4);
});


test('English anchored quality bands break non-transitive near-tie chains safely',()=>{
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

test('raw query spelling overlap is diagnostic only in English utility',()=>{
  const config={phonetic:0.80,syllable:0.14,commonness:0.06,unknown_usage_penalty:0.015,near_tie_band:0.03};
  const base={tier:0,wordfreq_rank:1000,wordfreq_zipf:5,score:{overall:1,syllable:1}};
  const crime=qualityEvidence({...base,normalized:'crime'},'time',config);
  const thyme=qualityEvidence({...base,normalized:'thyme'},'time',config);
  assert.notEqual(crime.lexical_overlap,thyme.lexical_overlap);
  assert.equal(crime.utility,thyme.utility);
});
