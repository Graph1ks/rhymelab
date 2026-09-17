import test from 'node:test';
import assert from 'node:assert/strict';
import { RHYME_TYPES, selectResultsWithTypeCoverage, resultMatchesType } from '../src/local-engine.mjs';

function row(type,index){
  const relation=type==='assonance'||type==='consonance';
  return {
    type:relation?'weak':type,
    primaryType:relation?null:type,
    relationTypes:relation?[type]:[],
    relations:relation?[{type,strength:index<5?'strong':'partial',score:1-index/1000}]:[],
    normalized:`${type}-${index}`,word:`${type}-${index}`,rhymeTier:RHYME_TYPES.indexOf(type),syllableDistance:index%3,usageRank:index+1,score:relation?.55:1-index/1000,language:'de'
  };
}

test('balanced selection reserves representation for primary classes and independent relations',()=>{
  const rows=RHYME_TYPES.flatMap((type)=>Array.from({length:30},(_,index)=>row(type,index)));
  const{results,selection}=selectResultsWithTypeCoverage(rows,{limit:140,type:'all',ensureTypeCoverage:true,coverageFloor:12});
  assert.equal(selection.mode,'balanced');assert.equal(results.length,140);
  for(const type of RHYME_TYPES)assert.ok(selection.returnedByType[type]>=12,`${type} should receive coverage`);
});

test('relation selection uses relation membership rather than primary type',()=>{
  const overlap={...row('slant',1),relationTypes:['assonance'],relations:[{type:'assonance',strength:'strong',score:.99}]};
  assert.equal(resultMatchesType(overlap,'slant'),true);assert.equal(resultMatchesType(overlap,'assonance'),true);
  const rows=[overlap,...Array.from({length:40},(_,i)=>row('assonance',i))];
  const{results,selection}=selectResultsWithTypeCoverage(rows,{limit:25,type:'assonance'});
  assert.equal(selection.mode,'single_relation');assert.equal(results.length,25);assert.ok(results.every(r=>resultMatchesType(r,'assonance')));
});
