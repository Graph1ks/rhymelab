import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateRedundancy,
  commonnessUtility,
  diversifyRanked,
  guardViolations,
  lexicalSimilarity,
  pageMetrics,
  qualityComparator,
  qualityEvidence,
} from '../scripts/en-writer-ranking-evidence-core.mjs';

test('English ranking evidence keeps commonness bounded and lexical overlap explicit',()=>{
  assert.ok(commonnessUtility(6,100)>commonnessUtility(3,50000));
  assert.ok(commonnessUtility(null,null)>=0&&commonnessUtility(null,null)<=1);
  assert.equal(lexicalSimilarity('time','time'),1);
  assert.ok(lexicalSimilarity('nation','station')>0);
});

test('English quality comparator does not let commonness jump outside phonetic guard',()=>{
  const config={phonetic:0.72,syllable:0.16,commonness:0.12,lexical_overlap:0.16,near_tie_band:0.03};
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
  rows.sort(qualityComparator(config));
  assert.equal(rows[0].normalized,'strong');
  assert.equal(guardViolations(rows,{nearTieBand:0.03}).length,0);
});

test('English diversity suppresses same-lemma concentration without crossing tier boundary',()=>{
  const base=[
    {normalized:'alpha',tier:0,lemmas:'["root"]',evidence:{utility:0.90,phonetic:0.95,commonness:0.5,lexical_overlap:0}},
    {normalized:'alphas',tier:0,lemmas:'["root"]',evidence:{utility:0.89,phonetic:0.95,commonness:0.5,lexical_overlap:0}},
    {normalized:'beta',tier:0,lemmas:'["beta"]',evidence:{utility:0.88,phonetic:0.94,commonness:0.5,lexical_overlap:0}},
    {normalized:'gamma',tier:1,lemmas:'["gamma"]',evidence:{utility:0.99,phonetic:0.99,commonness:0.8,lexical_overlap:0}},
  ];
  assert.ok(candidateRedundancy(base[0],base[1])>=0.95);
  const diversified=diversifyRanked(base,{weight:0.18,limit:4,nearTieBand:0.03});
  assert.equal(diversified[0].normalized,'alpha');
  assert.equal(diversified[1].normalized,'beta');
  assert.equal(diversified[3].normalized,'gamma');
  const metrics=pageMetrics(diversified,4);
  assert.equal(metrics.rows,4);
});
