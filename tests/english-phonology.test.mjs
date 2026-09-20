import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeEnglishPronunciation, analyzeEnglishArpabet, analyzeEnglishIpa } from '../scripts/english-phonology.mjs';
import { scoreEnglishRhymeAnalyses } from '../scripts/english-rhyme-features.mjs';

const fixture=JSON.parse(await readFile(new URL('../fixtures/en/phonology-v1.json',import.meta.url),'utf8'));
const analyses=new Map(fixture.entries.map(entry=>[
  entry.id,
  analyzeEnglishPronunciation(entry.pronunciation,{notation:entry.notation,locale:entry.locale,source:entry.source}),
]));

test('English ARPAbet analyzer preserves lexical stress and derives rhyme tail from the last relevant stress',()=>{
  const noun=analyses.get('record-noun-us');
  const verb=analyses.get('record-verb-us');
  assert.equal(noun.stressPattern,'20');
  assert.equal(verb.stressPattern,'02');
  assert.equal(noun.rhymeStartSyllable,1);
  assert.equal(verb.rhymeStartSyllable,2);
  assert.notEqual(noun.exactTailKey,verb.exactTailKey);
});

test('English canonical analyzer unifies CMUdict ARPAbet and Wiktionary IPA without flattening locale evidence',()=>{
  const us=analyzeEnglishArpabet('K AA1 R',{locale:'en-US'});
  const usIpa=analyzeEnglishIpa('/kɑɹ/',{locale:'en-US'});
  const gb=analyzeEnglishIpa('/kɑː/',{locale:'en-GB'});
  assert.equal(us.canonicalPhonemes,usIpa.canonicalPhonemes);
  assert.equal(us.exactTailKey,usIpa.exactTailKey);
  assert.notEqual(us.exactTailKey,gb.exactTailKey);
  assert.equal(us.rhotic,true);
  assert.equal(gb.rhotic,false);
});

test('English IPA analyzer ignores Unicode format controls embedded in phonetic sequences',()=>{
  const clean=analyzeEnglishIpa('ɐbˈaɪm',{locale:'en-US'});
  const withJoiner=analyzeEnglishIpa('ɐbˈa\u200Dɪm',{locale:'en-US'});
  assert.equal(withJoiner.canonicalPhonemes,clean.canonicalPhonemes);
  assert.equal(withJoiner.stressPattern,clean.stressPattern);
  assert.equal(withJoiner.exactTailKey,clean.exactTailKey);
});

test('English IPA analyzer canonicalizes eSpeak US centralized I vowel',()=>{
  const clean=analyzeEnglishIpa('dɪpɹˈaɪm',{locale:'en-US'});
  const espeak=analyzeEnglishIpa('dᵻpɹˈa\\u200Dɪm',{locale:'en-US'});
  assert.equal(espeak.canonicalPhonemes,clean.canonicalPhonemes);
  assert.equal(espeak.stressPattern,clean.stressPattern);
  assert.equal(espeak.exactTailKey,clean.exactTailKey);
});

test('English fixture covers exact, multisyllabic, slant-family and independent relation behavior',()=>{
  for(const expectation of fixture.pair_expectations){
    const left=analyses.get(expectation.left),right=analyses.get(expectation.right);
    const score=scoreEnglishRhymeAnalyses(left,right);
    if(expectation.type) assert.equal(score.type,expectation.type,expectation.id);
    if(expectation.not_type) assert.notEqual(score.type,expectation.not_type,expectation.id);
    if(expectation.exact_tail) assert.equal(left.exactTailKey,right.exactTailKey,expectation.id);
    if(expectation.not_exact) assert.notEqual(left.exactTailKey,right.exactTailKey,expectation.id);
    if(expectation.relation) assert.equal(score.relations[expectation.relation].matched,true,expectation.id);
    if(expectation.exclude_relation) assert.equal(score.relations[expectation.exclude_relation].matched,false,expectation.id);
  }
});

test('English fixture preserves alternate, dialect and rhotic variants as distinct analyses',()=>{
  for(const expectation of fixture.variant_expectations){
    const left=analyses.get(expectation.left),right=analyses.get(expectation.right);
    if(expectation.distinct_tail) assert.notEqual(left.exactTailKey,right.exactTailKey,expectation.id);
    if(expectation.distinct_stress) assert.notEqual(left.stressPattern,right.stressPattern,expectation.id);
    if(expectation.locales) assert.deepEqual([left.locale,right.locale],expectation.locales,expectation.id);
    if(expectation.rhotic) assert.deepEqual([left.rhotic,right.rhotic],expectation.rhotic,expectation.id);
  }
});

test('false orthographic friends do not become exact rhymes through spelling similarity',()=>{
  for(const [a,b] of [['cough-us','though-us'],['love-us','move-us']]){
    const left=analyses.get(a),right=analyses.get(b);
    assert.notEqual(left.exactTailKey,right.exactTailKey);
    assert.notEqual(scoreEnglishRhymeAnalyses(left,right).type,'perfect');
  }
});
