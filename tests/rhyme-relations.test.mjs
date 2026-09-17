import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySoundRelations } from '../scripts/rhyme-relations.mjs';

const exact = (a,b)=>a===b?1:0;
const softVowel = (a,b)=>a===b?1:({ 'ə:aː':0.73, 'aː:ə':0.73, 'aɪ:ɐ':0.625, 'ɐ:aɪ':0.625 }[`${a}:${b}`] ?? 0.2);
const softCons = (a,b)=>a===b?1:0.2;
const v = (...nuclei)=>({rhyme:nuclei.map((nucleus,index)=>({nucleus:{symbol:nucleus},onset:index?[]:[],coda:[]}))});
const vc = (nucleus,coda)=>({rhyme:[{nucleus:{symbol:nucleus},onset:[],coda:coda.map(symbol=>({symbol}))}]});

test('multisyllabic shared first vowel alone is not assonance',()=>{
  const relations=classifySoundRelations(v('ɪ','ə','aɪ'),v('ɪ','aː','ɐ'),{vowelSimilarity:softVowel,consonantSimilarity:softCons});
  assert.equal(relations.assonance.matched,false);
});

test('same stressed vowel with a different coda is assonance',()=>{
  const relations=classifySoundRelations(vc('aʊ',['s']),vc('aʊ',['m']),{vowelSimilarity:exact,consonantSimilarity:softCons});
  assert.equal(relations.assonance.matched,true);
  assert.equal(relations.consonance.matched,false);
});

test('same coda with contrasting vowels is consonance',()=>{
  const relations=classifySoundRelations(vc('aʊ',['s']),vc('ɪ',['s']),{vowelSimilarity:exact,consonantSimilarity:softCons});
  assert.equal(relations.consonance.matched,true);
  assert.equal(relations.assonance.matched,false);
});
