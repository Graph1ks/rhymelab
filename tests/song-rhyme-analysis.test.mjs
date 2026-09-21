import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SONG_RHYME_ANALYSIS_SCHEMA,
  analyzeSongEndRhymes,
  extractAnalysisEndWord,
} from '../src/song-rhyme-analysis.mjs';

test('song rhyme analysis extracts Unicode end words without punctuation',()=>{
  assert.equal(extractAnalysisEndWord('Ich geh durch die Nacht!'),'Nacht');
  assert.equal(extractAnalysisEndWord('déjà-vu …'),'déjà-vu');
  assert.equal(extractAnalysisEndWord('   '),'');
});

test('canonical rhyme analysis builds scheme from Writer relations and keeps soft relations descriptive',async()=>{
  const rows={
    nacht:[
      {word:'Macht',normalized:'macht',primaryType:'perfect',score:.97,language:'de',relations:[]},
      {word:'Tag',normalized:'tag',primaryType:null,score:.4,language:'de',relations:[{type:'assonance',score:.71}]},
    ],
    macht:[
      {word:'Nacht',normalized:'nacht',primaryType:'perfect',score:.97,language:'de',relations:[]},
    ],
    tag:[
      {word:'Nacht',normalized:'nacht',primaryType:null,score:.4,language:'de',relations:[{type:'assonance',score:.71}]},
    ],
  };
  const analysis=await analyzeSongEndRhymes(['Nacht','Macht','Tag','Nacht',''],{
    language:'de',
    searchAnchor:async(word)=>({
      status:'ok',
      input:word,
      query:{
        surface:word,
        normalized:word,
        language:'de',
        preferredIpa:word==='nacht'?'naxt':word==='macht'?'maxt':'taːk',
        syllableCount:1,
        stressPattern:'1',
        primaryStressSyllable:1,
      },
      results:rows[word]||[],
    }),
  });

  assert.equal(analysis.schema,SONG_RHYME_ANALYSIS_SCHEMA);
  assert.equal(analysis.source,'canonical_writer_runtime');
  assert.deepEqual(analysis.scheme,['A','A','B','A','—']);
  assert.equal(analysis.lineRelations[1].relation.type,'perfect');
  assert.equal(analysis.lineRelations[2].relation.type,'assonance');
  assert.equal(analysis.lineRelations[3].relation.type,'identity');
  assert.equal(analysis.wordDetails[0].ipa,'naxt');
  assert.equal(analysis.wordDetails[0].stressPattern,'1');
  assert.equal(analysis.uniqueWordDetails[1].normalized,'macht');
  assert.equal(analysis.uniqueWordDetails[1].primaryStressSyllable,1);
  assert.deepEqual(analysis.coverage,{unique:3,resolved:3,unresolved:[],truncated:false});
});

test('canonical analysis reports unresolved Writer anchors without inventing relations',async()=>{
  const analysis=await analyzeSongEndRhymes(['unknown','known'],{
    searchAnchor:async(word)=>word==='unknown'
      ?{status:'query_not_found',results:[]}
      :{status:'ok',results:[]},
  });
  assert.deepEqual(analysis.scheme,['A','B']);
  assert.deepEqual(analysis.coverage.unresolved,['unknown']);
  assert.equal(analysis.coverage.resolved,1);
  assert.equal(analysis.uniqueWordDetails.find((row)=>row.normalized==='unknown').unresolved,true);
});
