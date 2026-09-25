import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStudioAnalysisClient,
  expandStudioRhymeRelations,
  studioAnalysisOccurrences,
  studioRhymeTypeCounts,
} from '../packages/shared-core/src/services/analysis-adapter.mjs';

test('all-rhyme occurrence extraction preserves bar positions',()=>{
  const rows=studioAnalysisOccurrences([
    'Alpha beta',
    'Gamma delta alpha',
  ]);
  assert.deepEqual(
    rows.map((row)=>[row.lineIndex,row.wordIndex,row.surface,row.normalized]),
    [
      [0,0,'Alpha','alpha'],
      [0,1,'beta','beta'],
      [1,0,'Gamma','gamma'],
      [1,1,'delta','delta'],
      [1,2,'alpha','alpha'],
    ],
  );
});

test('all-rhyme relation expansion maps canonical pairs back to occurrences',()=>{
  const occurrences=studioAnalysisOccurrences(['Haus Maus','Haus']);
  const relations=expandStudioRhymeRelations({
    language:'de',
    pairs:[{
      left:'haus',
      right:'maus',
      type:'perfect',
      label:'Vollreim',
      score:.98,
      primary:true,
      language:'de',
    }],
  },occurrences);

  assert.equal(relations.length,3);
  assert.equal(relations.filter((row)=>row.type==='perfect').length,2);
  assert.equal(relations.filter((row)=>row.type==='identity').length,1);
  assert.deepEqual(studioRhymeTypeCounts(relations),{perfect:2,identity:1});
});

test('analysis client requests canonical all-word mode and returns occurrence relations',async()=>{
  const requests=[];
  const client=createStudioAnalysisClient({
    fetchImpl:async(url)=>{
      requests.push(String(url));
      return {
        ok:true,
        status:200,
        async json(){
          return {
            language:'de',
            pairs:[{
              left:'nacht',
              right:'macht',
              type:'perfect',
              label:'Vollreim',
              score:1,
              primary:true,
              language:'de',
            }],
            coverage:{unique:2,resolved:2,unresolved:[],truncated:false},
          };
        },
      };
    },
  });
  const result=await client.analyzeAll(['Nacht macht']);
  assert.match(requests[0],/mode=all/u);
  assert.match(requests[0],/word=Nacht/u);
  assert.match(requests[0],/word=macht/u);
  assert.equal(result.occurrences.length,2);
  assert.equal(result.occurrenceRelations.length,1);
  assert.equal(result.occurrenceRelations[0].type,'perfect');
});
