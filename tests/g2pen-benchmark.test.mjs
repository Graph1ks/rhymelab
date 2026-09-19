import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareG2pEnNeuralCases,
  prepareG2pEnNeuralInput,
} from '../scripts/g2pen-benchmark-core.mjs';

test('g2p-en neural input lowercases and folds combining diacritics',()=>{
  assert.deepEqual(
    prepareG2pEnNeuralInput('Toyota'),
    {
      original:'Toyota',
      normalized:'toyota',
      model_input:'toyota',
      eligible:true,
      strategy:'lowercase_normalized',
      removed_combining_marks:0,
      unsupported_graphemes:[],
    },
  );
  const celine=prepareG2pEnNeuralInput('Céline');
  assert.equal(celine.eligible,true);
  assert.equal(celine.model_input,'celine');
  assert.equal(celine.strategy,'lowercase_diacritic_fold');

  const pokemon=prepareG2pEnNeuralInput('Pokémon');
  assert.equal(pokemon.eligible,true);
  assert.equal(pokemon.model_input,'pokemon');
});

test('g2p-en neural input rejects unsupported residual graphemes instead of deleting them',()=>{
  const apostrophe=prepareG2pEnNeuralInput("O'Connor");
  assert.equal(apostrophe.eligible,false);
  assert.deepEqual(apostrophe.unsupported_graphemes,["'"]);

  const soren=prepareG2pEnNeuralInput('Søren');
  assert.equal(soren.eligible,false);
  assert.deepEqual(soren.unsupported_graphemes,['ø']);
});

test('g2p-en neural case preparation reports normalization collisions',()=>{
  const result=prepareG2pEnNeuralCases([
    {case_id:'a',surface:'Céline',normalized:'céline'},
    {case_id:'b',surface:'Celine',normalized:'celine'},
    {case_id:'c',surface:"O'Connor",normalized:"o'connor"},
  ]);
  assert.equal(result.eligible.length,2);
  assert.equal(result.ineligible.length,1);
  assert.equal(result.collisions.length,1);
  assert.equal(result.collisions[0].model_input,'celine');
  assert.deepEqual(result.collisions[0].case_ids,['a','b']);
  assert.equal(result.diacritic_fold_cases,1);
});
