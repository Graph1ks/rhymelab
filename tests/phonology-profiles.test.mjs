import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANDIDATE_PHONOLOGY_LANGUAGES,
  getCandidatePhonologyProfile,
  getPhonologyProfile,
  SUPPORTED_PHONOLOGY_LANGUAGES,
} from '../scripts/phonology-profiles.mjs';

test('phonology profile boundary exposes accepted German and English product profiles',()=>{
  assert.deepEqual(SUPPORTED_PHONOLOGY_LANGUAGES,['de','en']);
  assert.deepEqual(CANDIDATE_PHONOLOGY_LANGUAGES,['en']);

  const de=getPhonologyProfile('de');
  assert.equal(de.language,'de');
  assert.equal(de.analyzerVersion,'de-ipa-v2');
  assert.equal(de.scorerVersion,'de-phon-v3');
  assert.equal(de.relationPolicyVersion,'rhyme-relations-v2');
  assert.equal(typeof de.analyzeIpa,'function');
  assert.equal(typeof de.scoreAnalyses,'function');

  const en=getPhonologyProfile('en');
  assert.equal(en.language,'en');
  assert.equal(en.locale,'en-US');
  assert.equal(en.status,'accepted_product_v1');
  assert.equal(en.analyzerVersion,'en-pron-v1-candidate');
  assert.equal(en.scorerVersion,'en-phon-v1-candidate');
  assert.equal(typeof en.analyzeArpabet,'function');
  assert.equal(typeof en.analyzeIpa,'function');
  assert.equal(typeof en.scoreAnalyses,'function');

  const compatibility=getCandidatePhonologyProfile('en');
  assert.equal(compatibility,en);
});

test('accepted English phonology profile scores a canonical perfect rhyme',()=>{
  const en=getPhonologyProfile('en');
  const time=en.analyzeArpabet('T AY1 M');
  const rhyme=en.analyzeArpabet('R AY1 M');
  const score=en.scoreAnalyses(time,rhyme);
  assert.equal(score.type,'perfect');
  assert.equal(score.overall,1);
});
