import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhonologyProfile, SUPPORTED_PHONOLOGY_LANGUAGES } from '../scripts/phonology-profiles.mjs';

test('phonology profile boundary exposes German today without pretending English is implemented',()=>{
  assert.deepEqual(SUPPORTED_PHONOLOGY_LANGUAGES,['de']);
  const de=getPhonologyProfile('de');
  assert.equal(de.language,'de');
  assert.equal(de.analyzerVersion,'de-ipa-v2');
  assert.equal(de.scorerVersion,'de-phon-v3');
  assert.equal(de.relationPolicyVersion,'rhyme-relations-v2');
  assert.equal(typeof de.analyzeIpa,'function');
  assert.equal(typeof de.scoreAnalyses,'function');
  assert.throws(()=>getPhonologyProfile('en'),/Unsupported RhymeLab phonology language/);
});
