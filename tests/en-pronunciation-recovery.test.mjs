import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEnglishPronunciation } from '../scripts/english-phonology.mjs';
import {
  composeEnglishInflectionIpa,
  composeEnglishInflectionIpaVariants,
  englishPossessiveBase,
  isStrictEnglishInflectionRecovery,
  punctuationOnlyAliasTargets,
  regularEnglishInflectionShape,
} from '../scripts/en-pronunciation-recovery.mjs';

function compose(arpabet,shape){
  const base=analyzeEnglishPronunciation(arpabet,{notation:'arpabet',locale:'en-US',source:'cmudict'});
  const derived=composeEnglishInflectionIpa(base,shape);
  const analysis=analyzeEnglishPronunciation(derived.raw,{notation:'ipa',locale:'en-US',source:'derived_inflection'});
  return {derived,analysis};
}

test('English punctuation-only alias recovery requires explicit alt_of identity',()=>{
  assert.deepEqual(punctuationOnlyAliasTargets({
    normalized:'dont',
    relation_kinds:['alt_of'],
    lemma_candidates:["don't"],
  }),["don't"]);
  assert.deepEqual(punctuationOnlyAliasTargets({
    normalized:'dont',
    relation_kinds:['form_of'],
    lemma_candidates:["don't"],
  }),[]);
  assert.deepEqual(punctuationOnlyAliasTargets({
    normalized:'cannot',
    relation_kinds:['alt_of'],
    lemma_candidates:["can't"],
  }),[]);
});

test('English possessive recovery recognizes only apostrophe possessive surfaces',()=>{
  assert.equal(englishPossessiveBase("world's"),'world');
  assert.equal(englishPossessiveBase("players'"),'players');
  assert.equal(englishPossessiveBase('worlds'),null);
});

test('English strict inflection gate blocks contraction and requires source morphology tags',()=>{
  assert.equal(regularEnglishInflectionShape('cats','cat'),'s_suffix');
  assert.equal(regularEnglishInflectionShape('cities','city'),'y_to_ies');
  assert.equal(regularEnglishInflectionShape('walked','walk'),'ed_suffix');
  assert.equal(regularEnglishInflectionShape('making','make'),'drop_e_ing');

  assert.equal(isStrictEnglishInflectionRecovery({surface:'cats',lemma:'cat',tags:['plural']}),true);
  assert.equal(isStrictEnglishInflectionRecovery({surface:'walked',lemma:'walk',tags:['past']}),true);
  assert.equal(isStrictEnglishInflectionRecovery({surface:'making',lemma:'make',tags:['gerund']}),true);
  assert.equal(isStrictEnglishInflectionRecovery({surface:'thats',lemma:'that',tags:['plural','contraction']}),false);
  assert.equal(isStrictEnglishInflectionRecovery({surface:'cats',lemma:'cat',tags:[]}),false);
});

test('English inflection composer applies deterministic plural allomorphs',()=>{
  assert.equal(compose('K AE1 T','s_suffix').analysis.canonicalPhonemes,'k æ t s');
  assert.equal(compose('D AO1 G','s_suffix').analysis.canonicalPhonemes,'d ɔ g z');
  assert.equal(compose('B AH1 S','es_suffix').analysis.canonicalPhonemes,'b ʌ s ɪ z');
  const base=analyzeEnglishPronunciation('B AH1 S',{notation:'arpabet',locale:'en-US',source:'cmudict'});
  const variants=composeEnglishInflectionIpaVariants(base,'es_suffix');
  assert.deepEqual(variants.map((item)=>item.suffix_ipa),['ɪz','əz']);
});

test('English inflection composer applies deterministic past allomorphs',()=>{
  assert.equal(compose('W AO1 K','ed_suffix').analysis.canonicalPhonemes,'w ɔ k t');
  assert.equal(compose('P L EY1','ed_suffix').analysis.canonicalPhonemes,'p l eɪ d');
  assert.equal(compose('W AA1 N T','ed_suffix').analysis.canonicalPhonemes,'w ɑ n t ɪ d');
  const base=analyzeEnglishPronunciation('W AA1 N T',{notation:'arpabet',locale:'en-US',source:'cmudict'});
  const variants=composeEnglishInflectionIpaVariants(base,'ed_suffix');
  assert.deepEqual(variants.map((item)=>item.suffix_ipa),['ɪd','əd']);
});

test('English inflection composer appends unstressed progressive ing',()=>{
  const {analysis}=compose('M EY1 K','drop_e_ing');
  assert.equal(analysis.canonicalPhonemes,'m eɪ k ɪ ŋ');
  assert.equal(analysis.stressPattern,'20');
});
