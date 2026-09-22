import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampSyllableFilterRange,
  matchesSyllableFilter,
  normalizeSyllableFilter,
  syllableFilterRange,
} from '../src/syllable-filter.mjs';

test('syllable filter normalizes Studio modes and preserves all as no restriction',()=>{
  assert.equal(normalizeSyllableFilter('near'),'near');
  assert.equal(normalizeSyllableFilter('bogus'),'all');
  assert.equal(syllableFilterRange('all',4),null);
});

test('absolute syllable filters are independent from query length',()=>{
  assert.deepEqual(syllableFilterRange('1',4),{min:1,max:1});
  assert.deepEqual(syllableFilterRange('2',4),{min:2,max:2});
  assert.equal(matchesSyllableFilter(1,'1',4),true);
  assert.equal(matchesSyllableFilter(4,'1',4),false);
  assert.equal(matchesSyllableFilter(2,'2',4),true);
  assert.equal(matchesSyllableFilter(5,'3',4),true);
  assert.equal(matchesSyllableFilter(2,'3',4),false);
});

test('relative syllable filters resolve against the query syllable count',()=>{
  assert.deepEqual(syllableFilterRange('same',4),{min:4,max:4});
  assert.deepEqual(syllableFilterRange('near1',4),{min:3,max:5});
  assert.deepEqual(syllableFilterRange('near2',4),{min:2,max:6});
  assert.deepEqual(syllableFilterRange('near3',2),{min:1,max:5});
});

test('available runtime range clamps requested syllable domain',()=>{
  assert.deepEqual(clampSyllableFilterRange('1',4,1,8),{min:1,max:1});
  assert.deepEqual(clampSyllableFilterRange('3',4,1,6),{min:3,max:6});
  assert.deepEqual(clampSyllableFilterRange('near1',4,1,4),{min:3,max:4});
});
