import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUERY_PRONUNCIATION_GOLD_BUCKETS,
  deterministicTake,
  evaluateAgainstReferences,
  syllableBucket,
} from '../scripts/query-pronunciation-gold-core.mjs';

test('query pronunciation gold sampling is deterministic and bucketed',()=>{
  const rows=Array.from({length:20},(_,index)=>({id:index+1}));
  const first=deterministicTake(rows,5,'seed',(row)=>row.id);
  const second=deterministicTake(rows,5,'seed',(row)=>row.id);
  assert.deepEqual(first,second);
  assert.equal(first.length,5);
  assert.equal(new Set(first.map((row)=>row.id)).size,5);

  assert.deepEqual(QUERY_PRONUNCIATION_GOLD_BUCKETS,['1','2','3','4+']);
  assert.equal(syllableBucket(1),'1');
  assert.equal(syllableBucket(2),'2');
  assert.equal(syllableBucket(3),'3');
  assert.equal(syllableBucket(4),'4+');
  assert.equal(syllableBucket(9),'4+');
});

test('gold evaluation chooses the highest-scoring reference and reports exact dimensions',()=>{
  const predicted={
    canonicalPhonemes:'a b',
    exactTailKey:'ab',
    syllableCount:1,
    stressPattern:'2',
    primaryStressSyllable:1,
  };
  const weaker={
    canonicalPhonemes:'a p',
    exactTailKey:'ap',
    syllableCount:1,
    stressPattern:'2',
    primaryStressSyllable:1,
    score:0.4,
  };
  const exact={
    canonicalPhonemes:'a b',
    exactTailKey:'ab',
    syllableCount:1,
    stressPattern:'2',
    primaryStressSyllable:1,
    score:1,
  };
  const best=evaluateAgainstReferences(
    predicted,
    [weaker,exact],
    (reference)=>({overall:reference.score}),
  );
  assert.equal(best.reference,exact);
  assert.equal(best.exactPhones,true);
  assert.equal(best.exactTail,true);
  assert.equal(best.syllable,true);
  assert.equal(best.stress,true);
  assert.equal(best.primaryStress,true);
});
