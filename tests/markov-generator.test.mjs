import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKOV_GENERATOR_POLICY,
  generateMarkovCandidates,
  summarizePool,
  vowelSimilarity,
} from '../src/markov-test/markov-core.mjs';

const rows=[
  {resultKind:'word',surface:'Hochzeitsreise',normalized:'hochzeitsreise',ipa:'hɔx tsaɪts ʁaɪzə',score:.94,primaryType:'multisyllabic_perfect',usageRank:1200,relations:[{type:'assonance',score:.95},{type:'consonance',score:.7}]},
  {resultKind:'word',surface:'Notfallbleibe',normalized:'notfallbleibe',ipa:'noːt fal blaɪbə',score:.87,primaryType:'multisyllabic_slant',usageRank:2500,relations:[{type:'assonance',score:.83}]},
  {resultKind:'word',surface:'Kreise',normalized:'kreise',ipa:'kʁaɪzə',score:.8,primaryType:'perfect',usageRank:900},
  {resultKind:'word',surface:'Zeitreise',normalized:'zeitreise',ipa:'tsaɪt ʁaɪzə',score:.9,primaryType:'multisyllabic_perfect',usageRank:650,relations:[{type:'assonance',score:.93}]},
  {resultKind:'entity',surface:'Michael Jackson',normalized:'michael jackson',ipa:'maɪkəl dʒæksən',score:.76,popularityPercentile:.99,entityCategories:[{category:'person.singer'}],relations:[{type:'assonance',score:.6}]},
  {resultKind:'phrase',surface:'auf leise Weise',normalized:'auf leise weise',ipa:'aʊf laɪzə vaɪzə',score:.91,crossedWordBoundaries:2,leipzigCommonness:.8,relations:[{type:'assonance',score:.96}]},
];

test('Markov bootstrap generation is deterministic for identical inputs',()=>{
  const options={
    rows,
    target:'Arbeitsweise',
    seedText:'Nachts in der Stadt',
    seed:4242,
    mode:'chain',
    rhymePressure:86,
    naturalness:65,
    weirdness:44,
    targetTokens:12,
    count:8,
    attempts:48,
  };
  const first=generateMarkovCandidates(options);
  const second=generateMarkovCandidates(options);
  assert.ok(first.length>=4);
  assert.deepEqual(first,second);
  assert.equal(first[0].model.policy,MARKOV_GENERATOR_POLICY);
  assert.match(first[0].sentence,/^Nachts in der Stadt/u);
  assert.ok(first[0].scores.utility>=0&&first[0].scores.utility<=1);
  assert.ok(first[0].scores.assonanceChain>=0&&first[0].scores.assonanceChain<=1);
});

test('Markov source toggles prevent Phrase and Entity tokens when disabled',()=>{
  const candidates=generateMarkovCandidates({
    rows,
    target:'Arbeitsweise',
    seed:99,
    allowEntities:false,
    allowPhrases:false,
    count:10,
    attempts:64,
  });
  assert.ok(candidates.length);
  for(const candidate of candidates){
    assert.equal(candidate.tokens.some((token)=>token.kind==='entity'),false);
    assert.equal(candidate.tokens.some((token)=>token.kind==='phrase'),false);
  }
});

test('pool summary retains feature populations',()=>{
  assert.deepEqual(summarizePool(rows),{
    total:6,
    word:4,
    phrase:1,
    entity:1,
    generated:0,
  });
});

test('vowel similarity rewards related vowel chains',()=>{
  const close=vowelSimilarity('tsaɪt ʁaɪzə','aʊf laɪzə vaɪzə');
  const far=vowelSimilarity('tsaɪt ʁaɪzə','mʊk tɔp');
  assert.ok(close>far);
});
