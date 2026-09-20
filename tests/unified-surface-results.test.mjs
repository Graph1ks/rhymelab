import test from 'node:test';
import assert from 'node:assert/strict';

import {consolidateUnifiedSurfaceResults} from '../src/unified-surface-results.mjs';

test('Core word surface absorbs same-name Entity identities and keeps Core pronunciation',()=>{
  const word={
    resultKind:'word',
    language:'en',
    resultId:'rain',
    word:'Rain',
    surface:'Rain',
    normalized:'rain',
    ipa:'reɪn',
    channelRank:4,
    generatedPronunciation:false,
  };
  const singer={
    resultKind:'entity',
    language:'en',
    resultId:'entity:en:Q1:1:1',
    word:'Rain',
    surface:'Rain',
    normalized:'rain',
    ipa:'reɪn',
    locale:'en-US',
    channelRank:2,
    entityQid:'Q1',
    primaryCategory:'person.singer',
    entityCategories:[{category:'person.singer'}],
    pronunciationGenerated:false,
  };
  const game={
    resultKind:'entity',
    language:'en',
    resultId:'entity:en:Q2:2:2',
    word:'Rain',
    surface:'Rain',
    normalized:'rain',
    ipa:'reɪn',
    locale:'en-US',
    channelRank:5,
    entityQid:'Q2',
    primaryCategory:'work.video_game',
    entityCategories:[{category:'work.video_game'}],
    pronunciationGenerated:false,
  };

  const merged=consolidateUnifiedSurfaceResults({
    wordResults:[word],
    entityResults:[singer,game],
  });

  assert.equal(merged.wordResults.length,1);
  assert.equal(merged.entityResults.length,0);
  assert.equal(merged.wordResults[0].ipa,'reɪn');
  assert.deepEqual(merged.wordResults[0].surfaceRoles,['word','entity']);
  assert.deepEqual(merged.wordResults[0].entityQids,['Q1','Q2']);
  assert.deepEqual(
    merged.wordResults[0].entityCategories.map((row)=>row.category),
    ['person.singer','work.video_game'],
  );
  assert.equal(merged.wordResults[0].surfaceAggregation,'word_preferred_over_entity_v1');
});

test('same-name Entity identities collapse to one surface and prefer non-generated pronunciation',()=>{
  const generated={
    resultKind:'entity',
    language:'en',
    word:'Example',
    surface:'Example',
    normalized:'example',
    ipa:'generated',
    locale:'en-US',
    channelRank:1,
    entityQid:'Q1',
    primaryCategory:'work.video_game',
    entityCategories:[{category:'work.video_game'}],
    pronunciationGenerated:true,
    generatedPronunciation:true,
  };
  const core={
    resultKind:'entity',
    language:'en',
    word:'Example',
    surface:'Example',
    normalized:'example',
    ipa:'core',
    locale:'en-US',
    channelRank:2,
    entityQid:'Q2',
    primaryCategory:'person.singer',
    entityCategories:[{category:'person.singer'}],
    pronunciationGenerated:false,
  };

  const merged=consolidateUnifiedSurfaceResults({
    entityResults:[generated,core],
  });

  assert.equal(merged.entityResults.length,1);
  assert.equal(merged.entityResults[0].ipa,'core');
  assert.deepEqual(merged.entityResults[0].entityQids,['Q1','Q2']);
  assert.deepEqual(
    merged.entityResults[0].entityCategories.map((row)=>row.category),
    ['work.video_game','person.singer'],
  );
  assert.equal(merged.entityResults[0].mergedEntityCount,2);
});

test('word pronunciation variants collapse to one visible surface',()=>{
  const merged=consolidateUnifiedSurfaceResults({
    wordResults:[
      {
        resultKind:'word',language:'de',word:'allein',surface:'allein',
        normalized:'allein',ipa:'a',channelRank:1,
      },
      {
        resultKind:'word',language:'de',word:'allein',surface:'allein',
        normalized:'allein',ipa:'b',channelRank:2,generatedPronunciation:true,
      },
    ],
  });
  assert.equal(merged.wordResults.length,1);
  assert.equal(merged.wordResults[0].ipa,'a');
  assert.deepEqual(
    merged.wordResults[0].surfacePronunciations.map((row)=>row.ipa),
    ['a','b'],
  );
});
