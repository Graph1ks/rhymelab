import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKOV_GENERATOR_POLICY,
  compactWriterRows,
  markovMaterialKind,
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

test('browser Markov policy points at the corpus runtime',()=>{
  assert.equal(MARKOV_GENERATOR_POLICY,'rhymelab-markov-lyric-v1');
});

test('pool summary retains Writer feature populations',()=>{
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

test('compact Writer payload preserves generator evidence without unrelated fields',()=>{
  const compact=compactWriterRows([{...rows[0],noise:{huge:true},debugPayload:'omit me'}]);
  assert.equal(compact.length,1);
  assert.equal(compact[0].surface,'Hochzeitsreise');
  assert.equal(compact[0].score,.94);
  assert.deepEqual(compact[0].relations,[
    {type:'assonance',score:.95},
    {type:'consonance',score:.7},
  ]);
  assert.equal(Object.hasOwn(compact[0],'noise'),false);
  assert.equal(Object.hasOwn(compact[0],'debugPayload'),false);
});


test('Serving-v1 multi-token Word carriers obey Phrase material controls',()=>{
  const carrier={resultKind:'word',surface:'Wiener Walzer',normalized:'wiener walzer',score:.8};
  assert.equal(markovMaterialKind(carrier),'phrase');
  assert.equal(compactWriterRows([carrier])[0].resultKind,'phrase');
});
