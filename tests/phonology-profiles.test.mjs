import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANDIDATE_PHONOLOGY_LANGUAGES,
  getCandidatePhonologyProfile,
  getPhonologyProfile,
  SUPPORTED_PHONOLOGY_LANGUAGES,
} from '../scripts/phonology-profiles.mjs';

test('phonology profile boundary keeps German accepted while English remains candidate-gated',()=>{
  assert.deepEqual(SUPPORTED_PHONOLOGY_LANGUAGES,['de']);
  assert.deepEqual(CANDIDATE_PHONOLOGY_LANGUAGES,['en']);
  const de=getPhonologyProfile('de');
  assert.equal(de.language,'de');
  assert.equal(de.analyzerVersion,'de-ipa-v2');
  assert.equal(de.scorerVersion,'de-phon-v3');
  assert.equal(de.relationPolicyVersion,'rhyme-relations-v2');
  assert.equal(typeof de.analyzeIpa,'function');
  assert.equal(typeof de.scoreAnalyses,'function');
  assert.throws(()=>getPhonologyProfile('en'),/Unsupported RhymeLab phonology language/);

  const en=getCandidatePhonologyProfile('en');
  assert.equal(en.language,'en');
  assert.equal(en.locale,'en-US');
  assert.equal(en.status,'candidate_fixture_only');
  assert.equal(en.analyzerVersion,'en-pron-v1-candidate');
  assert.equal(en.scorerVersion,'en-phon-v1-candidate');
  assert.equal(typeof en.analyzeArpabet,'function');
  assert.equal(typeof en.analyzeIpa,'function');
  assert.equal(typeof en.scoreAnalyses,'function');
});
